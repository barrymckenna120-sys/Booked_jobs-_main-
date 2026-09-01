/**
 * BJ-0131 — pure helpers for the server-side customer import.
 *
 * No Deno APIs, no Supabase client: everything here is deterministic so it can
 * be unit-tested directly and so the classification it feeds is provably the
 * same as the browser preview's (see importDuplicates.ts, the shared matcher).
 *
 * The one deliberate hardening step versus the old client-side importer: the
 * incoming row is projected onto an explicit column allow-list before it is ever
 * written. The browser used to spread whatever it had parsed straight into the
 * insert, which meant a crafted payload could set customer columns the import
 * screen never exposes.
 */

/** Every customer column the import screen can map. Nothing else is writable. */
export const IMPORTABLE_FIELDS = [
  "name",
  "phone",
  "email",
  "address",
  "eircode",
  "gprn",
  "access_notes",
  "boiler_brand",
  "boiler_model",
  "boiler_type",
  "boiler_installation_date",
  "under_warranty",
  "warranty_years",
  "owner_or_tenant",
  "last_service_date",
  "last_service_engineer",
  "engineer_notes",
  "next_service_due",
  "service_status",
  "assigned_engineer",
  "notes",
  "customer_since",
] as const;

export type ImportableField = (typeof IMPORTABLE_FIELDS)[number];

/** Required fields are kept even when blank, matching the previous cleanData(). */
const REQUIRED_FIELDS: ImportableField[] = ["name", "phone", "address", "eircode"];

const ALLOWED = new Set<string>(IMPORTABLE_FIELDS);

/**
 * Allow-list + clean an incoming row. Same semantics as the old client-side
 * `cleanData`: required fields always present, other fields dropped when empty.
 * Unknown keys are discarded rather than rejected so a harmless extra column in
 * a spreadsheet does not fail the whole import.
 */
export function sanitiseImportRow(
  raw: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (!ALLOWED.has(key)) continue;
    if (REQUIRED_FIELDS.includes(key as ImportableField)) {
      out[key] = value;
      continue;
    }
    if (value === null || value === undefined || value === "") continue;
    out[key] = value;
  }
  return out;
}

/** Keys the caller supplied that this importer refuses to write. */
export function rejectedFields(
  raw: Record<string, unknown> | null | undefined,
): string[] {
  return Object.keys(raw ?? {}).filter((k) => !ALLOWED.has(k));
}

/** A row is committable only when the four required fields carry a value. */
export function hasRequiredFields(data: Record<string, unknown>): boolean {
  return REQUIRED_FIELDS.every((f) => String(data?.[f] ?? "").trim() !== "");
}

/**
 * Defaults applied to a newly created customer. Identical to the previous
 * client-side insert, with `now` injected so the test is not date-dependent.
 */
export function buildInsertPayload(
  cleaned: Record<string, unknown>,
  ctx: { userId: string; orgId: string; now?: Date },
): Record<string, unknown> {
  const now = ctx.now ?? new Date();
  const nextServiceDue = new Date(now.getTime());
  nextServiceDue.setFullYear(nextServiceDue.getFullYear() + 1);
  return {
    ...cleaned,
    user_id: ctx.userId,
    organisation_id: ctx.orgId,
    boiler_type: cleaned.boiler_type || "Gas",
    owner_or_tenant: cleaned.owner_or_tenant || "Owner",
    warranty_years: cleaned.warranty_years ?? 10,
    next_service_due: cleaned.next_service_due ||
      nextServiceDue.toISOString().split("T")[0],
    renewal_stage: "none",
    service_status: cleaned.service_status || "active",
  };
}

export type ImportOutcome =
  | "created"
  | "updated"
  | "merged"
  | "skipped_ambiguous"
  | "skipped_existing"
  | "excluded_duplicate"
  | "failed";

export type ImportRowDetail = {
  row_number: number;
  outcome: ImportOutcome;
  customer_id: string | null;
  error_message: string | null;
};

/** Wording preserved byte-for-byte from the client-side importer. */
export const ambiguousReason = (count: number): string =>
  `Matches ${count} existing customers — resolve the duplicates first`;

export const exclusionReason = (
  rowNum: number,
  groupRowNums: number[] | null | undefined,
): string => {
  const others = (groupRowNums ?? []).filter((n) => n !== rowNum);
  if (others.length === 0) return "Excluded from this import by the operator";
  return `Excluded as a duplicate of row${others.length === 1 ? "" : "s"} ${others.join(", ")}`;
};

/** Roll per-row outcomes up into the counters the summary screen shows. */
export function summariseOutcomes(details: ImportRowDetail[]): {
  imported: number;
  updated: number;
  skipped: number;
  skippedExisting: number;
  excluded: number;
} {
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let skippedExisting = 0;
  let excluded = 0;
  for (const d of details) {
    switch (d.outcome) {
      case "created":
        imported++;
        break;
      case "merged":
      case "updated":
        updated++;
        break;
      case "skipped_existing":
        skippedExisting++;
        break;
      case "excluded_duplicate":
        excluded++;
        break;
      case "skipped_ambiguous":
      case "failed":
        skipped++;
        break;
    }
  }
  return { imported, updated, skipped, skippedExisting, excluded };
}
