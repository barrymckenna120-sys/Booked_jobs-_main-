import { describe, it, expect } from "vitest";
import {
  getCorsHeaders,
  isAllowedOrigin,
  corsHeaders,
} from "../../../supabase/functions/_shared/cors";

describe("edge function CORS helper", () => {
  it("allows the tenant custom domains", () => {
    expect(isAllowedOrigin("https://dublin-gas.bookedjobs.ie")).toBe(true);
    expect(isAllowedOrigin("https://kngasservices.bookedjobs.ie")).toBe(true);
  });

  it("allows lovable preview hosts and localhost", () => {
    expect(isAllowedOrigin("https://karlsgas.lovable.app")).toBe(true);
    expect(isAllowedOrigin("https://abc.lovableproject.com")).toBe(true);
    expect(isAllowedOrigin("http://localhost:8080")).toBe(true);
  });

  it("rejects unknown origins and malformed values", () => {
    expect(isAllowedOrigin("https://evil.example.com")).toBe(false);
    expect(isAllowedOrigin("not-a-url")).toBe(false);
    expect(isAllowedOrigin(null)).toBe(false);
  });

  it("echoes an allowed origin and varies on Origin", () => {
    const h = getCorsHeaders(
      new Request("https://x.test/f", {
        headers: { origin: "https://dublin-gas.bookedjobs.ie" },
      }),
    );
    expect(h["Access-Control-Allow-Origin"]).toBe(
      "https://dublin-gas.bookedjobs.ie",
    );
    expect(h["Vary"]).toBe("Origin");
    expect(h["Access-Control-Allow-Methods"]).toContain("OPTIONS");
  });

  it("grants no origin to unknown callers", () => {
    const h = getCorsHeaders(
      new Request("https://x.test/f", {
        headers: { origin: "https://evil.example.com" },
      }),
    );
    expect(h["Access-Control-Allow-Origin"]).toBe("");
  });

  it("allows the headers the app and cron actually send", () => {
    const allowed = corsHeaders["Access-Control-Allow-Headers"];
    for (const header of [
      "authorization",
      "content-type",
      "apikey",
      "x-webhook-secret",
      "x-make-secret",
      "x-org-impersonation-token",
    ]) {
      expect(allowed).toContain(header);
    }
  });
});
