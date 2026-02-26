import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChevronDown, ChevronUp, Loader2, RefreshCw, MessageCircle,
  CheckCircle2, CalendarCheck, Wallet, PhoneOff, AlertTriangle,
  Clock, Send, ArrowRight,
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { logAudit } from "@/lib/auditLog";
import { SendAllRemindersSheet, type ReminderCustomer } from "@/components/renewals/SendAllReminders";

/* ── Stage config ─────────────────────────────────────── */
const STAGE_CONFIG = {
  not_contacted: { label: "Not Contacted", Icon: PhoneOff,      textClass: "text-destructive",   bgClass: "bg-destructive/10", dotClass: "bg-destructive" },
  reminded:      { label: "Reminded",      Icon: MessageCircle, textClass: "text-warning",       bgClass: "bg-warning/10",     dotClass: "bg-warning" },
  confirmed:     { label: "Confirmed",     Icon: CheckCircle2,  textClass: "text-[#0891B2]",     bgClass: "bg-[#CFFAFE]",      dotClass: "bg-[#0891B2]" },
  booked:        { label: "Booked In",     Icon: CalendarCheck, textClass: "text-primary",       bgClass: "bg-primary/10",     dotClass: "bg-primary" },
  paid:          { label: "Paid",          Icon: Wallet,        textClass: "text-success",       bgClass: "bg-success/10",     dotClass: "bg-success" },
} as const;

type StageName = keyof typeof STAGE_CONFIG;
const STAGE_ORDER: Record<StageName, number> = { not_contacted: 0, reminded: 1, confirmed: 2, booked: 3, paid: 4 };

type RenewalCustomer = {
  id: string;
  name: string;
  phone: string;
  eircode: string;
  next_service_due: string;
  last_reminder_sent: string | null;
  renewal_stage: string;
  scheduled_service_date: string | null;
};

const TABS = [
  { id: "pipeline", label: "Pipeline" },
  { id: "left",     label: "Left to Book" },
  { id: "activity", label: "Activity" },
] as const;

const fmtDays = (d: number) => {
  if (d < 0)  return { text: "Overdue",   className: "text-destructive font-bold" };
  if (d === 0) return { text: "Today",     className: "text-destructive font-bold" };
  if (d === 1) return { text: "Tomorrow",  className: "text-warning font-semibold" };
  if (d <= 7)  return { text: `${d}d`,     className: "text-destructive font-semibold" };
  if (d <= 14) return { text: `${d}d`,     className: "text-warning font-semibold" };
  return { text: `${d}d`, className: "text-muted-foreground" };
};

