import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildSumUpReturnUrl,
  createSumUpDepositCheckout,
  SUMUP_CHECKOUTS_URL,
} from "./sumupCheckout.ts";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.test("returns hosted_checkout_url and posts the documented SumUp payload", async () => {
  let captured: { url: string; init: RequestInit } | null = null;
  const fetchImpl = ((url: string, init: RequestInit) => {
    captured = { url, init };
    return Promise.resolve(
      jsonResponse({
        id: "chk_123",
        hosted_checkout_url: "https://checkout.sumup.com/pay/abc123",
      }),
    );
  }) as unknown as typeof fetch;

  const result = await createSumUpDepositCheckout({
    amount: 99,
    serviceCallId: "job-uuid-1",
    apiKey: "sup_sk_test",
    merchantCode: "MCODE1",
    fetchImpl,
  });

  assertEquals(result.ok, true);
  assertEquals(result.url, "https://checkout.sumup.com/pay/abc123");
  assertEquals(result.checkoutId, "chk_123");

  assertEquals(captured!.url, SUMUP_CHECKOUTS_URL);
  assertEquals(captured!.init.method, "POST");
  const headers = captured!.init.headers as Record<string, string>;
  assertEquals(headers["Authorization"], "Bearer sup_sk_test");
  assertEquals(headers["Content-Type"], "application/json");

  const body = JSON.parse(captured!.init.body as string);
  assertEquals(body.checkout_reference, "job-uuid-1::1");
  assertEquals(body.amount, 99);
  assertEquals(body.currency, "EUR");
  assertEquals(body.merchant_code, "MCODE1");
  assertEquals(body.hosted_checkout, { enabled: true });
});

Deno.test("sends major units rounded to 2dp, never cents", async () => {
  let body: any = null;
  const fetchImpl = ((_url: string, init: RequestInit) => {
    body = JSON.parse(init.body as string);
    return Promise.resolve(jsonResponse({ hosted_checkout_url: "https://x" }));
  }) as unknown as typeof fetch;

  await createSumUpDepositCheckout({
    amount: 123.456,
    serviceCallId: "job-1",
    apiKey: "k",
    merchantCode: "m",
    fetchImpl,
  });

  assertEquals(body.amount, 123.46);
});

Deno.test("falls back to nested hosted_checkout.url shape", async () => {
  const fetchImpl = (() =>
    Promise.resolve(
      jsonResponse({ id: "c1", hosted_checkout: { url: "https://checkout.sumup.com/pay/nested" } }),
    )) as unknown as typeof fetch;

  const result = await createSumUpDepositCheckout({
    amount: 50,
    serviceCallId: "job-1",
    apiKey: "k",
    merchantCode: "m",
    fetchImpl,
  });

  assertEquals(result.ok, true);
  assertEquals(result.url, "https://checkout.sumup.com/pay/nested");
});

Deno.test("fails closed on non-2xx from SumUp", async () => {
  const fetchImpl = (() =>
    Promise.resolve(jsonResponse({ message: "Unauthorized" }, 401))) as unknown as typeof fetch;

  const result = await createSumUpDepositCheckout({
    amount: 99,
    serviceCallId: "job-1",
    apiKey: "bad",
    merchantCode: "m",
    fetchImpl,
  });

  assertEquals(result.ok, false);
  assertEquals(result.url, undefined);
  assertStringIncludes(result.error!, "sumup_http_401");
});

Deno.test("fails closed when hosted_checkout_url is absent from a 200", async () => {
  const fetchImpl = (() =>
    Promise.resolve(jsonResponse({ id: "chk", status: "PENDING" }))) as unknown as typeof fetch;

  const result = await createSumUpDepositCheckout({
    amount: 99,
    serviceCallId: "job-1",
    apiKey: "k",
    merchantCode: "m",
    fetchImpl,
  });

  assertEquals(result.ok, false);
  assertStringIncludes(result.error!, "sumup_missing_hosted_checkout_url");
});

Deno.test("fails closed on network error instead of throwing", async () => {
  const fetchImpl = (() => Promise.reject(new Error("boom"))) as unknown as typeof fetch;

  const result = await createSumUpDepositCheckout({
    amount: 99,
    serviceCallId: "job-1",
    apiKey: "k",
    merchantCode: "m",
    fetchImpl,
  });

  assertEquals(result.ok, false);
  assertStringIncludes(result.error!, "sumup_request_failed");
});

