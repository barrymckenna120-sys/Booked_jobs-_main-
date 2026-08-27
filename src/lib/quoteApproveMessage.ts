/**
 * Turns an accept-quote response into the toast the office should see.
 *
 * The approval pipeline is staged (approval -> office bell -> deposit link ->
 * WhatsApp). When a later stage fails the quote is still approved, so the copy
 * must say what did happen and what needs a human, never a bare "Error".
 */

export type QuoteApproveResponse = {
  success?: boolean;
  approved?: boolean;
  stage?: string | null;
  status?: string | null;
  error?: string | null;
  payment_link?: string | null;
};

export type ApproveToast = {
  title: string;
  description?: string;
  variant?: "default" | "destructive";
};

const STAGE_LABEL: Record<string, string> = {
  quote_approval: "approving the quote",
  office_notification: "creating the office notification",
  deposit_link: "creating the deposit payment link",
  whatsapp_send: "sending the deposit WhatsApp",
};

const STATUS_HINT: Record<string, string> = {
  no_phone: "Customer has no mobile number on file.",
  opted_out: "Customer has opted out of WhatsApp — send the link manually.",
  no_sumup_credentials: "Card payments aren't configured for this business yet.",
  no_whatsapp_key: "WhatsApp isn't connected for this business.",
  no_service_call: "No job was created from this quote.",
  no_deposit_amount: "No deposit was set on this quote.",
};

export function buildApproveToast(
  res: QuoteApproveResponse | null | undefined,
  transportError?: string | null,
): ApproveToast {
  if (transportError && !res) {
    return {
      title: "Couldn't approve quote",
      description: transportError,
      variant: "destructive",
    };
  }

  if (res?.success) {
    switch (res.status) {
      case "deposit_link_sent":
        return { title: "Quote accepted ✅", description: "Job created, office notified, deposit link sent by WhatsApp." };
      case "deposit_link_already_pending":
        return { title: "Quote accepted ✅", description: "Job created. The customer's existing deposit link is still valid — no duplicate sent." };
      case "no_deposit_amount":
        return { title: "Quote accepted ✅", description: "Job created and office notified. No deposit due, so no payment link was sent." };
      case "opted_out":
        return { title: "Quote accepted ✅", description: "Job created and office notified. Customer has opted out of WhatsApp — send the deposit link manually." };
      default:
        return { title: "Quote accepted ✅", description: "Job created and office notified." };
    }
  }

  const stage = res?.stage ?? "";
  const stageLabel = STAGE_LABEL[stage] ?? "completing the approval";
  const hint = (res?.status && STATUS_HINT[res.status]) || res?.error || undefined;

  if (res?.approved) {
    return {
      title: `Quote approved, but ${stageLabel} failed`,
      description: hint
        ? `${hint} The job exists — follow up manually.`
        : "The job exists — follow up manually.",
      variant: "destructive",
    };
  }

  return {
    title: "Couldn't approve quote",
    description: hint || transportError || "Please try again.",
    variant: "destructive",
  };
}
