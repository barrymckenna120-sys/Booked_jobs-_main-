import { Clock, Truck, PackageCheck, XCircle, StickyNote, Building2 } from "lucide-react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { useNavigate } from "react-router-dom";
import {
  PART_PRIORITY_CONFIG,
  PART_STATUS_CONFIG,
  PART_STATUS_ICON_KEY,
  isOfficeUpdate,
  type PartsRequestRow,
} from "@/lib/partsStatus";

/**
 * PackageCheck is reserved for "Ready to Fit". CheckCircle2 is the job Complete
 * glyph elsewhere in the app and is deliberately not used here.
 */
const ICONS: Record<string, typeof Clock> = {
  Clock,
  Truck,
  PackageCheck,
  XCircle,
};

const formatCreated = (value: string) => {
  try {
    const d = parseISO(value);
    if (isToday(d)) return `Today, ${format(d, "h:mmaaa").toLowerCase()}`;
    if (isYesterday(d)) return `Yesterday, ${format(d, "h:mmaaa").toLowerCase()}`;
    return format(d, "d MMM yyyy");
  } catch {
    return "";
  }
};

interface Props {
  row: PartsRequestRow;
  jobReference: string | null;
}

const PartRequestCard = ({ row, jobReference }: Props) => {
  const navigate = useNavigate();
  const status = PART_STATUS_CONFIG[row.status] ?? {
    label: row.status,
    bg: "bg-muted",
    text: "text-muted-foreground",
  };
  const StatusIcon = ICONS[PART_STATUS_ICON_KEY[row.status as keyof typeof PART_STATUS_ICON_KEY]] ?? Clock;
  const priority = PART_PRIORITY_CONFIG[(row.priority ?? "").toLowerCase()];
  const officeUpdate = isOfficeUpdate(row);

  return (
    <div className="bg-card rounded-2xl border border-border/60 p-4 space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        {row.service_call_id ? (
          <button
            onClick={() => navigate(`/engineer/job/${row.service_call_id}`)}
            className="text-[13px] font-extrabold text-primary min-h-[24px] text-left"
          >
            {jobReference ?? "View job"}
          </button>
        ) : (
          <span className="text-[13px] font-bold text-muted-foreground/70">No job linked</span>
        )}
        <span
          className={`inline-flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold ${status.bg} ${status.text}`}
        >
          <StatusIcon className="w-3.5 h-3.5" strokeWidth={2.5} />
          {status.label}
        </span>
      </div>

      <div className="text-[15px] font-extrabold text-foreground leading-tight">
        {row.customer_name || "Unknown customer"}
      </div>

      <div className="text-[14px] text-foreground/90 leading-snug">
        {row.description}
        {row.quantity > 1 && (
          <span className="text-muted-foreground font-semibold"> · ×{row.quantity}</span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {priority && (
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${priority.bg} ${priority.text}`}
          >
            {priority.emoji} {priority.label}
          </span>
        )}
        <span className="text-[12px] text-muted-foreground font-medium">
          {formatCreated(row.created_at)}
        </span>
      </div>

      {row.notes && (
        <div
          className={`rounded-xl p-2.5 text-[13px] leading-snug ${
            officeUpdate
              ? "bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]"
              : "bg-secondary text-foreground/80 border border-border/60"
          }`}
        >
          <div className="flex items-center gap-1.5 text-[11px] font-bold mb-1 uppercase tracking-wide">
            {officeUpdate ? (
              <>
                <Building2 className="w-3.5 h-3.5" /> Update from office
              </>
            ) : (
              <>
                <StickyNote className="w-3.5 h-3.5" /> Note
              </>
            )}
          </div>
          {row.notes}
        </div>
      )}
    </div>
  );
};

export default PartRequestCard;
