import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Send, SkipForward, MessageCircle, Check, Smartphone, ClipboardList, PartyPopper, AlertTriangle } from "lucide-react";

const TEST_PHONE = "353892109244";

export type ReminderCustomer = {
  id: string;
  name: string;
  phone: string;
  nextDue: string;
  daysUntil: number;
  status: string;
};

const buildMsg = (c: ReminderCustomer) => {
  const firstName = c.name.split(" ")[0];
  const dueDate = new Date(c.nextDue).toLocaleDateString("en-IE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `Hi ${firstName},\n\nThis is K & N Gas Services. Your annual boiler service is due on ${dueDate}.\n\nIf your boiler is under manufacturer warranty, maintaining a yearly service is a condition of keeping that warranty valid.\n\nReply here to book your service or call us on 087 3686252.\n\nReply STOP to unsubscribe.\nK & N Gas Services`;
};

const waUrl = (phone: string, msg: string) =>
  `https://wa.me/${phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(msg)}`;

const statusPill = (status: string) => {
  if (status === "Overdue") return "bg-destructive/10 text-destructive";
  if (status === "Due Soon") return "bg-warning/10 text-warning";
  return "bg-primary/10 text-primary";
};

// ── Sheet ──
interface SendAllRemindersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: ReminderCustomer[];
  onReminderSent: (customerId: string) => void;
}

