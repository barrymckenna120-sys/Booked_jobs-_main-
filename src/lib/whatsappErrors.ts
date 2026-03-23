/**
 * Classifies WhatsApp send errors and provides user-friendly messages.
 */

export type WhatsAppErrorType = "connection" | "invalid_number" | "not_on_whatsapp" | "unknown";

export function classifyWhatsAppError(errorMsg?: string | null): WhatsAppErrorType {
  if (!errorMsg) return "unknown";
  const lower = errorMsg.toLowerCase();

  if (lower.includes("invalid") && (lower.includes("number") || lower.includes("phone"))) {
    return "invalid_number";
  }
  if (lower.includes("not registered") || lower.includes("not on whatsapp") || lower.includes("not a whatsapp")) {
    return "not_on_whatsapp";
  }
  if (
    lower.includes("connection") ||
    lower.includes("timeout") ||
    lower.includes("network") ||
    lower.includes("403") ||
    lower.includes("502") ||
    lower.includes("503") ||
    lower.includes("econnrefused") ||
    lower.includes("fetch failed")
  ) {
    return "connection";
  }
  return "unknown";
}

export function getWhatsAppErrorToast(
  errorType: WhatsAppErrorType,
  customerName?: string,
  rawError?: string
): { title: string; description?: string; variant: "destructive"; duration?: number } {
  switch (errorType) {
    case "invalid_number":
      return {
        title: `WhatsApp failed — invalid phone number for ${customerName || "customer"}`,
        description: "Please check the number and try again.",
        variant: "destructive",
      };
    case "not_on_whatsapp":
      return {
        title: "WhatsApp failed — this number may not be registered on WhatsApp.",
        variant: "destructive",
      };
    case "connection":
      return {
        title: "WhatsApp failed to send",
        description: "360Messenger connection error.",
        variant: "destructive",
      };
    default:
      return {
        title: "WhatsApp failed to send",
        description: rawError || "Unknown error. Please try again.",
        variant: "destructive",
      };
  }
}
