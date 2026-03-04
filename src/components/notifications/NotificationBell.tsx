import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  unreadCount: number;
  onClick: () => void;
}

const NotificationBell = ({ unreadCount, onClick }: Props) => (
  <Button variant="ghost" size="icon" className="relative" onClick={onClick} aria-label="Notifications">
    <Bell className="w-5 h-5" />
    {unreadCount > 0 && (
      <span className="absolute -top-0.5 -right-0.5 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
        {unreadCount > 99 ? "99+" : unreadCount}
      </span>
    )}
  </Button>
);

export default NotificationBell;
