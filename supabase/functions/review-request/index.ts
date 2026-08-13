import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

    // Find completed jobs where completed_at is at least 2 hours ago
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const { data: jobs, error } = await supabase
      .from("service_calls")
      .select("id, customer_id, organisation_id")
      .eq("status", "Completed")
      .eq("review_sent", false)
      .lte("completed_at", twoHoursAgo);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!jobs || jobs.length === 0) {
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Per-org settings cache for google_review_url
    const reviewLinkCache = new Map<string, string | null>();
    const getReviewLink = async (orgId: string): Promise<string | null> => {
      if (reviewLinkCache.has(orgId)) return reviewLinkCache.get(orgId) ?? null;
      const { data: settings } = await supabase
        .from("settings")
        .select("google_review_url")
        .eq("organisation_id", orgId)
        .limit(1)
        .maybeSingle();
      const link = settings?.google_review_url || null;
      reviewLinkCache.set(orgId, link);
      return link;
    };

    // Fetch customer details
    const customerIds = [...new Set(jobs.map((j) => j.customer_id))];
    const { data: customers } = await supabase
      .from("customers")
      .select("id, name, phone")
      .in("id", customerIds);

    const customerMap: Record<string, { name: string; phone: string }> = {};
    (customers || []).forEach((c) => {
      customerMap[c.id] = { name: c.name, phone: c.phone };
    });

    const result: any[] = [];
    for (const job of jobs) {
      const orgId = (job as any).organisation_id;
      if (!orgId) {
        console.warn(`Skipping job ${job.id}: missing organisation_id`);
        continue;
      }
      const googleReviewLink = await getReviewLink(orgId);
      result.push({
        id: job.id,
        customer_name: customerMap[job.customer_id]?.name || "Unknown",
        mobile_number: customerMap[job.customer_id]?.phone || "",
        google_review_link: googleReviewLink,
      });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
