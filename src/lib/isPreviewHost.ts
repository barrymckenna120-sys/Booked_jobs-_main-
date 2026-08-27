/**
 * Single source of truth for "are we running inside a Lovable preview/dev shell?".
 *
 * Important: `*.lovable.app` is the PUBLISHED domain (e.g. karlsgas.lovable.app),
 * NOT a preview host. Only the `id-preview--` / `preview--` subdomain prefixes,
 * the lovableproject sandbox hosts, and beta.lovable.dev are previews.
 * Treating all of `lovable.app` as preview previously disabled the service
 * worker on the live app.
 */
export const isLovablePreviewHost = (hostname: string = typeof window !== "undefined" ? window.location.hostname : ""): boolean => {
  const host = hostname.toLowerCase();
  if (!host) return false;
  if (host.startsWith("id-preview--") || host.startsWith("preview--")) return true;
  if (host === "lovableproject.com" || host.endsWith(".lovableproject.com")) return true;
  if (host === "lovableproject-dev.com" || host.endsWith(".lovableproject-dev.com")) return true;
  if (host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev")) return true;
  return false;
};

export const isInIframe = (): boolean => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

/** True when service workers must NOT be registered (dev, iframe, preview, kill switch). */
export const shouldSkipServiceWorker = (): boolean => {
  if (typeof window === "undefined") return true;
  if (!import.meta.env.PROD) return true;
  if (isInIframe()) return true;
  if (isLovablePreviewHost()) return true;
  if (new URLSearchParams(window.location.search).get("sw") === "off") return true;
  return false;
};
