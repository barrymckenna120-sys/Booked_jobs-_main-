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
  <div className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 min-h-[40px] text-[13px] font-bold text-foreground">
    <Icon className="w-4 h-4 shrink-0 text-muted-foreground" strokeWidth={2.25} />
    <span className="whitespace-nowrap">{label}</span>
  </div>
);

export default WorkspaceIdentity;
