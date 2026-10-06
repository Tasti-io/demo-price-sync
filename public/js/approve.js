/**
 * Step 4. A person approves; then each channel is sent its part, and each one is
 * looked at again afterwards, separately from what it said.
 *
 * Two things in this page are the reason the demo exists. Uber Eats answers "done"
 * and leaves three prices where they were, which only the second look catches.
 * Skip refuses an item it cannot match, which is fixed by a person confirming a
 * name, not by the tool guessing one. Both end with a check, a time, and a plain
 * account of what is and is not live.
 */
import { store, save, api, frame, fail, pending, newId, $, esc, money, signed, clock, LABEL, ORDER } from "./common.js";

frame({
  title: "Approve and send",
  sub: "The owner sees the exact change, approves it, and watches each channel get its part. After every send the channel is read again, independently, and each price is compared with what was meant. Nothing is reported as done until it has been seen.",
});

const wanted = new URLSearchParams(location.search).get("id");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let busy = false;

function current() {
  if (wanted) return store.changes.find((c) => c.id === wanted) ?? null;
  return pending() ?? [...store.changes].reverse().find((c) => ["done", "partly", "running"].includes(c.status)) ?? null;
}

/** The latest check for every item on a channel, across all attempts. */
function finalChecks(change, ch) {
  const seen = new Map();
  for (const a of change.runs[ch]?.attempts ?? []) for (const k of a.saw?.checks ?? []) seen.set(k.itemId, k);
  return [...seen.values()];
}
const channelOk = (change, ch) => {
  const checks = finalChecks(change, ch);
  return checks.length === change.ops[ch].length && checks.every((k) => k.ok);
};
const channels = (change) => ORDER.filter((c) => change.ops[c]?.length);

function settle(change) {
  if (change.status === "pending" || change.status === "rejected") return;
  const started = channels(change).filter((c) => change.runs[c]?.attempts?.length);
  if (started.length < channels(change).length) return;
  change.status = channels(change).every((c) => channelOk(change, c)) ? "done" : "partly";
  change.finishedAt = new Date().toISOString();
}

async function send(change, ch, mode, ops) {
  const push = { channel: ch, mode, ops: ops.map(({ itemId, cents }) => ({ itemId, cents })), confirmed: [...store.confirmed], changeId: change.id };
  const said = await api("/api/publish", { push });
  store.history.push(push);
  save();
  draw(change, ch);
  await sleep(450); // a real channel takes longer; the pause is only so a person can follow it
  const saw = await api("/api/verify");
  change.runs[ch] ??= { attempts: [] };
  change.runs[ch].attempts.push({ mode, said, saw });
  settle(change);
  save();
}

async function approve(change) {
  if (busy) return;
  busy = true;
  change.status = "running";
  change.approvedAt = new Date().toISOString();
  save();
  try {
    for (const ch of channels(change)) {
      draw(change, ch);
      await send(change, ch, "bulk", change.ops[ch]);
      draw(change);
      await sleep(250);
    }
  } catch (err) {
    fail(err);
  } finally {
    busy = false;
    draw(change);
  }
}

async function retry(change, ch, mode) {
  if (busy) return;
  busy = true;
  try {
    const failed = finalChecks(change, ch).filter((k) => !k.ok).map((k) => change.ops[ch].find((o) => o.itemId === k.itemId));
    await send(change, ch, mode, failed);
  } catch (err) {
    fail(err);
  } finally {
    busy = false;
    draw(change);
  }
}

function rollback(change) {
  for (const c of store.changes) if (c.status === "pending") c.status = "replaced";
  const ops = {};
  for (const ch of channels(change)) ops[ch] = change.ops[ch].map((o) => ({ itemId: o.itemId, cents: o.from, from: o.cents }));
  const rows = change.rows.map((r) => ({
    ...r,
    channels: Object.fromEntries(Object.entries(r.channels).map(([c, x]) => [c, { ...x, from: x.to, to: x.from, leftPctAfter: null }])),
  }));
  store.changes.push({
    id: newId(), createdAt: new Date().toISOString(), summary: `undo of ${change.id}: ${change.summary}`,
    rule: change.rule, ops, rows, warnings: [], weeklyCents: -change.weeklyCents, status: "pending", runs: {}, rollbackOf: change.id,
  });
  change.rolledBack = true;
  save();
  location.href = "/approve";
}

