import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const today = new Date();
    const target = new Date(today);
    target.setDate(target.getDate() + 7);
    const targetDate = target.toISOString().split("T")[0];

    const { data, error } = await supabase
      .from("customers")
      .select("id, name, phone, next_service_due")
      .eq("next_service_due", targetDate);

    if (error) throw error;

    const result = (data || []).map((c: any) => ({
      id: c.id,
      full_name: c.name,
      mobile_number: c.phone,
      next_service_due: c.next_service_due,
    }));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
