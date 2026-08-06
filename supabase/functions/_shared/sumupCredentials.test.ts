import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  resolveSumUpCredentials,
  makeRestSumUpConfigLoader,
} from "./sumupCredentials.ts";

const ORG_A = "aaaaaaaa-0000-0000-0000-000000000001";
const ORG_B = "bbbbbbbb-0000-0000-0000-000000000002";

Deno.test("resolves inline api_key + merchant_code for the given org", async () => {
  const res = await resolveSumUpCredentials({
    organisationId: ORG_A,
    loadConfig: async (org) => {
      assertEquals(org, ORG_A);
      return { merchant_code: "MERCH_A", api_key: "sup_sk_A" };
    },
    getEnv: () => undefined,
  });
  assertEquals(res.ok, true);
  assertEquals(res.credentials, { apiKey: "sup_sk_A", merchantCode: "MERCH_A" });
});

Deno.test("resolves api key from named env secret when no inline key", async () => {
  const res = await resolveSumUpCredentials({
    organisationId: ORG_A,
    loadConfig: async () => ({ merchant_code: "MERCH_A", api_key_secret: "ORG_A_SUMUP_KEY" }),
    getEnv: (n) => (n === "ORG_A_SUMUP_KEY" ? "sup_sk_from_env" : undefined),
  });
  assertEquals(res.ok, true);
  assertEquals(res.credentials?.apiKey, "sup_sk_from_env");
});

Deno.test("credentials never bleed across tenants", async () => {
  const configs: Record<string, Record<string, unknown>> = {
    [ORG_A]: { merchant_code: "MERCH_A", api_key: "sup_sk_A" },
    [ORG_B]: { merchant_code: "MERCH_B", api_key: "sup_sk_B" },
  };
  const load = async (org: string) => configs[org] ?? null;

  const a = await resolveSumUpCredentials({ organisationId: ORG_A, loadConfig: load, getEnv: () => undefined });
  const b = await resolveSumUpCredentials({ organisationId: ORG_B, loadConfig: load, getEnv: () => undefined });

  assertEquals(a.credentials?.merchantCode, "MERCH_A");
  assertEquals(b.credentials?.merchantCode, "MERCH_B");
  assertEquals(a.credentials?.apiKey === b.credentials?.apiKey, false);
});

Deno.test("hard-fails (no global fallback) when the org has no sumup config", async () => {
  const res = await resolveSumUpCredentials({
    organisationId: ORG_B,
    loadConfig: async () => null,
    // Project-wide secrets exist but must NOT be used.
    getEnv: (n) => (n === "SUMUP_API_KEY" ? "sup_sk_GLOBAL" : "MBBMEYG7"),
  });
  assertEquals(res.ok, false);
  assertEquals(res.error, "no_sumup_config_for_organisation");
  assertEquals(res.credentials, undefined);
});

Deno.test("fails when merchant_code missing", async () => {
  const res = await resolveSumUpCredentials({
    organisationId: ORG_A,
    loadConfig: async () => ({ api_key: "sup_sk_A" }),
    getEnv: () => undefined,
  });
  assertEquals(res.ok, false);
  assertEquals(res.error, "sumup_config_missing_merchant_code");
});

Deno.test("fails when api key missing or env secret unset", async () => {
  const res = await resolveSumUpCredentials({
    organisationId: ORG_A,
    loadConfig: async () => ({ merchant_code: "MERCH_A", api_key_secret: "NOT_SET" }),
    getEnv: () => undefined,
  });
  assertEquals(res.ok, false);
  assertEquals(res.error, "sumup_config_missing_api_key");
});

Deno.test("fails on missing organisation id", async () => {
  const res = await resolveSumUpCredentials({
    organisationId: null,
    loadConfig: async () => ({ merchant_code: "M", api_key: "k" }),
    getEnv: () => undefined,
  });
  assertEquals(res.ok, false);
  assertEquals(res.error, "missing_organisation_id");
});

Deno.test("lookup errors surface as a failure, not a fallback", async () => {
  const res = await resolveSumUpCredentials({
    organisationId: ORG_A,
    loadConfig: async () => {
      throw new Error("http_500");
    },
    getEnv: () => "sup_sk_GLOBAL",
  });
  assertEquals(res.ok, false);
  assertEquals(res.error, "sumup_config_lookup_failed: http_500");
});

Deno.test("rest loader filters by org and sumup type", async () => {
  let calledUrl = "";
  const loader = makeRestSumUpConfigLoader(
    "https://db.example.com",
    { apikey: "k" },
    (async (url: string) => {
      calledUrl = String(url);
      return new Response(JSON.stringify([{ config: { merchant_code: "M", api_key: "k" } }]), {
        status: 200,
      });
    }) as unknown as typeof fetch,
  );

  const cfg = await loader(ORG_A);
  assertEquals(cfg, { merchant_code: "M", api_key: "k" });
  assertEquals(calledUrl.includes(`organisation_id=eq.${ORG_A}`), true);
  assertEquals(calledUrl.includes("integration_type=eq.sumup"), true);
});

Deno.test("rest loader returns null when no row exists", async () => {
  const loader = makeRestSumUpConfigLoader(
    "https://db.example.com",
    {},
    (async () => new Response("[]", { status: 200 })) as unknown as typeof fetch,
  );
  assertEquals(await loader(ORG_B), null);
});
