import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

  const {
    company_name,
    company_phone,
    owner_name,
    owner_email,
    org_slug,
    business_address,
    business_email,
    rgi_number,
    job_reference_prefix,
  } = body ?? {};

  // Step 1: validate
  const required = { company_name, company_phone, owner_name, owner_email, org_slug, job_reference_prefix };
  for (const [field, value] of Object.entries(required)) {
    if (!value || typeof value !== "string" || !value.trim()) {
      return json({ error: "missing_field", field }, 400);
    }
  }

  if (!/^[A-Z0-9]{2,6}$/.test(job_reference_prefix.trim())) {
    return json({
      error: "invalid_job_reference_prefix",
      detail: "job_reference_prefix must be 2–6 characters, uppercase letters or digits only",
    }, 400);
  }

  const addressPart = (business_address ?? "").toString().trim();
  const message_footer = [company_name, addressPart, company_phone]
    .filter((v) => v && String(v).trim())
    .join(" | ");

  const logFailure = async (step: string, error: string) => {
    try {
      await supabase.from("edge_function_logs").insert({
        function_name: "provision-tenant",
        error_message: `${step}: ${error}`,
        payload: { org_slug, owner_email } as any,
      });
    } catch (_e) { /* best effort */ }
  };

  // Step 2: slug uniqueness — auto-suffix if taken
  let finalSlug = org_slug;
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? org_slug : `${org_slug}-${i + 1}`;
    const { data: existing, error: slugErr } = await supabase
      .from("organisations")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (slugErr) {
      await logFailure("step 2", slugErr.message);
      return json({ error: "provision_failed", step: "2", detail: slugErr.message }, 500);
    }
    if (!existing) {
      finalSlug = candidate;
      break;
    }
    if (i === 49) {
      return json({ error: "slug_taken" }, 409);
    }
  }

  // Step 3: insert organisation
  const { data: org, error: orgErr } = await supabase
    .from("organisations")
    .insert({
      name: company_name,
      slug: finalSlug,
      subscription_status: "trial",
      owner_name,
      owner_phone: company_phone,
      industry: "gas_heating",
      job_reference_prefix: job_reference_prefix.trim(),
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

  // Ensure organisation_id + role are present in raw_app_meta_data (JWT claims)
  const { error: appMetaErr } = await supabase.auth.admin.updateUserById(newUserId, {
    app_metadata: { organisation_id: newOrgId, role: "admin" },
  });
  if (appMetaErr) {
    await logFailure("step 6b", appMetaErr.message);
    return json({ error: "provision_failed", step: "6b", detail: appMetaErr.message }, 500);
  }

  // Step 6c: create/update profile for tenant owner
  const { error: profileErr } = await supabase
    .from("profiles")
    .upsert({
      user_id: newUserId,
      organisation_id: newOrgId,
      role: "admin",
      display_name: owner_name,
    }, { onConflict: "user_id" });
  if (profileErr) {
    await logFailure("step 6c", profileErr.message);
    return json({ error: "Failed to create profile for tenant owner" }, 500);
  }

  // Step 4: settings upsert (user may already have a settings row from a prior org)
  const { error: settingsErr } = await supabase
    .from("settings")
    .upsert({
      organisation_id: newOrgId,
      user_id: newUserId,
      company_name,
      company_phone,
      business_name: company_name,
      business_phone: company_phone,
      business_address: addressPart || null,
      business_email: (business_email ?? "").toString().trim() || null,
      rgi_number: (rgi_number ?? "").toString().trim() || null,
      message_footer,
      owner_name,
      cert_prefix: finalSlug.slice(0, 2).toUpperCase(),
    }, { onConflict: "organisation_id" });
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

  // Step 5b: engineers row for owner (so IntegrationsTab + role checks resolve org)
  const { error: engErr } = await supabase
    .from("engineers")
    .insert({
      organisation_id: newOrgId,
      auth_user_id: newUserId,
      name: owner_name,
      email: owner_email,
      phone: company_phone,
      role: "admin",
      can_access_office: true,
      status: "active",
      is_available: true,
    });
  if (engErr) {
    await logFailure("step 5b", engErr.message);
    return json({ error: "provision_failed", step: "5b", detail: engErr.message }, 500);
  }

  // Step 5c: seed tenant_integrations rows so WhatsApp + Tally work out of the box
  const { error: tiErr } = await supabase
    .from("tenant_integrations")
    .insert([
      {
        organisation_id: newOrgId,
        integration_type: "360messenger",
        config: {
          api_key_secret: "THREESIXTY_API_KEY",
          company_name,
          company_phone,
          country_code: "353",
        },
      },
      {
        organisation_id: newOrgId,
        integration_type: "tally",
        config: {},
      },
    ]);
  if (tiErr) {
    await logFailure("step 5c", tiErr.message);
    return json({ error: "provision_failed", step: "5c", detail: tiErr.message }, 500);
  }

  // Step 7: success
  return json({
    success: true,
    organisation_id: newOrgId,
    org_slug: finalSlug,
    invited_email: owner_email,
  });
});
