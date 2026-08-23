import { supabase } from "@/integrations/supabase/client";
import { buildPartsRequestRow, type BuildPartsRowArgs, type PartStatus } from "./partsStatus";
import { stripPartsCostFields, type NotifiedMethod } from "./partsCost";

export * from "./partsStatus";
export * from "./partsCost";


/** Inserts exactly one parts request. One request = one part, end to end. */
export const insertPartsRequest = async (args: BuildPartsRowArgs) => {
  const row = buildPartsRequestRow(args);
  if (!row) return { error: null, inserted: false };
  const { error } = await supabase.from("parts_requests" as any).insert(row as any);
  return { error, inserted: !error };
};

/** Advances a single part line and stamps the matching timestamp. */
export const updatePartStatus = async (id: string, status: PartStatus) => {
  const patch: Record<string, any> = { status };
  if (status === "Ordered") patch.ordered_at = new Date().toISOString();
  if (status === "Ready to Fit") patch.ready_at = new Date().toISOString();
  if (status === "Cancelled") {
    patch.cancelled_at = new Date().toISOString();
    // The notification trigger resolves the display name from cancelled_by —
    // without it the office fan-out reads "cancelled by Unknown user".
    const { data } = await supabase.auth.getUser();
    patch.cancelled_by = data?.user?.id ?? null;
  }
  const { error } = await supabase.from("parts_requests" as any).update(patch).eq("id", id);
  return { error };
};

/**
 * BJ-0071 / BJ-0072 — office-only tracking fields.
 *
 * The DB trigger protect_parts_request_office_fields rejects these writes for
 * non-office actors, so a failure here surfaces as a real error rather than a
 * silent no-op. Cost is SUPPLIER cost: stripPartsCostFields guarantees none of
 * it can ride along into a service_calls/pricing patch — parts tracking must
 * never change what a customer is charged.
 */
export const updatePartsOfficeFields = async (
  id: string,
  fields: {
    quoted_cost?: number | null;
    actual_cost?: number | null;
    expected_delivery_date?: string | null;
    quote_reference?: string | null;
  },
) => {
  const patch: Record<string, any> = {};
  if ("quoted_cost" in fields) patch.quoted_cost = fields.quoted_cost ?? null;
  if ("actual_cost" in fields) patch.actual_cost = fields.actual_cost ?? null;
  if ("expected_delivery_date" in fields)
    patch.expected_delivery_date = fields.expected_delivery_date || null;
  if ("quote_reference" in fields) patch.quote_reference = fields.quote_reference?.trim() || null;
  if (Object.keys(patch).length === 0) return { error: null };

  const { error } = await supabase.from("parts_requests" as any).update(patch).eq("id", id);
  return { error };
};

/** Stamps that the customer was told about this part. Office-only (DB trigger). */
export const markCustomerNotified = async (id: string, method: NotifiedMethod) => {
  const { data } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("parts_requests" as any)
    .update({
      customer_notified_at: new Date().toISOString(),
      customer_notified_by: data?.user?.id ?? null,
      customer_notified_method: method,
    })
    .eq("id", id);
  return { error };
};

/**
 * Guard for any patch heading to service_calls from a parts flow. Re-exported
 * here so callers can't forget it exists — see the hard rule in partsCost.ts.
 */
export const sanitizePartsServiceCallPatch = stripPartsCostFields;

/** Comment log for one parts request. */
export const listPartComments = async (partsRequestId: string) => {
  const { data, error } = await supabase
    .from("parts_request_comments" as any)
    .select("*")
    .eq("parts_request_id", partsRequestId)
    .order("created_at", { ascending: true });
  return { comments: (data as any[]) || [], error };
};

export const addPartComment = async (args: {
  partsRequestId: string;
  organisationId: string;
  body: string;
  authorName?: string | null;
  authorRole?: string | null;
}) => {
  const body = args.body.trim();
  if (!body) return { error: null, inserted: false };
  const { data } = await supabase.auth.getUser();
  const { error } = await supabase.from("parts_request_comments" as any).insert({
    parts_request_id: args.partsRequestId,
    organisation_id: args.organisationId,
    body,
    // RLS requires author_id = auth.uid() on insert.
    author_id: data?.user?.id ?? null,
    author_name: args.authorName ?? null,
    author_role: args.authorRole ?? null,
  } as any);
  return { error, inserted: !error };
};

export const deletePartComment = async (id: string) => {
  const { error } = await supabase.from("parts_request_comments" as any).delete().eq("id", id);
  return { error };
};


