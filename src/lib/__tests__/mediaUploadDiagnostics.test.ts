import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@sentry/react", () => ({ captureException: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: vi.fn() } },
}));

import {
  isTransientUploadError,
  runUploadWithRetry,
} from "@/lib/mediaUploadDiagnostics";

const ctx = {
  surface: "MediaSheet",
  stage: "storage_upload" as const,
  jobId: "job-1",
  customerId: "cust-1",
  storagePath: "customers/cust-1/job-1/photo.jpg",
  hadSession: true,
};

describe("media upload retry", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("does not retry a successful upload", async () => {
    const op = vi.fn().mockResolvedValue({ error: null });
    const result = await runUploadWithRetry(op, ctx);
    expect(op).toHaveBeenCalledTimes(1);
    expect(result.error).toBeNull();
  });

  it("never retries a permission/validation failure", async () => {
    const error = {
      message: "new row violates row-level security policy",
      code: "42501",
    };
    const op = vi.fn().mockResolvedValue({ error });
    const result = await runUploadWithRetry(op, ctx);
    expect(op).toHaveBeenCalledTimes(1);
    expect(result.error).toBe(error);
  });

  it("retries exactly once on a connectivity failure", async () => {
    const op = vi
      .fn()
      .mockResolvedValueOnce({ error: { message: "Load failed" } })
      .mockResolvedValueOnce({ error: null });
    const result = await runUploadWithRetry(op, ctx);
    expect(op).toHaveBeenCalledTimes(2);
    expect(result.error).toBeNull();
  });

  it("surfaces the real error when the single retry also fails", async () => {
    const error = { message: "Failed to fetch" };
    const op = vi.fn().mockResolvedValue({ error });
    const result = await runUploadWithRetry(op, ctx);
    expect(op).toHaveBeenCalledTimes(2);
    expect(result.error).toBe(error);
  });

  it("classifies connectivity vs database errors", () => {
    expect(isTransientUploadError({ message: "Failed to fetch" })).toBe(true);
    expect(isTransientUploadError({ message: "timeout" })).toBe(true);
    expect(isTransientUploadError({ message: "permission denied" })).toBe(false);
  });
});
