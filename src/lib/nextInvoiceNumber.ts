import { supabase } from "@/integrations/supabase/client";

/**
 * Generate the next per-organisation invoice number (INV-YYYY-NNNN).
 * Uses a SECURITY DEFINER Postgres RPC that takes a per-org advisory lock
 * and computes MAX(invoice_number) + 1 scoped to the organisation.
 */
export const nextInvoiceNumber = async (organisationId: string | null | undefined): Promise<string | null> => {
  if (!organisationId) return null;
  try {
    const { data, error } = await supabase.rpc("next_org_invoice_number", { p_org_id: organisationId });
    if (error) {
      console.error("[nextInvoiceNumber] rpc error", error);
      return null;
    }
    return (data as string) || null;
  } catch (e) {
    console.error("[nextInvoiceNumber] threw", e);
    return null;
  }
};
