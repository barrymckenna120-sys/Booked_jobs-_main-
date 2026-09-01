/**
 * BJ-0090 — Lead vs Assist gating.
 *
 * An engineer is the Lead for a job when their engineers.id matches the job's
 * assigned_engineer_id. Anyone who is not an engineer at all (office/admin) is
 * never gated, and a job with no lead assigned is never gated either.
 */
export const resolveIsLeadEngineer = ({
  engineerId,
  assignedEngineerId,
}: {
  /** engineers.id of the logged-in user, null when they are not an engineer. */
  engineerId: string | null | undefined;
  assignedEngineerId: string | null | undefined;
}): boolean => {
  if (!engineerId) return true; // office/admin — not an engineer, no gating
  if (!assignedEngineerId) return true; // unassigned job — nothing to gate against
  return engineerId === assignedEngineerId;
};
