import { toE164Digits, phoneMatchKey } from './phone.ts';
import { WHATSAPP_SEND_URL, WHATSAPP_PHONE_FIELD, WHATSAPP_TEXT_FIELD } from './whatsappPayload.ts';
export async function getWhatsAppConfig(supabase: any, organisationId: string) {
  const { data, error } = await supabase
    .from('tenant_integrations')
    .select('config')
    .eq('organisation_id', organisationId)
    .eq('integration_type', '360messenger')
    .single();

  if (error || !data?.config?.api_key_secret) {
    throw new Error(`No 360Messenger secret configured for org ${organisationId}`);
  }
  const apiKey = Deno.env.get(data.config.api_key_secret);
  if (!apiKey) {
    throw new Error(`Secret "${data.config.api_key_secret}" not set in Supabase for org ${organisationId}`);
  }
  return { apiKey, phoneNumberId: data.config.phone_number_id, wabaId: data.config.waba_id };
}

export function normalisePhone(raw: string): string {
  return toE164Digits(raw);
}

/**
 * Log a WhatsApp send failure to message_log. Never throws — callers use this
 * inside catch blocks and must never fail the parent operation due to a log
 * insert error.
 */
export async function logWhatsAppFailure(supabase: any, row: {
  organisation_id: string | null;
  customer_id?: string | null;
  message_type: string;
  content: string;
  related_id?: string | null;
  related_type?: string | null;
  sent_by?: string | null;
  error_message: string;
}) {
  try {
    await supabase.from("message_log").insert({
      organisation_id: row.organisation_id,
      customer_id: row.customer_id ?? null,
      message_type: row.message_type,
      channel: "whatsapp",
      direction: "outbound",
      content: row.content,
      status: "failed",
      related_id: row.related_id ?? null,
      related_type: row.related_type ?? null,
      sent_by: row.sent_by ?? null,
      error_message: (row.error_message || "").slice(0, 500),
      sent_at: new Date().toISOString(),
    });
  } catch (_e) {
    console.error("logWhatsAppFailure insert failed:", _e);
  }
}

// ---------------------------------------------------------------------------
// WhatsApp test-mode guard — the ONLY path to the 360Messenger send endpoint.
// ---------------------------------------------------------------------------

export const SUPPRESSED_TEST_MODE = "suppressed_test_mode";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GuardedSendResult =
  | { status: "sent"; response: Response }
  | { status: "suppressed"; reason: typeof SUPPRESSED_TEST_MODE };

export interface GuardedSendArgs {
  /** Real tenant organisation id. Required — never null, never "platform". */
  organisationId: string;
  apiKey: string;
  /** FormData carrying `phonenumber` + `text` (as built today by each caller). */
  body: FormData;
  messageType: string;
  customerId?: string | null;
  relatedId?: string | null;
  relatedType?: string | null;
  sentBy?: string | null;
  /** If the caller already inserted a pending message_log row, mark THAT row suppressed. */
  existingLogId?: string | null;
  /** Test seam. */
  fetchImpl?: typeof fetch;
}

