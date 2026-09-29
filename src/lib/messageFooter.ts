// Rebuilds settings.message_footer ("name | address | phone") from the current
// Business Information. Name part: if the existing footer contains " | ", the
// first segment is kept; if it has no " | ", the whole footer is the name; if
// empty, business_name is used. Address/phone reflect the latest saved values
// and blank parts are dropped.
export function rebuildMessageFooter(input: {
  existingFooter?: string | null;
  businessName?: string | null;
  address?: string | null;
  phone?: string | null;
}): string {
  const footer = (input.existingFooter ?? "").trim();
  const existingName = footer.includes(" | ") ? footer.split(" | ")[0].trim() : footer;
  const name = existingName || (input.businessName ?? "").trim();
  const address = (input.address ?? "").replace(/\s*\n\s*/g, ", ").trim();
  const phone = (input.phone ?? "").trim();
  return [name, address, phone].filter(Boolean).join(" | ");
}

// Shared patch for any screen that saves the business phone/address: keeps
// company_phone in sync with business_phone and rebuilds the footer. Merged
// into the caller's existing single settings update.
export function buildContactSyncPatch(input: {
  existingFooter?: string | null;
  businessName?: string | null;
  address?: string | null;
  phone?: string | null;
}): { company_phone: string | null; message_footer: string } {
  const phone = (input.phone ?? "").trim();
  return {
    company_phone: phone || null,
    message_footer: rebuildMessageFooter(input),
  };
}
