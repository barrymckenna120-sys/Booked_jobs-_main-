import { describe, expect, it } from "vitest";
import {
  connectedWhatsAppNumber,
  hasConfigured360Key,
  normaliseApprovedWhatsAppNumber,
} from "./whatsappTestModeAdmin";

describe("WhatsApp test-mode admin helpers", () => {
  it("accepts +353 numbers and removes harmless formatting", () => {
    expect(normaliseApprovedWhatsAppNumber("+353 87 123 4567")).toBe("+353871234567");
    expect(normaliseApprovedWhatsAppNumber("0871234567")).toBeNull();
    expect(normaliseApprovedWhatsAppNumber("+441234567890")).toBeNull();
  });

  it("detects configured keys without exposing their values", () => {
    expect(hasConfigured360Key([{ integration_type: "360messenger", config: { api_key_secret: "NAME" } }])).toBe(true);
    expect(hasConfigured360Key([{ integration_type: "whatsapp", config: { api_key: "" } }])).toBe(false);
  });

  it("prefers the connected 360 company phone", () => {
    expect(connectedWhatsAppNumber([
      { integration_type: "360messenger", config: { company_phone: "087 1234567" } },
      { integration_type: "whatsapp", config: { whatsapp_number: "+353899999999" } },
    ])).toBe("087 1234567");
  });
});