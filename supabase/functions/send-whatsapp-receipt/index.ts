import { createClient } from "npm:@supabase/supabase-js@2";
import { getTenantPublicUrl } from "../_shared/tenantDomain.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-org-id",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const messengerKey = Deno.env.get("THREESIXTY_API_KEY");

    if (!messengerKey) throw new Error("THREESIXTY_API_KEY is not configured");

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { job_id } = await req.json();

    if (!job_id) {
      return new Response(JSON.stringify({ error: "job_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch job from service_calls
    const { data: job, error: jobErr } = await supabase
      .from("service_calls")
      .select("id, job_reference, job_type, completed_at, payment_method, revenue, receipt_number, customer_id, user_id, organisation_id, receipt_pdf_url")
      .eq("id", job_id)
      .single();

    if (jobErr || !job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate receipt PDF if not already generated
    let receiptPdfUrl = job.receipt_pdf_url;
    if (!receiptPdfUrl) {
      try {
        const pdfRes = await fetch(
          `${supabaseUrl}/functions/v1/generate-receipt-pdf`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${supabaseKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ job_id }),
          }
        );
        const pdfData = await pdfRes.json();
        if (pdfData?.pdf_url) {
          receiptPdfUrl = pdfData.pdf_url;
        }
      } catch (_e) {
        console.error("Failed to generate receipt PDF:", _e);
      }
    }

    // Fetch customer
    const { data: customer } = await supabase
      .from("customers")
      .select("name, phone")
      .eq("id", job.customer_id)
      .single();

    if (!customer?.phone) {
      return new Response(JSON.stringify({ error: "Customer has no phone number" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch business name from settings (scoped to organisation)
    const { data: settings } = await supabase
      .from("settings")
      .select("business_name, message_footer")
      .eq("organisation_id", job.organisation_id)
      .maybeSingle();

    // Resolve tenant public URL for the receipt; null when the org
    // has no public_domain configured — we still send the message,
    // just omitting the receipt link line.
    const tenantReceiptUrl = job.receipt_number
      ? await getTenantPublicUrl(supabaseUrl, job.organisation_id, `/receipt/${encodeURIComponent(job.receipt_number)}`)
      : null;
    if (job.receipt_number && !tenantReceiptUrl) {
      console.warn(`[send-whatsapp-receipt] organisation ${job.organisation_id} has no public_domain; omitting receipt link`);
    }

    const businessName = settings?.business_name || "";
    const footer = settings?.message_footer || businessName;
    const jobRef = job.job_reference || `KN-${job.id.slice(0, 6).toUpperCase()}`;
    const amount = job.revenue ? `€${Number(job.revenue).toFixed(2)}` : "N/A";
    const paymentMethod = job.payment_method === "card" ? "Card" : job.payment_method === "invoice" ? "Invoice" : "Cash";
    const receiptNum = job.receipt_number || "";

    const date = new Date(job.completed_at || Date.now()).toLocaleDateString("en-IE", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const receiptLink = tenantReceiptUrl
      ? `\n\n📄 View your receipt here: ${tenantReceiptUrl}`
      : "";

    const message = `Hi ${customer.name}, thanks for your payment. Here's your receipt:\n\nJob Ref: ${jobRef}${receiptNum ? `\nReceipt: ${receiptNum}` : ""}\nService: ${job.job_type || "Boiler Service"}\nDate: ${date}\nAmount Paid: ${amount} (${paymentMethod})${receiptLink}\n\nThanks,\n${footer}`;

    // Strip leading + from phone for 360 Messenger
    const cleanNumber = customer.phone.replace(/^\+/, "");

    // Build FormData — 360 Messenger does not accept JSON
    const formData = new FormData();
    formData.append("phonenumber", cleanNumber);
    formData.append("text", message);

    // Log to message_log before sending
    const { data: logRows } = await supabase
      .from("message_log")
      .insert({
        channel: "whatsapp",
        message_type: "receipt",
        customer_id: job.customer_id,
        related_id: job_id,
        related_type: "service_call",
        content: message,
        sent_by: "system",
        status: "pending",
        direction: "outbound",
      })
      .select("id");

    const logId = Array.isArray(logRows) ? logRows[0]?.id : null;

    // Send via 360 Messenger
    const response = await fetch("https://api.360messenger.com/v2/sendMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${messengerKey}` },
      body: formData,
    });

    const resultText = await response.text();
    let result: Record<string, unknown>;
    try {
      result = JSON.parse(resultText);
    } catch (_e) {
      result = { success: false };
    }

    const sentAt = new Date().toISOString();

    // Update message_log with outcome
    if (logId) {
      const updateBody = (result as any).success
        ? { status: "sent", sent_at: sentAt }
        : { status: "failed", error_message: `360Messenger HTTP ${response.status}: ${resultText.substring(0, 500)}` };

      await supabase.from("message_log").update(updateBody).eq("id", logId);
    }

    // Log failure to edge_function_logs
    if (!(result as any).success) {
      await supabase.from("edge_function_logs").insert({
        function_name: "send-whatsapp-receipt",
        error_message: `360Messenger API failed. HTTP ${response.status}`,
        payload: { sent_to: cleanNumber, job_id },
      });

      return new Response(JSON.stringify({ success: false, error: "WhatsApp send failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: receiptStatusError } = await supabase
      .from("service_calls")
      .update({
        receipt_sent: true,
        receipt_sent_at: sentAt,
      })
      .eq("id", job_id);

    if (receiptStatusError) {
      console.error("Failed to update receipt sent status:", receiptStatusError);
    }

    // Log customer activity
    if (!job.organisation_id) {
      console.error(`send-whatsapp-receipt: skipping customer_activity insert — job ${job_id} missing organisation_id`);
    } else {
      try {
        await supabase.from("customer_activity").insert({
          organisation_id: job.organisation_id,
          customer_id: job.customer_id,
          service_call_id: job_id,
          event_type: "whatsapp_sent",
          event_label: "WhatsApp sent — Receipt",
        });
      } catch { /* non-critical */ }
    }

    return new Response(JSON.stringify({ success: true, customer_name: customer.name }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("send-whatsapp-receipt error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
