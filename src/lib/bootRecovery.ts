/**
 * Boot watchdog decision logic.
 *
 * Why this exists: `index.html` renders an empty root and then loads the app
 * bundle. Every timeout/fallback we have (landing-path timeout, the 25s loader
 * ceiling, bounded session checks) lives *inside* that bundle, so a stale or
 * un-fetchable cached shell — the installed-PWA failure mode — has no escape
 * hatch at all: the screen simply never progresses.
 *
 * The actual watchdog is an inline script in `index.html` (it must run even when
 * the bundle is the broken part). This module is the same decision expressed as
 * pure, testable functions and the single documented source of the thresholds.
 * Keep the two in sync — the inline copy is deliberately dependency-free.
 */

/** After this long with no boot signal, offer the user a manual reset. */
export const BOOT_OFFER_MS = 8_000;

/** After this long with no boot signal, recover automatically (once). */
export const BOOT_AUTO_RECOVER_MS = 20_000;

/** Session-storage key holding the one-per-session recovery budget. */
export const BOOT_RECOVERY_FLAG = "bj_boot_recovery_attempted";

type FlagStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const defaultStore = (): FlagStore | null => {
  try {
    return (globalThis as unknown as { sessionStorage?: FlagStore }).sessionStorage ?? null;
  } catch {
    return null;
  }
};

export function hasSpentBootRecovery(store: FlagStore | null = defaultStore()): boolean {
  if (!store) return true; // no durable flag -> treat as spent so we never loop
  try {
    return store.getItem(BOOT_RECOVERY_FLAG) === "1";
  } catch {
    return true;
  }
}

/** Consumes the one-per-session automatic recovery budget. */
export function consumeBootRecoveryBudget(store: FlagStore | null = defaultStore()): boolean {
  if (!store) return false;
  if (hasSpentBootRecovery(store)) return false;
  try {
    store.setItem(BOOT_RECOVERY_FLAG, "1");
  } catch {
    return false;
  }
  return true;
}

/** Should the "BookedJobs couldn't start" screen be shown? */
export function shouldOfferBootRecovery(input: {
  booted: boolean;
  elapsedMs: number;
  offerMs?: number;
}): boolean {
  const { booted, elapsedMs, offerMs = BOOT_OFFER_MS } = input;
  if (booted) return false;
  if (elapsedMs < 0) return false;
  return elapsedMs >= offerMs;
}

/** Should recovery run without waiting for a tap? */
export function shouldAutoRecoverBoot(input: {
  booted: boolean;
  elapsedMs: number;
  alreadyRecovered: boolean;
  ceilingMs?: number;
}): boolean {
  const { booted, elapsedMs, alreadyRecovered, ceilingMs = BOOT_AUTO_RECOVER_MS } = input;
  if (booted) return false;
  if (alreadyRecovered) return false;
  if (elapsedMs < 0) return false;
  return elapsedMs >= ceilingMs;
}

/**
 * Cache names that must survive a reset: the Firebase messaging worker keeps its
 * own storage and is unrelated to the app shell.
 */
export function isAppShellCacheName(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.includes("firebase")) return false;
  if (lower.includes("fcm")) return false;
  return true;
}

/** True for the app-shell service worker scope (not the push worker's scope). */
export function isAppShellScope(scope: string): boolean {
  return !scope.includes("firebase-cloud-messaging");
}

/** Test-only helper. */
export function resetBootRecoveryBudget(store: FlagStore | null = defaultStore()): void {
  try {
    store?.removeItem(BOOT_RECOVERY_FLAG);
  } catch {
    /* noop */
  }
}
