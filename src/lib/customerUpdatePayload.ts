/**
 * Builds a minimal update payload for the customers table.
 *
 * Only fields the user actually changed in the form are included. This prevents
 * a stale value held in local form state (most importantly `opted_out`, which
 * can be flipped in the backend by an inbound WhatsApp "STOP") from being
 * written back over a newer backend value on save.
 */

// Never sent in an update — managed by the database / ownership.
const IMMUTABLE_FIELDS = new Set(["id", "created_at", "updated_at", "user_id"]);

const isEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  // Treat null/undefined/"" transitions between identical values as equal
  if (a == null && b == null) return true;
  if (typeof a === "object" && typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
};

export function buildCustomerUpdatePayload(
  form: Record<string, any>,
  originalForm: Record<string, any>,
): Record<string, any> {
  const updates: Record<string, any> = {};
  for (const key of Object.keys(form)) {
    if (IMMUTABLE_FIELDS.has(key)) continue;
    if (isEqual(form[key], originalForm?.[key])) continue;
    updates[key] = form[key];
  }
  return updates;
}
