// Shared patch for any screen that saves the business phone: keeps
// company_phone in sync with business_phone. Never writes message_footer —
// the footer is the trading name only and is not rebuilt on save.
export function buildContactSyncPatch(input: {
  phone?: string | null;
}): { company_phone: string | null } {
  const phone = (input.phone ?? "").trim();
  return { company_phone: phone || null };
}
