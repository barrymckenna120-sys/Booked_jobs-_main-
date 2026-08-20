import { useNavigate } from "react-router-dom";
import { ChevronRight, MapPin, UserPlus, CreditCard, Hourglass } from "lucide-react";
import { getStatusConfig } from "./job-card/StatusBadge";
import { resolveDepositPill } from "./job-card/InfoPills";

interface EngineerCompactJobRowProps {
  job: any;
  customer: any;
}

const TIME_LABELS: Record<string, string> = {
  "9–11": "9am–11am",
  "11–2": "11am–1pm",
  "2–5": "2pm–5pm",
};

const EngineerCompactJobRow = ({ job, customer }: EngineerCompactJobRowProps) => {
  const navigate = useNavigate();
  const status = getStatusConfig(job.status);
  const { pill } = resolveDepositPill(job);
  const timeLabel = TIME_LABELS[job.time_block || ""] || job.time_block || "—";
  const address = [customer?.address, job.area_code || customer?.area_code, customer?.eircode]
    .filter(Boolean)
    .join(", ");

  return (
    <button
      type="button"
      onClick={() => navigate(`/engineer/job/${job.id}`)}
      className="w-full text-left bg-card rounded-xl border border-border/60 px-4 py-3 mb-2 flex items-center gap-3 active:bg-secondary/50 transition-colors"
    >
      <span className="text-[11px] font-bold font-mono text-muted-foreground shrink-0 w-[62px] leading-tight">
        {timeLabel}
      </span>

      <span className="flex-1 min-w-0">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-bold text-foreground truncate">{customer?.name || "—"}</span>
          <span className="text-[11px] font-mono text-muted-foreground/70 shrink-0">· {jobRef}</span>

          <span className={`${status.bg} ${status.color} rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0`}>
            {status.label}
          </span>
          {job.customer_status_at_booking === "new" && (
            <span className="bg-emerald-500/15 border border-emerald-500/25 rounded-full px-2 py-0.5 text-[10px] font-bold text-emerald-600 flex items-center gap-1 shrink-0">
              <UserPlus className="w-3 h-3" /> New Customer
            </span>
          )}
          {pill && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border border-border flex items-center gap-1 shrink-0 ${
                pill.tone === "success" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
              }`}
            >
              {pill.tone === "success" ? <CreditCard className="w-3 h-3" /> : <Hourglass className="w-3 h-3" />}
              {pill.label}
            </span>
          )}
        </span>
        {address && (
          <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground/70">
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="truncate">{address}</span>
          </span>
        )}
      </span>

      <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
    </button>
  );
};

export default EngineerCompactJobRow;
