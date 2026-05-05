import { useEffect, useState } from "react";

const PROBE_URL = "https://ktkfuquqxbrmuqrmbmdj.supabase.co/rest/v1/";
const PROBE_INTERVAL_MS = 15000;
const PROBE_TIMEOUT_MS = 5000;

const probe = async (): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const res = await fetch(PROBE_URL, {
      method: "HEAD",
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
};

export const useNetworkStatus = () => {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    console.log("isOnline changed to:", isOnline);
  }, [isOnline]);

  useEffect(() => {
    let cancelled = false;

    const runProbe = async () => {
      const ok = await probe();
      console.log("Probe result:", ok);
      if (!cancelled) setIsOnline(ok);
    };

    runProbe();
    const interval = setInterval(runProbe, PROBE_INTERVAL_MS);

    const handleOnline = () => {
      console.log("Event: online");
      setIsOnline(true);
      runProbe();
    };
    const handleOffline = () => {
      console.log("Event: offline");
      setIsOnline(false);
      runProbe();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { isOnline };
};
