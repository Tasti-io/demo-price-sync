/**
 * Step 3. Say the change once; see exactly what it does everywhere before anyone
 * approves it.
 *
 * The person proposing writes a rule ("+$1 on bowls", "plates to 30% food cost").
 * The server turns it into concrete prices per channel, applying Harbour's app
 * rule and its rounding, and says in advance which of them will be refused. Nothing
 * is sent anywhere from this page.
 */
import { store, save, api, frame, fail, pending, newId, $, esc, money, signed, pct, LABEL, ORDER } from "./common.js";

frame({
  title: "Make a change",
  sub: "Write the change the way you would say it. The preview shows every price it moves on every channel, what each sale leaves afterwards, and what it is worth a week if volume holds. Nothing leaves this page until someone approves it.",
});

const PRESETS = [
  { label: "Brunch +50c and fix every app", rule: { scope: { category: "Brunch" }, action: { type: "add-cents", value: 50 }, fixDrift: true } },
  { label: "+$1 on all bowls", rule: { scope: { category: "Bowls" }, action: { type: "add-cents", value: 100 }, fixDrift: false } },
  { label: "+4% on pizza", rule: { scope: { category: "Pizza" }, action: { type: "add-pct", value: 4 }, fixDrift: false } },
  { label: "Plates to 30% food cost", rule: { scope: { category: "Plates" }, action: { type: "target-food-pct", value: 30 }, fixDrift: true } },
  { label: "Only fix the drift", rule: { scope: {}, action: {}, fixDrift: true } },
];

const fixFromLink = new URLSearchParams(location.search).get("fix") === "1";
let rule = fixFromLink ? PRESETS.at(-1).rule : PRESETS[0].rule;
let last = null;

const CATS = ["Pizza", "Plates", "Bowls", "Brunch", "Bakery", "Coffee"];

function form() {
  const s = rule.scope.category ?? "";
  const t = rule.action.type ?? "add-cents";
  const v = rule.action.value ?? (t === "add-cents" ? 100 : t === "add-pct" ? 4 : 30);
  const shown = t === "add-cents" ? v / 100 : v;
  return `
    <div class="card">
      <div class="card-head"><h2>The change</h2><span class="stamp">proposed by the ops manager</span></div>
      <div class="card-body">
        <div class="chips" style="margin-bottom:16px">${PRESETS.map((p, i) => `<button class="chip" data-preset="${i}">${esc(p.label)}</button>`).join("")}</div>
        <div class="form">
          <div class="field"><label for="cat">Which items</label>
            <select id="cat"><option value="">None, only fix the drift</option>${CATS.map((c) => `<option ${c === s ? "selected" : ""}>${c}</option>`).join("")}</select></div>
          <div class="field"><label for="type">How</label>
            <select id="type" ${s ? "" : "disabled"}>
              <option value="add-cents" ${t === "add-cents" ? "selected" : ""}>Add dollars to the till price</option>
              <option value="add-pct" ${t === "add-pct" ? "selected" : ""}>Add a percentage</option>
              <option value="target-food-pct" ${t === "target-food-pct" ? "selected" : ""}>Price to a food cost target</option>
            </select></div>
          <div class="field"><label for="val">${t === "add-cents" ? "Dollars, e.g. 1 or -0.50" : t === "add-pct" ? "Percent, e.g. 4" : "Food cost %, e.g. 30"}</label>
            <input type="number" id="val" step="${t === "add-cents" ? "0.25" : "1"}" value="${shown}" ${s ? "" : "disabled"}></div>
        </div>
        <label class="check" style="margin-top:14px"><input type="checkbox" id="fix" ${rule.fixDrift ? "checked" : ""}>
          <span>Also bring every app and website price that breaks the rule back in line, including items outside this change.</span></label>
      </div>
    </div>
    <div id="preview"></div>`;
}

