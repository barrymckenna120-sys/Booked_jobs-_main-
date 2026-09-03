/**
 * Shared customer-communication delivery tracking.
 *
 * One source of truth for the Office App badges, the Office Manager failure
 * alert and the Admin Panel failure log:
 *
 *   communication_deliveries          — current state per logical communication
 *   communication_delivery_attempts   — append-only history of every attempt
 *
 * Rules baked in here so no send path has to remember them:
 *  - organisation_id is always supplied by server code, never by the client.
 *  - a status is only ever written from a real send result (never "UI ok").
 *  - opted_out is a distinct, non-failure state and never raises an alert.
 *  - raw provider errors live only on the attempt row (support/admin only);
 *    the office-facing reason is the human-readable mapping.
 *  - nothing in here throws: tracking must never break a working send.
 */

import { humanFailureReason } from "./deliveryReason.ts";

export type BeginDeliveryInput = {
  organisationId: string;
  customerId?: string | null;
  commType: string;
  channel: string;
  relatedType?: string | null;
  relatedId?: string | null;
  relatedReference?: string | null;
  recipient?: string | null;
  triggerSource?: "initial" | "resend" | "cron" | "webhook";
  triggeredBy?: string | null;
};

export type DeliveryHandle = {
  deliveryId: string;
  attemptId: string;
  attemptNumber: number;
} | null;

/** Another attempt started within this window is treated as a duplicate tap. */
const IN_FLIGHT_WINDOW_MS = 60_000;

export class DeliveryBusyError extends Error {
  constructor() {
    super("A send for this communication is already in progress");
    this.name = "DeliveryBusyError";
  }
}

/**
 * A tracking lookup genuinely FAILED (connection/permission/malformed query).
 * Distinct from "no row found", which stays a legitimate, non-error outcome.
 * Callers must not treat this as "not applicable" — see whatsapp-delivery-webhook.
 */
export class DeliveryLookupError extends Error {
  constructor(where: string, detail?: string | null) {
    super(`delivery lookup failed (${where})${detail ? `: ${detail}` : ""}`);
    this.name = "DeliveryLookupError";
  }
}

export const isDeliveryLookupError = (e: unknown): e is DeliveryLookupError =>
  !!e && (e as { name?: string }).name === "DeliveryLookupError";

async function findDelivery(supabase: any, input: BeginDeliveryInput) {
  if (!input.relatedId) return null;
  const { data, error } = await supabase
    .from("communication_deliveries")
    .select("id, attempt_count, in_flight, in_flight_at")
    .eq("organisation_id", input.organisationId)
    .eq("comm_type", input.commType)
    .eq("channel", input.channel)
    .eq("related_id", input.relatedId)
    .maybeSingle();
  // A failed read is NOT an absent row: never let it look like "no delivery yet".
  if (error) throw new DeliveryLookupError("communication_deliveries", error.message);
  return data ?? null;
}


/**
 * Open (or reopen) a delivery record and log a `pending` attempt.
 * Returns null if tracking could not be written — callers still send.
 * Throws DeliveryBusyError when an attempt is already in flight.
 */
export async function beginDelivery(
  supabase: any,
  input: BeginDeliveryInput,
): Promise<DeliveryHandle> {
  try {
    if (!input.organisationId) return null;
    const now = new Date().toISOString();
    const existing = await findDelivery(supabase, input);

    if (
      existing?.in_flight &&
      existing.in_flight_at &&
      Date.now() - new Date(existing.in_flight_at).getTime() < IN_FLIGHT_WINDOW_MS
    ) {
      throw new DeliveryBusyError();
    }

    let deliveryId: string | null = existing?.id ?? null;
    let attemptNumber = (existing?.attempt_count ?? 0) + 1;

    const base = {
      organisation_id: input.organisationId,
      customer_id: input.customerId ?? null,
      comm_type: input.commType,
      channel: input.channel,
      related_type: input.relatedType ?? null,
      related_id: input.relatedId ?? null,
      related_reference: input.relatedReference ?? null,
      recipient: input.recipient ?? null,
      delivery_status: "pending",
      attempt_count: attemptNumber,
      last_attempt_at: now,
      in_flight: true,
      in_flight_at: now,
    };

    if (deliveryId) {
      await supabase
        .from("communication_deliveries")
        .update(base)
        .eq("id", deliveryId);
    } else {
      const { data, error } = await supabase
        .from("communication_deliveries")
        .insert({ ...base, first_attempt_at: now })
        .select("id")
        .single();
      if (error || !data) {
        // Lost an insert race — re-read and continue on the winner's row.
        const again = await findDelivery(supabase, input);
        if (!again) return null;
        deliveryId = again.id;
        attemptNumber = (again.attempt_count ?? 0) + 1;
      } else {
        deliveryId = data.id;
      }
    }

    const { data: attempt, error: attemptErr } = await supabase
      .from("communication_delivery_attempts")
      .insert({
        delivery_id: deliveryId,
        organisation_id: input.organisationId,
        attempt_number: attemptNumber,
        outcome: "pending",
        recipient: input.recipient ?? null,
        attempted_at: now,
        trigger_source: input.triggerSource ?? "initial",
        triggered_by: input.triggeredBy ?? null,
      })
      .select("id")
      .single();

    if (attemptErr || !attempt) return null;
    return { deliveryId: deliveryId as string, attemptId: attempt.id, attemptNumber };
  } catch (e) {
    if (e instanceof DeliveryBusyError) throw e;
    console.error("beginDelivery failed", e);
    return null;
  }
}