Deno.test("guards: zero/negative amount, missing reference, missing credentials — no HTTP call", async () => {
  let calls = 0;
  const fetchImpl = (() => {
    calls++;
    return Promise.resolve(jsonResponse({ hosted_checkout_url: "https://x" }));
  }) as unknown as typeof fetch;

  const zero = await createSumUpDepositCheckout({
    amount: 0, serviceCallId: "j", apiKey: "k", merchantCode: "m", fetchImpl,
  });
  const negative = await createSumUpDepositCheckout({
    amount: -10, serviceCallId: "j", apiKey: "k", merchantCode: "m", fetchImpl,
  });
  const noRef = await createSumUpDepositCheckout({
    amount: 99, serviceCallId: "", apiKey: "k", merchantCode: "m", fetchImpl,
  });
  const noKey = await createSumUpDepositCheckout({
    amount: 99, serviceCallId: "j", apiKey: "", merchantCode: "m", fetchImpl,
  });
  const noMerchant = await createSumUpDepositCheckout({
    amount: 99, serviceCallId: "j", apiKey: "k", merchantCode: "", fetchImpl,
  });

  assertEquals(zero.error, "invalid_amount");
  assertEquals(negative.error, "invalid_amount");
  assertEquals(noRef.error, "missing_checkout_reference");
  assertEquals(noKey.error, "missing_sumup_credentials");
  assertEquals(noMerchant.error, "missing_sumup_credentials");
  assertEquals(calls, 0);
});

Deno.test("registers the webhook callback as return_url on every checkout", async () => {
  let captured: RequestInit | null = null;
  const fetchImpl = ((_url: string, init: RequestInit) => {
    captured = init;
    return Promise.resolve(
      new Response(
        JSON.stringify({ id: "chk_1", hosted_checkout_url: "https://checkout.sumup.com/pay/x" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
  }) as unknown as typeof fetch;

  await createSumUpDepositCheckout({
    amount: 50,
    serviceCallId: "job-1",
    apiKey: "k",
    merchantCode: "M",
    returnUrl: "https://example.supabase.co/functions/v1/sumup-payment-webhook?s=abc",
    fetchImpl,
  });

  const body = JSON.parse(captured!.body as string);
  assertEquals(
    body.return_url,
    "https://example.supabase.co/functions/v1/sumup-payment-webhook?s=abc",
  );

  // Without a configured secret the field is omitted rather than sent empty.
  await createSumUpDepositCheckout({
    amount: 50,
    serviceCallId: "job-1",
    apiKey: "k",
    merchantCode: "M",
    fetchImpl,
  });
  assertEquals("return_url" in JSON.parse(captured!.body as string), false);
});

Deno.test("buildSumUpReturnUrl builds a secret-bearing URL, or null when unconfigured", () => {
  assertEquals(
    buildSumUpReturnUrl("https://proj.supabase.co/", "s e c/ret"),
    "https://proj.supabase.co/functions/v1/sumup-payment-webhook?s=s%20e%20c%2Fret",
  );
  assertEquals(buildSumUpReturnUrl("https://proj.supabase.co", ""), null);
  assertEquals(buildSumUpReturnUrl("", "secret"), null);
  assertEquals(buildSumUpReturnUrl(undefined, undefined), null);
});

// --- BJ-0050a: attempt tracking + reference format ---

Deno.test("attempt number comes from existing rows and the attempt is recorded", async () => {
  let body: any = null;
  const fetchImpl = ((_url: string, init: RequestInit) => {
    body = JSON.parse(init.body as string);
    return Promise.resolve(
      jsonResponse({ id: "chk_2", status: "PENDING", hosted_checkout_url: "https://x" }),
    );
  }) as unknown as typeof fetch;

  const recorded: unknown[] = [];
  const result = await createSumUpDepositCheckout({
    amount: 50,
    serviceCallId: "job-9",
    apiKey: "k",
    merchantCode: "M",
    organisationId: "org-1",
    fetchImpl,
    attemptStore: {
      count: () => Promise.resolve(1),
      record: (row) => {
        recorded.push(row);
        return Promise.resolve();
      },
    },
  });

  assertEquals(result.ok, true);
  assertEquals(body.checkout_reference, "job-9::2");
  assertEquals(recorded, [{
    serviceCallId: "job-9",
    organisationId: "org-1",
    checkoutId: "chk_2",
    checkoutReference: "job-9::2",
    status: "PENDING",
  }]);
});

Deno.test("no store configured: attempt 1, no row, checkout still succeeds", async () => {
  let body: any = null;
  const fetchImpl = ((_url: string, init: RequestInit) => {
    body = JSON.parse(init.body as string);
    return Promise.resolve(jsonResponse({ id: "chk_3", hosted_checkout_url: "https://x" }));
  }) as unknown as typeof fetch;

  const result = await createSumUpDepositCheckout({
    amount: 10,
    serviceCallId: "job-10",
    apiKey: "k",
    merchantCode: "M",
    fetchImpl,
  });

  assertEquals(result.ok, true);
  assertEquals(body.checkout_reference, "job-10::1");
});

Deno.test("tracking failures never fail the checkout", async () => {
  const fetchImpl = (() =>
    Promise.resolve(jsonResponse({ id: "chk_4", hosted_checkout_url: "https://x" }))) as unknown as typeof fetch;

  const result = await createSumUpDepositCheckout({
    amount: 10,
    serviceCallId: "job-11",
    apiKey: "k",
    merchantCode: "M",
    organisationId: "org-1",
    fetchImpl,
    attemptStore: {
      count: () => Promise.reject(new Error("db down")),
      record: () => Promise.reject(new Error("db down")),
    },
  });

  assertEquals(result.ok, true);
  assertEquals(result.checkoutId, "chk_4");
});
