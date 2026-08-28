/**
 * Extra context attached to every Sentry event: which route, which app
 * (engineer vs office), whether the device believes it is online, and whether
 * a new service worker version is sitting in `waiting`.
 *
 * Read-only with respect to the service worker — nothing here registers,
 * activates or updates anything.
 */

export type ServiceWorkerState = "unsupported" | "none" | "installing" | "active" | "waiting";

let swState: ServiceWorkerState = "unsupported";

/** Starts observing the app-shell registration so `sw_state` stays current. */
export function trackServiceWorkerState(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  swState = "none";

  const read = () => {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => {
        // Ignore the Firebase messaging worker — only the app shell matters here.
        const shell = regs.find((r) => !r.scope.includes("firebase-cloud-messaging"));
        if (!shell) {
          swState = "none";
        } else if (shell.waiting) {
          swState = "waiting";
        } else if (shell.active) {
          swState = "active";
        } else {
          swState = "installing";
        }
      })
      .catch(() => {
        /* leave last known value */
      });
  };

  read();
  const interval = window.setInterval(read, 30_000);
  navigator.serviceWorker.addEventListener?.("controllerchange", read);
  window.addEventListener("focus", read);

  // Never cleared in practice (app lifetime), but keep a handle for tests.
  (window as unknown as { __bjSwPoll?: number }).__bjSwPoll = interval;
}

export function getServiceWorkerState(): ServiceWorkerState {
  return swState;
}

export function getAppSurface(pathname: string): "engineer" | "office" | "public" {
  if (pathname.startsWith("/engineer")) return "engineer";
  if (
    pathname === "/" ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/quote/") ||
    pathname.startsWith("/receipt") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/terms")
  ) {
    return "public";
  }
  return "office";
}

/** Tags merged into every outgoing Sentry event. */
export function buildSentryTags(): Record<string, string> {
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  return {
    route: pathname,
    app_surface: getAppSurface(pathname),
    online:
      typeof navigator !== "undefined" && typeof navigator.onLine === "boolean"
        ? String(navigator.onLine)
        : "unknown",
    sw_state: getServiceWorkerState(),
    standalone:
      typeof window !== "undefined" &&
      (window.matchMedia?.("(display-mode: standalone)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true)
        ? "true"
        : "false",
  };
}
