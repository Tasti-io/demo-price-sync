/**
 * POST /api/publish: send one channel its part of an approved change, and report
 * what the channel said. Saying is not doing; /api/verify is the separate look.
 */
import { endpoint } from "../lib/http.js";
import { checkHistory, buildState, publish } from "../lib/channels-sim.js";

export default endpoint((body) => {
  const h = checkHistory([...(Array.isArray(body.history) ? body.history : []), body.push], body.confirmed);
  if (h.error) return h;
  const before = buildState(h.history.slice(0, -1), h.confirmed);
  return publish(before, h.history.at(-1));
});