function readForm() {
  const category = $("cat").value || null;
  const type = $("type").value;
  const raw = Number($("val").value);
  const value = type === "add-cents" ? Math.round(raw * 100) : raw;
  rule = { scope: category ? { category } : {}, action: category ? { type, value } : {}, fixDrift: $("fix").checked };
}

let timer;
function wire() {
  for (const b of document.querySelectorAll("[data-preset]")) b.addEventListener("click", () => { rule = PRESETS[Number(b.dataset.preset)].rule; draw(); });
  for (const id of ["cat", "type", "fix"]) $(id).addEventListener("change", () => { readForm(); draw(); });
  $("val").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => { readForm(); show(); }, 250); });
}

function draw() {
  $("main").innerHTML = form();
  wire();
  show();
}

async function show() {
  const box = $("preview");
  let p;
  try {
    p = await api("/api/preview", { rule });
  } catch (err) {
    box.innerHTML = `<div class="card"><div class="empty">${esc(err.message)}</div></div>`;
    last = null;
    return;
  }
  last = p;
  const total = Object.values(p.counts).reduce((a, b) => a + b, 0);
  if (!total) {
    box.innerHTML = `<div class="card"><div class="empty">That changes nothing anywhere. Every price it touches is already there.</div></div>`;
    return;
  }

  const cell = (row, c) => {
    const x = row.channels[c];
    if (!x) return `<td class="num muted">not listed</td>`;
    if (!x.moves) return `<td class="num muted">${money(x.from)}</td>`;
    const left = x.leftPctAfter != null ? `<span class="sub-note">leaves ${pct(x.leftPctAfter)}</span>` : "";
    return `<td class="num"><span class="strike">${money(x.from)}</span><b>${money(x.to)}</b>${left}</td>`;
  };

  const waiting = pending();
  box.innerHTML = `
    <div class="card">
      <div class="card-head"><h2>What it does</h2><span class="stamp">${total} price${total === 1 ? "" : "s"} on ${ORDER.filter((c) => p.counts[c]).length} channels</span></div>
      <div class="card-body">
        <p class="lede"><b>${esc(p.summary.charAt(0).toUpperCase() + p.summary.slice(1))}.</b>
          If the same serves sell each week, that is <b class="${p.weeklyCents >= 0 ? "good" : "warn"}">${signed(p.weeklyCents)} a week</b> before tax,
          ${signed(p.monthlyCents)} a month. That is arithmetic on the stated volumes, not a forecast: a price change moves volume too.</p>
        ${p.warnings.map((w) => `<div class="notice">${esc(w.text)}</div>`).join("")}
      </div>
      <div class="tablewrap"><table>
        <thead><tr><th>Item</th>${ORDER.map((c) => `<th class="num">${esc(LABEL[c])}</th>`).join("")}</tr></thead>
        <tbody>${p.rows.map((r) => `<tr><td>${esc(r.name)}<span class="sub-note">${esc(r.category)}</span></td>${ORDER.map((c) => cell(r, c)).join("")}</tr>`).join("")}</tbody>
      </table></div>
      <div class="card-body" style="border-top:1px solid var(--rule)">
        ${waiting ? `<p class="lede" style="margin-bottom:10px">A change is already waiting for approval: <b>${esc(waiting.summary)}</b>. Sending this one replaces it.</p>` : ""}
        <div class="actions"><button class="btn primary" id="send">Send for approval</button><span class="lede">The owner sees exactly this table before anything is sent to a channel.</span></div>
      </div>
    </div>`;
  $("send").addEventListener("click", send);
}

function send() {
  if (!last) return;
  for (const c of store.changes) if (c.status === "pending") c.status = "replaced";
  store.changes.push({
    id: newId(),
    createdAt: new Date().toISOString(),
    summary: last.summary,
    rule: last.rule,
    ops: last.ops,
    rows: last.rows,
    warnings: last.warnings,
    weeklyCents: last.weeklyCents,
    status: "pending",
    runs: {},
  });
  save();
  location.href = "/approve";
}

draw();
