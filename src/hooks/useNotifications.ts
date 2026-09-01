import {
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  playDoubleBeep,
  playSoftChime,
  playEngineerMessageAlert,
  isAudioUnlocked,
} from "@/utils/audio";
import { debugLog } from "@/utils/debugLog";
import { shouldShowOnSurface } from "@/lib/notificationSurface";
import {
  alertMarkerKey,
  nextAlertMarker,
  selectCatchUpAlerts,
} from "@/lib/notificationAlerts";
import { toast } from "sonner";

export type NotificationType =
  | "new_job"
  | "cancelled"
  | "rescheduled"
  | "reassigned"
  | "no_show"
  | "completed"
  | "parts_needed"
  | "parts_requested"
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

const HIGH_PRIORITY_TYPES = new Set([
  "new_job",
  "cancelled",
  "reassigned",
  "no_show",
  "new_video_uploaded",
  "parts_requested",
]);

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

/** Single source of truth for which sound a notification type plays. */
async function playForNotificationType(type: string) {
  if (type === "message") return playEngineerMessageAlert();
  if (type === "completed") return playSoftChime();
  return playDoubleBeep();
}



/**
 * `surface` scopes which notifications this bell shows.
 *
 * "engineer" (Engineer App) shows only `role = 'engineer'` rows, so office-only
 * alerts such as SumUp `payment_failed` never surface on an engineer's bell,
 * banner, toast or unread count.
 *
 * "office" excludes engineer-scoped rows so users who are both office and
 * engineer do not get duplicate notifications.
 */
