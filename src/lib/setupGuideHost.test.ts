import { describe, expect, it } from "vitest";
import { getSetupGuideHost } from "./setupGuideHost";
import { isPublicPath } from "@/hooks/useAuth";

describe("getSetupGuideHost", () => {
  it.each([
    ["kngasservices.bookedjobs.ie", "kngasservices.bookedjobs.ie"],
    ["dublin-gas.bookedjobs.ie", "dublin-gas.bookedjobs.ie"],
    ["app.bookedjobs.ie", "app.bookedjobs.ie"],
    ["abc.lovableproject.com", "yourcompany.bookedjobs.ie"],
    ["localhost", "yourcompany.bookedjobs.ie"],
  ])("%s -> %s", (host, expected) => expect(getSetupGuideHost(host)).toBe(expected));
});

describe("isPublicPath (iPhone setup)", () => {
  it("/help/iphone-setup is public", () => expect(isPublicPath("/help/iphone-setup")).toBe(true));
  it("/help stays protected", () => expect(isPublicPath("/help")).toBe(false));
  it("/help/engineer stays protected", () => expect(isPublicPath("/help/engineer")).toBe(false));
});
