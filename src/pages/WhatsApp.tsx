import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Send as SendIcon, CheckCircle2, Clock, CalendarDays, Bot, AlertTriangle, Smartphone, PenLine, Eye, FileText, MessageSquare } from "lucide-react";
import SendReminderModal from "@/components/whatsapp/SendReminderModal";
import LogReplyModal from "@/components/whatsapp/LogReplyModal";
import ViewMessageModal from "@/components/whatsapp/ViewMessageModal";
import WhatsAppTemplates from "@/pages/WhatsAppTemplates";

type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  next_service_due: string | null;
  reminder_30_days_sent: boolean | null;
  reminder_7_days_sent: boolean | null;
  last_message_sent_at: string | null;
};

type Settings = {
  reminder_message_template: string | null;
  whatsapp_number: string | null;
  business_name: string;
};

type WaMessage = {
  id: string;
  customer_id: string;
  message_type: string;
  message_body: string;
  sent_at: string;
  sent_by: string | null;
  status: string;
  customer_reply: string | null;
  reply_received_at: string | null;
  linked_quote_id: string | null;
};

const typeBadgeClass = (type: string) => {
  const map: Record<string, string> = {
    appointment_reminder: "bg-warning-light text-warning",
    renewal: "bg-primary/10 text-primary",
    reminder: "bg-warning-light text-warning",
    quote: "bg-[hsl(263,70%,94%)] text-[hsl(263,70%,46%)]",
    booking_confirmation: "bg-success-light text-success",
    Booking_confirmation: "bg-success-light text-success",
    invoice: "bg-[hsl(24,94%,93%)] text-[hsl(24,94%,46%)]",
    receipt: "bg-[hsl(24,94%,93%)] text-[hsl(24,94%,46%)]",
    payment_link: "bg-[hsl(24,94%,93%)] text-[hsl(24,94%,46%)]",
    certificate: "bg-primary/10 text-primary",
    part_arrived: "bg-muted text-muted-foreground",
    Part_arrived: "bg-muted text-muted-foreground",
    job_update: "bg-muted text-muted-foreground",
    broadcast: "bg-muted text-muted-foreground",
  };
  return map[type] || "bg-muted text-muted-foreground";
};

const TYPE_LABELS: Record<string, string> = {
  appointment_reminder: "Appointment Reminder",
  renewal: "Renewal Reminder",
  reminder: "Reminder",
  quote: "Quote Sent",
  booking_confirmation: "Booking Confirmation",
  Booking_confirmation: "Booking Confirmation",
  invoice: "Invoice",
  receipt: "Receipt",
  payment_link: "Payment Link",
  certificate: "Gas Certificate",
  part_arrived: "Part Arrived",
  Part_arrived: "Part Arrived",
  job_update: "Job Update",
  broadcast: "Broadcast",
};

const friendlyType = (raw: string) =>
  TYPE_LABELS[raw] || raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const statusBadgeClass = (status: string) => {
  const map: Record<string, string> = {
    sent: "bg-primary/10 text-primary",
    delivered: "bg-success-light text-success",
    pending: "bg-muted text-muted-foreground",
    failed: "bg-destructive/10 text-destructive",
  };
  return map[status] || map["sent"];
};


const daysUntilClass = (days: number) => {
  if (days <= 7) return "bg-destructive-light text-destructive font-bold";
  if (days <= 14) return "bg-warning-light text-warning font-bold";
  return "bg-primary/10 text-primary font-semibold";
};

