import { supabase } from "@/integrations/supabase/client";
import { buildPartsRequestRow, type BuildPartsRowArgs, type PartStatus } from "./partsStatus";

export * from "./partsStatus";

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
  if (status === "Cancelled") patch.cancelled_at = new Date().toISOString();
  const { error } = await supabase.from("parts_requests" as any).update(patch).eq("id", id);
  return { error };
};
