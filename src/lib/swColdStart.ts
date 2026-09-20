/**
 * Cold-launch adoption of a waiting service worker.
 *
 * Why: the app registers with `registerType: "prompt"` and `skipWaiting: false`,
 * so a newly published build installs but sits in `waiting` until the user taps
 * Update in the banner. The banner is hidden on `/auth`, so an installed PWA
 * that always opens on the login screen could stay pinned to an old build
 * indefinitely.
 *
 * Fix: at cold launch there is no unsaved work, so a waiting build is adopted
 * automatically (activate + one reload). Updates that appear later, while
 * someone is actively working, still go through the banner.
 *
 * Reload-loop protection: a single session-scoped flag is spent before the
 * activation call, so at most one automatic reload can ever happen per tab
 * session — including after `controllerchange` fires and the new worker takes
 * over. If storage is unavailable, auto-activation is refused outright rather
 * than risk a loop.
 */

/** How long after boot an update still counts as "part of the cold launch". */
export const COLD_START_WINDOW_MS = 20_000;

const ACTIVATED_FLAG = "bj_sw_cold_activated";

/** Timestamp of this document's boot; used to measure the cold-start window. */
export const BOOT_TIME = Date.now();

type FlagStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const defaultStore = (): FlagStore | null => {
  try {
    return (globalThis as unknown as { sessionStorage?: FlagStore }).sessionStorage ?? null;
  } catch {
    return null;
  }
};

export function hasSpentColdActivation(store: FlagStore | null = defaultStore()): boolean {
  if (!store) return true; // no durable flag -> treat as spent so we never loop
  try {
    return store.getItem(ACTIVATED_FLAG) === "1";
  } catch {
    return true;
  }
}

/** Consumes the one-per-session automatic activation budget. */
export function consumeColdActivationBudget(store: FlagStore | null = defaultStore()): boolean {
  if (!store) return false;
  if (hasSpentColdActivation(store)) return false;
  try {
    store.setItem(ACTIVATED_FLAG, "1");
  } catch {
    return false;
  }
  return true;
}

/**
 * Pure decision: should a waiting update be adopted silently rather than shown
 * as a prompt?
 */
export function shouldAutoActivateWaitingWorker(input: {
  needRefresh: boolean;
  elapsedMs: number;
  alreadyActivated: boolean;
}): boolean {
  const { needRefresh, elapsedMs, alreadyActivated } = input;
  if (!needRefresh) return false;
  if (alreadyActivated) return false;
  if (elapsedMs < 0) return false;
  return elapsedMs <= COLD_START_WINDOW_MS;
}

/** Test-only helper. */
export function resetColdActivationBudget(): void {
  try {
    sessionStorage.removeItem(ACTIVATED_FLAG);
  } catch {
    /* noop */
  }
}
