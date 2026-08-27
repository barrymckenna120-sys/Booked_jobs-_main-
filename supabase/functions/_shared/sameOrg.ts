/**
 * Prove that every participating resource belongs to the SAME organisation.
 *
 * Several flows read more than one row (job + customer + invoice/payment). It is
 * not enough to authorise the caller against one of them: a reminder could
 * otherwise pair Tenant A's job with Tenant B's customer record. Any missing or
 * mismatched organisation is a denial, never a "best effort".
 *
 * Pure and synchronous (no Deno/npm imports) so it is unit-testable from the
 * frontend test runner.
 */
export function assertSameOrganisation(
  expectedOrgId: string | null | undefined,
  participants: Array<{ label: string; orgId: string | null | undefined }>,
): { ok: true } | { ok: false; detail: string } {
  const expected = String(expectedOrgId ?? "").trim();
  if (!expected) return { ok: false, detail: "no expected organisation" };

  for (const p of participants) {
    const actual = String(p.orgId ?? "").trim();
    if (!actual) return { ok: false, detail: `${p.label} has no organisation` };
    if (actual !== expected) {
      return { ok: false, detail: `${p.label} belongs to a different organisation` };
    }
  }
  return { ok: true };
}
