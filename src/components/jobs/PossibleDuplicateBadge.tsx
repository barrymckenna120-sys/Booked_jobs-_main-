import { AlertTriangle } from "lucide-react";

type Props = {
  /** service_calls.possible_duplicate — only `true` renders the badge. */
  flagged?: boolean | null;
  size?: "sm" | "md";
  className?: string;
};

/**
 * BJ-0131a — amber "Possible duplicate" badge. Purely informational: it is
 * driven directly by service_calls.possible_duplicate and has no acknowledge,
 * dismiss or resolve behaviour (that is BJ-0131d).
 *
 * Mirrors NewCustomerBadge's placement, sizing and shape precedent.
 */
const PossibleDuplicateBadge = ({ flagged, size = "md", className = "" }: Props) => {
  if (flagged !== true) return null;

  const text = size === "sm" ? "text-[9px] px-1.5 py-0" : "text-[10px] px-1.5 py-0.5";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/15 font-semibold text-amber-600 shrink-0 ${text} ${className}`}
      title="A matching job was created around the same time — this may be a duplicate"
    >
      <AlertTriangle className={size === "sm" ? "w-2.5 h-2.5" : "w-3 h-3"} strokeWidth={2} />
      Possible duplicate
    </span>
  );
};

export default PossibleDuplicateBadge;
