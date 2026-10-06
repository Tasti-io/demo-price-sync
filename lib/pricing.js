/**
 * Prices, margins and the shape of a change. All arithmetic, no model.
 *
 * Three questions, each answered by plain code over the Harbour & Co dataset:
 *
 *   What is each item actually left with on each channel, after the food, the
 *   packaging and the channel's own cut?                          margins()
 *   Where does what a channel shows differ from Harbour's own rule? drift()
 *   If we change these prices, what exactly changes where, and what does
 *   it move if volume holds?                                        preview()
 *
 * "Left after" is deliberately not called profit. Labour, rent and everything
 * else still come out of it, and a number that pretends otherwise is a number a
 * restaurant owner will catch in about four seconds.
 */
import { MENU, menuItem, ingredient, CHANNELS, POLICY, CHANNEL_SHARE, appPriceFor, CATEGORIES } from "./harbour/index.js";

export const CHANNEL_ORDER = ["square", "website", "doordash", "ubereats", "skip"];
const channel = (id) => CHANNELS.find((c) => c.id === id);

/** Food cost of one serve, in cents: listed ingredients plus the stated pantry allowance. */
export function foodCents(item) {
  return item.pantryCents + Object.entries(item.recipe).reduce((a, [k, q]) => a + q * ingredient(k).cents, 0);
}

/** Packaging for an order that leaves the building. Nothing for a plate in the room. */
export function packCents(item, channelId) {
  if (channel(channelId).kind !== "app") return 0;
  return item.pack.reduce((a, k) => a + ingredient(k).cents, 0);
}

/** What one serve leaves behind on one channel at one price. */
export function margin(item, channelId, priceCents) {
  const ch = channel(channelId);
  const food = foodCents(item);
  const pack = packCents(item, channelId);
  const fee = priceCents * ch.feeRate;
  const left = priceCents - food - pack - fee;
  return { priceCents, foodCents: food, packCents: pack, feeCents: fee, leftCents: left, leftPct: priceCents ? left / priceCents : 0 };
}

/** What a channel should show for an item, given the till price, by Harbour's policy. */
export function wantedPrice(channelId, posCents) {
  const ch = channel(channelId);
  if (ch.kind === "app") return appPriceFor(posCents);
  return posCents; // the till itself, and the website, which follows it
}

/** Serves per week on a channel, if the item is listed there; the room takes the rest. */
export function weeklyUnits(item, channelId, listedOn) {
  if (channel(channelId).kind === "display") return 0;
  const appShare = ["doordash", "ubereats", "skip"].filter((c) => listedOn.has(c)).reduce((a, c) => a + CHANNEL_SHARE[c], 0);
  if (channelId === "square") return item.weekly * (1 - appShare);
  return listedOn.has(channelId) ? item.weekly * CHANNEL_SHARE[channelId] : 0;
}

const listedOnFor = (state, itemId) => new Set(CHANNEL_ORDER.filter((c) => state.listings[c].some((l) => l.itemId === itemId)));
const priceOn = (state, channelId, itemId) => state.listings[channelId].find((l) => l.itemId === itemId)?.cents ?? null;

/** The margin grid: every item, every channel that sells it. */
export function margins(state) {
  return MENU.map((item) => {
    const listedOn = listedOnFor(state, item.id);
    const cells = {};
    for (const c of CHANNEL_ORDER) {
      const price = priceOn(state, c, item.id);
      if (price == null || !channel(c).takesOrders) continue;
      cells[c] = { ...margin(item, c, price), weekly: weeklyUnits(item, c, listedOn) };
    }
    return { itemId: item.id, name: item.name, category: item.category, foodCents: foodCents(item), cells };
  });
}

/**
 * Where a channel disagrees with the rule. Each entry says what it shows, what the
 * rule says, and, for an app priced under the rule, what that gap is worth a week
 * if volume holds. Over-policy prices are listed but not priced as a loss: they
 * cost goodwill, not margin, and pretending otherwise would inflate the number.
 */
export function drift(state) {
  const out = [];
  const pos = (itemId) => priceOn(state, "square", itemId);
  for (const c of CHANNEL_ORDER) {
    if (c === "square") continue;
    for (const l of state.listings[c]) {
      const item = menuItem(l.itemId);
      if (l.mapping !== "confirmed") {
        out.push({ kind: "unconfirmed-name", channel: c, itemId: l.itemId, name: item.name, shownAs: l.name, haveCents: l.cents });
      }
      const want = wantedPrice(c, pos(l.itemId));
      if (l.cents === want) continue;
      const units = weeklyUnits(item, c, listedOnFor(state, l.itemId));
      out.push({
        kind: l.cents < want ? "under-policy" : "over-policy",
        channel: c, itemId: l.itemId, name: item.name, shownAs: l.name,
        haveCents: l.cents, wantCents: want,
        weeklyCents: l.cents < want ? (want - l.cents) * units : 0,
      });
    }
    // Sold in the room and on the other apps, absent here.
    if (channel(c).kind === "app") {
      for (const item of MENU) {
        const elsewhere = ["doordash", "ubereats", "skip"].filter((x) => x !== c).some((x) => state.listings[x].some((l) => l.itemId === item.id));
        const expectedHere = !item.roomOnly && !(c === "skip" && item.category === "Coffee") && item.id !== "americano";
        if (elsewhere && expectedHere && !state.listings[c].some((l) => l.itemId === item.id)) {
          out.push({ kind: "not-listed", channel: c, itemId: item.id, name: item.name });
        }
      }
    }
  }
  return out;
}

