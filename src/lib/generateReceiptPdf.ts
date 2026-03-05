import jsPDF from "jspdf";

interface ReceiptData {
  receiptNumber: string;
  issueDate: string;
  customerName: string;
  customerAddress: string;
  serviceType: string;
  serviceDate: string;
  paymentMethod: string;
  amountPaid: string;
  nextServiceDue: string;
  businessName: string;
  businessPhone: string;
  businessTagline: string;
}

export const generateReceiptPdf = (data: ReceiptData): jsPDF => {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const margin = 24;
  const contentW = w - margin * 2;
  let y = 28;

  const PRIMARY = [74, 134, 232] as [number, number, number]; // #4A86E8
  const TEXT_PRIMARY = [17, 24, 39] as [number, number, number]; // #111827
  const TEXT_SECONDARY = [107, 114, 128] as [number, number, number]; // #6B7280
  const DIVIDER = [229, 231, 235] as [number, number, number]; // #E5E7EB

  // Helper
  const drawDivider = (atY: number) => {
    doc.setDrawColor(...DIVIDER);
    doc.setLineWidth(0.3);
    doc.line(margin, atY, w - margin, atY);
  };

  const sectionLabel = (label: string, atY: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_SECONDARY);
    doc.text(label.toUpperCase(), margin, atY);
    return atY + 6;
  };

  const fieldRow = (label: string, value: string, atY: number) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...TEXT_SECONDARY);
    doc.text(label, margin, atY);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...TEXT_PRIMARY);
    doc.text(value, w - margin, atY, { align: "right" });
    return atY + 7;
  };

  // ── Header ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...TEXT_PRIMARY);
  doc.text(data.businessName, margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_SECONDARY);
  doc.text(data.businessTagline, margin, y);
  y += 5;
  doc.text(`Phone: ${data.businessPhone}`, margin, y);
  y += 10;

  // PAYMENT RECEIPT title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...PRIMARY);
  doc.text("PAYMENT RECEIPT", margin, y);
  y += 8;

  drawDivider(y);
  y += 8;

  // Receipt info
  y = fieldRow("Receipt No.", data.receiptNumber, y);
  y = fieldRow("Issue Date", data.issueDate, y);
  y += 4;
  drawDivider(y);
  y += 8;

  // Service section
  y = sectionLabel("Service Details", y);
  y = fieldRow("Service Type", data.serviceType, y);
  y = fieldRow("Service Date", data.serviceDate, y);
  y = fieldRow("Amount", data.amountPaid, y);
  y += 4;
  drawDivider(y);
  y += 8;

  // Customer section
  y = sectionLabel("Customer Details", y);
  y = fieldRow("Name", data.customerName, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...TEXT_SECONDARY);
  doc.text("Address", margin, y);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...TEXT_PRIMARY);
  // Wrap long addresses
  const addressLines = doc.splitTextToSize(data.customerAddress, contentW * 0.55);
  doc.text(addressLines, w - margin, y, { align: "right" });
  y += addressLines.length * 5 + 4;
  y += 4;
  drawDivider(y);
  y += 8;

  // Payment section
  y = sectionLabel("Payment Details", y);
  y = fieldRow("Payment Method", data.paymentMethod, y);
  y += 2;

  // Total highlight
  doc.setFillColor(245, 247, 250);
  doc.roundedRect(margin, y - 1, contentW, 14, 3, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...TEXT_PRIMARY);
  doc.text("Total Paid", margin + 6, y + 8);
  doc.setFontSize(14);
  doc.setTextColor(...PRIMARY);
  doc.text(data.amountPaid, w - margin - 6, y + 8, { align: "right" });
  y += 22;

  drawDivider(y);
  y += 12;

  // Footer
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_SECONDARY);
  doc.text(`Thank you for choosing ${data.businessName}.`, margin, y);
  y += 5;
  doc.text(`Your next annual boiler service reminder will be sent in 12 months.`, margin, y);
  y += 5;
  doc.text(`Next service due: ${data.nextServiceDue}`, margin, y);

  return doc;
};
