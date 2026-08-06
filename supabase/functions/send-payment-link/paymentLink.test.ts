/**
 * Regression tests for the invoice-balance payment link path.
 *
 * These exercise the exact composition send-payment-link performs: resolve the
 * invoice's own organisation's SumUp credentials, then create a checkout with
 * them. The critical guarantee is that Org A's invoice can never be paid into
 * Org B's SumUp account.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveSumUpCredentials } from "../_shared/sumupCredentials.ts";
import { createSumUpDepositCheckout } from "../_shared/sumupCheckout.ts";

const ORG_KN = "8c37827f-ce2c-4507-a821-a5e807d89856";
const ORG_DG = "f1950683-e8b9-41cf-8972-2aa59516850d";

const CONFIGS: Record<string, Record<string, unknown>> = {
  [ORG_KN]: { merchant_code: "KN_MERCH", api_key: "sup_sk_KN" },
  [ORG_DG]: { merchant_code: "DG_MERCH", api_key: "sup_sk_DG" },
};

/** Mirrors the function's checkout creation for a given invoice/job row. */
async function buildLink(job: { id: string; organisation_id: string | null; balance_due: number; invoice_number?: string }) {
  const captured: { auth?: string | null; body?: any } = {};
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    captured.auth = (init.headers as Record<string, string>).Authorization;
    captured.body = JSON.parse(String(init.body));
    return new Response(
      JSON.stringify({ id: "chk_1", hosted_checkout_url: "https://pay.sumup.com/chk_1" }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;

  const creds = await resolveSumUpCredentials({
    organisationId: job.organisation_id,
    loadConfig: async (org) => CONFIGS[org] ?? null,
    getEnv: () => undefined,
  });
  if (!creds.ok || !creds.credentials) return { creds, captured, checkout: null };

  const checkout = await createSumUpDepositCheckout({
    amount: job.balance_due,
    serviceCallId: job.id,
    apiKey: creds.credentials.apiKey,
    merchantCode: creds.credentials.merchantCode,
    description: `Invoice ${job.invoice_number ?? job.id} - balance due`,
    fetchImpl,
  });
  return { creds, captured, checkout };
}

Deno.test("uses the invoice's own org credentials (K&N)", async () => {
  const { captured, checkout } = await buildLink({
    id: "job-kn-1", organisation_id: ORG_KN, balance_due: 247, invoice_number: "INV-2026-0015",
  });
  assertEquals(checkout?.ok, true);
  assertEquals(captured.auth, "Bearer sup_sk_KN");
  assertEquals(captured.body.merchant_code, "KN_MERCH");
  assertEquals(captured.body.amount, 247);
  assertEquals(captured.body.currency, "EUR");
  assertEquals(captured.body.checkout_reference, "job-kn-1");
});

Deno.test("no cross-tenant bleed: Dublin Gas invoice uses Dublin Gas merchant", async () => {
  const kn = await buildLink({ id: "job-kn-2", organisation_id: ORG_KN, balance_due: 100 });
  const dg = await buildLink({ id: "job-dg-1", organisation_id: ORG_DG, balance_due: 100 });

  assertEquals(kn.captured.body.merchant_code, "KN_MERCH");
  assertEquals(dg.captured.body.merchant_code, "DG_MERCH");
  assertEquals(kn.captured.auth === dg.captured.auth, false);
});

Deno.test("org without SumUp config gets no link (no global fallback)", async () => {
  const { creds, checkout, captured } = await buildLink({
    id: "job-x", organisation_id: "cccccccc-0000-0000-0000-000000000003", balance_due: 100,
  });
  assertEquals(creds.ok, false);
  assertEquals(creds.error, "no_sumup_config_for_organisation");
  assertEquals(checkout, null);
  // Critically: no HTTP call to SumUp was made at all.
  assertEquals(captured.body, undefined);
});

Deno.test("job with null organisation_id is rejected before any checkout", async () => {
  const { creds, checkout } = await buildLink({ id: "job-y", organisation_id: null, balance_due: 50 });
  assertEquals(creds.error, "missing_organisation_id");
  assertEquals(checkout, null);
});

Deno.test("balance is sent in major units with cents preserved", async () => {
  const { captured } = await buildLink({ id: "job-kn-3", organisation_id: ORG_KN, balance_due: 247.456 });
  assertEquals(captured.body.amount, 247.46);
});

Deno.test("description carries the invoice number for reconciliation", async () => {
  const { captured } = await buildLink({
    id: "job-kn-4", organisation_id: ORG_KN, balance_due: 10, invoice_number: "INV-2026-0099",
  });
  assertEquals(captured.body.description, "Invoice INV-2026-0099 - balance due");
});

Deno.test("SumUp failure surfaces as not-ok so the WhatsApp send is skipped", async () => {
  const creds = await resolveSumUpCredentials({
    organisationId: ORG_KN,
    loadConfig: async (org) => CONFIGS[org] ?? null,
    getEnv: () => undefined,
  });
  const checkout = await createSumUpDepositCheckout({
    amount: 100,
    serviceCallId: "job-kn-5",
    apiKey: creds.credentials!.apiKey,
    merchantCode: creds.credentials!.merchantCode,
    fetchImpl: (async () => new Response("denied", { status: 403 })) as unknown as typeof fetch,
  });
  assertEquals(checkout.ok, false);
  assertEquals(checkout.url, undefined);
});
