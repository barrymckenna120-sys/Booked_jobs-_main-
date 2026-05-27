import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    .limit(1);
  const customer = customers?.[0] ?? null;

  await supabase.from("whatsapp_messages").insert({
    organisation_id: customer?.organisation_id ?? "8c37827f-ce2c-4507-a821-a5e807d89856",
    customer_id: customer?.id ?? null,
    message_body: messageText,
    message_type: "Inbound Reply",
    sent_by: "customer",
    status: "Received",
    customer_reply: messageText,
    reply_received_at: createdAt,
    sent_at: createdAt,
  });

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
    }
  }

  return earlyResponse;
});