function stepFor(change, ch, active) {
  const attempts = change.runs[ch]?.attempts ?? [];
  const n = change.ops[ch].length;
  if (!attempts.length) {
    return `<li><div class="row"><span class="ch">${esc(LABEL[ch])}</span><span class="kind">${active ? "sending" : "waiting"}</span></div>
      <div class="step">${n} price${n === 1 ? "" : "s"} to send.</div></li>`;
  }
  const ok = channelOk(change, ch);
  const checks = finalChecks(change, ch);
  const missed = checks.filter((k) => !k.ok);
  const lines = attempts.map((a, i) => {
    const said = a.said.refused.length
      ? `<b>${esc(LABEL[ch])} said:</b> accepted ${a.said.accepted.length}, refused ${a.said.refused.length}<span class="t">${clock(a.said.at)}</span>`
      : `<b>${esc(LABEL[ch])} said:</b> accepted all ${a.said.accepted.length}<span class="t">${clock(a.said.at)}</span>`;
    const saw = a.saw.ok
      ? `<b>We looked:</b> all ${a.saw.checks.length} showing the new price<span class="t">${clock(a.saw.at)}</span>`
      : `<b>We looked:</b> ${a.saw.checks.filter((k) => k.ok).length} of ${a.saw.checks.length} showing the new price<span class="t">${clock(a.saw.at)}</span>`;
    return `<div class="step">${i ? `Attempt ${i + 1}, ${a.mode === "item" ? "one item at a time" : "resent"}. ` : ""}${said}. ${saw}.</div>`;
  }).join("");

  const lastSaid = attempts.at(-1).said;
  const saidYesDidNot = !ok && lastSaid.refused.length === 0;
  const refusedNames = lastSaid.refused.filter((r) => r.reason.startsWith("item not found"));
  const verdict = ok ? `<span class="kind ok">live, checked</span>`
    : saidYesDidNot ? `<span class="kind bad">said yes, did not change</span>`
    : `<span class="kind bad">refused</span>`;

  let fix = "";
  if (!ok && !busy && change.status !== "pending") {
    const rows = missed.map((k) => `${esc(k.name)}: meant ${money(k.wantCents)}, shows ${k.showsCents == null ? "nothing" : money(k.showsCents)}`).join("<br>");
    const confirmButtons = refusedNames.map((r) => {
      const k = `${ch}:${r.itemId}`;
      const done = store.confirmed.includes(k);
      const name = (r.reason.match(/"([^"]+)"/) ?? [])[1] ?? "this listing";
      const item = checks.find((x) => x.itemId === r.itemId)?.name ?? r.itemId;
      return done ? `<span class="kind ok">"${esc(name)}" confirmed as ${esc(item)}</span>`
        : `<button class="btn ghost small" data-confirm="${esc(k)}">Confirm "${esc(name)}" is ${esc(item)}</button>`;
    }).join("");
    fix = `<div class="misses">${rows}</div><div class="fix">
      ${saidYesDidNot && ch === "ubereats" ? `<span>The bulk call reported success. The re-read says otherwise.</span><button class="btn primary small" data-retry="${ch}" data-mode="item">Re-send these one item at a time</button>` : ""}
      ${refusedNames.length ? `<span>Refused because the name is not matched to anything on our side. A person confirms it once; the tool never guesses.</span>${confirmButtons}<button class="btn primary small" data-retry="${ch}" data-mode="bulk">Retry ${esc(LABEL[ch])}</button>` : ""}
      ${!saidYesDidNot && !refusedNames.length ? `<button class="btn primary small" data-retry="${ch}" data-mode="bulk">Retry</button>` : ""}
    </div>`;
  }
  return `<li><div class="row"><span class="ch">${esc(LABEL[ch])}</span>${verdict}</div>${lines}${fix}</li>`;
}

