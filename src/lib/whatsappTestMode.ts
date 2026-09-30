/** Shown instead of the usual success message when WhatsApp test mode blocked the send. */
export const WHATSAPP_TEST_MODE_MESSAGE = "Not sent: WhatsApp test mode is on";

/** True when a send function reports the message was held back by WhatsApp test mode. */
export function isWhatsAppSuppressed(data: unknown): boolean {
  return (data as { status?: unknown } | null)?.status === "suppressed";
}
