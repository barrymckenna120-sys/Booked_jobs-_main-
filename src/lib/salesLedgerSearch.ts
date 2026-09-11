export type SalesLedgerSearchRow = {
  customer_name: string;
  job_reference: string | null;
  receipt_number: string | null;
  invoice_number: string | null;
};

/** Match the Sales ledger's visible identifiers without changing its date scope. */
export function matchesSalesLedgerSearch(
  row: SalesLedgerSearchRow,
  rawSearch: string,
): boolean {
  const search = rawSearch.trim().toLocaleLowerCase("en-IE");
  if (!search) return true;

  return [
    row.customer_name,
    row.job_reference,
    row.receipt_number,
    row.invoice_number,
  ].some((value) => value?.toLocaleLowerCase("en-IE").includes(search));
}