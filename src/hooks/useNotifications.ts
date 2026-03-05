import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type NotificationType =
  | "new_job"
  | "cancelled"
  | "reassigned"
  | "new_repair"
  | "no_show"
  | "completed"
  | "parts_needed"
  | "payment_collected";

export interface AppNotification {
  id: string;
  recipient_user_id: string;
  notification_type: NotificationType;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
  job_id: string | null;
  role: string | null;
}

const HIGH_PRIORITY_TYPES = new Set(["new_job", "cancelled", "reassigned", "no_show"]);

// ─── iOS-safe AudioContext singleton ───
// iOS Safari/Chrome require an AudioContext to be created & resumed
// inside a user-gesture handler. We do this once on the first tap,
// then reuse the same context for every notification sound.
let sharedAudioCtx: AudioContext | null = null;
let audioUnlocked = false;

function getAudioContext(): AudioContext | null {
  if (sharedAudioCtx && sharedAudioCtx.state !== "closed") return sharedAudioCtx;
  try {
    sharedAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

function unlockAudioOnFirstTap() {
  if (audioUnlocked) return;

  const handler = () => {
    const ctx = getAudioContext();
    if (ctx) {
      // Resume returns a promise; on iOS this is required inside a gesture
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
      // Play a silent buffer to fully unlock the context
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
    }
    audioUnlocked = true;
    document.removeEventListener("touchstart", handler, true);
    document.removeEventListener("click", handler, true);
  };

  document.addEventListener("touchstart", handler, { capture: true, passive: true });
  document.addEventListener("click", handler, { capture: true });
}

// Vibration for high-priority notifications (double pulse)
function vibrateHighPriority() {
  try {
    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200]);
    }
  } catch {}
}

// Web Audio API sounds — reuse pre-unlocked context
function playDoubleBeep() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    [0, 0.15].forEach((delay) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = 880;
      gain.gain.value = 0.15;
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.1);
    });
  } catch {}
}

function playSoftChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 440;
    gain.gain.value = 0.12;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch {}
}

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState<boolean | null>(null);
  const [soundPromptShown, setSoundPromptShown] = useState(false);
  const initialLoadDone = useRef(false);
  const [bannerNotifications, setBannerNotifications] = useState<AppNotification[]>([]);
  const dismissBanner = useCallback((id: string) => {
    setBannerNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // Unlock audio on first user gesture (critical for iOS)
  useEffect(() => {
    unlockAudioOnFirstTap();
  }, []);

  // Fetch existing notifications
  useEffect(() => {
    if (!user) return;
    initialLoadDone.current = false;

    const fetchNotifs = async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("recipient_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      setNotifications((data as AppNotification[]) || []);
      setLoading(false);
      setTimeout(() => { initialLoadDone.current = true; }, 1000);
    };
    fetchNotifs();
  }, [user]);

  // Fetch sound preference
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("sound_alerts_enabled")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          const val = (data as any).sound_alerts_enabled;
          if (val === null) {
            setSoundPromptShown(true);
            setSoundEnabled(false);
          } else {
            setSoundEnabled(val);
          }
        }
      });
  }, [user]);

  // Real-time subscription — supabase-js uses WebSocket under the hood
  // but the channel API auto-reconnects which is fine for iOS WebKit
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_user_id=eq.${user.id}`,
        },
        (payload) => {
          const n = payload.new as AppNotification;
          setNotifications((prev) => [n, ...prev]);

          if (initialLoadDone.current) {
            // Show banner
            setBannerNotifications((prev) => [n, ...prev]);

            // Play sound + vibrate for high priority
            if (soundEnabled) {
              if (n.notification_type === "completed") {
                playSoftChime();
              } else {
                playDoubleBeep();
              }
            }
            if (HIGH_PRIORITY_TYPES.has(n.notification_type)) {
              vibrateHighPriority();
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, soundEnabled]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markAsRead = useCallback(async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  }, []);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("recipient_user_id", user.id)
      .eq("is_read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }, [user]);

  const dismiss = useCallback(async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const enableSound = useCallback(
    async (enabled: boolean) => {
      setSoundEnabled(enabled);
      setSoundPromptShown(false);
      if (user) {
        await supabase
          .from("profiles")
          .update({ sound_alerts_enabled: enabled } as any)
          .eq("user_id", user.id);
      }
    },
    [user]
  );

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllRead,
    dismiss,
    soundEnabled,
    soundPromptShown,
    enableSound,
    bannerNotifications,
    dismissBanner,
  };
}
