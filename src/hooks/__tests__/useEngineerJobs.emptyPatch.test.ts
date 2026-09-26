// BJ-NEW-T regression test: an empty patch passed to useEngineerJobs.updateJob
// is a refresh request (EngineerJobCard calls onUpdate(job.id, {}) after a
// payment). It must never reach updateServiceCallRow — an empty update changes
// 0 rows, which the blocked-write guard would misreport as
// "Couldn't update this job".
//
// No DOM test renderer is installed, so the hook is rendered once via
// react-dom/server and the returned updateJob is invoked directly.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

const { updateServiceCallRowMock, toastMock } = vi.hoisted(() => ({
  updateServiceCallRowMock: vi.fn(async () => ({ error: null, blocked: false })),
  toastMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }),
    }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
  },
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));
vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
}));
vi.mock("@/hooks/useNetworkStatus", () => ({
  useNetworkStatus: () => ({ isOnline: true }),
}));
vi.mock("@/lib/serviceCallWrite", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/serviceCallWrite")>();
  return { ...orig, updateServiceCallRow: updateServiceCallRowMock };
});

import { useEngineerJobs } from "@/hooks/useEngineerJobs";

const captureHook = (): ReturnType<typeof useEngineerJobs> => {
  let captured: ReturnType<typeof useEngineerJobs> | null = null;
  const Probe = () => {
    captured = useEngineerJobs();
    return null;
  };
  renderToString(createElement(Probe));
  if (!captured) throw new Error("hook did not render");
  return captured;
};

describe("useEngineerJobs.updateJob — empty patch (BJ-NEW-T)", () => {
  beforeEach(() => {
    updateServiceCallRowMock.mockClear();
    toastMock.mockClear();
  });

  it("never writes and never shows the blocked toast for updateJob(jobId, {})", async () => {
    const { updateJob } = captureHook();
    await updateJob("job-1", {});
    expect(updateServiceCallRowMock).not.toHaveBeenCalled();
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("still reaches the write path for a real patch", async () => {
    // updateJob reads window.scrollY before writing; stub it for the node env.
    (globalThis as any).window = { scrollY: 0, scrollTo: () => {} };
    (globalThis as any).requestAnimationFrame = (cb: () => void) => cb();
    const { updateJob } = captureHook();
    await updateJob("job-1", { status: "En Route" });
    expect(updateServiceCallRowMock).toHaveBeenCalledTimes(1);
  });
});
