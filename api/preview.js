/** POST /api/preview: a rule in, the concrete change it would make out. Nothing is changed. */
import { endpoint } from "../lib/http.js";
import { checkHistory, buildState } from "../lib/channels-sim.js";
import { checkRule, preview } from "../lib/pricing.js";

export default endpoint((body) => {
  const h = checkHistory(body.history, body.confirmed);
  if (h.error) return h;
  const r = checkRule(body.rule);
  if (r.error) return r;
  return preview(buildState(h.history, h.confirmed), r.rule);
});