export function useNotifications(
  surface?: "engineer" | "office"
) {
  // Engineer bell: engineer-scoped rows only.
  // Office bell: everything except engineer-scoped rows.
  //
  // `any` internally: re-parsing the query builder generics here trips
  // TS2589 (excessively deep instantiation) on the supabase-js types.
  const applyRoleScope = useCallback(
    <T,>(q: T): T => {
      const b = q as any;

      if (surface === "engineer") {
        return b.eq("role", "engineer") as T;
      }

      if (surface === "office") {
        return b.not("role", "eq", "engineer") as T;
      }

      return q;
    },
    [surface]
  );

  const { user } = useAuth();

  const [notifications, setNotifications] =
    useState<AppNotification[]>([]);

  const [loading, setLoading] = useState(true);

  const [soundEnabled, setSoundEnabled] =
    useState<boolean | null>(true);

  const soundEnabledRef =
    useRef<boolean | null>(true);

  const [soundPromptShown, setSoundPromptShown] =
    useState(false);

  const [bannerNotifications, setBannerNotifications] =
    useState<AppNotification[]>([]);

  const dismissBanner = useCallback(
    (id: string) => {
      setBannerNotifications((prev) =>
        prev.filter((n) => n.id !== id)
      );
    },
    []
  );

  // Audio unlock is handled globally in AppLayout via unlockAudio()

  // Server-side unread count — not limited by the 50-row drawer fetch.
  const [unreadCount, setUnreadCount] =
    useState(0);

  const refreshUnreadCount = useCallback(
    async () => {
      if (!user) return;

      const q = applyRoleScope(
        supabase
          .from("notifications")
          .select("id", {
            count: "exact",
            head: true,
          })
          .eq("recipient_user_id", user.id)
          .eq("is_read", false)
      );

      const { count } = await q;

      setUnreadCount(count || 0);
    },
    [user, applyRoleScope]
  );

  const refreshUnreadCountRef =
    useRef(refreshUnreadCount);

  useEffect(() => {
    refreshUnreadCountRef.current =
      refreshUnreadCount;
  }, [refreshUnreadCount]);

  // Fetch existing notifications
  const fetchNotifications = useCallback(
    async () => {
      if (!user) return;

      const q = applyRoleScope(
        supabase
          .from("notifications")
          .select("*")
          .eq("recipient_user_id", user.id)
      );

      const { data } = await q
        .order("created_at", {
          ascending: false,
        })
        .limit(50);

      const rows =
        (data as AppNotification[]) || [];

      setNotifications(rows);

      console.log(
        "[useNotifications] fetch",
        {
          userId: user.id,
          rows: rows.length,
          unread: rows.filter(
            (n) => !n.is_read
          ).length,
        }
      );

      // Catch-up alert: rows that landed while realtime was asleep
      // (backgrounded PWA) would otherwise update the bell silently.
      const key = alertMarkerKey(
        user.id,
        surface
      );

      let marker: string | null = null;
      try {
        marker = localStorage.getItem(key);
      } catch {
        marker = null;
      }

      const missed = selectCatchUpAlerts(
        rows,
        marker
      );

      const advanced = nextAlertMarker(
        rows,
        marker
      );

      try {
        if (advanced) {
          localStorage.setItem(
            key,
            advanced
          );
        }
      } catch {
        // storage unavailable — alerting still works for live events
      }

      if (
        missed.length > 0 &&
        soundEnabledRef.current
      ) {
        const newest = missed[0];

        if (
          HIGH_PRIORITY_TYPES.has(
            newest.notification_type
          )
        ) {
          vibrateHighPriority();
        }

        const result =
          await playForNotificationType(
            newest.notification_type
          );

        console.log(
          "[notif] catch-up alert",
          {
            type: newest.notification_type,
            missed: missed.length,
            played: result?.played,
            reason: result?.reason,
          }
        );
      }

      setLoading(false);
    },
    [user, applyRoleScope, surface]
  );

  const fetchNotificationsRef = useRef(
    fetchNotifications
  );

  useEffect(() => {
    fetchNotificationsRef.current =
      fetchNotifications;
  }, [fetchNotifications]);

  // TEMP INSTRUMENTATION — remove before commit
  const __prevDeps = useRef<any>({});
  useEffect(() => {
    if (!user) return;

    console.log("[TEMP notif-effect] changed:", {
      user: __prevDeps.current.user !== user,
      fetchNotifications: __prevDeps.current.fetchNotifications !== fetchNotifications,
      refreshUnreadCount: __prevDeps.current.refreshUnreadCount !== refreshUnreadCount,
      firstRun: __prevDeps.current.user === undefined,
    });
    __prevDeps.current = { user, fetchNotifications, refreshUnreadCount };

    fetchNotifications();
    refreshUnreadCount();
  }, [
    user,
    fetchNotifications,
    refreshUnreadCount,
  ]);


  // Re-check on foreground: iOS suspends the realtime socket when the PWA is
  // backgrounded, so returning to the app is the only chance to alert.
  useEffect(() => {
    if (!user) return;

    const onForeground = () => {
      if (document.visibilityState !== "visible") return;
      fetchNotificationsRef.current?.();
      refreshUnreadCountRef.current?.();
    };

    document.addEventListener(
      "visibilitychange",
      onForeground
    );
    window.addEventListener(
      "focus",
      onForeground
    );

    return () => {
      document.removeEventListener(
        "visibilitychange",
        onForeground
      );
      window.removeEventListener(
        "focus",
        onForeground
      );
    };
  }, [user]);


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
          const val =
            (data as ProfileSoundPreference)
              .sound_alerts_enabled;

          if (val === null) {
            // Default to enabled so notification sounds
            // play out of the box.
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

  // Real-time subscription — supabase-js uses WebSocket
  // under the hood and auto-reconnects.
  //
  // Depend on user?.id rather than the full user object so
  // token-refresh events don't tear down and rebuild the subscription.
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(
        `notifications-realtime-${userId}`
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_user_id=eq.${userId}`,
        },
        async (payload) => {
          const n =
            payload.new as AppNotification;

          // Engineer App ignores office-scoped alerts.
          if (
            !shouldShowOnSurface(
              n.role,
              surface
            )
          ) {
            return;
          }

          console.log(
            "[notif] Realtime INSERT received:",
            {
              id: n.id,
              type: n.notification_type,
              title: n.title,
              soundEnabled:
                soundEnabledRef.current,
              audioUnlocked:
                isAudioUnlocked(),
            }
          );

          // De-duplicate in case the initial fetch already
          // captured this row.
          setNotifications((prev) =>
            prev.some((p) => p.id === n.id)
              ? prev
              : [n, ...prev]
          );

          if (!n.is_read) {
            setUnreadCount((c) => c + 1);
          }

          // Reconcile against the server without forcing the
          // realtime subscription to be recreated.
          refreshUnreadCountRef.current?.();

          setBannerNotifications((prev) =>
            prev.some((p) => p.id === n.id)
              ? prev
              : [n, ...prev]
          );

          // Always provide a visible toast fallback.
          // Useful when the browser/device blocks audio.
          toast(n.title, {
            description: n.body,
          });

          if (
            HIGH_PRIORITY_TYPES.has(
              n.notification_type
            )
          ) {
            vibrateHighPriority();
          }

          if (!soundEnabledRef.current) {
            console.log(
              "[notif] Sound NOT played — sound_alerts_enabled is false"
            );
            return;
          }

          console.log(
            "[notif] About to call notification sound for type:",
            n.notification_type
          );

          debugLog(
            "Sound trigger fired, soundEnabled:",
            soundEnabledRef.current,
            "type:",
            n.notification_type
          );

          // Realtime rows are alerted here, so bump the catch-up marker to
          // stop the next fetch double-alerting the same notification.
          if (userId) {
            try {
              const key = alertMarkerKey(
                userId,
                surface
              );
              const prev =
                localStorage.getItem(key);
              if (
                !prev ||
                n.created_at > prev
              ) {
                localStorage.setItem(
                  key,
                  n.created_at
                );
              }
            } catch {
              // storage unavailable — live sound still plays
            }
          }

          const result =
            await playForNotificationType(
              n.notification_type
            );


          if (!result?.played) {
            console.warn(
              "[notif] Sound did not play. reason:",
              result?.reason,
              "ctx state:",
              result?.state
            );

            toast.warning(
              "Notification sound blocked",
              {
                description:
                  result?.reason ===
                    "audio-context-suspended" ||
                  result?.reason ===
                    "audio-context-interrupted"
                    ? "Tap anywhere to re-enable sound alerts."
                    : `Reason: ${
                        result?.reason ??
                        "unknown"
                      }`,
              }
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, surface]);

  // Keep ref in sync so the realtime handler
  // always sees the latest preference.
  useEffect(() => {
    soundEnabledRef.current =
      soundEnabled;
  }, [soundEnabled]);

  const markAsRead = useCallback(
    async (id: string) => {
      setUnreadCount((c) =>
        Math.max(0, c - 1)
      );

      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", id);

      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id
            ? { ...n, is_read: true }
            : n
        )
      );

      refreshUnreadCount();
    },
    [refreshUnreadCount]
  );

  const markAllRead = useCallback(
    async () => {
      if (!user) return;

      setUnreadCount(0);

      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("recipient_user_id", user.id)
        .eq("is_read", false);

      setNotifications((prev) =>
        prev.map((n) => ({
          ...n,
          is_read: true,
        }))
      );

      refreshUnreadCount();
    },
    [user, refreshUnreadCount]
  );

  const dismiss = useCallback(
    async (id: string) => {
      let wasUnread = false;

      setNotifications((prev) => {
        wasUnread = prev.some(
          (n) =>
            n.id === id && !n.is_read
        );

        return prev.filter(
          (n) => n.id !== id
        );
      });

      if (wasUnread) {
        setUnreadCount((c) =>
          Math.max(0, c - 1)
        );
      }

      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("id", id);

      if (error) {
        console.error(
          "Failed to delete notification:",
          error
        );

        fetchNotifications();
      }

      refreshUnreadCount();
    },
    [
      fetchNotifications,
      refreshUnreadCount,
    ]
  );

  const enableSound = useCallback(
    async (enabled: boolean) => {
      setSoundEnabled(enabled);
      setSoundPromptShown(false);

      if (user) {
        await supabase
          .from("profiles")
          .update({
            sound_alerts_enabled:
              enabled,
          })
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