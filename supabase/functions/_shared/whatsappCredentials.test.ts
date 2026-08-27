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

// --- Regression cases for the three senders migrated onto this resolver
// (send-payment-received, send-area-bulk-whatsapp, send-outstanding-invoice-reminders).
// Each previously read `config.api_key` on the 360messenger row only, so every
// tenant storing a secret NAME returned "not configured".

Deno.test("360messenger row with api_key_secret only resolves from env", () => {
  const r = resolveWhatsappApiKey(
    [{ integration_type: "360messenger", config: { api_key_secret: "THREESIXTY_API_KEY_CAVAN_GAS" } }],
    env({ THREESIXTY_API_KEY_CAVAN_GAS: "cavan-live-key" }),
  );
  assertEquals(r.apiKey, "cavan-live-key");
  assertEquals(r.resolution, "secret:THREESIXTY_API_KEY_CAVAN_GAS");
});

Deno.test("360messenger row with api_key_secret only and no secret set fails nameably", () => {
  const r = resolveWhatsappApiKey(
    [{ integration_type: "360messenger", config: { api_key_secret: "THREESIXTY_API_KEY_CAVAN_GAS" } }],
    env({}),
  );
  assertEquals(r.apiKey, null);
  assertEquals(r.resolution, "secret_missing:THREESIXTY_API_KEY_CAVAN_GAS");
});

Deno.test("secret name on 360messenger wins over a literal key on the whatsapp row", () => {
  const rows = [
    { integration_type: "360messenger", config: { api_key_secret: "THREESIXTY_API_KEY" } },
    { integration_type: "whatsapp", config: { api_key: "older-literal-key" } },
  ];
  const withSecret = resolveWhatsappApiKey(rows, env({ THREESIXTY_API_KEY: "kn-live-key" }));
  assertEquals(withSecret.apiKey, "kn-live-key");
  assertEquals(withSecret.resolution, "secret:THREESIXTY_API_KEY");

  // Secret absent -> the literal whatsapp row is the fallback, not a hard failure.
  const withoutSecret = resolveWhatsappApiKey(rows, env({}));
  assertEquals(withoutSecret.apiKey, "older-literal-key");
  assertEquals(withoutSecret.resolution, "literal_config:whatsapp");
});