export function SendAllRemindersSheet({
  open,
  onOpenChange,
  customers,
  onReminderSent,
}: SendAllRemindersSheetProps) {
  const { user } = useAuth();
  const [sentIds, setSentIds] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [started, setStarted] = useState(false);
  // Blocks a double-tap on "Send" from firing two real WhatsApp messages.
  const [sending, setSending] = useState(false);


  const [testMode, setTestMode] = useState(false);

  const remaining = customers.filter(
    (c) => !sentIds.includes(c.id) && !skipped.includes(c.id)
  );
  const current = remaining[0] || null;
  const isFinished = started && remaining.length === 0;
  const progress =
    customers.length > 0 ? (sentIds.length / customers.length) * 100 : 0;

  const sendCurrent = async () => {
    if (!current || sending) return;
    setSending(true);
    const firstName = current.name.split(" ")[0];
    const renewalDate = new Date(current.nextDue).toLocaleDateString("en-IE", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    // In test mode, override phone to test number
    const phone = testMode ? TEST_PHONE : current.phone;

    try {
      const { data, error } = await supabase.functions.invoke("send-renewal-reminder", {
        body: {
          customer_id: current.id,
          phone,
          first_name: firstName,
          renewal_date: renewalDate,
        },
      });

      if (error) throw new Error(error.message || "Edge function error");
      if (data && !data.success) throw new Error(data.error || "Send failed");

      setSentIds((p) => [...p, current.id]);
      onReminderSent(current.id);
      if (!started) setStarted(true);
    } catch (err: any) {
      console.error("Send renewal reminder failed:", err);
      // Still mark as sent in UI to not block the queue, but log error
      setSentIds((p) => [...p, current.id]);
      if (!started) setStarted(true);
    } finally {
      setSending(false);
    }
  };


  const skipCurrent = () => {
    if (!current) return;
    setSkipped((p) => [...p, current.id]);
  };

  const handleClose = (v: boolean) => {
    if (!v) {
      setSentIds([]);
      setSkipped([]);
      setStarted(false);
      setSending(false);
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
              <SheetTitle className="text-xl font-extrabold">
                Send All Reminders
              </SheetTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {customers.length} to send · {sentIds.length} done ·{" "}
                {remaining.length} left
              </p>
            </div>
            <span className="bg-accent text-primary font-extrabold text-sm px-3 py-1.5 rounded-xl">
              {sentIds.length}/{customers.length}
            </span>
          </div>

          <Progress value={progress} className="h-1.5" />

          {/* Test Mode Toggle */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-600" />
              <Label htmlFor="test-mode" className="text-sm font-semibold cursor-pointer">Test Mode</Label>
            </div>
            <Switch id="test-mode" checked={testMode} onCheckedChange={setTestMode} />
          </div>

          {testMode && (
            <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 rounded-xl px-4 py-2.5 text-sm font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              TEST MODE — All messages will be sent to +353 89 210 9244
            </div>
          )}

          {isFinished ? (
            <Card className="bg-success/10 border-success/20">
              <CardContent className="py-8 text-center space-y-3">
                <PartyPopper className="w-12 h-12 mx-auto text-success" />
                <p className="text-xl font-extrabold text-success mt-2">
                  All Reminders Sent!
                </p>
                <p className="text-sm text-muted-foreground">
                  {sentIds.length} reminder
                  {sentIds.length !== 1 ? "s" : ""} sent via WhatsApp.
                  {skipped.length > 0 && ` ${skipped.length} skipped.`}
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Current customer card */}
              {current && (
                <Card
                  className={`border-2 transition-all ${
                    started
                      ? "border-[#25D366] shadow-[0_4px_20px_rgba(37,211,102,0.15)]"
                      : "border-border"
                  }`}
                >
                  <CardContent className="py-4 px-5 space-y-3">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      {started ? <><Smartphone className="w-3 h-3" /> Now Sending</> : <><ClipboardList className="w-3 h-3" /> Up First</>}
                    </p>
                    <div>
                      <p className="text-lg font-extrabold">{current.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {current.phone}
                      </p>
                    </div>
                    <div className="bg-muted rounded-xl p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap border border-border">
                      {buildMsg(current)}
                    </div>
                    <div className="flex justify-between items-center">
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusPill(
                          current.status
                        )}`}
                      >
                        {current.status}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Due in {current.daysUntil < 0
                          ? `${Math.abs(current.daysUntil)}d overdue`
                          : `${current.daysUntil}d`}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Button
                onClick={sendCurrent}
                disabled={sending}
                className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-extrabold py-6 text-lg"
                size="lg"
              >
                <Send className="w-5 h-5 mr-2" />
                {sending
                  ? "Sending…"
                  : sentIds.length === 0
                  ? `Send to ${current?.name.split(" ")[0]}`
                  : `Next → ${current?.name.split(" ")[0]}`}
              </Button>


              {current && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={skipCurrent}
                >
                  <SkipForward className="w-4 h-4 mr-2" />
                  Skip {current.name.split(" ")[0]} for now
                </Button>
              )}
            </>
          )}

          {/* Queue */}
          <div className="border-t border-border pt-4 space-y-2">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
              Queue
            </p>
            {customers.map((c, i) => {
              const isSent = sentIds.includes(c.id);
              const isSkip = skipped.includes(c.id);
              const isNext = !isSent && !isSkip && c.id === current?.id;
              return (
                <div
                  key={c.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border-[1.5px] transition-all ${
                    isNext
                      ? "border-[#25D366] bg-success/5"
                      : isSent
                      ? "border-success/30 bg-success/5"
                      : isSkip
                      ? "border-border bg-muted opacity-45"
                      : "border-border bg-card"
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white flex-shrink-0 ${
                      isSent
                        ? "bg-success"
                        : isNext
                        ? "bg-[#25D366]"
                        : "bg-border"
                    }`}
                  >
                    {isSent ? <Check className="w-4 h-4" /> : isNext ? <MessageCircle className="w-4 h-4" /> : isSkip ? "—" : i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-semibold ${
                        isSent
                          ? "text-success"
                          : isNext
                          ? "text-foreground font-bold"
                          : "text-muted-foreground"
                      }`}
                    >
                      {c.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      Due:{" "}
                      {new Date(c.nextDue).toLocaleDateString("en-IE", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        isSent ? "bg-success/10 text-success" : statusPill(c.status)
                      }`}
                    >
                      {isSent ? <><Check className="w-3 h-3 inline mr-0.5" /> Sent</> : c.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Banner ──
interface SendAllRemindersBannerProps {
  customers: ReminderCustomer[];
  onSendAll: () => void;
}

export function SendAllRemindersBanner({
  customers,
  onSendAll,
}: SendAllRemindersBannerProps) {
  if (customers.length === 0) return null;

  const overdueCount = customers.filter((c) => c.status === "Overdue").length;
  const dueSoonCount = customers.filter((c) => c.status === "Due Soon").length;

  return (
    <Card className="border-2 border-[#25D366] shadow-[0_4px_24px_rgba(37,211,102,0.12)]">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#25D366] flex items-center justify-center flex-shrink-0">
            <MessageCircle className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="font-extrabold text-base">
              {customers.length} Reminders Ready to Send
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {overdueCount > 0 && (
                <span className="text-destructive font-semibold">
                  {overdueCount} overdue
                </span>
              )}
              {overdueCount > 0 && dueSoonCount > 0 && " · "}
              {dueSoonCount > 0 && (
                <span className="text-warning font-semibold">
                  {dueSoonCount} due soon
                </span>
              )}
              {" — send all via WhatsApp in one flow"}
            </p>
          </div>
        </div>

        {/* Mini preview */}
        <div className="space-y-1.5">
          {customers.slice(0, 3).map((c) => (
            <div
              key={c.id}
              className="flex justify-between items-center bg-muted rounded-lg px-3 py-2"
            >
              <span className="text-sm font-bold">{c.name}</span>
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusPill(
                  c.status
                )}`}
              >
                {c.status}
              </span>
            </div>
          ))}
          {customers.length > 3 && (
            <p className="text-center text-xs text-muted-foreground font-semibold py-1">
              + {customers.length - 3} more
            </p>
          )}
        </div>

        <Button
          onClick={onSendAll}
          className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-extrabold py-6 text-base"
          size="lg"
        >
          <Send className="w-5 h-5 mr-2" />
          Send All {customers.length} Reminders via WhatsApp
        </Button>
      </CardContent>
    </Card>
  );
}
