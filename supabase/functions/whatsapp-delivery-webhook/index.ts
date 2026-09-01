// 360Messenger delivery-status callback receiver.
//
// Security model:
//  - unauthenticated endpoint (the provider cannot hold a Supabase JWT), so a
//    shared secret is REQUIRED: header `x-webhook-secret` or `?secret=` must
//    equal WHATSAPP_DELIVERY_WEBHOOK_SECRET. Anything else is 401 and nothing
//    is written. No secret configured => 503, never "allow all".
//  - the callback carries NO organisation id and none is accepted from the body.
//    The provider message id is unique across all tenants, so a callback can
//    only ever touch the single attempt that produced that id. Cross-tenant
//    updates are structurally impossible.
//  - idempotent: a repeated callback for an already-delivered attempt changes
//    nothing and raises no alert.
//  - only an explicit provider failure status writes `failed`. Silence is never
//    interpreted as failure here.

import { createClient } from "npm:@supabase/supabase-js@2";
import { recordDelivered, recordProviderFailure } from "../_shared/deliveryStatus.ts";

const DELIVERED = new Set(["delivered", "delivery", "read", "seen", "played"]);
const FAILED = new Set(["failed", "failure", "undelivered", "error", "rejected", "expired"]);

/** Pull the provider message id out of whichever shape the callback uses. */
export function extractMessageId(payload: any): string | null {
  const candidates = [
    payload?.id,
    payload?.message_id,
    payload?.messageId,
    payload?.data?.id,
    payload?.data?.message_id,
    payload?.message?.id,
    payload?.statuses?.[0]?.id,
    payload?.entry?.[0]?.changes?.[0]?.value?.statuses?.[0]?.id,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

/** Pull the provider status string out of whichever shape the callback uses. */
export function extractStatus(payload: any): string | null {
  const candidates = [
    payload?.status,
    payload?.event,
    payload?.type,
    payload?.data?.status,
    payload?.statuses?.[0]?.status,
    payload?.entry?.[0]?.changes?.[0]?.value?.statuses?.[0]?.status,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim().toLowerCase();
  }
  return null;
}

export function classifyProviderStatus(status: string | null): "delivered" | "failed" | "other" {
  if (!status) return "other";
  if (DELIVERED.has(status)) return "delivered";
  if (FAILED.has(status)) return "failed";
  return "other";
}

Deno.serve(async (req) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const expected = Deno.env.get("WHATSAPP_DELIVERY_WEBHOOK_SECRET");
  if (!expected) {
    console.error("whatsapp-delivery-webhook: secret not configured");
    return json({ error: "Webhook not configured" }, 503);
  }

  const url = new URL(req.url);
  const supplied = req.headers.get("x-webhook-secret") ?? url.searchParams.get("secret") ?? "";
  if (supplied !== expected) {
    console.warn("whatsapp-delivery-webhook: rejected callback with bad secret");
    return json({ error: "Unauthorized" }, 401);
  }

  const raw = await req.text();
  let payload: any = null;
  try {
    payload = JSON.parse(raw);
  } catch (_e) {
    return json({ error: "Invalid JSON" }, 400);
  }

  const messageId = extractMessageId(payload);
  const status = extractStatus(payload);
  const kind = classifyProviderStatus(status);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Always keep the raw callback for evidence, whatever we do with it.
  try {
    await supabase.from("edge_function_logs").insert({
      function_name: "whatsapp-delivery-webhook",
      error_message: `provider status: ${status ?? "unknown"}`,
      payload: { raw: raw.slice(0, 4000), provider_message_id: messageId, classified: kind },
    });
  } catch (_e) { /* non-critical */ }

  if (!messageId) return json({ ok: true, matched: false, reason: "no_message_id" });

  if (kind === "delivered") {
    const r = await recordDelivered(supabase, messageId, status);
    return json({ ok: true, ...r, applied: "delivered" });
  }

  if (kind === "failed") {
    const r = await recordProviderFailure(
      supabase,
      messageId,
      `provider status: ${status}`,
      "whatsapp",
      status,
    );
    return json({ ok: true, ...r, applied: "failed" });
  }

  // Intermediate/unknown provider states are recorded but never reinterpreted.
  return json({ ok: true, matched: false, applied: "none", provider_status: status });
});
