/**
 * BJ-0131 — Customer import duplicate detection.
 *
 * Pure helpers only: no Supabase, no React. Two jobs:
 *  1. Group duplicate rows *within* an uploaded spreadsheet.
 *  2. Match a spreadsheet row against customers that already exist.
 *
 * Matching keys, in confidence order: GPRN, normalised phone, name + address.
 * Callers are responsible for only ever passing existing customers from the
 * same organisation_id — matching never crosses a tenant boundary here because
 * this module has no idea what an organisation is.
 */

export type ImportMatchReason = "gprn" | "phone" | "name_address";

export const MATCH_REASON_LABEL: Record<ImportMatchReason, string> = {
  gprn: "Same GPRN",
  phone: "Same phone number",
  name_address: "Same name & address",
};

/** Digits-only phone key, tolerant of +353 / 0 / spacing differences. */
export const normalisePhoneKey = (val: unknown): string => {
  let s = String(val ?? "").replace(/\D/g, "");
  if (!s) return "";
  if (s.startsWith("00")) s = s.slice(2);
  if (s.startsWith("353")) s = s.slice(3);
  if (s.startsWith("0")) s = s.slice(1);
  return s;
};

/** Digits-only GPRN key. Blank stays blank so empty GPRNs never match each other. */
export const normaliseGprnKey = (val: unknown): string =>
  String(val ?? "").replace(/\D/g, "");

