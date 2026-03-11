import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { X, Mail } from "lucide-react";

interface MessageAlert {
  id: string;
  notificationId: string;
  senderName: string;
  message: string;
  jobId: string | null;
}

// ─── Distinct message sound (880Hz sine, not square) ───
let msgAudioCtx: AudioContext | null = null;

function getMsgAudioContext(): AudioContext | null {
  if (msgAudioCtx && msgAudioCtx.state !== "closed") return msgAudioCtx;
  try {
    msgAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    return msgAudioCtx;
  } catch {
    return null;
  }
}

function playMessageBeep() {
  try {
    const ctx = getMsgAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    // 880Hz sine, 150ms — 80ms gap — 880Hz sine, 150ms, gain 0.8
    [0, 0.23].forEach((delay) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.8;
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.15);
    });
  } catch {}
}

// Unlock on first tap
function unlockMsgAudio() {
  const handler = () => {
    const ctx = getMsgAudioContext();
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    document.removeEventListener("touchstart", handler, true);
    document.removeEventListener("click", handler, true);
  };
  document.addEventListener("touchstart", handler, { capture: true, passive: true });
  document.addEventListener("click", handler, { capture: true });
}

const MessageAlertBanner = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<MessageAlert[]>([]);
  const unlocked = useRef(false);

  useEffect(() => {
    if (!unlocked.current) {
      unlockMsgAudio();
      unlocked.current = true;
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("message-alerts")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_user_id=eq.${user.id}`,
        },
        (payload) => {
          const n = payload.new as any;
          if (n.notification_type !== "message") return;

          playMessageBeep();

          const senderName = n.title?.replace("Message from ", "") || "Unknown";
          const alert: MessageAlert = {
            id: crypto.randomUUID(),
            notificationId: n.id,
            senderName,
            message: n.body || "",
            jobId: n.job_id,
          };
          setAlerts((prev) => [alert, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const handleView = useCallback((e: React.MouseEvent | React.TouchEvent, alert: MessageAlert) => {
    e.stopPropagation();
    e.preventDefault();
    // Mark notification as read
    supabase.from("notifications").update({ is_read: true }).eq("id", alert.notificationId).then(() => {});
    setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
    if (alert.jobId) navigate(`/jobs/${alert.jobId}`);
  }, [navigate]);

  const handleDismiss = useCallback((e: React.MouseEvent | React.TouchEvent, alert: MessageAlert) => {
    e.stopPropagation();
    e.preventDefault();
    supabase.from("notifications").update({ is_read: true }).eq("id", alert.notificationId).then(() => {});
    setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
  }, []);

  if (alerts.length === 0) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] flex flex-col items-stretch gap-0"
      onClick={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className="w-full px-4 py-3 flex items-center gap-3 text-white font-bold text-sm animate-notif-slide-in"
          style={{ background: "linear-gradient(135deg, #F59E0B, #D97706)" }}
        >
          <Mail className="w-5 h-5 shrink-0" />
          <span className="flex-1 min-w-0 truncate">
            📩 Message from {alert.senderName}: {alert.message.substring(0, 60)}{alert.message.length > 60 ? "…" : ""}
          </span>
          {alert.jobId && (
            <button
              onClick={(e) => handleView(e, alert)}
              onTouchEnd={(e) => handleView(e, alert)}
              className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              View Job
            </button>
          )}
          <button
            onClick={(e) => handleDismiss(e, alert)}
            onTouchEnd={(e) => handleDismiss(e, alert)}
            className="shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-white/20 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      ))}
    </div>
  );
};

export default MessageAlertBanner;
