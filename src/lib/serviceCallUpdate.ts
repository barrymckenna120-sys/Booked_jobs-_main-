const SERVICE_CALL_UI_ONLY_KEYS = [
  "tagDate",
  "tag_date",
  "jobTagDate",
  "selectedTags",
  "selectedJobType",
  "confirmedRevenue",
  "paymentMethod",
  "workDone",
  "parts",
  "nextService",
  "followUp",
  "followUpNote",
  "officeNote",
  "boilerMake",
  "boilerModel",
  "warrantyExpiry",
  "customerNotes",
  "cancelReason",
  "cancelNote",
  "job_tags",
];

/**
 * Thrown when a payment-confirmation call reaches the DB layer without a usable
 * amount. Fails loudly instead of silently recording a zero payment.
 */
export class PaymentAmountError extends Error {
  constructor() {
    super("Payment amount missing — please re-enter and try again");
    this.name = "PaymentAmountError";
  }
}

/**
 * Payment-confirmation callers must never set service_calls.revenue directly.
 * Applied to the INBOUND caller payload only — buildPaymentPatch's own
 * revenueMode:"fill" output must still reach the DB, so this is deliberately
 * NOT part of SERVICE_CALL_UI_ONLY_KEYS.
 */
export const stripCallerRevenue = <T extends Record<string, any>>(payload: T): T => {
  const p = { ...(payload ?? {}) } as Record<string, any>;
  if ("revenue" in p) {
    console.error(
      "[serviceCallUpdate] caller-supplied `revenue` stripped — use confirmedRevenue",
      p.revenue,
    );
    delete p.revenue;
  }
  return p as T;
};

export const sanitizeServiceCallUpdatePayload = <T extends Record<string, any>>(payload: T): T => {
  const dbPatch = { ...(payload ?? {}) } as Record<string, any>;

  for (const key of SERVICE_CALL_UI_ONLY_KEYS) {
    delete dbPatch[key];
  }

  return dbPatch as T;
};
