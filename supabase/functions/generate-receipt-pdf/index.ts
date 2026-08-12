import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-org-id",
};

function esc(str: string | null | undefined): string {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const formatDate = (d: string | null) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IE", { day: "2-digit", month: "short", year: "numeric" });
};

const addMonths = (d: string, months: number) => {
  const date = new Date(d + "T00:00:00");
  date.setMonth(date.getMonth() + months);
  return date.toLocaleDateString("en-IE", { day: "2-digit", month: "short", year: "numeric" });
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { job_id } = await req.json();
    if (!job_id) {
      return new Response(JSON.stringify({ error: "job_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch job
    const { data: job, error: jobErr } = await supabase
      .from("service_calls")
      .select("id, job_reference, job_type, scheduled_date, completed_at, payment_method, revenue, receipt_number, customer_id, user_id, organisation_id, assigned_engineer, deposit_amount, receipt_pdf_url, customer_facing_notes")
      .eq("id", job_id)
      .single();

    if (jobErr || !job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If PDF already exists, return it
    if (job.receipt_pdf_url) {
      return new Response(JSON.stringify({ pdf_url: job.receipt_pdf_url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch customer
    const { data: customer } = await supabase
      .from("customers")
      .select("name, address, eircode, phone, boiler_brand, boiler_model, warranty_expiry_date, next_service_due, gprn")
      .eq("id", job.customer_id)
      .single();

    // Fetch settings (scoped to organisation)
    const { data: settings } = await supabase
      .from("settings")
      .select("business_name, business_phone, business_address, rgi_number, message_footer")
      .eq("organisation_id", job.organisation_id)
      .maybeSingle();

    const businessName = settings?.business_name || "";
    const businessPhone = settings?.business_phone || "";
    const businessAddress = settings?.business_address || "";
    const rgiNumber = settings?.rgi_number || "";
    const jobRef = job.job_reference || `KN-${job.id.slice(0, 6).toUpperCase()}`;
    const receiptNum = job.receipt_number || "—";
    const serviceDate = job.scheduled_date || new Date().toISOString().split("T")[0];
    const amount = job.revenue ? `€${Number(job.revenue).toFixed(2)}` : "€0.00";
    const paymentMethod = job.payment_method === "card" ? "Card" : job.payment_method === "cash" ? "Cash" : "Invoice";
    const nextDue = addMonths(serviceDate, 12);
    const customerName = customer?.name || "Customer";
    const customerAddress = `${customer?.address || ""} ${customer?.eircode || ""}`.trim();
    const engineerName = job.assigned_engineer || "—";

    // Generate PDF with jsPDF
    const { default: jsPDF } = await import("https://esm.sh/jspdf@2.5.2");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const pageW = 210;
    const margin = 20;
    const contentW = pageW - margin * 2;
    let y = margin;

    const addText = (text: string, x: number, yPos: number, opts: { size?: number; color?: number[]; bold?: boolean; align?: string } = {}) => {
      doc.setFontSize(opts.size || 10);
      doc.setTextColor(...(opts.color || [17, 24, 39]) as [number, number, number]);
      doc.setFont("helvetica", opts.bold ? "bold" : "normal");
      doc.text(text, x, yPos, { align: (opts.align as any) || "left" });
    };

    const drawLine = (yPos: number) => {
      doc.setDrawColor(229, 231, 235);
      doc.setLineWidth(0.3);
      doc.line(margin, yPos, pageW - margin, yPos);
    };

    // Header
    addText(businessName, pageW / 2, y, { size: 18, bold: true, align: "center" });
    y += 6;
    addText("Professional Gas & Boiler Services", pageW / 2, y, { size: 10, color: [107, 114, 128], align: "center" });
    y += 5;
    addText(`Phone: ${businessPhone}`, pageW / 2, y, { size: 9, color: [107, 114, 128], align: "center" });
    if (businessAddress) {
      y += 4;
      addText(businessAddress, pageW / 2, y, { size: 9, color: [107, 114, 128], align: "center" });
    }
    y += 10;

    // Payment Successful badge
    doc.setFillColor(220, 252, 231);
    doc.roundedRect(pageW / 2 - 30, y, 60, 10, 3, 3, "F");
    addText("✓ Payment Successful", pageW / 2, y + 7, { size: 11, bold: true, color: [22, 163, 74], align: "center" });
    y += 18;

    // Title
    addText("PAYMENT RECEIPT", pageW / 2, y, { size: 13, bold: true, color: [74, 134, 232], align: "center" });
    y += 8;
    drawLine(y);
    y += 6;

    // Receipt details
    const addRow = (label: string, value: string) => {
      addText(label, margin, y, { size: 9, color: [107, 114, 128] });
      addText(value, pageW - margin, y, { size: 9, bold: true, align: "right" });
      y += 6;
    };

    addRow("Receipt No.", receiptNum);
    addRow("Job Ref", jobRef);
    addRow("Issue Date", formatDate(new Date().toISOString().split("T")[0]));
    y += 2;
    drawLine(y);
    y += 6;

    // Section: Service Details
    addText("SERVICE DETAILS", margin, y, { size: 8, bold: true, color: [107, 114, 128] });
    y += 6;
    addRow("Service Type", job.job_type || "Boiler Service");
    addRow("Service Date", formatDate(serviceDate));
    addRow("Engineer", engineerName);
    addRow("Amount", amount);
    y += 2;
    drawLine(y);
    y += 6;

    // Section: Customer Details
    addText("CUSTOMER DETAILS", margin, y, { size: 8, bold: true, color: [107, 114, 128] });
    y += 6;
    addRow("Name", customerName);
    addRow("Address", customerAddress);
    y += 2;
    drawLine(y);
    y += 6;

    // Section: Payment Details
    addText("PAYMENT DETAILS", margin, y, { size: 8, bold: true, color: [107, 114, 128] });
    y += 6;
    addRow("Payment Method", paymentMethod);
    y += 4;

    // Total box
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(margin, y, contentW, 14, 3, 3, "F");
    addText("Total Paid", margin + 6, y + 9, { size: 12, bold: true });
    addText(amount, pageW - margin - 6, y + 9, { size: 14, bold: true, color: [74, 134, 232], align: "right" });
    y += 22;

    // Section: Boiler Details + Notes (hidden entirely when both are empty)
    const makeModel = [customer?.boiler_brand, customer?.boiler_model].filter(Boolean).join(" ").trim();
    const warrantyText = (() => {
      const raw = customer?.warranty_expiry_date;
      if (!raw) return null;
      const expiry = new Date(String(raw).includes("T") ? String(raw) : `${raw}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return expiry >= today ? `Under Warranty (until ${formatDate(String(raw))})` : "Warranty Expired";
    })();
    const boilerRows: [string, string][] = [];
    if (makeModel) boilerRows.push(["Make & Model", makeModel]);
    if (warrantyText) boilerRows.push(["Warranty", warrantyText]);
    if (customer?.next_service_due) boilerRows.push(["Next Service Due", formatDate(String(customer.next_service_due))]);
    if (customer?.gprn) boilerRows.push(["GPRN", String(customer.gprn)]);
    const notesText = (job.customer_facing_notes || "").trim();

    if (boilerRows.length > 0 || notesText) {
      const colGap = 8;
      const colW = (contentW - colGap) / 2;
      const singleCol = boilerRows.length === 0 || !notesText;
      const leftX = margin;
      const rightX = boilerRows.length === 0 ? margin : margin + colW + colGap;
      const rightW = singleCol ? contentW : colW;

      let leftHeight = 0;
      if (boilerRows.length > 0) {
        let ly = y;
        addText("BOILER DETAILS", leftX, ly, { size: 8, bold: true, color: [107, 114, 128] });
        ly += 6;
        for (const [label, value] of boilerRows) {
          addText(label, leftX, ly, { size: 8, color: [107, 114, 128] });
          ly += 4;
          const lines = doc.splitTextToSize(value, singleCol ? contentW : colW) as string[];
          for (const line of lines) {
            addText(line, leftX, ly, { size: 9, bold: true });
            ly += 4.5;
          }
          ly += 1.5;
        }
        leftHeight = ly - y;
      }

      let rightHeight = 0;
      if (notesText) {
        let ry = y;
        addText("NOTES", rightX, ry, { size: 8, bold: true, color: [107, 114, 128] });
        ry += 4;
        const noteLines = doc.splitTextToSize(notesText, rightW - 8) as string[];
        const boxH = noteLines.length * 4.5 + 6;
        doc.setFillColor(245, 247, 250);
        doc.setDrawColor(229, 231, 235);
        doc.setLineWidth(0.3);
        doc.roundedRect(rightX, ry, rightW, boxH, 3, 3, "FD");
        let ty = ry + 5.5;
        for (const line of noteLines) {
          addText(line, rightX + 4, ty, { size: 9, color: [55, 65, 81] });
          ty += 4.5;
        }
        rightHeight = ry + boxH - y;
      }

      y += Math.max(leftHeight, rightHeight) + 6;
    }

    drawLine(y);
    y += 8;

    // Footer
    addText(`Thank you for choosing ${businessName}.`, margin, y, { size: 9, color: [107, 114, 128] });
    if (rgiNumber) {
      y += 5;
      addText(`RGI Reg: ${rgiNumber}`, margin, y, { size: 9, color: [107, 114, 128] });
    }

    // Generate PDF bytes
    const pdfOutput = doc.output("arraybuffer");
    const pdfBytes = new Uint8Array(pdfOutput);

    // Upload to certificates bucket under <organisation_id>/<filename>
    if (!job.organisation_id) {
      return new Response(JSON.stringify({ error: "Service call missing organisation_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const fileName = `receipt-${receiptNum || job.id.slice(0, 8)}.pdf`;
    const storagePath = `${job.organisation_id}/${fileName}`;
    const { error: uploadError } = await supabase.storage
      .from("certificates")
      .upload(storagePath, pdfBytes, {
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

    // Save the raw storage object path (Stage 2 flips bucket private —
    // signed URLs are minted on demand by resolve-document-link).
    await supabase
      .from("service_calls")
      .update({ receipt_pdf_url: storagePath })
      .eq("id", job_id);

    return new Response(JSON.stringify({ pdf_url: storagePath }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("generate-receipt-pdf error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