function restHeaders() {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

/**
 * Decide whether the tenant may message this recipient. Fails CLOSED: any
 * lookup problem throws (the caller's existing error path handles it) rather
 * than sending.
 */
async function isSuppressed(f: typeof fetch, orgId: string, recipient: string): Promise<boolean> {
  const base = Deno.env.get("SUPABASE_URL");
  if (!base) throw new Error("WhatsApp guard: SUPABASE_URL not set");
  const orgRes = await f(`${base}/rest/v1/organisations?id=eq.${orgId}&select=whatsapp_test_mode`, { headers: restHeaders() });
  if (!orgRes.ok) throw new Error(`WhatsApp guard: organisation lookup failed (${orgRes.status})`);
  const rows = await orgRes.json();
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error(`WhatsApp guard: unknown organisation ${orgId}`);
  if (rows[0].whatsapp_test_mode !== true) return false;

  const key = phoneMatchKey(recipient);
  if (!key) throw new Error("WhatsApp guard: recipient number is not a valid phone number");
  const alRes = await f(
    `${base}/rest/v1/organisation_whatsapp_allowed_numbers?organisation_id=eq.${orgId}&select=phone`,
    { headers: restHeaders() },
  );
  if (!alRes.ok) throw new Error(`WhatsApp guard: allowed-number lookup failed (${alRes.status})`);
  const allowed = await alRes.json();
  // Same-org only (filtered above); same normaliser on both sides.
  return !(Array.isArray(allowed) && allowed.some((r: any) => phoneMatchKey(r.phone) === key));
}

/**
 * Send one WhatsApp message through 360Messenger, respecting tenant test mode.
 * Returns `sent` (with the real provider Response — callers keep their existing
 * success/failure handling) or `suppressed`. Callers must only record a message
 * as sent / advance state when status === "sent".
 */
export async function sendWhatsAppGuarded(args: GuardedSendArgs): Promise<GuardedSendResult> {
  const f = args.fetchImpl ?? fetch;
  if (!args.organisationId || !UUID_RE.test(args.organisationId)) {
    throw new Error("WhatsApp guard: a real organisation id is required");
  }
  // Normalise at the send boundary (08x / 8x / +353 / 00353 -> 353... digits, as 360Messenger expects).
  const recipient = toE164Digits(String(args.body.get(WHATSAPP_PHONE_FIELD) ?? ""));
  if (!recipient) throw new Error("WhatsApp guard: recipient number is not a valid phone number");
  args.body.set(WHATSAPP_PHONE_FIELD, recipient);
  if (await isSuppressed(f, args.organisationId, recipient)) {
    const base = Deno.env.get("SUPABASE_URL");
    const row = {
      organisation_id: args.organisationId,
      customer_id: args.customerId ?? null,
      message_type: args.messageType,
      channel: "whatsapp",
      direction: "outbound",
      content: String(args.body.get(WHATSAPP_TEXT_FIELD) ?? ""),
      status: SUPPRESSED_TEST_MODE,
      related_id: args.relatedId ?? null,
      related_type: args.relatedType ?? null,
      sent_by: args.sentBy ?? null,
      recipient_phone: recipient,
      error_message: "Not sent: WhatsApp test mode is on",
    };
    try {
      let logRes: Response;
      if (args.existingLogId) {
        logRes = await f(`${base}/rest/v1/message_log?id=eq.${args.existingLogId}`, {
          method: "PATCH", headers: restHeaders(),
          body: JSON.stringify({ status: SUPPRESSED_TEST_MODE, error_message: row.error_message, recipient_phone: recipient }),
        });
      } else {
        logRes = await f(`${base}/rest/v1/message_log`, { method: "POST", headers: restHeaders(), body: JSON.stringify(row) });
      }
      if (!logRes.ok) console.error(`WhatsApp guard: suppressed log write failed [${logRes.status}]: ${await logRes.text()}`);
    } catch (_e) {
      console.error("WhatsApp guard: suppressed log write failed", _e);
    }
    console.log(`[whatsapp-guard] suppressed ${args.messageType} for org ${args.organisationId}`);
    return { status: "suppressed", reason: SUPPRESSED_TEST_MODE };
  }
  const response = await f(WHATSAPP_SEND_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${args.apiKey}` },
    body: args.body,
  });
  return { status: "sent", response };
}

/**
 * Platform admin alerts ONLY (notifyAdmin.ts). Not tenant-scoped, so tenant
 * test mode does not apply. Do not use for customer-facing messages.
 */
export async function sendPlatformAlertWhatsApp(apiKey: string, body: FormData, fetchImpl: typeof fetch = fetch): Promise<Response> {
  return await fetchImpl(WHATSAPP_SEND_URL, { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body });
}

/** Standard JSON body for a suppressed send (HTTP 200). */
export function suppressedPayload(extra: Record<string, unknown> = {}) {
  return { success: true, sent: false, status: "suppressed", reason: SUPPRESSED_TEST_MODE, message: "Not sent: WhatsApp test mode is on", ...extra };
}
