import type { LucideIcon } from "lucide-react";

interface WorkspaceIdentityProps {
  /** Current workspace name, e.g. "Office" or "Engineer". */
  label: string;
  icon: LucideIcon;
}

/**
 * Current-workspace identity for the mobile header. Plain, non-interactive
 * label — no border, background, or click affordance — so it clearly reads
 * "this is where I am" and is never confused with the destination switch.
 */
const WorkspaceIdentity = ({ label, icon: Icon }: WorkspaceIdentityProps) => (
  <div className="flex min-w-0 shrink items-center justify-center gap-1.5 px-0.5 max-w-full text-[11px] font-bold text-foreground select-none">
    <Icon className="hidden min-[375px]:block w-5 h-5 shrink-0 text-muted-foreground" strokeWidth={2.25} />
    <span className="whitespace-nowrap truncate">{label}</span>
  </div>
);

export default WorkspaceIdentity;
