import { supabase } from "@/integrations/supabase/client";

/**
 * Copy a certificate's GPRN onto the customer record — but only when the
 * customer has no GPRN on file yet.
 *
 * The `.or("gprn.is.null,gprn.eq.")` filter performs the "only if empty" test
 * in the database, so there is no read-then-write race and no path that can
 * overwrite an existing value. If the customer already has a GPRN and the
 * engineer entered a different one on the certificate, the mismatch is left
 * in place for a human to notice.
 *
 * Non-blocking: never throws, never affects the certificate save.
 */
export async function backfillCustomerGprn(customerId?: string, gprn?: string) {
  const value = (gprn || "").trim();
  if (!customerId || !value) return;

  try {
    const { error } = await supabase
      .from("customers")
      .update({ gprn: value })
      .eq("id", customerId)
      .or("gprn.is.null,gprn.eq.");

    if (error) console.error("GPRN back-fill failed:", error.message);
  } catch (_e) {
    // swallow — a failed back-fill must never break the certificate save
  }
}
