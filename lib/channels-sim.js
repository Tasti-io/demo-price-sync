/**
 * The five channels, simulated, and the two ways a handoff to them fails.
 *
 * There is no database. The visitor's browser keeps a list of every push it has
 * made; each request sends that list back, and the state of every channel is
 * rebuilt from Harbour's starting menu by replaying it. Nothing a visitor does is
 * seen by anybody else.
 *
 * Each channel has two faces, kept apart on purpose:
 *
 *   publish()  what the channel SAYS when you send it a change
 *   read()     what the channel actually SHOWS when you look afterwards
 *
 * For three channels they agree. For two they do not, in the two ways that make
 * menu syncing a job rather than a button:
 *
 *   Uber Eats  a bulk update returns success, and items that carry modifier groups
 *              quietly keep their old price. Re-sent one item at a time, they move.
 *   Skip       an item whose name nobody has confirmed is refused as not found.
 *
 * These are illustrations of failure modes, not a description of how either app's
 * real API behaves. The point is the re-read: a tool that trusts publish() reports
 * a clean run on both of them.
 */
import { CHANNELS, listings as startingListings, menuItem } from "./harbour/index.js";
import { CHANNEL_ORDER, LIMITS } from "./pricing.js";

export const MAX_PUSHES = 80;
export const MAX_OPS = 60;

const key = (channelId, itemId) => `${channelId}:${itemId}`;

/**
 * Check the history a browser sent. Anything malformed is refused whole rather
 * than partly applied, because a half-trusted history is a state nobody can
 * reason about.
 */
export function checkHistory(raw, confirmedRaw) {
  if (raw != null && !Array.isArray(raw)) return { error: "history must be a list" };
  const history = raw ?? [];
  if (history.length > MAX_PUSHES) return { error: "that is a long session; reset the demo to start again" };
  for (const p of history) {
    if (!CHANNEL_ORDER.includes(p?.channel)) return { error: "unknown channel in history" };
    if (!["bulk", "item"].includes(p.mode)) return { error: "unknown push mode in history" };
    if (!Array.isArray(p.ops) || p.ops.length > MAX_OPS) return { error: "bad push in history" };
    for (const op of p.ops) {
      if (!menuItem(op?.itemId)) return { error: "unknown item in history" };
      if (!Number.isInteger(op.cents) || op.cents < LIMITS.minCents || op.cents > LIMITS.maxCents) return { error: "price out of range in history" };
    }
    if (p.confirmed != null && !Array.isArray(p.confirmed)) return { error: "bad confirmations in history" };
  }
  const confirmed = Array.isArray(confirmedRaw) ? confirmedRaw.filter((k) => typeof k === "string" && k.length < 64) : [];
  return { history, confirmed };
}

/** What a push actually changes on the channel, which is not always what was sent. */
function applied(push, listing) {
  const confirmed = new Set(push.confirmed ?? []);
  return push.ops.filter((op) => {
    const l = listing.find((x) => x.itemId === op.itemId);
    if (!l) return false;
    if (push.channel === "skip" && l.mapping !== "confirmed" && !confirmed.has(key("skip", op.itemId))) return false;
    if (push.channel === "ubereats" && push.mode === "bulk" && menuItem(op.itemId).modifiers) return false;
    return true;
  });
}

/** Every channel's menu as it stands after replaying the history. */
export function buildState(history, confirmed) {
  const listings = startingListings();
  for (const push of history) {
    const listing = listings[push.channel];
    for (const op of applied(push, listing)) {
      listing.find((l) => l.itemId === op.itemId).cents = op.cents;
    }
  }
  // Names a person has confirmed on this page count as confirmed from now on.
  const ok = new Set(confirmed);
  for (const c of CHANNEL_ORDER) for (const l of listings[c]) if (ok.has(key(c, l.itemId))) l.mapping = "confirmed";
  return { listings };
}

/** What the channel says when it receives a push. */
export function publish(state, push) {
  const listing = state.listings[push.channel];
  const confirmed = new Set(push.confirmed ?? []);
  const accepted = [];
  const refused = [];
  for (const op of push.ops) {
    const l = listing.find((x) => x.itemId === op.itemId);
    if (!l) refused.push({ itemId: op.itemId, reason: "item not on this channel" });
    else if (push.channel === "skip" && l.mapping !== "confirmed" && !confirmed.has(key("skip", op.itemId))) {
      refused.push({ itemId: op.itemId, reason: `item not found: "${l.name}" is not matched to anything on our side` });
    } else accepted.push(op.itemId); // Uber's bulk call lands here too: it says yes
  }
  return { channel: push.channel, label: CHANNELS.find((c) => c.id === push.channel).label, accepted, refused, at: new Date().toISOString() };
}

/**
 * Look at the channel afterwards, independently of what publish() said, and
 * compare every price we meant to set with the price it now shows.
 */
export function verify(stateAfter, push) {
  const listing = stateAfter.listings[push.channel];
  const checks = push.ops.map((op) => {
    const shows = listing.find((l) => l.itemId === op.itemId)?.cents ?? null;
    return { itemId: op.itemId, name: menuItem(op.itemId).name, wantCents: op.cents, showsCents: shows, ok: shows === op.cents };
  });
  return { channel: push.channel, checks, ok: checks.every((c) => c.ok), at: new Date().toISOString() };
}
