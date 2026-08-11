import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { CheckCheck, X, Wrench, XCircle, ArrowRightLeft, Ban, CheckCircle2, Banknote, Video, AlertTriangle, Lock, PackageCheck } from "lucide-react";
import type { AppNotification } from "@/hooks/useNotifications";
import { formatDistanceToNow } from "date-fns";
import { resolveNotificationTarget } from "@/lib/notificationTarget";

const typeConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  new_job:       { icon: Wrench,         color: "text-success",     label: "New Job" },
  cancelled:     { icon: XCircle,        color: "text-destructive", label: "Cancelled" },
  reassigned:    { icon: ArrowRightLeft, color: "text-amber-500",   label: "Reassigned" },
  no_show:       { icon: Ban,            color: "text-destructive", label: "No Show" },
  completed:     { icon: CheckCircle2,   color: "text-success",     label: "Completed" },
  parts_needed:      { icon: Wrench,         color: "text-amber-500",   label: "Parts Needed" },
  parts_cancelled:   { icon: XCircle,        color: "text-destructive", label: "Part Cancelled" },
  parts_update:      { icon: PackageCheck,   color: "text-amber-500",   label: "Part Update" },
  payment_collected:     { icon: Banknote,       color: "text-emerald-500", label: "Payment" },
  new_video_uploaded:    { icon: Video,          color: "text-primary",     label: "New Video" },
  quote_accepted:        { icon: CheckCircle2,   color: "text-success",     label: "Quote Accepted" },
  follow_up:             { icon: AlertTriangle,  color: "text-amber-500",   label: "Follow-up" },
  user_locked_out:       { icon: Lock,           color: "text-destructive", label: "User Locked Out" },
};

type FilterTab = "all" | "unread" | "engineer" | "office";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notifications: AppNotification[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onDismiss: (id: string) => void;
}

const TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "engineer", label: "Engineer" },
  { key: "office", label: "Office" },
];

const NotificationDrawer = ({
  open,
  onOpenChange,
  notifications,
  onMarkRead,
  onMarkAllRead,
  onDismiss,
}: Props) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<FilterTab>("all");

  const handleNotificationClick = (n: AppNotification) => {
    if (!n.is_read) onMarkRead(n.id);
    onOpenChange(false);
    const target = resolveNotificationTarget(n, "/jobs");
    if (target) navigate(target);
  };

  const filtered = notifications.filter((n) => {
    if (activeTab === "unread") return !n.is_read;
    if (activeTab === "engineer") return n.role === "engineer";
    if (activeTab === "office") return n.role === "office" || n.role === "admin";
    return true;
  });

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

        {/* Filter Tabs */}
        <div className="flex gap-1 px-4 pb-3">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                activeTab === tab.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto px-4 pb-6 space-y-2 max-h-[60vh]">
          {filtered.length === 0 && (
            <p className="text-muted-foreground text-sm text-center py-10">No notifications</p>
          )}
          {filtered.map((n) => {
            const cfg = typeConfig[n.notification_type] || typeConfig.new_job;
            const Icon = cfg.icon;
            return (
              <div
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className={`relative flex gap-3 p-3 rounded-lg border transition-colors cursor-pointer hover:bg-muted/50 ${
                  n.is_read ? "bg-card border-border/50 opacity-70" : "bg-primary/5 border-primary/20"
                }`}
              >
                <div className={`shrink-0 mt-0.5 ${cfg.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${cfg.color}`}>{cfg.label}</span>
                  </div>
                  <p className={`text-sm leading-tight ${n.is_read ? "font-medium" : "font-bold"}`}>
                    {n.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{n.body && n.body.length > 60 ? n.body.substring(0, 60) + "…" : n.body}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  {!n.is_read && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onMarkRead(n.id); }}
                      className="text-[10px] text-primary hover:underline"
                    >
                      Read
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDismiss(n.id); }}
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
