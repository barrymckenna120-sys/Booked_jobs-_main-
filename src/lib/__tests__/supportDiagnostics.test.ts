import { describe, it, expect } from "vitest";
import {
  parseBrowser,
  parseOs,
  parseDeviceType,
  formatAppScreen,
  screenFromRoute,
} from "../supportDiagnostics";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const WIN_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

describe("supportDiagnostics parsing", () => {
  it("reads browser + major version", () => {
    expect(parseBrowser(IPHONE_SAFARI)).toEqual({ name: "Safari", version: "18" });
    expect(parseBrowser(WIN_CHROME)).toEqual({ name: "Chrome", version: "131" });
    expect(parseBrowser("")).toEqual({ name: null, version: null });
  });

  it("reads OS and device class", () => {
    expect(parseOs(IPHONE_SAFARI)).toBe("iOS");
    expect(parseOs(WIN_CHROME)).toBe("Windows");
    expect(parseDeviceType(IPHONE_SAFARI)).toBe("Mobile");
    expect(parseDeviceType(WIN_CHROME)).toBe("Desktop");
  });
});

describe("app/screen label", () => {
  it("omits the separator when screen is missing", () => {
    expect(formatAppScreen("office", null)).toBe("Office");
    expect(formatAppScreen("engineer", "  ")).toBe("Engineer");
  });

  it("joins app and screen when present", () => {
    expect(formatAppScreen("office", "Dashboard")).toBe("Office — Dashboard");
    expect(formatAppScreen("engineer", "Job Screen — KN-434")).toBe(
      "Engineer — Job Screen — KN-434",
    );
  });

  it("falls back for unknown apps", () => {
    expect(formatAppScreen(null, "Dashboard")).toBe("Unknown — Dashboard");
  });
});

describe("screenFromRoute", () => {
  it("maps known routes", () => {
    expect(screenFromRoute("/dashboard")).toBe("Dashboard");
    expect(screenFromRoute("/engineer/today")).toBe("Today");
    expect(screenFromRoute("/engineer/job/abc")).toBe("Job Screen");
    expect(screenFromRoute("/jobs/abc123")).toBe("Job Screen");
    expect(screenFromRoute("/")).toBe("Home");
  });
});
