import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { playDoubleBeep, playSoftChime, playEngineerMessageAlert } from "@/utils/audio";
import { debugLog } from "@/utils/debugLog";

export type NotificationType =
  | "new_job"
  | "cancelled"
  | "rescheduled"
  | "reassigned"
  | "no_show"
  | "completed"
  | "parts_needed"
  | "parts_cancelled"
  | "parts_update"
  | "payment_collected"
  | "payment_failed"
  | "en_route"
  | "on_site"
  | "in_progress"
  | "new_video_uploaded"
  | "quote_accepted"
  | "follow_up"
  | "schedule_update"
  | "message";

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

type ProfileSoundPreference = {
  sound_alerts_enabled: boolean | null;
};

const HIGH_PRIORITY_TYPES = new Set(["new_job", "cancelled", "reassigned", "no_show", "new_video_uploaded"]);

// Vibration for high-priority notifications (double pulse)
function vibrateHighPriority() {
  try {
    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200]);
    }
    } catch {
      return;
    }
}

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState<boolean | null>(true);
  const soundEnabledRef = useRef<boolean | null>(true);
  const [soundPromptShown, setSoundPromptShown] = useState(false);
  const [bannerNotifications, setBannerNotifications] = useState<AppNotification[]>([]);
  const dismissBanner = useCallback((id: string) => {
    setBannerNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // Audio unlock is now handled globally in AppLayout via unlockAudio()

  // Server-side unread count — not limited by the 50-row drawer fetch.
  // Keeps the explicit recipient_user_id filter: the RLS SELECT policy allows
  // org-wide reads for admin/owner/office, so omitting it would inflate this.
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnreadCount = useCallback(async () => {
    if (!user) return;
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_user_id", user.id)
      .eq("is_read", false);
    setUnreadCount(count || 0);
  }, [user]);

  const refreshUnreadCountRef = useRef(refreshUnreadCount);
  useEffect(() => {
    refreshUnreadCountRef.current = refreshUnreadCount;
  }, [refreshUnreadCount]);

  // Fetch existing notifications
  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("recipient_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setNotifications((data as AppNotification[]) || []);
    console.log("[useNotifications] initial fetch", { userId: user.id, rows: (data ?? []).length, unread: (data ?? []).filter((n: any) => !n.is_read).length });
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchNotifications();
    refreshUnreadCount();
  }, [user, fetchNotifications, refreshUnreadCount]);

  // Fetch sound preference
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("sound_alerts_enabled")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (cancelled) return;
        if (data) {
          const val = (data as ProfileSoundPreference).sound_alerts_enabled;
          if (val === null) {
            // Default to enabled so notification sounds play out of the box.
            setSoundEnabled(true);
          } else {
            setSoundEnabled(val);
          }
        } else {
          // No profile row yet — still allow sounds by default.
          setSoundEnabled(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user]);



  // Real-time subscription — supabase-js uses WebSocket under the hood
  // but the channel API auto-reconnects which is fine for iOS WebKit.
  // Depend on user?.id (stable) rather than the full user object so
  // token-refresh events don't tear down and rebuild the subscription.
  // Channel name is user-scoped to prevent silent no-op collisions when
  // multiple layouts (AppLayout/EngineerLayout) mount concurrently.
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`notifications-realtime-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_user_id=eq.${userId}`,
        },
        (payload) => {
          const n = payload.new as AppNotification;
          console.log("[useNotifications] realtime insert", n.notification_type, n.id, "recipient:", n.recipient_user_id);
          setNotifications((prev) => [n, ...prev]);
          if (!n.is_read) setUnreadCount((c) => c + 1);
          // Reconcile against the server (ref, so this handler isn't re-subscribed)
          refreshUnreadCountRef.current?.();


          // initialLoadDone guard removed — Realtime INSERT only fires for rows
          // created after subscribe, so the 1s suppression skipped real alerts.
          setBannerNotifications((prev) => [n, ...prev]);

          // Play sound + vibrate for high priority (read from ref to avoid re-subscribing)
          if (soundEnabledRef.current) {
            if (n.notification_type === "message") {
              debugLog("Sound trigger fired, soundEnabled:", soundEnabledRef.current, "type:", n.notification_type);
              playEngineerMessageAlert();
            } else if (n.notification_type === "completed") {
              playSoftChime();
            } else {
              playDoubleBeep();
            }
          }
          if (HIGH_PRIORITY_TYPES.has(n.notification_type)) {
            vibrateHighPriority();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Keep ref in sync so the realtime handler always sees the latest preference
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  const markAsRead = useCallback(async (id: string) => {
    setUnreadCount((c) => Math.max(0, c - 1));
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    refreshUnreadCount();
  }, [refreshUnreadCount]);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    setUnreadCount(0);
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("recipient_user_id", user.id)
      .eq("is_read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    refreshUnreadCount();
  }, [user, refreshUnreadCount]);

  const dismiss = useCallback(async (id: string) => {
    let wasUnread = false;
    setNotifications((prev) => {
      wasUnread = prev.some((n) => n.id === id && !n.is_read);
      return prev.filter((n) => n.id !== id);
    });
    if (wasUnread) setUnreadCount((c) => Math.max(0, c - 1));
    const { error } = await supabase.from("notifications").delete().eq("id", id);
    if (error) {
      console.error("Failed to delete notification:", error);
      fetchNotifications();
    }
    refreshUnreadCount();
  }, [fetchNotifications, refreshUnreadCount]);

  const enableSound = useCallback(
    async (enabled: boolean) => {
      setSoundEnabled(enabled);
      setSoundPromptShown(false);
      if (user) {
        await supabase
          .from("profiles")
          .update({ sound_alerts_enabled: enabled })
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
