import { Wrench, Flame, CreditCard, Hourglass, CalendarDays } from "lucide-react";
import { format, isValid, parseISO } from "date-fns";
import { resolvePaymentSheetState, type PaymentSheetJob } from "@/lib/paymentSheetAmount";

const TIME_LABELS: Record<string, string> = {
  "9–11": "9am–11am",
  "11–2": "11am–1pm",
  "2–5":  "2pm–5pm",
};

interface InfoPillsProps {
  timeBlock: string | null;
  jobType: string;
  boilerBrand?: string | null;
  /** Job payment fields — classified by the shared resolvePaymentSheetState helper. */
  paymentJob?: PaymentSheetJob | null;
  scheduledDate?: string | null;
}

const formatScheduledDate = (scheduledDate?: string | null) => {
  if (!scheduledDate) return null;

  const normalizedDate = scheduledDate.trim();
  if (!normalizedDate) return null;

  const parsedDate = parseISO(
    normalizedDate.includes("T") ? normalizedDate : `${normalizedDate}T00:00:00`
  );

  return isValid(parsedDate) ? format(parsedDate, "EEE d MMM") : normalizedDate;
};

export const euro = (n: number) => `€${n.toFixed(2)}`;

export type DepositPill = {
  /** null = no pill for this job (Cases B and C). */
  pill: { tone: "success" | "warning"; label: string } | null;
  /** Low-emphasis line beneath the pills, or null when nothing is outstanding. */
  balanceLine: string | null;
};

/**
 * The card's deposit pill is a thin presentation mapping over the shared
 * payment classifier — no parallel rules of its own.
 *   Case D -> "Deposit €X due"   (warning)
 *   Case A -> "Deposit €X paid"  (success) + "Balance due €Y"
 *   Case B / C -> nothing
 */
export function resolveDepositPill(job?: PaymentSheetJob | null): DepositPill {
  const payment = resolvePaymentSheetState(job);

  if (payment.case === "D") {
    return { pill: { tone: "warning", label: `Deposit ${euro(payment.depositAmount)} due` }, balanceLine: null };
  }
  if (payment.case === "A") {
    return {
      pill: { tone: "success", label: `Deposit ${euro(payment.depositAmount)} paid` },
      balanceLine: payment.balanceDue > 0 ? `Balance due ${euro(payment.balanceDue)}` : null,
    };
  }
  return { pill: null, balanceLine: null };
}

const InfoPills = ({ timeBlock, jobType, boilerBrand, paymentJob, scheduledDate }: InfoPillsProps) => {
  const timeLabel = TIME_LABELS[timeBlock || ""] || timeBlock || "—";
  const formattedDate = formatScheduledDate(scheduledDate);
  const { pill, balanceLine } = resolveDepositPill(paymentJob);

  return (
    <div className="mb-3">
      <div className="flex flex-wrap gap-2">
        <span className="bg-primary/10 border border-primary/20 rounded-full px-2.5 py-0.5 text-xs font-bold text-primary flex items-center gap-1">
          <CalendarDays className="w-3 h-3" /> {formattedDate ? `${formattedDate} · ${timeLabel}` : timeLabel}
        </span>
        <span className="bg-secondary border border-border rounded-full px-2.5 py-0.5 text-xs font-semibold text-foreground flex items-center gap-1">
          <Wrench className="w-3 h-3 text-muted-foreground" /> {jobType}
        </span>
        {boilerBrand && (
          <span className="bg-secondary border border-border rounded-full px-2.5 py-0.5 text-xs font-semibold text-foreground flex items-center gap-1">
            <Flame className="w-3 h-3 text-muted-foreground" /> {boilerBrand}
          </span>
        )}
        {pill && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold border border-border flex items-center gap-1 ${
              pill.tone === "success" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
            }`}
          >
            {pill.tone === "success" ? <CreditCard className="w-3 h-3" /> : <Hourglass className="w-3 h-3" />}
            {pill.label}
          </span>
        )}
      </div>
      {balanceLine && (
        <div className="mt-1.5 text-[11px] font-semibold text-muted-foreground">{balanceLine}</div>
      )}
    </div>
  );
};

export default InfoPills;
