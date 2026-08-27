import { format, parseISO } from "date-fns";
import { formatPartTimestamp } from "./partsDates";

/**
 * BJ-0071 / BJ-0072 — parts cost, delivery ETA, customer-notified state and quote
 * reference.
 *
 * ############################################################################
 * # HARD RULE — parts cost is SUPPLIER cost, never customer pricing.         #
 * #                                                                          #
 * # These values exist so staff can answer "what did this part cost us, when #
 * # is it arriving, has the customer been told" months later. They must NEVER #
 * # propagate into service_calls.revenue, balance_due, payment_status,        #
 * # deposit fields, quotes or invoice totals. Adjusting what a customer is    #
 * # charged is always a deliberate, separate office action.                   #
 * #                                                                          #
 * # stripPartsCostFields() below is the mechanical enforcement of that rule,  #
 * # mirroring stripCallerRevenue() in serviceCallUpdate.ts. Any new helper    #
 * # that writes to service_calls while handling a part MUST run it.           #
 * ############################################################################
 */

/** Columns on parts_requests that only office roles may write (DB trigger enforces). */
export const PARTS_OFFICE_ONLY_FIELDS = [
  "quoted_cost",
  "actual_cost",
  "cost_currency",
  "expected_delivery_date",
  "customer_notified_at",
  "customer_notified_by",
  "customer_notified_method",
  "quote_reference",
] as const;

export const OFFICE_ROLES = ["admin", "owner", "office", "manager", "superadmin"] as const;

/** Mirrors parts_requests_update_office / the protect_parts_request_office_fields trigger. */
export const canEditPartsOfficeFields = (role: string | null | undefined): boolean =>
  !!role && (OFFICE_ROLES as readonly string[]).includes(role);

export type NotifiedMethod = "whatsapp" | "phone" | "email" | "in_person";

export const NOTIFIED_METHOD_LABEL: Record<NotifiedMethod, string> = {
  whatsapp: "WhatsApp",
  phone: "Phone",
  email: "Email",
  in_person: "In person",
};

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

/** "€124.50". Returns "" when there is no cost, so callers can render nothing. */
export const formatPartCost = (
  value: unknown,
  currency: string | null | undefined = "EUR",
): string => {
  const n = toNumber(value);
  if (n === null) return "";
  const symbol = currency === "EUR" || !currency ? "€" : `${currency} `;
  return `${symbol}${n.toFixed(2)}`;
};

export type CostVariance = {
  quoted: number;
  actual: number;
  delta: number;
  /** over = cost us more than quoted, under = came in cheaper. */
  state: "over" | "under" | "on_budget";
  label: string;
};

/**
 * Variance between what the supplier quoted and what it actually cost.
 * Informational only — see the hard rule at the top of this file.
 */
export const costVariance = (
  quotedCost: unknown,
  actualCost: unknown,
  currency: string | null | undefined = "EUR",
): CostVariance | null => {
  const quoted = toNumber(quotedCost);
  const actual = toNumber(actualCost);
  if (quoted === null || actual === null) return null;

  const delta = Number((actual - quoted).toFixed(2));
  if (delta === 0) {
    return { quoted, actual, delta, state: "on_budget", label: "On budget" };
  }
  const state: CostVariance["state"] = delta > 0 ? "over" : "under";
  const magnitude = formatPartCost(Math.abs(delta), currency);
  return {
    quoted,
    actual,
    delta,
    state,
    label: state === "over" ? `${magnitude} over` : `${magnitude} under`,
  };
};

export const VARIANCE_STYLE: Record<CostVariance["state"], { bg: string; text: string }> = {
  over: { bg: "bg-destructive/10", text: "text-destructive" },
  under: { bg: "bg-emerald-500/10", text: "text-emerald-600" },
  on_budget: { bg: "bg-muted", text: "text-muted-foreground" },
};

/**
 * ETA as a plain date. The T12:00:00 suffix keeps Europe/Dublin from shifting a
 * stored date back a day when the browser parses it as UTC midnight.
 */
export const formatExpectedDelivery = (value: string | null | undefined): string => {
  if (!value) return "";
  try {
    const d = parseISO(value.length <= 10 ? `${value}T12:00:00` : value);
    if (Number.isNaN(d.getTime())) return "";
    return format(d, "EEE d MMM yyyy");
  } catch {
    return "";
  }
};

/** True when the ETA is in the past and the part still isn't marked ready. */
export const isDeliveryOverdue = (
  expected: string | null | undefined,
  status: string | null | undefined,
): boolean => {
  if (!expected || status === "Ready to Fit" || status === "Cancelled") return false;
  try {
    const d = parseISO(expected.length <= 10 ? `${expected}T12:00:00` : expected);
    if (Number.isNaN(d.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d.getTime() < today.getTime();
  } catch {
    return false;
  }
};

/** "WhatsApp · 14 Aug 2026, 7:27am", or "" when the customer hasn't been told. */
export const formatNotifiedStamp = (row: {
  customer_notified_at?: string | null;
  customer_notified_method?: string | null;
}): string => {
  if (!row.customer_notified_at) return "";
  const when = formatPartTimestamp(row.customer_notified_at);
  const method = row.customer_notified_method
    ? NOTIFIED_METHOD_LABEL[row.customer_notified_method as NotifiedMethod]
    : null;
  if (!when) return method ?? "";
  return method ? `${method} · ${when}` : when;
};

/**
 * Removes every parts-cost key from a patch bound for service_calls (or any
 * pricing-bearing table). Supplier cost must never reach customer pricing —
 * see the hard rule at the top of this file. Mirrors stripCallerRevenue().
 */
export const stripPartsCostFields = <T extends Record<string, any>>(patch: T): T => {
  if (!patch || typeof patch !== "object") return patch;
  const clean: Record<string, any> = { ...patch };
  for (const key of PARTS_OFFICE_ONLY_FIELDS) delete clean[key];
  // Belt and braces: a parts flow has no business setting these either.
  for (const key of ["revenue", "balance_due", "payment_status", "deposit_amount"]) {
    delete clean[key];
  }
  return clean as T;
};
