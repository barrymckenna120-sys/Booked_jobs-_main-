import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

type OfflineBannerProps = {
  topOffsetClassName?: string;
};

const OfflineBanner = ({ topOffsetClassName = "top-0" }: OfflineBannerProps) => {
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);

  const checkConnectivity = useCallback(async () => {
    if (!navigator.onLine) {
      setIsOffline(true);
      return;
    }

    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 5000);

      await fetch(`/favicon.ico?offline-check=${Date.now()}`, {
        method: "HEAD",
        cache: "no-store",
        signal: controller.signal,
      });

      window.clearTimeout(timeoutId);
      setIsOffline(false);
    } catch {
      setIsOffline(true);
    }
  }, []);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => {
      void checkConnectivity();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void checkConnectivity();
      }
    };

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    document.addEventListener("visibilitychange", onVisibilityChange);

    void checkConnectivity();
    const intervalId = window.setInterval(() => {
      void checkConnectivity();
    }, 10000);

    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [checkConnectivity]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "sticky z-40 overflow-hidden transition-all duration-300 ease-in-out",
        topOffsetClassName,
      )}
      style={{ maxHeight: isOffline ? 40 : 0, opacity: isOffline ? 1 : 0 }}
    >
      <div
        className={cn(
          "w-full bg-warning text-warning-foreground text-sm font-bold text-center py-2 transition-transform duration-300 ease-in-out",
          isOffline ? "translate-y-0" : "-translate-y-full",
        )}
      >
        ⚠️ No internet connection — job updates may not save
      </div>
    </div>
  );
};

export default OfflineBanner;
