import { describe, it, expect } from "vitest";
import {
  detectEngine,
  isStandaloneDisplay,
  privateBrowsingHint,
  buildSignInFailureTags,
} from "@/lib/authFailureReport";

const IOS_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IOS_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";

describe("detectEngine", () => {
  it("identifies iOS Safari", () => {
    expect(detectEngine(IOS_SAFARI)).toBe("webkit-ios");
  });

  it("does not report iOS Chrome as Safari", () => {
    expect(detectEngine(IOS_CHROME)).toBe("blink");
  });

  it("identifies Android Chrome", () => {
    expect(detectEngine(ANDROID_CHROME)).toBe("blink");
  });
});

describe("privateBrowsingHint", () => {
  it("flags likely private browsing when WebKit has no service worker API", () => {
    expect(privateBrowsingHint({ engine: "webkit-ios", hasServiceWorker: false })).toBe("likely");
  });

  it("does not flag WebKit with service workers available", () => {
    expect(privateBrowsingHint({ engine: "webkit-ios", hasServiceWorker: true })).toBe("unlikely");
  });

  it("stays unknown on non-WebKit engines", () => {
    expect(privateBrowsingHint({ engine: "blink", hasServiceWorker: false })).toBe("unknown");
  });
});

describe("isStandaloneDisplay", () => {
  it("trusts navigator.standalone on iOS", () => {
    expect(isStandaloneDisplay({ navigator: { standalone: true } })).toBe(true);
  });

  it("falls back to the display-mode media query", () => {
    expect(isStandaloneDisplay({ matchMedia: () => ({ matches: true }) })).toBe(true);
    expect(isStandaloneDisplay({ matchMedia: () => ({ matches: false }) })).toBe(false);
  });

  it("survives a throwing matchMedia", () => {
    expect(
      isStandaloneDisplay({
        matchMedia: () => {
          throw new Error("nope");
        },
      })
    ).toBe(false);
  });
});

describe("buildSignInFailureTags", () => {
  const base = {
    error: Object.assign(new Error("Load failed"), { name: "TypeError" }),
    elapsedMs: 1234.6,
    onLine: true,
    ua: IOS_SAFARI,
    hasServiceWorker: false,
    standalone: true,
  };

  it("captures engine, display mode and the browser's own wording", () => {
    expect(buildSignInFailureTags(base)).toEqual({
      engine: "webkit-ios",
      display_mode: "standalone",
      private_browsing: "likely",
      navigator_online: "true",
      elapsed_ms: "1235",
      error_name: "TypeError",
      error_message: "Load failed",
      failure: "signin_network",
    });
  });

  it("never carries credentials and truncates long messages", () => {
    const tags = buildSignInFailureTags({ ...base, error: new Error("x".repeat(500)) });
    expect(tags.error_message.length).toBe(120);
    expect(JSON.stringify(tags)).not.toContain("password");
  });

  it("clamps a missing start time to zero rather than a negative", () => {
    expect(buildSignInFailureTags({ ...base, elapsedMs: -50 }).elapsed_ms).toBe("0");
  });
});
