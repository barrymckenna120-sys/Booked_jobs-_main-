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
    className={`flex shrink-0 items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3.5 min-h-[44px] text-[14px] font-bold text-primary active:opacity-70 transition-colors ${className}`}
  >
    <Icon className="w-5 h-5 shrink-0" strokeWidth={2.25} />
    <span className="whitespace-nowrap">{label}</span>
  </button>
);

export default WorkspaceSwitchButton;
