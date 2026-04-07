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
  "cancelReason",
  "cancelNote",
];

// DEBUG: global store for last raw payload (temporary)
(window as any).__lastServiceCallPayload = null;

export const sanitizeServiceCallUpdatePayload = <T extends Record<string, any>>(payload: T): T => {
  // DEBUG: log raw payload BEFORE sanitization
  const rawSnapshot = JSON.stringify(payload);
  console.error("SERVICE_CALLS_PAYLOAD:", rawSnapshot);
  (window as any).__lastServiceCallPayload = rawSnapshot;

  const dbPatch = { ...(payload ?? {}) } as Record<string, any>;

  for (const key of SERVICE_CALL_UI_ONLY_KEYS) {
    delete dbPatch[key];
  }

  return dbPatch as T;
};
