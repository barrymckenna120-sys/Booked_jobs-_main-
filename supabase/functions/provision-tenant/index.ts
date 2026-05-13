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

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Verify caller is an authenticated superadmin
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "unauthorized" }, 401);
  }
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return json({ error: "unauthorized" }, 401);
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if ((profile as any)?.role !== "superadmin") {
    return json({ error: "forbidden" }, 403);
  }

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

  // Step 6 (moved): send invite first to get user_id; reuse if user exists
  let newUserId: string | null = null;
  const { data: inviteData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
    owner_email,
    {
      data: {
        organisation_id: newOrgId,
        role: "admin",
        full_name: owner_name,
      },
    },
  );
  if (inviteErr) {
    const msg = inviteErr.message ?? "";
    const alreadyExists = /already been registered|already registered|email_exists/i.test(msg);
    if (!alreadyExists) {
      await logFailure("step 6", msg);
      return json({ error: "provision_failed", step: "6", detail: msg }, 500);
    }
    // Look up existing user by email
    const { data: list, error: listErr } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (listErr) {
      await logFailure("step 6", `lookup failed: ${listErr.message}`);
      return json({ error: "provision_failed", step: "6", detail: listErr.message }, 500);
    }
    const found = list?.users?.find(
      (u) => (u.email ?? "").toLowerCase() === String(owner_email).toLowerCase(),
    );
    if (!found) {
      await logFailure("step 6", "user reported existing but not found in list");
      return json({ error: "provision_failed", step: "6", detail: "user_lookup_failed" }, 500);
    }
    newUserId = found.id;
  } else {
    newUserId = inviteData.user.id;
  }

  // Step 4: settings insert
  const { error: settingsErr } = await supabase
    .from("settings")
    .insert({
      organisation_id: newOrgId,
      user_id: newUserId,
      company_name,
      company_phone,
      business_name: company_name,
      business_phone: company_phone,
      owner_name,
    });
  if (settingsErr) {
    await logFailure("step 4", settingsErr.message);
    return json({ error: "provision_failed", step: "4", detail: settingsErr.message }, 500);
  }

  // Step 5: brand_settings insert
  const { error: brandErr } = await supabase
    .from("brand_settings")
    .insert({
      organisation_id: newOrgId,
    });
  if (brandErr) {
    await logFailure("step 5", brandErr.message);
    return json({ error: "provision_failed", step: "5", detail: brandErr.message }, 500);
  }

  // Step 7: success
  return json({
    success: true,
    organisation_id: newOrgId,
    org_slug,
    invited_email: owner_email,
  });
});
