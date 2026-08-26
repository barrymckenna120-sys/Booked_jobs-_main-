import { Camera, Archive, Clock } from "lucide-react";
import { IncomingStatusPill, BoilerWorkingPill, TimeBlockLabel } from "./IncomingPills";
import JobConfirmedBadge from "@/components/jobs/JobConfirmedBadge";
import NewCustomerBadge from "@/components/jobs/NewCustomerBadge";
import type { CustomerStatusAtBooking } from "@/types/service-calls";

type IncomingJob = {
  id: string;
  customer_id: string;
  job_type: string;
  status: string;
  scheduled_date: string | null;
  time_block: string | null;
  assigned_engineer: string | null;
  notes: string | null;
  boiler_brand: string | null;
  boiler_working: boolean | null;
  boiler_issue: string | null;
  source: string | null;
  incoming_status: string | null;
  created_at: string;
  confirmed?: boolean | null;
  confirmed_at?: string | null;
  /** Set at job creation: 'new' when the customer did not previously exist. */
  customer_status_at_booking?: CustomerStatusAtBooking | null;

  customers: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    address: string;
    eircode: string;
    area_code: string | null;
    boiler_make_model: string | null;
  } | null;
};

type Props = {
  job: IncomingJob;
  mediaCount: number;
  onClick: () => void;
  onArchive: (id: string) => void;
};

const formatTimestamp = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const d = new Date(dateStr);

  if (mins < 60) {
    return { text: "Just now", color: "text-success" };
  }
  if (mins < 1440) {
    // Under 24 hours
    const timeStr = d.toLocaleTimeString("en-IE", { hour: "numeric", minute: "2-digit", hour12: true });
    return { text: `Today at ${timeStr}`, color: "text-warning" };
  }
  // Over 24 hours
  const dateFormatted = d.toLocaleDateString("en-IE", { day: "numeric", month: "short" });
  const timeStr = d.toLocaleTimeString("en-IE", { hour: "numeric", minute: "2-digit", hour12: true });
  return { text: `${dateFormatted} · ${timeStr}`, color: "text-destructive" };
};

const borderColorMap: Record<string, string> = {
  Pending: "border-l-warning",
  Reviewed: "border-l-primary",
  Assigned: "border-l-success",
  Rejected: "border-l-destructive",
  Archived: "border-l-muted-foreground",
};

const IncomingJobCard = ({ job, mediaCount, onClick, onArchive }: Props) => {
  const leftBorder = borderColorMap[job.incoming_status || "Pending"] || "border-l-warning";
  const urgentGas = !job.boiler_working && job.boiler_issue?.toLowerCase().includes("gas");
  const isArchived = job.incoming_status === "Archived";
  const ts = formatTimestamp(job.created_at);

  return (
    <div
      onClick={onClick}
      className={`bg-card border border-border border-l-4 ${leftBorder} rounded-xl p-4 mb-3 cursor-pointer active:scale-[0.99] transition-transform ${isArchived ? "opacity-60" : ""}`}
    >
      {/* Urgent alert */}
      {urgentGas && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-1.5 mb-3 text-xs font-bold text-destructive">
          🚨 URGENT — Possible gas issue reported
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-extrabold flex items-center gap-1.5 flex-wrap">
            <span className="truncate max-w-full">{job.customers?.name ?? "Unknown customer"}</span>
            <JobConfirmedBadge confirmed={job.confirmed} confirmedAt={job.confirmed_at} status={(job as any).status} size="sm" />
            <NewCustomerBadge status={job.customer_status_at_booking} size="sm" />
          </div>

          <div className="text-xs text-muted-foreground truncate">📍 {job.customers?.address ?? "No address"}</div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0 ml-3">
          <IncomingStatusPill status={job.incoming_status} />
          <span className={`text-[12px] font-bold flex items-center gap-1 ${ts.color}`}>
            <Clock className="w-3 h-3" />
            {ts.text}
          </span>
        </div>
      </div>

      {/* Info pills */}
      <div className="flex gap-1.5 flex-wrap mb-2.5">
        <BoilerWorkingPill working={job.boiler_working} />
        {job.boiler_brand && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted border border-border text-muted-foreground">
            🔧 {job.boiler_brand}
          </span>
        )}
        <TimeBlockLabel block={job.time_block} />
        {mediaCount > 0 && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[hsl(263,70%,94%)] text-[hsl(263,70%,46%)] flex items-center gap-1">
            <Camera className="w-3 h-3" /> {mediaCount}
          </span>
        )}
      </div>

      {/* Issue */}
      {job.boiler_issue && (
        <div className="bg-warning/10 border-l-[3px] border-warning rounded-r-lg px-3 py-2 mb-2.5">
          <div className="text-[11px] font-bold text-warning mb-0.5">ISSUE REPORTED</div>
          <div className="text-xs leading-relaxed">{job.boiler_issue}</div>
        </div>
      )}

      {/* Footer */}
      <div className="flex justify-between items-center">
        <span className="text-xs text-muted-foreground">
          📅 {job.scheduled_date ? new Date(job.scheduled_date + "T00:00:00").toLocaleDateString("en-IE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "No date"} · {job.assigned_engineer || "Unassigned"}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onArchive(job.id); }}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <Archive className="w-3.5 h-3.5" />
            {isArchived ? "Restore" : "Archive"}
          </button>
          <span className="text-xs font-bold text-primary">Review →</span>
        </div>
      </div>
    </div>
  );
};

export default IncomingJobCard;