function draw(change, active = null) {
  if (!pending()) document.querySelector("nav.steps .badge")?.remove();
  if (!change) {
    $("main").innerHTML = `<div class="card"><div class="empty">Nothing is waiting for approval.<br><a class="btn primary" href="/change" style="margin-top:12px">Make a change</a></div></div>`;
    return;
  }
  const ch = channels(change);
  const total = ch.reduce((a, c) => a + change.ops[c].length, 0);
  const isPending = change.status === "pending";
  const cell = (row, c) => {
    const x = row.channels[c];
    if (!x) return `<td class="num muted">not listed</td>`;
    if (!x.moves) return `<td class="num muted">${money(x.from)}</td>`;
    return `<td class="num"><span class="strike">${money(x.from)}</span><b>${money(x.to)}</b></td>`;
  };
  const okCount = ch.filter((c) => channelOk(change, c)).length;
  const headline = change.status === "done"
    ? `<div class="okbar">All ${ch.length} channels checked and showing the new prices. Finished ${clock(change.finishedAt)}.</div>`
    : change.status === "partly"
      ? `<div class="notice"><b>${okCount} of ${ch.length} channels are live and checked.</b> The rest are listed below with what they show and what to do about it. Nothing is reported as done that has not been seen.</div>`
      : "";

  $("main").innerHTML = `
    <div class="card">
      <div class="card-head"><h2>${esc(change.summary.charAt(0).toUpperCase() + change.summary.slice(1))}</h2><span class="stamp">${esc(change.id)} &middot; ${isPending ? "waiting for the owner" : esc(change.status)}</span></div>
      <div class="card-body">
        <p class="lede">${total} price${total === 1 ? "" : "s"} on ${ch.length} channel${ch.length === 1 ? "" : "s"}.
          ${change.weeklyCents ? `If the same serves sell each week, <b>${signed(change.weeklyCents)} a week</b> before tax.` : ""}
          ${change.rollbackOf ? `This puts back the prices from ${esc(change.rollbackOf)}.` : ""}</p>
        ${(change.warnings ?? []).map((w) => `<div class="notice">${esc(w.text)}</div>`).join("")}
        ${headline}
      </div>
      <div class="tablewrap"><table>
        <thead><tr><th>Item</th>${ORDER.map((c) => `<th class="num">${esc(LABEL[c])}</th>`).join("")}</tr></thead>
        <tbody>${change.rows.map((r) => `<tr><td>${esc(r.name)}</td>${ORDER.map((c) => cell(r, c)).join("")}</tr>`).join("")}</tbody>
      </table></div>
      ${isPending ? `<div class="card-body" style="border-top:1px solid var(--rule)"><div class="actions">
        <button class="btn primary" id="approve">Approve and send</button>
        <button class="btn ghost" id="reject">Reject</button>
        <span class="lede">Approving as the owner.</span></div></div>` : ""}
    </div>
    ${isPending ? "" : `
    <div class="card">
      <div class="card-head"><h2>Channel by channel</h2><span class="stamp">said, then seen</span></div>
      <ul class="run">${ch.map((c) => stepFor(change, c, c === active)).join("")}</ul>
      ${["done", "partly"].includes(change.status) && !change.rolledBack && !change.rollbackOf ? `<div class="card-body" style="border-top:1px solid var(--rule)"><div class="actions">
        <button class="btn ghost" id="undo">Roll this back</button><a class="btn ghost" href="/margins">See what each sale leaves now</a><a class="btn ghost" href="/log">Open the log</a></div></div>` : ""}
    </div>`}
    <p class="note"><b>What is simulated.</b> The five channels are simulated in this demo, rebuilt for you alone from what this browser has
      sent. The Uber Eats and Skip failures are illustrations of how a menu handoff fails, not a description of either app's real
      behaviour. What is real is the order of things: approve, send, look again separately, and say only what was seen.</p>`;

  $("approve")?.addEventListener("click", () => approve(change));
  $("reject")?.addEventListener("click", () => { change.status = "rejected"; save(); location.href = "/log"; });
  $("undo")?.addEventListener("click", () => rollback(change));
  for (const b of document.querySelectorAll("[data-confirm]")) {
    b.addEventListener("click", () => { if (!store.confirmed.includes(b.dataset.confirm)) store.confirmed.push(b.dataset.confirm); save(); draw(change); });
  }
  for (const b of document.querySelectorAll("[data-retry]")) b.addEventListener("click", () => retry(change, b.dataset.retry, b.dataset.mode));
}

try { draw(current()); } catch (err) { fail(err); }
