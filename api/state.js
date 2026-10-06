/**
 * POST /api/state: every channel's menu as it stands, where it breaks the policy,
 * and what each item is left with on each channel. Rebuilt from the history the
 * browser sends; nothing is stored here.
 */
import { endpoint } from "../lib/http.js";
import { checkHistory, buildState } from "../lib/channels-sim.js";
import { drift, margins, wantedPrice, CHANNEL_ORDER } from "../lib/pricing.js";
import { MENU, CHANNELS, POLICY, CATEGORIES, GROUP } from "../lib/harbour/index.js";

export default endpoint((body) => {
  const h = checkHistory(body.history, body.confirmed);
  if (h.error) return h;
  const state = buildState(h.history, h.confirmed);
  const d = drift(state);
  const pos = (id) => state.listings.square.find((l) => l.itemId === id).cents;
  const matrix = MENU.map((m) => ({
    itemId: m.id, name: m.name, category: m.category,
    cells: Object.fromEntries(CHANNEL_ORDER.map((c) => {
      const l = state.listings[c].find((x) => x.itemId === m.id);
      if (!l) return [c, null];
      return [c, { cents: l.cents, wantCents: wantedPrice(c, pos(m.id)), name: l.name, mapping: l.mapping }];
    })),
  }));
  return {
    group: GROUP.name,
    channels: CHANNEL_ORDER.map((id) => CHANNELS.find((c) => c.id === id)),
    categories: CATEGORIES,
    policy: POLICY,
    matrix,
    drift: d,
    margins: margins(state),
    totals: {
      items: MENU.length,
      listings: CHANNEL_ORDER.reduce((a, c) => a + state.listings[c].length, 0),
      offPolicy: d.filter((x) => x.kind === "under-policy" || x.kind === "over-policy").length,
      underWeeklyCents: d.reduce((a, x) => a + (x.weeklyCents ?? 0), 0),
      unconfirmed: d.filter((x) => x.kind === "unconfirmed-name").length,
      notListed: d.filter((x) => x.kind === "not-listed").length,
    },
  };
});
