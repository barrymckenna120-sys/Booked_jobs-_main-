import type { ReactNode } from "react";
import AppLogo from "@/components/shared/AppLogo";

interface MobileWorkspaceHeaderProps {
  /** Compact workspace identity label. */
  identity: ReactNode;
  /** The single workspace switch control, when the user is allowed one. */
  switchControl?: ReactNode;
  /** Notification bell. */
  bell?: ReactNode;
  /** The single "More" menu. */
  overflow?: ReactNode;
  className?: string;
}

/**
 * Shared mobile header shell used identically by both workspaces:
 * logo → workspace identity → workspace switch → bell → More.
 * Mobile only — desktop shells render their own headers.
 */
const MobileWorkspaceHeader = ({
  identity,
  switchControl,
  bell,
  overflow,
  className = "",
}: MobileWorkspaceHeaderProps) => (
  <header
    className={`md:hidden sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-card px-3 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] min-w-0 ${className}`}
  >
    <AppLogo className="shrink-0" />
    <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
      {identity}
      {switchControl}
    </div>
    <div className="flex shrink-0 items-center gap-1">
      {bell}
      {overflow}
    </div>
  </header>
);

export default MobileWorkspaceHeader;
