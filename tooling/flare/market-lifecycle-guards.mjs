/**
 * Return the public error code that should stop a lifecycle write.
 *
 * Read-only preflight intentionally ignores existing release paths so an
 * operator can re-check live machines, FTSO freshness, and funding without
 * deleting or replacing immutable evidence. The path reservation applies
 * only to an executing lifecycle.
 */
export function lifecyclePathBlocker({ execute, evidenceExists, stateExists }) {
  if (!execute) return null;
  if (evidenceExists) return "FCC_MARKET_LIFECYCLE_EVIDENCE_EXISTS";
  if (stateExists) return "FCC_MARKET_LIFECYCLE_STATE_EXISTS";
  return null;
}
