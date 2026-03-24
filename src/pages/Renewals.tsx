import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  RefreshCw, Search, AlertTriangle, Clock, CheckCircle2, Smartphone, Send,
  PhoneOff, MessageCircle, CalendarCheck, Wallet, Archive, ArchiveRestore,
} from "lucide-react";
import RenewalCard from "@/components/renewals/RenewalCard";
import RenewalDetailSheet from "@/components/renewals/RenewalDetailSheet";
import BookServiceSheet from "@/components/renewals/BookServiceSheet";
import { SendAllRemindersSheet, type ReminderCustomer } from "@/components/renewals/SendAllReminders";
import RenewalsHeroStats from "@/components/renewals/RenewalsHeroStats";
import UrgentList from "@/components/renewals/UrgentList";
import MonthlyBreakdown from "@/components/renewals/MonthlyBreakdown";
import SendServiceReminders from "@/components/renewals/SendServiceReminders";
import { formatDistanceToNow, isToday, differenceInDays, addDays, startOfWeek, endOfWeek } from "date-fns";

type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string;
  eircode: string;
  last_service_date: string | null;
  next_service_due: string | null;
  assigned_engineer: string | null;
  reminder_30_days_sent: boolean | null;
  service_status: string | null;
  last_reminder_sent: string | null;
  renewal_stage: string | null;
  is_archived: boolean;
};

const STATUS_FILTERS = ["All", "Overdue", "Due Soon", "Up to Date", "Contacted"] as const;
type StatusFilterType = typeof STATUS_FILTERS[number];

const STAGE_FILTERS = ["All Stages", "Not Contacted", "Reminded", "Confirmed", "Booked", "Paid"] as const;
type StageFilterType = typeof STAGE_FILTERS[number];

const STAGE_TO_KEY: Record<string, string> = {
  "Not Contacted": "not_contacted",
  "Reminded": "reminded",
  "Confirmed": "confirmed",
  "Booked": "booked",
  "Paid": "paid",
};

const STAGE_ICONS: Record<string, React.ReactNode> = {
  "All Stages": <RefreshCw className="w-3 h-3" />,
  "Not Contacted": <PhoneOff className="w-3 h-3" />,
  "Reminded": <MessageCircle className="w-3 h-3" />,
  "Confirmed": <CheckCircle2 className="w-3 h-3" />,
  "Booked": <CalendarCheck className="w-3 h-3" />,
  "Paid": <Wallet className="w-3 h-3" />,
};

const stageFilterStyles: Record<string, { active: string; inactive: string }> = {
  "All Stages":    { active: "border-primary bg-primary/10 text-primary", inactive: "border-border text-muted-foreground" },
  "Not Contacted": { active: "border-destructive bg-destructive/10 text-destructive", inactive: "border-border text-muted-foreground" },
  "Reminded":      { active: "border-warning bg-warning/10 text-warning", inactive: "border-border text-muted-foreground" },
  "Confirmed":     { active: "border-[#0891B2] bg-[#CFFAFE] text-[#0891B2]", inactive: "border-border text-muted-foreground" },
  "Booked":        { active: "border-primary bg-primary/10 text-primary", inactive: "border-border text-muted-foreground" },
  "Paid":          { active: "border-success bg-success/10 text-success", inactive: "border-border text-muted-foreground" },
};

const filterStyles: Record<string, { active: string; inactive: string }> = {
  All:          { active: "border-primary bg-primary/10 text-primary", inactive: "border-border text-muted-foreground" },
  Overdue:      { active: "border-destructive bg-destructive/10 text-destructive", inactive: "border-border text-muted-foreground" },
  "Due Soon":   { active: "border-warning bg-warning/10 text-warning", inactive: "border-border text-muted-foreground" },
  "Up to Date": { active: "border-success bg-success/10 text-success", inactive: "border-border text-muted-foreground" },
  Contacted:    { active: "border-primary bg-primary/10 text-primary", inactive: "border-border text-muted-foreground" },
};

