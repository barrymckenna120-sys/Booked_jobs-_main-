/**
 * Opens the browser's print dialog with only the receipt visible.
 * Uses a hidden iframe to avoid disrupting the current page.
 */
export interface ReceiptPrintData {
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
  businessAddress?: string;
  rgiNumber?: string;
  engineerName?: string;
}

export const printReceipt = (data: ReceiptPrintData) => {
  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Receipt ${data.receiptNumber}</title>
<style>
  @page { size: A4; margin: 20mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #111827; background: #fff; }
  .receipt { max-width: 600px; margin: 0 auto; padding: 24px; }
  .header { margin-bottom: 20px; }
  .header h1 { font-size: 22px; font-weight: 800; color: #111827; margin-bottom: 4px; }
  .header p { font-size: 13px; color: #6B7280; }
  .header .phone { font-size: 13px; color: #6B7280; }
  .title { font-size: 15px; font-weight: 700; color: #4A86E8; margin: 16px 0 12px; text-transform: uppercase; letter-spacing: 0.5px; }
  .divider { border: none; border-top: 1px solid #E5E7EB; margin: 12px 0; }
  .section-label { font-size: 10px; font-weight: 700; color: #6B7280; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
  .row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; font-size: 12px; }
  .row .label { color: #6B7280; }
  .row .value { font-weight: 700; color: #111827; text-align: right; max-width: 60%; }
  .total-box { background: #F5F7FA; border-radius: 8px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; margin: 16px 0; }
  .total-box .total-label { font-size: 14px; font-weight: 700; color: #111827; }
  .total-box .total-value { font-size: 18px; font-weight: 800; color: #4A86E8; }
  .footer { margin-top: 20px; font-size: 11px; color: #6B7280; line-height: 1.6; }
  .success { text-align: center; margin: 20px 0; }
  .success-icon { width: 48px; height: 48px; border-radius: 50%; background: #dcfce7; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 8px; }
  .success-icon svg { width: 28px; height: 28px; color: #16a34a; }
  .success-text { font-size: 14px; font-weight: 700; color: #16a34a; }
</style>
</head>
<body>
<div class="receipt">
  <div class="header">
    <h1>${esc(data.businessName)}</h1>
    <p>${esc(data.businessTagline)}</p>
    <p class="phone">Phone: ${esc(data.businessPhone)}</p>
    ${data.businessAddress ? `<p>${esc(data.businessAddress)}</p>` : ''}
  </div>

  <div class="success">
    <div class="success-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
    </div>
    <div class="success-text">Payment Successful</div>
  </div>

  <div class="title">Payment Receipt</div>
  <hr class="divider"/>

  <div class="row"><span class="label">Receipt No.</span><span class="value">${esc(data.receiptNumber)}</span></div>
  <div class="row"><span class="label">Issue Date</span><span class="value">${esc(data.issueDate)}</span></div>

  <hr class="divider"/>
  <div class="section-label">Service Details</div>
  <div class="row"><span class="label">Service Type</span><span class="value">${esc(data.serviceType)}</span></div>
  <div class="row"><span class="label">Service Date</span><span class="value">${esc(data.serviceDate)}</span></div>
  ${data.engineerName ? `<div class="row"><span class="label">Engineer</span><span class="value">${esc(data.engineerName)}</span></div>` : ''}
  <div class="row"><span class="label">Amount</span><span class="value">${esc(data.amountPaid)}</span></div>

  <hr class="divider"/>
  <div class="section-label">Customer Details</div>
  <div class="row"><span class="label">Name</span><span class="value">${esc(data.customerName)}</span></div>
  <div class="row"><span class="label">Address</span><span class="value">${esc(data.customerAddress)}</span></div>

  <hr class="divider"/>
  <div class="section-label">Payment Details</div>
  <div class="row"><span class="label">Payment Method</span><span class="value">${esc(data.paymentMethod)}</span></div>

  <div class="total-box">
    <span class="total-label">Total Paid</span>
    <span class="total-value">${esc(data.amountPaid)}</span>
  </div>

  <hr class="divider"/>
  <div class="footer">
    <p>Thank you for choosing ${esc(data.businessName)}.</p>
    <p>Your next annual boiler service reminder will be sent in 12 months.</p>
    <p>Next service due: ${esc(data.nextServiceDue)}</p>
    ${data.rgiNumber ? `<p style="margin-top:8px;">RGI Reg: ${esc(data.rgiNumber)}</p>` : ''}
  </div>
</div>
</body>
</html>`;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    // Fallback: use iframe
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    }
    return;
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  // Small delay to allow rendering
  setTimeout(() => {
    printWindow.print();
  }, 300);
};

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
