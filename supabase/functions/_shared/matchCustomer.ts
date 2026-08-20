/**
 * Shared customer matcher.
 *
 * Given an inbound phone (and optionally an email), find the customer row in
 * the given organisation that the contact belongs to. Lookup order:
 *
 *  1. Exact match on the normalised E.164 phone (`+353…`)
 *  2. Last-9-digit match (format-agnostic fallback)
 *  3. Case-insensitive email match (only when a non-empty email is supplied
 *     and no phone match was found)
 *
 * Tie-break when more than one row matches: most recently active first —
 * `updated_at desc`, then `created_at desc`, then `id asc`.
 *
 * Phone normalisation is NOT duplicated here: it comes from `_shared/phone.ts`.
 */

import { last9Digits, normalisePhoneE164 } from "./phone.ts";

export interface MatchCustomerResult {
  matched: boolean;
  customerId: string | null;
}

interface CustomerRow {
  id: string;
  phone: string | null;
  updated_at: string | null;
  created_at: string | null;
}

/** Most recently active first: updated_at desc, created_at desc, id asc. */
function byMostRecentlyActive(a: CustomerRow, b: CustomerRow): number {
  const au = a.updated_at ?? "";
  const bu = b.updated_at ?? "";
  if (au !== bu) return au < bu ? 1 : -1;
  const ac = a.created_at ?? "";
  const bc = b.created_at ?? "";
  if (ac !== bc) return ac < bc ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export async function matchCustomer(
  supabase: any,
  organisationId: string,
  phone: unknown,
  email?: unknown,
): Promise<MatchCustomerResult> {
  if (!organisationId) return { matched: false, customerId: null };

  const normalised = normalisePhoneE164(phone);
  const key = last9Digits(normalised || phone);

  // 1. Exact match on the normalised phone.
  if (normalised) {
    const { data } = await supabase
      .from("customers")
      .select("id, phone, updated_at, created_at")
      .eq("organisation_id", organisationId)
      .eq("phone", normalised)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: true });

    const rows = (data ?? []) as CustomerRow[];
    if (rows.length > 0) {
      return { matched: true, customerId: rows.slice().sort(byMostRecentlyActive)[0].id };
    }
  }

  // 2. Last-9-digit fallback.
  if (key) {
    const { data } = await supabase
      .from("customers")
      .select("id, phone, updated_at, created_at")
      .eq("organisation_id", organisationId);

    const rows = ((data ?? []) as CustomerRow[]).filter(
      (r) => last9Digits(r.phone) === key,
    );
    if (rows.length > 0) {
      return { matched: true, customerId: rows.slice().sort(byMostRecentlyActive)[0].id };
    }
  }

  // 3. Case-insensitive email match (only when no phone match).
  const cleanEmail = typeof email === "string" ? email.trim() : "";
  if (cleanEmail) {
    const { data } = await supabase
      .from("customers")
      .select("id, phone, updated_at, created_at")
      .eq("organisation_id", organisationId)
      .ilike("email", cleanEmail);

    const rows = (data ?? []) as CustomerRow[];
    if (rows.length > 0) {
      return { matched: true, customerId: rows.slice().sort(byMostRecentlyActive)[0].id };
    }
  }

  return { matched: false, customerId: null };
}
