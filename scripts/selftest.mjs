#!/usr/bin/env node
/**
 * The claims this demo makes about itself, checked.
 *
 * The central claim is that a price change is not reported as done until it has
 * been seen. So the first tests are the ones where sending and seeing disagree:
 * a channel that says yes and does not change, a channel that refuses, a history
 * a browser tampered with. Only then the arithmetic, and the happy path last.
 */
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { checkHistory, buildState, publish, verify } from "../lib/channels-sim.js";
import { preview, checkRule, drift, margin, foodCents, posRound, wantedPrice, CHANNEL_ORDER } from "../lib/pricing.js";
import { menuItem, appPriceFor, MENU } from "../lib/harbour/index.js";
import stateApi from "../api/state.js";
import publishApi from "../api/publish.js";

let failed = 0;
const check = (name, cond) => {
  if (cond) console.log(`  ok   ${name}`);
  else { console.error(`  FAIL ${name}`); failed += 1; }
};

/** Run a whole approved change the way the approve page does: send, record, look. */
function run(history, confirmed, ops, mode = "bulk") {
  const results = {};
  for (const ch of CHANNEL_ORDER) {
    if (!ops[ch]?.length) continue;
    const push = { channel: ch, mode, ops: ops[ch].map(({ itemId, cents }) => ({ itemId, cents })), confirmed: [...confirmed] };
    const said = publish(buildState(history, confirmed), push);
    history.push(push);
    const saw = verify(buildState(history, confirmed), push);
    results[ch] = { said, saw };
  }
  return results;
}

const rule = (r) => checkRule(r).rule;
const brunch = rule({ scope: { category: "Brunch" }, action: { type: "add-cents", value: 50 }, fixDrift: true });

console.log("saying is not doing");
{
  const history = [];
  const p = preview(buildState(history, []), brunch);
  const r = run(history, [], p.ops);
  check("Uber says it accepted everything", r.ubereats.said.refused.length === 0 && r.ubereats.said.accepted.length === p.ops.ubereats.length);
  check("and the second look finds the plates unchanged", !r.ubereats.saw.ok
    && r.ubereats.saw.checks.filter((c) => !c.ok).every((c) => menuItem(c.itemId).modifiers));
  check("Skip refuses the toast whose name nobody confirmed", r.skip.said.refused.some((x) => x.itemId === "avocado-toast" && /not found/.test(x.reason)));
  check("and the second look agrees it did not change", r.skip.saw.checks.find((c) => c.itemId === "avocado-toast").ok === false);
  check("the channels that work are seen working", r.square.saw.ok && r.website.saw.ok && r.doordash.saw.ok);

  // Fix them the way the page offers.
  const uberMissed = r.ubereats.saw.checks.filter((c) => !c.ok).map((c) => p.ops.ubereats.find((o) => o.itemId === c.itemId));
  const again = run(history, [], { ubereats: uberMissed }, "item");
  check("re-sent one at a time, Uber's plates move", Boolean(again.ubereats?.saw.ok));
  const confirmed = ["skip:avocado-toast"];
  const skipMissed = r.skip.saw.checks.filter((c) => !c.ok).map((c) => p.ops.skip.find((o) => o.itemId === c.itemId));
  const skipAgain = run(history, confirmed, { skip: skipMissed });
  check("once a person confirms the name, Skip takes it", Boolean(skipAgain.skip?.saw.ok));

  const after = buildState(history, confirmed);
  check("every intended price is now what every channel shows",
    CHANNEL_ORDER.every((ch) => p.ops[ch].every((o) => after.listings[ch].find((l) => l.itemId === o.itemId).cents === o.cents)));
  const d = drift(after);
  check("and nothing on any channel breaks the rule any more",
    !d.some((x) => x.kind === "under-policy" || x.kind === "over-policy"));
  check("the item that was never listed is still reported missing, not invented", d.some((x) => x.kind === "not-listed" && x.itemId === "tofu-bowl"));

  console.log("\nrolling back puts back exactly what was there");
  const back = {};
  for (const ch of CHANNEL_ORDER) back[ch] = p.ops[ch].map((o) => ({ itemId: o.itemId, cents: o.from }));
  const rb = run(history, confirmed, back, "item");
  const restored = buildState(history, confirmed);
  const start = buildState([], confirmed);
  check("every channel reads as it did before the change",
    CHANNEL_ORDER.every((ch) => p.ops[ch].every((o) => restored.listings[ch].find((l) => l.itemId === o.itemId).cents === start.listings[ch].find((l) => l.itemId === o.itemId).cents)));
  check("and the rollback was itself checked", Object.values(rb).every((x) => x.saw.ok));
}

console.log("\na verify that cannot fail is theatre");
{
  const push = { channel: "doordash", mode: "bulk", ops: [{ itemId: "latte", cents: 799 }] };
  const notApplied = verify(buildState([], []), push); // looked without the push ever landing
  check("a price that never landed fails the check", !notApplied.ok && notApplied.checks[0].showsCents !== 799);
  const missing = verify(buildState([], []), { channel: "skip", mode: "bulk", ops: [{ itemId: "tofu-bowl", cents: 2000 }] });
  check("an item that is not on the channel fails the check", !missing.ok && missing.checks[0].showsCents === null);
}

