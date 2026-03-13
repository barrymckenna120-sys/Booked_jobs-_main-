import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Send, SkipForward, CheckCircle2, MessageCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type UnsentQuote = {
  id: string;
  customer: string;
  phone: string;
  jobType: string;
  total: number;
  description: string;
  notes: string;
  quoteId: string;
  parts_cost: number | null;
  labour_cost: number | null;
  business_phone?: string;
};

const buildMsg = (q: UnsentQuote) => {
  const firstName = q.customer.split(" ")[0];
  const refNumber = `Q-${q.quoteId.slice(0, 4).toUpperCase()}`;
  const parts = Number(q.parts_cost || 0);
  const labour = Number(q.labour_cost || 0);
  const total = Number(q.total).toFixed(2);
  let breakdown = "";
  if (parts > 0) breakdown += `• Parts: €${parts.toFixed(2)}\n`;
  if (labour > 0) breakdown += `• Labour: €${labour.toFixed(2)}\n`;
  breakdown += `• Total: €${total}`;
  return `Hi ${firstName},\n\nHere is your quote from Karl's Gas.\n\nQuote Ref: ${refNumber}\n\nJob: ${q.description}\n\nBreakdown:\n${breakdown}\n\nTo accept this quote, simply reply *YES* to this message.\n\nThis quote is valid for 14 days from today.\n\nKarl's Gas${q.business_phone ? `\n📞 ${q.business_phone}` : ""}`;
};

interface SendAllQuotesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quotes: UnsentQuote[];
  onQuoteSent: (quoteId: string) => void;
}

