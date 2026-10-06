/**
 * Step 5. Every change, who moved it along, and what each channel showed when it
 * was checked. The record an owner needs when a regular says the price on the app
 * was different last Tuesday.
 */
import { store, frame, $, esc, when, clock, signed, LABEL, ORDER } from "./common.js";

frame({
  title: "The log",
  sub: "Every change proposed in this browser, what happened to it, and when each channel was last seen showing what it should. Open any of them to see the run, retry what failed, or roll it back.",
});

const STATUS = {
  pending: ["waiting for the owner", ""],
  running: ["sending", ""],
  done: ["live everywhere, checked", "ok"],
  partly: ["partly live", "bad"],
  rejected: ["rejected", ""],
  replaced: ["replaced before approval", ""],
};

function lastSeen(change, ch) {
  const attempts = change.runs?.[ch]?.attempts ?? [];
  if (!attempts.length) return null;
  const seen = new Map();
  for (const a of attempts) for (const k of a.saw.checks) seen.set(k.itemId, k);
  const checks = [...seen.values()];
  return { ok: checks.length === change.ops[ch].length && checks.every((k) => k.ok), at: attempts.at(-1).saw.at, tries: attempts.length };
}

function render() {
  const changes = [...store.changes].reverse();
  if (!changes.length) {
    $("main").innerHTML = `<div class="card"><div class="empty">Nothing yet. Changes appear here from the moment they are proposed.<br>
      <a class="btn primary" href="/change" style="margin-top:12px">Make a change</a></div></div>`;
    return;
  }
  $("main").innerHTML = changes.map((c) => {
    const [label, cls] = STATUS[c.status] ?? [c.status, ""];
    const chs = ORDER.filter((x) => c.ops?.[x]?.length);
    const rows = chs.map((ch) => {
      const s = lastSeen(c, ch);
      return `<li><span><b>${esc(LABEL[ch])}</b>, ${c.ops[ch].length} price${c.ops[ch].length === 1 ? "" : "s"}${s ? `, ${s.tries} attempt${s.tries === 1 ? "" : "s"}` : ""}</span>
        <span>${s ? `<span class="kind ${s.ok ? "ok" : "bad"}">${s.ok ? "seen live" : "not live"} ${clock(s.at)}</span>` : `<span class="kind">not sent</span>`}</span></li>`;
    }).join("");
    return `
      <div class="card">
        <div class="card-head">
          <h2>${esc(c.summary.charAt(0).toUpperCase() + c.summary.slice(1))}</h2>
          <span class="stamp">${esc(c.id)} &middot; proposed ${when(c.createdAt)}${c.approvedAt ? ` &middot; approved ${when(c.approvedAt)}` : ""}</span>
        </div>
        <div class="card-body" style="padding-bottom:6px"><div class="actions">
          <span class="kind ${cls}">${esc(label)}</span>
          ${c.weeklyCents ? `<span class="lede">${signed(c.weeklyCents)} a week if volume holds</span>` : ""}
          ${c.rollbackOf ? `<span class="lede">undoes ${esc(c.rollbackOf)}</span>` : ""}
          ${c.rolledBack ? `<span class="lede">rolled back later</span>` : ""}
          ${["pending", "running", "done", "partly"].includes(c.status) ? `<a class="btn ghost small" href="/approve?id=${esc(c.id)}">Open</a>` : ""}
        </div></div>
        ${rows ? `<ul class="list">${rows}</ul>` : ""}
      </div>`;
  }).join("") + `<p class="note">${store.history.length} push${store.history.length === 1 ? "" : "es"} recorded in this browser. The channels you see on
    every page are rebuilt from them. Reset the demo from the footer to start again.</p>`;
}

render();
