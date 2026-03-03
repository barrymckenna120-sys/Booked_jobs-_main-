import { Camera, Archive } from "lucide-react";
import { IncomingStatusPill, BoilerWorkingPill, TimeBlockLabel } from "./IncomingPills";

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
  customers: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    address: string;
    eircode: string;
    area_code: string | null;
    boiler_make_model: string | null;
  };
};

type Props = {
  job: IncomingJob;
  mediaCount: number;
  onClick: () => void;
  onArchive: (id: string) => void;
};

const relativeTime = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
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
          <div className="text-[15px] font-extrabold">{job.customers.name}</div>
          <div className="text-xs text-muted-foreground truncate">📍 {job.customers.address}</div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0 ml-3">
          <IncomingStatusPill status={job.incoming_status} />
          <span className="text-[11px] text-muted-foreground">{relativeTime(job.created_at)}</span>
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
          📅 {job.scheduled_date ? new Date(job.scheduled_date + "T00:00:00").toLocaleDateString("en-GB") : "No date"} · {job.assigned_engineer || "Unassigned"}
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
