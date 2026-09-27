// Temporary diagnostic: reports ONLY booleans about env var presence. Never returns values.
const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  let prefix: string | null = null;
  if (dbUrl !== null && dbUrl !== undefined) {
    if (dbUrl.startsWith("postgresql://")) prefix = "postgresql://";
    else if (dbUrl.startsWith("postgres://")) prefix = "postgres://";
    else prefix = "other";
  }
  return new Response(
    JSON.stringify({
      hasDbUrl: dbUrl !== null && dbUrl !== undefined,
      prefix,
    }),
    { headers: { ...corsHeaders, "content-type": "application/json" } },
  );
});