export function SendAllQuotesSheet({ open, onOpenChange, quotes, onQuoteSent }: SendAllQuotesSheetProps) {
  const [sentIds, setSentIds] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [started, setStarted] = useState(false);
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const remaining = quotes.filter(q => !sentIds.includes(q.id) && !skipped.includes(q.id));
  const currentQ = remaining[0] || null;
  const totalValue = quotes.reduce((s, q) => s + q.total, 0);
  const isFinished = started && remaining.length === 0;
  const progress = quotes.length > 0 ? (sentIds.length / quotes.length) * 100 : 0;

  const sendCurrent = async () => {
    if (!currentQ || sending) return;
    setSending(true);
    if (!started) setStarted(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-quote-whatsapp", {
        body: {
          quote_id: currentQ.quoteId,
          customer_name: currentQ.customer,
          mobile_number: currentQ.phone,
          job_description: currentQ.description,
          quote_amount: currentQ.total,
          parts_cost: currentQ.parts_cost,
          labour_cost: currentQ.labour_cost,
          business_phone: currentQ.business_phone,
        },
      });
      if (error || !data?.success) {
        toast({ title: `Failed to send to ${currentQ.customer.split(" ")[0]}`, description: data?.error || error?.message || "Unknown error", variant: "destructive" });
      } else {
        setSentIds(p => [...p, currentQ.id]);
        onQuoteSent(currentQ.id);
        toast({ title: `Sent to ${currentQ.customer.split(" ")[0]} ✅` });
      }
    } catch (err: any) {
      toast({ title: "Send failed", description: err.message, variant: "destructive" });
    }
    setSending(false);
  };

  const skipCurrent = () => {
    if (!currentQ) return;
    setSkipped(p => [...p, currentQ.id]);
  };

  const handleClose = (v: boolean) => {
    if (!v) {
      setSentIds([]);
      setSkipped([]);
      setStarted(false);
    }
    onOpenChange(v);
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="w-full sm:max-w-[480px] overflow-y-auto p-0">
        <div className="p-5 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <SheetTitle className="text-xl font-extrabold">Send All Quotes</SheetTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {quotes.length} unsent · {sentIds.length} done · {remaining.length} left
              </p>
            </div>
            <span className="bg-accent text-primary font-extrabold text-sm px-3 py-1.5 rounded-xl">
              {sentIds.length}/{quotes.length}
            </span>
          </div>

          {/* Progress bar */}
          <Progress value={progress} className="h-1.5" />

          {/* Finished state */}
          {isFinished ? (
            <Card className="bg-success/10 border-success/20">
              <CardContent className="py-8 text-center space-y-3">
                <p className="text-5xl">🎉</p>
                <p className="text-xl font-extrabold text-success">All Quotes Sent!</p>
                <p className="text-sm text-muted-foreground">
                  {sentIds.length} quote{sentIds.length !== 1 ? "s" : ""} sent via WhatsApp.
                  {skipped.length > 0 && ` ${skipped.length} skipped.`}
                </p>
                <Card className="inline-block shadow-sm">
                  <CardContent className="py-2 px-4">
                    <p className="text-sm font-bold">
                      💰 Total value: €{quotes.filter(q => sentIds.includes(q.id)).reduce((s, q) => s + q.total, 0).toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Current quote card */}
              {currentQ && (
                <Card className={`border-2 transition-all ${started ? "border-[#25D366] shadow-[0_4px_20px_rgba(37,211,102,0.15)]" : "border-border"}`}>
                  <CardContent className="py-4 px-5 space-y-3">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      {started ? "📲 Now Sending" : "📋 Up First"}
                    </p>
                    <div>
                      <p className="text-lg font-extrabold">{currentQ.customer}</p>
                      <p className="text-sm text-muted-foreground">{currentQ.phone}</p>
                    </div>
                    {/* Message preview */}
                    <div className="bg-muted rounded-xl p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap border border-border">
                      {buildMsg(currentQ)}
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">{currentQ.jobType}</span>
                      <span className="text-base font-extrabold">€{currentQ.total.toLocaleString()}</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Send button */}
              <Button
                onClick={sendCurrent}
                disabled={sending}
                className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-extrabold py-6 text-lg"
                size="lg"
              >
                {sending ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Send className="w-5 h-5 mr-2" />}
                {sending ? "Sending..." : sentIds.length === 0
                  ? `Send to ${currentQ?.customer.split(" ")[0]}`
                  : `Next → ${currentQ?.customer.split(" ")[0]}`}
              </Button>

              {/* Skip button */}
              {currentQ && (
                <Button variant="outline" className="w-full" onClick={skipCurrent}>
                  <SkipForward className="w-4 h-4 mr-2" />
                  Skip {currentQ.customer.split(" ")[0]} for now
                </Button>
              )}
            </>
          )}

          {/* Queue list */}
          <div className="border-t border-border pt-4 space-y-2">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Queue</p>
            {quotes.map((q, i) => {
              const isSent = sentIds.includes(q.id);
              const isSkip = skipped.includes(q.id);
              const isNext = !isSent && !isSkip && q.id === currentQ?.id;
              return (
                <div
                  key={q.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border-[1.5px] transition-all ${
                    isNext ? "border-[#25D366] bg-success/5" :
                    isSent ? "border-success/30 bg-success/5" :
                    isSkip ? "border-border bg-muted opacity-45" :
                    "border-border bg-card"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white flex-shrink-0 ${
                    isSent ? "bg-success" : isNext ? "bg-[#25D366]" : "bg-border"
                  }`}>
                    {isSent ? "✓" : isNext ? "💬" : isSkip ? "—" : i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${isSent ? "text-success" : isNext ? "text-foreground font-bold" : "text-muted-foreground"}`}>
                      {q.customer}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">{q.jobType}</p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-sm font-extrabold">€{q.total}</p>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      isSent ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                    }`}>
                      {isSent ? "✓ Sent" : "Pending"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Total footer */}
          <Card className="shadow-sm">
            <CardContent className="py-3 px-4 flex justify-between items-center">
              <span className="text-sm font-semibold text-muted-foreground">Total quote value</span>
              <span className="text-lg font-black">€{totalValue.toLocaleString()}</span>
            </CardContent>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Send All Banner ──
interface SendAllBannerProps {
  unsentQuotes: UnsentQuote[];
  onSendAll: () => void;
}

export function SendAllBanner({ unsentQuotes, onSendAll }: SendAllBannerProps) {
  if (unsentQuotes.length === 0) return null;

  const totalValue = unsentQuotes.reduce((s, q) => s + q.total, 0);

  return (
    <Card className="border-2 border-[#25D366] shadow-[0_4px_24px_rgba(37,211,102,0.12)]">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#25D366] flex items-center justify-center flex-shrink-0">
            <MessageCircle className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="font-extrabold text-base">{unsentQuotes.length} Quotes Ready to Send</p>
            <p className="text-sm text-muted-foreground mt-1">
              Send all via WhatsApp in one flow. Total value: <strong className="text-foreground">€{totalValue.toLocaleString()}</strong>
            </p>
          </div>
        </div>

        {/* Mini preview */}
        <div className="space-y-1.5">
          {unsentQuotes.slice(0, 3).map(q => (
            <div key={q.id} className="flex justify-between items-center bg-muted rounded-lg px-3 py-2">
              <div>
                <span className="text-sm font-bold">{q.customer}</span>
                <span className="text-xs text-muted-foreground ml-2">{q.jobType}</span>
              </div>
              <span className="text-sm font-extrabold">€{q.total}</span>
            </div>
          ))}
          {unsentQuotes.length > 3 && (
            <p className="text-center text-xs text-muted-foreground font-semibold py-1">
              + {unsentQuotes.length - 3} more
            </p>
          )}
        </div>

        <Button
          onClick={onSendAll}
          className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-extrabold py-6 text-base"
          size="lg"
        >
          <Send className="w-5 h-5 mr-2" />
          Send All {unsentQuotes.length} Quotes via WhatsApp
        </Button>
      </CardContent>
    </Card>
  );
}


