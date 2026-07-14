// TEMPORARY one-shot. Deleted immediately after QA login proof.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

Deno.serve(async (req) => {
  const { password } = await req.json();
  if (!password || password.length < 12) {
    return new Response("bad password", { status: 400 });
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { error } = await supabase.auth.admin.updateUserById(
    "57ebf8de-b2d3-44bc-90b0-071d750a3f46",
    { password }
  );
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
});
