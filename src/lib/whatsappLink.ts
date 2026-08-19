/**
 * Irish phone -> wa.me digits (E.164 without the leading '+').
 * Lifted verbatim from the inline helper in src/pages/Jobs.tsx so every
 * contact-action surface uses one implementation.
 */
export function formatWhatsApp(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return "353" + digits.slice(1);
  if (digits.startsWith("353")) return digits;
  return "353" + digits;
}
