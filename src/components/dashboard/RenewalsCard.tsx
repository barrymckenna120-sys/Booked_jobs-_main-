import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, ChevronRight, ChevronDown, Loader2 } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { logAudit } from "@/lib/auditLog";
import { SendAllRemindersSheet, type ReminderCustomer } from "@/components/renewals/SendAllReminders";

type RenewalCustomer = {
  id: string;
  name: string;
  phone: string;
  eircode: string;
  next_service_due: string;
  last_reminder_sent: string | null;
};

const RenewalsCard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [sendAllOpen, setSendAllOpen] = useState(false);

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["renewals-card"],
    queryFn: async () => {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      const { data } = await supabase
        .from("customers")
        .select("id, name, phone, eircode, next_service_due, last_reminder_sent")
        .lte("next_service_due", thirtyDaysFromNow.toISOString().split("T")[0])
        .not("next_service_due", "is", null)
        .order("next_service_due", { ascending: true });

      return (data || []) as RenewalCustomer[];
    },
    enabled: !!user,
    refetchInterval: 60000,
  });

  const { data: settings } = useQuery({
    queryKey: ["renewals-card-settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("settings")
        .select("default_service_price, template_renewal_reminder, business_phone, business_name, whatsapp_number")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const servicePrice = settings?.default_service_price || 120;

  const now = new Date();
  const getDays = (d: string) => differenceInDays(new Date(d), now);
  const isContacted = (c: RenewalCustomer) =>
    sentIds.has(c.id) || (c.last_reminder_sent && differenceInDays(now, new Date(c.last_reminder_sent)) <= 30);

  const urgent = customers.filter((c) => getDays(c.next_service_due) <= 7);
  const upcoming = customers.filter((c) => getDays(c.next_service_due) > 7);
  const notContacted = customers.filter((c) => !isContacted(c)).length;
  const reminded = customers.filter((c) => isContacted(c)).length;
  const valueAtRisk = customers.length * servicePrice;

  const sendReminder = async (customer: RenewalCustomer) => {
    const firstName = customer.name.split(" ")[0];
    const dueDate = format(new Date(customer.next_service_due), "d MMM yyyy");
    const cleanPhone = customer.phone.replace(/\s+/g, "").replace(/^0/, "353");
    const bizPhone = settings?.business_phone || "087 100 0000";
    const bizName = settings?.business_name || "Karl's Gas";

    const message =
      settings?.template_renewal_reminder
        ?.replace(/\{\{name\}\}/g, firstName)
        ?.replace(/\{\{date\}\}/g, dueDate)
        ?.replace(/\{\{due_date\}\}/g, dueDate)
        ?.replace(/\{\{phone\}\}/g, bizPhone) ||
      `Hi ${firstName}, it's ${bizName} 🔥\n\nYour annual boiler service is due on ${dueDate}.\n\nReply YES to book or call us on ${bizPhone}.\n\n${bizName}`;

    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, "_blank");

    setSentIds((prev) => new Set(prev).add(customer.id));

    await supabase
      .from("customers")
      .update({ last_reminder_sent: new Date().toISOString() } as any)
      .eq("id", customer.id);

    logAudit({
      action_type: "reminder_sent",
      entity_type: "customer",
      entity_id: customer.id,
      detail: `Renewal reminder sent to ${customer.name} via WhatsApp`,
      metadata: { dueDate: customer.next_service_due, method: "dashboard_card" },
    });

    queryClient.invalidateQueries({ queryKey: ["renewals-card"] });
    toast({ title: `Reminder sent to ${customer.name}` });
  };

  const allRows = [...urgent, ...upcoming];
  const visibleRows = expanded ? allRows : allRows.slice(0, 5);
  const hiddenCount = allRows.length - 5;

  const reminderQueue: ReminderCustomer[] = customers
    .filter((c) => !isContacted(c))
    .map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      nextDue: c.next_service_due,
      daysUntil: getDays(c.next_service_due),
      status: getDays(c.next_service_due) <= 0 ? "Overdue" : getDays(c.next_service_due) <= 30 ? "Due Soon" : "Up to Date",
    }));

  const handleBatchSent = async (customerId: string) => {
    const c = customers.find((x) => x.id === customerId);
    if (!c) return;
    setSentIds((prev) => new Set(prev).add(customerId));
    await supabase
      .from("customers")
      .update({ last_reminder_sent: new Date().toISOString() } as any)
      .eq("id", customerId);
    queryClient.invalidateQueries({ queryKey: ["renewals-card"] });
  };

  const dotColor = (days: number) =>
    days <= 0 ? "bg-destructive" : days <= 7 ? "bg-destructive" : days <= 14 ? "bg-warning" : "bg-success";
  const dateColor = (days: number) =>
    days <= 0 ? "text-destructive font-bold" : days <= 7 ? "text-destructive font-bold" : days <= 14 ? "text-warning font-semibold" : "text-muted-foreground";
  const formatDaysLabel = (days: number) => {
    if (days < 0) return { text: "Overdue", className: "text-destructive font-bold" };
    if (days === 0) return { text: "Today", className: "text-destructive font-bold" };
    if (days === 1) return { text: "Tomorrow", className: "text-warning font-semibold" };
    return { text: `${days}d`, className: "text-muted-foreground/50" };
  };

  const renderRow = (c: RenewalCustomer) => {
    const days = getDays(c.next_service_due);
    const contacted = isContacted(c);
    const wasPreviouslyContacted = c.last_reminder_sent && !sentIds.has(c.id);

    return (
      <div
        key={c.id}
        className="flex items-center gap-2.5 py-2 px-2 rounded-lg hover:bg-primary/5 transition-colors group"
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor(days)}`} />
        <button
          onClick={() => navigate(`/customers/${c.id}`)}
          className="text-[13px] font-semibold text-foreground truncate hover:underline text-left min-w-0 flex-1"
        >
          {c.name}
        </button>
        <span className="text-[11px] text-muted-foreground/60 shrink-0">{c.eircode?.split(" ")[0]}</span>
        <span className={`text-xs shrink-0 ${dateColor(days)}`}>
          {format(new Date(c.next_service_due), "d MMM")}
        </span>
        <span className={`text-[10px] shrink-0 text-right ${formatDaysLabel(days).className}`}>{formatDaysLabel(days).text}</span>

        {contacted ? (
          <span className="text-[11px] text-muted-foreground border border-border rounded-md px-2 py-0.5 shrink-0">
            ✓ Sent
          </span>
        ) : wasPreviouslyContacted ? (
          <button
            onClick={() => sendReminder(c)}
            className="text-[11px] text-muted-foreground border border-border rounded-md px-2 py-0.5 shrink-0 hover:bg-muted transition-colors"
          >
            ↩ Resend
          </button>
        ) : (
          <button
            onClick={() => sendReminder(c)}
            className="text-[11px] font-semibold text-success border border-success/40 bg-success/5 rounded-md px-2 py-0.5 shrink-0 hover:bg-success/10 transition-colors"
          >
            💬 Remind
          </button>
        )}
      </div>
    );
  };

  return (
    <Card className="shadow-sm border-border/60 rounded-[20px]" style={{ boxShadow: "0 2px 16px rgba(0,0,0,.06)" }}>
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Renewals Due</h3>
            <span className="text-[10px] text-muted-foreground/60 font-medium">Next 30 days</span>
          </div>
          <button
            onClick={() => navigate("/renewals")}
            className="text-xs font-bold text-primary flex items-center gap-0.5 hover:underline"
          >
            View All <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground/60 mb-4">
          {customers.length} customer{customers.length !== 1 ? "s" : ""} · tap 💬 to send reminder
        </p>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : customers.length === 0 ? (
          <div className="text-center py-10">
            <span className="text-3xl">✅</span>
            <p className="font-bold text-foreground mt-2">All clear!</p>
            <p className="text-xs text-muted-foreground mt-1">No renewals due in the next 30 days.</p>
            <button onClick={() => navigate("/renewals")} className="text-xs text-primary hover:underline mt-3 inline-block">
              View all renewals →
            </button>
          </div>
        ) : (
          <>
            {/* KPI blocks */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div
                className="rounded-2xl p-4 text-white"
                style={{
                  background: "linear-gradient(135deg, hsl(217 70% 60%), hsl(224 72% 50%))",
                  boxShadow: "0 6px 20px hsla(217,70%,60%,.3)",
                }}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">Renewals Due</div>
                <div className="text-[36px] md:text-[48px] font-black leading-none mt-1">{customers.length}</div>
                <div className="text-[11px] opacity-70 mt-1">next 30 days</div>
              </div>
              <div
                className="rounded-2xl p-4 text-white"
                style={{
                  background: "linear-gradient(135deg, hsl(21 90% 48%), hsl(16 84% 40%))",
                  boxShadow: "0 6px 20px hsla(21,90%,48%,.3)",
                }}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">Value at Risk</div>
                <div className="text-[28px] md:text-[38px] font-black leading-none mt-1">€{valueAtRisk.toLocaleString()}</div>
                <div className="text-[11px] opacity-70 mt-1">if none book · avg €{servicePrice}</div>
              </div>
            </div>

            {/* Stat chips */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="rounded-xl p-3 flex items-center gap-2.5" style={{ background: "hsl(0 93% 94%)" }}>
                <span className="text-lg">📵</span>
                <div>
                  <div className="text-lg font-black text-foreground leading-none">{notContacted}</div>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-destructive/80 mt-0.5">Not Contacted</div>
                </div>
              </div>
              <div className="rounded-xl p-3 flex items-center gap-2.5" style={{ background: "hsl(141 79% 93%)" }}>
                <span className="text-lg">✅</span>
                <div>
                  <div className="text-lg font-black text-foreground leading-none">{reminded}</div>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-success/80 mt-0.5">Reminded</div>
                </div>
              </div>
            </div>

            {/* Customer list */}
            <div className="space-y-0">
              {urgent.length > 0 && (
                <>
                  <div
                    className="text-[10px] font-bold uppercase tracking-wider px-2 py-1.5 rounded-md mb-1"
                    style={{ background: "hsl(0 100% 97%)", color: "hsl(0 72% 51%)" }}
                  >
                    🚨 Urgent — Due this week
                  </div>
                  {urgent.filter((c) => visibleRows.includes(c)).map(renderRow)}
                </>
              )}
              {upcoming.length > 0 && visibleRows.some((c) => upcoming.includes(c)) && (
                <>
                  <div
                    className="text-[10px] font-bold uppercase tracking-wider px-2 py-1.5 rounded-md mb-1 mt-2"
                    style={{ background: "hsl(40 100% 97%)", color: "hsl(32 95% 44%)" }}
                  >
                    📅 Coming up — Next 30 days
                  </div>
                  {upcoming.filter((c) => visibleRows.includes(c)).map(renderRow)}
                </>
              )}
            </div>

            {/* Show more */}
            {hiddenCount > 0 && !expanded && (
              <button
                onClick={() => setExpanded(true)}
                className="w-full text-center text-xs text-primary font-semibold py-2 mt-1 hover:underline flex items-center justify-center gap-1"
              >
                <ChevronDown className="w-3.5 h-3.5" /> Show {hiddenCount} more
              </button>
            )}

            {/* Footer buttons */}
            <div className="flex gap-2 mt-4 pt-3 border-t border-border/60">
              <Button
                size="sm"
                className="flex-1 text-xs font-bold"
                style={{
                  background: "linear-gradient(135deg, hsl(142 71% 45%), hsl(142 76% 36%))",
                  color: "white",
                }}
                onClick={() => setSendAllOpen(true)}
              >
                💬 Send All Reminders
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="flex-1 text-xs font-semibold"
                onClick={() => navigate("/renewals")}
              >
                Renewals →
              </Button>
            </div>
          </>
        )}
      </CardContent>

      <SendAllRemindersSheet
        open={sendAllOpen}
        onOpenChange={setSendAllOpen}
        customers={reminderQueue}
        onReminderSent={handleBatchSent}
      />
    </Card>
  );
};

export default RenewalsCard;
