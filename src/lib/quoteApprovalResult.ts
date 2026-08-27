export type QuoteApprovalResult = {
  success?: boolean;
  error?: string;
  status?: string;
  approved?: boolean;
};

const ACCEPTED_STATUSES = new Set([
  "deposit_link_sent",
  "deposit_link_already_pending",
  "already_paid",
  "no_deposit_due",
]);

export function isQuoteApprovalAccepted(result: QuoteApprovalResult | null | undefined): boolean {
  if (result?.success === true) return true;
  // The quote is genuinely approved even if a later stage (deposit link /
  // WhatsApp) failed — the customer should see the approved state, and the
  // office gets the staged failure on their side.
  if (result?.approved === true) return true;
  return ACCEPTED_STATUSES.has(String(result?.status ?? ""));
}