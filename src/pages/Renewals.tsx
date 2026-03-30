import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  RefreshCw, Send, CheckCircle2, MapPin, Archive, ArchiveRestore, CalendarCheck,
} from "lucide-react";
import RenewalDetailSheet from "@/components/renewals/RenewalDetailSheet";
import BookServiceSheet from "@/components/renewals/BookServiceSheet";
import { SendAllRemindersSheet, type ReminderCustomer } from "@/components/renewals/SendAllReminders";
import { differenceInDays } from "date-fns";
import { Badge } from "@/components/ui/badge";

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

type TabKey = "overdue" | "due_soon" | "up_to_date";

const getDaysUntil = (nextDue: string | null): number => {
  if (!nextDue) return 999;
  return Math.ceil((new Date(nextDue).getTime() - Date.now()) / 86400000);
};

const getTabForDays = (days: number): TabKey => {
  if (days < 0) return "overdue";
  if (days <= 30) return "due_soon";
  return "up_to_date";
};

const isContactedRecently = (lastSent: string | null): boolean => {
  if (!lastSent) return false;
  return differenceInDays(new Date(), new Date(lastSent)) <= 30;
};

const formatDuePill = (days: number, nextDue: string | null): { text: string; className: string } => {
  if (days < 0) {
    return { text: `${Math.abs(days)}d overdue`, className: "bg-destructive/10 text-destructive border-destructive/20" };
  }
  if (days <= 30) {
    return { text: `Due in ${days}d`, className: "bg-warning/10 text-warning border-warning/20" };
  }
  if (nextDue) {
    const d = new Date(nextDue);
    return {
      text: `Due ${d.toLocaleDateString("en-IE", { day: "numeric", month: "short" })}`,
      className: "bg-success/10 text-success border-success/20",
    };
  }
  return { text: "—", className: "bg-muted text-muted-foreground" };
};

