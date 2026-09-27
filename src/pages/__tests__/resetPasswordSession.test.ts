import { describe, it, expect, vi } from "vitest";
import { establishResetSession } from "../ResetPassword";

type UrlParams = Parameters<typeof establishResetSession>[1];

const baseParams = (): UrlParams => ({
  access_token: null,
  refresh_token: null,
  type: null,
  token: null,
  token_hash: null,
  email: null,
});

const makeAuth = () => ({
  // Pre-existing session for a different (already signed-in) user
  getSession: vi.fn().mockResolvedValue({ data: { session: { user: { email: "other@example.com" } } } }),
  verifyOtp: vi.fn().mockResolvedValue({ error: null }),
  setSession: vi.fn().mockResolvedValue({ error: null }),
});

describe("establishResetSession", () => {
  it("verifies token_hash from the URL even when a session already exists", async () => {
    const auth = makeAuth();
    const onVerified = vi.fn();
    const params = { ...baseParams(), token_hash: "abc123", type: "recovery" };

    const result = await establishResetSession(auth, params, onVerified);

    expect(result).toBe(true);
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "abc123", type: "recovery" });
    expect(auth.getSession).not.toHaveBeenCalled();
    expect(onVerified).toHaveBeenCalledTimes(1);
  });

  it("verifies token + email from the URL even when a session already exists", async () => {
    const auth = makeAuth();
    const params = { ...baseParams(), token: "tok", type: "invite", email: "new.user@example.com" };

    const result = await establishResetSession(auth, params);

    expect(result).toBe(true);
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: "new.user@example.com", token: "tok", type: "invite" });
    expect(auth.getSession).not.toHaveBeenCalled();
  });

  it("does NOT call verifyOtp and uses the existing session when the URL has no token", async () => {
    const auth = makeAuth();

    const result = await establishResetSession(auth, baseParams());

    expect(result).toBe(true);
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(auth.setSession).not.toHaveBeenCalled();
    expect(auth.getSession).toHaveBeenCalledTimes(1);
  });

  it("does not fall back to an existing session when verification fails", async () => {
    const auth = makeAuth();
    auth.verifyOtp.mockResolvedValue({ error: { message: "Token has expired or is invalid" } });
    const params = { ...baseParams(), token_hash: "expired", type: "recovery" };

    const result = await establishResetSession(auth, params);

    expect(result).toBe(false);
    expect(auth.verifyOtp).toHaveBeenCalledOnce();
    expect(auth.getSession).not.toHaveBeenCalled();
  });

  it("rejects a token URL with an unsupported type without touching any session", async () => {
    const auth = makeAuth();
    const params = { ...baseParams(), token_hash: "abc", type: "magiclink" };

    const result = await establishResetSession(auth, params);

    expect(result).toBe(false);
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(auth.getSession).not.toHaveBeenCalled();
  });
});
