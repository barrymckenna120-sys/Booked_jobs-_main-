import { useEffect, useRef, useState } from "react";
import { processQueue } from "@/hooks/useRetryQueue";

const PROBE_URL = () =>
  `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/?_=${Date.now()}`;
const PROBE_TIMEOUT_MS = 5000;
// Only polls while we believe we're offline, with backoff.
const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000, 30000];

const probe = async (): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    // Any HTTP response (200, 401, 404, etc.) proves the network is reachable.
    // Only fetch/network failures or aborts mean we're truly offline.
    await fetch(PROBE_URL(), {
      method: "HEAD",
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timer);
    return true;
  } catch {
    return false;
  }
};

/**
 * Event-driven connectivity status.
 *
 * Deliberately does NOT poll while online — a background request every few
 * seconds on every mounted page is a real battery/data cost on mobile.
 * Behaviour:
 *  - trusts `navigator.onLine` transitions,
 *  - verifies with a single HEAD probe (two consecutive failures required before
 *    reporting offline, so one flaky request can't bounce users to /offline),
 *  - while offline, retries with backoff until reachable again,
 *  - re-probes when the tab becomes visible.
 */
export const useNetworkStatus = () => {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const prevOnlineRef = useRef<boolean>(isOnline);

  useEffect(() => {
    if (!prevOnlineRef.current && isOnline) {
      processQueue().catch((e) => console.error("processQueue failed:", e));
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let consecutiveFailures = 0;
    let running = false;

    const clear = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const scheduleRetry = () => {
      clear();
      const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
      attempt += 1;
      timer = setTimeout(() => {
        void check();
      }, delay);
    };

    const check = async () => {
      if (cancelled || running) return;
      running = true;
      const ok = await probe();
      running = false;
      if (cancelled) return;

      if (ok) {
        consecutiveFailures = 0;
        attempt = 0;
        clear();
        setIsOnline(true);
        return;
      }

      consecutiveFailures += 1;
      // Require two consecutive failures before flipping to offline so a single
      // dropped request doesn't redirect the user to the offline screen.
      if (consecutiveFailures >= 2) setIsOnline(false);
      scheduleRetry();
    };

    const handleOffline = () => {
      consecutiveFailures = 2;
      setIsOnline(false);
      attempt = 0;
      void check();
    };

    const handleOnline = () => {
      attempt = 0;
      consecutiveFailures = 0;
      void check();
    };

    const handleVisibilityChange = () => {
      // Only verify on focus when we currently think we're offline, or when the
      // browser reports offline — no cost for healthy sessions.
      if (document.visibilityState !== "visible") return;
      if (!navigator.onLine || !prevOnlineRef.current) void check();
    };

    // Initial verification only if the browser already reports offline.
    if (typeof navigator !== "undefined" && !navigator.onLine) handleOffline();

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      clear();
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return { isOnline };
};
