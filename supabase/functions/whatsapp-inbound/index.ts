import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getOrgBrandingClient } from "../_shared/orgBranding.ts";
import { getWhatsAppConfig, normalisePhone } from "../_shared/whatsapp.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req: Request) => {
  const earlyResponse = new Response(JSON.stringify({ status: "ok" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

  let payload: any = null;
  try {
    payload = await req.json();
  } catch (e) {
    console.error("Failed to parse webhook body:", e);
    return earlyResponse;
  }

  console.log("360Messenger webhook received:", JSON.stringify(payload));

  // Only process inbound chat or file messages
  if (payload?.dataType !== "message") {
    console.log("Non-message event, ignoring:", payload?.dataType);
    return earlyResponse;
  }

  const from = payload?.From ?? "";
  const messageText = payload?.Chat || payload?.Caption || "[non-text message]";
  const createdAt = payload?.createdAt
    ? new Date(payload.createdAt).toISOString()
    : new Date().toISOString();

  console.log(`Inbound from ${from}: ${messageText}`);

  // Try to match customer by phone — check multiple formats
  const phoneVariants = [
    from,
    `+${from}`,
    `0${from.slice(2)}`,   // 447499999999 → 07499999999 (UK)
    `0${from.slice(3)}`,   // 353871234567 → 0871234567 (IE)
  ];

  const { data: customers } = await supabase
    .from("customers")
    .select("id, organisation_id")
    .or(phoneVariants.map((p) => `phone.eq.${p}`).join(","))
    .order("created_at", { ascending: false })
    .limit(1);
  const customer = customers?.[0] ?? null;

  const inboundOrgId = customer?.organisation_id ?? null;
  if (!inboundOrgId) {
    console.error(`Inbound WhatsApp from ${from} could not be matched to a known customer/organisation — dropping message to avoid cross-tenant leakage. Body: ${messageText}`);
    return earlyResponse;
  }

  await supabase.from("whatsapp_messages").insert({
    organisation_id: inboundOrgId,
    customer_id: customer?.id ?? null,
    message_body: messageText,
    message_type: "Inbound Reply",
    sent_by: "customer",
    status: "Received",
    customer_reply: messageText,
    reply_received_at: createdAt,
    sent_at: createdAt,
  });

  // Mirror inbound to message_log so it appears in Chat Inbox History
  try {
    await supabase.from("message_log").insert({
      organisation_id: inboundOrgId,
      customer_id: customer?.id ?? null,
      message_type: "inbound",
      channel: "whatsapp",
      direction: "inbound",
      content: messageText,
      status: "received",
      sent_by: "customer",
      sent_at: createdAt,
    });
  } catch (_e) {
    console.error("Failed to log inbound message_log:", _e);
  }


  if (customer?.id) {
    await supabase
      .from("customers")
      .update({ last_message_sent_at: createdAt })
      .eq("id", customer.id);

    if (messageText.trim().toLowerCase() === "stop") {
      await supabase
        .from("customers")
        .update({ opted_out: true })
        .eq("id", customer.id);

      // Send opt-out confirmation reply — uses tenant-scoped 360Messenger key
      try {
        const { apiKey } = await getWhatsAppConfig(supabase, inboundOrgId);
        if (from) {
          const branding = await getOrgBrandingClient(supabase, inboundOrgId);
          const form = new FormData();
          form.append("phonenumber", normalisePhone(from));
          form.append("text", `Got it — we've removed you from our reminder list. No further messages will be sent. ${branding.footer || branding.name}.`);
          await fetch("https://api.360messenger.com/v2/sendMessage", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
            body: form,
          });
        }
      } catch (_e) {
        // Non-critical: log but don't fail the webhook
        console.error("Failed to send opt-out reply:", _e);
      }
    }
  }

  return earlyResponse;
});
