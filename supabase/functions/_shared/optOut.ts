/**
 * Shared opt-out guard for automated (non-transactional) WhatsApp sends.
 *
 * `customers.opted_out` is set when a customer replies STOP (or staff toggle it
 * on the customer profile). Marketing / reminder-style automations MUST respect
 * it. Transactional sends (receipts, certificates, payment links the customer
 * asked for) are intentionally NOT gated by this helper.
 */

export type OptOutCandidate = {
  opted_out?: boolean | null;
  phone?: string | null;
} | null | undefined;

export type OptOutDecision =
  | { skip: false }
  | { skip: true; reason: "customer_not_found" | "customer_opted_out" | "no_phone_number" };

/**
 * Pure decision function — no I/O, so it is directly unit-testable.
 * Fails closed: a missing customer row is skipped rather than messaged.
 */
export function evaluateOptOut(customer: OptOutCandidate): OptOutDecision {
  if (!customer) return { skip: true, reason: "customer_not_found" };
  if (customer.opted_out === true) return { skip: true, reason: "customer_opted_out" };
  if (!customer.phone || String(customer.phone).trim() === "") {
    return { skip: true, reason: "no_phone_number" };
  }
  return { skip: false };
}

/** Convenience wrapper when only the flag matters (phone comes from the request). */
export function isOptedOut(customer: OptOutCandidate): boolean {
  if (!customer) return true;
  return customer.opted_out === true;
}

/**
 * Fetches the customer's opt-out flag via the REST API and returns the decision.
 * Fails closed on lookup errors.
 */
export async function fetchOptOutDecision(
  supabaseUrl: string,
  serviceRoleKey: string,
  customerId: string,
): Promise<OptOutDecision> {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/customers?id=eq.${customerId}&select=opted_out,phone&limit=1`,
      { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } },
    );
    const rows = await res.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    return evaluateOptOut(row);
  } catch (_e) {
    return { skip: true, reason: "customer_not_found" };
  }
}
