// A failed customer read must never be reported as a legitimate skip.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.env.set("SUPABASE_URL", "http://127.0.0.1:1");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-key");

const { consentSkipResponse, requireCustomerMessagingConsent } = await import(
  "./messagingConsent.ts"
);

const cors = { "Access-Control-Allow-Origin": "*" };

Deno.test("unreachable database => lookup_failed, not customer_not_found", async () => {
  const decision = await requireCustomerMessagingConsent({
    fnName: "test-fn",
    orgId: "org-1",
    customerId: "11111111-1111-1111-1111-111111111111",
    log: false,
  });
  assertEquals(decision.allowed, false);
  assertEquals((decision as { reason: string }).reason, "lookup_failed");
});

Deno.test("missing customer id keeps its existing customer_not_found reason", async () => {
  const decision = await requireCustomerMessagingConsent({
    fnName: "test-fn",
    orgId: "org-1",
    customerId: null,
    log: false,
  });
  assertEquals((decision as { reason: string }).reason, "customer_not_found");
});

Deno.test("lookup_failed responds 503 and is not a success", async () => {
  const res = consentSkipResponse("lookup_failed", cors);
  assertEquals(res.status, 503);
  assertEquals(await res.json(), { success: false, error: "lookup_failed" });
});

Deno.test("existing consent outcomes are unchanged", async () => {
  const optedOut = consentSkipResponse("customer_opted_out", cors);
  assertEquals(optedOut.status, 200);
  assertEquals((await optedOut.json()).skipped, true);

  const noPhone = consentSkipResponse("no_phone_number", cors);
  assertEquals(noPhone.status, 200);
  assertEquals((await noPhone.json()).success, true);

  const notFound = consentSkipResponse("customer_not_found", cors);
  assertEquals(notFound.status, 200);
  assertEquals((await notFound.json()).skipped, true);

  const wrongOrg = consentSkipResponse("customer_wrong_organisation", cors);
  assertEquals(wrongOrg.status, 403);
  assertEquals(await wrongOrg.json(), { success: false, error: "Forbidden" });
});
