/**
 * Delivery of the org-level payment bell alerts (collected + failed).
 *
 * These were inline closures inside sumup-payment-webhook/index.ts, which meant
 * the parts most likely to break — the checkout-keyed dedupe read, the active
 * profile lookup, and the notifications insert — had no test coverage at all;
 * only the pure tiering in alertRecipients.ts was tested. Extracted here so the
 * whole path can be exercised against a fake client.
 *
 * Behaviour is a verbatim lift: same reads, same tiering, same copy, same logs,
 * same swallow-everything error handling (an alert must never fail a payment or
 * make SumUp retry).
 */
import { buildPaymentAlert } from "./paymentAlertMessage.ts";
import { type AlertProfileRow, resolveAlertRecipients } from "./alertRecipients.ts";

/** Minimal shape of the parts of the Supabase client these functions touch. */
// deno-lint-ignore no-explicit-any
export type AlertDbClient = { from: (table: string) => any };

/** Stamps the resolved SumUp status onto the attempt row(s) for this checkout. */
export type RecordAttemptStatus = (checkoutId: string, resolvedStatus: string) => Promise<void>;

export interface PaymentCollectedEvent {
  organisationId: string | null;
  serviceCallId: string;
  customerId: string | null;
  jobReference: string | null;
  amount: number;
  fullyPaid: boolean;
  outstanding: number;
  checkoutId: string;
  status: string;
}

export interface PaymentFailedEvent {
  organisationId: string | null;
  serviceCallId: string;
  customerId: string | null;
  jobReference: string | null;
  checkoutId: string;
  status: string;
  amount: number | null;
}

interface Args<E> {
  supabase: AlertDbClient;
  event: E;
  recordAttemptStatus: RecordAttemptStatus;
}

/** Active profiles for the org, or null when the lookup itself failed. */
async function loadActiveStaff(
  supabase: AlertDbClient,
  organisationId: string,
): Promise<{ staff: AlertProfileRow[] } | { error: string }> {
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, role, is_active, receives_ops_notifications")
    .eq("organisation_id", organisationId)
    .eq("is_active", true);
  if (error) return { error: error.message };
  return { staff: (data ?? []) as AlertProfileRow[] };
}

async function loadCustomerName(
  supabase: AlertDbClient,
  customerId: string | null,
): Promise<string | null> {
  if (!customerId) return null;
  const { data } = await supabase
    .from("customers")
    .select("name")
    .eq("id", customerId)
    .maybeSingle();
  return data?.name ?? null;
}

/**
 * Office/admin users of the owning org get a bell notification, matching the
 * recipient rule used by the quote-accepted alert.
 */
export async function deliverPaymentAlert(
  { supabase, event: e, recordAttemptStatus }: Args<PaymentCollectedEvent>,
): Promise<void> {
  try {
    if (!e.organisationId) return;

    // Own idempotency layer, keyed on the CHECKOUT — same pattern as
    // deliverPaymentFailedAlert below. The upstream event claim is the primary
    // guard, but it deliberately lets a delivery through on an unknown DB error
    // rather than risk dropping a real payment; without this read that fallback
    // can double-alert the office. A second, genuinely different checkout on the
    // same job is a separate payment and still alerts.
    const { data: existing, error: dupErr } = await supabase
      .from("notifications")
      .select("id")
      .eq("job_id", e.serviceCallId)
      .eq("notification_type", "payment_collected")
      .eq("metadata->>checkout_id", e.checkoutId)
      .limit(1);
    if (dupErr) {
      console.error("sumup-payment-webhook: payment-alert dedupe read failed", dupErr.message);
      return;
    }
    if ((existing ?? []).length > 0) {
      console.log(`sumup-payment-webhook: payment alert already sent for checkout ${e.checkoutId}`);
      await recordAttemptStatus(e.checkoutId, e.status);
      return;
    }

    // All active profiles for the org — the tiering (office/admin, then
    // ops-flagged, then superadmin) happens in resolveAlertRecipients so an org
    // without an office user still gets its payment alerts.
    const loaded = await loadActiveStaff(supabase, e.organisationId);
    if ("error" in loaded) {
      console.error("sumup-payment-webhook: staff lookup failed", loaded.error);
      return;
    }

    const { recipients, tier } = resolveAlertRecipients(loaded.staff);
    if (recipients.length === 0) {
      // Never silent: an org with nobody to alert is a configuration problem
      // that used to look like a lost notification.
      console.error(
        `PAYMENT_ALERT_NO_RECIPIENTS kind=payment_collected job_id=${e.serviceCallId} checkout_id=${e.checkoutId} org=${e.organisationId}`,
      );
      return;
    }
    if (tier !== "office") {
      console.log(
        `sumup-payment-webhook: no office/admin for org ${e.organisationId} — payment alert routed to ${tier}`,
      );
    }

    const customerName = await loadCustomerName(supabase, e.customerId);

    const ref = e.jobReference ?? e.serviceCallId.slice(0, 8);
    const alert = buildPaymentAlert({
      amount: e.amount,
      fullyPaid: e.fullyPaid,
      jobReference: e.jobReference,
      fallbackReference: e.serviceCallId.slice(0, 8),
      customerName,
      outstanding: e.outstanding,
    });

    await supabase.from("notifications").insert(
      recipients.map((userId) => ({
        recipient_user_id: userId,
        organisation_id: e.organisationId,
        job_id: e.serviceCallId,
        notification_type: "payment_collected",
        role: "office",
        // checkout_id makes each alert traceable to the exact card attempt and
        // is what the dedupe read above matches on.
        title: alert.title,
        body: alert.body,
        metadata: {
          source: "sumup",
          amount: e.amount,
          fully_paid: e.fullyPaid,
          outstanding: e.outstanding,
          checkout_id: e.checkoutId,
          job_ref: ref,
        },
      })),
    );

    await recordAttemptStatus(e.checkoutId, e.status);
  } catch (_e) {
    console.error("sumup-payment-webhook: notification insert failed", _e);
  }
}