const getStatus = (daysUntil: number): string => {
  if (daysUntil < 0) return "Overdue";
  if (daysUntil <= 30) return "Due Soon";
  return "Up to Date";
};

const getDaysUntil = (nextDue: string | null): number => {
  if (!nextDue) return 999;
  return Math.ceil((new Date(nextDue).getTime() - Date.now()) / 86400000);
};

const isContactedRecently = (lastSent: string | null): boolean => {
  if (!lastSent) return false;
  return differenceInDays(new Date(), new Date(lastSent)) <= 30;
};

const Renewals = () => {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<{ business_name?: string; whatsapp_number?: string; template_renewal_reminder?: string; default_service_price?: number } | null>(null);
  const urlParams = new URLSearchParams(window.location.search);
  const initialFilter = urlParams.get("status") || "Overdue";
  const [filter, setFilter] = useState<StatusFilterType>(initialFilter as StatusFilterType);
  const [stageFilter, setStageFilter] = useState<StageFilterType>("All Stages");
  const [search, setSearch] = useState("");
  const [postcodeFilter, setPostcodeFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState(String(new Date().getMonth()));
  const [reminderSent, setReminderSent] = useState<Record<string, boolean>>({});
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [bookCustomer, setBookCustomer] = useState<Customer | null>(null);
  const [sendAllOpen, setSendAllOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState<{ id: string; name: string; archive: boolean } | null>(null);
  const [failedCustomerIds, setFailedCustomerIds] = useState<Set<string>>(new Set());

  const fetchCustomers = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("customers")
      .select("*")
      .eq("user_id", user.id)
      .not("next_service_due", "is", null)
      .order("next_service_due", { ascending: true });
    setCustomers((data || []) as Customer[]);
    setLoading(false);
  }, [user]);

  const fetchSettings = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("settings")
      .select("business_name, whatsapp_number, template_renewal_reminder, default_service_price")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) setSettings(data);
  }, [user]);

  useEffect(() => { fetchCustomers(); fetchSettings(); }, [fetchCustomers, fetchSettings]);

  // Fetch failed renewal message logs
  useEffect(() => {
    if (!customers.length) return;
    const ids = customers.map(c => c.id);
    supabase
      .from("message_log")
      .select("customer_id")
      .eq("related_type", "renewal")
      .eq("status", "failed")
      .in("customer_id", ids)
      .then(({ data }) => {
        setFailedCustomerIds(new Set((data || []).map((r: any) => r.customer_id)));
      });
  }, [customers]);

  // Auto-refresh every 30s so counters stay current
  useEffect(() => {
    const interval = setInterval(fetchCustomers, 30000);
    return () => clearInterval(interval);
  }, [fetchCustomers]);

  if (authLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  const businessName = settings?.business_name || "BookedJobs";
  const servicePrice = settings?.default_service_price || 120;

  // Separate active vs archived customers
  const activeCustomers = customers.filter(c => !c.is_archived);
  const archivedCustomers = customers.filter(c => c.is_archived);

  const withStatus = (showArchived ? archivedCustomers : activeCustomers).map((c) => {
    const daysUntil = getDaysUntil(c.next_service_due);
    const stage = c.renewal_stage || "not_contacted";
    return { ...c, daysUntil, renewalStatus: getStatus(daysUntil), contactedRecently: isContactedRecently(c.last_reminder_sent), stage };
  });

  // Customers with stage "booked" or "paid" are resolved — exclude from overdue/due-soon
  const isResolved = (c: typeof withStatus[0]) => c.stage === "booked" || c.stage === "paid";

  const filtered = withStatus
    .filter((c) => showArchived ? true : !isResolved(c)) // In archived view, show all
    .filter((c) => {
      if (filter === "All") return true;
      if (filter === "Contacted") return c.contactedRecently || reminderSent[c.id];
      return c.renewalStatus === filter;
    })
    .filter((c) => {
      if (stageFilter === "All Stages") return true;
      return c.stage === STAGE_TO_KEY[stageFilter];
    })
    .filter((c) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return c.name.toLowerCase().includes(q) || c.address.toLowerCase().includes(q);
    })
    .sort((a, b) => a.daysUntil - b.daysUntil);

  const counts = {
    overdue: withStatus.filter((c) => c.renewalStatus === "Overdue" && !isResolved(c)).length,
    dueSoon: withStatus.filter((c) => c.renewalStatus === "Due Soon" && !isResolved(c)).length,
    upToDate: withStatus.filter((c) => c.renewalStatus === "Up to Date" || isResolved(c)).length,
    contacted: withStatus.filter((c) => c.contactedRecently || reminderSent[c.id]).length,
    needReminder: withStatus.filter((c) => !c.contactedRecently && !reminderSent[c.id] && c.renewalStatus !== "Up to Date" && !isResolved(c)).length,
  };

  const stageCounts: Record<string, number> = {
    "All Stages": withStatus.length,
    "Not Contacted": withStatus.filter(c => c.stage === "not_contacted").length,
    "Reminded": withStatus.filter(c => c.stage === "reminded").length,
    "Confirmed": withStatus.filter(c => c.stage === "confirmed").length,
    "Booked": withStatus.filter(c => c.stage === "booked").length,
    "Paid": withStatus.filter(c => c.stage === "paid").length,
  };

  // Pipeline progress
  const total = withStatus.length;
  const paidCount = stageCounts["Paid"];
  const bookedCount = stageCounts["Booked"];
  const confirmedCount = stageCounts["Confirmed"];
  const remindedCount = stageCounts["Reminded"];

  // Hero stats - due in next 30 days (exclude resolved)
  const dueIn30Unresolved = withStatus.filter(c => c.daysUntil <= 30 && !isResolved(c));
  const dueIn30 = dueIn30Unresolved.length;
  const valueAtRisk = dueIn30 * servicePrice;
  const notContactedCount = dueIn30Unresolved.filter(c => c.stage === "not_contacted").length;
  const remindedIn30 = dueIn30Unresolved.filter(c => c.stage === "reminded").length;

  // Urgent - due this week
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
  const urgentCustomers = withStatus
    .filter(c => {
      if (isResolved(c)) return false;
      if (!c.next_service_due) return false;
      const dueDate = new Date(c.next_service_due);
      return dueDate <= weekEnd;
    })
    .sort((a, b) => a.daysUntil - b.daysUntil);

  const urgentNeedReminder = urgentCustomers.filter(c => c.stage === "not_contacted" && !reminderSent[c.id]).length;

  const buildReminderMessage = (customer: Customer) => {
    const firstName = customer.name.split(" ")[0];
    const nextDue = customer.next_service_due
      ? new Date(customer.next_service_due).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })
      : "soon";

    if (settings?.template_renewal_reminder) {
      return settings.template_renewal_reminder
        .replace(/\{\{name\}\}/g, firstName)
        .replace(/\{\{date\}\}/g, nextDue)
        .replace(/\{\{phone\}\}/g, settings.whatsapp_number || "");
    }

    return `Hi ${firstName},\n\nYour annual boiler service is due on ${nextDue}.\n\nRegular servicing keeps your boiler efficient, safe and your warranty valid.\n\nReply YES to book or call us on ${settings?.whatsapp_number || "our number"}.\n\n${businessName}`;
  };

  const markAsContacted = async (customerId: string, customerName: string) => {
    const now = new Date().toISOString();
    setReminderSent((p) => ({ ...p, [customerId]: true }));

    await supabase.from("customers").update({
      last_reminder_sent: now,
      reminder_30_days_sent: true,
      renewal_stage: "reminded",
    } as any).eq("id", customerId);

    setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, last_reminder_sent: now, renewal_stage: "reminded" } : c));

    if (user) {
      await supabase.from("audit_log").insert({
        user_id: user.id,
        user_name: user.email || "Unknown",
        user_role: "admin",
        action_type: "reminder_sent",
        entity_type: "customer",
        entity_id: customerId,
        detail: `Renewal reminder sent to ${customerName} via WhatsApp`,
        metadata: { method: "manual" },
      });
    }
  };

  const handleSendReminder = (customer: Customer | { id: string; name: string; phone: string; next_service_due: string }) => {
    const cleanPhone = customer.phone.replace(/\s+/g, "").replace(/^0/, "353");
    const fullCustomer = customers.find(c => c.id === customer.id) || customer as Customer;
    const msg = buildReminderMessage(fullCustomer);
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, "_blank");

    markAsContacted(customer.id, customer.name);

    if (user) {
      supabase.from("whatsapp_messages").insert({
        user_id: user.id,
        customer_id: customer.id,
        message_type: "30 Day Reminder",
        message_body: msg,
        sent_by: user.email,
        status: "Sent",
      } as any);
    }

    toast({ title: `Reminder sent to ${customer.name}` });
  };

  const handleStageChange = async (customerId: string, newStage: string) => {
    await supabase.from("customers").update({ renewal_stage: newStage } as any).eq("id", customerId);
    setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, renewal_stage: newStage } : c));
    toast({ title: `Stage updated to ${newStage.replace("_", " ")}` });
  };

  const confirmArchive = (customerId: string, customerName: string, archive: boolean) => {
    setArchiveConfirm({ id: customerId, name: customerName, archive });
  };

  const handleArchive = async () => {
    if (!archiveConfirm) return;
    const { id, archive } = archiveConfirm;
    await supabase.from("customers").update({ is_archived: archive } as any).eq("id", id);
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, is_archived: archive } : c));
    toast({ title: archive ? "Customer archived" : "Customer restored" });
    setArchiveConfirm(null);
  };

  const selectedStatus = selectedCustomer ? getStatus(getDaysUntil(selectedCustomer.next_service_due)) : "Up to Date";
  const selectedDays = selectedCustomer ? getDaysUntil(selectedCustomer.next_service_due) : 0;

  const reminderQueue: ReminderCustomer[] = withStatus
    .filter((c) => !c.contactedRecently && !reminderSent[c.id] && c.renewalStatus !== "Up to Date")
    .map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      nextDue: c.next_service_due!,
      daysUntil: c.daysUntil,
      status: c.renewalStatus,
    }));

  const handleBatchReminderSent = async (customerId: string) => {
    const c = customers.find((x) => x.id === customerId);
    if (!user || !c) return;

    const msg = buildReminderMessage(c);
    markAsContacted(customerId, c.name);

    supabase.from("whatsapp_messages").insert({
      user_id: user.id,
      customer_id: customerId,
      message_type: "30 Day Reminder",
      message_body: msg,
      sent_by: user.email,
      status: "Sent",
    } as any);
  };

  const filterCounts: Record<StatusFilterType, number> = {
    All: withStatus.length,
    Overdue: counts.overdue,
    "Due Soon": counts.dueSoon,
    "Up to Date": counts.upToDate,
    Contacted: counts.contacted,
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-xl font-extrabold flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-primary" />
            Renewals
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {counts.overdue} overdue · {counts.dueSoon} due soon
          </p>
        </div>
        {counts.needReminder > 0 ? (
          <Button
            onClick={() => setSendAllOpen(true)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs gap-1.5"
            size="sm"
          >
            <Send className="w-3.5 h-3.5" />
            Send All Reminders ({counts.needReminder})
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled className="text-xs gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            All reminders sent
          </Button>
        )}
      </div>

      {/* Archived toggle */}
      <Button
        onClick={() => setShowArchived(!showArchived)}
        variant={showArchived ? "default" : "outline"}
        size="sm"
        className={`gap-2 font-bold ${
          showArchived
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "border-2 border-primary/40 text-primary hover:bg-primary/10"
        }`}
      >
        {showArchived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
        {showArchived ? `Viewing Archived (${archivedCustomers.length})` : `View Archived (${archivedCustomers.length})`}
      </Button>

      {/* SECTION 1: Hero Stats */}
      <RenewalsHeroStats
        renewalsDue={dueIn30}
        valueAtRisk={valueAtRisk}
        notContacted={notContactedCount}
        reminded={remindedIn30}
      />

      {/* SECTION 2: Urgent List */}
      <UrgentList
        customers={urgentCustomers.map(c => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          next_service_due: c.next_service_due!,
          daysUntil: c.daysUntil,
          renewal_stage: c.renewal_stage,
        }))}
        onSendReminder={(c) => handleSendReminder(c)}
        onArchive={(c) => confirmArchive(c.id, c.name, true)}
        onSendAll={() => setSendAllOpen(true)}
        needReminderCount={urgentNeedReminder}
      />

      {/* SECTION 3: Monthly Breakdown */}
      <MonthlyBreakdown
        customers={customers.map(c => ({
          next_service_due: c.next_service_due,
          renewal_stage: c.renewal_stage,
          last_service_date: c.last_service_date,
        }))}
        servicePrice={servicePrice}
      />

      {/* SECTION 4: Send Service Reminders */}
      <SendServiceReminders
        customers={activeCustomers.map(c => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          eircode: c.eircode,
          next_service_due: c.next_service_due,
        }))}
        userId={user?.id}
        onRemindersSent={fetchCustomers}
      />

      {/* Divider */}
      <div className="border-t border-border/60 pt-4">
        <h2 className="text-sm font-bold text-foreground mb-3">All Renewals</h2>
      </div>

      {/* Pipeline progress bar */}
      {total > 0 && (
        <Card className="border-border/60">
          <CardContent className="p-4">
            <div className="flex justify-between mb-1.5">
              <span className="text-[11px] font-bold text-muted-foreground">Pipeline Progress</span>
              <span className="text-[11px] font-bold text-success">
                {paidCount} paid · {bookedCount} booked · {confirmedCount} confirmed
              </span>
            </div>
            <div className="h-3 rounded-full bg-border overflow-hidden flex">
              {[
                { count: paidCount,      className: "bg-success" },
                { count: bookedCount,    className: "bg-primary" },
                { count: confirmedCount, className: "bg-[#0891B2]" },
                { count: remindedCount,  className: "bg-warning" },
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
            <div className="flex gap-3 mt-2 flex-wrap">
              {[
                { label: `${paidCount} Paid`,                dotClass: "bg-success",     textClass: "text-success" },
                { label: `${bookedCount} Booked`,            dotClass: "bg-primary",     textClass: "text-primary" },
                { label: `${confirmedCount} Confirmed`,      dotClass: "bg-[#0891B2]",   textClass: "text-[#0891B2]" },
                { label: `${remindedCount} Reminded`,        dotClass: "bg-warning",     textClass: "text-warning" },
                { label: `${stageCounts["Not Contacted"]} Not Contacted`, dotClass: "bg-destructive", textClass: "text-destructive" },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1">
                  <div className={`w-2 h-2 rounded-full ${l.dotClass}`} />
                  <span className={`text-[11px] font-bold ${l.textClass}`}>{l.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <Input
          placeholder="Search customer or address..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Stage filter tabs */}
      <div>
        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Pipeline Stage</div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {STAGE_FILTERS.map((f) => {
            const active = stageFilter === f;
            const styles = stageFilterStyles[f];
            return (
              <button
                key={f}
                onClick={() => setStageFilter(f)}
                className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border-[1.5px] transition-colors flex items-center gap-1.5 ${
                  active ? styles.active + " font-bold" : styles.inactive + " bg-card hover:bg-muted"
                }`}
              >
                {STAGE_ICONS[f]}
                {f} {stageCounts[f]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Status filter tabs */}
      <div>
        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Due Status</div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {STATUS_FILTERS.map((f) => {
            const active = filter === f;
            const styles = filterStyles[f];
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`shrink-0 text-xs font-semibold px-3.5 py-1.5 rounded-full border-[1.5px] transition-colors ${
                  active ? styles.active + " font-bold" : styles.inactive + " bg-card hover:bg-muted"
                }`}
              >
                {f} {filterCounts[f]}
              </button>
            );
          })}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-2.5">
        {[
          { icon: <AlertTriangle className="w-5 h-5 text-destructive" />, value: counts.overdue, label: "Overdue", color: "border-t-destructive", alert: true, filterTo: "Overdue" as StatusFilterType },
          { icon: <Clock className="w-5 h-5 text-warning" />, value: counts.dueSoon, label: "Due Soon", color: "border-t-warning", filterTo: "Due Soon" as StatusFilterType },
          { icon: <CheckCircle2 className="w-5 h-5 text-success" />, value: counts.upToDate, label: "Up to Date", color: "border-t-success", filterTo: "Up to Date" as StatusFilterType },
          { icon: <Smartphone className="w-5 h-5 text-primary" />, value: counts.contacted, label: "Contacted", color: "border-t-primary", filterTo: "Contacted" as StatusFilterType },
        ].map((k) => (
          <Card
            key={k.label}
            className={`border-t-[3px] ${k.color} cursor-pointer hover:bg-muted/50 transition-colors`}
            onClick={() => setFilter(k.filterTo)}
          >
            <CardContent className="p-3 text-center">
              <div className="flex justify-center mb-1">{k.icon}</div>
              <div className={`text-xl font-extrabold leading-none ${k.alert ? "text-destructive" : ""}`}>{k.value}</div>
              <div className="text-[10px] text-muted-foreground font-medium mt-1">{k.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <p className="text-center text-muted-foreground py-12">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <RefreshCw className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <div className="font-bold">No {filter !== "All" ? filter : ""} renewals</div>
        </div>
      ) : (
        filtered.map((c) => (
          <RenewalCard
            key={c.id}
            customer={c}
            status={c.renewalStatus}
            stage={c.stage}
            daysUntil={c.daysUntil}
            reminderSent={reminderSent[c.id] || c.contactedRecently}
            lastContacted={c.last_reminder_sent}
            onOpen={() => setSelectedCustomer(c)}
            onSendReminder={() => handleSendReminder(c)}
            onBook={() => setBookCustomer(c)}
            onStageChange={(newStage) => handleStageChange(c.id, newStage)}
            onArchive={() => confirmArchive(c.id, c.name, !c.is_archived)}
            isArchived={c.is_archived}
            hasFailedSend={failedCustomerIds.has(c.id)}
          />
        ))
      )}

      {/* Detail sheet */}
      <RenewalDetailSheet
        customer={selectedCustomer}
        status={selectedStatus}
        daysUntil={selectedDays}
        reminderSent={selectedCustomer ? (reminderSent[selectedCustomer.id] || isContactedRecently(selectedCustomer.last_reminder_sent)) : false}
        open={!!selectedCustomer}
        onClose={() => setSelectedCustomer(null)}
        onSendReminder={() => selectedCustomer && handleSendReminder(selectedCustomer)}
        onBook={() => { setBookCustomer(selectedCustomer); setSelectedCustomer(null); }}
      />

      {/* Book sheet */}
      <BookServiceSheet
        customer={bookCustomer}
        open={!!bookCustomer}
        onClose={() => setBookCustomer(null)}
        onBooked={fetchCustomers}
      />

      {/* Send All Reminders Sheet */}
      <SendAllRemindersSheet
        open={sendAllOpen}
        onOpenChange={setSendAllOpen}
        customers={reminderQueue}
        onReminderSent={handleBatchReminderSent}
      />

      {/* Archive Confirmation Dialog */}
      <AlertDialog open={!!archiveConfirm} onOpenChange={(open) => !open && setArchiveConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {archiveConfirm?.archive ? "Archive Customer?" : "Restore Customer?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {archiveConfirm?.archive
                ? `Are you sure you want to archive ${archiveConfirm?.name}? They will be removed from the active renewals list.`
                : `Restore ${archiveConfirm?.name} back to the active renewals list?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive}>
              {archiveConfirm?.archive ? "Archive" : "Restore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Renewals;
