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

export const sanitizeServiceCallUpdatePayload = <T extends Record<string, any>>(payload: T): T => {
  const dbPatch = { ...(payload ?? {}) } as Record<string, any>;

  for (const key of SERVICE_CALL_UI_ONLY_KEYS) {
    delete dbPatch[key];
  }

  return dbPatch as T;
};
