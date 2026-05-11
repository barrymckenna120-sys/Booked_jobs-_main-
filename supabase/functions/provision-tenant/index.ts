import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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
    return json({ error: "Method not allowed" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const logEvent = async (error_message: string, payload: unknown) => {
    try {
      await admin.from("edge_function_logs").insert({
        function_name: "provision-tenant",
        error_message,
        payload: payload as any,
      });
    } catch (_e) { /* best-effort */ }
  };

  try {
    // Require Bearer auth header from authenticated user
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    let body: any;
    try {
      body = await req.json();
    } catch (_e) {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const { company_name, slug, owner_email, owner_name, company_phone } = body ?? {};

    const missing: string[] = [];
    if (!company_name || typeof company_name !== "string") missing.push("company_name");
    if (!slug || typeof slug !== "string") missing.push("slug");
    if (!owner_email || typeof owner_email !== "string") missing.push("owner_email");
    if (!owner_name || typeof owner_name !== "string") missing.push("owner_name");
    if (!company_phone || typeof company_phone !== "string") missing.push("company_phone");
    if (missing.length > 0) {
      return json({ error: "Missing required fields", missing }, 400);
    }

    // Check slug uniqueness
    const { data: existing, error: slugErr } = await admin
      .from("organisations")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (slugErr) {
      await logEvent(`Slug lookup failed: ${slugErr.message}`, { slug });
      return json({ error: "Slug check failed" }, 500);
    }
    if (existing) {
      return json({ error: "Slug already taken" }, 400);
    }

    // a) Create organisation
    const { data: org, error: orgErr } = await admin
      .from("organisations")
      .insert({
        name: company_name,
        slug,
        owner_name,
        owner_phone: company_phone,
        subscription_status: "trial",
        industry: "plumbing_heating",
      })
      .select("id")
      .single();
    if (orgErr || !org) {
      await logEvent(`Organisation insert failed: ${orgErr?.message}`, { slug, company_name });
      return json({ error: "Failed to create organisation" }, 500);
    }
    const new_org_id = org.id as string;

    try {
    // b) Send auth invite
    const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(owner_email, {
      data: { organisation_id: new_org_id, role: "admin" },
    });
    let authUserId: string | null = null;
    if (inviteErr) {
      await logEvent(`Invite failed: ${inviteErr.message}`, { owner_email, new_org_id });
      // User already exists — look them up and link
      const { data: listData } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const existing = listData?.users?.find((u: any) =>
        u.email?.toLowerCase() === owner_email.toLowerCase()
      );
      if (existing) {
        authUserId = existing.id;
        await admin.from("organisations")
          .update({ owner_user_id: existing.id })
          .eq("id", new_org_id);
      }
    } else {
      const { data: listData } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const newUser = listData?.users?.find((u: any) =>
        u.email?.toLowerCase() === owner_email.toLowerCase()
      );
      if (newUser) {
        authUserId = newUser.id;
        await admin.from("organisations")
          .update({ owner_user_id: newUser.id })
          .eq("id", new_org_id);
      }
    }

    // c) Default tenant_integrations
    const integrationRows = [
      {
        organisation_id: new_org_id,
        integration_type: "360messenger",
        config: {
          company_name,
          company_phone,
          country_code: "353",
          api_key_secret: "THREESIXTY_API_KEY",
        },
      },
      {
        organisation_id: new_org_id,
        integration_type: "tally",
        config: { renewal_form_url: "", new_booking_url: "" },
      },
      {
        organisation_id: new_org_id,
        integration_type: "make",
        config: {
          review_webhook_secret: "MAKE_REVIEW_WEBHOOK_URL",
          outstanding_reminder_webhook_secret: "OUTSTANDING_REMINDER_WEBHOOK_URL",
        },
      },
      {
        organisation_id: new_org_id,
        integration_type: "stripe",
        config: { payment_link: "" },
      },
    ];
    const { error: integrationsErr } = await admin
      .from("tenant_integrations")
      .insert(integrationRows);
    if (integrationsErr) {
      await logEvent(`tenant_integrations insert failed: ${integrationsErr.message}`, { new_org_id });
    }

    // d) Default brand_settings
    const { error: brandErr } = await admin
      .from("brand_settings")
      .insert({ organisation_id: new_org_id });
    if (brandErr) {
      await logEvent(`brand_settings insert failed: ${brandErr.message}`, { new_org_id });
    }

    // e) Default settings
    const { error: settingsErr } = await admin
      .from("settings")
      .insert({ organisation_id: new_org_id, business_name: company_name, business_phone: company_phone, user_id: authUserId });
    if (settingsErr) {
      await logEvent(`settings insert failed: ${settingsErr.message}`, { new_org_id });
    }

    const inviteSent = !inviteErr;
    if (inviteSent || authUserId) {
      await logEvent("Tenant provisioned successfully", {
        new_org_id,
        slug,
        owner_email,
        invite_sent: inviteSent,
        owner_user_id: authUserId,
      });
    } else {
      await logEvent(
        `Tenant created but invite failed — user may already exist. owner_user_id linked: ${authUserId ? "true" : "false"}`,
        { new_org_id, slug, owner_email, invite_sent: inviteSent, owner_user_id: authUserId },
      );
    }

    return json({
      success: true,
      organisation_id: new_org_id,
      slug,
      owner_email,
      message: "Tenant provisioned successfully",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logEvent(`Unhandled error: ${msg}`, null);
    return json({ error: msg }, 500);
  }
});
