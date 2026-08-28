import { describe, it, expect, vi } from "vitest";
import {
  shouldRetryQuery,
  queryRetryDelay,
  withRequestTimeout,
  RequestTimeoutError,
  extractStatus,
} from "../queryDefaults";

describe("shouldRetryQuery", () => {
  it("retries once for a network failure", () => {
    const err = new TypeError("Failed to fetch");
    expect(shouldRetryQuery(0, err)).toBe(true);
    expect(shouldRetryQuery(1, err)).toBe(false);
    expect(shouldRetryQuery(2, err)).toBe(false);
  });

  it("retries a 5xx once", () => {
    expect(shouldRetryQuery(0, { status: 503 })).toBe(true);
    expect(shouldRetryQuery(1, { status: 503 })).toBe(false);
  });

  it("never retries 4xx responses", () => {
    for (const status of [400, 401, 403, 404, 409, 429]) {
      expect(shouldRetryQuery(0, { status })).toBe(false);
    }
  });

  it("never retries an RLS denial or expired JWT", () => {
    expect(shouldRetryQuery(0, { code: "42501", message: "permission denied" })).toBe(false);
    expect(shouldRetryQuery(0, { code: "PGRST301" })).toBe(false);
  });

  it("never retries a timeout (the connection is already too slow)", () => {
    expect(shouldRetryQuery(0, new RequestTimeoutError())).toBe(false);
  });
});

describe("queryRetryDelay", () => {
  it("backs off but stays capped at 5s", () => {
    expect(queryRetryDelay(0)).toBe(1000);
    expect(queryRetryDelay(1)).toBe(2000);
    expect(queryRetryDelay(10)).toBe(5000);
  });
});

describe("extractStatus", () => {
  it("reads numeric and string status shapes", () => {
    expect(extractStatus({ status: 404 })).toBe(404);
    expect(extractStatus({ statusCode: "500" })).toBe(500);
    expect(extractStatus(new Error("nope"))).toBe(null);
    expect(extractStatus(null)).toBe(null);
  });
});

describe("withRequestTimeout", () => {
  it("resolves when the promise settles in time", async () => {
    await expect(withRequestTimeout(Promise.resolve("ok"), 50)).resolves.toBe("ok");
  });

  it("propagates the original rejection", async () => {
    await expect(withRequestTimeout(Promise.reject(new Error("boom")), 50)).rejects.toThrow("boom");
  });

  it("rejects with RequestTimeoutError when the request hangs", async () => {
    vi.useFakeTimers();
    const hung = new Promise(() => {});
    const guarded = withRequestTimeout(hung, 15_000);
    const assertion = expect(guarded).rejects.toBeInstanceOf(RequestTimeoutError);
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
    vi.useRealTimers();
  });
});
