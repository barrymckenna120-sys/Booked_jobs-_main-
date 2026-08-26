import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { logAudit } from "@/lib/auditLog";
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
  RefreshCw, Send, CheckCircle2, MapPin, Archive, ArchiveRestore, CalendarCheck, MessageSquare, Loader2,
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
  area_code: string | null;
  last_service_date: string | null;
  next_service_due: string | null;
  assigned_engineer: string | null;
  reminder_30_days_sent: boolean | null;
  service_status: string | null;
  last_reminder_sent: string | null;
  renewal_stage: string | null;
  is_archived: boolean;
  opted_out: boolean | null;
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
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [sortAscending, setSortAscending] = useState(true);
  const [settings, setSettings] = useState<{ business_name?: string; whatsapp_number?: string; template_renewal_reminder?: string; default_service_price?: number } | null>(null);
  const filterParam = searchParams.get("filter");
  const initialTab: TabKey = filterParam === "due-soon" ? "due_soon" : filterParam === "overdue" ? "overdue" : "overdue";
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [reminderSent, setReminderSent] = useState<Record<string, boolean>>({});
  // In-flight sends, keyed by customer id. Prevents a double-tap from firing
  // two real WhatsApp messages (see BJ duplicate-reminder fix).
  const [sendingIds, setSendingIds] = useState<Record<string, boolean>>({});

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [bookCustomer, setBookCustomer] = useState<Customer | null>(null);
  const [sendAllOpen, setSendAllOpen] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState<{ id: string; name: string; archive: boolean } | null>(null);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [bulkWhatsAppConfirm, setBulkWhatsAppConfirm] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);

  const fetchCustomers = useCallback(async (background = false) => {
    console.log("[Renewals] fetchCustomers start", {
      background,
      user,
      organisationId: undefined,
    });

    if (!user) {
      console.log("[Renewals] fetchCustomers aborted - no user", {
        background,
        user,
        organisationId: undefined,
      });
      setLoading(false);
      return;
    }

    if (!background) setLoading(true);

    try {
      setFetchError(null);
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .not("next_service_due", "is", null)
        .order("next_service_due", { ascending: true });

      console.log("[Renewals] fetchCustomers result", {
        data,
        error,
        rowCount: data?.length ?? 0,
        background,
      });

      if (error) throw error;

      setCustomers((data || []) as Customer[]);
    } catch (err: any) {
      console.error("Failed to fetch customers:", err);
      setFetchError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
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

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }

    fetchCustomers();
    fetchSettings();
  }, [authLoading, user, fetchCustomers, fetchSettings]);

  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => fetchCustomers(true), 30000);
    return () => clearInterval(interval);
  }, [user, fetchCustomers]);

  const activeCustomers = customers.filter(c => !c.is_archived && !c.opted_out);

  const normalizeArea = (code: string | null | undefined): string =>
    code ? code.trim().toUpperCase() : "NO AREA";

  const areaCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    activeCustomers.forEach(c => {
      const code = normalizeArea(c.area_code);
      counts[code] = (counts[code] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [activeCustomers]);

  if (authLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  const businessName = settings?.business_name || "BookedJobs";
  const servicePrice = settings?.default_service_price || 120;


  const withStatus = activeCustomers.map((c) => {
    const daysUntil = getDaysUntil(c.next_service_due);
    const tab = getTabForDays(daysUntil);
    const stage = c.renewal_stage || "not_contacted";
    const isResolved = stage === "booked" || stage === "paid";
    return { ...c, daysUntil, tab, stage, isResolved, contactedRecently: isContactedRecently(c.last_reminder_sent) };
  });

  // Exclude resolved from overdue/due_soon, keep in up_to_date
  const filterable = withStatus.filter(c => c.tab === "up_to_date" || !c.isResolved);

  const matchesArea = (c: typeof withStatus[0]) =>
    selectedAreas.length === 0 || selectedAreas.includes(normalizeArea(c.area_code));

  const toggleArea = (code: string) => {
    const next = selectedAreas.includes(code)
      ? selectedAreas.filter(a => a !== code)
      : [...selectedAreas, code];
    setSelectedAreas(next);

    if (next.length > 0) {
      const areaMatch = (c: typeof withStatus[0]) => next.includes(normalizeArea(c.area_code));
      const counts: Record<TabKey, number> = {
        overdue: filterable.filter(c => c.tab === "overdue" && areaMatch(c)).length,
        due_soon: filterable.filter(c => c.tab === "due_soon" && areaMatch(c)).length,
        up_to_date: filterable.filter(c => c.tab === "up_to_date" && areaMatch(c)).length,
      };
      if (counts[activeTab] === 0) {
        const best = (Object.keys(counts) as TabKey[]).reduce((a, b) => counts[a] >= counts[b] ? a : b);
        if (counts[best] > 0) setActiveTab(best);
      }
    }
  };

  const tabCounts = {
    overdue: filterable.filter(c => c.tab === "overdue" && matchesArea(c)).length,
    due_soon: filterable.filter(c => c.tab === "due_soon" && matchesArea(c)).length,
    up_to_date: filterable.filter(c => c.tab === "up_to_date" && matchesArea(c)).length,
  };

  const filtered = filterable
    .filter(c => c.tab === activeTab && matchesArea(c))
    .sort((a, b) => sortAscending ? a.daysUntil - b.daysUntil : b.daysUntil - a.daysUntil);

  // Stats for header
  const notContactedCount = filterable.filter(c => c.stage === "not_contacted" && (c.tab === "overdue" || c.tab === "due_soon") && matchesArea(c)).length;
  const totalAtRisk = (tabCounts.overdue + tabCounts.due_soon) * servicePrice;

  // Build reminder message
  const buildReminderMessage = (customer: Customer) => {
    const firstName = customer.name.split(" ")[0];
    const nextDue = customer.next_service_due
      ? new Date(customer.next_service_due).toLocaleDateString("en-IE", { day: "numeric", month: "long", year: "numeric" })
      : "soon";

    if (settings?.template_renewal_reminder) {
      return settings.template_renewal_reminder
        .replace(/\{\{name\}\}/g, firstName)
        .replace(/\{\{date\}\}/g, nextDue)
        .replace(/\{\{phone\}\}/g, settings.whatsapp_number || "");
    }

    return `Hi ${firstName},\n\nThis is K & N Gas Services. Your annual boiler service is due on ${nextDue}.\n\nIf your boiler is under manufacturer warranty, maintaining a yearly service is a condition of keeping that warranty valid.\n\nReply here to book your service or call us on 087 3686252.\n\nReply STOP to unsubscribe.\nK & N Gas Services`;
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
      await logAudit({
        action_type: "reminder_sent",
        entity_type: "customer",
        entity_id: customerId,
        detail: `Renewal reminder sent to ${customerName} via WhatsApp`,
        metadata: { method: "manual" },
      });
    }
  };

  const handleSendReminder = async (customer: Customer) => {
    // Re-entrancy guard: a second tap while the first send is in flight must
    // not reach the edge function at all.
    if (sendingIds[customer.id]) return;
    setSendingIds((p) => ({ ...p, [customer.id]: true }));

    const firstName = customer.name.split(" ")[0];
    const renewalDate = customer.next_service_due
      ? new Date(customer.next_service_due).toLocaleDateString("en-IE", { day: "numeric", month: "long", year: "numeric" })
      : "soon";

    try {
      const { data, error } = await supabase.functions.invoke("send-renewal-reminder", {
        body: {
          customer_id: customer.id,
          phone: customer.phone,
          first_name: firstName,
          renewal_date: renewalDate,
        },
      });

      if (error) throw new Error(error.message || "Edge function error");
      if (data && !data.success) throw new Error(data.error || "Send failed");

      markAsContacted(customer.id, customer.name);

      // The server suppressed a duplicate — tell the truth rather than
      // claiming a message went out.
      if (data?.skipped) {
        toast({
          title: `Already reminded ${customer.name}`,
          description: data.reason === "customer_opted_out"
            ? "This customer has opted out of reminders."
            : "A reminder was already sent recently — no duplicate message was sent.",
          duration: 4000,
        });
        return;
      }

      toast({ title: `✅ Reminder sent to ${customer.name}`, duration: 2500 });
    } catch (err: any) {
      console.error("Send renewal reminder failed:", err);
      toast({ title: `❌ Failed to send to ${customer.name}`, description: err.message, variant: "destructive", duration: 4000 });
    } finally {
      setSendingIds((p) => {
        const next = { ...p };
        delete next[customer.id];
        return next;
      });
    }
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
    if (!c) return;
    markAsContacted(customerId, c.name);
  };

  const leftBorderClass = (tab: TabKey) => {
    if (tab === "overdue") return "border-l-destructive";
    if (tab === "due_soon") return "border-l-warning";
    return "border-l-success";
  };

  const notRemindedCount = filtered.filter(c => !reminderSent[c.id] && !c.contactedRecently).length;

  const showBulkWhatsApp = selectedAreas.length > 0;
  const bulkAreaLabel = selectedAreas.join(", ");

  const handleBulkWhatsApp = async () => {
    setBulkSending(true);
    try {
      const payload = filtered
        .filter(c => !c.contactedRecently && !reminderSent[c.id])
        .map(c => ({
          customer_id: c.id,
          customer_name: c.name,
          customer_phone: c.phone,
          next_service_due: c.next_service_due,
          area_code: c.area_code || "Unknown",
        }));

      if (payload.length === 0) {
        toast({ title: "No customers to send to", duration: 2500 });
        setBulkWhatsAppConfirm(false);
        setBulkSending(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("send-area-bulk-whatsapp", {
        body: { area_codes: selectedAreas, customers: payload },
      });

      if (error) throw error;

      const sentCount = data?.sent || 0;
      const skippedCount = data?.skipped || 0;
      const byArea = data?.by_area || {};

      // Build area breakdown string
      const areaBreakdown = Object.entries(byArea)
        .filter(([, v]: [string, any]) => v.sent > 0)
        .map(([code, v]: [string, any]) => `${code}: ${v.sent}`)
        .join(", ");

      toast({
        title: `Sent to ${sentCount} customers${areaBreakdown ? ` — ${areaBreakdown}` : ""}. ${skippedCount} skipped.`,
        duration: 5000,
      });

      payload.forEach(c => {
        setReminderSent(prev => ({ ...prev, [c.customer_id]: true }));
      });

      fetchCustomers();
    } catch (err: any) {
      toast({ title: "Error sending bulk WhatsApp", description: err.message, variant: "destructive" });
    }
    setBulkSending(false);
    setBulkWhatsAppConfirm(false);
  };

  return (
    <div className="max-w-[900px] mx-auto px-4 pb-6 space-y-0">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-background border-b border-border pb-3 pt-6 mb-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-extrabold">Renewals</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              €{totalAtRisk.toLocaleString()} at risk · {notContactedCount} not yet contacted
            </p>
          </div>
          <div className="flex items-center gap-2">
            {showBulkWhatsApp && (
              <Button
                onClick={() => setBulkWhatsAppConfirm(true)}
                size="sm"
                className="gap-1.5 font-bold text-xs bg-[#25D366] hover:bg-[#20bd5a] text-white"
                disabled={bulkSending || reminderQueue.length === 0}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Send All — {bulkAreaLabel} via WhatsApp
              </Button>
            )}
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

        {/* Area code chips */}
        {areaCounts.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {areaCounts.map(([code, count]) => {
              const isActive = selectedAreas.includes(code);
              return (
                <button
                  key={code}
                  onClick={() => toggleArea(code)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-primary/10 text-primary hover:bg-primary/20"
                  }`}
                >
                  <MapPin className="w-3 h-3" /> {code} <span className={`font-extrabold ${isActive ? "text-primary-foreground" : "text-foreground"}`}>{count}</span>
                </button>
              );
            })}
            {selectedAreas.length > 0 && (
              <button
                onClick={() => setSelectedAreas([])}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {!loading && filtered.length > 0 && (
        <div className="hidden md:flex items-center justify-between bg-muted/50 border border-border rounded-lg px-4 py-2 mb-4">
          <p className="text-xs text-muted-foreground">
            Showing <span className="font-bold text-foreground">{filtered.length}</span> customers · <span className="font-bold text-foreground">{notRemindedCount}</span> not yet reminded
          </p>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setSortAscending(prev => !prev)}
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs font-medium"
            >
              Date {sortAscending ? "↑" : "↓"}
            </Button>
            <Button
              onClick={() => setSendAllOpen(true)}
              size="sm"
              variant="outline"
              className="gap-1.5 font-bold text-xs"
              disabled={reminderQueue.length === 0}
            >
              <Send className="w-3.5 h-3.5" />
              Remind All ({reminderQueue.length})
            </Button>
          </div>
        </div>
      )}

      {/* Card list */}
      {loading ? (
        <p className="text-center text-muted-foreground py-12">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-success/60" />
          <div className="font-bold text-sm">
            {selectedAreas.length > 0
              ? `No customers found for ${selectedAreas.join(", ")} in this category`
              : "All clear — nothing in this category"}
          </div>
          <p className="text-xs mt-1">
            {selectedAreas.length > 0
              ? "Try selecting a different area or clearing the filter."
              : `No customers are currently ${activeTab === "overdue" ? "overdue" : activeTab === "due_soon" ? "due soon" : "up to date"}.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
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
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3 shrink-0" /> {c.address}
                </div>

                {/* Renewal date */}
                <div className="mt-1.5 mb-3 text-sm font-semibold text-foreground">
                  Renewal: {c.next_service_due
                    ? new Date(c.next_service_due).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })
                    : "—"}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <div className="flex-1 flex flex-col gap-0.5">
                    <Button
                      size="sm"
                      className="w-full text-xs gap-1 h-11 sm:h-9 font-bold"
                      variant="default"
                      disabled={!!sendingIds[c.id]}
                      onClick={() => handleSendReminder(c)}
                    >
                      <Send className="w-3.5 h-3.5" /> {sendingIds[c.id] ? "Sending…" : "Remind"}
                    </Button>

                    {c.last_reminder_sent && (
                      <span className="text-[10px] text-muted-foreground text-center">
                        Sent {new Date(c.last_reminder_sent).toLocaleDateString("en-IE", { day: "numeric", month: "short" })}, {new Date(c.last_reminder_sent).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit", hour12: false })}
                      </span>
                    )}
                  </div>
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
      {/* Bulk WhatsApp Confirmation Dialog */}
      <AlertDialog open={bulkWhatsAppConfirm} onOpenChange={setBulkWhatsAppConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send WhatsApp to {bulkAreaLabel} Customers?</AlertDialogTitle>
            <AlertDialogDescription>
              Send WhatsApp to all customers in {bulkAreaLabel} due for service? This cannot be undone.
              {reminderQueue.length > 0 && (
                <span className="block mt-2 font-semibold text-foreground">
                  Total: {reminderQueue.length} customer{reminderQueue.length !== 1 ? "s" : ""}.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkSending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkWhatsApp}
              disabled={bulkSending}
              className="bg-[#25D366] hover:bg-[#20bd5a] text-white"
            >
              {bulkSending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <MessageSquare className="w-4 h-4 mr-1" />}
              {bulkSending ? "Sending..." : "Confirm & Send"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Renewals;