/** Lower-cased, punctuation-free, whitespace-collapsed text key. */
export const normaliseTextKey = (val: unknown): string =>
  String(val ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Name + address key. Eircode is folded in when present on both sides via the
 * address slot, so "1 Main St" in two different towns doesn't collide.
 */
export const normaliseNameAddressKey = (
  name: unknown,
  address: unknown,
  eircode?: unknown
): string => {
  const n = normaliseTextKey(name);
  const a = normaliseTextKey(address);
  if (!n || !a) return "";
  const e = normaliseTextKey(eircode);
  return e ? `${n}|${a}|${e}` : `${n}|${a}`;
};

/** Fields that make a customer record "complete" for suggestion purposes. */
const COMPLETENESS_FIELDS = [
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
  "assigned_engineer",
  "notes",
  "customer_since",
] as const;

/** Count of populated fields. Higher wins when suggesting which row to keep. */
export const completenessScore = (data: Record<string, any> | null | undefined): number => {
  if (!data) return 0;
  let score = 0;
  for (const key of COMPLETENESS_FIELDS) {
    const v = data[key];
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    score++;
  }
  return score;
};

/** Which populated fields row A has that row B does not — used to explain a suggestion. */
export const extraFields = (
  richer: Record<string, any>,
  poorer: Record<string, any>
): string[] => {
  const has = (d: Record<string, any>, k: string) => {
    const v = d?.[k];
    if (v === null || v === undefined) return false;
    if (typeof v === "string" && v.trim() === "") return false;
    return true;
  };
  return COMPLETENESS_FIELDS.filter((k) => has(richer, k) && !has(poorer, k));
};

export type DuplicateCandidate = {
  /** Stable identifier for the row (spreadsheet row number). */
  rowNum: number;
  data: Record<string, any>;
};

export type DuplicateGroup = {
  /** Group id, derived from the lowest row number in the group. */
  id: string;
  /** Why these rows were grouped — may be several reasons at once. */
  reasons: ImportMatchReason[];
  rowNums: number[];
  /** Most complete row — suggested to keep. */
  keepRowNum: number;
  /** Less complete rows — pre-selected for exclusion, overridable by the user. */
  suggestedExcludeRowNums: number[];
};

type KeyKind = ImportMatchReason;

const rowKeys = (data: Record<string, any>): Array<[KeyKind, string]> => {
  const out: Array<[KeyKind, string]> = [];
  const gprn = normaliseGprnKey(data?.gprn);
  if (gprn) out.push(["gprn", gprn]);
  const phone = normalisePhoneKey(data?.phone);
  if (phone) out.push(["phone", phone]);
  const na = normaliseNameAddressKey(data?.name, data?.address, data?.eircode);
  if (na) out.push(["name_address", na]);
  return out;
};

const REASON_ORDER: ImportMatchReason[] = ["gprn", "phone", "name_address"];

/**
 * Group rows in the uploaded file that describe the same customer. Rows are
 * unioned transitively: a shared GPRN, a shared phone, or a shared name+address
 * all pull rows into the same group, so a customer entered twice with slightly
 * different detail still lands in one group.
 */
export function findInFileDuplicateGroups(rows: DuplicateCandidate[]): DuplicateGroup[] {
  const parent = new Map<number, number>();
  const find = (n: number): number => {
    let root = n;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // path compression
    let cur = n;
    while (parent.get(cur) !== root) {
      const nxt = parent.get(cur)!;
      parent.set(cur, root);
      cur = nxt;
    }
    return root;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(Math.max(ra, rb), Math.min(ra, rb));
  };

  for (const r of rows) parent.set(r.rowNum, r.rowNum);

  // key -> first row seen with that key
  const seen = new Map<string, number>();
  const reasonsByPair = new Map<string, Set<ImportMatchReason>>();
  for (const r of rows) {
    for (const [kind, key] of rowKeys(r.data)) {
      const composite = `${kind}:${key}`;
      const first = seen.get(composite);
      if (first === undefined) {
        seen.set(composite, r.rowNum);
      } else {
        union(first, r.rowNum);
        const gk = String(Math.min(find(first), find(r.rowNum)));
        const set = reasonsByPair.get(gk) ?? new Set<ImportMatchReason>();
        set.add(kind);
        reasonsByPair.set(gk, set);
      }
    }
  }

  const byRoot = new Map<number, DuplicateCandidate[]>();
  for (const r of rows) {
    const root = find(r.rowNum);
    const list = byRoot.get(root);
    if (list) list.push(r);
    else byRoot.set(root, [r]);
  }

  const groups: DuplicateGroup[] = [];
  for (const [root, members] of byRoot) {
    if (members.length < 2) continue;

    // Recompute reasons from the final membership so transitive merges report
    // every key that actually repeats inside the group.
    const counts = new Map<string, number>();
    for (const m of members) {
      for (const [kind, key] of rowKeys(m.data)) {
        const composite = `${kind}:${key}`;
        counts.set(composite, (counts.get(composite) ?? 0) + 1);
      }
    }
    const reasonSet = new Set<ImportMatchReason>();
    for (const [composite, n] of counts) {
      if (n > 1) reasonSet.add(composite.split(":")[0] as ImportMatchReason);
    }
    if (reasonSet.size === 0) {
      for (const rr of reasonsByPair.get(String(root)) ?? []) reasonSet.add(rr);
    }

    const sorted = members.slice().sort((a, b) => {
      const diff = completenessScore(b.data) - completenessScore(a.data);
      return diff !== 0 ? diff : a.rowNum - b.rowNum;
    });
    const keep = sorted[0];

    groups.push({
      id: `grp-${root}`,
      reasons: REASON_ORDER.filter((r) => reasonSet.has(r)),
      rowNums: members.map((m) => m.rowNum).sort((a, b) => a - b),
      keepRowNum: keep.rowNum,
      suggestedExcludeRowNums: sorted.slice(1).map((m) => m.rowNum).sort((a, b) => a - b),
    });
  }

  return groups.sort((a, b) => a.rowNums[0] - b.rowNums[0]);
}

export type ExistingCustomerLite = {
  id: string;
  name: string | null;
  address: string | null;
  eircode?: string | null;
  phone?: string | null;
  gprn?: string | null;
};

export type ExistingMatchResult = {
  customer: ExistingCustomerLite;
  reason: ImportMatchReason;
};

/**
 * Match one spreadsheet row against already-existing customers. Highest
 * confidence key wins; all customers matching on that key are returned so the
 * caller can flag an ambiguous match instead of guessing.
 */
export function matchExistingCustomers(
  data: Record<string, any>,
  existing: ExistingCustomerLite[]
): ExistingMatchResult[] {
  const gprn = normaliseGprnKey(data?.gprn);
  const phone = normalisePhoneKey(data?.phone);
  const na = normaliseNameAddressKey(data?.name, data?.address, data?.eircode);

  const byGprn = gprn
    ? existing.filter((c) => normaliseGprnKey(c.gprn) === gprn)
    : [];
  if (byGprn.length) return byGprn.map((c) => ({ customer: c, reason: "gprn" as const }));

  const byPhone = phone
    ? existing.filter((c) => normalisePhoneKey(c.phone) === phone)
    : [];
  if (byPhone.length) return byPhone.map((c) => ({ customer: c, reason: "phone" as const }));

  const byNameAddr = na
    ? existing.filter(
        (c) => normaliseNameAddressKey(c.name, c.address, c.eircode) === na
      )
    : [];
  if (byNameAddr.length)
    return byNameAddr.map((c) => ({ customer: c, reason: "name_address" as const }));

  return [];
}

/**
 * Merge payload: existing customer values are kept unless the incoming row has
 * a value for a field the existing record is missing. Never blanks a field.
 */
export function buildMergePayload(
  incoming: Record<string, any>,
  existing: Record<string, any>
): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(incoming)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    const current = existing?.[key];
    const currentEmpty =
      current === null ||
      current === undefined ||
      (typeof current === "string" && current.trim() === "");
    if (currentEmpty) out[key] = value;
  }
  return out;
}
