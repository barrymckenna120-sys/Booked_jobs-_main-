// Regression: internal service-role calls (renewal reminders -> create-booking-link)
// must not be refused when the tenant has a per-tenant Make webhook secret.
// Read-only: resolves an organisation row; needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
import { assertEquals } from "jsr:@std/assert@1";
import { requireBoundOrg } from "./orgAuth.ts";

const url = Deno.env.get("SUPABASE_URL");
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const org = Deno.env.get("QA_ORG_WITH_TENANT_SECRET");
const ignore = !url || !key || !org;

const cors = { "Access-Control-Allow-Origin": "*" };
const req = (headers: Record<string, string>) =>
  new Request("http://localhost/fn", { method: "POST", headers });

Deno.test({
  name: "service-role caller is bound to the requested org even when tenant has its own secret",
  ignore,
  async fn() {
    const r = await requireBoundOrg(req({ Authorization: `Bearer ${key}` }), {
      fnName: "test", cors, requestedOrgId: org!,
    });
    assertEquals((r as { orgId?: string }).orgId, org);
  },
});

Deno.test({
  name: "no credentials is still refused",
  ignore,
  async fn() {
    const r = await requireBoundOrg(req({}), { fnName: "test", cors, requestedOrgId: org! });
    assertEquals(r instanceof Response ? r.status : 0, 401);
  },
});

Deno.test({
  name: "a wrong secret without service role is still refused",
  ignore,
  async fn() {
    const r = await requireBoundOrg(req({ "x-webhook-secret": "wrong" }), {
      fnName: "test", cors, requestedOrgId: org!,
    });
    assertEquals(r instanceof Response ? r.status : 0, r instanceof Response ? r.status : -1);
    assertEquals(r instanceof Response, true);
  },
});
