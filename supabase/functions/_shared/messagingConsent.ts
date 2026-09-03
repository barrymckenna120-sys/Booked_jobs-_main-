// Shared, mandatory consent gate for ALL customer-facing outbound messaging
// (WhatsApp / SMS / email) sent from Edge Functions.
//
// Why this exists: several send functions used to take `customer_phone` straight
// from the request body and message it, which meant (a) `customers.opted_out`
// could be bypassed entirely and (b) a caller could message an arbitrary number
// through a tenant's WhatsApp account.
//
// Rules enforced here — fail closed at every step:
//   1. The customer row is loaded server-side, scoped to the acting organisation.
//   2. `opted_out = true` => never send (returned as a non-error "skipped").
//   3. The recipient number ALWAYS comes from the DB row, never from the body.
//   4. A customer belonging to another tenant is treated as not found.
//
// Pure decision logic lives in `evaluateConsent` so it is unit-testable.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  type ConsentCustomerRow,
  type ConsentDecision,
  type ConsentSkipReason,
  evaluateConsent,
  skipMessage,
} from "./consentDecision.ts";

export type { ConsentCustomerRow, ConsentSkipReason, ConsentDecision } from "./consentDecision.ts";
export { evaluateConsent } from "./consentDecision.ts";

/** Deno-only service client — kept here so consentDecision.ts stays pure. */
function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function requireCustomerMessagingConsent(opts: {
  fnName: string;
  orgId: string;
  customerId: string | null | undefined;
  /** Set false to skip the best-effort skip log (e.g. very chatty functions). */
  log?: boolean;
}): Promise<ConsentDecision> {
  const { fnName, orgId, customerId } = opts;
  if (!customerId) return { allowed: false, reason: "customer_not_found" };

  const supabase = serviceClient();
  let decision: ConsentDecision;
  try {
    const { data, error } = await supabase
      .from("customers")
      .select("id, name, phone, whatsapp_phone, opted_out, organisation_id")
      .eq("id", customerId)
      .maybeSingle();
    // A failed read is not a missing customer: surface it instead of skipping.
    if (error) throw new Error(error.message);
    decision = evaluateConsent(data as ConsentCustomerRow, orgId);
  } catch (_e) {
    console.error(`${fnName}: customer lookup failed`, _e);
    decision = { allowed: false, reason: "lookup_failed" };
  }

  if (decision.allowed) return decision;

  const blocked = decision;
  if (opts.log !== false) {
    console.warn(`${fnName}: consent gate blocked send — ${blocked.reason}`);
    try {
      await supabase.from("edge_function_logs").insert({
        function_name: fnName,
        error_message: `Send skipped: ${blocked.reason}`,
        payload: {
          organisation_id: orgId,
          customer_id: customerId,
          reason: blocked.reason,
          skipped: true,
        },
      });
    } catch { /* best-effort */ }
  }

  return decision;
}

/** Standard non-error "skipped" JSON body for a blocked send. */
export function consentSkipBody(reason: ConsentSkipReason) {
  return {
    success: true,
    skipped: true,
    reason,
    message: skipMessage(reason),
  };
}

/** Convenience: 200 skipped response (403 for a cross-tenant customer). */
export function consentSkipResponse(
  reason: ConsentSkipReason,
  cors: Record<string, string>,
): Response {
  const forbidden = reason === "customer_wrong_organisation";
  // A genuine lookup failure is an error, never a successful "skipped".
  const lookupFailed = reason === "lookup_failed";
  return new Response(
    JSON.stringify(
      forbidden
        ? { success: false, error: "Forbidden" }
        : lookupFailed
        ? { success: false, error: "lookup_failed" }
        : consentSkipBody(reason),
    ),
    {
      status: forbidden ? 403 : lookupFailed ? 503 : 200,
      headers: { ...cors, "Content-Type": "application/json" },
    },
  );
}
