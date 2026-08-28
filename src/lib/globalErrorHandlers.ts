import * as Sentry from "@sentry/react";
import { isChunkLoadError, maybeReloadForChunkError } from "./chunkError";
import { buildSentryTags } from "./sentryContext";

/**
 * Reports errors that happen outside React's render tree — async callbacks,
 * event handlers, unhandled promise rejections — to the existing Sentry setup.
 */

const IGNORED_PATTERNS = [
  "aborterror",
  "the operation was aborted",
  "resizeobserver loop",
  "chrome-extension://",
  "moz-extension://",
  "safari-extension://",
  "load failed", // iOS Safari's generic wording for a cancelled fetch
];

function isIgnorable(error: unknown): boolean {
  const message =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : typeof error === "string"
        ? error
        : "";
  const haystack = message.toLowerCase();
  return IGNORED_PATTERNS.some((pattern) => haystack.includes(pattern));
}

function report(error: unknown, mechanism: string) {
  if (isIgnorable(error)) return;

  // A stale chunk gets exactly one reload attempt for the whole session.
  const reloading = maybeReloadForChunkError(error);

  Sentry.captureException(error, {
    tags: {
      ...buildSentryTags(),
      mechanism,
      chunk_error: String(isChunkLoadError(error)),
      auto_reloaded: String(reloading),
    },
  });
}

let installed = false;

export function installGlobalErrorHandlers(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    // Resource load failures (img/script tags) surface here without an Error.
    const error = event.error ?? event.message ?? "Unknown window error";
    report(error, "window.onerror");
  });

  window.addEventListener("unhandledrejection", (event) => {
    report(event.reason ?? "Unhandled promise rejection", "unhandledrejection");
  });
}