/** Till prices move in quarters, and a computed price is never rounded down. */
export const posRound = (cents) => Math.ceil(Math.round(cents) / POLICY.posStepCents) * POLICY.posStepCents;

export const LIMITS = { addCents: [-500, 500], addPct: [-20, 30], targetPct: [15, 45], minCents: 100, maxCents: 10_000 };

/** Validate a rule from the page. Returns { rule } or { error }. */
export function checkRule(raw) {
  const r = raw ?? {};
  const scope = r.scope ?? {};
  const itemIds = Array.isArray(scope.itemIds) ? scope.itemIds.filter((id) => menuItem(id)) : [];
  const category = CATEGORIES.includes(scope.category) ? scope.category : null;
  if (!category && !itemIds.length && !r.fixDrift) return { error: "pick a category or some items, or tick fix drift" };

  const type = r.action?.type;
  const value = Number(r.action?.value);
  const within = ([lo, hi]) => Number.isFinite(value) && value >= lo && value <= hi;
  if (category || itemIds.length) {
    if (type === "add-cents" && !within(LIMITS.addCents)) return { error: "a change of up to $5 either way" };
    if (type === "add-pct" && !within(LIMITS.addPct)) return { error: "between -20% and +30%" };
    if (type === "target-food-pct" && !within(LIMITS.targetPct)) return { error: "a food cost target between 15% and 45%" };
    if (!["add-cents", "add-pct", "target-food-pct"].includes(type)) return { error: "unknown kind of change" };
  }
  return { rule: { scope: { category, itemIds }, action: { type, value }, fixDrift: Boolean(r.fixDrift) } };
}

function newPos(item, current, action) {
  if (action.type === "add-cents") return posRound(current + action.value);
  if (action.type === "add-pct") return posRound(current * (1 + action.value / 100));
  return posRound(foodCents(item) / (action.value / 100)); // target-food-pct
}

export function describe(rule) {
  const what = rule.scope.category ? `all ${rule.scope.category.toLowerCase()}` : rule.scope.itemIds.length ? `${rule.scope.itemIds.length} item${rule.scope.itemIds.length === 1 ? "" : "s"}` : null;
  const how = !what ? null
    : rule.action.type === "add-cents" ? `${rule.action.value >= 0 ? "+" : "-"}$${(Math.abs(rule.action.value) / 100).toFixed(2)}`
    : rule.action.type === "add-pct" ? `${rule.action.value >= 0 ? "+" : ""}${rule.action.value}%`
    : `priced to ${rule.action.value}% food cost`;
  const parts = [];
  if (what) parts.push(`${what} ${how}`);
  if (rule.fixDrift) parts.push("every app price brought back to policy");
  return parts.join(", and ");
}

/**
 * Turn a rule into a concrete change: per channel, which items go from what to
 * what. The current state is not touched; this is a proposal.
 */
export function preview(state, rule) {
  const inScope = (item) => rule.scope.category ? item.category === rule.scope.category : rule.scope.itemIds.includes(item.id);
  const ops = Object.fromEntries(CHANNEL_ORDER.map((c) => [c, []]));
  const rows = [];
  const warnings = [];

  for (const item of MENU) {
    const curPos = priceOn(state, "square", item.id);
    const scoped = (rule.scope.category || rule.scope.itemIds.length) && inScope(item);
    const targetPos = scoped ? newPos(item, curPos, rule.action) : curPos;
    const row = { itemId: item.id, name: item.name, category: item.category, channels: {} };
    let touched = false;

    for (const c of CHANNEL_ORDER) {
      const listing = state.listings[c].find((l) => l.itemId === item.id);
      if (!listing) continue;
      const want = wantedPrice(c, targetPos);
      const moves = scoped ? listing.cents !== want : rule.fixDrift && c !== "square" && listing.cents !== want;
      const to = moves ? want : listing.cents;
      const before = channel(c).takesOrders ? margin(item, c, listing.cents) : null;
      const after = channel(c).takesOrders ? margin(item, c, to) : null;
      row.channels[c] = { from: listing.cents, to, moves, leftBefore: before?.leftCents ?? null, leftAfter: after?.leftCents ?? null, leftPctAfter: after?.leftPct ?? null };
      if (moves) {
        touched = true;
        ops[c].push({ itemId: item.id, cents: to, from: listing.cents });
        if (listing.mapping !== "confirmed") {
          warnings.push({ channel: c, itemId: item.id, text: `${channel(c).label} shows "${listing.name}", a name nobody has confirmed as ${item.name}. It will be refused until someone does.` });
        }
      }
    }
    if (scoped && !state.listings.skip.some((l) => l.itemId === item.id) && !item.roomOnly && item.category !== "Coffee") {
      warnings.push({ channel: "skip", itemId: item.id, text: `${item.name} is not listed on SkipTheDishes, so there is nothing there to reprice. Listing it is a separate job.` });
    }
    if (touched) rows.push(row);
  }

  // If volume holds: units a week times the change in price, per channel, before tax.
  let weeklyCents = 0;
  for (const c of CHANNEL_ORDER) {
    for (const op of ops[c]) {
      const item = menuItem(op.itemId);
      weeklyCents += (op.cents - op.from) * weeklyUnits(item, c, listedOnFor(state, item.id));
    }
  }

  return {
    summary: describe(rule),
    rule,
    rows,
    ops,
    warnings,
    counts: Object.fromEntries(CHANNEL_ORDER.map((c) => [c, ops[c].length])),
    weeklyCents,
    // 52 weeks over 12 months, so a month is the average month, not four weeks.
    monthlyCents: (weeklyCents * 52) / 12,
  };
}