/* ── Pipeline Row ─────────────────────────────────────── */
function PipelineRow({
  customer,
  days,
  stage,
  onRemind,
  onNavigate,
}: {
  customer: RenewalCustomer;
  days: number;
  stage: StageName;
  onRemind: (c: RenewalCustomer) => void;
  onNavigate: (id: string) => void;
}) {
  const sc = STAGE_CONFIG[stage];
  const dayInfo = fmtDays(days);
  const StageIcon = sc.Icon;

  return (
    <div className="flex items-center gap-2 py-2.5 px-3 border-b border-border/60 hover:bg-muted/40 transition-colors group">
      <span className={`w-2 h-2 rounded-full shrink-0 ${sc.dotClass}`} />

      <div className="flex-1 min-w-0">
        <button
          onClick={() => onNavigate(customer.id)}
          className="text-[13px] font-bold text-foreground truncate hover:underline text-left block w-full"
        >
          {customer.name}
        </button>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] text-muted-foreground/60">{customer.eircode?.split(" ")[0]}</span>
          {customer.scheduled_service_date && (
            <span className="text-[9px] font-bold bg-success/10 text-success rounded-full px-1.5 py-px flex items-center gap-0.5">
              <CalendarCheck className="w-2.5 h-2.5" />
              {format(new Date(customer.scheduled_service_date), "d MMM")}
            </span>
          )}
        </div>
      </div>

      <div className="text-right shrink-0">
        <div className={`text-[11px] font-bold ${dayInfo.className}`}>{dayInfo.text}</div>
        <div className="text-[10px] text-muted-foreground/60">{format(new Date(customer.next_service_due), "d MMM")}</div>
      </div>

      {stage === "not_contacted" ? (
        <button
          onClick={(e) => { e.stopPropagation(); onRemind(customer); }}
          className="shrink-0 px-2.5 py-1 rounded-lg border-[1.5px] border-[#25D366] bg-success/5 text-success text-[11px] font-bold hover:bg-success/10 transition-colors whitespace-nowrap flex items-center gap-1"
        >
          <MessageCircle className="w-3 h-3" /> Remind
        </button>
      ) : (
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap flex items-center gap-1 ${sc.bgClass} ${sc.textClass}`}>
          <StageIcon className="w-3 h-3" /> {sc.label}
        </span>
      )}
    </div>
  );
}

/* ── Main Card ─────────────────────────────────────── */
const RenewalsCard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<typeof TABS[number]["id"]>("pipeline");
  const [expanded, setExpanded] = useState(false);
  const [sendAllOpen, setSendAllOpen] = useState(false);

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["renewals-card"],
    queryFn: async () => {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      const { data } = await supabase
        .from("customers")
        .select("id, name, phone, eircode, next_service_due, last_reminder_sent, renewal_stage, scheduled_service_date")
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

  const { data: activityData = [] } = useQuery({
    queryKey: ["renewals-activity"],
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_log")
        .select("*")
        .eq("entity_type", "customer")
        .in("action_type", ["reminder_sent", "service_booked", "renewal_stage_change"])
        .order("created_at", { ascending: false })
        .limit(10);
      return data || [];
    },
    enabled: !!user && tab === "activity",
  });

  const now = new Date();
  const getDays = (d: string) => differenceInDays(new Date(d), now);
  const getStage = (c: RenewalCustomer): StageName => {
    const s = c.renewal_stage as StageName;
    return STAGE_ORDER[s] !== undefined ? s : "not_contacted";
  };

  const total = customers.length;
  const notContacted = customers.filter(c => getStage(c) === "not_contacted").length;
  const reminded = customers.filter(c => getStage(c) === "reminded").length;
  const confirmed = customers.filter(c => getStage(c) === "confirmed").length;
  const booked = customers.filter(c => getStage(c) === "booked").length;
  const paid = customers.filter(c => getStage(c) === "paid").length;
  const totalValue = total * servicePrice;
  const securedValue = (confirmed + booked + paid) * servicePrice;
  const leftToBook = customers.filter(c => ["not_contacted", "reminded"].includes(getStage(c)));

  const sorted = [...customers].sort((a, b) =>
    STAGE_ORDER[getStage(a)] - STAGE_ORDER[getStage(b)] || getDays(a.next_service_due) - getDays(b.next_service_due)
  );
  const visible = expanded ? sorted : sorted.slice(0, 6);

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
      `Hi ${firstName}, it's ${bizName}\n\nYour annual boiler service is due on ${dueDate}.\n\nReply YES to book or call us on ${bizPhone}.\n\n${bizName}`;

    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, "_blank");

    await supabase
      .from("customers")
      .update({ last_reminder_sent: new Date().toISOString(), renewal_stage: "reminded" } as any)
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

  const handleBatchSent = async (customerId: string) => {
    await supabase
      .from("customers")
      .update({ last_reminder_sent: new Date().toISOString(), renewal_stage: "reminded" } as any)
      .eq("id", customerId);
    queryClient.invalidateQueries({ queryKey: ["renewals-card"] });
  };

  const reminderQueue: ReminderCustomer[] = leftToBook.map(c => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    nextDue: c.next_service_due,
    daysUntil: getDays(c.next_service_due),
    status: getDays(c.next_service_due) <= 0 ? "Overdue" : getDays(c.next_service_due) <= 30 ? "Due Soon" : "Up to Date",
  }));

  const activityIcon = (action: string) => {
    if (action === "reminder_sent") return <MessageCircle className="w-3.5 h-3.5 text-warning" />;
    if (action === "service_booked") return <CalendarCheck className="w-3.5 h-3.5 text-primary" />;
    return <CheckCircle2 className="w-3.5 h-3.5 text-success" />;
  };

  return (
    <Card className="shadow-sm border-border/60 rounded-[22px] overflow-hidden" style={{ boxShadow: "0 6px 32px rgba(0,0,0,.08)" }}>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : total === 0 ? (
          <div className="text-center py-12 px-6">
            <CheckCircle2 className="w-8 h-8 text-success mx-auto" />
            <p className="font-bold text-foreground mt-2">All clear!</p>
            <p className="text-xs text-muted-foreground mt-1">No renewals due in the next 30 days.</p>
            <button onClick={() => navigate("/renewals")} className="text-xs text-primary hover:underline mt-3 inline-block">
              View all renewals →
            </button>
          </div>
        ) : (
          <>
            {/* ── Header ── */}
            <div className="p-4 pb-3 bg-gradient-to-br from-[hsl(var(--background))]/80 to-background border-b border-border/60">
              <div className="flex justify-between items-center mb-3">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-extrabold text-foreground flex items-center gap-1.5">
                      <RefreshCw className="w-4 h-4 text-primary" /> Renewals
                    </span>
                    <span className="text-[10px] font-bold bg-primary/10 text-primary rounded-full px-2 py-0.5">
                      Next 30 days
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground/60 mt-1">
                    {total} customers · €{totalValue.toLocaleString()} total value
                  </div>
                </div>
                <button
                  onClick={() => navigate("/renewals")}
                  className="text-[11px] font-bold text-primary hover:underline flex items-center gap-0.5"
                >
                  View All <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              {/* KPI blocks */}
              <div className="grid grid-cols-2 gap-2.5 mb-3">
                <div
                  className="rounded-2xl p-3.5 text-white"
                  style={{
                    background: "linear-gradient(135deg, hsl(217 70% 60%), hsl(224 72% 50%))",
                    boxShadow: "0 4px 16px hsla(217,70%,60%,.3)",
                  }}
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider opacity-65">Renewals Due</div>
                  <div className="text-[36px] md:text-[38px] font-black leading-none mt-1 tracking-tight">{total}</div>
                  <div className="text-[11px] opacity-65 mt-1 font-semibold">next 30 days</div>
                </div>
                <div
                  className="rounded-2xl p-3.5 text-white"
                  style={{
                    background: "linear-gradient(135deg, hsl(21 90% 48%), hsl(16 84% 40%))",
                    boxShadow: "0 4px 16px hsla(21,90%,48%,.3)",
                  }}
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider opacity-65">Value at Risk</div>
                  <div className="text-[28px] md:text-[30px] font-black leading-none mt-1 tracking-tight">€{totalValue.toLocaleString()}</div>
                  <div className="text-[11px] opacity-65 mt-1 font-semibold">€{securedValue} secured</div>
                </div>
              </div>

              {/* Pipeline progress bar */}
              <div className="mb-1">
                <div className="flex justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-muted-foreground">Pipeline Progress</span>
                  <span className="text-[11px] font-bold text-success">
                    {paid} paid · {booked} booked · {confirmed} confirmed
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-border overflow-hidden flex">
                  {[
                    { count: paid,      className: "bg-success" },
                    { count: booked,    className: "bg-primary" },
                    { count: confirmed, className: "bg-[#0891B2]" },
                    { count: reminded,  className: "bg-warning" },
                  ].map((s, i) =>
                    s.count > 0 ? (
                      <div
                        key={i}
                        className={`${s.className} transition-all duration-300`}
                        style={{ width: `${(s.count / total) * 100}%` }}
                      />
                    ) : null
                  )}
                </div>
                <div className="flex gap-2.5 mt-1.5 flex-wrap">
                  {[
                    { label: `${paid} Paid`,       dotClass: "bg-success",     textClass: "text-success" },
                    { label: `${booked} Booked`,   dotClass: "bg-primary",     textClass: "text-primary" },
                    { label: `${confirmed} Conf`,  dotClass: "bg-[#0891B2]",   textClass: "text-[#0891B2]" },
                    { label: `${reminded} Sent`,   dotClass: "bg-warning",     textClass: "text-warning" },
                    { label: `${notContacted} Left`, dotClass: "bg-destructive", textClass: "text-destructive" },
                  ].map(l => (
                    <div key={l.label} className="flex items-center gap-1">
                      <div className={`w-[7px] h-[7px] rounded-full ${l.dotClass}`} />
                      <span className={`text-[10px] font-bold ${l.textClass}`}>{l.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Tabs ── */}
            <div className="flex border-b border-border/60 bg-muted/30">
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex-1 py-2.5 px-2 text-[12px] font-semibold transition-all border-b-[2.5px] ${
                    tab === t.id
                      ? "font-extrabold text-primary border-primary"
                      : "text-muted-foreground border-transparent hover:text-foreground"
                  }`}
                >
                  {t.label}
                  {t.id === "left" && leftToBook.length > 0 && (
                    <span className="ml-1.5 text-[10px] font-extrabold bg-destructive text-white rounded-full px-1.5 py-px">
                      {leftToBook.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* ── Tab content ── */}
            {tab === "pipeline" && (
              <div>
                {visible.map(c => (
                  <PipelineRow
                    key={c.id}
                    customer={c}
                    days={getDays(c.next_service_due)}
                    stage={getStage(c)}
                    onRemind={sendReminder}
                    onNavigate={(id) => navigate(`/customers/${id}`)}
                  />
                ))}
                {sorted.length > 6 && (
                  <button
                    onClick={() => setExpanded(v => !v)}
                    className="w-full py-2.5 text-[12px] font-bold text-muted-foreground hover:text-foreground bg-muted/30 border-t border-border/60 flex items-center justify-center gap-1 transition-colors"
                  >
                    {expanded ? <><ChevronUp className="w-3.5 h-3.5" /> Show less</> : <><ChevronDown className="w-3.5 h-3.5" /> Show {sorted.length - 6} more</>}
                  </button>
                )}
              </div>
            )}

            {tab === "left" && (
              <div>
                {leftToBook.length === 0 ? (
                  <div className="py-8 text-center">
                    <CheckCircle2 className="w-7 h-7 text-success mx-auto mb-2" />
                    <div className="text-sm font-bold text-foreground">All contacted!</div>
                    <div className="text-xs text-muted-foreground mt-1">Everyone has been reached this month</div>
                  </div>
                ) : (
                  <>
                    <div className="px-3 py-2 text-[11px] font-bold text-destructive bg-destructive/5 border-b border-border/60 flex justify-between items-center">
                      <span className="flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> {leftToBook.length} customers still need contacting
                      </span>
                      <button
                        onClick={() => setSendAllOpen(true)}
                        className="bg-[#25D366] text-white rounded-lg px-2.5 py-1 text-[10px] font-bold hover:bg-[#20bd5a] transition-colors flex items-center gap-1"
                      >
                        <Send className="w-2.5 h-2.5" /> Send All
                      </button>
                    </div>
                    {leftToBook.map(c => (
                      <PipelineRow
                        key={c.id}
                        customer={c}
                        days={getDays(c.next_service_due)}
                        stage={getStage(c)}
                        onRemind={sendReminder}
                        onNavigate={(id) => navigate(`/customers/${id}`)}
                      />
                    ))}
                  </>
                )}
              </div>
            )}

            {tab === "activity" && (
              <div>
                {activityData.length === 0 ? (
                  <div className="py-8 text-center">
                    <Clock className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
                    <div className="text-xs text-muted-foreground">No renewal activity yet</div>
                  </div>
                ) : (
                  activityData.map((a: any) => (
                    <div key={a.id} className="flex items-start gap-2.5 py-2.5 px-3 border-b border-border/60">
                      <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        {activityIcon(a.action_type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold text-foreground leading-snug">{a.detail}</div>
                        <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                          {format(new Date(a.created_at), "d MMM, h:mma")}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── Footer ── */}
            <div className="p-3 border-t border-border/60 bg-muted/30 flex gap-2">
              <Button
                size="sm"
                className="flex-1 text-xs font-extrabold"
                style={{
                  background: "linear-gradient(135deg, hsl(142 71% 45%), hsl(142 76% 36%))",
                  color: "white",
                  boxShadow: "0 4px 12px hsla(142,71%,45%,.3)",
                }}
                onClick={() => setSendAllOpen(true)}
              >
                <Send className="w-3.5 h-3.5 mr-1" /> Send All Reminders
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs font-bold"
                onClick={() => navigate("/renewals")}
              >
                Renewals <ArrowRight className="w-3 h-3 ml-1" />
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
