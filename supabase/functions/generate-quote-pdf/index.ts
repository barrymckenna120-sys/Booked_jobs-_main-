import { createClient } from "npm:@supabase/supabase-js@2";
import { jsPDF } from "https://esm.sh/jspdf@2.5.2";
import { getTenantPublicUrl } from "../_shared/tenantDomain.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// ── Brand defaults & helpers ────────────────────────────────────────────────
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

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { quote_id } = await req.json();
    if (!quote_id) {
      return new Response(JSON.stringify({ error: "quote_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ── Fetch data ──────────────────────────────────────
    const { data: quote, error: qErr } = await sb
      .from("quotes")
      .select("*, customers!inner(name, phone, email, address, eircode)")
      .eq("id", quote_id)
      .single();

    if (qErr || !quote) {
      return new Response(JSON.stringify({ error: "Quote not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [lineItemsRes, settingsRes, brandRes] = await Promise.all([
      sb.from("quote_line_items").select("*").eq("quote_id", quote_id).order("sort_order"),
      sb.from("settings").select("*").eq("organisation_id", quote.organisation_id).single(),
      sb.from("brand_settings").select("*").eq("organisation_id", quote.organisation_id).maybeSingle(),
    ]);

    const items = lineItemsRes.data || [];
    const cust = (quote as any).customers;
    const biz = settingsRes.data || {} as any;
    const brand = mergeBrand(brandRes.data);

    // ── Fetch logo ──────────────────────────────────────
    let logoDataUrl: string | null = null;
    if (biz.logo_url) {
      try {
        const resp = await fetch(biz.logo_url);
        if (resp.ok) {
          const bytes = new Uint8Array(await resp.arrayBuffer());
          let bin = ""; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
          logoDataUrl = `data:${resp.headers.get("content-type") || "image/png"};base64,${btoa(bin)}`;
        }
      } catch { /* ignore */ }
    }

    // ── Brand-driven colours ────────────────────────────
    const primaryRgb = hexToRgb(brand.primary_color);
    const secondaryRgb = hexToRgb(brand.secondary_color);
    const accentRgb = hexToRgb(brand.accent_color);
    const headerTextRgb = hexToRgb(brand.header_text_color);
    const bodyTextRgb = hexToRgb(brand.body_text_color);
    const sectionLabelRgb = hexToRgb(brand.section_label_color);
    const borderRgb = hexToRgb(brand.border_color);
    const tableHeaderRgb = hexToRgb(brand.table_header_color);
    const tableRowRgb = hexToRgb(brand.table_row_color);
    const tableAltRgb = hexToRgb(brand.table_alt_color);

    const PW = 210;
    const PH = 297;
    const M = 18;
    const CW = PW - M * 2;
    const green   = "#16a34a";
    const white   = "#ffffff";

    const headerBlue = brand.primary_color;
    const dark    = brand.body_text_color;
    const grey    = "#64748b";
    const lightBg = "#f8fafc";
    const lightBlue = brand.table_header_color;
    const border  = brand.border_color;
    const altRow  = brand.table_alt_color;

    const eur = (v: number) => {
      const abs = Math.abs(v);
      const parts = abs.toFixed(2).split(".");
      const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      return `\u20AC${intPart}.${parts[1]}`;
    };

    const fmtDate = (d: string) => {
      const dt = new Date(d);
      return dt.toLocaleDateString("en-IE", { day: "2-digit", month: "long", year: "numeric" });
    };

    const doc = new jsPDF({ unit: "mm", format: "a4" });

    const drawLine = (yy: number) => { doc.setDrawColor(border); doc.setLineWidth(0.3); doc.line(M, yy, PW - M, yy); };
    const ensureSpace = (need: number, yRef: { y: number }) => {
      if (yRef.y + need > 280) { doc.addPage(); yRef.y = M; }
    };

    const qNum = quote.quote_number || `Q-${quote.id.slice(0, 8).toUpperCase()}`;

    let y = 0;

    // ═══════════════════════════════════════════════════
    // PAGE 1 — HEADER BAR
    // ═══════════════════════════════════════════════════
    const headerH = 28;
    doc.setFillColor(...primaryRgb);
    doc.rect(0, 0, PW, headerH, "F");

    // Left: Company name + address
    let nameX = M;
    if (logoDataUrl) {
      try { doc.addImage(logoDataUrl, "PNG", M, 5, 16, 16); nameX = M + 20; } catch { /* ignore */ }
    }
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...headerTextRgb);
    doc.text(biz.business_name || "Quote", nameX, 12);

    if (biz.business_address) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      // Blend header text toward primary for muted appearance (GState not reliable in Deno)
      const fadedHdr: [number, number, number] = [
        Math.round(headerTextRgb[0] * 0.7 + primaryRgb[0] * 0.3),
        Math.round(headerTextRgb[1] * 0.7 + primaryRgb[1] * 0.3),
        Math.round(headerTextRgb[2] * 0.7 + primaryRgb[2] * 0.3),
      ];
      doc.setTextColor(...fadedHdr);
      const addrLine = biz.business_address.replace(/\n/g, ", ");
      doc.text(addrLine, nameX, 17);
    }

    // Right: Quote No, Date, Valid Until
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...headerTextRgb);
    doc.text(qNum, PW - M, 11, { align: "right" });

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor("#c7d2fe");
    doc.text(`Date: ${fmtDate(quote.created_at)}`, PW - M, 17, { align: "right" });

    if (quote.expiry_date) {
      doc.text(`Valid Until: ${fmtDate(quote.expiry_date)}`, PW - M, 23, { align: "right" });
    }

    y = headerH + 5;

    // ═══════════════════════════════════════════════════
    // COMPANY DETAILS (below header) — compact single block
    // ═══════════════════════════════════════════════════
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...bodyTextRgb);
    doc.text(biz.business_name || "", M, y);

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(grey);
    const compactDetails: string[] = [];
    if (biz.business_address) compactDetails.push(biz.business_address.replace(/\n/g, ", "));
    if (biz.business_phone) compactDetails.push(`Tel: ${biz.business_phone}`);
    if (biz.rgi_number) compactDetails.push(`RGI: ${biz.rgi_number}`);
    const detailLines = doc.splitTextToSize(compactDetails.join("  |  "), CW);
    doc.text(detailLines, M, y + 4);
    y += 4 + detailLines.length * 3.5 + 3;

    drawLine(y); y += 4;

    // ═══════════════════════════════════════════════════
    // QUOTE FOR BLOCK
    // ═══════════════════════════════════════════════════
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...sectionLabelRgb);
    doc.text("QUOTE PREPARED FOR", M, y);
    y += 4;

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...bodyTextRgb);
    doc.text(cust.name, M, y);
    y += 4.5;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(grey);
    if (cust.address) { doc.text(cust.address, M, y); y += 3.5; }
    if (cust.eircode) { doc.text(cust.eircode, M, y); y += 3.5; }
    if (cust.phone) { doc.text(`Mobile: ${cust.phone}`, M, y); y += 3.5; }

    y += 3;
    drawLine(y); y += 4;

    // ═══════════════════════════════════════════════════
    // JOB SUMMARY BLOCK
    // ═══════════════════════════════════════════════════
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...sectionLabelRgb);
    doc.text("JOB SUMMARY", M, y);
    y += 4;

    if (quote.job_type && quote.job_type !== "other") {
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...bodyTextRgb);
      doc.text(quote.job_type.replace(/_/g, " "), M, y);
      y += 4;
    }

    if (quote.description) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...bodyTextRgb);
      const descLines = doc.splitTextToSize(quote.description, CW);
      doc.text(descLines, M, y);
      y += descLines.length * 3.5 + 1;
    }

    y += 3;
    drawLine(y); y += 4;

    // ═══════════════════════════════════════════════════
    // PRICING TABLE
    // ═══════════════════════════════════════════════════
    if (items.length > 0) {
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...sectionLabelRgb);
      doc.text("PRICING", M, y);
      y += 5;

      // Header row
      doc.setFillColor(...primaryRgb);
      doc.rect(M, y, CW, 8, "F");
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...headerTextRgb);
      doc.text("#", M + 3, y + 5.5);
      doc.text("DESCRIPTION", M + 14, y + 5.5);
      doc.text("QTY", M + CW - 55, y + 5.5, { align: "right" });
      doc.text("PRICE", M + CW - 25, y + 5.5, { align: "right" });
      doc.text("TOTAL", M + CW - 3, y + 5.5, { align: "right" });
      y += 8;

      items.forEach((item: any, idx: number) => {
        const ref = { y };
        ensureSpace(10, ref);
        y = ref.y;

        const rowH = 8;
        const rowBg = idx % 2 === 0 ? tableAltRgb : tableRowRgb;
        doc.setFillColor(...rowBg);
        doc.rect(M, y, CW, rowH, "F");

        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(grey);
        doc.text(`${idx + 1}`, M + 3, y + 5.5);

        doc.setTextColor(...bodyTextRgb);
        const descTrunc = doc.splitTextToSize(item.description || "", CW - 80);
        doc.text(descTrunc[0] || "", M + 14, y + 5.5);

        doc.setTextColor(grey);
        doc.text(`${item.qty}`, M + CW - 55, y + 5.5, { align: "right" });
        doc.text(eur(Number(item.unit_price)), M + CW - 25, y + 5.5, { align: "right" });

        doc.setFont("helvetica", "bold");
        doc.setTextColor(...bodyTextRgb);
        doc.text(eur(Number(item.line_total || 0)), M + CW - 3, y + 5.5, { align: "right" });
        y += rowH;
      });

      drawLine(y); y += 6;
    }

    // ── Totals calculation ──
    const subtotal = items.length > 0
      ? items.reduce((s: number, li: any) => s + Number(li.line_total || 0), 0)
      : Number(quote.total_amount || 0);
    const disc = Number(quote.discount || 0);
    const afterDisc = Math.max(subtotal - disc, 0);
    const vatAmt = quote.vat_enabled ? afterDisc * 0.23 : 0;
    const total = Math.max(afterDisc + vatAmt, 0);
    const deposit = Number(quote.deposit_amount || quote.deposit || 0);
    const balance = Math.max(total - deposit, 0);

    // ── Totals block (right-aligned) ──
    const tLabelX = M + CW - 80;
    const tValueX = M + CW - 3;

    const totLine = (label: string, value: string, opts?: { bold?: boolean; color?: string; size?: number }) => {
      const ref = { y };
      ensureSpace(8, ref);
      y = ref.y;
      doc.setFontSize(opts?.size || 9);
      doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
      doc.setTextColor(opts?.color || grey);
      doc.text(label, tLabelX, y);
      doc.setTextColor(...bodyTextRgb);
      doc.text(value, tValueX, y, { align: "right" });
      y += 5;
    };

    totLine("Subtotal", eur(subtotal));
    if (disc > 0) totLine("Special Offer Applied", `-${eur(disc)}`, { color: green });
    if (quote.vat_enabled) totLine("VAT 23%", eur(vatAmt));

    drawLine(y - 1); y += 3;

    // Grand total
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...primaryRgb);
    doc.text("TOTAL", tLabelX, y);
    doc.text(eur(total), tValueX, y, { align: "right" });
    y += 6;

    if (deposit > 0) {
      totLine("Deposit", `-${eur(deposit)}`, { bold: true });
      totLine("Balance Due", eur(balance), { bold: true, size: 11 });
    }

    // "No hidden costs" text
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(grey);
    doc.text("No hidden costs. Fixed price.", tLabelX, y);
    y += 5;

    drawLine(y); y += 5;

    // ═══════════════════════════════════════════════════
    // WHAT'S INCLUDED (only for installation/replacement)
    // ═══════════════════════════════════════════════════
    const jobTypeLower = (quote.job_type || "").toLowerCase();
    const isInstallation = jobTypeLower.includes("install") || jobTypeLower.includes("replacement") || jobTypeLower.includes("boiler_replacement");

    if (isInstallation) {
      const ref = { y };
      ensureSpace(26, ref);
      y = ref.y;

      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...sectionLabelRgb);
      doc.text("WHAT'S INCLUDED", M, y);
      y += 5;

      const inclItems = [
        "Full installation",
        "System testing & commissioning",
        "Old unit removal",
        "Clean-up included",
      ];
      doc.setFontSize(9);
      inclItems.forEach((item) => {
        doc.setFillColor(green);
        doc.circle(M + 3.5, y - 1.2, 1.8, "F");
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(white);
        doc.text("Y", M + 2.5, y);
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...bodyTextRgb);
        doc.text(item, M + 9, y);
        y += 4.5;
      });

      y += 2;
      drawLine(y); y += 5;
    }

    // ═══════════════════════════════════════════════════
    // PAYMENT TERMS BOX
    // ═══════════════════════════════════════════════════
    {
      const ref = { y };
      ensureSpace(28, ref);
      y = ref.y;

      const ptLines: string[] = [];
      if (deposit > 0) ptLines.push(`Deposit to secure booking: ${eur(deposit)}`);
      ptLines.push("Balance due: On completion");
      ptLines.push("Install window: 3-5 working days");

      const boxH = 8 + ptLines.length * 4.5;
      doc.setFillColor(...tableHeaderRgb);
      doc.roundedRect(M, y, CW, boxH, 2, 2, "F");

      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...primaryRgb);
      doc.text("PAYMENT TERMS", M + 5, y + 5);

      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...bodyTextRgb);
      let py = y + 10;
      ptLines.forEach((line) => {
        doc.text(`• ${line}`, M + 5, py);
        py += 4.5;
      });

      y += boxH + 5;
    }

    // ═══════════════════════════════════════════════════
    // NOTES BLOCK
    // ═══════════════════════════════════════════════════
    if (quote.notes) {
      const ref = { y };
      ensureSpace(12, ref);
      y = ref.y;

      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...sectionLabelRgb);
      doc.text("NOTES", M, y);
      y += 4;

      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...bodyTextRgb);
      const nLines = doc.splitTextToSize(quote.notes, CW);
      doc.text(nLines, M, y);
      y += nLines.length * 3.5 + 4;
    }

    // ═══════════════════════════════════════════════════
    // TERMS & CONDITIONS BLOCK
    // ═══════════════════════════════════════════════════
    if (quote.terms) {
      const ref = { y };
      ensureSpace(12, ref);
      y = ref.y;

      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...sectionLabelRgb);
      doc.text("TERMS & CONDITIONS", M, y);
      y += 4;

      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(grey);
      const tLines = doc.splitTextToSize(quote.terms, CW);
      doc.text(tLines, M, y);
      y += tLines.length * 3 + 4;
    }

    // ── Page 1 footer ──
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(grey);
    const footerParts1 = [];
    if (biz.rgi_number) footerParts1.push(`RGI Registered (${biz.rgi_number})`);
    footerParts1.push("Fully Insured");
    doc.text(footerParts1.join("  |  "), PW / 2, 285, { align: "center" });
    if (biz.business_address) {
      doc.text(biz.business_address.replace(/\n/g, ", "), PW / 2, 289, { align: "center" });
    }

    // ═══════════════════════════════════════════════════
    // PAGE 2 — CTA + WhatsApp
    // ═══════════════════════════════════════════════════
    doc.addPage();
    y = M;

    // Dark CTA block
    doc.setFillColor(...primaryRgb);
    doc.roundedRect(M, y, CW, 50, 3, 3, "F");

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...headerTextRgb);
    doc.text("Accept This Quote", M + CW / 2, y + 14, { align: "center" });

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor("#c7d2fe");
    const ctaLines = doc.splitTextToSize(
      "Approve the job, pay the deposit, and confirm your installation slot.",
      CW - 20
    );
    doc.text(ctaLines, M + CW / 2, y + 22, { align: "center" });

    // Accept URL — tenant public domain + access_token (fail-closed: omit link if either missing)
    const acceptUrl =
      (quote as any).access_token && (quote as any).organisation_id
        ? await getTenantPublicUrl(
            Deno.env.get("SUPABASE_URL")!,
            (quote as any).organisation_id,
            `/quote/${(quote as any).access_token}`,
          )
        : null;
    if (acceptUrl) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...headerTextRgb);
      doc.text(acceptUrl, M + CW / 2, y + 38, { align: "center" });
    }

    y += 60;

    // WhatsApp message block
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(grey);
    doc.text("WHATSAPP MESSAGE VERSION", M, y);
    y += 6;

    const firstName = cust.name.split(" ")[0];
    const waMsg = [
      `Hi ${firstName},`,
      "",
      `Here is your quote for ${quote.description || "your job"}.`,
      "",
      `Quote No: ${qNum}`,
      `Total: ${eur(total)}`,
      deposit > 0 ? `Deposit to secure booking: ${eur(deposit)}` : "",
      "",
      `To accept this quote, reply: YES ${qNum}`,
      "",
      acceptUrl ? `Or view and approve online:` : "",
      acceptUrl || "",
    ].filter((l) => l !== undefined && l !== "").join("\n");

    const waLines = doc.splitTextToSize(waMsg, CW - 16);
    const waBlockH = waLines.length * 4 + 12;
    doc.setFillColor(lightBg);
    doc.roundedRect(M, y, CW, waBlockH, 2, 2, "F");

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...bodyTextRgb);
    doc.text(waLines, M + 8, y + 8);

    y += waBlockH + 10;

    // ── Page 2 footer ──
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(grey);
    const footerParts2 = [];
    if (biz.rgi_number) footerParts2.push(`RGI Registered (${biz.rgi_number})`);
    footerParts2.push("Fully Insured");
    doc.text(footerParts2.join("  |  "), PW / 2, 285, { align: "center" });
    if (biz.business_address) {
      doc.text(biz.business_address.replace(/\n/g, ", "), PW / 2, 289, { align: "center" });
    }

    // ── Output & Upload ─────────────────────────────────
    const pdfBytes = new Uint8Array(doc.output("arraybuffer"));
    if (!quote.organisation_id) {
      return new Response(JSON.stringify({ error: "Quote missing organisation_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const fileName = `quote-${qNum.replace(/\s/g, "")}.pdf`;
    const storagePath = `${quote.organisation_id}/${fileName}`;

    const { error: uploadErr } = await sb.storage
      .from("quote-pdfs")
      .upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: true });

    if (uploadErr) {
      console.error("Upload error:", uploadErr);
      return new Response(JSON.stringify({ error: "Failed to upload PDF" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Store the raw object path — bucket flips private in Stage 2 and
    // signed URLs are minted on demand by resolve-document-link.
    await sb.from("quotes").update({ pdf_url: storagePath }).eq("id", quote_id);

    return new Response(JSON.stringify({ success: true, pdf_url: storagePath }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("PDF generation error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
