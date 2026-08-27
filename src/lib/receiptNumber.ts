import { supabase } from "@/integrations/supabase/client";

/**
 * Formats a receipt reference from an org prefix.
 * Kept pure so both payment paths (Complete and standalone Take Payment) mint
 * identical-looking references.
 */
export function formatReceiptNumber(prefix: string | null | undefined, year: number, seq: number): string {
  const p = (prefix || "").trim() || "R";
  return `${p}-${year}-${String(seq).padStart(4, "0")}`;
}

/**
 * Mints a receipt reference for an organisation using its `cert_prefix`.
 * Returns null when no org id is available, so callers can skip the field
 * rather than write a wrong-prefix reference.
 */
export async function mintReceiptNumber(orgId: string | null | undefined): Promise<string | null> {
  if (!orgId) return null;
  try {
    const { data } = await supabase
      .from("settings")
      .select("cert_prefix")
      .eq("organisation_id", orgId)
      .maybeSingle();
    const seq = Math.floor(Math.random() * 9999) + 1;
    return formatReceiptNumber((data as any)?.cert_prefix, new Date().getFullYear(), seq);
  } catch {
    return null;
  }
}
