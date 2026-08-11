import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { resolveWhatsappApiKey } from "./whatsappCredentials.ts";

const env = (map: Record<string, string>) => (n: string) => map[n];

Deno.test("resolves the secret-name form (K&N's shape)", () => {
  const r = resolveWhatsappApiKey(
    [{ integration_type: "360messenger", config: { api_key_secret: "THREESIXTY_API_KEY" } }],
    env({ THREESIXTY_API_KEY: "live-key" }),
  );
  assertEquals(r.apiKey, "live-key");
  assertEquals(r.resolution, "secret:THREESIXTY_API_KEY");
});

Deno.test("resolves the legacy literal api_key form", () => {
  const r = resolveWhatsappApiKey(
    [{ integration_type: "360messenger", config: { api_key: "literal-key" } }],
    env({}),
  );
  assertEquals(r.apiKey, "literal-key");
  assertEquals(r.resolution, "literal_config:360messenger");
});

Deno.test("accepts the whatsapp integration_type row too", () => {
  const r = resolveWhatsappApiKey(
    [{ integration_type: "whatsapp", config: { api_key_secret: "K" } }],
    env({ K: "k1" }),
  );
  assertEquals(r.apiKey, "k1");
});

Deno.test("prefers the 360messenger row over whatsapp", () => {
  const r = resolveWhatsappApiKey(
    [
      { integration_type: "whatsapp", config: { api_key: "wrong" } },
      { integration_type: "360messenger", config: { api_key: "right" } },
    ],
    env({}),
  );
  assertEquals(r.apiKey, "right");
});

Deno.test("falls back to a literal key on the other row when the secret is unset", () => {
  const r = resolveWhatsappApiKey(
    [
      { integration_type: "360messenger", config: { api_key_secret: "MISSING" } },
      { integration_type: "whatsapp", config: { api_key: "fallback" } },
    ],
    env({}),
  );
  assertEquals(r.apiKey, "fallback");
});

Deno.test("names the missing secret rather than saying 'not configured'", () => {
  const r = resolveWhatsappApiKey(
    [{ integration_type: "360messenger", config: { api_key_secret: "THREESIXTY_API_KEY" } }],
    env({}),
  );
  assertEquals(r.apiKey, null);
  assertEquals(r.secretName, "THREESIXTY_API_KEY");
  assertEquals(r.detail, 'Secret "THREESIXTY_API_KEY" is not set for this organisation');
});

Deno.test("reports no row and empty config distinctly", () => {
  assertEquals(resolveWhatsappApiKey([], env({})).resolution, "no_integration_row");
  assertEquals(resolveWhatsappApiKey(null, env({})).resolution, "no_integration_row");
  assertEquals(
    resolveWhatsappApiKey([{ integration_type: "360messenger", config: {} }], env({})).resolution,
    "no_key_in_config",
  );
});

Deno.test("ignores blank and non-string config values", () => {
  const r = resolveWhatsappApiKey(
    [{ integration_type: "360messenger", config: { api_key_secret: "  ", api_key: 123 } }],
    env({}),
  );
  assertEquals(r.apiKey, null);
  assertEquals(r.resolution, "no_key_in_config");
});
