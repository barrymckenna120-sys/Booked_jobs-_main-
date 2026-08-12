import { createClient } from "npm:@supabase/supabase-js@2";
import {
  paidJobsInPeriod,
  collectedAmount,
  revenueDate,
  type FinanceJob,
} from "../_shared/financeMetrics.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-org-id",
};

function getMonthRange(monthStr?: string): { start: string; end: string; label: string; yyyy_mm: string } {
  let year: number, month: number;
  if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
    [year, month] = monthStr.split("-").map(Number);
  } else {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Dublin" }));
    now.setMonth(now.getMonth() - 1);
    year = now.getFullYear();
    month = now.getMonth() + 1;
  }
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const end = `${year}-${String(month).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}T23:59:59`;
  const label = startDate.toLocaleString("en-IE", { month: "long", year: "numeric" });
  const yyyy_mm = `${year}-${String(month).padStart(2, "0")}`;
  return { start, end, label, yyyy_mm };
}

function fmtDate(d: string): string {
  const dt = new Date(d);
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yy = String(dt.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

function deriveStatus(row: any): string {
  if (row.payment_status === "paid") return "Paid";
  if (row.deposit_paid && (row.balance_due ?? 0) > 0) return "Part Paid";
  return "Unpaid";
}

const eur = (n: number) => `€${n.toFixed(2)}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Authenticated-only: organisation_id and user_id are never accepted from the
    // body, they are derived from the caller's JWT / get_my_org_id().
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace(/^Bearer\s+/i, "");

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user: caller }, error: userError } = await supabaseUser.auth.getUser(token);
    if (userError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: orgIdFromJwt, error: orgErr } = await supabaseUser.rpc("get_my_org_id");
    if (orgErr || !orgIdFromJwt) {
      return new Response(JSON.stringify({ error: "Forbidden: no organisation for caller" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerOrgId = orgIdFromJwt as string;
    const callerUserId = caller.id;

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const { start, end, label, yyyy_mm } = getMonthRange(body.month);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Read accountant email from settings table
    let accountantEmail: string | null = null;

    {
      const { data: settingsRow } = await supabase
        .from("settings")
        .select("accountant_email")
        .eq("user_id", callerUserId)
        .maybeSingle();
      accountantEmail = settingsRow?.accountant_email || null;
    }

    if (!accountantEmail) {
      const { data: settingsRows } = await supabase
        .from("settings")
        .select("accountant_email")
        .not("accountant_email", "is", null)
        .limit(1);
      if (settingsRows?.length) {
        accountantEmail = settingsRows[0].accountant_email || null;
      }
    }

    // Fall back to secret if not configured in settings
    if (!accountantEmail) {
      accountantEmail = Deno.env.get("ACCOUNTANT_EMAIL") || null;
    }

    if (!accountantEmail) {
      throw new Error("Accountant email not configured in settings. Go to Settings → Finance & Reporting to add it.");
    }

    // Sales ledger is a cash-basis report: it follows the payment, not the job
    // status, using the same helpers as the Finance screen. Jobs can be paid
    // before/without ever being marked Completed (e.g. SumUp checkouts), so
    // fetch on paid_at OR completed_at and filter with isRevenueRecognised().
    const query = supabase
      .from("service_calls")
      .select("id, receipt_number, invoice_number, paid_at, completed_at, scheduled_date, status, job_type, assigned_engineer, payment_method, payment_status, revenue, balance_due, deposit_paid, deposit_amount, customers(name)")
      .or(`and(paid_at.gte.${start},paid_at.lte.${end}),and(completed_at.gte.${start},completed_at.lte.${end})`)
      .eq("organisation_id", callerOrgId);


    const { data: rows, error } = await query;
    if (error) throw error;

    const periodStart = new Date(start.length === 10 ? start + "T00:00:00" : start);
    const periodEnd = new Date(end);
    const jobs = paidJobsInPeriod((rows || []) as FinanceJob[], periodStart, periodEnd)
      .sort((a, b) => (revenueDate(a)?.getTime() || 0) - (revenueDate(b)?.getTime() || 0));

    // Build row data
    let totalRev = 0, totalNet = 0, totalVat = 0;
    const mapped = jobs.map((r: any) => {
      const rev = collectedAmount(r);
      const net = Math.round((rev / 1.135) * 100) / 100;
      const vat = Math.round((rev - net) * 100) / 100;
      totalRev += rev;
      totalNet += net;
      totalVat += vat;
      const rowDate = revenueDate(r);
      return {
        receipt: r.receipt_number || "",
        invoice: r.invoice_number || "",
        date: rowDate ? fmtDate(rowDate.toISOString()) : "",
        customer: r.customers?.name || "Unknown",
        jobType: r.job_type,
        engineer: r.assigned_engineer || "",
        paymentMethod: r.payment_method || "",
        status: deriveStatus(r),
        rev, net, vat,
      };
    });

    totalRev = Math.round(totalRev * 100) / 100;
    totalNet = Math.round(totalNet * 100) / 100;
    totalVat = Math.round(totalVat * 100) / 100;

    // --- CSV ---
    const csvHeaders = ["Receipt No", "Invoice No", "Date", "Customer", "Job Type", "Engineer", "Payment Method", "Status", "Total inc VAT", "Net", "VAT"];
    const csvRows = mapped.map((r) => [r.receipt, r.invoice, r.date, r.customer, r.jobType, r.engineer, r.paymentMethod, r.status, r.rev.toFixed(2), r.net.toFixed(2), r.vat.toFixed(2)]);
    csvRows.push(["", "", "", "", "", "", "", "TOTALS", totalRev.toFixed(2), totalNet.toFixed(2), totalVat.toFixed(2)]);
    const csvContent = [csvHeaders, ...csvRows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");

    // --- Payment method breakdown ---
    const byMethod: Record<string, { count: number; total: number }> = {};
    for (const r of mapped) {
      const m = r.paymentMethod || "unknown";
      if (!byMethod[m]) byMethod[m] = { count: 0, total: 0 };
      byMethod[m].count++;
      byMethod[m].total += r.rev;
    }

    // --- HTML ---
    const todayStr = new Date().toLocaleDateString("en-IE", { day: "2-digit", month: "long", year: "numeric" });
    const methodRows = Object.entries(byMethod).map(([m, v]) =>
      `<tr><td style="padding:6px 12px;border:1px solid #e2e8f0;text-transform:capitalize">${m}</td><td style="padding:6px 12px;border:1px solid #e2e8f0;text-align:center">${v.count}</td><td style="padding:6px 12px;border:1px solid #e2e8f0;text-align:right">${eur(v.total)}</td></tr>`
    ).join("");

    const tableRows = mapped.map((r) =>
      `<tr>${[r.receipt, r.invoice, r.date, r.customer, r.jobType, r.engineer, r.paymentMethod, r.status, eur(r.rev), eur(r.net), eur(r.vat)].map((c) => `<td style="padding:6px 10px;border:1px solid #e2e8f0;font-size:13px">${c}</td>`).join("")}</tr>`
    ).join("");

    const htmlContent = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>BookedJobs — Monthly Invoice Export ${label}</title>
<style>body{font-family:Arial,sans-serif;margin:40px;color:#1f2937}h1{color:#1E3A5F;margin-bottom:4px}table{border-collapse:collapse;width:100%}th{background:#EBF2FF;padding:8px 10px;border:1px solid #e2e8f0;font-size:13px;text-align:left}td{font-size:13px}.summary{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:20px 0}.summary h3{margin:0 0 12px;color:#1E3A5F}.totals-row td{font-weight:bold;background:#FFFBEB}</style>
</head><body>
<h1>BookedJobs — Monthly Invoice Export</h1>
<p style="color:#6b7280;margin-top:0">${label}</p>

<div class="summary">
<h3>Summary</h3>
<p><strong>Total Invoices:</strong> ${jobs.length}<br>
<strong>Total Revenue (inc VAT):</strong> ${eur(totalRev)}<br>
<strong>Total Net:</strong> ${eur(totalNet)}<br>
<strong>Total VAT (13.5%):</strong> ${eur(totalVat)}</p>

<h3>By Payment Method</h3>
<table style="width:auto"><tr><th>Method</th><th>Count</th><th>Total</th></tr>${methodRows}</table>
</div>

<h3>Invoice Detail</h3>
<table>
<thead><tr>${csvHeaders.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
<tbody>${tableRows}
<tr class="totals-row">${["", "", "", "", "", "", "", "TOTALS", eur(totalRev), eur(totalNet), eur(totalVat)].map((c) => `<td style="padding:6px 10px;border:1px solid #e2e8f0">${c}</td>`).join("")}</tr>
</tbody></table>

<p style="color:#9ca3af;font-size:12px;margin-top:30px">Generated by BookedJobs on ${todayStr}</p>
</body></html>`;

    // --- Send via Resend ---
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

    const csvBase64 = btoa(unescape(encodeURIComponent(csvContent)));
    const htmlBase64 = btoa(unescape(encodeURIComponent(htmlContent)));

    // Derive first name from email for greeting
    const emailLocal = accountantEmail.split("@")[0] || "";
    const isCleanName = /^[a-zA-Z]+$/.test(emailLocal);
    const greeting = isCleanName
      ? emailLocal.charAt(0).toUpperCase() + emailLocal.slice(1).toLowerCase()
      : "there";

    // Resolve org branding for email copy
    let orgId: string | null = body.organisation_id || null;
    if (!orgId && body.user_id) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("organisation_id")
        .eq("user_id", body.user_id)
        .maybeSingle();
      orgId = prof?.organisation_id || null;
    }

    let companyName = "K & N Gas Services";
    let companyPhone = "087 3686252";
    if (orgId) {
      const { data: messengerConfig } = await supabase
        .from("tenant_integrations")
        .select("config")
        .eq("organisation_id", orgId)
        .eq("integration_type", "360messenger")
        .maybeSingle();
      const cfg = (messengerConfig?.config as any) || null;
      if (cfg?.company_name) companyName = cfg.company_name;
      if (cfg?.company_phone) companyPhone = cfg.company_phone;
    }

    const emailSubject = `${companyName} — Sales Ledger ${label}`;
    const emailBody = `Hi ${greeting},

Please find attached a copy of our sales ledger for ${label} for ${companyName}.

The report includes all paid invoices for the period along with totals for your records.

If you have any questions please don't hesitate to get in touch.

Kind regards,
${companyName}
${companyPhone}`;

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "onboarding@resend.dev",
        to: [accountantEmail],
        subject: emailSubject,
        text: emailBody,
        attachments: [
          { filename: `invoices-${yyyy_mm}.csv`, content: csvBase64, type: "text/csv" },
          { filename: `invoices-${yyyy_mm}.html`, content: htmlBase64, type: "text/html" },
        ],
      }),
    });

    if (!emailRes.ok) {
      const errBody = await emailRes.text();
      throw new Error(`Resend error ${emailRes.status}: ${errBody}`);
    }

    return new Response(JSON.stringify({
      success: true,
      month: yyyy_mm,
      invoiceCount: jobs.length,
      totalRevenue: totalRev,
      totalNet: totalNet,
      totalVAT: totalVat,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("generate-accountant-export error:", err);
    return new Response(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
