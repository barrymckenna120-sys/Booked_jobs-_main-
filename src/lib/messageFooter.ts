// Rebuilds settings.message_footer ("name | address | phone") from the current
// Business Information. The name segment is kept exactly as already stored so
// the WhatsApp display name never changes; address/phone always reflect the
// latest saved values, and blank parts are dropped.
export function rebuildMessageFooter(input: {
  existingFooter?: string | null;
  businessName?: string | null;
  address?: string | null;
  phone?: string | null;
}): string {
  const existingName = (input.existingFooter ?? "").split(" | ")[0].trim();
  const name = existingName || (input.businessName ?? "").trim();
  const address = (input.address ?? "").replace(/\s*\n\s*/g, ", ").trim();
  const phone = (input.phone ?? "").trim();
  return [name, address, phone].filter(Boolean).join(" | ");
}
