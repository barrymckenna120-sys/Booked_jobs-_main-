/**
 * Returns the public route for a part-payment record only after its PDF has
 * been generated. This prevents WhatsApp messages from containing a route
 * that resolve-document-link cannot resolve yet.
 */
export function buildPartialPaymentRecordPath(input: {
  accessToken?: string | null;
  pdfReady: boolean;
}): string | null {
  const token = (input.accessToken || "").trim();
  if (!input.pdfReady || !token) return null;
  return `/receipt/${token}`;
}