export type CompleteDeliveryInput = {
  handle: DeliveryHandle;
  channel: string;
  ok: boolean;
  providerError?: string | null;
  providerMessageId?: string | null;
  providerStatus?: string | null;
  recipient?: string | null;
};

/**
 * How long we wait for a provider delivery confirmation before the office is
 * told the delivery is unconfirmed. NOT a failure — see recordUnconfirmed().
 */
export const CONFIRMATION_WINDOW_MS = 6 * 60 * 60 * 1000;

/**
 * Record the ACTUAL result of a send attempt.
 *
 * A successful API call means the provider ACCEPTED/queued the request — it is
 * never proof of delivery, so it is recorded as `accepted`, never `sent` and
 * never `delivered`. Only a provider callback may promote it to `delivered`
 * (recordDelivered) or demote it to `failed` (recordProviderFailure).
 */
export async function completeDelivery(
  supabase: any,
  input: CompleteDeliveryInput,
): Promise<{ status: "accepted" | "failed"; reason: string | null }> {
  const status = input.ok ? "accepted" : "failed";
  const reason = input.ok
    ? null
    : humanFailureReason(input.providerError, input.channel);

  if (!input.handle) return { status, reason };

  try {
    const now = new Date().toISOString();
    const dueAt = new Date(Date.now() + CONFIRMATION_WINDOW_MS).toISOString();

    await supabase
      .from("communication_delivery_attempts")
      .update({
        outcome: status,
        completed_at: now,
        accepted_at: input.ok ? now : null,
        failure_reason_public: reason,
        provider_error: input.providerError
          ? String(input.providerError).slice(0, 2000)
          : null,
        provider_message_id: input.providerMessageId ?? null,
        provider_status: input.providerStatus ?? null,
        recipient: input.recipient ?? undefined,
      })
      .eq("id", input.handle.attemptId);

    await supabase
      .from("communication_deliveries")
      .update({
        delivery_status: status,
        failure_reason_public: reason,
        last_attempt_at: now,
        accepted_at: input.ok ? now : undefined,
        confirmation_due_at: input.ok ? dueAt : null,
        provider_status: input.providerStatus ?? null,
        // delivered_at is only ever written by a real provider confirmation.
        resolved_at: input.ok ? now : null,
        in_flight: false,
        in_flight_at: null,
        ...(input.recipient ? { recipient: input.recipient } : {}),
      })
      .eq("id", input.handle.deliveryId);

    if (!input.ok) {
      await queueFailureAlert(supabase, input.handle.attemptId);
    }
  } catch (e) {
    console.error("completeDelivery failed", e);
  }

  return { status, reason };
}

/**
 * Provider confirmed the message reached the customer. Matched by provider
 * message id, which is unique across all tenants, so a callback can never
 * touch another tenant's row. Idempotent: a repeat callback changes nothing.
 */
