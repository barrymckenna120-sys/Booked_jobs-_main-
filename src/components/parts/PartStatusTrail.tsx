import { buildPartStatusTrail } from "@/lib/partsStatus";
import { formatPartTimestamp } from "@/lib/partsDates";

/**
 * BJ-0069/0070 — the permanent status trail for a single part.
 *
 * Shows every stage the part actually reached with its own date and time, so the
 * record still reads correctly months later. Shared by the customer record and
 * the Job Detail parts section so the two can't drift.
 */
const DOT_COLOUR: Record<string, string> = {
  logged: "bg-amber-500",
  ordered: "bg-blue-500",
  ready: "bg-[#7C3AED]",
  
  cancelled: "bg-muted-foreground",
};

interface Props {
  row: {
    created_at?: string | null;
    ordered_at?: string | null;
    ready_at?: string | null;
    
    cancelled_at?: string | null;
    status?: string | null;
  };
  /** Optional trailing note per stage, e.g. who cancelled it. */
  cancelledBy?: string | null;
  className?: string;
}

const PartStatusTrail = ({ row, cancelledBy, className = "" }: Props) => {
  const steps = buildPartStatusTrail(row);
  if (steps.length === 0) return null;

  return (
    <ol className={`space-y-1 ${className}`}>
      {steps.map((step) => (
        <li key={step.key} className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${DOT_COLOUR[step.key] ?? "bg-border"}`} />
          <span className="font-semibold text-foreground/80">{step.label}</span>
          <span className="font-mono">{formatPartTimestamp(step.at)}</span>
          {step.key === "cancelled" && cancelledBy && <span>· {cancelledBy}</span>}
        </li>
      ))}
    </ol>
  );
};

export default PartStatusTrail;
