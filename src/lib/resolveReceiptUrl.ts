import { supabase } from "@/integrations/supabase/client";

/**
 * Mints a short-lived signed URL for a job's receipt PDF.
 *
 * `service_calls.receipt_pdf_url` stores a raw storage path (e.g.
 * `<org_id>/receipt-KN-2026-2325.pdf`), which is not directly openable.
 * The `resolve-document-link` edge function looks the row up by its
 * unguessable `access_token` (resolving organisation_id server-side) and
 * returns a signed Storage URL valid for 1 hour.
 *
 * Returns null when the token is missing or the document cannot be resolved,
 * so callers can fall back to the in-app receipt view.
 */
export async function resolveReceiptUrl(accessToken: string | null | undefined): Promise<string | null> {
  if (!accessToken) return null;
  try {
    const { data, error } = await supabase.functions.invoke("resolve-document-link", {
      body: { type: "receipt", token: accessToken },
    });
    if (error) return null;
    const signed = (data as any)?.signed_url;
    return typeof signed === "string" && signed ? signed : null;
  } catch {
    return null;
  }
}
