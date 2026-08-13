import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
}

interface BrandColors {
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  header_text_color: string;
  body_text_color: string;
  section_label_color: string;
  border_color: string;
  table_header_color: string;
  table_row_color: string;
  table_alt_color: string;
  font_family: string;
}

const BRAND_DEFAULTS: BrandColors = {
  primary_color: "#1E3A5F",
  secondary_color: "#2C4F7C",
  accent_color: "#4A86E8",
  background_color: "#FFFFFF",
  header_text_color: "#FFFFFF",
  body_text_color: "#1F2937",
  section_label_color: "#1E3A5F",
  border_color: "#E2E8F0",
  table_header_color: "#EBF2FF",
  table_row_color: "#FFFFFF",
  table_alt_color: "#F8FAFF",
  font_family: "Poppins",
};

function mergeBrand(row: any): BrandColors {
  if (!row) return { ...BRAND_DEFAULTS };
  return {
    primary_color: row.primary_color ?? BRAND_DEFAULTS.primary_color,
    secondary_color: row.secondary_color ?? BRAND_DEFAULTS.secondary_color,
    accent_color: row.accent_color ?? BRAND_DEFAULTS.accent_color,
    background_color: row.background_color ?? BRAND_DEFAULTS.background_color,
    header_text_color: row.header_text_color ?? BRAND_DEFAULTS.header_text_color,
    body_text_color: row.body_text_color ?? BRAND_DEFAULTS.body_text_color,
    section_label_color: row.section_label_color ?? BRAND_DEFAULTS.section_label_color,
    border_color: row.border_color ?? BRAND_DEFAULTS.border_color,
    table_header_color: row.table_header_color ?? BRAND_DEFAULTS.table_header_color,
    table_row_color: row.table_row_color ?? BRAND_DEFAULTS.table_row_color,
    table_alt_color: row.table_alt_color ?? BRAND_DEFAULTS.table_alt_color,
    font_family: row.font_family ?? BRAND_DEFAULTS.font_family,
  };
}

