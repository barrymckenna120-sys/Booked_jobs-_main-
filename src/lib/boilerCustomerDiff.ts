/**
 * Builds the `customers` patch for boiler details collected on the completion sheet.
 *
 * Only fields the engineer actually changed are included, so an untouched (or
 * stale-baseline) field can never overwrite the customer record. A pre-filled
 * value that was cleared counts as a real edit and is written as null.
 */
export interface BoilerSheetValues {
  boilerMake?: string | null;
  boilerModel?: string | null;
  warrantyExpiry?: string | null;
}

export interface BoilerCustomerBaseline {
  boiler_brand?: string | null;
  boiler_model?: string | null;
  warranty_expiry_date?: string | null;
}

export const buildBoilerCustomerUpdate = (
  values: BoilerSheetValues,
  baseline: BoilerCustomerBaseline | null | undefined
): Record<string, string | null> => {
  const update: Record<string, string | null> = {};
  const pairs: [keyof BoilerSheetValues, keyof BoilerCustomerBaseline][] = [
    ["boilerMake", "boiler_brand"],
    ["boilerModel", "boiler_model"],
    ["warrantyExpiry", "warranty_expiry_date"],
  ];

  for (const [uiKey, dbKey] of pairs) {
    const next = values?.[uiKey];
    if (next === undefined) continue;
    const current = (baseline?.[dbKey] ?? "") as string;
    if ((next ?? "") === current) continue;
    update[dbKey] = String(next ?? "").trim() || null;
  }

  return update;
};
