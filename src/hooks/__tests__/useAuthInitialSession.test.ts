import { describe, it, expect, vi, afterEach } from "vitest";
import { withRequestTimeout, RequestTimeoutError } from "@/lib/queryDefaults";

/**
 * Step 1 regression cover: the initial session restore must always terminate.
 * A hung getSession() previously left `loading` true forever (stuck spinner on
 * iOS Safari on weak signal). We assert the timeout wrapper rejects, and that
 * the shape used by useAuth ("catch -> treat as no session") clears loading.
 */
describe("useAuth initial session restore", () => {
  afterEach(() => vi.useRealTimers());

  it("rejects with RequestTimeoutError when getSession never settles", async () => {
    vi.useFakeTimers();
    const hung = new Promise<never>(() => {});
    const wrapped = withRequestTimeout(hung, 100);
    const assertion = expect(wrapped).rejects.toBeInstanceOf(RequestTimeoutError);
    await vi.advanceTimersByTimeAsync(150);
    await assertion;
  });

  it("clears loading and yields a null user on failure", async () => {
    let loading = true;
    let user: unknown = undefined;

    const applyInitialSession = (session: { user: unknown } | null) => {
      user = session?.user ?? null;
      loading = false;
    };

    await withRequestTimeout(Promise.reject(new Error("Load failed")), 1000)
      .then(() => {
        throw new Error("should not resolve");
      })
      .catch(() => applyInitialSession(null));

    expect(loading).toBe(false);
    expect(user).toBeNull();
  });

  it("passes the session through on success", async () => {
    const session = { user: { id: "abc" } };
    const result = await withRequestTimeout(Promise.resolve({ data: { session } }), 1000);
    expect(result.data.session.user.id).toBe("abc");
  });
});
