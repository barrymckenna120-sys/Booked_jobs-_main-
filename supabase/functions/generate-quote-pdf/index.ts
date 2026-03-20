import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { jsPDF } from "https://esm.sh/jspdf@2.5.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { quote_id } = await req.json();
    if (!quote_id) {
      return new Response(JSON.stringify({ error: "quote_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Fetch quote with customer
    const { data: quote, error: qErr } = await sb
      .from("quotes")
      .select("*, customers!inner(name, phone, email, address, eircode)")
      .eq("id", quote_id)
      .single();

    if (qErr || !quote) {
      return new Response(JSON.stringify({ error: "Quote not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch line items
    const { data: lineItems } = await sb
      .from("quote_line_items")
      .select("*")
      .eq("quote_id", quote_id)
      .order("sort_order");

    // Fetch business settings
    const { data: settings } = await sb
      .from("settings")
      .select("*")
      .eq("user_id", quote.user_id)
      .single();

    const items = lineItems || [];
    const customer = (quote as any).customers;
    const biz = settings || {} as any;

    // ── Build PDF ──
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pw = 210; // page width
    const margin = 18;
    const contentW = pw - margin * 2;
    let y = margin;

    const grey = "#64748b";
    const dark = "#0f172a";
    const primary = "#2563eb";
    const lightBg = "#f8fafc";
    const borderCol = "#e2e8f0";

    // ── Helper functions ──
    const drawLine = (yPos: number) => {
      doc.setDrawColor(borderCol);
      doc.setLineWidth(0.3);
      doc.line(margin, yPos, pw - margin, yPos);
    };

    const euro = (v: number) => `€${v.toFixed(2)}`;

    // ── Header ──
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(dark);
    doc.text(biz.business_name || "Quote", margin, y + 7);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(grey);
    const headerRight: string[] = [];
    if (biz.business_phone) headerRight.push(biz.business_phone);
    if (biz.business_email) headerRight.push(biz.business_email);
    if (biz.website) headerRight.push(biz.website);
    headerRight.forEach((line, i) => {
      doc.text(line, pw - margin, y + 2 + i * 4, { align: "right" });
    });

    y += 16;
    if (biz.business_address) {
      doc.setFontSize(8);
      doc.setTextColor(grey);
      doc.text(biz.business_address, margin, y);
      y += 5;
    }
    if (biz.vat_number) {
      doc.text(`VAT: ${biz.vat_number}`, margin, y);
      y += 5;
    }

    y += 4;
    drawLine(y);
    y += 8;

    // ── Quote title & ref ──
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(primary);
    doc.text("QUOTE", margin, y);

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(dark);
    doc.text(quote.quote_number || `Q-${quote.id.slice(0, 4).toUpperCase()}`, pw - margin, y, { align: "right" });
    y += 10;

    // ── Two-column: Customer & Quote Details ──
    const colW = contentW / 2 - 4;

    // Customer box
    doc.setFillColor(lightBg);
    doc.roundedRect(margin, y, colW, 30, 2, 2, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(grey);
    doc.text("BILL TO", margin + 4, y + 5);

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(dark);
    doc.text(customer.name, margin + 4, y + 11);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(grey);
    let cy = y + 16;
    if (customer.address) { doc.text(customer.address, margin + 4, cy); cy += 4; }
    if (customer.eircode) { doc.text(customer.eircode, margin + 4, cy); cy += 4; }
    if (customer.phone) { doc.text(customer.phone, margin + 4, cy); cy += 4; }
    if (customer.email) { doc.text(customer.email, margin + 4, cy); }

    // Details box
    const detailX = margin + colW + 8;
    doc.setFillColor(lightBg);
    doc.roundedRect(detailX, y, colW, 30, 2, 2, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(grey);
    doc.text("QUOTE DETAILS", detailX + 4, y + 5);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    let dy = y + 11;
    const addDetail = (label: string, value: string) => {
      doc.setTextColor(grey);
      doc.text(label, detailX + 4, dy);
      doc.setTextColor(dark);
      doc.setFont("helvetica", "bold");
      doc.text(value, detailX + colW - 4, dy, { align: "right" });
      doc.setFont("helvetica", "normal");
      dy += 5;
    };

    addDetail("Date:", new Date(quote.created_at).toLocaleDateString("en-IE", { day: "2-digit", month: "short", year: "numeric" }));
    if (quote.expiry_date) {
      addDetail("Expires:", new Date(quote.expiry_date).toLocaleDateString("en-IE", { day: "2-digit", month: "short", year: "numeric" }));
    }
    if (quote.job_type && quote.job_type !== "other") {
      addDetail("Job Type:", quote.job_type);
    }
    addDetail("Status:", quote.status);

    y += 38;

    // ── Description ──
    if (quote.description) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(dark);
      doc.text("Description", margin, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(grey);
      const descLines = doc.splitTextToSize(quote.description, contentW);
      doc.text(descLines, margin, y);
      y += descLines.length * 4 + 4;
    }

    // ── Line Items Table ──
    if (items.length > 0) {
      // Table header
      doc.setFillColor("#1e293b");
      doc.rect(margin, y, contentW, 8, "F");
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor("#ffffff");
      doc.text("#", margin + 3, y + 5.5);
      doc.text("DESCRIPTION", margin + 12, y + 5.5);
      doc.text("QTY", margin + contentW - 55, y + 5.5, { align: "right" });
      doc.text("UNIT PRICE", margin + contentW - 25, y + 5.5, { align: "right" });
      doc.text("TOTAL", margin + contentW - 3, y + 5.5, { align: "right" });
      y += 8;

      // Table rows
      items.forEach((item: any, idx: number) => {
        if (y > 265) {
          doc.addPage();
          y = margin;
        }
        const rowH = 8;
        if (idx % 2 === 0) {
          doc.setFillColor(lightBg);
          doc.rect(margin, y, contentW, rowH, "F");
        }
        doc.setFontSize(8);
        doc.setTextColor(grey);
        doc.setFont("helvetica", "normal");
        doc.text(`${idx + 1}`, margin + 3, y + 5.5);

        doc.setTextColor(dark);
        doc.setFont("helvetica", "normal");
        const desc = doc.splitTextToSize(item.description || "", contentW - 80);
        doc.text(desc[0] || "", margin + 12, y + 5.5);

        doc.setTextColor(grey);
        doc.text(`${item.qty}`, margin + contentW - 55, y + 5.5, { align: "right" });
        doc.text(euro(Number(item.unit_price)), margin + contentW - 25, y + 5.5, { align: "right" });
        doc.setFont("helvetica", "bold");
        doc.setTextColor(dark);
        doc.text(euro(Number(item.line_total || 0)), margin + contentW - 3, y + 5.5, { align: "right" });
        y += rowH;
      });

      drawLine(y);
      y += 6;
    }

    // ── Totals ──
    const subtotal = items.reduce((s: number, li: any) => s + Number(li.line_total || 0), 0);
    const discountVal = Number(quote.discount || 0);
    const afterDiscount = Math.max(subtotal - discountVal, 0);
    const vatAmt = quote.vat_enabled ? afterDiscount * 0.23 : 0;
    const total = Math.max(afterDiscount + vatAmt, 0);
    const depositVal = Number(quote.deposit || 0);
    const balance = Math.max(total - depositVal, 0);

    const totalsX = margin + contentW - 70;
    const totalsValX = margin + contentW - 3;

    const addTotalLine = (label: string, value: string, bold = false) => {
      doc.setFontSize(9);
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setTextColor(bold ? dark : grey);
      doc.text(label, totalsX, y);
      doc.setTextColor(dark);
      doc.text(value, totalsValX, y, { align: "right" });
      y += 6;
    };

    addTotalLine("Subtotal", euro(subtotal));
    if (discountVal > 0) addTotalLine("Discount", `−${euro(discountVal)}`);
    if (quote.vat_enabled) addTotalLine("VAT 23%", euro(vatAmt));

    drawLine(y - 2);
    y += 3;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(primary);
    doc.text("TOTAL", totalsX, y);
    doc.text(euro(total), totalsValX, y, { align: "right" });
    y += 8;

    if (depositVal > 0) {
      addTotalLine("Deposit", euro(depositVal));
      doc.setFont("helvetica", "bold");
      addTotalLine("Balance Due", euro(balance), true);
    }

    y += 6;

    // ── Notes & Terms ──
    if (quote.notes) {
      if (y > 250) { doc.addPage(); y = margin; }
      doc.setFillColor(lightBg);
      doc.roundedRect(margin, y, contentW, 4, 1, 1, "F");
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(grey);
      doc.text("NOTES", margin + 4, y + 3);
      y += 7;
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(dark);
      const noteLines = doc.splitTextToSize(quote.notes, contentW - 8);
      doc.text(noteLines, margin + 4, y);
      y += noteLines.length * 4 + 6;
    }

    if (quote.terms) {
      if (y > 250) { doc.addPage(); y = margin; }
      doc.setFillColor(lightBg);
      doc.roundedRect(margin, y, contentW, 4, 1, 1, "F");
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(grey);
      doc.text("TERMS & CONDITIONS", margin + 4, y + 3);
      y += 7;
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(dark);
      const termLines = doc.splitTextToSize(quote.terms, contentW - 8);
      doc.text(termLines, margin + 4, y);
      y += termLines.length * 4 + 6;
    }

    // ── Footer ──
    const footerY = 285;
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(grey);
    doc.text(
      `${biz.business_name || ""}${biz.business_phone ? " · " + biz.business_phone : ""}${biz.business_email ? " · " + biz.business_email : ""}`,
      pw / 2,
      footerY,
      { align: "center" }
    );

    // ── Output PDF ──
    const pdfOutput = doc.output("arraybuffer");
    const pdfBytes = new Uint8Array(pdfOutput);

    const fileName = `quote-${quote.quote_number || quote.id.slice(0, 8)}.pdf`;
    const storagePath = `quotes/${quote.user_id}/${fileName}`;

    // Upload to storage
    const { error: uploadErr } = await sb.storage
      .from("business-logos") // reuse public bucket
      .upload(storagePath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadErr) {
      console.error("Upload error:", uploadErr);
      return new Response(JSON.stringify({ error: "Failed to upload PDF" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: urlData } = sb.storage.from("business-logos").getPublicUrl(storagePath);
    const publicUrl = urlData.publicUrl;

    // Save URL to quote
    await sb.from("quotes").update({ pdf_url: publicUrl }).eq("id", quote_id);

    return new Response(JSON.stringify({ success: true, pdf_url: publicUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("PDF generation error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
