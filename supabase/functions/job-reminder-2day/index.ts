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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const apiKey = Deno.env.get("THREESIXTY_API_KEY");

  try {
    // Calculate target date (today + 2 days)
    const today = new Date();
    const target = new Date(today);
    target.setDate(target.getDate() + 2);
    const targetStr = target.toISOString().split("T")[0];

    // Query scheduled jobs for target date that haven't had reminder sent
    const { data: jobs, error: jobErr } = await supabase
      .from("service_calls")
      .select(`
        id,
        scheduled_date,
        time_block,
        assigned_engineer,
        assigned_engineer_id,
        customer_id,
        customers ( name, phone, opted_out )
      `)
      .eq("scheduled_date", targetStr)
      .eq("status", "Scheduled")
      .neq("reminder_2day_sent", true);

    if (jobErr) throw jobErr;

    if (!jobs || jobs.length === 0) {
      return new Response(
        JSON.stringify({ total: 0, sent: 0, skipped: 0, errors: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get engineer names for assigned jobs
    const engineerIds = [...new Set(jobs.filter((j: any) => j.assigned_engineer_id).map((j: any) => j.assigned_engineer_id))];
    const engineerMap = new Map<string, string>();

    if (engineerIds.length > 0) {
      const { data: engineers } = await supabase
        .from("engineers")
        .select("id, name")
        .in("id", engineerIds);
      for (const eng of engineers || []) {
        engineerMap.set(eng.id, eng.name);
      }
    }

    let sent = 0;
    let skipped = 0;
    let errors = 0;

    for (const job of jobs as any[]) {
      const customer = job.customers;
      if (!customer || customer.opted_out === true || !customer.phone) {
        skipped++;
        continue;
      }

      const fullName = customer.name || "Customer";
      const engineerName = engineerMap.get(job.assigned_engineer_id) || job.assigned_engineer || "our engineer";

      // Format date as DD/MM/YYYY
      const [year, month, day] = (job.scheduled_date as string).split("-");
      const formattedDate = `${day}/${month}/${year}`;

      // Format time block to 12-hour
      const timeBlock = job.time_block || "TBC";
      let formattedTime = timeBlock;
      const timeMatch = timeBlock.match(/^(\d{1,2}):(\d{2})/);
      if (timeMatch) {
        let hour = parseInt(timeMatch[1], 10);
        const mins = timeMatch[2];
        const ampm = hour >= 12 ? "pm" : "am";
        if (hour > 12) hour -= 12;
        if (hour === 0) hour = 12;
        formattedTime = `${hour}:${mins}${ampm}`;
      }

      // Normalise phone number
      let digits = customer.phone.replace(/\D/g, "");
      if (digits.startsWith("353") && digits.length === 12) {
        // already international
      } else if (digits.startsWith("0") && digits.length === 10) {
        digits = "353" + digits.slice(1);
      } else if (digits.length === 9) {
        digits = "353" + digits;
      }
      const cleanNumber = digits;

      const message = `Hi ${fullName},

This is a reminder from K & N Gas Services that your appointment is confirmed for ${formattedDate} at ${formattedTime}.

Your engineer will be ${engineerName}. If you need to reschedule please call us on 087 3686252 as soon as possible.

K & N Gas Services ☎ 087 3686252`;

      try {
        const formData = new FormData();
        formData.append("phonenumber", cleanNumber);
        formData.append("text", message);

        const response = await fetch("https://api.360messenger.com/v2/sendMessage", {
          method: "POST",
          headers: { "Authorization": `Bearer ${apiKey}` },
          body: formData,
        });

        const resultText = await response.text();
        let result: any;
        try { result = JSON.parse(resultText); } catch (_e) { result = { success: false, raw: resultText }; }

        // Log result
        await supabase.from("edge_function_logs").insert({
          function_name: "job-reminder-2day",
          error_message: result.success
            ? `Sent to ${fullName} (${cleanNumber})`
            : `Failed: ${resultText.substring(0, 500)}`,
          payload: { job_id: job.id, customer_name: fullName, phone: cleanNumber, api_response: result },
        });

        if (result.success) {
          // Mark reminder as sent
          await supabase
            .from("service_calls")
            .update({ reminder_2day_sent: true })
            .eq("id", job.id);
          sent++;
        } else {
          errors++;
        }
      } catch (sendErr: any) {
        errors++;
        await supabase.from("edge_function_logs").insert({
          function_name: "job-reminder-2day",
          error_message: `Exception sending to ${fullName}: ${sendErr.message}`,
          payload: { job_id: job.id, customer_name: fullName },
        });
      }
    }

    const total = sent + skipped + errors;
    return new Response(
      JSON.stringify({ total, sent, skipped, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    try {
      await supabase.from("edge_function_logs").insert({
        function_name: "job-reminder-2day",
        error_message: err.message || String(err),
        payload: null,
      });
    } catch (_e) { /* best-effort */ }

    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
