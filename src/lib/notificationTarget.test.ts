import { describe, expect, it } from "vitest";
import { resolveNotificationTarget } from "./notificationTarget";

describe("resolveNotificationTarget", () => {
  it("deep-links a cancellation to the office parts list with the row highlighted", () => {
    expect(
      resolveNotificationTarget({
        notification_type: "parts_cancelled",
        job_id: "3c7dfd04-27ae-4977-b3b8-88bd3c896b4f",
        metadata: { parts_request_id: "ffe8ba02-bfbb-4ab3-ad18-0d50d6352a6a" },
      }),
    ).toBe("/parts?highlight=ffe8ba02-bfbb-4ab3-ad18-0d50d6352a6a");
  });

  it("deep-links a parts update to the engineer parts list", () => {
    expect(
      resolveNotificationTarget(
        {
          notification_type: "parts_update",
          job_id: "job-1",
          metadata: { parts_request_id: "part-1" },
        },
        "/engineer/jobs",
      ),
    ).toBe("/engineer/parts?highlight=part-1");
  });

  it("falls back to the parts list when metadata has no parts_request_id", () => {
    expect(
      resolveNotificationTarget({ notification_type: "parts_cancelled", job_id: "job-1", metadata: {} }),
    ).toBe("/parts");
  });

  it("keeps job-page behaviour for non-parts notifications", () => {
    expect(
      resolveNotificationTarget({ notification_type: "new_job", job_id: "job-1" }),
    ).toBe("/jobs/job-1");
    expect(
      resolveNotificationTarget({ notification_type: "new_job", job_id: "job-1" }, "/engineer/jobs"),
    ).toBe("/engineer/jobs/job-1");
  });

  it("returns null when there is nothing to open", () => {
    expect(resolveNotificationTarget({ notification_type: "new_job", job_id: null })).toBeNull();
  });
});
