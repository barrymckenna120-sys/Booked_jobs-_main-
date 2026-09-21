import { describe, expect, it, beforeEach } from "vitest";
import {
  BOOT_AUTO_RECOVER_MS,
  BOOT_OFFER_MS,
  consumeBootRecoveryBudget,
  hasSpentBootRecovery,
  isAppShellCacheName,
  isAppShellScope,
  resetBootRecoveryBudget,
  shouldAutoRecoverBoot,
  shouldOfferBootRecovery,
} from "../bootRecovery";

function makeStore() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

describe("shouldOfferBootRecovery", () => {
  it("offers the reset screen once the app has not booted in time", () => {
    expect(shouldOfferBootRecovery({ booted: false, elapsedMs: BOOT_OFFER_MS })).toBe(true);
  });

  it("stays silent when the app signalled boot", () => {
    expect(
      shouldOfferBootRecovery({ booted: true, elapsedMs: BOOT_OFFER_MS + 5_000 })
    ).toBe(false);
  });

  it("stays silent during a normal (fast) launch", () => {
    expect(shouldOfferBootRecovery({ booted: false, elapsedMs: 900 })).toBe(false);
  });
});

describe("shouldAutoRecoverBoot", () => {
  it("recovers automatically after the hard ceiling", () => {
    expect(
      shouldAutoRecoverBoot({
        booted: false,
        elapsedMs: BOOT_AUTO_RECOVER_MS,
        alreadyRecovered: false,
      })
    ).toBe(true);
  });

  it("never recovers when the app booted", () => {
    expect(
      shouldAutoRecoverBoot({
        booted: true,
        elapsedMs: BOOT_AUTO_RECOVER_MS + 1,
        alreadyRecovered: false,
      })
    ).toBe(false);
  });

  it("recovers at most once per session (no reload loop)", () => {
    expect(
      shouldAutoRecoverBoot({
        booted: false,
        elapsedMs: BOOT_AUTO_RECOVER_MS + 1,
        alreadyRecovered: true,
      })
    ).toBe(false);
  });
});

describe("recovery budget", () => {
  let store = makeStore();

  beforeEach(() => {
    store = makeStore();
    resetBootRecoveryBudget(store);
  });

  it("can be spent exactly once", () => {
    expect(consumeBootRecoveryBudget(store)).toBe(true);
    expect(hasSpentBootRecovery(store)).toBe(true);
    expect(consumeBootRecoveryBudget(store)).toBe(false);
  });

  it("refuses when no durable storage exists (loop safety)", () => {
    expect(hasSpentBootRecovery(null)).toBe(true);
    expect(consumeBootRecoveryBudget(null)).toBe(false);
  });
});

describe("reset scope", () => {
  it("clears app-shell caches only", () => {
    expect(isAppShellCacheName("bookedjobs-v1-precache-v2-https://x/")).toBe(true);
    expect(isAppShellCacheName("html")).toBe(true);
    expect(isAppShellCacheName("assets")).toBe(true);
    expect(isAppShellCacheName("firebase-messaging-sw-cache")).toBe(false);
    expect(isAppShellCacheName("FCM_Store")).toBe(false);
  });

  it("leaves the push worker registered", () => {
    expect(isAppShellScope("https://app/")).toBe(true);
    expect(
      isAppShellScope("https://app/firebase-cloud-messaging-push-scope")
    ).toBe(false);
  });
});