/**
 * A declined/expired/cancelled checkout: same office/admin recipients as a
 * confirmed payment, but flagged as a failure so the link can be reissued.
 */
export async function deliverPaymentFailedAlert(
  { supabase, event: e, recordAttemptStatus }: Args<PaymentFailedEvent>,
): Promise<void> {
  try {
    if (!e.organisationId) return;

    // Terminal status is final for this checkout — record it even if the alert
    // itself is deduped away below.
    await recordAttemptStatus(e.checkoutId, e.status);

    // SumUp delivers the same failure event more than once. One alert per
    // checkout only; if the dedupe read fails we skip rather than duplicate.
    const { data: existing, error: dupErr } = await supabase
      .from("notifications")
      .select("id")
      .eq("job_id", e.serviceCallId)
      .eq("notification_type", "payment_failed")
      .eq("metadata->>checkout_id", e.checkoutId)
      .limit(1);
    if (dupErr) {
      console.error("sumup-payment-webhook: failure-alert dedupe read failed", dupErr.message);
      return;
    }
    if ((existing ?? []).length > 0) {
      console.log(`sumup-payment-webhook: failure alert already sent for checkout ${e.checkoutId}`);
      return;
    }

    // All active profiles for the org — the tiering (office/admin, then
    // ops-flagged, then superadmin) happens in resolveAlertRecipients so an org
    // without an office user still gets its payment alerts.
    const loaded = await loadActiveStaff(supabase, e.organisationId);
    if ("error" in loaded) {
      console.error("sumup-payment-webhook: staff lookup failed", loaded.error);
      return;
    }

    const { recipients, tier } = resolveAlertRecipients(loaded.staff);
    if (recipients.length === 0) {
      // Never silent: an org with nobody to alert is a configuration problem
      // that used to look like a lost notification.
      console.error(
        `PAYMENT_ALERT_NO_RECIPIENTS kind=payment_failed job_id=${e.serviceCallId} checkout_id=${e.checkoutId} org=${e.organisationId}`,
      );
      return;
    }
    if (tier !== "office") {
      console.log(
        `sumup-payment-webhook: no office/admin for org ${e.organisationId} — payment alert routed to ${tier}`,
      );
    }

    const ref = e.jobReference ?? e.serviceCallId.slice(0, 8);
    const customerName = await loadCustomerName(supabase, e.customerId);

    const amountText = e.amount && e.amount > 0 ? `€${e.amount.toFixed(2)} ` : "";
    const reason = e.status === "EXPIRED"
      ? "the payment link expired"
      : e.status === "CANCELLED" || e.status === "CANCELED"
      ? "the customer cancelled the payment"
      : "the card payment was declined";

    const { error: insErr } = await supabase.from("notifications").insert(
      recipients.map((userId) => ({
        recipient_user_id: userId,
        organisation_id: e.organisationId,
        job_id: e.serviceCallId,
        role: "office",
        notification_type: "payment_failed",
        title: `Payment failed — ${ref}`,
        body: `${amountText}card payment on ${ref}${
          customerName ? ` for ${customerName}` : ""
        } did not go through — ${reason}. That payment link no longer works; send a new one.`,
        metadata: {
          source: "sumup",
          checkout_id: e.checkoutId,
          status: e.status,
          amount: e.amount,
        },
      })),
    );

    // SumUp delivers the same failure twice within ~100ms, so the read above
    // can't win the race — the unique index is the real guard. A 23505 here
    // means the other delivery already alerted, which is the correct outcome.
    if (insErr) {
      if (insErr.code === "23505") {
        console.log(
          `sumup-payment-webhook: failure alert already sent for checkout ${e.checkoutId} (raced)`,
        );
      } else {
        console.error("sumup-payment-webhook: failure alert insert failed", insErr.message);
      }
      return;
    }
    console.log(`sumup-payment-webhook: failure alert sent for ${ref} (${e.status})`);
  } catch (_e) {
    console.error("sumup-payment-webhook: failure alert insert failed", _e);
  }
}
