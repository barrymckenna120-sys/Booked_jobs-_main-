import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const headers = {
    "Content-Type": "application/json",
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  };

  const summary = { day14_sent: 0, day28_sent: 0, day14_failed: 0, day28_failed: 0 };

  try {
    // Process all active organisations
    const orgsResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/organisations?select=id&is_archived=eq.false`,
      { headers }
    );
    const organisations = await orgsResponse.json();

    // Calculate target dates once
    const today = new Date();
    const day14Date = new Date(today);
    day14Date.setDate(day14Date.getDate() - 14);
    const day14Str = day14Date.toISOString().split("T")[0];

    const day28Date = new Date(today);
    day28Date.setDate(day28Date.getDate() - 28);
    const day28Str = day28Date.toISOString().split("T")[0];

    for (const org of (organisations || []) as Array<{ id: string }>) {
      const ORG_ID = org.id;

      // Query eligible customers via PostgREST
      const day14Query = new URLSearchParams({
        select: "id,name,phone,boiler_brand,boiler_model,boiler_installation_date,warranty_reminder_log,renewal_stage",
        organisation_id: `eq.${ORG_ID}`,
        boiler_brand: "not.is.null",
        boiler_model: "not.is.null",
        opted_out: "not.eq.true",
        phone: "not.is.null",
      });

      const day14Response = await fetch(
        `${SUPABASE_URL}/rest/v1/customers?${day14Query.toString()}`,
        { headers }
      );
      const day14All = await day14Response.json();

      // Filter day 14 customers
      const day14Customers = (day14All || []).filter((c: Record<string, unknown>) => {
        if (c.boiler_installation_date !== day14Str) return false;
        const log = Array.isArray(c.warranty_reminder_log) ? c.warranty_reminder_log : [];
        return !log.some((entry: Record<string, unknown>) => entry.message_type === "warranty_day14");
      });

      // Send day 14 messages
      for (const customer of day14Customers) {
        try {
          const firstName = (customer.name as string).split(" ")[0];
          const installDate = formatDate(customer.boiler_installation_date as string);

          const sendRes = await fetch(
            `${SUPABASE_URL}/functions/v1/send-warranty-whatsapp`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              },
              body: JSON.stringify({
                phone: customer.phone,
                customer_id: customer.id,
                customer_name: customer.name,
                first_name: firstName,
                boiler_brand: customer.boiler_brand,
                boiler_model: customer.boiler_model,
                install_date_formatted: installDate,
                message_type: "warranty_day14",
              }),
            }
          );

          if (sendRes.ok) {
            summary.day14_sent++;
          } else {
            const errText = await sendRes.text();
            summary.day14_failed++;
            await logError(SUPABASE_URL, headers, customer.id as string, "warranty_day14", errText);
          }
        } catch (_e) {
          summary.day14_failed++;
          await logError(SUPABASE_URL, headers, customer.id as string, "warranty_day14", (_e as Error).message);
        }
        await delay(500);
      }

      // Step 2 — Day 28 customers
      const day28Customers = (day14All || []).filter((c: Record<string, unknown>) => {
        if (c.boiler_installation_date !== day28Str) return false;
        const log = Array.isArray(c.warranty_reminder_log) ? c.warranty_reminder_log : [];
        if (log.some((entry: Record<string, unknown>) => entry.message_type === "warranty_day28")) return false;
        const stage = (c.renewal_stage as string) || "";
        if (["Booked In", "Confirmed", "Paid"].includes(stage)) return false;
        return true;
      });

      for (const customer of day28Customers) {
        try {
          const firstName = (customer.name as string).split(" ")[0];
          const installDate = formatDate(customer.boiler_installation_date as string);

          const sendRes = await fetch(
            `${SUPABASE_URL}/functions/v1/send-warranty-whatsapp`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              },
              body: JSON.stringify({
                phone: customer.phone,
                customer_id: customer.id,
                customer_name: customer.name,
                first_name: firstName,
                boiler_brand: customer.boiler_brand,
                boiler_model: customer.boiler_model,
                install_date_formatted: installDate,
                message_type: "warranty_day28",
              }),
            }
          );

          if (sendRes.ok) {
            summary.day28_sent++;
          } else {
            const errText = await sendRes.text();
            summary.day28_failed++;
            await logError(SUPABASE_URL, headers, customer.id as string, "warranty_day28", errText);
          }
        } catch (_e) {
          summary.day28_failed++;
          await logError(SUPABASE_URL, headers, customer.id as string, "warranty_day28", (_e as Error).message);
        }
        await delay(500);
      }
    }

    // Log summary
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/edge_function_logs`, {
        method: "POST",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify({
          function_name: "warranty-auto-send",
          error_message: "OK",
          payload: summary,
        }),
      });
    } catch (_logErr) {
      // Non-critical
    }

    return new Response(
      JSON.stringify({ success: true, summary }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (_e) {
    // Log fatal error
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/edge_function_logs`, {
        method: "POST",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify({
          function_name: "warranty-auto-send",
          error_message: (_e as Error).message,
          payload: summary,
        }),
      });
    } catch (_logErr) {
      // Non-critical
    }

    return new Response(
      JSON.stringify({ error: (_e as Error).message, summary }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function formatDate(dateStr: string): string {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const [year, month, day] = dateStr.split("-");
  const monthName = months[parseInt(month, 10) - 1];
  return `${day} ${monthName} ${year}`;
}

async function logError(
  supabaseUrl: string,
  headers: Record<string, string>,
  customerId: string,
  messageType: string,
  errorMsg: string
) {
  try {
    await fetch(`${supabaseUrl}/rest/v1/edge_function_logs`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({
        function_name: "warranty-auto-send",
        error_message: errorMsg,
        payload: { customer_id: customerId, message_type: messageType },
      }),
    });
  } catch (_e) {
    // Non-critical
  }
}