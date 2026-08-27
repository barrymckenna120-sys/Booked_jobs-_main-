/** Per-row audit entry stored in import_runs.row_details. */
export type ImportRunRowDetail = {
  row_number: number;
  outcome: "created" | "updated" | "skipped_ambiguous" | "failed";
  customer_id: string | null;
  error_message: string | null;
};

/** One import commit. */
export type ImportRun = {
  id: string;
  organisation_id: string;
  filename: string;
  imported_by: string;
  created_at: string;
  total_rows: number;
  created_count: number;
  updated_count: number;
  error_count: number;
  row_details: ImportRunRowDetail[];
};

export const OUTCOME_LABELS: Record<ImportRunRowDetail["outcome"], string> = {
  created: "Created",
  updated: "Updated",
  skipped_ambiguous: "Skipped — ambiguous phone",
  failed: "Failed",
};

/** Coerce the jsonb column into typed row details, tolerating legacy/partial shapes. */
export const parseRowDetails = (raw: unknown): ImportRunRowDetail[] => {
  if (!Array.isArray(raw)) return [];
  return raw.map((r: any) => ({
    row_number: Number(r?.row_number ?? 0),
    outcome: (r?.outcome ?? "failed") as ImportRunRowDetail["outcome"],
    customer_id: r?.customer_id ?? null,
    error_message: r?.error_message ?? null,
  }));
};
