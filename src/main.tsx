import React from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { installOrgHeaderInterceptor } from "./integrations/supabase/orgHeaderInterceptor";
import { shouldSkipServiceWorker } from "./lib/isPreviewHost";
import { installGlobalErrorHandlers } from "./lib/globalErrorHandlers";
import { buildSentryTags, trackServiceWorkerState } from "./lib/sentryContext";
import ErrorFallback from "./components/shared/ErrorFallback";
// TEMPORARY: dev/preview-only auth probe for the token-refresh verification.
// Remove this import together with src/lib/devAuthProbe.ts after sign-off.
import { installDevAuthProbe } from "./lib/devAuthProbe";

installOrgHeaderInterceptor();
trackServiceWorkerState();
installDevAuthProbe();


Sentry.init({
  dsn: "https://940563403eba06fc2d04d2b29c84d18b@o4511293795074048.ingest.de.sentry.io/4511293857267792",
  tracesSampleRate: 0.2,
  integrations: [Sentry.browserTracingIntegration()],
  beforeSend(event) {
    event.tags = { ...buildSentryTags(), ...(event.tags ?? {}) };
    return event;
  },
});

installGlobalErrorHandlers();

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

