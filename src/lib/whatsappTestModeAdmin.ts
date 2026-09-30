export function normaliseApprovedWhatsAppNumber(value: string): string | null {
  const compact = value.replace(/[\s()-]/g, "");
  if (!/^\+353\d{7,10}$/.test(compact)) return null;
  return compact;
}

export function hasConfigured360Key(
  integrations: Array<{ integration_type: string; config: Record<string, unknown> | null }>,
): boolean {
  return integrations
    .filter((integration) =>
      ["360messenger", "whatsapp_360", "whatsapp"].includes(integration.integration_type),
    )
    .some((integration) => {
      const config = integration.config ?? {};
      return [config.api_key, config.api_key_secret].some(
        (value) => typeof value === "string" && value.trim().length > 0,
      );
    });
}

export function connectedWhatsAppNumber(
  integrations: Array<{ integration_type: string; config: Record<string, unknown> | null }>,
): string | null {
  for (const integration of integrations) {
    if (!["360messenger", "whatsapp_360", "whatsapp"].includes(integration.integration_type)) continue;
    const config = integration.config ?? {};
    for (const key of ["company_phone", "phone", "whatsapp_number"]) {
      const value = config[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return null;
}