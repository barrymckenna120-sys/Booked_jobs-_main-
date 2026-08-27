import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function formatPhoneE164(phone: string | null): string {
  if (!phone) return "";
  let cleaned = phone.replace(/\s+/g, "").replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+353")) return cleaned;
  if (cleaned.startsWith("353")) return "+" + cleaned;
  if (cleaned.startsWith("0")) cleaned = cleaned.slice(1);
  return "+353" + cleaned;
}

function formatDateDDMMYYYY(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let daysAhead = 2;
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (typeof body.days_ahead === "number") daysAhead = body.days_ahead;
    }

    // Calculate target date in Europe/Dublin timezone
    const nowDublin = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Europe/Dublin" })
    );
    const target = new Date(nowDublin);
    target.setDate(target.getDate() + daysAhead);
    const targetStr = target.toISOString().split("T")[0];

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: jobs, error } = await supabase
      .from("service_calls")
      .select(`
        id,
        scheduled_date,
        time_block,
        job_type,
        organisation_id,
        assigned_engineer_id,
        status,
        customer_id,
        customers ( name, phone ),
        engineers:assigned_engineer_id ( name )
      `)
      .eq("scheduled_date", targetStr)
      .neq("status", "Cancelled");

    if (error) throw error;

    const calls = (jobs || []).map((job: any) => ({
      customer_name: job.customers?.name || "",
      customer_phone: formatPhoneE164(job.customers?.phone),
      scheduled_date: formatDateDDMMYYYY(job.scheduled_date),
      scheduled_time: job.time_block || "",
      job_type: job.job_type,
      engineer_name: job.engineers?.name || "",
      organisation_id: job.organisation_id,
    }));

    return new Response(JSON.stringify({ calls }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("get-upcoming-service-calls error:", err);
    return new Response(
      JSON.stringify({ calls: [], error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
