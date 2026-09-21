import * as Sentry from "@sentry/react";
import { buildSentryTags } from "./lib/sentryContext";

// Sentry must be initialised before anything else in the app runs, which is
// why this module is imported as the first line of main.tsx.
Sentry.init({
  dsn: "https://940563403eba06fc2d04d2b29c84d18b@o4511293795074048.ingest.de.sentry.io/4511293857267792",
  environment: import.meta.env.MODE, // "production" or "development"
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  beforeSend(event) {
    // Preserve the route / app-surface / online / service-worker tags that
    // every event in this app is already enriched with.
    event.tags = { ...buildSentryTags(), ...(event.tags ?? {}) };
    return event;
  },
});

// Whether the app is running as an installed PWA vs a normal browser tab.
Sentry.setTag(
  "display_mode",
  typeof window !== "undefined" &&
    window.matchMedia?.("(display-mode: standalone)").matches
    ? "standalone"
    : "browser"
);
