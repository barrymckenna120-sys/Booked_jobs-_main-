import { createClient } from "npm:@supabase/supabase-js@2";
import { jsPDF } from "https://esm.sh/jspdf@2.5.2";
import { getWhatsAppConfig, normalisePhone, logWhatsAppFailure } from "../_shared/whatsapp.ts";
import { isDenied, requireResourceOrgAccess } from "../_shared/orgAuth.ts";
import {
  requireCustomerMessagingConsent,
} from "../_shared/messagingConsent.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-org-id, x-org-impersonation-token, x-make-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface BrandColors {
  primary_color: string; secondary_color: string; accent_color: string;
  background_color: string; header_text_color: string; body_text_color: string;
  section_label_color: string; border_color: string; table_header_color: string;
  table_row_color: string; table_alt_color: string; font_family: string;
}

const BRAND_DEFAULTS: BrandColors = {
  primary_color: "#1E3A5F", secondary_color: "#2C4F7C", accent_color: "#4A86E8",
  background_color: "#FFFFFF", header_text_color: "#FFFFFF", body_text_color: "#1F2937",
  section_label_color: "#1E3A5F", border_color: "#E2E8F0", table_header_color: "#EBF2FF",
  table_row_color: "#FFFFFF", table_alt_color: "#F8FAFF", font_family: "Poppins",
};

function mergeBrand(row: any): BrandColors {
  if (!row) return { ...BRAND_DEFAULTS };
  const r: any = {};
  for (const k of Object.keys(BRAND_DEFAULTS)) r[k] = row[k] ?? (BRAND_DEFAULTS as any)[k];
  return r as BrandColors;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
}

const eur = (v: number) => {
  const parts = Math.abs(v).toFixed(2).split(".");
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `\u20AC${intPart}.${parts[1]}`;
};

