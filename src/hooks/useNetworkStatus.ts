import { useEffect, useRef, useState } from "react";
import { processQueue } from "@/hooks/useRetryQueue";

const PROBE_URL = () => `https://ktkfuquqxbrmuqrmbmdj.supabase.co/rest/v1/?_=${Date.now()}`;
const PROBE_INTERVAL_MS = 3000;
const PROBE_TIMEOUT_MS = 5000;

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
    let aggressiveInterval: ReturnType<typeof setInterval> | null = null;
    let aggressiveAttempts = 0;
    const MAX_AGGRESSIVE_ATTEMPTS = 60;
    const AGGRESSIVE_INTERVAL_MS = 1000;

    const stopAggressive = () => {
      if (aggressiveInterval) {
        clearInterval(aggressiveInterval);
        aggressiveInterval = null;
      }
      aggressiveAttempts = 0;
    };

    const startAggressive = () => {
      if (aggressiveInterval) return;
      aggressiveAttempts = 0;
      aggressiveInterval = setInterval(async () => {
        aggressiveAttempts += 1;
        const ok = await probe();
        if (cancelled) return;
        if (ok) {
          setIsOnline(true);
          stopAggressive();
        } else if (aggressiveAttempts >= MAX_AGGRESSIVE_ATTEMPTS) {
          stopAggressive();
        }
      }, AGGRESSIVE_INTERVAL_MS);
    };

    const runProbe = async () => {
      const ok = await probe();
      if (cancelled) return;
      setIsOnline(ok);
      if (!ok) startAggressive();
      else stopAggressive();
    };

    runProbe();
    const interval = setInterval(runProbe, PROBE_INTERVAL_MS);

    const handleOffline = () => {
      setIsOnline(false);
      startAggressive();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        runProbe();
      }
    };

    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(interval);
      stopAggressive();
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return { isOnline };
};