const HAZARD_LABELS: Record<string, { title: string; desc: string }> = {
  A: { title: "Non-Conformance", desc: "Gas left on, pending rectification" },
  B: { title: "Hazard", desc: "Appliance isolated for safety" },
  C: { title: "Hazard", desc: "Gas supply isolated for safety" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { hazard_id } = await req.json();
    if (!hazard_id) {
      return new Response(JSON.stringify({ error: "hazard_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: hazard, error: hErr } = await supabaseAdmin
      .from("hazard_notifications")
      .select("*")
      .eq("id", hazard_id)
      .single();

    if (hErr || !hazard) {
      return new Response(JSON.stringify({ error: "Hazard notification not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [customerRes, jobRes] = await Promise.all([
      supabaseAdmin.from("customers").select("*").eq("id", hazard.customer_id).single(),
      supabaseAdmin.from("service_calls").select("*").eq("id", hazard.job_id).single(),
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
      const { data } = await supabaseAdmin.from("engineers").select("name, rgi_number").eq("id", job.assigned_engineer_id).single();
      engineer = data;
    }

    const brand = mergeBrand(brandRow);

    // ── jsPDF rendering ──
    const { default: jsPDF } = await import("https://esm.sh/jspdf@2.5.2");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    doc.setProperties({
      title: `Notification of Hazard – ${customer?.name || "Customer"} – ${hazard.ref_number || ""}`,
      subject: "Gas Safety Hazard Notification",
      author: settings?.business_name || "Company",
      creator: "BookedJobs",
    });
    const pageW = 210;
    const margin = 15;
    const contentW = pageW - margin * 2;
    let y = margin;

    const primaryRgb = hexToRgb(brand.primary_color);
    const headerTextRgb = hexToRgb(brand.header_text_color);
    const accentRgb = hexToRgb(brand.accent_color);
    const bodyTextRgb = hexToRgb(brand.body_text_color);
    const borderRgb = hexToRgb(brand.border_color);
    const tableAltRgb = hexToRgb(brand.table_alt_color);
    const redHeaderRgb: [number, number, number] = [139, 26, 26]; // #8B1A1A

    const companyName = settings?.business_name || "Company";
    const companyAddress = settings?.business_address || "";
    const companyPhone = settings?.business_phone || "";
    const companyRgi = settings?.rgi_number || "";
    const engineerName = engineer?.name || "";
    const engineerRgi = engineer?.rgi_number || companyRgi;

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

    // ─── HEADER ───
    doc.setFillColor(...primaryRgb);
    doc.roundedRect(margin, y, contentW, 22, 2, 2, "F");
    addText("RGI", margin + 5, y + 9, { size: 9, bold: true, color: headerTextRgb });
    addText("Hazard", margin + 5, y + 14, { size: 9, bold: true, color: headerTextRgb });
    addText("RGI · Notification of Hazard", margin + 25, y + 9, { size: 14, bold: true, color: headerTextRgb });
    addText("Safe Energy Ireland", margin + 25, y + 15, { size: 9, color: [200, 200, 200] });
    addText(hazard.ref_number || "", pageW - margin - 3, y + 10, { size: 12, bold: true, color: accentRgb, align: "right" });
    const dateStr = new Date(hazard.created_at).toLocaleDateString("en-IE", { day: "2-digit", month: "long", year: "numeric" });
    addText(`Issued: ${dateStr}`, pageW - margin - 3, y + 17, { size: 9, color: [200, 200, 200], align: "right" });
    y += 28;

    const sectionTitle = (title: string, bgColor: [number, number, number] = primaryRgb) => {
      checkNewPage(12);
      doc.setFillColor(...bgColor);
      doc.rect(margin, y, contentW, 7, "F");
      addText(title, margin + 3, y + 5, { size: 10, bold: true, color: headerTextRgb });
      y += 10;
    };

    const fieldPair = (label: string, value: string, x: number) => {
      addText(label, x, y, { size: 8, color: [136, 136, 136] });
      y += 3.5;
      addText(value || "—", x, y, { size: 10, bold: true });
      y += 5.5;
    };

    // ─── COMPANY DETAILS ───
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

    // ─── PROPERTY DETAILS ───
    sectionTitle("PROPERTY DETAILS");
    const py = y;
    fieldPair("Customer", customer?.name || "", margin + 2);
    fieldPair("Address", customer?.address || "", margin + 2);
    fieldPair("Eircode", customer?.eircode || "", margin + 2);
    if (customer?.gprn) fieldPair("GPRN", customer.gprn, margin + 2);
    fieldPair("Contact", customer?.phone || "", margin + 2);
    const pLeftEnd = y;
    y = py;
    fieldPair("Gas Type", hazard.gas_type === "lpg" ? "LPG" : "Natural Gas", margin + contentW / 2);
    fieldPair("Gas Supplier", hazard.gas_supplier || "—", margin + contentW / 2);
    y = Math.max(pLeftEnd, y) + 2;

    // ─── HAZARD TYPE ───
    sectionTitle("HAZARD TYPE");
    const hazardTypes = (hazard.hazard_types || []) as string[];
    for (const code of ["A", "B", "C"]) {
      checkNewPage(10);
      const selected = hazardTypes.includes(code);
      const ht = HAZARD_LABELS[code];
      const rowBg: [number, number, number] = selected ? [254, 226, 226] : [248, 250, 252];
      doc.setFillColor(...rowBg);
      doc.rect(margin, y - 2, contentW, 9, "F");
      doc.setDrawColor(...borderRgb);
      doc.line(margin, y + 7, margin + contentW, y + 7);
      // Badge
      if (selected) {
        doc.setFillColor(220, 38, 38);
      } else {
        doc.setFillColor(200, 200, 200);
      }
      doc.circle(margin + 6, y + 2.5, 3, "F");
      addText(code, margin + 6, y + 3.5, { size: 8, bold: true, color: [255, 255, 255], align: "center" });
      addText(`${code} — ${ht.title}`, margin + 12, y + 2, { size: 10, bold: true, color: selected ? [220, 38, 38] : bodyTextRgb });
      addText(ht.desc, margin + 12, y + 6, { size: 8, color: [136, 136, 136] });
      y += 10;
    }
    y += 2;

    // ─── APPLIANCE DETAILS ───
    sectionTitle("APPLIANCE DETAILS");
    const ay = y;
    fieldPair("Appliance", hazard.appliance || "", margin + 2);
    fieldPair("Make", hazard.make || "", margin + 2);
    const aLeftEnd = y;
    y = ay;
    fieldPair("Model", hazard.model || "", margin + contentW / 2);
    fieldPair("Location", hazard.location || "", margin + contentW / 2);
    y = Math.max(aLeftEnd, y) + 2;

    if (hazard.appliance_notes) {
      checkNewPage(14);
      addText("Appliance Notes", margin + 2, y, { size: 8, color: [136, 136, 136] });
      y += 3.5;
      const notesH = addText(hazard.appliance_notes, margin + 2, y, { size: 10, bold: true, maxWidth: contentW - 4 });
      y += notesH + 4;
    }

    // ─── ISOLATION DETAILS (only if C selected) ───
    if (hazardTypes.includes("C")) {
      sectionTitle("ISOLATION DETAILS", redHeaderRgb);
      fieldPair("Reasons for Isolation", hazard.isolation_reasons || "", margin + 2);
      const iy = y;
      fieldPair("Pressure Test / Gas Leakage", hazard.pressure_reading || "", margin + 2);
      fieldPair("Meter Number", hazard.meter_number || "", margin + 2);
      const iLeftEnd = y;
      y = iy;
      fieldPair("Meter Reading", hazard.meter_reading || "", margin + contentW / 2);
      fieldPair("Gas Isolated to Premises", hazard.gas_isolated_to_premises === true ? "Yes" : hazard.gas_isolated_to_premises === false ? "No" : "—", margin + contentW / 2);
      y = Math.max(iLeftEnd, y);
      if (hazard.isolation_notes) {
        fieldPair("Other Notes", hazard.isolation_notes, margin + 2);
      }
      y += 2;
    }

    // ─── DECLARATION ───
    checkNewPage(30);
    doc.setFillColor(...tableAltRgb);
    doc.roundedRect(margin, y, contentW, 22, 2, 2, "F");
    doc.setDrawColor(...borderRgb);
    doc.roundedRect(margin, y, contentW, 22, 2, 2, "S");
    addText("Declaration:", margin + 4, y + 5, { size: 8, bold: true, color: [68, 68, 68] });
    addText(
      "This notification is issued in the interest of safety of this premise and the persons therein. The gas supply/appliance shall only be restored by a Registered Gas Installer (RGI) in accordance with I.S.813, I.S.820 or I.S. EN 1949.",
      margin + 4, y + 9, { size: 7, color: [68, 68, 68], maxWidth: contentW - 8 }
    );
    y += 26;

    // ─── FOOTER ───
    const footerH = companyAddress ? 10 : 5;
    const footerTopY = 297 - margin - footerH;
    doc.setFillColor(...primaryRgb);
    doc.rect(margin, footerTopY, contentW, footerH, "F");
    addText(`${companyName}  •  RGI: ${companyRgi}  •  ${companyPhone}`, margin + 4, footerTopY + (companyAddress ? 4 : 3.5), { size: 8, color: headerTextRgb });
    if (companyAddress) {
      const fadedRgb: [number, number, number] = [
        Math.round(headerTextRgb[0] * 0.7 + primaryRgb[0] * 0.3),
        Math.round(headerTextRgb[1] * 0.7 + primaryRgb[1] * 0.3),
        Math.round(headerTextRgb[2] * 0.7 + primaryRgb[2] * 0.3),
      ];
      addText(companyAddress.replace(/\n/g, ", "), margin + 4, footerTopY + 8.5, { size: 7, color: fadedRgb, maxWidth: contentW - 8 });
    }

    // ─── SIGNATURES ───
    const sigBlockH = 36;
    const desiredGap = 10;
    const availableSpace = footerTopY - y - 2;
    const sigGap = Math.min(desiredGap, Math.max(0, availableSpace - sigBlockH));
    y += sigGap;
    checkNewPage(sigBlockH);
    const sigW = (contentW - 10) / 2;

    if (hazard.customer_sig_url && hazard.customer_sig_url.startsWith("data:")) {
      try { doc.addImage(hazard.customer_sig_url, "PNG", margin + 2, y, sigW - 4, 20); } catch { /* skip */ }
    }
    doc.setDrawColor(51, 51, 51);
    doc.line(margin + 2, y + 22, margin + sigW - 2, y + 22);
    addText("Customer Signature", margin + sigW / 2, y + 27, { size: 8, color: [102, 102, 102], align: "center" });

    const engX = margin + sigW + 10;
    if (hazard.engineer_sig_url && hazard.engineer_sig_url.startsWith("data:")) {
      try { doc.addImage(hazard.engineer_sig_url, "PNG", engX, y, sigW - 4, 20); } catch { /* skip */ }
    }
    doc.line(engX, y + 22, engX + sigW - 4, y + 22);
    addText("Engineer Signature", engX + (sigW - 4) / 2, y + 27, { size: 8, color: [102, 102, 102], align: "center" });
    addText(`${engineerName} — RGI: ${engineerRgi}`, engX + (sigW - 4) / 2, y + 31, { size: 7, color: [102, 102, 102], align: "center" });

    // ─── OUTPUT ───
    const pdfOutput = doc.output("arraybuffer");
    const pdfBytes = new Uint8Array(pdfOutput);
    if (!hazard.organisation_id) {
      return new Response(JSON.stringify({ error: "Hazard notification missing organisation_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const fileName = `${hazard.ref_number}.pdf`;
    const storagePath = `${hazard.organisation_id}/${fileName}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("certificates")
      .upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: true });

    if (uploadError) {
      return new Response(JSON.stringify({ error: "Failed to upload PDF" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabaseAdmin.from("hazard_notifications").update({ pdf_url: storagePath }).eq("id", hazard_id);

    return new Response(JSON.stringify({ pdf_url: storagePath }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("generate-hazard-pdf error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
