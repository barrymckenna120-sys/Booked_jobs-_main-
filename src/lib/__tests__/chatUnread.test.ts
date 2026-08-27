import { describe, it, expect } from "vitest";
import { counterpartRole, formatChatNotificationTitle } from "@/lib/chatUnread";
import { resolveNotificationTarget } from "@/lib/notificationTarget";
import { shouldShowOnSurface } from "@/lib/notificationSurface";

describe("counterpartRole", () => {
  it("counts engineer messages for the office badge", () => {
    expect(counterpartRole("office")).toBe("engineer");
  });

  it("counts office messages for the engineer badge", () => {
    expect(counterpartRole("engineer")).toBe("office");
  });
});

describe("formatChatNotificationTitle", () => {
  it("formats engineer -> office", () => {
    expect(
      formatChatNotificationTitle({
        senderName: "John Smith",
        senderRole: "engineer",
        jobReference: "DG-100",
      }),
    ).toBe("John Smith (Engineer) sent you a message — Job DG-100");
  });

  it("formats office -> engineer", () => {
    expect(
      formatChatNotificationTitle({
        senderName: "Sarah Jones",
        senderRole: "office",
        jobReference: "DG-101",
      }),
    ).toBe("Sarah Jones (Office) sent you a message — Job DG-101");
  });

  it("drops the job segment when no reference exists", () => {
    expect(
      formatChatNotificationTitle({ senderName: "Karl", senderRole: "engineer", jobReference: null }),
    ).toBe("Karl (Engineer) sent you a message");
  });

  it("falls back to the role label when the sender name is blank", () => {
    expect(
      formatChatNotificationTitle({ senderName: "  ", senderRole: "office", jobReference: "DG-102" }),
    ).toBe("Office (Office) sent you a message — Job DG-102");
  });

  it("keeps each job reference tied to its own message", () => {
    const a = formatChatNotificationTitle({ senderName: "John", senderRole: "engineer", jobReference: "DG-100" });
    const b = formatChatNotificationTitle({ senderName: "John", senderRole: "engineer", jobReference: "DG-200" });
    expect(a).toContain("DG-100");
    expect(b).toContain("DG-200");
    expect(a).not.toContain("DG-200");
  });
});

describe("chat notification routing", () => {
  it("opens the office job page (which hosts the chat thread)", () => {
    expect(
      resolveNotificationTarget({ notification_type: "message", job_id: "job-1" }, "/jobs"),
    ).toBe("/jobs/job-1");
  });

  it("opens the engineer job page", () => {
    expect(
      resolveNotificationTarget({ notification_type: "message", job_id: "job-2" }, "/engineer/job"),
    ).toBe("/engineer/job/job-2");
  });
});

describe("chat notification surfaces", () => {
  it("engineer-scoped chat rows only reach the engineer bell", () => {
    expect(shouldShowOnSurface("engineer", "engineer")).toBe(true);
    expect(shouldShowOnSurface("engineer", "office")).toBe(false);
  });

  it("office-scoped chat rows only reach the office bell", () => {
    expect(shouldShowOnSurface("office", "office")).toBe(true);
    expect(shouldShowOnSurface("office", "engineer")).toBe(false);
  });
});
