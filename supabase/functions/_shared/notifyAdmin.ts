// Shared helper for platform-wide admin notifications (WhatsApp + in-app).
// Used when we need to alert superadmins about auth/security events
// (e.g. a user account being auto-locked after too many failed logins).

const WHATSAPP_ENDPOINT = "https://api.360messenger.com/v2/sendMessage";

export async function notifyAdminWhatsApp(text: string): Promise<{
  ok: boolean;
  status: number;
  body: string;
  skipped?: string;
}> {
  const number = Deno.env.get("ADMIN_WHATSAPP_NUMBER");
  const apiKey =
    Deno.env.get("THREESIXTY_API_KEY") ?? Deno.env.get("MESSENGER_API_KEY");

  if (!number) {
    console.warn("[notifyAdmin] ADMIN_WHATSAPP_NUMBER not set — skipping WhatsApp");
    return { ok: false, status: 0, body: "", skipped: "no_admin_number" };
  }
  if (!apiKey) {
    console.warn("[notifyAdmin] THREESIXTY_API_KEY not set — skipping WhatsApp");
    return { ok: false, status: 0, body: "", skipped: "no_api_key" };
  }

  // Strip a leading '+' if present — 360Messenger expects E.164 without '+'.
  const phone = number.replace(/^\+/, "").trim();

  const fd = new FormData();
  fd.append("phonenumber", phone);
  fd.append("text", text);

  try {
    const res = await fetch(WHATSAPP_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: fd,
    });
    const body = await res.text();
    if (!res.ok) {
      console.error(`[notifyAdmin] WhatsApp send failed (${res.status}): ${body}`);
    }
    return { ok: res.ok, status: res.status, body };
  } catch (_e) {
    const msg = _e instanceof Error ? _e.message : String(_e);
    console.error("[notifyAdmin] WhatsApp send threw:", msg);
    return { ok: false, status: 0, body: msg };
  }
}

// Insert one notification row per superadmin recipient so it shows in every
// superadmin's bell / drawer. Uses the admin client to bypass RLS on insert.
export async function notifyAdminsInApp(
  supabaseAdmin: any,
  params: {
    notification_type: string;
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
  },
): Promise<{ inserted: number; error?: string }> {
  const { data: superadmins, error: sadErr } = await supabaseAdmin
    .from("profiles")
    .select("user_id, organisation_id")
    .eq("role", "superadmin");

  if (sadErr) {
    console.error("[notifyAdmin] superadmin lookup failed:", sadErr);
    return { inserted: 0, error: sadErr.message };
  }

  const rows = (superadmins ?? [])
    .filter((s: any) => !!s?.user_id)
    .map((s: any) => ({
      recipient_user_id: s.user_id,
      organisation_id: s.organisation_id ?? null,
      notification_type: params.notification_type,
      title: params.title,
      body: params.body,
      role: "office",
      is_read: false,
      metadata: params.metadata ?? {},
    }));

  if (rows.length === 0) return { inserted: 0 };

  const { error: insErr } = await supabaseAdmin.from("notifications").insert(rows);
  if (insErr) {
    console.error("[notifyAdmin] notification insert failed:", insErr);
    return { inserted: 0, error: insErr.message };
  }
  return { inserted: rows.length };
}
