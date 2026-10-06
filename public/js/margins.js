/**
 * Step 2. What one sale of each item leaves behind, on each channel.
 *
 * The till price is the number everyone knows. The number that decides whether an
 * app is worth being on is what a sale leaves after the food, the packaging and the
 * channel's cut, and it is different on every channel for the same burger.
 */
import { api, frame, fail, $, esc, money, pct, LABEL } from "./common.js";

frame({
  title: "What each sale leaves",
  sub: "The same item leaves a different amount on every channel. This is the price, minus the food, minus the packaging when it leaves the building, minus the card fees or the app's commission. Not profit: labour and rent still come out of it.",
});

const SELL = ["square", "doordash", "ubereats", "skip"];
let selected = null;

async function render() {
  const s = await api("/api/state");
  const rows = s.margins;
  if (!selected) {
    // Open on the item that leaves the least on any app: the one worth a look first.
    selected = rows.map((r) => [r.itemId, Math.min(...SELL.filter((c) => c !== "square" && r.cells[c]).map((c) => r.cells[c].leftPct))])
      .sort((a, b) => a[1] - b[1])[0][0];
  }
  const sel = rows.find((r) => r.itemId === selected);
  const cats = [...new Set(rows.map((r) => r.category))];

  const cell = (c) => c
    ? `<td class="num ${c.leftPct < 0.45 ? "warn" : ""}">${money(c.leftCents)}<span class="sub-note">${pct(c.leftPct)} of ${money(c.priceCents)}</span></td>`
    : `<td class="num muted">not listed</td>`;

  const table = cats.map((cat) => `<tr class="cat"><td colspan="5">${esc(cat)}</td></tr>` + rows.filter((r) => r.category === cat).map((r) => `
      <tr data-item="${esc(r.itemId)}" style="cursor:pointer" ${r.itemId === selected ? 'class="cell-sel"' : ""}>
        <td>${esc(r.name)}${r.itemId === selected ? ' <span class="kind ok">shown below</span>' : ""}<span class="sub-note">food ${money(r.foodCents)}</span></td>
        ${SELL.map((c) => cell(r.cells[c])).join("")}
      </tr>`).join("")).join("");

  const parts = SELL.filter((c) => sel.cells[c]).map((c) => {
    const x = sel.cells[c];
    const w = (v) => `${Math.max(0, (v / x.priceCents) * 100).toFixed(2)}%`;
    return `
      <div style="margin-top:14px">
        <div style="display:flex;justify-content:space-between;font-size:13.5px"><b style="font-weight:500">${esc(LABEL[c])} at ${money(x.priceCents)}</b><span>${money(x.leftCents)} left, <b style="font-weight:500">${pct(x.leftPct)}</b></span></div>
        <div style="display:flex;height:12px;border-radius:4px;overflow:hidden;margin-top:6px;background:#EFEDE7" aria-hidden="true">
          <span style="width:${w(x.foodCents)};background:#B9B2A6" title="food"></span>
          <span style="width:${w(x.packCents)};background:#D8D2C6" title="packaging"></span>
          <span style="width:${w(x.feeCents)};background:#E4A27E" title="fees"></span>
          <span style="width:${w(x.leftCents)};background:var(--teal)" title="left"></span>
        </div>
        <div class="sub-note" style="white-space:normal">food ${money(x.foodCents)} &middot; packaging ${money(x.packCents)} &middot; ${c === "square" ? "card fees" : "commission"} ${money(x.feeCents)} &middot; left ${money(x.leftCents)}</div>
      </div>`;
  }).join("");

  $("main").innerHTML = `
    <div class="card">
      <div class="card-head"><h2>${esc(sel.name)}, one sale on each channel</h2><span class="stamp">pick any row below</span></div>
      <div class="card-body">
        <p class="lede">Grey is the food, the lighter grey is packaging, orange is the channel's cut, teal is what is left. Same dish,
          same kitchen, ${SELL.filter((c) => sel.cells[c]).length} different answers.</p>
        ${parts}
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h2>Every item, left after food, packaging and the channel</h2><span class="stamp">under 45% marked</span></div>
      <div class="tablewrap"><table>
        <thead><tr><th>Item</th>${SELL.map((c) => `<th class="num">${esc(LABEL[c])}</th>`).join("")}</tr></thead>
        <tbody>${table}</tbody>
      </table></div>
    </div>
    <p class="note"><b>Where these come from.</b> Food cost is each item's recipe at the ingredient prices Harbour &amp; Co last paid
      (the same prices the invoice reader shows on its sample invoice), plus a stated allowance for what is too small to list.
      Commission is the rate in its agreements as stated for this demo. All fictional, all arithmetic you can redo.
      <a href="/change" style="color:var(--teal)">Change a price</a> and this page moves with it.</p>`;

  for (const tr of document.querySelectorAll("[data-item]")) {
    tr.addEventListener("click", () => { selected = tr.dataset.item; render().then(() => window.scrollTo({ top: 0, behavior: "smooth" })).catch(fail); });
  }
}

render().catch(fail);