const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-IE", { day: "2-digit", month: "long", year: "numeric" });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { job_id } = await req.json();
    if (!job_id) {
      return new Response(JSON.stringify({ error: "job_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // IDOR guard: prove the caller belongs to the organisation that owns this
    // record before loading it or acting with that tenant's credentials.
    const access = await requireResourceOrgAccess(req, {
      fnName: "create-job-invoice",
      cors: corsHeaders,
      resource: { table: "service_calls", id: job_id },
    });
    if (isDenied(access)) return access.error;

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ── Fetch job + customer ──
    const { data: job, error: jErr } = await sb
      .from("service_calls")
      .select("*, customers!inner(name, phone, email, address, eircode)")
      .eq("id", job_id)
      .single();

    if (jErr || !job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cust = (job as any).customers;

    // ── Look up linked quote ──
    const { data: quote } = await sb
      .from("quotes")
      .select("*, quote_line_items(*)")
      .eq("converted_job_id", job_id)
      .maybeSingle();

    let lineItems: any[] = [];
    let totalAmount = 0;
    let depositPaid = 0;
    let balanceDue = 0;
    let vatEnabled = false;
    let discount = 0;
    let description = job.job_issue || job.job_type || "Service";

    if (quote) {
      lineItems = (quote.quote_line_items || []).sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
      totalAmount = Number(quote.total_amount || 0);
      depositPaid = Number(quote.deposit_amount || quote.deposit || 0);
      balanceDue = Number(quote.balance_due || Math.max(totalAmount - depositPaid, 0));
      vatEnabled = !!quote.vat_enabled;
      discount = Number(quote.discount || 0);
      description = quote.description || description;
    } else {
      // Fallback to job revenue
      totalAmount = Number(job.revenue || 0);
      depositPaid = Number(job.deposit_amount || 0);
      balanceDue = Math.max(totalAmount - depositPaid, 0);
    }

    // ── Create invoice record ──
    const { data: invoice, error: invErr } = await sb
      .from("invoices")
      .insert({
        organisation_id: job.organisation_id,
        job_id: job_id,
        quote_id: quote?.id || null,
        customer_id: job.customer_id,
        user_id: job.user_id,
        total_amount: totalAmount,
        deposit_paid: depositPaid,
        balance_due: balanceDue,
        vat_enabled: vatEnabled,
        status: "unpaid",
      })
      .select()
      .single();

    if (invErr || !invoice) {
      console.error("Invoice creation error:", invErr);
      return new Response(JSON.stringify({ error: "Failed to create invoice" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Copy line items ──
    if (lineItems.length > 0) {
      const invLineItems = lineItems.map((li: any) => ({
        invoice_id: invoice.id,
        description: li.description,
        qty: li.qty,
        unit_price: li.unit_price,
        line_total: li.line_total,
        sort_order: li.sort_order || 0,
      }));
      await sb.from("invoice_line_items").insert(invLineItems);
    }

    // ── Store invoice number on job ──
    await sb.from("service_calls").update({
      invoice_number: invoice.invoice_number,
      payment_status: "unpaid",
    }).eq("id", job_id);

    // ── Fetch settings + brand ──
    const [settingsRes, brandRes] = await Promise.all([
      sb.from("settings").select("*").eq("organisation_id", job.organisation_id).maybeSingle(),
      sb.from("brand_settings").select("*").eq("organisation_id", job.organisation_id).maybeSingle(),
    ]);

    const biz = settingsRes.data || {} as any;
    const brand = mergeBrand(brandRes.data);
    const invNum = invoice.invoice_number || `INV-${invoice.id.slice(0, 8).toUpperCase()}`;

    // ── Generate PDF ──
    const primaryRgb = hexToRgb(brand.primary_color);
    const headerTextRgb = hexToRgb(brand.header_text_color);
    const bodyTextRgb = hexToRgb(brand.body_text_color);
    const sectionLabelRgb = hexToRgb(brand.section_label_color);
    const tableAltRgb = hexToRgb(brand.table_alt_color);
    const tableRowRgb = hexToRgb(brand.table_row_color);
    const tableHeaderRgb = hexToRgb(brand.table_header_color);

    const grey = "#64748b";
    const border = brand.border_color;
    const PW = 210; const PH = 297; const M = 18; const CW = PW - M * 2;

    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const drawLine = (yy: number) => { doc.setDrawColor(border); doc.setLineWidth(0.3); doc.line(M, yy, PW - M, yy); };
    const ensureSpace = (need: number, yRef: { y: number }) => {
      if (yRef.y + need > 280) { doc.addPage(); yRef.y = M; }
    };

    // Fetch logo
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

    let y = 0;

    // ── HEADER BAR ──
    const headerH = 28;
    doc.setFillColor(...primaryRgb);
    doc.rect(0, 0, PW, headerH, "F");

    let nameX = M;
    if (logoDataUrl) {
      try { doc.addImage(logoDataUrl, "PNG", M, 5, 16, 16); nameX = M + 20; } catch { /* ignore */ }
    }
    doc.setFontSize(18); doc.setFont("helvetica", "bold"); doc.setTextColor(...headerTextRgb);
    doc.text(biz.business_name || "Invoice", nameX, 12);

    if (biz.business_address) {
      doc.setFontSize(8); doc.setFont("helvetica", "normal");
      const fadedHdr: [number, number, number] = [
        Math.round(headerTextRgb[0] * 0.7 + primaryRgb[0] * 0.3),
        Math.round(headerTextRgb[1] * 0.7 + primaryRgb[1] * 0.3),
        Math.round(headerTextRgb[2] * 0.7 + primaryRgb[2] * 0.3),
      ];
      doc.setTextColor(...fadedHdr);
      doc.text(biz.business_address.replace(/\n/g, ", "), nameX, 17);
    }

    // Right: Invoice No, Date
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...headerTextRgb);
    doc.text(invNum, PW - M, 11, { align: "right" });
    doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor("#c7d2fe");
    doc.text(`Date: ${fmtDate(new Date().toISOString())}`, PW - M, 17, { align: "right" });
    doc.text("Payment Due: 14 Days", PW - M, 23, { align: "right" });

    y = headerH + 5;

    // ── INVOICE TITLE ──
    doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.setTextColor(...primaryRgb);
    doc.text("INVOICE", M, y); y += 6;

    // ── Company details ──
    doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...bodyTextRgb);
    doc.text(biz.business_name || "", M, y);
    doc.setFontSize(7.5); doc.setFont("helvetica", "normal"); doc.setTextColor(grey);
    const compactDetails: string[] = [];
    if (biz.business_address) compactDetails.push(biz.business_address.replace(/\n/g, ", "));
    if (biz.business_phone) compactDetails.push(`Tel: ${biz.business_phone}`);
    if (biz.rgi_number) compactDetails.push(`RGI: ${biz.rgi_number}`);
    const detailLines = doc.splitTextToSize(compactDetails.join("  |  "), CW);
    doc.text(detailLines, M, y + 4);
    y += 4 + detailLines.length * 3.5 + 3;
    drawLine(y); y += 4;

    // ── INVOICE TO ──
    doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(...sectionLabelRgb);
    doc.text("INVOICE TO", M, y); y += 4;
    doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(...bodyTextRgb);
    doc.text(cust.name, M, y); y += 4.5;
    doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(grey);
    if (cust.address) { doc.text(cust.address, M, y); y += 3.5; }
    if (cust.eircode) { doc.text(cust.eircode, M, y); y += 3.5; }
    if (cust.phone) { doc.text(`Mobile: ${cust.phone}`, M, y); y += 3.5; }
    y += 3; drawLine(y); y += 4;

    // ── JOB SUMMARY ──
    doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(...sectionLabelRgb);
    doc.text("JOB SUMMARY", M, y); y += 4;
    if (job.job_type) {
      doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...bodyTextRgb);
      doc.text(job.job_type, M, y); y += 4;
    }
    if (description) {
      doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(...bodyTextRgb);
      const descLines = doc.splitTextToSize(description, CW);
      doc.text(descLines, M, y); y += descLines.length * 3.5 + 1;
    }
    y += 3; drawLine(y); y += 4;

    // ── PRICING TABLE ──
    if (lineItems.length > 0) {
      doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(...sectionLabelRgb);
      doc.text("ITEMS", M, y); y += 5;

      doc.setFillColor(...primaryRgb);
      doc.rect(M, y, CW, 8, "F");
      doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...headerTextRgb);
      doc.text("#", M + 3, y + 5.5);
      doc.text("DESCRIPTION", M + 14, y + 5.5);
      doc.text("QTY", M + CW - 55, y + 5.5, { align: "right" });
      doc.text("PRICE", M + CW - 25, y + 5.5, { align: "right" });
      doc.text("TOTAL", M + CW - 3, y + 5.5, { align: "right" });
      y += 8;

      lineItems.forEach((item: any, idx: number) => {
        const ref = { y }; ensureSpace(10, ref); y = ref.y;
        const rowBg = idx % 2 === 0 ? tableAltRgb : tableRowRgb;
        doc.setFillColor(...rowBg);
        doc.rect(M, y, CW, 8, "F");
        doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(grey);
        doc.text(`${idx + 1}`, M + 3, y + 5.5);
        doc.setTextColor(...bodyTextRgb);
        const descTrunc = doc.splitTextToSize(item.description || "", CW - 80);
        doc.text(descTrunc[0] || "", M + 14, y + 5.5);
        doc.setTextColor(grey);
        doc.text(`${item.qty}`, M + CW - 55, y + 5.5, { align: "right" });
        doc.text(eur(Number(item.unit_price)), M + CW - 25, y + 5.5, { align: "right" });
        doc.setFont("helvetica", "bold"); doc.setTextColor(...bodyTextRgb);
        doc.text(eur(Number(item.line_total || 0)), M + CW - 3, y + 5.5, { align: "right" });
        y += 8;
      });
      drawLine(y); y += 6;
    }

    // ── Totals ──
    const subtotal = lineItems.length > 0
      ? lineItems.reduce((s: number, li: any) => s + Number(li.line_total || 0), 0)
      : totalAmount;
    const afterDisc = Math.max(subtotal - discount, 0);
    const vatAmt = vatEnabled ? afterDisc * 0.23 : 0;
    const total = Math.max(afterDisc + vatAmt, 0);
    const balance = Math.max(total - depositPaid, 0);

    const tLabelX = M + CW - 80;
    const tValueX = M + CW - 3;
    const green = "#16a34a";

    const totLine = (label: string, value: string, opts?: { bold?: boolean; color?: string; size?: number }) => {
      const ref = { y }; ensureSpace(8, ref); y = ref.y;
      doc.setFontSize(opts?.size || 9);
      doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
      doc.setTextColor(opts?.color || grey);
      doc.text(label, tLabelX, y);
      doc.setTextColor(...bodyTextRgb);
      doc.text(value, tValueX, y, { align: "right" });
      y += 5;
    };

    totLine("Subtotal", eur(subtotal));
    if (discount > 0) totLine("Discount Applied", `-${eur(discount)}`, { color: green });
    if (vatEnabled) totLine("VAT 23%", eur(vatAmt));
    drawLine(y - 1); y += 3;

    doc.setFontSize(12); doc.setFont("helvetica", "bold"); doc.setTextColor(...primaryRgb);
    doc.text("TOTAL", tLabelX, y);
    doc.text(eur(total), tValueX, y, { align: "right" });
    y += 6;

    if (depositPaid > 0) {
      totLine("Deposit Paid", `-${eur(depositPaid)}`, { bold: true, color: green });
    }
    totLine("Balance Due", eur(balance), { bold: true, size: 11 });
    y += 3;

    // ── Payment terms box ──
    {
      const ref = { y }; ensureSpace(20, ref); y = ref.y;
      const ptLines = ["Payment due within 14 days of invoice date.", "Bank transfer or card accepted."];
      const boxH = 8 + ptLines.length * 4.5;
      doc.setFillColor(...tableHeaderRgb);
      doc.roundedRect(M, y, CW, boxH, 2, 2, "F");
      doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(...primaryRgb);
      doc.text("PAYMENT TERMS", M + 5, y + 5);
      doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(...bodyTextRgb);
      let py = y + 10;
      ptLines.forEach((line) => { doc.text(`• ${line}`, M + 5, py); py += 4.5; });
      y += boxH + 5;
    }

    // ── Footer ──
    doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(grey);
    const footerParts = [];
    if (biz.rgi_number) footerParts.push(`RGI Registered (${biz.rgi_number})`);
    footerParts.push("Fully Insured");
    doc.text(footerParts.join("  |  "), PW / 2, 285, { align: "center" });
    if (biz.business_address) {
      doc.text(biz.business_address.replace(/\n/g, ", "), PW / 2, 289, { align: "center" });
    }

    // Set metadata
    doc.setProperties({
      title: `Invoice ${invNum} – ${cust.name}`,
      subject: "Invoice",
      author: biz.business_name || "BookedJobs",
      creator: "BookedJobs",
    });

    // ── Upload PDF ──
    const pdfBytes = new Uint8Array(doc.output("arraybuffer"));
    if (!job.organisation_id) {
      return new Response(JSON.stringify({ error: "Job missing organisation_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const fileName = `invoice-${invNum.replace(/\s/g, "")}.pdf`;
    const storagePath = `${job.organisation_id}/${fileName}`;

    const { error: uploadErr } = await sb.storage
      .from("quote-pdfs")
      .upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: true });

    if (uploadErr) {
      console.error("Upload error:", uploadErr);
      return new Response(JSON.stringify({ error: "Failed to upload PDF" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Store raw object path — bucket flips private in Stage 2 and signed
    // URLs are minted on demand by resolve-document-link.
    const pdfUrl = storagePath;
    await sb.from("invoices").update({ pdf_url: pdfUrl }).eq("id", invoice.id);

    // ── Send WhatsApp ──
    let apiKey: string | null = null;
    let whatsappFailed = false;
    let whatsappFailReason: string | null = null;
    try {
      const wa = await getWhatsAppConfig(sb, job.organisation_id);
      apiKey = wa.apiKey;
    } catch (e) {
      const msg = (e as Error).message;
      console.error("create-job-invoice: WhatsApp config unavailable:", msg);
      whatsappFailed = true;
      whatsappFailReason = msg;
      await logWhatsAppFailure(sb, {
        organisation_id: job.organisation_id,
        customer_id: job.customer_id,
        message_type: "invoice",
        content: `invoice ${invNum} — config unavailable`,
        related_id: invoice.id,
        related_type: "invoice",
        sent_by: job.user_id,
        error_message: msg,
      });
    }
    const firstName = cust.name.split(" ")[0];
    let messageFooter = biz?.message_footer || biz?.business_name || "";

    const { data: invOrgRow } = await sb
      .from("organisations")
      .select("public_domain")
      .eq("id", job.organisation_id)
      .maybeSingle();
    const invOrgDomain = (invOrgRow as any)?.public_domain || "";
    const invoiceUrl = invOrgDomain && (invoice as any).access_token
      ? `https://${invOrgDomain}/invoice/${(invoice as any).access_token}`
      : null;
    const waMessage = `Hi ${firstName}, please find your invoice attached for ${job.job_type || "your job"}.\n\nTotal: ${eur(total)}\nDeposit paid: ${eur(depositPaid)}\nBalance due: ${eur(balance)}\n\nInvoice ref: ${invNum}\nPayment due within 14 days.${invoiceUrl ? `\n\n📄 View invoice:\n${invoiceUrl}` : ""}${messageFooter ? `\n\nThank you, ${messageFooter}` : ""}`;

    let whatsappSent = false;

    // Consent gate for the customer-facing WhatsApp step. The invoice itself is
    // still created/stored; only the outbound message is suppressed.
    const invoiceConsent = await requireCustomerMessagingConsent({
      fnName: "create-job-invoice",
      orgId: access.orgId,
      customerId: job.customer_id,
    });
    if (!invoiceConsent.allowed) {
      whatsappFailReason = `skipped_${invoiceConsent.reason}`;
      console.log(`create-job-invoice: WhatsApp skipped — ${invoiceConsent.reason}`);
    }

    if (apiKey && invoiceConsent.allowed) {
      let cleanNumber: string;
      try {
        cleanNumber = normalisePhone(invoiceConsent.allowed ? invoiceConsent.phone : "");
      } catch (phoneErr) {
        const msg = (phoneErr as Error).message;
        console.error("create-job-invoice: phone normalise failed:", msg);
        whatsappFailed = true;
        whatsappFailReason = msg;
        await logWhatsAppFailure(sb, {
          organisation_id: job.organisation_id,
          customer_id: job.customer_id,
          message_type: "invoice",
          content: waMessage,
          related_id: invoice.id,
          related_type: "invoice",
          sent_by: job.user_id,
          error_message: msg,
        });
        cleanNumber = "";
      }

      if (cleanNumber) {
        // Log pending message
        const { data: logRows } = await sb.from("message_log").insert({
          customer_id: job.customer_id,
          organisation_id: job.organisation_id,
          message_type: "invoice",
          channel: "whatsapp",
          direction: "outbound",
          content: waMessage,
          status: "pending",
          related_id: invoice.id,
          related_type: "invoice",
          sent_by: job.user_id,
          sent_at: new Date().toISOString(),
        }).select("id");

        const logId = logRows?.[0]?.id || null;

        const formData = new FormData();
        formData.append("phonenumber", cleanNumber);
        formData.append("text", waMessage);

        try {
          const response = await fetch("https://api.360messenger.com/v2/sendMessage", {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}` },
            body: formData,
          });

          const resultText = await response.text();
          let result: any;
          try { result = JSON.parse(resultText); } catch { result = { success: false, raw: resultText }; }

          if (logId) {
            const updateBody = result.success
              ? { status: "sent" }
              : { status: "failed", error_message: `360Messenger HTTP ${response.status}: ${resultText.substring(0, 500)}` };
            await sb.from("message_log").update(updateBody).eq("id", logId);
          }

          whatsappSent = !!result.success;

          // Log customer activity on success
          if (result.success) {
            if (!job.organisation_id) {
              console.error(`create-job-invoice: skipping customer_activity insert — job ${job_id} missing organisation_id`);
            } else {
              try {
                await sb.from("customer_activity").insert({
                  organisation_id: job.organisation_id,
                  customer_id: job.customer_id,
                  service_call_id: job_id,
                  event_type: "whatsapp_sent",
                  event_label: "WhatsApp sent — Invoice",
                });
              } catch { /* non-critical */ }
            }
          }

          if (!result.success) {
            whatsappFailed = true;
            whatsappFailReason = `360Messenger HTTP ${response.status}`;
            await sb.from("edge_function_logs").insert({
              function_name: "create-job-invoice",
              error_message: `WhatsApp send failed. HTTP ${response.status}`,
              payload: { api_response: result, sent_to: invoiceConsent.allowed ? invoiceConsent.phone : null, invoice_id: invoice.id },
            });
          }
        } catch (waErr) {
          const msg = (waErr as Error).message;
          console.error("WhatsApp send error:", waErr);
          whatsappFailed = true;
          whatsappFailReason = msg;
          if (logId) {
            await sb.from("message_log").update({ status: "failed", error_message: msg }).eq("id", logId);
          } else {
            await logWhatsAppFailure(sb, {
              organisation_id: job.organisation_id,
              customer_id: job.customer_id,
              message_type: "invoice",
              content: waMessage,
              related_id: invoice.id,
              related_type: "invoice",
              sent_by: job.user_id,
              error_message: msg,
            });
          }
        }
      }
    }

    return new Response(JSON.stringify({
      success: !whatsappFailed,
      invoice_id: invoice.id,
      invoice_number: invNum,
      pdf_url: pdfUrl,
      whatsapp_sent: whatsappSent,
      whatsapp_error: whatsappFailReason,
      customer_name: cust.name,
      balance_due: balance,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("create-job-invoice error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
