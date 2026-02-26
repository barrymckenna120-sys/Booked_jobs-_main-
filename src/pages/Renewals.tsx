import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RefreshCw, Search, AlertTriangle, Clock, CheckCircle2, Smartphone, Send } from "lucide-react";
import RenewalCard from "@/components/renewals/RenewalCard";
import RenewalDetailSheet from "@/components/renewals/RenewalDetailSheet";
import BookServiceSheet from "@/components/renewals/BookServiceSheet";
import { SendAllRemindersSheet, type ReminderCustomer } from "@/components/renewals/SendAllReminders";
import { formatDistanceToNow, isToday, differenceInDays } from "date-fns";

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
};

const FILTERS = ["All", "Overdue", "Due Soon", "Up to Date", "Contacted"] as const;
type FilterType = typeof FILTERS[number];

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
  const [settings, setSettings] = useState<{ business_name?: string; whatsapp_number?: string; template_renewal_reminder?: string } | null>(null);
  const urlParams = new URLSearchParams(window.location.search);
  const initialFilter = urlParams.get("status") || "Overdue";
  const [filter, setFilter] = useState<FilterType>(initialFilter as FilterType);
  const [search, setSearch] = useState("");
  const [reminderSent, setReminderSent] = useState<Record<string, boolean>>({});
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [bookCustomer, setBookCustomer] = useState<Customer | null>(null);
  const [sendAllOpen, setSendAllOpen] = useState(false);

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
      .select("business_name, whatsapp_number, template_renewal_reminder")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) setSettings(data);
  }, [user]);

  useEffect(() => { fetchCustomers(); fetchSettings(); }, [fetchCustomers, fetchSettings]);

  if (authLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  const businessName = settings?.business_name || "BookedJobs";

  const withStatus = customers.map((c) => {
    const daysUntil = getDaysUntil(c.next_service_due);
    return { ...c, daysUntil, renewalStatus: getStatus(daysUntil), contactedRecently: isContactedRecently(c.last_reminder_sent) };
  });

  const filtered = withStatus
    .filter((c) => {
      if (filter === "All") return true;
      if (filter === "Contacted") return c.contactedRecently || reminderSent[c.id];
      return c.renewalStatus === filter;
    })
    .filter((c) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return c.name.toLowerCase().includes(q) || c.address.toLowerCase().includes(q);
    })
    .sort((a, b) => a.daysUntil - b.daysUntil);

  const counts = {
    overdue: withStatus.filter((c) => c.renewalStatus === "Overdue").length,
    dueSoon: withStatus.filter((c) => c.renewalStatus === "Due Soon").length,
    upToDate: withStatus.filter((c) => c.renewalStatus === "Up to Date").length,
    contacted: withStatus.filter((c) => c.contactedRecently || reminderSent[c.id]).length,
    needReminder: withStatus.filter((c) => !c.contactedRecently && !reminderSent[c.id] && c.renewalStatus !== "Up to Date").length,
  };

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

    // Update customer
    await supabase.from("customers").update({ last_reminder_sent: now, reminder_30_days_sent: true } as any).eq("id", customerId);

    // Update local state
    setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, last_reminder_sent: now } : c));

    // Audit log
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

  const handleSendReminder = (customer: Customer) => {
    const cleanPhone = customer.phone.replace(/\s+/g, "").replace(/^0/, "353");
    const msg = buildReminderMessage(customer);
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

  const filterCounts: Record<FilterType, number> = {
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

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto">
        {FILTERS.map((f) => {
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

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-2.5">
        {[
          { icon: <AlertTriangle className="w-5 h-5 text-destructive" />, value: counts.overdue, label: "Overdue", color: "border-t-destructive", alert: true, filterTo: "Overdue" as FilterType },
          { icon: <Clock className="w-5 h-5 text-warning" />, value: counts.dueSoon, label: "Due Soon", color: "border-t-warning", filterTo: "Due Soon" as FilterType },
          { icon: <CheckCircle2 className="w-5 h-5 text-success" />, value: counts.upToDate, label: "Up to Date", color: "border-t-success", filterTo: "Up to Date" as FilterType },
          { icon: <Smartphone className="w-5 h-5 text-primary" />, value: counts.contacted, label: "Contacted", color: "border-t-primary", filterTo: "Contacted" as FilterType },
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
            daysUntil={c.daysUntil}
            reminderSent={reminderSent[c.id] || c.contactedRecently}
            lastContacted={c.last_reminder_sent}
            onOpen={() => setSelectedCustomer(c)}
            onSendReminder={() => handleSendReminder(c)}
            onBook={() => setBookCustomer(c)}
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
    </div>
  );
};

export default Renewals;
