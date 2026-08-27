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

export type ConsentCustomerRow = {
  id?: string | null;
  name?: string | null;
  phone?: string | null;
  whatsapp_phone?: string | null;
  opted_out?: boolean | null;
  organisation_id?: string | null;
} | null | undefined;

export type ConsentSkipReason =
  | "customer_not_found"
  | "customer_wrong_organisation"
  | "customer_opted_out"
  | "no_phone_number";

export type ConsentDecision =
  | {
    allowed: true;
    customerId: string;
    name: string | null;
    /** DB-stored recipient. Callers MUST use this, not a body-supplied number. */
    phone: string;
  }
  | { allowed: false; reason: ConsentSkipReason };

/**
 * Pure consent decision. `orgId` is the organisation the send is being performed
 * for (already proven to belong to the caller by requireResourceOrgAccess etc).
 */
export function evaluateConsent(
  customer: ConsentCustomerRow,
  orgId: string | null | undefined,
): ConsentDecision {
  if (!customer || !customer.id) return { allowed: false, reason: "customer_not_found" };
  if (
    orgId && customer.organisation_id &&
    String(customer.organisation_id) !== String(orgId)
  ) {
    return { allowed: false, reason: "customer_wrong_organisation" };
  }
  if (customer.opted_out === true) return { allowed: false, reason: "customer_opted_out" };

  const phone = String(customer.phone ?? customer.whatsapp_phone ?? "").trim();
  if (!phone) return { allowed: false, reason: "no_phone_number" };

  return {
    allowed: true,
    customerId: String(customer.id),
    name: customer.name ?? null,
    phone,
  };
}

/** Human-safe (PII-free) skip note for logs and responses. */
export function skipMessage(reason: ConsentSkipReason): string {
  switch (reason) {
    case "customer_opted_out":
      return "Customer has opted out of messages — send skipped";
    case "no_phone_number":
      return "Customer has no stored phone number — send skipped";
    case "customer_wrong_organisation":
      return "Customer does not belong to the acting organisation — send denied";
    default:
      return "Customer not found — send skipped";
  }
}

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * Load the customer server-side (scoped to `orgId`) and decide whether an
 * outbound customer message is permitted. Lookup failures fail closed.
 */
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
    const { data } = await supabase
      .from("customers")
      .select("id, name, phone, whatsapp_phone, opted_out, organisation_id")
      .eq("id", customerId)
      .maybeSingle();
    decision = evaluateConsent(data as ConsentCustomerRow, orgId);
  } catch (_e) {
    decision = { allowed: false, reason: "customer_not_found" };
  }

  if (!decision.allowed && opts.log !== false) {
    console.warn(`${fnName}: consent gate blocked send — ${decision.reason}`);
    try {
      await supabase.from("edge_function_logs").insert({
        function_name: fnName,
        error_message: `Send skipped: ${decision.reason}`,
        payload: {
          organisation_id: orgId,
          customer_id: customerId,
          reason: decision.reason,
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
  return new Response(
    JSON.stringify(
      forbidden ? { success: false, error: "Forbidden" } : consentSkipBody(reason),
    ),
    {
      status: forbidden ? 403 : 200,
      headers: { ...cors, "Content-Type": "application/json" },
    },
  );
}
