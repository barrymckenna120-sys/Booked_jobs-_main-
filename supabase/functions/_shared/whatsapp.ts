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
