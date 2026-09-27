import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { resolveOtpType } from "../ResetPassword";

describe("resolveOtpType", () => {
  it("defaults missing type to recovery", () => expect(resolveOtpType(null)).toBe("recovery"));
  it("accepts recovery", () => expect(resolveOtpType("recovery")).toBe("recovery"));
  it("accepts invite", () => expect(resolveOtpType("invite")).toBe("invite"));
  it("rejects other types", () => {
    expect(resolveOtpType("signup")).toBeNull();
    expect(resolveOtpType("magiclink")).toBeNull();
  });
});
