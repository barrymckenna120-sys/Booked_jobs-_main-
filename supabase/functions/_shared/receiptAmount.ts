export type ReceiptAmountSource = {
  paymentAmount?: unknown;
  ledgerAmount?: unknown;
  revenue?: unknown;
};

function parsePositiveAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.round(num * 100) / 100;
}

export function resolveReceiptAmount(source: ReceiptAmountSource): number | null {
  return parsePositiveAmount(source.paymentAmount) ??
    parsePositiveAmount(source.ledgerAmount) ??
    parsePositiveAmount(source.revenue);
}

export function formatReceiptAmount(amount: number | null, fallback = "€0.00"): string {
  return amount === null ? fallback : `€${amount.toFixed(2)}`;
}