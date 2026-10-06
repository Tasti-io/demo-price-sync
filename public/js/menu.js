/**
 * Step 1. Every item, every channel, against Harbour's own rule.
 *
 * The page a group never has: one grid with the till, the website and three apps
 * side by side, and every cell that breaks the rule marked. Then the queue of
 * names on the apps that nobody has confirmed are the same item, because a price
 * change sent to an unconfirmed name is a price change that will not land.
 */
import { store, save, api, frame, fail, $, esc, money, LABEL, ORDER } from "./common.js";

frame({
  title: "One menu, five places",
  sub: "Harbour &amp; Co sells the same nineteen items at the till, on its website and on three delivery apps. The rule is simple: apps sit 15% above the till, rounded up to .49 or .99. This is every price on every channel, checked against that rule.",
});

const KIND = {
  "under-policy": ["under the rule", true],
  "over-policy": ["over the rule", true],
  "not-listed": ["missing", true],
  "unconfirmed-name": ["name not confirmed", true],
};

async function render() {
  const s = await api("/api/state");
  const t = s.totals;
  const policyLine = (d) => d.kind === "under-policy" || d.kind === "over-policy"
    ? `<b>${esc(LABEL[d.channel])}</b> shows ${esc(d.shownAs)} at <b>${money(d.haveCents)}</b>; the rule says ${money(d.wantCents)}${d.weeklyCents ? `, <span class="warn">${money(d.weeklyCents)} a week short</span> if volume holds` : ""}.`
    : d.kind === "not-listed"
      ? `<b>${esc(d.name)}</b> is sold in the room and on the other apps, but not listed on <b>${esc(LABEL[d.channel])}</b>.`
      : `<b>${esc(LABEL[d.channel])}</b> lists "${esc(d.shownAs)}". Nobody has confirmed it is ${esc(d.name)}.`;

  const priced = s.drift.filter((d) => d.kind !== "unconfirmed-name");
  const names = s.drift.filter((d) => d.kind === "unconfirmed-name");

  const cats = s.categories.map((cat) => {
    const rows = s.matrix.filter((m) => m.category === cat).map((m) => `
      <tr>
        <td>${esc(m.name)}</td>
        ${ORDER.map((c) => {
          const cell = m.cells[c];
          if (!cell) return `<td class="num muted">${c === "skip" || c === "doordash" || c === "ubereats" ? "not listed" : ""}</td>`;
          const off = cell.cents !== cell.wantCents;
          const unconf = cell.mapping !== "confirmed";
          return `<td class="num ${off ? "cell-off" : ""}">${money(cell.cents)}${off ? `<span class="sub-note">rule ${money(cell.wantCents)}</span>` : ""}${unconf ? `<span class="sub-note warn">as "${esc(cell.name)}"</span>` : ""}</td>`;
        }).join("")}
      </tr>`).join("");
    return `<tr class="cat"><td colspan="6">${esc(cat)}</td></tr>${rows}`;
  }).join("");

  $("main").innerHTML = `
    <div class="card">
      <div class="tiles">
        <div class="tile"><span>Prices listed</span><b>${t.listings}</b><small>${t.items} items, 5 channels</small></div>
        <div class="tile"><span>Off the rule</span><b class="${t.offPolicy ? "warn" : ""}">${t.offPolicy}</b><small>${t.notListed} more not listed at all</small></div>
        <div class="tile"><span>Short on the apps</span><b class="${t.underWeeklyCents ? "warn" : ""}">${money(t.underWeeklyCents)}</b><small>a week, if volume holds</small></div>
        <div class="tile"><span>Names to confirm</span><b class="${t.unconfirmed ? "warn" : ""}">${t.unconfirmed}</b><small>changes to them will be refused</small></div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h2>Where a channel breaks the rule</h2>
        ${priced.length ? `<a class="btn primary small" href="/change?fix=1">Fix these in one change</a>` : ""}</div>
      ${priced.length
        ? `<ul class="list">${priced.map((d) => `<li><span>${policyLine(d)}</span><span class="kind bad">${esc(KIND[d.kind][0])}</span></li>`).join("")}</ul>`
        : `<div class="okbar" style="margin:14px 20px">Every price on every channel follows the rule.</div>`}
    </div>

    <div class="card">
      <div class="card-head"><h2>Names waiting for a person</h2><span class="stamp">matched once, then never guessed again</span></div>
      <div class="card-body"><p class="lede">
        Apps rename things. On a real account a model proposes which app listing is which item, once, at setup, and a
        person confirms each proposal. After that the match is a lookup, so it cannot drift between runs. Here the
        proposals are prepared.</p></div>
      ${names.length
        ? `<ul class="list">${names.map((d) => `<li><span>${policyLine(d)}</span><button class="btn ghost small" data-confirm="${esc(d.channel)}:${esc(d.itemId)}">Yes, that is ${esc(d.name)}</button></li>`).join("")}</ul>`
        : `<div class="okbar" style="margin:0 20px 16px">Every name on every channel is confirmed.</div>`}
    </div>

    <div class="card">
      <div class="card-head"><h2>Every price, every channel</h2><span class="stamp">marked where it breaks the rule</span></div>
      <div class="tablewrap"><table>
        <thead><tr><th>Item</th>${ORDER.map((c) => `<th class="num">${esc(LABEL[c])}</th>`).join("")}</tr></thead>
        <tbody>${cats}</tbody>
      </table></div>
    </div>
    <p class="note"><b>About these numbers.</b> Harbour &amp; Co is a fictional group and these are its invented prices, the same business
      as in the other Tasti demos. "If volume holds" means the serves a week stated in its menu data, split by channel; it is
      arithmetic on that assumption, not a measurement of anyone.</p>`;

  for (const b of document.querySelectorAll("[data-confirm]")) {
    b.addEventListener("click", () => {
      if (!store.confirmed.includes(b.dataset.confirm)) store.confirmed.push(b.dataset.confirm);
      save();
      render().catch(fail);
    });
  }
}

render().catch(fail);
