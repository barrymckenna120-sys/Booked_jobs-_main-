import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const MASTER_ORG_ID = "8c37827f-ce2c-4507-a821-a5e807d89856";

Deno.serve(async (req) => {
  // CORS: project-standard shared helper. The previous wildcard came from the
  // SDK export, so the effective policy was not visible in-repo.
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: jsonHeaders,
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Verify caller is superadmin
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing auth token" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid auth token" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (!profile || (profile as any).role !== "superadmin") {
      return new Response(JSON.stringify({ error: "Forbidden: superadmin only" }), {
        status: 403,
        headers: jsonHeaders,
      });
    }

    // Parse body
    let body: any;
    try {
      body = await req.json();
    } catch (_e) {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const target_org_id = body?.target_org_id;
    if (!target_org_id || typeof target_org_id !== "string") {
      return new Response(JSON.stringify({ error: "target_org_id required" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    // Read tenant integrations config
    const { data: integrations, error: intErr } = await admin
      .from("tenant_integrations")
      .select("integration_type, config")
      .eq("organisation_id", target_org_id);

    if (intErr) throw intErr;

    const byType: Record<string, any> = {};
    (integrations ?? []).forEach((r: any) => {
      byType[r.integration_type] = r.config ?? {};
    });

    const company_name = (byType["360messenger"]?.company_name ?? "").toString().trim();
    const domain = (byType["whatsapp"]?.domain ?? "").toString().trim();
    const template_prefix = (byType["whatsapp"]?.template_prefix ?? "").toString().trim();
    const payment_link = byType["stripe"]?.payment_link ?? null;
    const new_booking_url = byType["tally"]?.new_booking_url ?? null;
    const renewal_form_url = byType["tally"]?.renewal_form_url ?? null;

    const missing: string[] = [];
    if (!company_name) missing.push("company_name");
    if (!domain) missing.push("domain");
    if (!template_prefix) missing.push("template_prefix");
    if (missing.length) {
      return new Response(
        JSON.stringify({ error: `Missing config fields: ${missing.join(", ")}` }),
        { status: 400, headers: jsonHeaders },
      );
    }

    // Read master templates
    const { data: masters, error: mErr } = await admin
      .from("whatsapp_templates")
      .select("template_name, category, body, variables")
      .eq("organisation_id", MASTER_ORG_ID)
      .eq("is_master", true);

    if (mErr) throw mErr;
    if (!masters || masters.length === 0) {
      return new Response(JSON.stringify({ error: "No master templates found" }), {
        status: 404,
        headers: jsonHeaders,
      });
    }

    // Delete existing non-master rows for target org
    const { error: delErr } = await admin
      .from("whatsapp_templates")
      .delete()
      .eq("organisation_id", target_org_id)
      .eq("is_master", false);
    if (delErr) throw delErr;

    // Build rows
    const rows = (masters as any[]).map((m) => {
      const newName = String(m.template_name || "").replace(/^kn_gas_/, `${template_prefix}_`);
      const newBody = String(m.body || "")
        .split("K & N Gas Services").join(company_name)
        .split("kngasservices.bookedjobs.ie").join(domain);
      return {
        organisation_id: target_org_id,
        template_name: newName,
        category: m.category,
        body: newBody,
        variables: m.variables ?? [],
        meta_status: "pending",
        is_master: false,
      };
    });

    const { error: insErr } = await admin.from("whatsapp_templates").insert(rows);
    if (insErr) throw insErr;

    return new Response(
      JSON.stringify({
        success: true,
        count: rows.length,
        resolved_config: {
          company_name,
          domain,
          template_prefix,
          has_payment_link: !!payment_link,
          has_new_booking_url: !!new_booking_url,
          has_renewal_form_url: !!renewal_form_url,
        },
      }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("provision-whatsapp-templates error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
