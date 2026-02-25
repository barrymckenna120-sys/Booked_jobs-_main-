import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type WaMessage = {
  id: string;
  message_type: string;
  message_body: string;
  sent_at: string;
  sent_by: string | null;
  status: string;
};

type Props = {
  customerId: string;
  onSendMessage: () => void;
};

const statusIcon: Record<string, string> = {
  Sent: "📤",
  Confirmed: "✅",
  "No Response": "⏳",
  "Opted Out": "🚫",
  Failed: "❌",
};

const WhatsAppHistory = ({ customerId, onSendMessage }: Props) => {
  const [messages, setMessages] = useState<WaMessage[]>([]);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("customer_id", customerId)
        .order("sent_at", { ascending: false })
        .limit(5);
      setMessages((data || []) as WaMessage[]);
    };
    fetch();
  }, [customerId]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">📱 WhatsApp History</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">No messages sent yet</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="border-l-2 border-border pl-4 space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">📱 {m.message_type}</span>
              <span className="text-xs text-muted-foreground">
                {statusIcon[m.status] || ""} {m.status}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {new Date(m.sent_at).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })}
              {m.sent_by ? ` · Sent by ${m.sent_by}` : ""}
            </p>
            <p className="text-xs text-muted-foreground line-clamp-2">"{m.message_body}"</p>
          </div>
        ))}
        <Button size="sm" className="w-full mt-2" onClick={onSendMessage}>
          📲 Send Message
        </Button>
      </CardContent>
    </Card>
  );
};

export default WhatsAppHistory;
