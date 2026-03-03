const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_URL = "https://plumb-on-call.lovable.app";

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
    .header { text-align: center; margin-bottom: 24px; }
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
      <div class="logo">
        <div class="logo-icon">
          <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </div>
        <span class="logo-text">Booked<span>Jobs</span></span>
      </div>
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
    .header { text-align: center; margin-bottom: 24px; }
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
      <div class="logo">
        <div class="logo-icon">
          <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </div>
        <span class="logo-text">Booked<span>Jobs</span></span>
      </div>
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
    .header { text-align: center; margin-bottom: 24px; }
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
      <div class="logo">
        <div class="logo-icon">
          <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </div>
        <span class="logo-text">Booked<span>Jobs</span></span>
      </div>
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
        subject = `Welcome to BookedJobs — You're in, ${data.name.split(" ")[0]}!`;
        html = welcomeHtml(data);
        break;
      }
      case "job_assigned": {
        to = data.engineerEmail;
        subject = `New Job Assigned — ${data.jobRef}`;
        html = jobAssignedHtml(data);
        break;
      }
      case "appointment_confirmation": {
        to = data.customerEmail;
        subject = `Your Appointment is Confirmed — ${data.date}`;
        html = appointmentConfirmationHtml(data);
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