const Renewals = () => {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<{ business_name?: string; whatsapp_number?: string; template_renewal_reminder?: string; default_service_price?: number } | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("overdue");
  const [reminderSent, setReminderSent] = useState<Record<string, boolean>>({});
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [bookCustomer, setBookCustomer] = useState<Customer | null>(null);
  const [sendAllOpen, setSendAllOpen] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState<{ id: string; name: string; archive: boolean } | null>(null);

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

  useEffect(() => {
    const interval = setInterval(fetchCustomers, 30000);
    return () => clearInterval(interval);
  }, [fetchCustomers]);

  if (authLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  const businessName = settings?.business_name || "BookedJobs";
  const servicePrice = settings?.default_service_price || 120;

  const activeCustomers = customers.filter(c => !c.is_archived);

  const withStatus = activeCustomers.map((c) => {
    const daysUntil = getDaysUntil(c.next_service_due);
    const tab = getTabForDays(daysUntil);
    const stage = c.renewal_stage || "not_contacted";
    const isResolved = stage === "booked" || stage === "paid";
    return { ...c, daysUntil, tab, stage, isResolved, contactedRecently: isContactedRecently(c.last_reminder_sent) };
  });

  // Exclude resolved from overdue/due_soon, keep in up_to_date
  const filterable = withStatus.filter(c => c.tab === "up_to_date" || !c.isResolved);

  const tabCounts = {
    overdue: filterable.filter(c => c.tab === "overdue").length,
    due_soon: filterable.filter(c => c.tab === "due_soon").length,
    up_to_date: filterable.filter(c => c.tab === "up_to_date").length,
  };

  const filtered = filterable
    .filter(c => c.tab === activeTab)
    .sort((a, b) => a.daysUntil - b.daysUntil);

  // Stats for header
  const notContactedCount = filterable.filter(c => c.stage === "not_contacted" && (c.tab === "overdue" || c.tab === "due_soon")).length;
  const totalAtRisk = (tabCounts.overdue + tabCounts.due_soon) * servicePrice;

  // Build reminder message
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

    toast({ title: `Reminder sent to ${customer.name}`, duration: 2500 });
  };

  const confirmArchive = (customerId: string, customerName: string, archive: boolean) => {
    setArchiveConfirm({ id: customerId, name: customerName, archive });
  };

  const handleArchive = async () => {
    if (!archiveConfirm) return;
    const { id, archive, name } = archiveConfirm;
    await supabase.from("customers").update({ is_archived: archive } as any).eq("id", id);
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, is_archived: archive } : c));
    toast({ title: archive ? `${name} archived` : `${name} restored`, duration: 2500 });
    setArchiveConfirm(null);
  };

  const selectedStatus = selectedCustomer
    ? (getDaysUntil(selectedCustomer.next_service_due) < 0 ? "Overdue" : getDaysUntil(selectedCustomer.next_service_due) <= 30 ? "Due Soon" : "Up to Date")
    : "Up to Date";
  const selectedDays = selectedCustomer ? getDaysUntil(selectedCustomer.next_service_due) : 0;

  // Reminder queue for Send All — scoped to active tab
  const reminderQueue: ReminderCustomer[] = filtered
    .filter((c) => !c.contactedRecently && !reminderSent[c.id])
    .map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      nextDue: c.next_service_due!,
      daysUntil: c.daysUntil,
      status: c.tab === "overdue" ? "Overdue" : c.tab === "due_soon" ? "Due Soon" : "Up to Date",
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

  const leftBorderClass = (tab: TabKey) => {
    if (tab === "overdue") return "border-l-destructive";
    if (tab === "due_soon") return "border-l-warning";
    return "border-l-success";
  };

  return (
    <div className="max-w-3xl mx-auto px-4 pb-6 space-y-0">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-background border-b border-border pb-3 pt-6 mb-4">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-extrabold">Renewals</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              €{totalAtRisk.toLocaleString()} at risk · {notContactedCount} not yet contacted
            </p>
          </div>
          <Button
            onClick={() => setSendAllOpen(true)}
            size="sm"
            className="gap-1.5 font-bold text-xs"
            disabled={reminderQueue.length === 0}
          >
            <Send className="w-3.5 h-3.5" />
            Remind All ({reminderQueue.length})
          </Button>
        </div>

        {/* Tab bar */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)} className="mt-3">
          <TabsList className="w-full">
            <TabsTrigger value="overdue" className="flex-1 gap-1.5 text-xs">
              Overdue
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">{tabCounts.overdue}</Badge>
            </TabsTrigger>
            <TabsTrigger value="due_soon" className="flex-1 gap-1.5 text-xs">
              Due Soon
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">{tabCounts.due_soon}</Badge>
            </TabsTrigger>
            <TabsTrigger value="up_to_date" className="flex-1 gap-1.5 text-xs">
              Up to Date
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">{tabCounts.up_to_date}</Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Card list */}
      {loading ? (
        <p className="text-center text-muted-foreground py-12">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <RefreshCw className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <div className="font-bold">No {activeTab.replace("_", " ")} renewals</div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => {
            const pill = formatDuePill(c.daysUntil, c.next_service_due);
            const isSent = reminderSent[c.id] || c.contactedRecently;

            return (
              <div
                key={c.id}
                className={`bg-card border border-border border-l-4 ${leftBorderClass(c.tab)} rounded-xl p-4`}
              >
                {/* Top row */}
                <div className="flex justify-between items-start mb-1">
                  <button
                    className="text-left flex-1 min-w-0"
                    onClick={() => setSelectedCustomer(c)}
                  >
                    <span className="text-sm font-bold">{c.name}</span>
                  </button>
                  <Badge variant="outline" className={`shrink-0 text-[10px] font-bold ${pill.className}`}>
                    {pill.text}
                  </Badge>
                </div>

                {/* Address */}
                <div className="text-xs text-muted-foreground flex items-center gap-1 mb-3">
                  <MapPin className="w-3 h-3 shrink-0" /> {c.address}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 text-xs gap-1 h-11 sm:h-9 font-bold"
                    variant={isSent ? "outline" : "default"}
                    disabled={isSent}
                    onClick={() => handleSendReminder(c)}
                  >
                    {isSent ? (
                      <><CheckCircle2 className="w-3.5 h-3.5" /> Sent</>
                    ) : (
                      <><Send className="w-3.5 h-3.5" /> Remind</>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 text-xs gap-1 h-11 sm:h-9 font-bold"
                    onClick={() => setBookCustomer(c)}
                  >
                    <CalendarCheck className="w-3.5 h-3.5" /> Book
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs px-2 text-muted-foreground h-11 sm:h-9"
                    onClick={() => confirmArchive(c.id, c.name, true)}
                    title="Archive"
                  >
                    <Archive className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
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
