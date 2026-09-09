import type { LucideIcon } from "lucide-react";

interface WorkspaceSwitchButtonProps {
  /** Label of the workspace the user moves to, e.g. "Engineer" or "Office". */
  label: string;
  /** Lucide icon shown beside the label. */
  icon?: LucideIcon;
  onClick: () => void;
  className?: string;
}

/**
 * Mobile-only workspace switch. The ONLY interactive workspace control in the
 * header: an outlined secondary button (blue text/icon, subtle border, no
 * fill) so it reads "tap to go there" and is never mistaken for the current
 * selection or the primary + New Job CTA.
 * Presentation only — the caller decides whether the control is rendered at
 * all, so permission handling stays where it is.
 */
const WorkspaceSwitchButton = ({ label, icon: Icon, onClick, className = "" }: WorkspaceSwitchButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={`Switch to ${label}`}
    title={`Switch to ${label}`}
    className={`flex min-w-0 shrink items-center justify-center gap-1 rounded-lg border border-border bg-card px-2.5 min-h-[44px] max-w-full text-[11px] font-bold text-primary active:bg-muted transition-colors ${className}`}
  >
    {Icon ? (
      <Icon className="w-5 h-5 shrink-0" strokeWidth={2.25} />
    ) : null}
    <span className="whitespace-nowrap truncate">{label}</span>
  </button>
);

export default WorkspaceSwitchButton;
