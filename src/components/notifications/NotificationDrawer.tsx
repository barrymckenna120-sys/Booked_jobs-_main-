import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { CheckCheck, X, Briefcase, AlertTriangle, ArrowRightLeft, Wrench } from "lucide-react";
import type { AppNotification } from "@/hooks/useNotifications";
import { formatDistanceToNow } from "date-fns";

const typeConfig: Record<string, { icon: React.ElementType; color: string }> = {
  job_assigned: { icon: Briefcase, color: "text-primary" },
  job_cancelled: { icon: AlertTriangle, color: "text-destructive" },
  job_reassigned: { icon: ArrowRightLeft, color: "text-amber-500" },
  new_repair_job: { icon: Wrench, color: "text-blue-500" },
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notifications: AppNotification[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onDismiss: (id: string) => void;
}

const NotificationDrawer = ({
  open,
  onOpenChange,
  notifications,
  onMarkRead,
  onMarkAllRead,
  onDismiss,
}: Props) => {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="flex flex-row items-center justify-between pb-2">
          <DrawerTitle className="text-lg">Notifications</DrawerTitle>
          {notifications.some((n) => !n.is_read) && (
            <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={onMarkAllRead}>
              <CheckCheck className="w-3.5 h-3.5" /> Mark all read
            </Button>
          )}
        </DrawerHeader>

        <div className="overflow-y-auto px-4 pb-6 space-y-2 max-h-[65vh]">
          {notifications.length === 0 && (
            <p className="text-muted-foreground text-sm text-center py-10">No notifications yet</p>
          )}
          {notifications.map((n) => {
            const cfg = typeConfig[n.notification_type] || typeConfig.job_assigned;
            const Icon = cfg.icon;
            return (
              <div
                key={n.id}
                className={`relative flex gap-3 p-3 rounded-lg border transition-colors ${
                  n.is_read ? "bg-card border-border/50 opacity-70" : "bg-primary/5 border-primary/20"
                }`}
              >
                <div className={`shrink-0 mt-0.5 ${cfg.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-tight ${n.is_read ? "font-medium" : "font-bold"}`}>
                    {n.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{n.body}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  {!n.is_read && (
                    <button
                      onClick={() => onMarkRead(n.id)}
                      className="text-[10px] text-primary hover:underline"
                    >
                      Read
                    </button>
                  )}
                  <button
                    onClick={() => onDismiss(n.id)}
                    className="text-muted-foreground/50 hover:text-destructive"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default NotificationDrawer;
