import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { job_id, reminder_type } = await req.json();

    if (!job_id || typeof job_id !== "string") {
      return new Response(
        JSON.stringify({ error: "job_id is required and must be a string" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const columnMap: Record<string, string> = {
      "30day": "reminder_30day_sent",
      "14day": "reminder_14day_sent",
      "2day": "reminder_2day_sent",
    };

    const column = columnMap[reminder_type];
    if (!column) {
      return new Response(
        JSON.stringify({ error: "reminder_type must be '30day', '14day', or '2day'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error } = await supabase
      .from("service_calls")
      .update({ [column]: true })
      .eq("id", job_id);

    if (error) throw error;

    return new Response(
      JSON.stringify({ success: true, job_id, reminder_type, column_updated: column }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
