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

  console.log("360dialog inbound webhook received:", JSON.stringify(payload));

  const messages =
    payload?.entry?.[0]?.changes?.[0]?.value?.messages ||
    payload?.messages ||
    [];

  const statuses =
    payload?.entry?.[0]?.changes?.[0]?.value?.statuses ||
    payload?.statuses ||
    [];

  for (const msg of messages) {
    const from = msg.from;
    const messageText =
      msg.text?.body ||
      msg.button?.text ||
      msg.interactive?.button_reply?.title ||
      "[non-text message]";
    const timestamp = msg.timestamp
      ? new Date(parseInt(msg.timestamp) * 1000).toISOString()
      : new Date().toISOString();

    console.log(`Inbound from ${from}: ${messageText}`);

    const phoneVariants = [
      from,
      `+${from}`,
      `0${from.slice(3)}`,
    ];

    const { data: customer } = await supabase
      .from("customers")
      .select("id, organisation_id")
      .or(phoneVariants.map((p) => `phone.eq.${p}`).join(","))
      .maybeSingle();

    await supabase.from("whatsapp_messages").insert({
      organisation_id: customer?.organisation_id ?? "8c37827f-ce2c-4507-a821-a5e807d89856",
      customer_id: customer?.id ?? null,
      message_body: messageText,
      message_type: "Inbound Reply",
      sent_by: "customer",
      status: "Received",
      customer_reply: messageText,
      reply_received_at: timestamp,
      sent_at: timestamp,
    });

    if (customer?.id) {
      await supabase
        .from("customers")
        .update({ last_message_sent_at: timestamp })
        .eq("id", customer.id);
    }
  }

  for (const status of statuses) {
    console.log(
      `Message ${status.id} status: ${status.status} for ${status.recipient_id}`
    );
  }

  return earlyResponse;
});
