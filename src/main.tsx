import "./instrument";
import React from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { installOrgHeaderInterceptor } from "./integrations/supabase/orgHeaderInterceptor";
import { shouldSkipServiceWorker } from "./lib/isPreviewHost";
import { installGlobalErrorHandlers } from "./lib/globalErrorHandlers";
import { trackServiceWorkerState } from "./lib/sentryContext";
import ErrorFallback from "./components/shared/ErrorFallback";
// TEMPORARY: dev/preview-only auth probe for the token-refresh verification.
// Remove this import together with src/lib/devAuthProbe.ts after sign-off.
import { installDevAuthProbe } from "./lib/devAuthProbe";

installOrgHeaderInterceptor();
trackServiceWorkerState();
installDevAuthProbe();



installGlobalErrorHandlers();

// Tell the inline boot watchdog in index.html that the bundle is alive, so it
// never shows the recovery screen on a healthy launch. Also report a recovery
// that already happened on the previous launch, so stale-install failures are
// visible instead of silent.
const signalBoot = () => {
  const w = window as unknown as { __bjBootSignal?: () => void };
  w.__bjBootSignal?.();
  try {
    const waited = localStorage.getItem("bj_boot_watchdog_fired");
    if (waited) {
      localStorage.removeItem("bj_boot_watchdog_fired");
      Sentry.captureMessage("Boot watchdog recovered a stuck launch", {
        level: "warning",
        tags: { boot_watchdog_waited_ms: waited },
      });
    }
  } catch {
    /* storage unavailable — nothing to report */
  }
};

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary
      fallback={
        <ErrorFallback
          homePath="/"
          description="The app ran into an unexpected problem. Reopening usually clears it."
        />
      }
    >
      <HelmetProvider>
        <App />
      </HelmetProvider>
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);


// Service worker registration — guarded against Lovable preview iframes/hosts.
// NOTE: the published app lives on *.lovable.app, which is NOT a preview host.
if ("serviceWorker" in navigator) {
  if (shouldSkipServiceWorker()) {
    // Unregister any SWs in preview/iframe/dev contexts to avoid stale-shell issues
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister());
    });
  } else {
    // Register Firebase messaging SW (background push).
    // App shell SW (/sw.js) is registered via useRegisterSW in PWAUpdateBanner
    // so we can surface an update prompt when a new version is detected.
    navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/firebase-cloud-messaging-push-scope" }).catch((err) => {
      console.warn("Firebase SW registration failed:", err);
    });
  }
}

