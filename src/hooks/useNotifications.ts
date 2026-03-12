import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { playDoubleBeep, playSoftChime } from "@/utils/audio";

export type NotificationType =
  | "new_job"
  | "cancelled"
  | "reassigned"
  | "new_repair"
  | "no_show"
  | "completed"
  | "parts_needed"
  | "payment_collected"
  | "en_route"
  | "on_site"
  | "in_progress"
  | "new_video_uploaded";

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

const HIGH_PRIORITY_TYPES = new Set(["new_job", "cancelled", "reassigned", "no_show", "new_video_uploaded"]);

// Vibration for high-priority notifications (double pulse)
function vibrateHighPriority() {
  try {
    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200]);
    }
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

  // Audio unlock is now handled globally in AppLayout via unlockAudio()

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