console.log("\nwhat a browser sends is not trusted");
check("an unknown channel is refused", Boolean(checkHistory([{ channel: "grubhub", mode: "bulk", ops: [] }]).error));
check("an unknown item is refused", Boolean(checkHistory([{ channel: "square", mode: "bulk", ops: [{ itemId: "lobster", cents: 5000 }] }]).error));
check("a price of a cent is refused", Boolean(checkHistory([{ channel: "square", mode: "bulk", ops: [{ itemId: "latte", cents: 1 }] }]).error));
check("a fractional price is refused", Boolean(checkHistory([{ channel: "square", mode: "bulk", ops: [{ itemId: "latte", cents: 575.5 }] }]).error));
check("a history that is not a list is refused", Boolean(checkHistory({ a: 1 }).error));
check("an endless history is refused", Boolean(checkHistory(Array.from({ length: 81 }, () => ({ channel: "square", mode: "bulk", ops: [] }))).error));
check("a rule outside the limits is refused", Boolean(checkRule({ scope: { category: "Pizza" }, action: { type: "add-pct", value: 400 } }).error));
check("a rule with nothing in it is refused", Boolean(checkRule({ scope: {}, action: {}, fixDrift: false }).error));
{
  let out;
  await publishApi({ method: "POST", body: { history: [], push: { channel: "square", mode: "bulk", ops: [{ itemId: "latte", cents: 99999 }] } } },
    { setHeader() {}, status: (code) => ({ end: (b) => { out = { code, ...JSON.parse(b) }; } }) });
  check("the publish endpoint answers a bad push with 400, not a crash", out.code === 400 && Boolean(out.error));
}

console.log("\nthe preview changes nothing");
{
  const s = buildState([], []);
  const before = JSON.stringify(s);
  preview(s, brunch);
  check("state is untouched by a preview", JSON.stringify(s) === before);
}

console.log("\nthe arithmetic");
const m = menuItem("margherita");
check("app price is the till plus 15%, up to .49 or .99", appPriceFor(2100) === 2449 && appPriceFor(2650) === 3049);
check("till prices move in quarters and never round down", posRound(1851) === 1875 && posRound(1850) === 1850);
check("food cost is recipe plus the stated pantry allowance",
  Math.abs(foodCents(m) - (m.pantryCents + 0.16 * 945 + 0.22 * 190 + 0.11 * 307 + 0.004 * 3800 + 0.012 * 218)) < 1e-9);
const dd = margin(m, "doordash", 2449);
check("left after = price - food - packaging - commission", Math.abs(dd.leftCents - (2449 - foodCents(m) - 74 - 2449 * 0.25)) < 1e-9);
check("no packaging on a plate in the room", margin(m, "square", 2100).packCents === 0);
{
  const p = preview(buildState([], []), rule({ scope: { category: "Bowls" }, action: { type: "add-cents", value: 100 } }));
  check("+$1 on bowls moves the till by exactly $1", p.ops.square.every((o) => o.cents - o.from === 100));
  check("and each app to the rule for the new till price", p.ops.doordash.every((o) => o.cents === appPriceFor(menuItem(o.itemId).posCents + 100)));
  check("the website follows the till", p.ops.website.every((o) => o.cents === menuItem(o.itemId).posCents + 100));
  check("Skip's missing tofu bowl is a warning, not an invented listing", !p.ops.skip.some((o) => o.itemId === "tofu-bowl") && p.warnings.some((w) => w.itemId === "tofu-bowl"));
  check("the monthly figure is the weekly one times 52 over 12", Math.abs(p.monthlyCents - p.weeklyCents * 52 / 12) < 1e-9);
}
{
  const p = preview(buildState([], []), rule({ scope: { category: "Plates" }, action: { type: "target-food-pct", value: 30 } }));
  check("pricing to a food cost target lands at or under the target", p.ops.square.every((o) => foodCents(menuItem(o.itemId)) / o.cents <= 0.3 + 1e-9));
}

console.log("\nit is the shared Harbour & Co, unedited");
{
  const dir = new URL("../lib/harbour/", import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith(".js")).sort();
  const h = createHash("sha256");
  for (const f of files) h.update(f).update(readFileSync(new URL(f, dir)));
  check("the vendored copy matches its VERSION", h.digest("hex").slice(0, 16) === readFileSync(new URL("VERSION", dir), "utf8").trim());
  check("the Avo prices are the menu's prices", menuItem("margherita").posCents === 2100 && menuItem("latte").posCents === 575);
}

console.log("\nno model, no network, no storage on the server");
const serverSrc = ["lib/pricing.js", "lib/channels-sim.js", "lib/http.js", ...readdirSync(new URL("../api/", import.meta.url)).map((f) => `api/${f}`)]
  .map((f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8")).join("\n");
check("no network calls", !/fetch\(|anthropic/i.test(serverSrc));
check("no writes or databases", !/writeFile|node:fs|supabase|redis|@vercel\/(kv|blob|postgres)/i.test(serverSrc));
{
  let a; let b;
  const res = (set) => ({ setHeader() {}, status: () => ({ end: (x) => set(x) }) });
  await stateApi({ method: "POST", body: {} }, res((x) => { a = x; }));
  await stateApi({ method: "POST", body: {} }, res((x) => { b = x; }));
  check("the same history always gives the same state", a === b);
}

console.log("\nthe words");
const pub = readdirSync(new URL("../public/", import.meta.url)).filter((f) => f.endsWith(".html"))
  .concat(readdirSync(new URL("../public/js/", import.meta.url)).map((f) => `js/${f}`))
  .map((f) => readFileSync(new URL(`../public/${f}`, import.meta.url), "utf8")).join("\n");
check("no em dashes anywhere a visitor reads", ![pub, serverSrc].some((s) => s.includes("—")));
check("the pages say the channels are simulated", /simulated/i.test(pub));
check("and that Harbour & Co is fictional", /fictional/i.test(pub));
check("and never call what is left profit", /Not profit/.test(pub));

console.log(failed ? `\n${failed} failure(s)` : "\nall passed");
process.exit(failed ? 1 : 0);
