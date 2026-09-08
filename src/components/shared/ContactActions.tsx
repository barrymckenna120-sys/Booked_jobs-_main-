import { Phone, MessageCircle } from "lucide-react";
import { formatWhatsApp } from "@/lib/whatsappLink";

interface ContactActionsProps {
  phone?: string | null;
  /** Compact = list/card rows (h-9). Default = engineer job card size (h-11). */
  size?: "default" | "compact";
  className?: string;
}

/**
 * The single Call / WhatsApp action pair used across the whole app (office job
 * cards, declined payments, engineer job card). Bordered buttons with padding
 * and rounded corners — one style, never plain text links.
 */
const ContactActions = ({ phone, size = "default", className = "" }: ContactActionsProps) => {
  if (!phone) return null;

  const base =
    "flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background font-bold no-underline transition-colors hover:bg-muted/60 active:bg-muted";
  const sizing = size === "compact" ? "h-9 px-2.5 text-xs" : "h-11 px-3 text-xs";
  const icon = size === "compact" ? "w-3.5 h-3.5 shrink-0" : "w-4 h-4 shrink-0";

  return (
    <div
      className={`flex flex-wrap gap-2 ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      <a href={`tel:${phone}`} className={`${base} ${sizing} text-foreground`}>
        <Phone className={icon} /> Call
      </a>
      <a
        href={`https://wa.me/${formatWhatsApp(phone)}`}
        target="_blank"
        rel="noopener noreferrer"
        className={`${base} ${sizing} text-success`}
      >
        <MessageCircle className={icon} /> WhatsApp
      </a>
    </div>
  );
};

export default ContactActions;
