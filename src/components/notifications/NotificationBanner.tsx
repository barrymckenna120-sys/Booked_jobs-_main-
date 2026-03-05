import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { X, Wrench, XCircle, ArrowRightLeft, Zap, Ban, CheckCircle2, Cog, Banknote } from "lucide-react";
import type { AppNotification } from "@/hooks/useNotifications";
import { AnimatePresence, motion } from "framer-motion";

const typeConfig: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  new_job:           { icon: Wrench,         color: "text-emerald-500", bg: "bg-emerald-500/10", label: "New Job" },
  cancelled:         { icon: XCircle,        color: "text-destructive", bg: "bg-destructive/10", label: "Cancelled" },
  reassigned:        { icon: ArrowRightLeft, color: "text-amber-500",   bg: "bg-amber-500/10",   label: "Reassigned" },
  new_repair:        { icon: Zap,            color: "text-orange-500",  bg: "bg-orange-500/10",  label: "New Repair" },
  no_show:           { icon: Ban,            color: "text-destructive", bg: "bg-destructive/10", label: "No Show" },
  completed:         { icon: CheckCircle2,   color: "text-emerald-500", bg: "bg-emerald-500/10", label: "Completed" },
  parts_needed:      { icon: Cog,            color: "text-amber-500",   bg: "bg-amber-500/10",   label: "Parts Needed" },
  payment_collected: { icon: Banknote,       color: "text-emerald-500", bg: "bg-emerald-500/10", label: "Payment" },
};

const AUTO_DISMISS_MS = 5000;

interface Props {
  notifications: AppNotification[];
  onDismiss: (id: string) => void;
  onMarkRead: (id: string) => void;
  jobPathPrefix?: string;
}

const NotificationBanner = ({ notifications, onDismiss, onMarkRead, jobPathPrefix = "/jobs" }: Props) => {
  const navigate = useNavigate();
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Auto-dismiss each notification after 5s
  useEffect(() => {
    notifications.forEach((n) => {
      if (!timersRef.current.has(n.id)) {
        const timer = setTimeout(() => {
          onDismiss(n.id);
          timersRef.current.delete(n.id);
        }, AUTO_DISMISS_MS);
        timersRef.current.set(n.id, timer);
      }
    });

    // Cleanup removed notifications
    return () => {
      // keep timers for current items, cleanup happens on unmount
    };
  }, [notifications, onDismiss]);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  const handleTap = (n: AppNotification) => {
    onMarkRead(n.id);
    onDismiss(n.id);
    if (n.job_id) {
      navigate(`${jobPathPrefix}/${n.job_id}`);
    }
  };

  const handleClose = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    onDismiss(id);
  };

  // Extract job ref from metadata or title
  const getJobRef = (n: AppNotification) => {
    const meta = n.metadata as Record<string, unknown>;
    if (meta?.job_ref) return meta.job_ref as string;
    const match = n.title.match(/BJ-[A-Z0-9]+|— [A-Z0-9-]+/);
    if (match) return match[0].replace("— ", "");
    return null;
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-[200] pointer-events-none flex flex-col items-center">
      <AnimatePresence mode="popLayout">
        {notifications.map((n) => {
          const cfg = typeConfig[n.notification_type] || typeConfig.new_job;
          const Icon = cfg.icon;
          const jobRef = getJobRef(n);

          return (
            <motion.div
              key={n.id}
              layout
              initial={{ opacity: 0, y: -60 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -40, transition: { duration: 0.2 } }}
              transition={{ type: "spring", damping: 26, stiffness: 320 }}
              className="w-full pointer-events-auto"
            >
              <div
                onClick={() => handleTap(n)}
                className="mx-auto w-full border-b border-border bg-card/95 backdrop-blur-md shadow-[0_2px_12px_rgba(0,0,0,0.08)] cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <div className="max-w-screen-xl mx-auto px-4 py-2.5 flex items-center gap-3">
                  {/* Icon */}
                  <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${cfg.bg}`}>
                    <Icon className={`w-4 h-4 ${cfg.color}`} />
                  </div>

                  {/* Type label */}
                  <span className={`shrink-0 text-[10px] font-extrabold uppercase tracking-wider ${cfg.color}`}>
                    {cfg.label}
                  </span>

                  {/* Message */}
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground truncate">{n.body}</span>
                  </div>

                  {/* Job ref */}
                  {jobRef && (
                    <span className="shrink-0 text-[11px] font-bold text-muted-foreground bg-muted rounded-md px-2 py-0.5">
                      {jobRef}
                    </span>
                  )}

                  {/* Dismiss */}
                  <button
                    onClick={(e) => handleClose(e, n.id)}
                    className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors"
                    aria-label="Dismiss"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

export default NotificationBanner;
