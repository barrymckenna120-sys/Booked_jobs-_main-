import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { RefreshCw, X } from "lucide-react";
import { shouldSkipServiceWorker } from "@/lib/isPreviewHost";

/**
 * Shows a dismissible banner at the top of the app when a new service worker
 * version is available. Critical for iOS home-screen PWA users who otherwise
 * never receive updates.
 *
 * Registration must be genuinely conditional: hooks can't be called
 * conditionally, so the `useRegisterSW` call lives in a child component that is
 * only mounted outside dev/preview/iframe contexts.
 */
const UpdateBanner = () => {
  const [dismissed, setDismissed] = useState(false);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(err) {
      console.warn("App shell SW registration failed:", err);
    },
  });

  if (!needRefresh || dismissed) return null;

  const handleRefresh = () => {
    updateServiceWorker(true);
  };

  const handleDismiss = () => {
    setNeedRefresh(false);
    setDismissed(true);
  };

  return (
    <div className="fixed top-0 inset-x-0 z-[100] bg-primary text-primary-foreground shadow-md pt-[env(safe-area-inset-top)]">
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
};

export default function PWAUpdateBanner() {
  const skip = shouldSkipServiceWorker();

  // In refused contexts, actively clear any app-shell SW left behind so a stale
  // precached shell can't keep serving old HTML in preview/dev.
  useEffect(() => {
    if (!skip || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs
        .filter((r) => !r.scope.includes("firebase-cloud-messaging-push-scope"))
        .forEach((r) => r.unregister());
    });
  }, [skip]);

  if (skip) return null;
  return <UpdateBanner />;
}
