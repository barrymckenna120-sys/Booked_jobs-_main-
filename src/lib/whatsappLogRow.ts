/**
 * Presentation helpers for the live WhatsApp send log (Settings → Messaging).
 * Pure functions so the status/label mapping is unit-testable.
 */

export type LogStatusKey = "queued" | "sent" | "delivered" | "read" | "failed" | "unknown";

/** Map raw message_log.status values (provider + internal) onto display statuses. */
export function normaliseLogStatus(raw: string | null | undefined): LogStatusKey {
  const s = (raw || "").trim().toLowerCase();
  if (!s) return "unknown";
  if (s === "pending" || s === "queued") return "queued";
  if (s === "sent" || s === "success") return "sent";
  if (s === "delivered") return "delivered";
  if (s === "read") return "read";
  if (s === "failed" || s === "error") return "failed";
  return "unknown";
}

export const LOG_STATUS_LABEL: Record<LogStatusKey, string> = {
  queued: "Queued",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Failed",
  unknown: "Unknown",
};

export const LOG_STATUS_CLASS: Record<LogStatusKey, string> = {
  queued: "border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]",
  sent: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
  delivered: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
  read: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
  failed: "border-destructive/30 bg-destructive/10 text-destructive",
  unknown: "border-border bg-muted text-muted-foreground",
};

/** Human label for a message_type slug, e.g. `quote_sent` → `Quote sent`. */
export function formatMessageType(raw: string | null | undefined): string {
  const s = (raw || "").trim();
  if (!s) return "Unknown";
  const words = s.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Digits-only or already-formatted phone → readable E.164-ish string. */
export function formatRecipientPhone(raw: string | null | undefined): string {
  const s = (raw || "").trim();
  if (!s) return "—";
  if (s.startsWith("+")) return s;
  if (/^\d{6,}$/.test(s)) return `+${s}`;
  return s;
}

export interface RelatedRefMaps {
  quotes: Record<string, string>;
  jobs: Record<string, string>;
  invoices: Record<string, string>;
}

/** "Quote Q-1024", "Job DG-446", etc. Falls back to the record type alone. */
export function relatedLabel(
  relatedType: string | null | undefined,
  relatedId: string | null | undefined,
  maps: RelatedRefMaps,
): string {
  if (!relatedId) return "—";
  const t = (relatedType || "").toLowerCase();
  if (t === "quote") return maps.quotes[relatedId] ? `Quote ${maps.quotes[relatedId]}` : "Quote";
  if (t === "invoice")
    return maps.invoices[relatedId] ? `Invoice ${maps.invoices[relatedId]}` : "Invoice";
  if (t === "service_call" || t === "job")
    return maps.jobs[relatedId] ? `Job ${maps.jobs[relatedId]}` : "Job";
  if (!t) return "—";
  return formatMessageType(t);
}
