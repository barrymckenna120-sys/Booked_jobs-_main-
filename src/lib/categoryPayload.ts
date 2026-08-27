/**
 * Category write payloads.
 *
 * Live gap: the Categories tab inserted `{ name, description }` and relied on
 * the `categories.organisation_id` column default to fill the tenant in. That
 * default is invisible from the client, so a session whose org had not resolved
 * yet could create an unowned row — and once the shared NULL rows were retired,
 * an unowned row is readable by nobody. The insert now names the organisation
 * explicitly, and refuses to build a payload without one.
 */

export interface CategoryFormValues {
  name: string;
  description: string;
}

export interface CategoryInsert {
  name: string;
  description: string | null;
  organisation_id: string;
}

export interface CategoryUpdate {
  name: string;
  description: string | null;
}

export type CategoryPayloadResult =
  | { ok: true; payload: CategoryInsert }
  | { ok: false; reason: "missing-name" | "missing-org" };

/** Shared field normalisation for both insert and update. */
export function buildCategoryUpdate(
  form: CategoryFormValues,
): { ok: true; payload: CategoryUpdate } | { ok: false; reason: "missing-name" } {
  const name = form.name.trim();
  if (!name) return { ok: false, reason: "missing-name" };
  return {
    ok: true,
    payload: { name, description: form.description.trim() || null },
  };
}

/** Insert payload — always carries the caller's organisation. */
export function buildCategoryInsert(
  form: CategoryFormValues,
  orgId: string | null | undefined,
): CategoryPayloadResult {
  const base = buildCategoryUpdate(form);
  if (!base.ok) return base;
  if (!orgId) return { ok: false, reason: "missing-org" };
  return { ok: true, payload: { ...base.payload, organisation_id: orgId } };
}
