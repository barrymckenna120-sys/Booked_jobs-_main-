export type QuoteApprovalResult = {
  success?: boolean;
  error?: string;
  status?: string;
};

const ACCEPTED_STATUSES = new Set([
  "deposit_link_sent",
  "deposit_link_already_pending",
  "already_paid",
  "no_deposit_due",
]);

export function isQuoteApprovalAccepted(result: QuoteApprovalResult | null | undefined): boolean {
  if (result?.success === true) return true;
  return ACCEPTED_STATUSES.has(String(result?.status ?? ""));
}