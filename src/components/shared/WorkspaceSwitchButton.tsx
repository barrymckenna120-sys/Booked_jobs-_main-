import type { LucideIcon } from "lucide-react";

interface WorkspaceSwitchButtonProps {
  /** Label of the workspace the user moves to, e.g. "Engineer" or "Office". */
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  className?: string;
}

/**
 * Mobile-only workspace switch. Presentation only — the caller decides whether
 * the control is rendered at all, so permission handling stays where it is.
 * There is exactly one of these visible on mobile at any time.
 */
const WorkspaceSwitchButton = ({ label, icon: Icon, onClick, className = "" }: WorkspaceSwitchButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={`Switch to ${label}`}
    title={`Switch to ${label}`}
    className={`flex min-w-0 shrink items-center justify-center gap-1 rounded-lg border border-primary/40 bg-primary/5 px-2 min-h-[44px] max-w-full text-[11px] font-bold text-primary active:opacity-70 transition-colors ${className}`}
  >
    <Icon className="w-[22px] h-[22px] shrink-0" strokeWidth={2.25} />
    <span className="whitespace-nowrap truncate">{label}</span>
  </button>
);

export default WorkspaceSwitchButton;
