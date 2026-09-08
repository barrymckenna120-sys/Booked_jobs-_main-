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
  <div className="flex min-w-0 shrink items-center justify-center gap-1 rounded-lg border border-border bg-card px-2 min-h-[44px] max-w-full text-[12px] font-bold text-foreground">
    <Icon className="w-[22px] h-[22px] shrink-0 text-muted-foreground" strokeWidth={2.25} />
    <span className="whitespace-nowrap truncate">{label}</span>
  </div>
);

export default WorkspaceIdentity;
