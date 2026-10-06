/**
 * POST /api/verify: look at a channel after a push, independently of what it said
 * when it received it, and compare every intended price with what it now shows.
 */
import { endpoint } from "../lib/http.js";
import { checkHistory, buildState, verify } from "../lib/channels-sim.js";

export default endpoint((body) => {
  const h = checkHistory(body.history, body.confirmed);
  if (h.error) return h;
  if (!h.history.length) return { error: "nothing to verify" };
  return verify(buildState(h.history, h.confirmed), h.history.at(-1));
});
