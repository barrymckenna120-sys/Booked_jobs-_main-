import { Bell } from "lucide-react";

interface Props {
  unreadCount: number;
  onClick: () => void;
  className?: string;
}

const NotificationBell = ({ unreadCount, onClick, className = "" }: Props) => (
  <button className={`relative p-1.5 rounded-lg hover:bg-white/10 transition-colors ${className}`} onClick={onClick} aria-label="Notifications">
    <Bell className="w-7 h-7" />
    {unreadCount > 0 && (
      <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[11px] font-extrabold rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1 ring-2 ring-card">
        {unreadCount > 99 ? "99+" : unreadCount}
      </span>
    )}
  </button>
);

export default NotificationBell;
