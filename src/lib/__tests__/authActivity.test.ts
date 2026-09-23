import { describe, expect, it } from "vitest";
import { classifyFailureReason } from "@/lib/authActivity";
import { formatDevice, formatEventTime } from "@/components/admin/LoginActivityTable";

describe("classifyFailureReason", () => {
  it("reports a network failure when the caller says so, whatever the message", () => {
    expect(classifyFailureReason(new Error("Load failed"), true)).toBe("network_error");
  });

  it("recognises wrong credentials", () => {
    expect(classifyFailureReason({ message: "Invalid login credentials" })).toBe(
      "invalid_credentials"
    );
  });

  it("recognises a blocked account by code and by message", () => {
    expect(classifyFailureReason({ code: "user_banned" })).toBe("account_blocked");
    expect(classifyFailureReason({ message: "User is banned" })).toBe("account_blocked");
  });

  it("recognises rate limiting and unconfirmed email", () => {
    expect(classifyFailureReason({ message: "Too many requests" })).toBe("rate_limited");
    expect(classifyFailureReason({ message: "Email not confirmed" })).toBe(
      "email_not_confirmed"
    );
  });

  it("falls back to other, and never echoes the message", () => {
    const reason = classifyFailureReason({ message: "secret@example.com failed" });
    expect(reason).toBe("other");
  });
});

describe("formatEventTime", () => {
  it("renders DD/MM/YY HH:MM", () => {
    expect(formatEventTime("2026-09-23T07:05:00")).toBe("23/09/26 07:05");
  });

  it("never throws on a bad value", () => {
    expect(formatEventTime("not-a-date")).toBe("—");
  });
});

describe("formatDevice", () => {
  it("joins what is present and flags the installed app", () => {
    expect(
      formatDevice({
        browser: "Safari",
        browser_version: "18",
        os: "iOS",
        device_type: "Mobile",
        display_mode: "standalone",
      })
    ).toBe("Safari 18 · iOS · Mobile · Installed app");
  });

  it("skips missing parts without dangling separators", () => {
    expect(formatDevice({ browser: "Chrome", os: null, device_type: "Desktop" })).toBe(
      "Chrome · Desktop"
    );
  });

  it("shows a dash when nothing is known", () => {
    expect(formatDevice({})).toBe("—");
  });
});
