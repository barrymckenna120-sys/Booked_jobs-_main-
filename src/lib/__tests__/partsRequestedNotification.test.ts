import { describe, it, expect } from "vitest";
import { shouldShowOnSurface } from "@/lib/notificationSurface";
import { resolveNotificationTarget } from "@/lib/notificationTarget";

/**
 * Regression cover for the "New Parts Request" office alert (BJ parts bell).
 *
 * Live failure: an engineer-app parts request produced NO notification row at
 * all, because the DB trigger excluded the acting user from the office fan-out
 * and — on a single-account setup (owner uses the same login for both apps) —
 * that actor was the only eligible office recipient. The trigger now drops the
 * actor only when another eligible recipient exists in the same organisation.
 *
 * These assertions lock the client half of the chain: the row the trigger emits
 * (`role: 'office'`, `notification_type: 'parts_requested'`, unread, with
 * `parts_request_id` metadata) must reach the Office bell/drawer, must stay off
 * the Engineer bell, and must deep-link to the highlighted parts row.
 */
const row = {
  notification_type: "parts_requested" as const,
  role: "office",
  is_read: false,
  job_id: "job-1",
  metadata: { parts_request_id: "pr-1" },
};

describe("parts_requested office notification", () => {
  it("is visible on the Office bell/drawer surface", () => {
    expect(shouldShowOnSurface(row.role, "office")).toBe(true);
  });

  it("never reaches the Engineer bell", () => {
    expect(shouldShowOnSurface(row.role, "engineer")).toBe(false);
  });

  it("counts toward the unread badge while unread", () => {
    const unread = [row, { ...row, is_read: true }].filter(
      (n) => shouldShowOnSurface(n.role, "office") && !n.is_read,
    );
    expect(unread).toHaveLength(1);
  });

  it("deep-links to the highlighted parts request, not the job page", () => {
    expect(resolveNotificationTarget(row, "/jobs")).toBe("/parts?highlight=pr-1");
  });

  it("uses the engineer parts list when opened from the Engineer surface", () => {
    expect(resolveNotificationTarget(row, "/engineer/jobs")).toBe(
      "/engineer/parts?highlight=pr-1",
    );
  });
});
