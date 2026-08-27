import { BellRing, CalendarClock, FileText, TriangleAlert } from "lucide-react";
import {
  costVariance,
  formatExpectedDelivery,
  formatNotifiedStamp,
  formatPartCost,
  isDeliveryOverdue,
  VARIANCE_STYLE,
} from "@/lib/partsCost";

/**
 * BJ-0071 / BJ-0072 — shared read-only display of a part's tracking detail:
 * quoted vs actual cost with variance, expected delivery, customer-notified
 * stamp and quote reference.
 *
 * Every field self-hides when empty, so historical parts (which are never
 * backfilled) render exactly as they did before. Shared by all read surfaces so
 * office, engineer, job detail and the customer record can't drift.
 *
 * Display only — these values never affect what a customer is charged.
 */

export interface PartTrackingRow {
  status?: string | null;
  quoted_cost?: number | string | null;
  actual_cost?: number | string | null;
  cost_currency?: string | null;
  expected_delivery_date?: string | null;
  customer_notified_at?: string | null;
  customer_notified_method?: string | null;
  quote_reference?: string | null;
}

/** True when there is anything at all to show — lets callers skip the wrapper. */
export const hasPartTracking = (row: PartTrackingRow): boolean =>
  row.quoted_cost !== null && row.quoted_cost !== undefined
    ? true
    : row.actual_cost !== null && row.actual_cost !== undefined
      ? true
      : !!row.expected_delivery_date || !!row.customer_notified_at || !!row.quote_reference;

export const PartCostSummary = ({
  row,
  className = "",
}: {
  row: PartTrackingRow;
  className?: string;
}) => {
  const quoted = formatPartCost(row.quoted_cost, row.cost_currency);
  const actual = formatPartCost(row.actual_cost, row.cost_currency);
  if (!quoted && !actual) return null;

  const variance = costVariance(row.quoted_cost, row.actual_cost, row.cost_currency);
  const vStyle = variance ? VARIANCE_STYLE[variance.state] : null;

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] ${className}`}>
      {quoted && (
        <span className="text-muted-foreground">
          Quoted <span className="font-mono font-semibold text-foreground/80">{quoted}</span>
        </span>
      )}
      {actual && (
        <span className="text-muted-foreground">
          Actual <span className="font-mono font-semibold text-foreground/80">{actual}</span>
        </span>
      )}
      {variance && vStyle && (
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 font-semibold ${vStyle.bg} ${vStyle.text}`}
        >
          {variance.label}
        </span>
      )}
    </div>
  );
};

export const PartTrackingRowDetails = ({
  row,
  className = "",
}: {
  row: PartTrackingRow;
  className?: string;
}) => {
  const eta = formatExpectedDelivery(row.expected_delivery_date);
  const overdue = isDeliveryOverdue(row.expected_delivery_date, row.status);
  const notified = formatNotifiedStamp(row);

  if (!eta && !notified && !row.quote_reference) return null;

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] ${className}`}>
      {eta && (
        <span
          className={`inline-flex items-center gap-1 ${overdue ? "text-destructive font-semibold" : "text-muted-foreground"}`}
        >
          {overdue ? (
            <TriangleAlert className="w-3 h-3" strokeWidth={2.5} />
          ) : (
            <CalendarClock className="w-3 h-3" strokeWidth={2.5} />
          )}
          {overdue ? "Due" : "Expected"} <span className="font-mono">{eta}</span>
        </span>
      )}
      {notified ? (
        <span className="inline-flex items-center gap-1 text-emerald-600">
          <BellRing className="w-3 h-3" strokeWidth={2.5} />
          Customer told <span className="font-mono">{notified}</span>
        </span>
      ) : (
        row.status !== "Cancelled" &&
        row.status !== "Open" && (
          <span className="inline-flex items-center gap-1 text-muted-foreground/80">
            <BellRing className="w-3 h-3" strokeWidth={2.5} />
            Customer not told yet
          </span>
        )
      )}
      {row.quote_reference && (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <FileText className="w-3 h-3" strokeWidth={2.5} />
          Quote <span className="font-mono font-semibold text-foreground/80">{row.quote_reference}</span>
        </span>
      )}
    </div>
  );
};

/** Both blocks together — the default for every read surface. */
const PartTrackingDetails = ({ row, className = "" }: { row: PartTrackingRow; className?: string }) => {
  if (!hasPartTracking(row)) return null;
  return (
    <div className={`space-y-1 ${className}`}>
      <PartCostSummary row={row} />
      <PartTrackingRowDetails row={row} />
    </div>
  );
};

export default PartTrackingDetails;
