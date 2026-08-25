export type ReceiptTextInput = {
  receipt_number: string | null;
  scheduled_date: string | null;
  paid_at: string | null;
  revenue: number | null;
  payment_method: string | null;
  assigned_engineer: string | null;
  customerName?: string | null;
};

const fmtDate = (val: string | null) => {
  if (!val) return null;
  const iso = val.length === 10 ? `${val}T12:00:00` : val;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });
};

const fmtMethod = (m: string | null) => {
  if (!m) return null;
  if (m === "cash") return "Cash";
  if (m === "card") return "Card";
  if (m === "invoice") return "Invoice";
  return m;
};

/**
 * Builds plain-text receipt content for clipboard copy.
 * Returns null when there is no receipt to copy (no receipt number).
 */
export function buildReceiptText(job: ReceiptTextInput): string | null {
  if (!job.receipt_number) return null;

  const lines: string[] = [`Receipt ${job.receipt_number}`];
  if (job.customerName) lines.push(`Customer: ${job.customerName}`);

  const serviceDate = fmtDate(job.scheduled_date);
  if (serviceDate) lines.push(`Service date: ${serviceDate}`);

  const paidDate = fmtDate(job.paid_at);
  if (paidDate) lines.push(`Paid: ${paidDate}`);

  const method = fmtMethod(job.payment_method);
  if (method) lines.push(`Method: ${method}`);

  if (job.assigned_engineer) lines.push(`Engineer: ${job.assigned_engineer}`);

  lines.push(`Amount: €${(job.revenue || 0).toFixed(2)}`);

  return lines.join("\n");
}

/** Copies text to the clipboard, falling back to execCommand on insecure/older contexts. */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy path
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
