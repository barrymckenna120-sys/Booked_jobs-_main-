import { describe, expect, it } from "vitest";
import {
  isAuthNetworkError,
  GENERIC_AUTH_ERROR,
} from "@/lib/authLockout";
import { RequestTimeoutError } from "@/lib/queryDefaults";

describe("isAuthNetworkError", () => {
  it("recognises iOS WebKit 'Load failed' as a network error and does not blame credentials", () => {
    const error = new TypeError("Load failed");
    expect(isAuthNetworkError(error, true)).toBe(true);
  });

  it("matches 'Load failed' case-insensitively", () => {
    expect(isAuthNetworkError(new Error("load failed"), true)).toBe(true);
  });

  it("still recognises Chromium and Gecko network error wording", () => {
    expect(
      isAuthNetworkError(new TypeError("Failed to fetch"), true),
    ).toBe(true);
    expect(isAuthNetworkError(new Error("NetworkError when attempting to fetch resource."), true)).toBe(
      true,
    );
  });

  it("recognises our own request timeout", () => {
    expect(isAuthNetworkError(new RequestTimeoutError(), true)).toBe(true);
    expect(isAuthNetworkError(new Error("REQUEST_TIMEOUT"), true)).toBe(true);
  });

  it("treats a reported-offline browser as a network failure", () => {
    expect(isAuthNetworkError(new Error("whatever"), false)).toBe(true);
  });

  it("does not classify a genuine invalid-credential rejection as a network error", () => {
    expect(
      isAuthNetworkError(new Error("Invalid login credentials"), true),
    ).toBe(false);
  });

  it("does not classify unrelated auth errors as network errors", () => {
    expect(isAuthNetworkError(new Error(GENERIC_AUTH_ERROR), true)).toBe(false);
    expect(isAuthNetworkError(new Error("User banned"), true)).toBe(false);
    expect(isAuthNetworkError(null, true)).toBe(false);
  });
});
