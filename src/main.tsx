import React from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import "./index.css";

Sentry.init({
  dsn: "https://940563403eba06fc2d04d2b29c84d18b@o4511293795074048.ingest.de.sentry.io/4511293857267792",
  tracesSampleRate: 0.2,
});

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<p>An error has occurred</p>}>
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);

// Register Firebase messaging service worker for background push notifications
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/firebase-messaging-sw.js").catch((err) => {
    console.warn("Firebase SW registration failed:", err);
  });
}
