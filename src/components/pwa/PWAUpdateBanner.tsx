import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useRegisterSW } from "virtual:pwa-register/react";
import { RefreshCw, X } from "lucide-react";

/**
 * Shows a dismissible banner at the top of the app when a new service worker
 * version is available. Critical for iOS home-screen PWA users who otherwise
 * never receive updates.
 */
export default function PWAUpdateBanner() {
  const { pathname } = useLocation();
  const [dismissed, setDismissed] = useState(false);

  // Guard: don't register the SW in Lovable preview iframes / preview hosts.
  const isInIframe = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const isPreviewHost =
    host.includes("id-preview--") ||
    host.includes("preview--") ||
    host.includes("lovableproject.com") ||
    host.includes("lovableproject-dev.com") ||
    host.includes("lovable.app");
  const shouldRegister = !isInIframe && !isPreviewHost;

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: shouldRegister,
    onRegisterError(err) {
      console.warn("App shell SW registration failed:", err);
    },
  });

  if (!shouldRegister || !needRefresh || dismissed) return null;

  const handleRefresh = () => {
    updateServiceWorker(true);
  };

  const handleDismiss = () => {
    setNeedRefresh(false);
    setDismissed(true);
  };

  return (
    <div className="fixed top-0 inset-x-0 z-[100] bg-primary text-primary-foreground shadow-md">
      <div className="mx-auto max-w-5xl px-4 py-2 flex items-center justify-between gap-3 text-sm">
        <button
          onClick={handleRefresh}
          className="flex-1 text-left font-medium"
          aria-label="Refresh to apply update"
        >
          Update available — tap to refresh
        </button>
        <button
          onClick={handleRefresh}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary-foreground/15 hover:bg-primary-foreground/25 px-3 py-1.5 font-medium transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
        <button
          onClick={handleDismiss}
          className="p-1 rounded-md hover:bg-primary-foreground/15 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
