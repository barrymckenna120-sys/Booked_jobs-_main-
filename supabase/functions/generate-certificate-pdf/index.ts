import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function escapeHtml(str: string | null | undefined): string {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildHtml(cert: any, customer: any, job: any, settings: any, engineer: any): string {
  const checks = cert.checks || {};
  const readings = cert.readings || {};
  const notes = cert.notes || {};
  const details = notes.details || {};

  const checkRows = Object.entries(checks as Record<string, { status: string; note: string }>)
    .map(([key, val]) => {
      const label = key.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
      const icon = val.status === "pass"
        ? '<span style="color:#22c55e;font-size:18px;">&#10003;</span>'
        : `<span style="color:#c8102e;font-size:18px;">&#10007;</span>${val.note ? `<br/><span style="font-size:11px;color:#c8102e;">${escapeHtml(val.note)}</span>` : ""}`;
      return `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${label}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${icon}</td></tr>`;
    })
    .join("");

  const companyName = settings?.business_name || "Company";
  const companyAddress = settings?.business_address || "";
  const companyPhone = settings?.business_phone || "";
  const companyEmail = settings?.business_email || "";
  const companyRgi = settings?.rgi_number || "";
  const engineerName = engineer?.name || details.customerName || "";
  const engineerRgi = engineer?.rgi_number || companyRgi;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1a1a1a;padding:30px 40px;}
  .header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #1e3a5f;padding-bottom:14px;margin-bottom:18px;}
  .header h1{font-size:20px;color:#1e3a5f;margin:0;}
  .cert-num{font-size:14px;color:#c8102e;font-weight:bold;margin-top:4px;}
  .date{font-size:12px;color:#666;margin-top:2px;}
  .rgi-badge{width:60px;height:60px;border-radius:50%;background:#1e3a5f;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:11px;text-align:center;line-height:1.2;}
  .section{margin-bottom:16px;}
  .section-title{font-size:13px;font-weight:bold;color:#1e3a5f;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #ddd;padding-bottom:4px;margin-bottom:8px;}
  .two-col{display:flex;gap:30px;}
  .two-col > div{flex:1;}
  .field{margin-bottom:5px;}
  .field .label{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;}
  .field .value{font-size:13px;font-weight:600;}
  table{width:100%;border-collapse:collapse;}
  th{background:#1e3a5f;color:#fff;padding:8px 12px;text-align:left;font-size:12px;}
  .reading-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;}
  .reading-box{border:1px solid #ddd;border-radius:6px;padding:10px;text-align:center;}
  .reading-box .r-label{font-size:10px;color:#888;text-transform:uppercase;}
  .reading-box .r-value{font-size:20px;font-weight:bold;color:#1e3a5f;}
  .declaration{background:#f8f9fa;border:1px solid #e5e7eb;border-radius:6px;padding:14px;font-size:11px;line-height:1.6;color:#444;margin-top:16px;}
  .sig-row{display:flex;gap:40px;margin-top:20px;}
  .sig-box{flex:1;text-align:center;}
  .sig-box img{max-width:200px;max-height:80px;border-bottom:1px solid #333;}
  .sig-label{font-size:11px;color:#666;margin-top:4px;}
  .footer{border-top:2px solid #1e3a5f;padding-top:8px;margin-top:24px;text-align:center;font-size:11px;color:#666;}
</style></head><body>

<div class="header">
  <div class="rgi-badge">RGI<br/>Cert</div>
  <div style="text-align:right;">
    <h1>RGI Domestic Gas Certificate</h1>
    <div class="cert-num">${escapeHtml(cert.cert_number)}</div>
    <div class="date">Issued: ${new Date(cert.created_at).toLocaleDateString("en-IE", { day: "2-digit", month: "long", year: "numeric" })}</div>
  </div>
</div>

<div class="section">
  <div class="section-title">Company Details</div>
  <div class="two-col">
    <div>
      <div class="field"><span class="label">Company</span><div class="value">${escapeHtml(companyName)}</div></div>
      <div class="field"><span class="label">Address</span><div class="value">${escapeHtml(companyAddress)}</div></div>
    </div>
    <div>
      <div class="field"><span class="label">Phone</span><div class="value">${escapeHtml(companyPhone)}</div></div>
      <div class="field"><span class="label">Email</span><div class="value">${escapeHtml(companyEmail)}</div></div>
      <div class="field"><span class="label">Engineer</span><div class="value">${escapeHtml(engineerName)}</div></div>
      <div class="field"><span class="label">RGI Number</span><div class="value">${escapeHtml(engineerRgi)}</div></div>
    </div>
  </div>
</div>

<div class="section">
  <div class="section-title">Property Details</div>
  <div class="two-col">
    <div>
      <div class="field"><span class="label">Customer</span><div class="value">${escapeHtml(customer?.name)}</div></div>
      <div class="field"><span class="label">Address</span><div class="value">${escapeHtml(customer?.address)}</div></div>
      <div class="field"><span class="label">Eircode</span><div class="value">${escapeHtml(customer?.eircode)}</div></div>
      <div class="field"><span class="label">Contact</span><div class="value">${escapeHtml(customer?.phone)}</div></div>
    </div>
    <div>
      <div class="field"><span class="label">Appliance Type</span><div class="value">${escapeHtml(details.applianceType || job?.boiler_type)}</div></div>
      <div class="field"><span class="label">Boiler Brand</span><div class="value">${escapeHtml(details.boilerBrand || job?.boiler_brand)}</div></div>
      <div class="field"><span class="label">Boiler Model</span><div class="value">${escapeHtml(details.boilerModel || job?.boiler_issue)}</div></div>
      <div class="field"><span class="label">Flue Type</span><div class="value">${escapeHtml(details.flueType)}</div></div>
      <div class="field"><span class="label">Pipework</span><div class="value">${escapeHtml(details.pipework)}</div></div>
    </div>
  </div>
</div>

<div class="section">
  <div class="section-title">Safety Checks</div>
  <table>
    <tr><th>Check</th><th style="text-align:center;">Result</th></tr>
    ${checkRows}
  </table>
</div>

<div class="section">
  <div class="section-title">Gas Readings</div>
  <div class="reading-grid">
    <div class="reading-box"><div class="r-label">CO (ppm)</div><div class="r-value">${escapeHtml(readings.co_ppm)}</div></div>
    <div class="reading-box"><div class="r-label">CO₂ (%)</div><div class="r-value">${escapeHtml(readings.co2_pct)}</div></div>
    <div class="reading-box"><div class="r-label">Ratio</div><div class="r-value">${escapeHtml(readings.ratio)}</div></div>
    <div class="reading-box"><div class="r-label">Combustion CO</div><div class="r-value">${escapeHtml(readings.combustion_co)}</div></div>
    <div class="reading-box"><div class="r-label">Combustion Ratio</div><div class="r-value">${escapeHtml(readings.combustion_ratio)}</div></div>
    <div class="reading-box"><div class="r-label">Inlet Pressure</div><div class="r-value">${escapeHtml(readings.inlet_pressure)}</div></div>
  </div>
  <div style="margin-top:10px;">
    <div class="reading-grid" style="grid-template-columns:1fr 1fr;">
      <div class="reading-box"><div class="r-label">Working Pressure (mbar)</div><div class="r-value">${escapeHtml(readings.working_pressure)}</div></div>
      <div class="reading-box"><div class="r-label">Work Carried Out</div><div class="r-value" style="font-size:12px;font-weight:normal;">${escapeHtml(notes.work_carried_out)}</div></div>
    </div>
  </div>
</div>

<div class="declaration">
  <strong>Declaration:</strong> I hereby declare that I am a Registered Gas Installer and that the installation, servicing and safety checks carried out at the above premises have been completed in accordance with current gas safety standards and regulations. All reasonable steps have been taken to ensure that the appliance and associated pipework are safe for continued use at the time of inspection. This certificate relates only to the condition of the installation at the time of inspection. It is recommended that gas appliances are serviced annually.
</div>

<div class="sig-row">
  <div class="sig-box">
    ${cert.customer_sig_url ? `<img src="${cert.customer_sig_url}" alt="Customer Signature"/>` : "<div style='height:60px;border-bottom:1px solid #333;'></div>"}
    <div class="sig-label">Customer Signature</div>
  </div>
  <div class="sig-box">
    ${cert.engineer_sig_url ? `<img src="${cert.engineer_sig_url}" alt="Engineer Signature"/>` : "<div style='height:60px;border-bottom:1px solid #333;'></div>"}
    <div class="sig-label">${escapeHtml(engineerName)}<br/>RGI: ${escapeHtml(engineerRgi)}</div>
  </div>
</div>

<div class="footer">
  ${escapeHtml(companyName)} &bull; RGI: ${escapeHtml(companyRgi)} &bull; ${escapeHtml(companyPhone)}
</div>

</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { certificate_id } = await req.json();
    if (!certificate_id) {
      return new Response(JSON.stringify({ error: "certificate_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch certificate
    const { data: cert, error: certErr } = await supabaseAdmin
      .from("certificates")
      .select("*")
      .eq("id", certificate_id)
      .single();

    if (certErr || !cert) {
      return new Response(JSON.stringify({ error: "Certificate not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch related data in parallel
    const [customerRes, jobRes] = await Promise.all([
      supabaseAdmin.from("customers").select("*").eq("id", cert.customer_id).single(),
      supabaseAdmin.from("service_calls").select("*").eq("id", cert.job_id).single(),
    ]);

    const customer = customerRes.data;
    const job = jobRes.data;

    // Fetch settings for the job owner
    let settings = null;
    if (job?.user_id) {
      const { data } = await supabaseAdmin
        .from("settings")
        .select("*")
        .eq("user_id", job.user_id)
        .maybeSingle();
      settings = data;
    }

    // Fetch engineer info
    let engineer = null;
    if (job?.assigned_engineer_id) {
      const { data } = await supabaseAdmin
        .from("engineers")
        .select("name, rgi_number")
        .eq("id", job.assigned_engineer_id)
        .single();
      engineer = data;
    }

    // Build HTML
    const html = buildHtml(cert, customer, job, settings, engineer);

    // Convert HTML to PDF using jsPDF (same approach as quote PDF generation)
    // Since we can't use a headless browser in Deno edge, we'll use the HTML as a base
    // and convert via a simple text-based PDF approach with jsPDF
    const { default: jsPDF } = await import("https://esm.sh/jspdf@2.5.2");

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = 210;
    const margin = 15;
    const contentW = pageW - margin * 2;
    let y = margin;

    const addText = (text: string, x: number, _y: number, opts: { size?: number; bold?: boolean; color?: [number, number, number]; maxWidth?: number; align?: string } = {}) => {
      doc.setFontSize(opts.size || 11);
      doc.setFont("helvetica", opts.bold ? "bold" : "normal");
      if (opts.color) doc.setTextColor(...opts.color);
      else doc.setTextColor(26, 26, 26);
      
      if (opts.maxWidth) {
        const lines = doc.splitTextToSize(text, opts.maxWidth);
        doc.text(lines, x, _y, { align: opts.align as any });
        return lines.length * (opts.size || 11) * 0.4;
      }
      doc.text(text, x, _y, { align: opts.align as any });
      return (opts.size || 11) * 0.4;
    };

    const checkNewPage = (needed: number) => {
      if (y + needed > 280) {
        doc.addPage();
        y = margin;
      }
    };

    // Header
    doc.setFillColor(30, 58, 95);
    doc.roundedRect(margin, y, contentW, 22, 2, 2, "F");
    addText("RGI", margin + 5, y + 9, { size: 9, bold: true, color: [255, 255, 255] });
    addText("Cert", margin + 5, y + 14, { size: 9, bold: true, color: [255, 255, 255] });
    addText("RGI Domestic Gas Certificate", margin + 22, y + 10, { size: 16, bold: true, color: [255, 255, 255] });
    addText(cert.cert_number || "", pageW - margin, y + 10, { size: 12, bold: true, color: [200, 16, 46], align: "right" });
    const dateStr = new Date(cert.created_at).toLocaleDateString("en-IE", { day: "2-digit", month: "long", year: "numeric" });
    addText(`Issued: ${dateStr}`, pageW - margin, y + 17, { size: 9, color: [200, 200, 200], align: "right" });
    y += 28;

    // Section helper
    const sectionTitle = (title: string) => {
      checkNewPage(12);
      doc.setFillColor(30, 58, 95);
      doc.rect(margin, y, contentW, 7, "F");
      addText(title, margin + 3, y + 5, { size: 10, bold: true, color: [255, 255, 255] });
      y += 10;
    };

    const fieldPair = (label: string, value: string, x: number) => {
      addText(label, x, y, { size: 8, color: [136, 136, 136] });
      y += 3.5;
      addText(value || "—", x, y, { size: 10, bold: true });
      y += 5.5;
    };

    const notes = cert.notes as any || {};
    const details = notes.details || {};
    const readings = cert.readings as any || {};
    const checks = cert.checks as any || {};

    const companyName = settings?.business_name || "Company";
    const companyAddress = settings?.business_address || "";
    const companyPhone = settings?.business_phone || "";
    const companyEmail = settings?.business_email || "";
    const companyRgi = settings?.rgi_number || "";
    const engineerName = engineer?.name || "";
    const engineerRgi = (engineer as any)?.rgi_number || companyRgi;

    // Company Details
    sectionTitle("COMPANY DETAILS");
    const savedY = y;
    fieldPair("Company", companyName, margin + 2);
    fieldPair("Address", companyAddress, margin + 2);
    const leftEnd = y;
    y = savedY;
    fieldPair("Phone", companyPhone, margin + contentW / 2);
    fieldPair("Email", companyEmail, margin + contentW / 2);
    fieldPair("Engineer", engineerName, margin + contentW / 2);
    fieldPair("RGI Number", engineerRgi, margin + contentW / 2);
    y = Math.max(leftEnd, y) + 2;

    // Property Details
    sectionTitle("PROPERTY DETAILS");
    const py = y;
    fieldPair("Customer", customer?.name || "", margin + 2);
    fieldPair("Address", customer?.address || "", margin + 2);
    fieldPair("Eircode", customer?.eircode || "", margin + 2);
    fieldPair("Contact", customer?.phone || "", margin + 2);
    const pLeftEnd = y;
    y = py;
    fieldPair("Appliance Type", details.applianceType || job?.boiler_type || "", margin + contentW / 2);
    fieldPair("Boiler Brand", details.boilerBrand || job?.boiler_brand || "", margin + contentW / 2);
    fieldPair("Boiler Model", details.boilerModel || job?.boiler_issue || "", margin + contentW / 2);
    fieldPair("Flue Type", details.flueType || "", margin + contentW / 2);
    fieldPair("Pipework", details.pipework || "", margin + contentW / 2);
    y = Math.max(pLeftEnd, y) + 2;

    // Safety Checks
    sectionTitle("SAFETY CHECKS");
    for (const [key, val] of Object.entries(checks as Record<string, { status: string; note: string }>)) {
      checkNewPage(10);
      const label = key.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
      doc.setDrawColor(229, 231, 235);
      doc.line(margin, y + 6, margin + contentW, y + 6);
      addText(label, margin + 2, y + 4, { size: 10 });
      if (val.status === "pass") {
        addText("PASS", margin + contentW - 10, y + 4, { size: 10, bold: true, color: [34, 197, 94], align: "right" });
      } else {
        addText("FAIL", margin + contentW - 10, y + 4, { size: 10, bold: true, color: [200, 16, 46], align: "right" });
      }
      y += 8;
      if (val.status === "fail" && val.note) {
        addText(val.note, margin + 4, y, { size: 8, color: [200, 16, 46], maxWidth: contentW - 20 });
        y += 5;
      }
    }
    y += 2;

    // Readings
    checkNewPage(40);
    sectionTitle("GAS READINGS");
    const readingPairs: [string, string][] = [
      ["CO (ppm)", readings.co_ppm || "—"],
      ["CO₂ (%)", readings.co2_pct || "—"],
      ["Ratio", readings.ratio || "—"],
      ["Combustion CO", readings.combustion_co || "—"],
      ["Combustion Ratio", readings.combustion_ratio || "—"],
      ["Inlet Pressure (mbar)", readings.inlet_pressure || "—"],
      ["Working Pressure (mbar)", readings.working_pressure || "—"],
    ];

    const colW = contentW / 3;
    for (let i = 0; i < readingPairs.length; i++) {
      const col = i % 3;
      if (col === 0 && i > 0) y += 14;
      if (col === 0) checkNewPage(16);
      const x = margin + col * colW + 2;
      doc.setDrawColor(221, 221, 221);
      doc.roundedRect(x, y, colW - 4, 13, 1, 1, "S");
      addText(readingPairs[i][0], x + (colW - 4) / 2, y + 4, { size: 7, color: [136, 136, 136], align: "center" });
      addText(readingPairs[i][1], x + (colW - 4) / 2, y + 10, { size: 14, bold: true, color: [30, 58, 95], align: "center" });
    }
    y += 18;

    if (notes.work_carried_out) {
      checkNewPage(15);
      addText("Work Carried Out:", margin + 2, y, { size: 9, bold: true, color: [30, 58, 95] });
      y += 4;
      const h = addText(notes.work_carried_out, margin + 2, y, { size: 9, maxWidth: contentW - 4 });
      y += h + 4;
    }

    // Declaration
    checkNewPage(30);
    doc.setFillColor(248, 249, 250);
    doc.roundedRect(margin, y, contentW, 28, 2, 2, "F");
    doc.setDrawColor(229, 231, 235);
    doc.roundedRect(margin, y, contentW, 28, 2, 2, "S");
    addText("Declaration:", margin + 4, y + 5, { size: 8, bold: true, color: [68, 68, 68] });
    addText(
      "I hereby declare that I am a Registered Gas Installer and that the installation, servicing and safety checks carried out at the above premises have been completed in accordance with current gas safety standards and regulations. All reasonable steps have been taken to ensure that the appliance and associated pipework are safe for continued use at the time of inspection. This certificate relates only to the condition of the installation at the time of inspection. It is recommended that gas appliances are serviced annually.",
      margin + 4,
      y + 9,
      { size: 7, color: [68, 68, 68], maxWidth: contentW - 8 }
    );
    y += 32;

    // Signatures
    checkNewPage(35);
    const sigW = (contentW - 10) / 2;
    
    // Customer signature
    if (cert.customer_sig_url && cert.customer_sig_url.startsWith("data:")) {
      try {
        doc.addImage(cert.customer_sig_url, "PNG", margin + 2, y, sigW - 4, 20);
      } catch { /* skip if image fails */ }
    }
    doc.setDrawColor(51, 51, 51);
    doc.line(margin + 2, y + 22, margin + sigW - 2, y + 22);
    addText("Customer Signature", margin + sigW / 2, y + 27, { size: 8, color: [102, 102, 102], align: "center" });

    // Engineer signature
    const engX = margin + sigW + 10;
    if (cert.engineer_sig_url && cert.engineer_sig_url.startsWith("data:")) {
      try {
        doc.addImage(cert.engineer_sig_url, "PNG", engX, y, sigW - 4, 20);
      } catch { /* skip if image fails */ }
    }
    doc.line(engX, y + 22, engX + sigW - 4, y + 22);
    addText("Engineer Signature", engX + (sigW - 4) / 2, y + 27, { size: 8, color: [102, 102, 102], align: "center" });
    addText(`${engineerName} — RGI: ${engineerRgi}`, engX + (sigW - 4) / 2, y + 31, { size: 7, color: [102, 102, 102], align: "center" });
    y += 36;

    // Footer
    doc.setFillColor(30, 58, 95);
    doc.rect(margin, 285, contentW, 5, "F");
    addText(`${companyName}  •  RGI: ${companyRgi}  •  ${companyPhone}`, pageW / 2, 289, { size: 8, color: [255, 255, 255], align: "center" });

    // Generate PDF buffer
    const pdfOutput = doc.output("arraybuffer");
    const pdfBytes = new Uint8Array(pdfOutput);

    // Upload to storage
    const fileName = `${cert.cert_number}.pdf`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("certificates")
      .upload(fileName, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return new Response(JSON.stringify({ error: "Failed to upload PDF" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get public URL
    const { data: publicUrl } = supabaseAdmin.storage
      .from("certificates")
      .getPublicUrl(fileName);

    const pdfUrl = publicUrl.publicUrl;

    // Update certificate record
    await supabaseAdmin
      .from("certificates")
      .update({ pdf_url: pdfUrl })
      .eq("id", certificate_id);

    return new Response(JSON.stringify({ pdf_url: pdfUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("generate-certificate-pdf error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
