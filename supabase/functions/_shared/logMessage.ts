export async function logMessage(supabase: any, data: {
  organisation_id: string;
  /** Nullable: unmatched callers/recipients have no customer row yet. */
  customer_id?: string | null;
  message_type: string;
  content: string;
  status: "sent" | "failed";
  channel: string;
  sent_by?: string;
}) {
  try {
    await supabase.from("message_log").insert({
      organisation_id: data.organisation_id,
      customer_id: data.customer_id ?? null,
      message_type: data.message_type,
      content: data.content,
      status: data.status,
      channel: data.channel,
      sent_by: data.sent_by ?? null,
      sent_at: new Date().toISOString(),
    });
  } catch (_e) {
    console.error("logMessage failed", _e);
  }
}
