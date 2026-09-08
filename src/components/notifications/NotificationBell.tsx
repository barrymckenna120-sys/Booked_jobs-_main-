import { Bell } from "lucide-react";
import HeaderIconButton from "@/components/shared/HeaderIconButton";

interface Props {
  unreadCount: number;
  onClick: () => void;
  className?: string;
  /** Header sits on a coloured background (engineer app). */
  tone?: "default" | "onColor";
}

const NotificationBell = ({ unreadCount, onClick, className = "", tone = "default" }: Props) => (
  <HeaderIconButton onClick={onClick} tone={tone} className={className} aria-label="Notifications" title="Notifications">
    <Bell />
    {unreadCount > 0 && (
      <span className="absolute top-0.5 right-0.5 bg-destructive text-destructive-foreground text-[10px] font-extrabold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
        {unreadCount > 99 ? "99+" : unreadCount}
      </span>
    )}
  </HeaderIconButton>
);

export default NotificationBell;
