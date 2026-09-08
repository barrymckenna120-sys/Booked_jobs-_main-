import type { LucideIcon } from "lucide-react";

interface WorkspaceIdentityProps {
  /** Current workspace name, e.g. "Office" or "Engineer". */
  label: string;
  icon: LucideIcon;
}

/**
 * Compact workspace identity label for the mobile header. Plain text with a
 * very subtle container — just enough contrast to read as the current context.
 */
const WorkspaceIdentity = ({ label, icon: Icon }: WorkspaceIdentityProps) => (
  <div className="flex shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3.5 min-h-[44px] text-[14px] font-bold text-foreground">
    <Icon className="w-5 h-5 shrink-0 text-muted-foreground" strokeWidth={2.25} />
    <span className="whitespace-nowrap">{label}</span>
  </div>
);

export default WorkspaceIdentity;
