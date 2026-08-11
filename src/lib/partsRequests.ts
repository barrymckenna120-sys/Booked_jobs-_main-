import { supabase } from "@/integrations/supabase/client";
import { buildPartsRequestRows, type BuildPartsRowsArgs, type PartStatus } from "./partsStatus";

export * from "./partsStatus";

export const insertPartsRequests = async (args: BuildPartsRowsArgs) => {
  const rows = buildPartsRequestRows(args);
  if (rows.length === 0) return { error: null, count: 0 };
  const { error } = await supabase.from("parts_requests" as any).insert(rows as any);
  return { error, count: rows.length };
};

/** Advances a single part line and stamps the matching timestamp. */
export const updatePartStatus = async (id: string, status: PartStatus) => {
  const patch: Record<string, any> = { status };
  if (status === "Ordered") patch.ordered_at = new Date().toISOString();
  if (status === "Ready to Fit") patch.ready_at = new Date().toISOString();
  if (status === "Cancelled") patch.cancelled_at = new Date().toISOString();
  const { error } = await supabase.from("parts_requests" as any).update(patch).eq("id", id);
  return { error };
};
