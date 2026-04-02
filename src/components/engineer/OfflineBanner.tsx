import { useState, useEffect, useCallback, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type OfflineBannerProps = {
  topOffsetClassName?: string;
};

const OFFLINE_DELAY_MS = 15000; // Only show after 15s continuously offline
const RESTORE_DELAY_MS = 3000; // Auto-dismiss 3s after restore

const OfflineBanner = ({ topOffsetClassName = "top-0" }: OfflineBannerProps) => {
  const [showBanner, setShowBanner] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const offlineSinceRef = useRef<number | null>(null);
  const showTimerRef = useRef<number | null>(null);
  const restoreTimerRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (showTimerRef.current) { window.clearTimeout(showTimerRef.current); showTimerRef.current = null; }
    if (restoreTimerRef.current) { window.clearTimeout(restoreTimerRef.current); restoreTimerRef.current = null; }
  }, []);

  const markOffline = useCallback(() => {
    if (offlineSinceRef.current) return; // already tracking
    offlineSinceRef.current = Date.now();
    if (restoreTimerRef.current) { window.clearTimeout(restoreTimerRef.current); restoreTimerRef.current = null; }
    showTimerRef.current = window.setTimeout(() => {
      if (offlineSinceRef.current) {
        setShowBanner(true);
        setDismissed(false);
      }
    }, OFFLINE_DELAY_MS);
  }, []);

  const markOnline = useCallback(() => {
    offlineSinceRef.current = null;
    if (showTimerRef.current) { window.clearTimeout(showTimerRef.current); showTimerRef.current = null; }
    if (showBanner) {
      restoreTimerRef.current = window.setTimeout(() => {
        setShowBanner(false);
      }, RESTORE_DELAY_MS);
    } else {
      setShowBanner(false);
    }
  }, [showBanner]);

  const checkConnectivity = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 5000);
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/`,
        { method: "HEAD", cache: "no-store", signal: controller.signal }
      );
      window.clearTimeout(timeoutId);
      if (response.ok) { markOnline(); } else { markOffline(); }
    } catch {
      markOffline();
    }
  }, [markOnline, markOffline]);

  useEffect(() => {
    const handleOffline = () => markOffline();
    const handleOnline = () => void checkConnectivity();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void checkConnectivity();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", onVisibilityChange);

    void checkConnectivity();
    const intervalId = window.setInterval(() => void checkConnectivity(), 30000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(intervalId);
      clearTimers();
    };
  }, [checkConnectivity, clearTimers]);

  const show = isOffline && !dismissed;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "sticky z-40 overflow-hidden transition-all duration-300 ease-in-out",
        topOffsetClassName,
      )}
      style={{ maxHeight: show ? 40 : 0, opacity: show ? 1 : 0 }}
    >
      <div
        className={cn(
          "w-full bg-warning text-warning-foreground text-sm font-bold text-center py-2 transition-transform duration-300 ease-in-out flex items-center justify-center",
          show ? "translate-y-0" : "-translate-y-full",
        )}
      >
        <span className="flex-1">⚠️ No internet connection — job updates may not save</span>
        <button
          onClick={() => setDismissed(true)}
          className="mr-3 p-0.5 rounded hover:bg-white/20 transition-colors flex-shrink-0"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default OfflineBanner;
