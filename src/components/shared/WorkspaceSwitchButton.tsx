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
    className={`flex shrink-0 items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/5 px-2.5 min-h-[40px] text-[13px] font-bold text-primary active:opacity-70 transition-colors ${className}`}
  >
    <Icon className="w-4 h-4 shrink-0" strokeWidth={2.25} />
    <span className="whitespace-nowrap">{label}</span>
  </button>
);

export default WorkspaceSwitchButton;
