import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp } from "lucide-react";

type UnifiedMessage = {
  id: string;
  message_type: string;
  content: string;
  timestamp: string;
  sent_by: string | null;
  status: string;
  source: "whatsapp" | "log";
  related_id: string | null;
};

type Props = {
  customerId: string;
  onSendMessage?: () => void;
  /** When set, rows linked to this job id get a "This job" badge. */
  highlightJobId?: string;
  /** Hide the built-in Send Message button (caller provides its own send UI). */
  hideSendButton?: boolean;
  /** Override the default card title. */
  title?: string;
};


const TYPE_LABELS: Record<string, string> = {
  booking_confirmation: "Booking Confirmation",
  Booking_confirmation: "Booking Confirmation",
  appointment_reminder: "Appointment Reminder",
  renewal: "Renewal Reminder",
  invoice: "Invoice",
  receipt: "Receipt",
  quote: "Quote",
  certificate: "Gas Certificate",
  payment_link: "Payment Link",
  part_arrived: "Part Arrived",
  Part_arrived: "Part Arrived",
};

function friendlyType(raw: string): string {
  if (TYPE_LABELS[raw]) return TYPE_LABELS[raw];
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeSentBy(raw: string | null): string {
  if (!raw) return "System";
  if (UUID_RE.test(raw)) return "System";
  return raw;
}

const statusIcon: Record<string, string> = {
  sent: "📤",
  Sent: "📤",
  delivered: "✅",
  Delivered: "✅",
  Confirmed: "✅",
  failed: "❌",
  Failed: "❌",
  "No Response": "⏳",
  "Opted Out": "🚫",
};

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-IE", { day: "2-digit", month: "short", year: "numeric" }) +
    ", " +
    d.toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit", hour12: false });
}

const INITIAL_LIMIT = 3;

const WhatsAppHistory = ({
  customerId,
  onSendMessage,
  highlightJobId,
  hideSendButton,
  title,
}: Props) => {
  const [messages, setMessages] = useState<UnifiedMessage[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      const [waRes, logRes] = await Promise.all([
        supabase
          .from("whatsapp_messages")
          .select("id, message_type, message_body, status, sent_by, created_at")
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false }),
        supabase
          .from("message_log")
          .select("id, message_type, content, status, sent_by, sent_at, related_id")
          .eq("customer_id", customerId)
          .order("sent_at", { ascending: false }),
      ]);

      const waMessages: UnifiedMessage[] = (waRes.data || []).map((m: any) => ({
        id: m.id,
        message_type: m.message_type || "unknown",
        content: m.message_body || "",
        timestamp: m.created_at,
        sent_by: m.sent_by,
        status: m.status || "sent",
        source: "whatsapp" as const,
        related_id: null,
      }));

      const logMessages: UnifiedMessage[] = (logRes.data || []).map((m: any) => ({
        id: m.id,
        message_type: m.message_type || "unknown",
        content: m.content || "",
        timestamp: m.sent_at || "",
        sent_by: m.sent_by,
        status: m.status || "sent",
        source: "log" as const,
        related_id: m.related_id ?? null,
      }));


      const merged = [...waMessages, ...logMessages]
        .filter((m) => m.timestamp)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Deduplicate on id
      const seen = new Set<string>();
      const deduped: UnifiedMessage[] = [];
      for (const msg of merged) {
        if (seen.has(msg.id)) continue;
        seen.add(msg.id);
        deduped.push(msg);
      }

      setMessages(deduped);
      setLoading(false);
    };
    fetchAll();
  }, [customerId]);

  const visible = expanded ? messages : messages.slice(0, INITIAL_LIMIT);
  const hasMore = messages.length > INITIAL_LIMIT;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title ?? "📱 Message History"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && (
          <div className="flex justify-center py-4">
            <div className="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        )}

        {!loading && messages.length === 0 && (
          <p className="text-sm text-muted-foreground">No messages sent yet</p>
        )}

        {!loading && visible.map((m) => (
          <div key={`${m.source}-${m.id}`} className="border-l-2 border-border pl-4 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Badge variant="secondary" className="text-xs font-medium">
                  {friendlyType(m.message_type)}
                </Badge>
                {highlightJobId && m.related_id === highlightJobId && (
                  <Badge variant="outline" className="text-xs font-medium shrink-0">
                    This job
                  </Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {statusIcon[m.status] || "📤"} {m.status}
              </span>
            </div>

            <p className="text-xs text-muted-foreground">
              {formatTimestamp(m.timestamp)}
              {" · "}
              {safeSentBy(m.sent_by)}
            </p>
            {m.content && (
              <p className="text-xs text-muted-foreground line-clamp-2">
                "{m.content.length > 80 ? m.content.slice(0, 80) + "…" : m.content}"
              </p>
            )}
          </div>
        ))}

        {!loading && hasMore && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <>
                <ChevronUp className="w-3 h-3 mr-1" /> Show less
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3 mr-1" /> Show older messages ({messages.length - INITIAL_LIMIT} more)
              </>
            )}
          </Button>
        )}

        <Button size="sm" className="w-full mt-2" onClick={onSendMessage}>
          📲 Send Message
        </Button>
      </CardContent>
    </Card>
  );
};

export default WhatsAppHistory;