const WhatsApp = () => {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [customerMap, setCustomerMap] = useState<Record<string, Customer>>({});

  // KPI
  const [kpiSent, setKpiSent] = useState(0);
  const [kpiConfirmed, setKpiConfirmed] = useState(0);
  const [kpiNoResponse, setKpiNoResponse] = useState(0);
  const [kpiDueToSend, setKpiDueToSend] = useState(0);

  // Filters
  const [reminderFilter, setReminderFilter] = useState<number>(30);
  const [logTypeFilter, setLogTypeFilter] = useState("All");
  const [logStatusFilter, setLogStatusFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [logPage, setLogPage] = useState(0);

  // Modals
  const [sendModalCustomer, setSendModalCustomer] = useState<Customer | null>(null);
  const [logReplyMessage, setLogReplyMessage] = useState<(WaMessage & { customer_name?: string }) | null>(null);
  const [viewMessage, setViewMessage] = useState<(WaMessage & { customer_name?: string; customer_phone?: string }) | null>(null);

  const isMobile = useIsMobile();

  const fetchAll = useCallback(async () => {
    if (!user) return;

    const [settingsRes, customersRes, messagesRes] = await Promise.all([
      supabase.from("settings").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("customers").select("*").eq("user_id", user.id),
      supabase.from("whatsapp_messages").select("*").eq("user_id", user.id).order("sent_at", { ascending: false }).limit(200),
    ]);

    if (settingsRes.data) setSettings(settingsRes.data as any);
    const custs = (customersRes.data || []) as Customer[];
    setCustomers(custs);
    const map: Record<string, Customer> = {};
    custs.forEach((c) => (map[c.id] = c));
    setCustomerMap(map);

    const msgs = (messagesRes.data || []) as WaMessage[];
    setMessages(msgs);

    // KPIs
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonthMsgs = msgs.filter((m) => new Date(m.sent_at) >= monthStart);
    setKpiSent(thisMonthMsgs.length);
    setKpiConfirmed(thisMonthMsgs.filter((m) => m.status === "Confirmed").length);
    setKpiNoResponse(thisMonthMsgs.filter((m) => m.status === "No Response").length);

    const dueCount = custs.filter((c) => {
      if (!c.next_service_due || c.reminder_30_days_sent) return false;
      const diff = Math.ceil((new Date(c.next_service_due).getTime() - now.getTime()) / 86400000);
      return diff >= 0 && diff <= 30;
    }).length;
    setKpiDueToSend(dueCount);
  }, [user]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("whatsapp-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_messages" }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAll]);

  if (authLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  // Upcoming reminders
  const now = new Date();
  const upcomingCustomers = customers
    .filter((c) => {
      if (!c.next_service_due || c.reminder_30_days_sent) return false;
      const diff = Math.ceil((new Date(c.next_service_due).getTime() - now.getTime()) / 86400000);
      return diff >= 0 && diff <= reminderFilter;
    })
    .sort((a, b) => new Date(a.next_service_due!).getTime() - new Date(b.next_service_due!).getTime());

  // Filtered message log
  const filteredMessages = messages.filter((m) => {
    if (logTypeFilter !== "All" && m.message_type !== logTypeFilter) return false;
    if (logStatusFilter !== "All" && m.status !== logStatusFilter) return false;
    if (searchQuery) {
      const c = customerMap[m.customer_id];
      const q = searchQuery.toLowerCase();
      if (!c || (!c.name.toLowerCase().includes(q) && !c.phone.includes(q))) return false;
    }
    return true;
  });
  const pageSize = 20;
  const pagedMessages = filteredMessages.slice(logPage * pageSize, (logPage + 1) * pageSize);
  const totalPages = Math.ceil(filteredMessages.length / pageSize);

  // Automation counts
  const pending30 = customers.filter((c) => {
    if (!c.next_service_due || c.reminder_30_days_sent) return false;
    const diff = Math.ceil((new Date(c.next_service_due).getTime() - now.getTime()) / 86400000);
    return diff >= 0 && diff <= 30;
  }).length;
  const pending7 = customers.filter((c) => {
    if (!c.next_service_due || c.reminder_7_days_sent) return false;
    const diff = Math.ceil((new Date(c.next_service_due).getTime() - now.getTime()) / 86400000);
    return diff >= 0 && diff <= 7;
  }).length;

  const messageTypes = ["All", "30 Day Reminder", "7 Day Reminder", "Quote Sent", "Booking Confirmation", "Payment Request", "Custom"];
  const statusTypes = ["All", "Sent", "Confirmed", "No Response", "Opted Out"];


  const messagesContent = (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Sent This Month", value: kpiSent, icon: <SendIcon className="w-6 h-6 text-primary" /> },
            { label: "Confirmed", value: kpiConfirmed, icon: <CheckCircle2 className="w-6 h-6 text-success" /> },
            { label: "No Response", value: kpiNoResponse, icon: <Clock className="w-6 h-6 text-muted-foreground" /> },
            { label: "Due to Send", value: kpiDueToSend, icon: <CalendarDays className="w-6 h-6 text-destructive" /> },
          ].map((k) => (
            <Card key={k.label}>
              <CardContent className="p-4 text-center">
                <div className="flex justify-center mb-1">{k.icon}</div>
                <p className="text-2xl font-extrabold">{k.value}</p>
                <p className="text-xs text-muted-foreground">{k.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Automation Status */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="font-bold text-sm flex items-center gap-2"><Bot className="w-4 h-4 text-primary" /> Reminder Automation Status</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between"><span>30-day reminders</span><span className="text-muted-foreground">● Manual (tap to send)</span></div>
              <div className="flex justify-between"><span>7-day reminders</span><span className="text-muted-foreground">● Manual (tap to send)</span></div>
            </div>
            <div className="text-sm text-muted-foreground">
              {pending30 > 0 && <p>{pending30} customer{pending30 > 1 ? "s" : ""} need 30-day reminder</p>}
              {pending7 > 0 && <p>{pending7} customer{pending7 > 1 ? "s" : ""} need 7-day reminder</p>}
              {pending30 === 0 && pending7 === 0 && <p className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-success" /> All reminders up to date</p>}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Reminders */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-base">Upcoming Renewal Reminders</h2>
          </div>
          <div className="flex gap-2 mb-3 flex-wrap">
            {[7, 14, 30, 999].map((d) => (
              <button
                key={d}
                onClick={() => setReminderFilter(d)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                  reminderFilter === d ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                {d === 999 ? "All Upcoming" : `Next ${d} Days`}
              </button>
            ))}
          </div>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-4 py-2 font-semibold text-muted-foreground">Customer</th>
                    <th className="px-4 py-2 font-semibold text-muted-foreground">Phone</th>
                    <th className="px-4 py-2 font-semibold text-muted-foreground">Due Date</th>
                    <th className="px-4 py-2 font-semibold text-muted-foreground">Days</th>
                    <th className="px-4 py-2 font-semibold text-muted-foreground">Last Msg</th>
                    <th className="px-4 py-2 font-semibold text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingCustomers.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No reminders pending</td></tr>
                  )}
                  {upcomingCustomers.map((c) => {
                    const days = Math.ceil((new Date(c.next_service_due!).getTime() - now.getTime()) / 86400000);
                    return (
                      <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                        <td className="px-4 py-2.5 font-medium">{c.name}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{c.phone}</td>
                        <td className="px-4 py-2.5">{new Date(c.next_service_due!).toLocaleDateString("en-IE")}</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${daysUntilClass(days)}`}>
                            {days <= 7 ? <span className="flex items-center gap-0.5"><AlertTriangle className="w-3 h-3" /> {days}d</span> : `${days}d`}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">
                          {c.last_message_sent_at ? new Date(c.last_message_sent_at).toLocaleDateString("en-IE") : "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          <Button size="sm" onClick={() => setSendModalCustomer(c)} className="gap-1.5"><Smartphone className="w-3.5 h-3.5" /> Send Reminder</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Message Log */}
        <div>
          <h2 className="font-bold text-base mb-3">Message History</h2>
          <div className="space-y-3 mb-3">
            <Input
              placeholder="Search by customer name or phone..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setLogPage(0); }}
              className="max-w-sm"
            />
            <div className="flex gap-2 flex-wrap">
              {messageTypes.map((t) => (
                <button
                  key={t}
                  onClick={() => { setLogTypeFilter(t); setLogPage(0); }}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                    logTypeFilter === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {t === "All" ? "All Types" : t}
                </button>
              ))}
            </div>
            <div className="flex gap-2 flex-wrap">
              {statusTypes.map((s) => (
                <button
                  key={s}
                  onClick={() => { setLogStatusFilter(s); setLogPage(0); }}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                    logStatusFilter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {s === "All" ? "All Status" : s}
                </button>
              ))}
            </div>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-4 py-2 font-semibold text-muted-foreground">Date</th>
                    <th className="px-4 py-2 font-semibold text-muted-foreground">Customer</th>
                    <th className="px-4 py-2 font-semibold text-muted-foreground">Type</th>
                    <th className="px-4 py-2 font-semibold text-muted-foreground">Sent By</th>
                    <th className="px-4 py-2 font-semibold text-muted-foreground">Status</th>
                    <th className="px-4 py-2 font-semibold text-muted-foreground">Reply</th>
                    <th className="px-4 py-2 font-semibold text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedMessages.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">No messages found</td></tr>
                  )}
                  {pagedMessages.map((m) => {
                    const c = customerMap[m.customer_id];
                    return (
                      <tr key={m.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                        <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                          {new Date(m.sent_at).toLocaleString("en-IE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="px-4 py-2.5 font-medium">{c?.name || "—"}</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${typeBadgeClass(m.message_type)}`}>
                            {m.message_type}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">{m.sent_by || "—"}</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusBadgeClass(m.status)}`}>
                            {m.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[120px] truncate">
                          {m.customer_reply ? m.customer_reply.substring(0, 40) : "—"}
                        </td>
                        <td className="px-4 py-2.5 flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs px-2 h-7"
                            onClick={() => setLogReplyMessage({ ...m, customer_name: c?.name })}
                          >
                            <PenLine className="w-3 h-3 mr-0.5" /> Log Reply
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs px-2 h-7"
                            onClick={() => setViewMessage({ ...m, customer_name: c?.name, customer_phone: c?.phone })}
                          >
                            <Eye className="w-3 h-3 mr-0.5" /> View
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 p-3 border-t border-border">
                <Button size="sm" variant="outline" disabled={logPage === 0} onClick={() => setLogPage((p) => p - 1)}>Previous</Button>
                <span className="text-xs text-muted-foreground">Page {logPage + 1} of {totalPages}</span>
                <Button size="sm" variant="outline" disabled={logPage >= totalPages - 1} onClick={() => setLogPage((p) => p + 1)}>Next</Button>
              </div>
            )}
          </Card>
      </div>
    </div>
  );



  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">WhatsApp Messages</h1>
            <p className="text-sm text-muted-foreground">Renewal reminders and customer communications</p>
          </div>
          {!isMobile && (
            <Button variant="outline" size="sm" onClick={() => navigate("/whatsapp/templates")} className="gap-1.5">
              <FileText className="w-4 h-4" /> Templates
            </Button>
          )}
        </div>
      </header>

      {isMobile ? (
        <Tabs defaultValue="messages" className="w-full">
          <div className="border-b border-border bg-card px-4">
            <TabsList className="w-full">
              <TabsTrigger value="messages" className="flex-1 gap-1.5"><MessageSquare className="w-4 h-4" /> Messages</TabsTrigger>
              <TabsTrigger value="templates" className="flex-1 gap-1.5"><FileText className="w-4 h-4" /> Templates</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="messages">{messagesContent}</TabsContent>
          <TabsContent value="templates"><WhatsAppTemplates embedded /></TabsContent>
        </Tabs>
      ) : (
        messagesContent
      )}

      {/* Modals */}
      {sendModalCustomer && (
        <SendReminderModal
          customer={sendModalCustomer}
          settings={settings}
          open={!!sendModalCustomer}
          onClose={() => setSendModalCustomer(null)}
          onSent={fetchAll}
        />
      )}
      {logReplyMessage && (
        <LogReplyModal
          message={logReplyMessage}
          open={!!logReplyMessage}
          onClose={() => setLogReplyMessage(null)}
          onSaved={fetchAll}
        />
      )}
      {viewMessage && (
        <ViewMessageModal
          message={viewMessage}
          open={!!viewMessage}
          onClose={() => setViewMessage(null)}
        />
      )}
    </div>
  );
};

export default WhatsApp;
