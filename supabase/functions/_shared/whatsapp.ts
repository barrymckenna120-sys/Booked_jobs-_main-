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
  const digits = String(raw).replace(/[^\d]/g, '');
  if (digits.startsWith('353')) return digits;
  if (digits.startsWith('0')) return '353' + digits.slice(1);
  throw new Error(`Unrecognised phone format: "${raw}"`);
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
