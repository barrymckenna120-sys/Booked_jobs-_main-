import { useState } from "react";
import { StickyNote, Building2, XCircle, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { partStatusGlyph } from "@/components/parts/PartStatusIcon";
import EngineerSheet from "./EngineerSheet";
import { Button } from "@/components/ui/button";
import { updatePartStatus } from "@/lib/partsRequests";
import { formatPartStatusStamp, formatPartTimestamp } from "@/lib/partsDates";
import {
  PART_PRIORITY_CONFIG,
  PART_STATUS_CONFIG,
  canEngineerCancelPart,
  isOfficeUpdate,
  type PartsRequestRow,
} from "@/lib/partsStatus";



interface Props {
  row: PartsRequestRow;
  jobReference: string | null;
  /** Resolved display name (row.customer_name, or looked up from customer_id). */
  customerName?: string | null;
  /** Current engineer's auth uid — drives whether cancel is offered at all. */
  userId?: string | null;
  onCancelled?: () => void;
  /** Ring the card when opened from a parts notification deep link. */
  highlighted?: boolean;
}

const PartRequestCard = ({
  row,
  jobReference,
  customerName,
  userId = null,
  onCancelled,
  highlighted = false,
}: Props) => {
  const displayCustomer = customerName ?? row.customer_name ?? null;
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const status = PART_STATUS_CONFIG[row.status] ?? {
    label: row.status,
    bg: "bg-muted",
    text: "text-muted-foreground",
  };
  const StatusIcon = partStatusGlyph(row.status);
  const priority = PART_PRIORITY_CONFIG[(row.priority ?? "").toLowerCase()];
  const officeUpdate = isOfficeUpdate(row);
  const canCancel = canEngineerCancelPart(row, userId);

  const cancel = async () => {
    setSaving(true);
    const { error } = await updatePartStatus(row.id, "Cancelled");
    setSaving(false);
    if (error) {
      toast.error("Couldn't cancel this part request", { description: error.message });
      return;
    }
    setConfirming(false);
    toast.success("Part request cancelled", { description: "The office has been notified." });
    onCancelled?.();
  };

  return (
    <div
      id={`part-${row.id}`}
      className={`bg-card rounded-2xl border p-4 space-y-2.5 ${
        highlighted ? "border-primary ring-2 ring-primary/40" : "border-border/60"
      }`}
    >
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
        {displayCustomer || "Unknown customer"}
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

      {canCancel && (
        <button
          onClick={() => setConfirming(true)}
          className="w-full min-h-[44px] rounded-xl border border-border bg-card text-destructive text-[13px] font-bold flex items-center justify-center gap-1.5"
        >
          <XCircle className="w-4 h-4" strokeWidth={2.5} /> Cancel Request
        </button>
      )}

      {confirming && (
        <EngineerSheet onClose={() => !saving && setConfirming(false)}>
          <div className="px-5 py-3 border-b border-border">
            <div className="text-xl font-extrabold text-foreground flex items-center gap-2">
              <XCircle className="w-5 h-5 text-destructive" /> Cancel Part Request
            </div>
            <div className="text-[13px] text-muted-foreground mt-0.5">
              {displayCustomer || "Unknown customer"}
            </div>
          </div>
          <div className="px-5 pt-4 space-y-3">
            <div className="text-sm text-muted-foreground">
              This cancels <span className="font-bold text-foreground">{row.description}</span>. The
              office will be notified automatically.
            </div>
            <Button
              className="w-full h-12 text-base font-extrabold bg-destructive hover:bg-destructive/90 text-destructive-foreground gap-2"
              disabled={saving}
              onClick={cancel}
            >
              {saving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <XCircle className="w-5 h-5" />
              )}
              Cancel Request
            </Button>
            <button
              onClick={() => setConfirming(false)}
              disabled={saving}
              className="w-full text-center text-muted-foreground text-sm font-semibold py-1"
            >
              Keep it
            </button>
          </div>
        </EngineerSheet>
      )}
    </div>
  );
};

export default PartRequestCard;