export async function recordDelivered(
  supabase: any,
  providerMessageId: string,
  providerStatus?: string | null,
): Promise<{ matched: boolean; changed: boolean }> {
  const { data: attempt } = await supabase
    .from("communication_delivery_attempts")
    .select("id, delivery_id, organisation_id, delivered_at")
    .eq("provider_message_id", providerMessageId)
    .maybeSingle();

  if (!attempt) return { matched: false, changed: false };
  if (attempt.delivered_at) return { matched: true, changed: false };

  const now = new Date().toISOString();

  await supabase
    .from("communication_delivery_attempts")
    .update({
      outcome: "delivered",
      delivered_at: now,
      provider_status: providerStatus ?? null,
      failure_reason_public: null,
    })
    .eq("id", attempt.id);

  await supabase
    .from("communication_deliveries")
    .update({
      delivery_status: "delivered",
      delivered_at: now,
      failure_reason_public: null,
      provider_status: providerStatus ?? null,
      confirmation_due_at: null,
      resolved_at: now,
      in_flight: false,
      in_flight_at: null,
    })
    .eq("id", attempt.delivery_id)
    .eq("organisation_id", attempt.organisation_id);

  return { matched: true, changed: true };
}

/**
 * Provider explicitly reported the message failed. This is the only path that
 * may write `failed` after acceptance. Idempotent per attempt.
 */
export async function recordProviderFailure(
  supabase: any,
  providerMessageId: string,
  providerError: string,
  channel = "whatsapp",
  providerStatus?: string | null,
): Promise<{ matched: boolean; changed: boolean }> {
  const { data: attempt } = await supabase
    .from("communication_delivery_attempts")
    .select("id, delivery_id, organisation_id, outcome, delivered_at")
    .eq("provider_message_id", providerMessageId)
    .maybeSingle();

  if (!attempt) return { matched: false, changed: false };
  // Never contradict a confirmed delivery, and never re-alert on the same attempt.
  if (attempt.delivered_at || attempt.outcome === "failed") {
    return { matched: true, changed: false };
  }

  const now = new Date().toISOString();
  const reason = humanFailureReason(providerError, channel);

  await supabase
    .from("communication_delivery_attempts")
    .update({
      outcome: "failed",
      completed_at: now,
      failure_reason_public: reason,
      provider_error: String(providerError).slice(0, 2000),
      provider_status: providerStatus ?? null,
    })
    .eq("id", attempt.id);

  await supabase
    .from("communication_deliveries")
    .update({
      delivery_status: "failed",
      failure_reason_public: reason,
      provider_status: providerStatus ?? null,
      confirmation_due_at: null,
      resolved_at: null,
      in_flight: false,
      in_flight_at: null,
    })
    .eq("id", attempt.delivery_id)
    .eq("organisation_id", attempt.organisation_id);

  await queueFailureAlert(supabase, attempt.id);

  return { matched: true, changed: true };
}


/** Intentional suppression: not a failure, never alerts. */
export async function markOptedOut(
  supabase: any,
  input: BeginDeliveryInput & { reason?: string },
): Promise<void> {
  try {
    const handle = await beginDelivery(supabase, input);
    const now = new Date().toISOString();
    const reason =
      input.reason ??
      (input.commType === "service_reminder"
        ? "Reminder not sent – customer opted out"
        : "Not sent – customer opted out");

    if (handle) {
      await supabase
        .from("communication_delivery_attempts")
        .update({ outcome: "opted_out", completed_at: now, failure_reason_public: reason })
        .eq("id", handle.attemptId);

      await supabase
        .from("communication_deliveries")
        .update({
          delivery_status: "opted_out",
          failure_reason_public: reason,
          last_attempt_at: now,
          in_flight: false,
          in_flight_at: null,
        })
        .eq("id", handle.deliveryId);
    }
  } catch (e) {
    console.error("markOptedOut failed", e);
  }
}

/** Release the in-flight flag when a send never got as far as a provider call. */
export async function abandonDelivery(
  supabase: any,
  handle: DeliveryHandle,
): Promise<void> {
  if (!handle) return;
  try {
    await supabase
      .from("communication_deliveries")
      .update({ in_flight: false, in_flight_at: null })
      .eq("id", handle.deliveryId);
  } catch (_e) {
    // best effort
  }
}

/**
 * Fire-and-forget hand-off to the Office Manager alert function.
 * Keyed on the attempt id, so duplicate events can never double-send.
 */
async function queueFailureAlert(supabase: any, attemptId: string): Promise<void> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return;
  try {
    await fetch(`${url}/functions/v1/notify-delivery-failure`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        apikey: key,
      },
      body: JSON.stringify({ attempt_id: attemptId }),
    });
  } catch (e) {
    console.error("queueFailureAlert failed", e);
  }
}
