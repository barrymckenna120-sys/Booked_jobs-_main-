import { useState, useEffect, useCallback } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type OfflineBannerProps = {
  topOffsetClassName?: string;
};

const OfflineBanner = ({ topOffsetClassName = "top-0" }: OfflineBannerProps) => {
  const [isOffline, setIsOffline] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const checkConnectivity = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 5000);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/`,
        { method: "HEAD", cache: "no-store", signal: controller.signal }
      );

      window.clearTimeout(timeoutId);
      const offline = !response.ok;
      setIsOffline(offline);
      if (!offline) setDismissed(false);
    } catch {
      setIsOffline(true);
    }
  }, []);

  useEffect(() => {
    const handleOffline = () => {
      setIsOffline(true);
      setDismissed(false);
    };
    const handleOnline = () => {
      setIsOffline(false);
      void checkConnectivity();
    };
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
    };
  }, [checkConnectivity]);

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
