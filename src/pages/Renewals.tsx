import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import RenewalCard from "@/components/renewals/RenewalCard";
import RenewalDetailSheet from "@/components/renewals/RenewalDetailSheet";
import BookServiceSheet from "@/components/renewals/BookServiceSheet";

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
};

const FILTERS = ["All", "Overdue", "Due Soon", "Up to Date"] as const;

const filterStyles: Record<string, { active: string; inactive: string }> = {
  All:          { active: "border-primary bg-primary/10 text-primary", inactive: "border-border text-muted-foreground" },
  Overdue:      { active: "border-destructive bg-destructive/10 text-destructive", inactive: "border-border text-muted-foreground" },
  "Due Soon":   { active: "border-warning bg-warning/10 text-warning", inactive: "border-border text-muted-foreground" },
  "Up to Date": { active: "border-success bg-success/10 text-success", inactive: "border-border text-muted-foreground" },
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

const Renewals = () => {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [reminderSent, setReminderSent] = useState<Record<string, boolean>>({});
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [bookCustomer, setBookCustomer] = useState<Customer | null>(null);

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

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  if (authLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  const withStatus = customers.map((c) => {
    const daysUntil = getDaysUntil(c.next_service_due);
    return { ...c, daysUntil, renewalStatus: getStatus(daysUntil) };
  });

  const filtered = withStatus
    .filter((c) => filter === "All" || c.renewalStatus === filter)
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
    needReminder: withStatus.filter((c) => !c.reminder_30_days_sent && c.renewalStatus !== "Up to Date").length,
  };

  const handleSendReminder = (customer: Customer) => {
    const cleanPhone = customer.phone.replace(/\s+/g, "").replace(/^0/, "353");
    const nextDue = customer.next_service_due
      ? new Date(customer.next_service_due).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })
      : "soon";
    const msg = `Hi ${customer.name.split(" ")[0]},\nYour annual boiler service is due on ${nextDue}.\nReply YES to confirm or call us. Karl's Gas 🔥`;
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, "_blank");

    setReminderSent((p) => ({ ...p, [customer.id]: true }));

    if (user) {
      supabase.from("whatsapp_messages").insert({
        user_id: user.id,
        customer_id: customer.id,
        message_type: "30 Day Reminder",
        message_body: msg,
        sent_by: user.email,
        status: "Sent",
      } as any);

      supabase.from("customers").update({ reminder_30_days_sent: true }).eq("id", customer.id);
    }

    toast({ title: `Reminder sent to ${customer.name}` });
  };

  const selectedStatus = selectedCustomer ? getStatus(getDaysUntil(selectedCustomer.next_service_due)) : "Up to Date";
  const selectedDays = selectedCustomer ? getDaysUntil(selectedCustomer.next_service_due) : 0;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-xl font-extrabold">🔄 Renewals</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {counts.overdue} overdue · {counts.dueSoon} due soon
          </p>
        </div>
        {counts.needReminder > 0 && (
          <div className="bg-warning/10 text-warning rounded-lg px-3 py-1.5 text-xs font-bold">
            ⚠ {counts.needReminder} need reminder
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">🔍</span>
        <Input
          placeholder="Search customer or address..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Filter pills */}
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
              {f}
            </button>
          );
        })}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-2.5">
        {[
          { icon: "⚠️", value: counts.overdue, label: "Overdue", color: "border-t-destructive", alert: true },
          { icon: "⏰", value: counts.dueSoon, label: "Due Soon", color: "border-t-warning" },
          { icon: "✅", value: counts.upToDate, label: "Up to Date", color: "border-t-success" },
          { icon: "📲", value: counts.needReminder, label: "Need SMS", color: "border-t-primary" },
        ].map((k) => (
          <Card key={k.label} className={`border-t-[3px] ${k.color}`}>
            <CardContent className="p-3 text-center">
              <div className="text-lg mb-0.5">{k.icon}</div>
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
          <div className="text-3xl mb-2">🔄</div>
          <div className="font-bold">No {filter !== "All" ? filter : ""} renewals</div>
        </div>
      ) : (
        filtered.map((c) => (
          <RenewalCard
            key={c.id}
            customer={c}
            status={c.renewalStatus}
            daysUntil={c.daysUntil}
            reminderSent={reminderSent[c.id] || !!c.reminder_30_days_sent}
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
        reminderSent={selectedCustomer ? (reminderSent[selectedCustomer.id] || !!selectedCustomer.reminder_30_days_sent) : false}
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
    </div>
  );
};

export default Renewals;
