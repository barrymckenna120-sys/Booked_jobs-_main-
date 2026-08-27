import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Wrench, XCircle, ArrowRightLeft, Ban, CheckCircle2, Cog, Banknote, AlertTriangle, PackageCheck } from "lucide-react";
import type { AppNotification } from "@/hooks/useNotifications";
import { AnimatePresence, motion } from "framer-motion";
import { resolveNotificationTarget } from "@/lib/notificationTarget";

const typeConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  new_job:           { icon: Wrench,         color: "text-emerald-500", label: "New Job" },
  cancelled:         { icon: XCircle,        color: "text-destructive", label: "Cancelled" },
  reassigned:        { icon: ArrowRightLeft, color: "text-amber-500",   label: "Reassigned" },
  no_show:           { icon: Ban,            color: "text-destructive", label: "No Show" },
  completed:         { icon: CheckCircle2,   color: "text-emerald-500", label: "Completed" },
  parts_needed:      { icon: Cog,            color: "text-amber-500",   label: "Parts Needed" },
  parts_requested:   { icon: Cog,            color: "text-amber-500",   label: "New Parts Request" },
  parts_cancelled:   { icon: XCircle,        color: "text-destructive", label: "Part Cancelled" },
  parts_update:      { icon: PackageCheck,   color: "text-amber-500",   label: "Part Update" },
  payment_collected: { icon: Banknote,       color: "text-emerald-500", label: "Payment" },
  payment_failed:    { icon: XCircle,        color: "text-destructive", label: "Payment Failed" },
  quote_accepted:    { icon: CheckCircle2,   color: "text-emerald-500", label: "Quote Accepted" },
  follow_up:         { icon: AlertTriangle,  color: "text-amber-500",   label: "Follow-up" },
};

interface Props {
  notification: AppNotification | null;
  onDismiss: () => void;
  onMarkRead: (id: string) => void;
  /** Navigate path prefix for engineer vs office */
  jobPathPrefix?: string;
}

const AUTO_DISMISS_MS = 5000;

const NotificationToast = ({ notification, onDismiss, onMarkRead, jobPathPrefix = "/jobs" }: Props) => {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (notification) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        setTimeout(onDismiss, 300); // wait for exit animation
      }, AUTO_DISMISS_MS);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [notification, onDismiss]);

  const handleTap = () => {
    if (!notification) return;
    onMarkRead(notification.id);
    setVisible(false);
    setTimeout(() => {
      onDismiss();
      const target = resolveNotificationTarget(notification, jobPathPrefix);
      if (target) navigate(target);
    }, 100);
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    setVisible(false);
    setTimeout(onDismiss, 300);
  };

  const cfg = notification ? (typeConfig[notification.notification_type] || typeConfig.new_job) : typeConfig.new_job;
  const Icon = cfg.icon;

  return (
    <AnimatePresence>
      {visible && notification && (
        <motion.div
          initial={{ opacity: 0, x: 60, y: -10 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, x: 60 }}
          transition={{ type: "spring", damping: 22, stiffness: 300 }}
          className="fixed top-4 right-4 z-[100] max-w-sm w-full pointer-events-auto"
        >
          <div
            onClick={handleTap}
            className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card shadow-lg cursor-pointer hover:bg-muted/50 transition-colors"
          >
            <div className={`shrink-0 mt-0.5 ${cfg.color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${cfg.color}`}>{cfg.label}</span>
              </div>
              <p className="text-sm font-bold leading-tight truncate">{notification.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">{notification.body && notification.body.length > 60 ? notification.body.substring(0, 60) + "…" : notification.body}</p>
            </div>
            <button
              onClick={handleClose}
              className="shrink-0 text-muted-foreground/50 hover:text-foreground transition-colors p-0.5"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default NotificationToast;
