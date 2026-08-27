// Pure consent decision logic — deliberately free of Deno/npm imports so it is
// unit-testable from the app test runner. I/O lives in messagingConsent.ts.

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

