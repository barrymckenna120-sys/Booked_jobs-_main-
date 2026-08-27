import { createClient } from "npm:@supabase/supabase-js@2";
import { isPlatformAdminDenied, requirePlatformAdmin } from "../_shared/platformAdmin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const platformAdmin = await requirePlatformAdmin(req, {
      fnName: "list-tenants",
      cors: corsHeaders,
    });
    if (isPlatformAdminDenied(platformAdmin)) return platformAdmin.error;

    const admin = createClient(supabaseUrl, serviceKey);

    const { data, error } = await admin
      .from("organisations")
      .select(
        "id, name, slug, subscription_status, owner_name, owner_phone, industry, created_at, owner_user_id, is_blocked, is_archived, archived_at",
      )
      .order("created_at", { ascending: false });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ organisations: data || [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
