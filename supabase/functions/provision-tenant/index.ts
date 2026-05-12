import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const ADMIN_SECRET = Deno.env.get("ADMIN_PROVISION_SECRET");
  const provided = req.headers.get("x-admin-secret");
  if (!ADMIN_SECRET || provided !== ADMIN_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  let body: any;
  try {
    body = await req.json();
  } catch (_e) {
    return json({ error: "invalid_json" }, 400);
  }

  const { company_name, company_phone, owner_name, owner_email, org_slug } = body ?? {};

  // Step 1: validate
  const required = { company_name, company_phone, owner_name, owner_email, org_slug };
  for (const [field, value] of Object.entries(required)) {
    if (!value || typeof value !== "string" || !value.trim()) {
      return json({ error: "missing_field", field }, 400);
    }
  }

  const logFailure = async (step: string, error: string) => {
    try {
      await supabase.from("edge_function_logs").insert({
        function_name: "provision-tenant",
        error_message: `${step}: ${error}`,
        payload: { org_slug, owner_email } as any,
      });
    } catch (_e) { /* best effort */ }
  };

  // Step 2: slug uniqueness
  const { data: existing, error: slugErr } = await supabase
    .from("organisations")
    .select("id")
    .eq("slug", org_slug)
    .maybeSingle();
  if (slugErr) {
    await logFailure("step 2", slugErr.message);
    return json({ error: "provision_failed", step: "2", detail: slugErr.message }, 500);
  }
  if (existing) {
    return json({ error: "slug_taken" }, 409);
  }

  // Step 3: insert organisation
  const { data: org, error: orgErr } = await supabase
    .from("organisations")
    .insert({
      name: company_name,
      slug: org_slug,
      subscription_status: "trial",
      owner_name,
      owner_phone: company_phone,
      industry: "gas_heating",
    })
    .select("id")
    .single();
  if (orgErr || !org) {
    const msg = orgErr?.message ?? "insert returned no row";
    await logFailure("step 3", msg);
    return json({ error: "provision_failed", step: "3", detail: msg }, 500);
  }
  const newOrgId = org.id as string;

  // Step 4: settings upsert
  const { error: settingsErr } = await supabase
    .from("settings")
    .upsert(
      {
        organisation_id: newOrgId,
        company_name,
        company_phone,
      },
      { onConflict: "organisation_id" },
    );
  if (settingsErr) {
    await logFailure("step 4", settingsErr.message);
    return json({ error: "provision_failed", step: "4", detail: settingsErr.message }, 500);
  }

  // Step 5: brand_settings upsert
  const { error: brandErr } = await supabase
    .from("brand_settings")
    .upsert(
      {
        organisation_id: newOrgId,
        company_name,
      },
      { onConflict: "organisation_id" },
    );
  if (brandErr) {
    await logFailure("step 5", brandErr.message);
    return json({ error: "provision_failed", step: "5", detail: brandErr.message }, 500);
  }

  // Step 6: send invite
  const { error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(owner_email, {
    data: {
      organisation_id: newOrgId,
      role: "admin",
      full_name: owner_name,
    },
  });
  if (inviteErr) {
    await logFailure("step 6", inviteErr.message);
    return json({ error: "provision_failed", step: "6", detail: inviteErr.message }, 500);
  }

  // Step 7: success
  return json({
    success: true,
    organisation_id: newOrgId,
    org_slug,
    invited_email: owner_email,
  });
});
