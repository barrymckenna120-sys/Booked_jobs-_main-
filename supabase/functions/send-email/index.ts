const APP_URL = "https://plumb-on-call.lovable.app";

const RESEND_FROM_NAME = Deno.env.get("RESEND_FROM_NAME") || "BookedJobs";
// RESEND_FROM_EMAIL is resolved per-request from tenant_integrations
// (integration_type='whatsapp', config.domain). The env var is still honored
// as an explicit override when set.
const RESEND_FROM_EMAIL_OVERRIDE = Deno.env.get("RESEND_FROM_EMAIL") || null;


// ── Template: Welcome ─────────────────────────────────────
function welcomeHtml(data: { name: string; email: string; role: string; loginUrl: string }): string {
  const roleLabel = data.role === "admin" ? "Admin" : data.role === "office" ? "Office" : "Engineer";
  const loginUrl = data.loginUrl || APP_URL;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Welcome to BookedJobs</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background-color: #F0F4FF; font-family: 'DM Sans', sans-serif; color: #1a1f36; padding: 40px 16px; }
    .wrapper { max-width: 560px; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 24px; display: flex; justify-content: center; align-items: center; }
    .logo { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; }
    .logo-icon { width: 40px; height: 40px; background: linear-gradient(135deg, #2563EB, #1d4ed8); border-radius: 10px; display: flex; align-items: center; justify-content: center; }
    .logo-icon svg { width: 22px; height: 22px; fill: none; stroke: white; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .logo-text { font-size: 22px; font-weight: 700; color: #1a1f36; letter-spacing: -0.5px; }
    .logo-text span { color: #2563EB; }
    .card { background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 24px rgba(37,99,235,0.08), 0 1px 4px rgba(0,0,0,0.04); }
    .card-top-bar { height: 5px; background: linear-gradient(90deg, #2563EB 0%, #60a5fa 100%); }
    .card-body { padding: 44px 48px 40px; }
    .icon-circle { width: 64px; height: 64px; background: #EFF6FF; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 24px; }
    .icon-circle svg { width: 30px; height: 30px; stroke: #2563EB; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    h1 { font-size: 26px; font-weight: 700; color: #0f172a; letter-spacing: -0.5px; margin-bottom: 12px; }
    .intro { font-size: 15px; color: #4b5563; line-height: 1.65; margin-bottom: 28px; }
    .details-box { background: #F8FAFF; border: 1px solid #dbeafe; border-radius: 12px; padding: 20px 24px; margin-bottom: 28px; }
    .details-box .row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #e8f0fe; font-size: 14px; }
    .details-box .row:last-child { border-bottom: none; padding-bottom: 0; }
    .details-box .row:first-child { padding-top: 0; }
    .details-box .label { color: #6b7280; font-weight: 500; }
    .details-box .value { color: #0f172a; font-weight: 600; font-family: 'DM Mono', monospace; font-size: 13px; }
    .btn-wrapper { margin-bottom: 28px; }
    .btn { display: inline-block; background: linear-gradient(135deg, #2563EB, #1d4ed8); color: #ffffff !important; text-decoration: none; font-size: 15px; font-weight: 600; padding: 15px 36px; border-radius: 12px; box-shadow: 0 4px 14px rgba(37,99,235,0.35); }
    .divider { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
    .tip { font-size: 13px; color: #6b7280; line-height: 1.6; }
    .tip a { color: #2563EB; text-decoration: none; font-family: 'DM Mono', monospace; font-size: 12px; word-break: break-all; }
    .footer { text-align: center; margin-top: 28px; padding-bottom: 8px; }
    .footer p { font-size: 12.5px; color: #9ca3af; line-height: 1.7; }
    .footer a { color: #6b7280; text-decoration: none; }
    .footer .tagline { font-size: 12px; color: #c4c9d4; margin-top: 10px; }
    @media (max-width: 480px) { .card-body { padding: 32px 24px 28px; } h1 { font-size: 22px; } .details-box .row { flex-direction: column; align-items: flex-start; gap: 4px; } }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <img src="data:image/jpeg;base64,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" alt="BookedJobs" style="height:40px; width:auto; display:block;" />
    </div>

    <div class="card">
      <div class="card-top-bar"></div>
      <div class="card-body">

        <div class="icon-circle">
          <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>

        <h1>Welcome to BookedJobs! 👋</h1>

        <p class="intro">
          Your account has been set up and you're ready to go. Below are your login details — we recommend changing your password after your first sign in.
        </p>

        <div class="details-box">
          <div class="row">
            <span class="label">Login URL</span>
            <span class="value">bookedjobs.ie</span>
          </div>
          <div class="row">
            <span class="label">Your Email</span>
            <span class="value">${data.email}</span>
          </div>
          <div class="row">
            <span class="label">Role</span>
            <span class="value">${roleLabel}</span>
          </div>
        </div>

        <div class="btn-wrapper">
          <a href="${loginUrl}" class="btn">Log In to BookedJobs</a>
        </div>

        <hr class="divider" />

        <p class="tip">
          Button not working? Visit: <a href="${loginUrl}">${loginUrl}</a>
        </p>

      </div>
    </div>

    <div class="footer">
      <p>Need help? <a href="mailto:support@karlsgas.ie">support@karlsgas.ie</a></p>
      <p class="tagline">© 2026 BookedJobs · Karl's Gas · All rights reserved</p>
    </div>
  </div>
</body>
</html>`;
}

// ── Template: Job Assigned ────────────────────────────────
function jobAssignedHtml(data: { engineerName: string; jobRef: string; date: string; time: string; customerName: string; address: string; phone: string; jobType: string }): string {
  const jobUrl = APP_URL;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>New Job Assigned – BookedJobs</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background-color: #F0F4FF; font-family: 'DM Sans', sans-serif; color: #1a1f36; padding: 40px 16px; }
    .wrapper { max-width: 560px; margin: 0 auto; }
     .header { text-align: center; margin-bottom: 24px; display: flex; justify-content: center; align-items: center; }
    .card { background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 24px rgba(37,99,235,0.08), 0 1px 4px rgba(0,0,0,0.04); }
    .card-top-bar { height: 5px; background: linear-gradient(90deg, #2563EB 0%, #60a5fa 100%); }
    .card-body { padding: 44px 48px 40px; }
    .icon-circle { width: 64px; height: 64px; background: #EFF6FF; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 24px; }
    .icon-circle svg { width: 30px; height: 30px; stroke: #2563EB; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    h1 { font-size: 26px; font-weight: 700; color: #0f172a; letter-spacing: -0.5px; margin-bottom: 12px; }
    .intro { font-size: 15px; color: #4b5563; line-height: 1.65; margin-bottom: 28px; }
    .job-card { background: linear-gradient(135deg, #EFF6FF, #dbeafe); border: 1px solid #bfdbfe; border-radius: 14px; padding: 24px; margin-bottom: 24px; }
    .job-card .job-ref { font-size: 11px; font-weight: 700; color: #2563EB; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; font-family: 'DM Mono', monospace; }
    .job-card .job-title { font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 16px; }
    .job-card .job-row { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px; font-size: 14px; color: #374151; }
    .job-card .job-row:last-child { margin-bottom: 0; }
    .job-card .job-row svg { width: 16px; height: 16px; stroke: #2563EB; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; margin-top: 2px; }
    .job-card .job-row strong { color: #0f172a; }
    .btn-wrapper { margin-bottom: 28px; }
    .btn { display: inline-block; background: linear-gradient(135deg, #2563EB, #1d4ed8); color: #ffffff !important; text-decoration: none; font-size: 15px; font-weight: 600; padding: 15px 36px; border-radius: 12px; box-shadow: 0 4px 14px rgba(37,99,235,0.35); }
    .divider { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
    .notice { display: flex; align-items: flex-start; gap: 10px; background: #F0FDF4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 14px 16px; }
    .notice svg { width: 18px; height: 18px; stroke: #16a34a; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; margin-top: 1px; }
    .notice p { font-size: 13px; color: #15803d; line-height: 1.5; }
    .footer { text-align: center; margin-top: 28px; padding-bottom: 8px; }
    .footer p { font-size: 12.5px; color: #9ca3af; line-height: 1.7; }
    .footer a { color: #6b7280; text-decoration: none; }
    .footer .tagline { font-size: 12px; color: #c4c9d4; margin-top: 10px; }
    @media (max-width: 480px) { .card-body { padding: 32px 24px 28px; } h1 { font-size: 22px; } }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <img src="data:image/jpeg;base64,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" alt="BookedJobs" style="height:40px; width:auto; display:block;" />
    </div>

    <div class="card">
      <div class="card-top-bar"></div>
      <div class="card-body">

        <div class="icon-circle">
          <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
        </div>

        <h1>You've got a new job! 🔧</h1>

        <p class="intro">
          Hi ${data.engineerName.split(" ")[0]}, a new job has been assigned to you. Here are the details — make sure to log in to BookedJobs to view the full job record.
        </p>

        <div class="job-card">
          <div class="job-ref">Job Ref: ${data.jobRef}</div>
          <div class="job-title">${data.jobType}</div>

          <div class="job-row">
            <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span><strong>Date:</strong> ${data.date}</span>
          </div>
          <div class="job-row">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span><strong>Time:</strong> ${data.time || "TBC"}</span>
          </div>
          <div class="job-row">
            <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <span><strong>Address:</strong> ${data.address}</span>
          </div>
          <div class="job-row">
            <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span><strong>Customer:</strong> ${data.customerName}</span>
          </div>
          <div class="job-row">
            <svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.67A2 2 0 012 .84h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8.18a16 16 0 006.91 6.91l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
            <span><strong>Phone:</strong> ${data.phone}</span>
          </div>
        </div>

        <div class="btn-wrapper">
          <a href="${jobUrl}" class="btn">View Full Job Details</a>
        </div>

        <div class="notice">
          <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
          <p>Please confirm you've seen this job by logging into BookedJobs. If you have any issues contact Karl directly.</p>
        </div>

      </div>
    </div>

    <div class="footer">
      <p>Need help? <a href="mailto:support@karlsgas.ie">support@karlsgas.ie</a></p>
      <p class="tagline">© 2026 BookedJobs · Karl's Gas · All rights reserved</p>
    </div>
  </div>
</body>
</html>`;
}

// ── Template: Appointment Confirmation ────────────────────
function appointmentConfirmationHtml(data: { customerName: string; date: string; time: string; engineerName: string; serviceType: string; jobRef: string; address?: string; phone?: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Your Appointment is Confirmed – Karl's Gas</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background-color: #F0F4FF; font-family: 'DM Sans', sans-serif; color: #1a1f36; padding: 40px 16px; }
    .wrapper { max-width: 560px; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 24px; display: flex; justify-content: center; align-items: center; }
    .logo { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; }
    .logo-icon { width: 40px; height: 40px; background: linear-gradient(135deg, #2563EB, #1d4ed8); border-radius: 10px; display: flex; align-items: center; justify-content: center; }
    .logo-icon svg { width: 22px; height: 22px; fill: none; stroke: white; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .logo-text { font-size: 22px; font-weight: 700; color: #1a1f36; letter-spacing: -0.5px; }
    .logo-text span { color: #2563EB; }
    .card { background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 24px rgba(37,99,235,0.08), 0 1px 4px rgba(0,0,0,0.04); }
    .card-top-bar { height: 5px; background: linear-gradient(90deg, #2563EB 0%, #60a5fa 100%); }
    .card-body { padding: 44px 48px 40px; }
    .icon-circle { width: 64px; height: 64px; background: #F0FDF4; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 24px; }
    .icon-circle svg { width: 30px; height: 30px; stroke: #16a34a; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    h1 { font-size: 26px; font-weight: 700; color: #0f172a; letter-spacing: -0.5px; margin-bottom: 12px; }
    .intro { font-size: 15px; color: #4b5563; line-height: 1.65; margin-bottom: 28px; }
    .appt-box { background: linear-gradient(135deg, #0f172a, #1e3a8a); border-radius: 16px; padding: 28px; margin-bottom: 24px; color: white; }
    .appt-box .appt-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #93c5fd; margin-bottom: 16px; font-family: 'DM Mono', monospace; }
    .appt-box .appt-date { font-size: 28px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px; margin-bottom: 4px; }
    .appt-box .appt-time { font-size: 16px; color: #93c5fd; margin-bottom: 20px; font-weight: 500; }
    .appt-box .appt-divider { border: none; border-top: 1px solid rgba(255,255,255,0.12); margin: 16px 0; }
    .appt-box .appt-row { display: flex; align-items: center; gap: 10px; font-size: 14px; color: #cbd5e1; margin-bottom: 10px; }
    .appt-box .appt-row:last-child { margin-bottom: 0; }
    .appt-box .appt-row svg { width: 16px; height: 16px; stroke: #60a5fa; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; }
    .appt-box .appt-row strong { color: #ffffff; }
    .btn-wrapper { margin-bottom: 24px; text-align: center; }
    .btn-confirm { display: inline-block; background: linear-gradient(135deg, #16a34a, #15803d); color: #ffffff !important; text-decoration: none; font-size: 15px; font-weight: 600; padding: 15px 40px; border-radius: 12px; box-shadow: 0 4px 14px rgba(22,163,74,0.35); }
    .btn-subtext { font-size: 12px; color: #9ca3af; text-align: center; margin-top: 10px; }
    .divider { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
    .steps { margin-bottom: 8px; }
    .steps h3 { font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 14px; text-transform: uppercase; letter-spacing: 0.5px; }
    .step { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px; font-size: 14px; color: #4b5563; line-height: 1.5; }
    .step-num { width: 24px; height: 24px; background: #EFF6FF; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: #2563EB; flex-shrink: 0; margin-top: 1px; }
    .contact-box { background: #F8FAFF; border: 1px solid #dbeafe; border-radius: 10px; padding: 16px 20px; margin-top: 24px; font-size: 13px; color: #4b5563; line-height: 1.6; }
    .contact-box a { color: #2563EB; text-decoration: none; font-weight: 600; }
    .footer { text-align: center; margin-top: 28px; padding-bottom: 8px; }
    .footer p { font-size: 12.5px; color: #9ca3af; line-height: 1.7; }
    .footer a { color: #6b7280; text-decoration: none; }
    .footer .tagline { font-size: 12px; color: #c4c9d4; margin-top: 10px; }
    @media (max-width: 480px) { .card-body { padding: 32px 24px 28px; } h1 { font-size: 22px; } .appt-box .appt-date { font-size: 22px; } }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <img src="data:image/jpeg;base64,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" alt="BookedJobs" style="height:40px; width:auto; display:block;" />
    </div>

    <div class="card">
      <div class="card-top-bar"></div>
      <div class="card-body">

        <div class="icon-circle">
          <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
        </div>

        <h1>Your appointment is booked! ✅</h1>

        <p class="intro">
          Hi ${data.customerName.split(" ")[0]}, great news — your boiler service with Karl's Gas is confirmed. Here's everything you need to know.
        </p>

        <div class="appt-box">
          <div class="appt-label">Your Appointment</div>
          <div class="appt-date">${data.date}</div>
          <div class="appt-time">${data.time || "TBC"}</div>
          <hr class="appt-divider" />
          <div class="appt-row">
            <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <span><strong>Address:</strong> ${data.address || "On file"}</span>
          </div>
          <div class="appt-row">
            <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span><strong>Engineer:</strong> ${data.engineerName || "TBC"}</span>
          </div>
          <div class="appt-row">
            <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span><strong>Service:</strong> ${data.serviceType}</span>
          </div>
        </div>

        <div class="btn-wrapper">
          <a href="${APP_URL}" class="btn-confirm">✓ Confirm My Appointment</a>
          <p class="btn-subtext">Tap to confirm you'll be home — no login needed</p>
        </div>

        <hr class="divider" />

        <div class="steps">
          <h3>What to expect</h3>
          <div class="step">
            <div class="step-num">1</div>
            <span>Our engineer will arrive between your scheduled time window. They'll call ahead if running late.</span>
          </div>
          <div class="step">
            <div class="step-num">2</div>
            <span>Please ensure access to your boiler is clear and someone over 18 is home during the visit.</span>
          </div>
          <div class="step">
            <div class="step-num">3</div>
            <span>After the service you'll receive a digital copy of your service record.</span>
          </div>
        </div>

        <div class="contact-box">
          Need to reschedule or have a question? Call us on <a href="tel:${data.phone || ""}">${data.phone || "our office"}</a> or email <a href="mailto:info@karlsgas.ie">info@karlsgas.ie</a>
        </div>

      </div>
    </div>

    <div class="footer">
      <p>Karl's Gas · <a href="mailto:info@karlsgas.ie">info@karlsgas.ie</a></p>
      <p class="tagline">© 2026 BookedJobs · Karl's Gas · All rights reserved</p>
    </div>
  </div>
</body>
</html>`;
}

// ── Main handler ───────────────────────────────────────────

import { getCorsHeaders } from "../_shared/cors.ts";
import { assertSameOrganisation } from "../_shared/sameOrg.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { assertSameOrganisation } from "../_shared/sameOrg.ts";

Deno.serve(async (req) => {
  // CORS: project-standard shared helper (origin-scoped) instead of wildcard.
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Auth check ──────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    // Caller organisation is always derived server-side from the verified JWT.
    // It is used both for the tenant From address and for recipient validation.
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const callerUserId = (claimsData.claims as any).sub;
    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("organisation_id")
      .eq("user_id", callerUserId)
      .maybeSingle();
    const callerOrgId = ((callerProfile as any)?.organisation_id as string | null) ?? null;
    if (!callerOrgId) {
      console.warn("send-email: caller has no organisation");
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve tenant From address via tenant_integrations.whatsapp.config.domain
    let RESEND_FROM_EMAIL: string | null = RESEND_FROM_EMAIL_OVERRIDE;
    if (!RESEND_FROM_EMAIL) {
      const { data: waIntegration } = await adminClient
        .from("tenant_integrations")
        .select("config")
        .eq("organisation_id", callerOrgId)
        .eq("integration_type", "whatsapp")
        .maybeSingle();
      const tenantDomain = (waIntegration as any)?.config?.domain;
      if (tenantDomain) {
        RESEND_FROM_EMAIL = `noreply@notify.${tenantDomain}`;
      }
    }

    if (!RESEND_FROM_EMAIL) {
      console.warn("send-email: tenant domain not configured for caller");
      return new Response(JSON.stringify({ error: "Tenant sender domain not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    const { type, data } = await req.json();

    let subject: string;
    let html: string;
    let to: string;
    // Which table must own the recipient address for this email type.
    let recipientSource: "engineers" | "customers";

    switch (type) {
      case "welcome": {
        to = data.email;
        subject = `Welcome to BookedJobs — You're in, ${data.name.split(" ")[0]}!`;
        html = welcomeHtml(data);
        recipientSource = "engineers";
        break;
      }
      case "job_assigned": {
        to = data.engineerEmail;
        subject = `New Job Assigned — ${data.jobRef}`;
        html = jobAssignedHtml(data);
        recipientSource = "engineers";
        break;
      }
      case "appointment_confirmation": {
        to = data.customerEmail;
        subject = `Your Appointment is Confirmed — ${data.date}`;
        html = appointmentConfirmationHtml(data);
        recipientSource = "customers";
        break;
      }
      default:
        return new Response(JSON.stringify({ error: `Unknown email type: ${type}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    // Recipient validation: the address must already exist on a record inside
    // the caller's own organisation. Previously any authenticated user could
    // send a branded BookedJobs email to an arbitrary address, and could target
    // another tenant's staff or customers. Fails closed.
    const normalizedTo = String(to ?? "").trim().toLowerCase();
    if (!normalizedTo || !normalizedTo.includes("@")) {
      return new Response(JSON.stringify({ error: "Valid recipient email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: recipientRows } = await adminClient
      .from(recipientSource)
      .select("id, email, organisation_id")
      .ilike("email", normalizedTo)
      .limit(20);

    const match = (recipientRows ?? []).find(
      (r: any) => String(r.email ?? "").trim().toLowerCase() === normalizedTo,
    );
    const sameOrg = match
      ? assertSameOrganisation(callerOrgId, [
        { label: `${recipientSource} recipient`, orgId: (match as any).organisation_id },
      ])
      : { ok: false as const, detail: `recipient not found in ${recipientSource}` };

    if (!sameOrg.ok) {
      console.warn(
        `send-email: refused ${type} to unauthorised recipient — ${sameOrg.detail} (caller org ${callerOrgId})`,
      );
      return new Response(JSON.stringify({ error: "Recipient is not in your organisation" }), {
        status: 403,
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
        from: `${RESEND_FROM_NAME} <${RESEND_FROM_EMAIL}>`,
        to: [to],
        subject,
        html,
      }),
    });

    const resData = await res.json();

    if (!res.ok) {
      const providerMessage = typeof resData?.message === "string"
        ? resData.message
        : "Failed to send email.";

      const isUnverifiedDomainError =
        res.status === 403 && /domain is not verified/i.test(providerMessage);

      console.error("Resend API error:", resData);

      if (isUnverifiedDomainError) {
        console.warn("Email skipped because sender domain is not verified", {
          from: RESEND_FROM_EMAIL,
          to,
          type,
        });

        return new Response(
          JSON.stringify({
            success: false,
            skipped: true,
            reason: "sender_domain_not_verified",
            error: "Email sender domain is not verified yet.",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      return new Response(JSON.stringify({ error: providerMessage }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, id: resData.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-email error:", err);
    return new Response(JSON.stringify({ error: "An unexpected error occurred." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
