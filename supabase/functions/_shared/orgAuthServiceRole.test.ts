// Regression: internal service-role calls (renewal reminders -> create-booking-link)
// must not be refused when the tenant has a per-tenant Make webhook secret.
// Read-only: resolves an organisation row; needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
import { assertEquals } from "jsr:@std/assert@1";
import { isDenied, requireBoundOrg } from "./orgAuth.ts";

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
    assertEquals(isDenied(r) ? r.error.status : 0, 401);
  },
});

Deno.test({
  name: "a wrong secret without service role is still refused",
  ignore,
  async fn() {
    const r = await requireBoundOrg(req({ "x-webhook-secret": "wrong" }), {
      fnName: "test", cors, requestedOrgId: org!,
    });
    assertEquals(isDenied(r), true);
  },
});

const defaultOrg = Deno.env.get("QA_ORG_WITHOUT_TENANT_SECRET");
const anon = Deno.env.get("SUPABASE_ANON_KEY");
const userJwt = Deno.env.get("QA_USER_JWT");
const otherOrg = Deno.env.get("QA_OTHER_ORG");

Deno.test({
  name: "service-role caller still works for a tenant on the platform default (no own secret)",
  ignore: ignore || !defaultOrg,
  async fn() {
    const r = await requireBoundOrg(req({ Authorization: `Bearer ${key}` }), {
      fnName: "test", cors, requestedOrgId: defaultOrg!,
    });
    assertEquals((r as { orgId?: string }).orgId, defaultOrg);
  },
});

Deno.test({
  name: "public (anon) key is not treated as service role",
  ignore: ignore || !anon,
  async fn() {
    const r = await requireBoundOrg(req({ Authorization: `Bearer ${anon}` }), {
      fnName: "test", cors, requestedOrgId: org!,
    });
    assertEquals(isDenied(r), true);
  },
});

Deno.test({
  name: "a signed-in user cannot act for another company",
  ignore: ignore || !userJwt || !otherOrg,
  async fn() {
    const r = await requireBoundOrg(req({ Authorization: `Bearer ${userJwt}` }), {
      fnName: "test", cors, requestedOrgId: otherOrg!,
    });
    assertEquals(isDenied(r) ? r.error.status : 0, 403);
  },
});
