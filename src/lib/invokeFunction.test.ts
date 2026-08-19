import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.fn();
const refreshSession = vi.fn();
const signOut = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: any[]) => invoke(...args) },
    auth: {
      refreshSession: (...args: any[]) => refreshSession(...args),
      signOut: (...args: any[]) => signOut(...args),
    },
  },
}));

import { invokeFunction } from "./invokeFunction";

const unauthorized = () => ({
  data: null,
  error: { message: "Unauthorized", context: { response: { status: 401 } } },
});

describe("invokeFunction", () => {
  beforeEach(() => {
    invoke.mockReset();
    refreshSession.mockReset();
    signOut.mockReset();
  });

  it("returns the first result when there is no error", async () => {
    invoke.mockResolvedValue({ data: { success: true }, error: null });

    const res = await invokeFunction("send-whatsapp-receipt", { body: { job_id: "j1" } });

    expect(res.error).toBeNull();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("refreshes the session and retries once on a 401, then succeeds", async () => {
    invoke
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce({ data: { success: true }, error: null });
    refreshSession.mockResolvedValue({ data: { session: { access_token: "fresh" } }, error: null });

    const res = await invokeFunction("send-whatsapp-receipt", { body: { job_id: "j1" } });

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(res.error).toBeNull();
    expect(res.data).toEqual({ success: true });
  });

  it("surfaces the error when the retry also 401s", async () => {
    invoke.mockResolvedValue(unauthorized());
    refreshSession.mockResolvedValue({ data: { session: { access_token: "fresh" } }, error: null });

    const res = await invokeFunction("generate-receipt-pdf", { body: { job_id: "j1" } });

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(res.error).toBeTruthy();
  });

  it("signs out and returns the original error when the refresh fails", async () => {
    invoke.mockResolvedValue(unauthorized());
    refreshSession.mockResolvedValue({ data: { session: null }, error: { message: "invalid refresh token" } });

    const res = await invokeFunction("generate-receipt-pdf", { body: { job_id: "j1" } });

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(res.error).toBeTruthy();
  });

  it("does not retry non-401 failures", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { message: "boom", context: { response: { status: 500 } } },
    });

    const res = await invokeFunction("send-payment-received", { body: { service_call_id: "j1" } });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(refreshSession).not.toHaveBeenCalled();
    expect(res.error).toBeTruthy();
  });

  // FunctionsHttpError from supabase-js puts the Response on `context` itself,
  // not on `context.response` — this is the shape the live 401 actually has.
  it("retries when the 401 status is on context itself (FunctionsHttpError)", async () => {
    invoke
      .mockResolvedValueOnce({ data: null, error: { message: "non-2xx", context: { status: 401 } } })
      .mockResolvedValueOnce({ data: { success: true }, error: null });
    refreshSession.mockResolvedValue({ data: { session: { access_token: "fresh" } }, error: null });

    const res = await invokeFunction("send-whatsapp-receipt", { body: { job_id: "j1" } });

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(res.data).toEqual({ success: true });
  });

  it("does not retry a non-401 status on context itself", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "non-2xx", context: { status: 500 } } });

    const res = await invokeFunction("send-whatsapp-receipt", { body: { job_id: "j1" } });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(refreshSession).not.toHaveBeenCalled();
    expect(res.error).toBeTruthy();
  });
});

