import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { X, Wrench, XCircle, ArrowRightLeft, Ban, CheckCircle2, Banknote, Mail, Navigation, MapPinCheck, Play, Video, AlertTriangle, Lock } from "lucide-react";
import type { AppNotification } from "@/hooks/useNotifications";

const typeConfig: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  new_job:           { icon: Wrench,         color: "text-emerald-500", bg: "bg-emerald-500/10", label: "New Job" },
  cancelled:         { icon: XCircle,        color: "text-destructive", bg: "bg-destructive/10", label: "Cancelled" },
  reassigned:        { icon: ArrowRightLeft, color: "text-amber-500",   bg: "bg-amber-500/10",   label: "Reassigned" },
  no_show:           { icon: Ban,            color: "text-destructive", bg: "bg-destructive/10", label: "No Show" },
  completed:         { icon: CheckCircle2,   color: "text-emerald-500", bg: "bg-emerald-500/10", label: "Completed" },
  parts_needed:      { icon: Wrench,        color: "text-amber-500",   bg: "bg-amber-500/10",   label: "Parts Needed" },
  payment_collected: { icon: Banknote,       color: "text-emerald-500", bg: "bg-emerald-500/10", label: "Payment" },
  message:           { icon: Mail,           color: "text-blue-500",    bg: "bg-blue-500/10",    label: "Message" },
  en_route:          { icon: Navigation,     color: "text-blue-500",    bg: "bg-blue-500/10",    label: "En Route" },
  on_site:           { icon: MapPinCheck,    color: "text-emerald-500", bg: "bg-emerald-500/10", label: "On Site" },
  in_progress:       { icon: Play,           color: "text-amber-500",   bg: "bg-amber-500/10",   label: "In Progress" },
  new_video_uploaded:{ icon: Video,          color: "text-purple-500",  bg: "bg-purple-500/10",  label: "New Video" },
  quote_accepted:    { icon: CheckCircle2,   color: "text-emerald-500", bg: "bg-emerald-500/10", label: "Quote Accepted" },
  follow_up:         { icon: AlertTriangle,  color: "text-amber-500",   bg: "bg-amber-500/10",   label: "Follow-up" },
  user_locked_out:   { icon: Lock,           color: "text-destructive", bg: "bg-destructive/10", label: "User Locked Out" },
};

const AUTO_DISMISS_MS = 15000;
const HIGH_PRIORITY_DISMISS_MS = 20000;
const HIGH_PRIORITY_TYPES = new Set(["new_job", "cancelled", "reassigned", "no_show", "quote_accepted", "follow_up", "parts_needed"]);

interface Props {
  notifications: AppNotification[];
  onDismiss: (id: string) => void;
  onMarkRead: (id: string) => void;
  jobPathPrefix?: string;
}

const NotificationBanner = ({ notifications, onDismiss, onMarkRead, jobPathPrefix = "/jobs" }: Props) => {
  const navigate = useNavigate();
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Auto-dismiss each notification
  useEffect(() => {
    notifications.forEach((n) => {
      if (!timersRef.current.has(n.id)) {
        const delay = HIGH_PRIORITY_TYPES.has(n.notification_type) ? HIGH_PRIORITY_DISMISS_MS : AUTO_DISMISS_MS;
        const timer = setTimeout(() => {
          onDismiss(n.id);
          timersRef.current.delete(n.id);
        }, delay);
        timersRef.current.set(n.id, timer);
      }
    });
  }, [notifications, onDismiss]);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  const handleTap = (e: React.MouseEvent | React.TouchEvent, n: AppNotification) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      onMarkRead(n.id);
      onDismiss(n.id);
      if (n.job_id) {
        navigate(`${jobPathPrefix}/${n.job_id}`);
      }
    } catch {}
  };

  const handleClose = (e: React.MouseEvent | React.TouchEvent, id: string) => {
    e.stopPropagation();
    e.preventDefault();
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
    const match = n.title.match(/KN-[0-9]+|BJ-[A-Z0-9]+|— [A-Z0-9-]+/);
    if (match) return match[0].replace("— ", "");
    return null;
  };

  return (
    <div
      className="fixed top-14 left-0 right-0 z-[9999] pointer-events-none flex flex-col items-center gap-2.5 px-2 md:px-4 pt-2"
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
      onTouchEnd={(e) => { e.stopPropagation(); }}
    >
      {notifications.map((n) => {
        const cfg = typeConfig[n.notification_type] || typeConfig.new_job;
        const Icon = cfg.icon;
        const jobRef = getJobRef(n);

        return (
          <div
            key={n.id}
            className="w-full max-w-full md:max-w-[540px] pointer-events-auto animate-notif-slide-in"
          >
            <div
              onClick={(e) => handleTap(e, n)}
              onTouchEnd={(e) => { e.stopPropagation(); }}
              className="w-full rounded-xl border border-border bg-card/95 backdrop-blur-md shadow-lg cursor-pointer active:bg-muted/50 transition-colors"
            >
              <div className="px-4 md:px-5 py-3.5 md:py-4 flex items-center gap-3">
                {/* Icon */}
                <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${cfg.bg}`}>
                  <Icon className={`w-5 h-5 ${cfg.color}`} />
                </div>

                {/* Type label */}
                <span className={`shrink-0 text-[11px] md:text-[10px] font-extrabold uppercase tracking-wider ${cfg.color}`}>
                  {cfg.label}
                </span>

                {/* Message */}
                <div className="flex-1 min-w-0">
                  <span className="text-[15px] md:text-[14px] font-bold text-foreground truncate block leading-snug">{n.body && n.body.length > 60 ? n.body.substring(0, 60) + "…" : n.body}</span>
                </div>

                {/* Job ref */}
                {jobRef && (
                  <span className="shrink-0 text-[12px] md:text-[11px] font-bold text-primary bg-primary/10 rounded-md px-2.5 py-1">
                    {jobRef}
                  </span>
                )}

                {/* Dismiss — min 44px tap target for iOS */}
                <button
                  onClick={(e) => handleClose(e, n.id)}
                  onTouchEnd={(e) => handleClose(e, n.id)}
                  className="shrink-0 min-w-[44px] min-h-[44px] w-11 h-11 flex items-center justify-center rounded-lg text-muted-foreground/60 active:text-foreground active:bg-muted transition-colors"
                  aria-label="Dismiss"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default NotificationBanner;
