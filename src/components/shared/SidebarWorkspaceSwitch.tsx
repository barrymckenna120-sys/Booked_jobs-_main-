import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SidebarWorkspaceSwitchProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}

export default function SidebarWorkspaceSwitch({
  icon: Icon,
  label,
  onClick,
}: SidebarWorkspaceSwitchProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className="h-10 w-full justify-start gap-3 rounded-md px-3 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <Icon className="h-[19px] w-[19px] shrink-0" strokeWidth={2} />
      <span className="text-left">{label}</span>
    </Button>
  );
}