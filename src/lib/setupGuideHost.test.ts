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

import { shouldShowIphoneSetupLink } from "./setupGuideHost";

const UA = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  ipad: "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
};

describe("shouldShowIphoneSetupLink", () => {
  it("iPhone Safari, not standalone -> true", () => expect(shouldShowIphoneSetupLink(UA.iphone, false)).toBe(true));
  it("iPhone, standalone -> false", () => expect(shouldShowIphoneSetupLink(UA.iphone, true)).toBe(false));
  it("Android Chrome -> false", () => expect(shouldShowIphoneSetupLink(UA.android, false)).toBe(false));
  it("desktop Mac -> false", () => expect(shouldShowIphoneSetupLink(UA.mac, false)).toBe(false));
  it("desktop Windows -> false", () => expect(shouldShowIphoneSetupLink(UA.windows, false)).toBe(false));
  it("iPad -> false", () => expect(shouldShowIphoneSetupLink(UA.ipad, false)).toBe(false));
});
