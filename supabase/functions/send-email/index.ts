import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BRAND_COLOR = "#2563EB";
const LOGO_URL = "https://plumb-on-call.lovable.app/images/webliveview-logo.jpg";
const APP_URL = "https://plumb-on-call.lovable.app";

function emailLayout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:32px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
  <!-- Header -->
  <tr><td style="background:${BRAND_COLOR};padding:24px 32px;text-align:center;">
    <img src="${LOGO_URL}" alt="BookedJobs" width="140" style="max-width:140px;border-radius:8px;" />
  </td></tr>
  <!-- Title -->
  <tr><td style="padding:28px 32px 0;">
    <h1 style="margin:0;font-size:22px;font-weight:800;color:#1a1a1a;">${title}</h1>
  </td></tr>
  <!-- Body -->
  <tr><td style="padding:16px 32px 32px;font-size:15px;line-height:1.6;color:#374151;">
    ${body}
  </td></tr>
  <!-- Footer -->
  <tr><td style="background:#f9fafb;padding:20px 32px;text-align:center;border-top:1px solid #e5e7eb;">
    <p style="margin:0;font-size:12px;color:#9ca3af;">
      Sent by <a href="${APP_URL}" style="color:${BRAND_COLOR};text-decoration:none;font-weight:600;">BookedJobs</a>
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function buttonHtml(text: string, url: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:20px 0;"><tr><td>
    <a href="${url}" style="display:inline-block;background:${BRAND_COLOR};color:#ffffff;font-size:15px;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;">${text}</a>
  </td></tr></table>`;
}

function infoRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;font-size:14px;color:#6b7280;width:120px;vertical-align:top;">${label}</td>
    <td style="padding:6px 0;font-size:14px;font-weight:600;color:#1a1a1a;">${value}</td>
  </tr>`;
}

function infoTable(rows: [string, string][]): string {
  return `<table cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
    ${rows.map(([l, v], i) => `<tr style="background:${i % 2 === 0 ? '#f9fafb' : '#ffffff'}">
      <td style="padding:10px 16px;font-size:14px;color:#6b7280;width:140px;">${l}</td>
      <td style="padding:10px 16px;font-size:14px;font-weight:600;color:#1a1a1a;">${v}</td>
    </tr>`).join('')}
  </table>`;
}

// ── Email builders ─────────────────────────────────────────

function welcomeEmail(data: { name: string; email: string; role: string; loginUrl: string }): { subject: string; html: string } {
  const roleLabel = data.role === "admin" ? "Admin" : data.role === "office" ? "Office" : "Engineer";
  return {
    subject: `Welcome to BookedJobs — You're in, ${data.name.split(" ")[0]}!`,
    html: emailLayout("Welcome to BookedJobs! 🎉", `
      <p>Hi ${data.name.split(" ")[0]},</p>
      <p>You've been added to the team as <strong>${roleLabel}</strong>. Your account is ready to go.</p>
      ${infoTable([
        ["Email", data.email],
        ["Role", roleLabel],
        ["Password", "Welcome123!"],
      ])}
      <p>Sign in below to get started — we recommend changing your password after your first login.</p>
      ${buttonHtml("Sign In to BookedJobs", data.loginUrl)}
      <p style="font-size:13px;color:#9ca3af;">If you weren't expecting this email, please ignore it.</p>
    `),
  };
}

function jobAssignedEmail(data: { engineerName: string; jobRef: string; date: string; time: string; customerName: string; address: string; phone: string; jobType: string }): { subject: string; html: string } {
  return {
    subject: `New Job Assigned — ${data.jobRef}`,
    html: emailLayout(`Job Assigned: ${data.jobRef}`, `
      <p>Hi ${data.engineerName.split(" ")[0]},</p>
      <p>A new job has been assigned to you. Here are the details:</p>
      ${infoTable([
        ["Job Ref", data.jobRef],
        ["Job Type", data.jobType],
        ["Date", data.date],
        ["Time", data.time || "TBC"],
        ["Customer", data.customerName],
        ["Address", data.address],
        ["Phone", `<a href="tel:${data.phone}" style="color:${BRAND_COLOR};text-decoration:none;">${data.phone}</a>`],
      ])}
      ${buttonHtml("View in BookedJobs", APP_URL)}
      <p style="font-size:13px;color:#9ca3af;">Make sure to check the app for any additional notes or photos before heading out.</p>
    `),
  };
}

function appointmentConfirmationEmail(data: { customerName: string; date: string; time: string; engineerName: string; serviceType: string; jobRef: string }): { subject: string; html: string } {
  return {
    subject: `Your Appointment is Confirmed — ${data.date}`,
    html: emailLayout("Appointment Confirmed ✅", `
      <p>Hi ${data.customerName.split(" ")[0]},</p>
      <p>Great news — your appointment has been confirmed. Here are your details:</p>
      ${infoTable([
        ["Service", data.serviceType],
        ["Date", data.date],
        ["Time", data.time || "TBC"],
        ["Engineer", data.engineerName || "TBC"],
        ["Ref", data.jobRef],
      ])}
      <p>If you need to reschedule or have any questions, don't hesitate to get in touch.</p>
      <p style="font-size:13px;color:#9ca3af;margin-top:24px;">Thank you for choosing BookedJobs.</p>
    `),
  };
}

// ── Main handler ───────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const { type, data } = await req.json();

    let subject: string;
    let html: string;
    let to: string;

    switch (type) {
      case "welcome": {
        to = data.email;
        const email = welcomeEmail(data);
        subject = email.subject;
        html = email.html;
        break;
      }
      case "job_assigned": {
        to = data.engineerEmail;
        const email = jobAssignedEmail(data);
        subject = email.subject;
        html = email.html;
        break;
      }
      case "appointment_confirmation": {
        to = data.customerEmail;
        const email = appointmentConfirmationEmail(data);
        subject = email.subject;
        html = email.html;
        break;
      }
      default:
        return new Response(JSON.stringify({ error: `Unknown email type: ${type}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "BookedJobs <onboarding@resend.dev>",
        to: [to],
        subject,
        html,
      }),
    });

    const resData = await res.json();

    if (!res.ok) {
      console.error("Resend API error:", resData);
      return new Response(JSON.stringify({ error: "Failed to send email", details: resData }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, id: resData.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-email error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
