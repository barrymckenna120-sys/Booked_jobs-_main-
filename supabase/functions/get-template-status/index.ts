import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

  try {
    const { organisation_id } = await req.json().catch(() => ({}));
    if (!organisation_id || typeof organisation_id !== "string") {
      return json({ error: "organisation_id is required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: integration, error: intErr } = await supabase
      .from("tenant_integrations")
      .select("config")
      .eq("organisation_id", organisation_id)
      .eq("integration_type", "360messenger")
      .maybeSingle();

    if (intErr) return json({ error: intErr.message }, 500);
    if (!integration) return json({ error: "Integration not found" }, 404);

    const config = (integration.config ?? {}) as Record<string, unknown>;
    const secretName = config.api_key_secret as string | undefined;
    if (!secretName) {
      return json({ error: "config.api_key_secret missing" }, 500);
    }

    const apiKey = Deno.env.get(secretName);
    if (!apiKey) {
      return json({ error: `Secret ${secretName} is not set` }, 500);
    }

    const resp = await fetch("https://waba-v2.360dialog.io/v1/configs/templates", {
      method: "GET",
      headers: { "D360-API-KEY": apiKey },
    });

    const text = await resp.text();
    if (!resp.ok) {
      return json({ error: `360dialog HTTP ${resp.status}: ${text.slice(0, 500)}` }, 500);
    }

    let payload: any;
    try {
      payload = JSON.parse(text);
    } catch {
      return json({ error: "Invalid JSON from 360dialog" }, 500);
    }

    const raw: any[] = Array.isArray(payload)
      ? payload
      : payload?.waba_templates ?? payload?.templates ?? payload?.data ?? [];

    const templates = raw.map((t: any) => ({
      name: t?.name ?? "",
      status: t?.status ?? "",
      category: t?.category ?? "",
      language: t?.language ?? t?.languages?.[0] ?? "",
    }));

    return json({ templates });
  } catch (e) {
    return json({ error: (e as Error).message || "Unknown error" }, 500);
  }
});
