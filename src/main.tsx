import React from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { installOrgHeaderInterceptor } from "./integrations/supabase/orgHeaderInterceptor";

installOrgHeaderInterceptor();

Sentry.init({
  dsn: "https://940563403eba06fc2d04d2b29c84d18b@o4511293795074048.ingest.de.sentry.io/4511293857267792",
  tracesSampleRate: 0.2,
});

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<p>An error has occurred</p>}>
      <HelmetProvider>
        <App />
      </HelmetProvider>
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);

// Service worker registration — guarded against Lovable preview iframes/hosts
const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();
const host = window.location.hostname;
const isPreviewHost =
  host.includes("id-preview--") ||
  host.includes("preview--") ||
  host.includes("lovableproject.com") ||
  host.includes("lovableproject-dev.com") ||
  host.includes("lovable.app");

if ("serviceWorker" in navigator) {
  if (isPreviewHost || isInIframe) {
    // Unregister any SWs in preview/iframe contexts to avoid stale-shell issues
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

