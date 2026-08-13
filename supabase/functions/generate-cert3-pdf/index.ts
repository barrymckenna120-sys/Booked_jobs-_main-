import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function escapeHtml(str: string | null | undefined): string {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { certificate_id } = await req.json();
    if (!certificate_id) {
      return new Response(JSON.stringify({ error: "certificate_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: cert, error: certErr } = await supabaseAdmin
      .from("certificates").select("*").eq("id", certificate_id).single();

    if (certErr || !cert) {
      return new Response(JSON.stringify({ error: "Certificate not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [customerRes, jobRes] = await Promise.all([
      supabaseAdmin.from("customers").select("*").eq("id", cert.customer_id).single(),
      supabaseAdmin.from("service_calls").select("*").eq("id", cert.job_id).single(),
    ]);

    const customer = customerRes.data;
    const job = jobRes.data;

    let settings: any = null;
    let brandRow: any = null;
    let engineer: any = null;

    if (job?.user_id) {
      const [settingsRes, brandRes] = await Promise.all([
        supabaseAdmin.from("settings").select("*").eq("organisation_id", job.organisation_id).maybeSingle(),
        supabaseAdmin.from("brand_settings").select("*").eq("organisation_id", job.organisation_id).maybeSingle(),
      ]);
      settings = settingsRes.data;
      brandRow = brandRes.data;
    }

    if (job?.assigned_engineer_id) {
      const { data } = await supabaseAdmin.from("engineers").select("name, rgi_number, phone").eq("id", job.assigned_engineer_id).single();
      engineer = data;
    }

    const primaryColor = brandRow?.primary_color || "#1E3A5F";
    const accentColor = brandRow?.accent_color || "#4A86E8";
    const headerTextColor = brandRow?.header_text_color || "#FFFFFF";
    const bodyTextColor = brandRow?.body_text_color || "#1F2937";
    const borderColor = brandRow?.border_color || "#E2E8F0";
    const sectionLabelColor = brandRow?.section_label_color || "#1E3A5F";
    const tableHeaderColor = brandRow?.table_header_color || "#EBF2FF";
    const tableAltColor = brandRow?.table_alt_color || "#F8FAFF";
    const fontFamily = brandRow?.font_family || "Poppins";

    const notes = cert.notes as any || {};
    const checks = cert.checks as any || {};
    const readings = cert.readings as any || {};
    const applianceTable = notes.appliance_table || {};

    const companyName = settings?.business_name || "Company";
    const companyAddress = settings?.business_address || "";
    const companyPhone = settings?.business_phone || "";
    const companyRgi = settings?.rgi_number || "";
    const engineerName = engineer?.name || "";
    const engineerRgi = engineer?.rgi_number || companyRgi;
    const engineerPhone = engineer?.phone || "";

    const primaryRgb = hexToRgb(primaryColor);
    const accentRgb = hexToRgb(accentColor);
    const headerTextRgb = hexToRgb(headerTextColor);
    const bodyTextRgb = hexToRgb(bodyTextColor);
    const borderRgb = hexToRgb(borderColor);
    const sectionLabelRgb = hexToRgb(sectionLabelColor);
    const tableHeaderRgb = hexToRgb(tableHeaderColor);
    const tableAltRgb = hexToRgb(tableAltColor);

    // ── jsPDF rendering ──
    const { default: jsPDF } = await import("https://esm.sh/jspdf@2.5.2");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    doc.setProperties({
      title: `RGI Domestic Safety Certificate – ${customer?.name || "Customer"} – ${cert.cert_number || ""}`,
      subject: "RGI Domestic Gas Safety Certificate",
      author: companyName,
      creator: "BookedJobs",
    });
    const pageW = 210;
    const margin = 15;
    const contentW = pageW - margin * 2;
    let y = margin;

    const addText = (text: string, x: number, _y: number, opts: { size?: number; bold?: boolean; color?: [number, number, number]; maxWidth?: number; align?: string } = {}) => {
      doc.setFontSize(opts.size || 11);
      doc.setFont("helvetica", opts.bold ? "bold" : "normal");
      if (opts.color) doc.setTextColor(...opts.color);
      else doc.setTextColor(...bodyTextRgb);
      if (opts.maxWidth) {
        const lines = doc.splitTextToSize(text, opts.maxWidth);
        doc.text(lines, x, _y, { align: opts.align as any });
        return lines.length * (opts.size || 11) * 0.4;
      }
      doc.text(text, x, _y, { align: opts.align as any });
      return (opts.size || 11) * 0.4;
    };

    const checkNewPage = (needed: number) => {
      if (y + needed > 280) { doc.addPage(); y = margin; }
    };

    // Header
    doc.setFillColor(...primaryRgb);
    doc.roundedRect(margin, y, contentW, 22, 2, 2, "F");
    addText("RGI", margin + 5, y + 9, { size: 9, bold: true, color: headerTextRgb });
    addText("Safety", margin + 5, y + 14, { size: 9, bold: true, color: headerTextRgb });
    addText("Domestic Safety / Service", margin + 24, y + 10, { size: 15, bold: true, color: headerTextRgb });
    addText(cert.cert_number || "", pageW - margin - 3, y + 10, { size: 12, bold: true, color: accentRgb, align: "right" });
    const dateStr = new Date(cert.created_at).toLocaleDateString("en-IE", { day: "2-digit", month: "long", year: "numeric" });
    addText(`Issued: ${dateStr}`, pageW - margin - 3, y + 17, { size: 9, color: [200, 200, 200], align: "right" });
    y += 28;

    const sectionTitle = (title: string) => {
      checkNewPage(12);
      doc.setFillColor(...primaryRgb);
      doc.rect(margin, y, contentW, 7, "F");
      addText(title, margin + 3, y + 5, { size: 10, bold: true, color: headerTextRgb });
      y += 10;
    };

    const fieldPair = (label: string, value: string, x: number, w?: number) => {
      addText(label, x, y, { size: 8, color: [136, 136, 136] });
      y += 3.5;
      addText(value || "—", x, y, { size: 10, bold: true, maxWidth: w });
      y += 5.5;
    };

    // Company Details
    sectionTitle("COMPANY DETAILS");
    const compCardH = 20;
    doc.setFillColor(245, 247, 250);
    doc.setDrawColor(229, 231, 235);
    doc.roundedRect(margin, y, contentW, compCardH, 2, 2, "FD");
    const compCardMidY = y + compCardH / 2;
    addText("Company", margin + 4, compCardMidY - 4, { size: 8, color: [136, 136, 136] });
    addText(companyName, margin + 4, compCardMidY, { size: 10, bold: true });
    addText("Address", margin + 4, compCardMidY + 4, { size: 8, color: [136, 136, 136] });
    addText(companyAddress.replace(/\n/g, ", "), margin + 4, compCardMidY + 8, { size: 8, bold: true, maxWidth: contentW * 0.42 });
    const col2X = margin + contentW * 0.5;
    addText("Phone", col2X, compCardMidY - 2, { size: 8, color: [136, 136, 136] });
    addText(companyPhone, col2X, compCardMidY + 2, { size: 10, bold: true });
    const col3X = margin + contentW * 0.75;
    addText("Engineer", col3X, compCardMidY - 4, { size: 8, color: [136, 136, 136] });
    addText(engineerName, col3X, compCardMidY, { size: 10, bold: true });
    addText("RGI Number", col3X, compCardMidY + 4, { size: 8, color: [136, 136, 136] });
    addText(engineerRgi, col3X, compCardMidY + 8, { size: 10, bold: true });
    y += compCardH + 4;

    // Premises Details
    sectionTitle("PREMISES DETAILS");
    const py = y;
    fieldPair("Customer Name", notes.customer_name || customer?.name || "", margin + 2);
    fieldPair("Address", notes.address || customer?.address || "", margin + 2);
    fieldPair("Eircode", notes.eircode || customer?.eircode || "", margin + 2);
    const pLeftEnd = y;
    y = py;
    fieldPair("Tel No", notes.tel_no || customer?.phone || "", margin + contentW / 2);
    fieldPair("GPRN", notes.gprn || "", margin + contentW / 2);
    fieldPair("Gas Type", notes.gas_type || "", margin + contentW / 2);
    y = Math.max(pLeftEnd, y) + 2;

    // Appliance Table
    checkNewPage(60);
    sectionTitle("APPLIANCE TABLE");
    const appliances = ["Hob", "Oven", "Cooker", "Fire", "Flueless Fire", "C/H Boiler", "Water Heater", "Pipework"];
    const appCols = ["Repaired", "I.S. 813 / I.S. EN 1949", "Annex C \u2013 Serviced", "Annex E \u2013 Safety Check"];
    const appColW = (contentW - 32) / appCols.length;

    // Table header
    doc.setFillColor(...tableHeaderRgb);
    doc.rect(margin, y, contentW, 8, "F");
    doc.setDrawColor(...borderRgb);
    doc.rect(margin, y, contentW, 8, "S");
    addText("Appliance", margin + 2, y + 5.5, { size: 7, bold: true, color: sectionLabelRgb });
    for (let i = 0; i < appCols.length; i++) {
      const cx = margin + 32 + i * appColW;
      addText(appCols[i], cx + appColW / 2, y + 5.5, { size: 6, bold: true, color: sectionLabelRgb, align: "center", maxWidth: appColW - 2 });
    }
    y += 8;

    // Table rows
    for (let r = 0; r < appliances.length; r++) {
      checkNewPage(8);
      const rowBg = r % 2 === 0 ? [255, 255, 255] : tableAltRgb;
      doc.setFillColor(...(rowBg as [number, number, number]));
      doc.rect(margin, y, contentW, 7, "F");
      doc.setDrawColor(...borderRgb);
      doc.rect(margin, y, contentW, 7, "S");
      addText(appliances[r], margin + 2, y + 5, { size: 8 });

      const rowData = applianceTable[appliances[r]] || {};
      for (let c = 0; c < appCols.length; c++) {
        const cx = margin + 32 + c * appColW + appColW / 2;
        const val = rowData[appCols[c]];
        if (val === true) {
          addText("Y", cx, y + 5, { size: 11, bold: true, color: [34, 197, 94], align: "center" });
        } else if (val === false) {
          addText("N", cx, y + 5, { size: 11, bold: true, color: [239, 68, 68], align: "center" });
        } else {
          addText("-", cx, y + 5, { size: 11, color: [156, 163, 175], align: "center" });
        }
      }
      y += 7;
    }
    y += 4;

    // Safety Checks
    sectionTitle("SAFETY CHECKS");
    const checkItems = [
      ["flue_inspected", "Flue Inspected and Adequate"],
      ["appliance_location", "Appliance Location Correct"],
      ["ventilation", "Adequate Permanent Ventilation"],
      ["soundness_test", "Soundness Test Pass"],
    ];
    let checkIdx = 0;
    for (const [key, label] of checkItems) {
      checkNewPage(10);
      const rowBg = checkIdx % 2 === 0 ? [255, 255, 255] : tableAltRgb;
      doc.setFillColor(...(rowBg as [number, number, number]));
      doc.rect(margin, y - 2, contentW, 8, "F");
      doc.setDrawColor(...borderRgb);
      doc.line(margin, y + 6, margin + contentW, y + 6);
      addText(label, margin + 2, y + 4, { size: 10 });
      const val = checks[key];
      if (val?.status === "pass") {
        addText("Y", margin + contentW - 10, y + 4, { size: 11, bold: true, color: [34, 197, 94], align: "right" });
      } else {
        addText("N", margin + contentW - 10, y + 4, { size: 11, bold: true, color: [239, 68, 68], align: "right" });
      }
      y += 8;
      checkIdx++;
    }
    y += 2;

    // Gas Readings
    checkNewPage(30);
    sectionTitle("GAS READINGS");
    const readingPairs: [string, string][] = [
      ["CO (ppm)", readings.co_ppm || "\u2014"],
      ["CO2 (%)", readings.co2_pct || "\u2014"],
      ["CO/CO2 Ratio", readings.ratio || "\u2014"],
    ];
    const colW = contentW / 3;
    for (let i = 0; i < readingPairs.length; i++) {
      const x = margin + i * colW + 2;
      doc.setDrawColor(...borderRgb);
      doc.roundedRect(x, y, colW - 4, 13, 1, 1, "S");
      addText(readingPairs[i][0], x + (colW - 4) / 2, y + 4, { size: 7, color: [136, 136, 136], align: "center" });
      addText(readingPairs[i][1], x + (colW - 4) / 2, y + 10, { size: 14, bold: true, color: primaryRgb, align: "center" });
    }
    y += 18;

    // Comments
    if (notes.comments) {
      checkNewPage(20);
      sectionTitle("COMMENTS");
      addText(notes.comments, margin + 2, y, { size: 9, maxWidth: contentW - 4 });
      const lines = doc.splitTextToSize(notes.comments, contentW - 4);
      y += lines.length * 4 + 4;
    }

    // Next Service Due
    if (notes.next_service_due) {
      checkNewPage(15);
      fieldPair("Next Service Due", notes.next_service_due, margin + 2);
    }

    // Declaration section
    checkNewPage(30);
    sectionTitle("DECLARATION");
    const dy = y;
    fieldPair("Date of Test", formatDate(notes.date_of_test), margin + 2);
    fieldPair("Date of Issue", formatDate(notes.date_of_issue), margin + 2);
    const dLeftEnd = y;
    y = dy;
    fieldPair("Trainee No", notes.trainee_no || "N/A", margin + contentW / 2);
    fieldPair("Hazard Issued", notes.hazard_issued || "NO", margin + contentW / 2);
    y = Math.max(dLeftEnd, y);

    if (notes.hazard_issued === "YES") {
      fieldPair("Hazard No.", notes.hazard_no || "", margin + 2);
      fieldPair("Reason", notes.hazard_reason || "", margin + 2);
    }

    // Declaration text
    checkNewPage(30);
    doc.setFillColor(...tableAltRgb);
    doc.roundedRect(margin, y, contentW, 24, 2, 2, "F");
    doc.setDrawColor(...borderRgb);
    doc.roundedRect(margin, y, contentW, 24, 2, 2, "S");
    addText("Domestic Safety / Service Declaration:", margin + 4, y + 5, { size: 8, bold: true, color: [68, 68, 68] });
    addText(
      "I hereby declare that I am a Registered Gas Installer and that the gas appliance(s) at the above premises have been inspected, tested and serviced in accordance with I.S. 813 and current gas safety standards. All appliances listed have been checked and are safe for continued use.",
      margin + 4, y + 9, { size: 7, color: [68, 68, 68], maxWidth: contentW - 8 }
    );
    y += 28;

    // Footer
    const footerText = "Copies: White \u2013 Customer, Green \u2013 Return to RGII, Blue \u2013 Copy for your records";
    const footerH = companyAddress ? 16 : 12;
    const footerTopY = 297 - margin - footerH;
    doc.setFillColor(...primaryRgb);
    doc.rect(margin, footerTopY, contentW, footerH, "F");
    addText(`${companyName}  \u2022  RGI: ${companyRgi}  \u2022  ${companyPhone}`, margin + 4, footerTopY + 4, { size: 8, color: headerTextRgb });
    if (companyAddress) {
      const fadedRgb: [number, number, number] = [
        Math.round(headerTextRgb[0] * 0.7 + primaryRgb[0] * 0.3),
        Math.round(headerTextRgb[1] * 0.7 + primaryRgb[1] * 0.3),
        Math.round(headerTextRgb[2] * 0.7 + primaryRgb[2] * 0.3),
      ];
      addText(companyAddress.replace(/\n/g, ", "), margin + 4, footerTopY + 8.5, { size: 7, color: fadedRgb, maxWidth: contentW - 8 });
    }
    addText(footerText, margin + 4, footerTopY + footerH - 3, { size: 6, color: [200, 200, 200] });

    // Engineer Signature
    const sigBlockH = 30;
    const availableSpace = footerTopY - y - 2;
    const sigGap = Math.min(8, Math.max(0, availableSpace - sigBlockH));
    y += sigGap;
    checkNewPage(sigBlockH);

    if (cert.engineer_sig_url && cert.engineer_sig_url.startsWith("data:")) {
      try { doc.addImage(cert.engineer_sig_url, "PNG", margin + 2, y, 60, 18); } catch {}
    }
    doc.setDrawColor(51, 51, 51);
    doc.line(margin + 2, y + 20, margin + 62, y + 20);
    addText("Engineer Signature", margin + 32, y + 25, { size: 8, color: [102, 102, 102], align: "center" });
    addText(`${engineerName} \u2014 RGI: ${engineerRgi}`, margin + 32, y + 29, { size: 7, color: [102, 102, 102], align: "center" });

    // Generate PDF buffer
    const pdfOutput = doc.output("arraybuffer");
    const pdfBytes = new Uint8Array(pdfOutput);

    if (!cert.organisation_id) {
      return new Response(JSON.stringify({ error: "Certificate missing organisation_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const fileName = `${cert.cert_number}.pdf`;
    const storagePath = `${cert.organisation_id}/${fileName}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("certificates").upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: true });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return new Response(JSON.stringify({ error: "Failed to upload PDF" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabaseAdmin.from("certificates").update({ pdf_url: storagePath }).eq("id", certificate_id);

    return new Response(JSON.stringify({ pdf_url: storagePath }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("generate-cert3-pdf error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
