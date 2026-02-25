import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FileText, Plus, Clock, CheckCircle2, CreditCard, Send, Edit2, User,
  Loader2, X, MessageCircle
} from "lucide-react";
import { SendAllBanner, SendAllQuotesSheet, type UnsentQuote } from "@/components/jobs/SendAllQuotes";

type Quote = {
  id: string;
  job_id: string;
  customer_id: string;
  description: string;
  parts_cost: number | null;
  labour_cost: number | null;
  callout_cost: number | null;
  total_amount: number;
  status: string;
  sent_at: string | null;
  accepted_at: string | null;
  paid_at: string | null;
  payment_link: string | null;
  deposit_amount: number | null;
  created_at: string;
  customers: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    address: string;
    eircode: string;
  };
  service_calls: {
    id: string;
    job_type: string;
    assigned_engineer: string | null;
  };
};

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  Draft:    { bg: "bg-muted",           text: "text-muted-foreground", dot: "bg-muted-foreground/50" },
  Sent:     { bg: "bg-primary/10",      text: "text-primary",          dot: "bg-primary" },
  Accepted: { bg: "bg-success/10",      text: "text-success",          dot: "bg-success" },
  Rejected: { bg: "bg-destructive/10",  text: "text-destructive",      dot: "bg-destructive" },
  Paid:     { bg: "bg-success/20",      text: "text-success",          dot: "bg-success" },
};

const JOB_TYPE_STYLES: Record<string, string> = {
  Repair:           "bg-purple-100 text-purple-700",
  Emergency:        "bg-destructive/10 text-destructive",
  "Boiler Service": "bg-primary/10 text-primary",
};

const FILTERS = ["All", "Draft", "Sent", "Accepted", "Paid", "Rejected"];

const Quotes = () => {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState<Quote | null>(null);
  const [tab, setTab] = useState<"details" | "timeline" | "actions">("details");

  // Create form
  const [createOpen, setCreateOpen] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [formCustomerId, setFormCustomerId] = useState("");
  const [formJobId, setFormJobId] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formParts, setFormParts] = useState("");
  const [formPartsCost, setFormPartsCost] = useState("");
  const [formLabourCost, setFormLabourCost] = useState("");
  const [formCalloutCost, setFormCalloutCost] = useState("");
  const [formTotal, setFormTotal] = useState("");
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [saving, setSaving] = useState(false);

  // WhatsApp send
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [whatsappMsg, setWhatsappMsg] = useState("");

  // Send All Quotes
  const [sendAllOpen, setSendAllOpen] = useState(false);

  // Payment link
  const [payOpen, setPayOpen] = useState(false);
  const [payLink, setPayLink] = useState("");
  const [payType, setPayType] = useState<"full" | "deposit">("full");
  const [payDeposit, setPayDeposit] = useState("");

  const fetchQuotes = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("quotes")
      .select("*, customers!inner(id, name, phone, email, address, eircode), service_calls!inner(id, job_type, assigned_engineer)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setQuotes((data || []) as unknown as Quote[]);
    setLoading(false);
  };

  useEffect(() => {
    if (user) fetchQuotes();
  }, [user]);

  const filtered = filter === "All" ? quotes : quotes.filter((q) => q.status === filter);

  const kpi = {
    total: quotes.length,
    open: quotes.filter((q) => ["Draft", "Sent"].includes(q.status)).length,
    accepted: quotes.filter((q) => q.status === "Accepted").length,
    paid: quotes.filter((q) => q.status === "Paid").length,
  };

  const sentCount = quotes.filter((q) => q.status === "Sent").length;

  // Unsent quotes for Send All feature
  const unsentQuotes: UnsentQuote[] = quotes
    .filter(q => q.status === "Draft")
    .map(q => ({
      id: q.id,
      customer: q.customers?.name || "Unknown",
      phone: q.customers?.phone || "",
      jobType: q.service_calls?.job_type || "Job",
      total: Number(q.total_amount) || 0,
      description: q.description,
      quoteUrl: `${window.location.origin}/quote/${q.id}`,
    }));

  const handleQuoteSent = async (quoteId: string) => {
    await supabase.from("quotes").update({ status: "Sent", sent_at: new Date().toISOString() } as any).eq("id", quoteId);
    fetchQuotes();
  };

  // ── Status update ──
  const updateStatus = async (quoteId: string, newStatus: string, extra: Record<string, any> = {}) => {
    await supabase.from("quotes").update({ status: newStatus, ...extra } as any).eq("id", quoteId);
    toast({ title: `Quote marked as ${newStatus}` });
    fetchQuotes();
    if (selected?.id === quoteId) {
      setSelected((prev) => prev ? { ...prev, status: newStatus, ...extra } : null);
    }
  };

  // ── Create form handlers ──
  const openCreate = async () => {
    if (!user) return;
    setFormCustomerId(""); setFormJobId(""); setFormDesc(""); setFormParts("");
    setFormPartsCost(""); setFormLabourCost(""); setFormCalloutCost("");
    setFormTotal(""); setShowBreakdown(false);

    const { data: c } = await supabase.from("customers").select("id, name, phone").eq("user_id", user.id).order("name");
    setCustomers(c || []);
    setJobs([]);
    setCreateOpen(true);
  };

  const onCustomerSelect = async (customerId: string) => {
    setFormCustomerId(customerId);
    const { data: j } = await supabase.from("service_calls").select("id, job_type, scheduled_date")
      .eq("customer_id", customerId).order("created_at", { ascending: false });
    setJobs(j || []);
    if (j?.length === 1) setFormJobId(j[0].id);
  };

  const calcTotal = showBreakdown
    ? (parseFloat(formPartsCost) || 0) + (parseFloat(formLabourCost) || 0) + (parseFloat(formCalloutCost) || 0)
    : parseFloat(formTotal) || 0;

  const handleCreate = async (andSend?: boolean) => {
    if (!user || !formCustomerId || !formJobId || !formDesc.trim() || calcTotal <= 0) {
      toast({ title: "Fill in customer, job, description, and total", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.from("quotes").insert([{
      user_id: user.id,
      customer_id: formCustomerId,
      job_id: formJobId,
      description: formDesc.trim(),
      parts_cost: showBreakdown ? parseFloat(formPartsCost) || 0 : null,
      labour_cost: showBreakdown ? parseFloat(formLabourCost) || 0 : null,
      callout_cost: showBreakdown ? parseFloat(formCalloutCost) || 0 : null,
      total_amount: calcTotal,
      status: "Draft",
    }] as any).select("*, customers!inner(id, name, phone, email, address, eircode), service_calls!inner(id, job_type, assigned_engineer)").single();

    await supabase.from("service_calls").update({ has_quote: true } as any).eq("id", formJobId);
    setSaving(false);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Quote created" });
    setCreateOpen(false);
    fetchQuotes();

    if (andSend && data) {
      const q = data as unknown as Quote;
      setSelected(q);
      openWhatsApp(q);
    }
  };

  // ── WhatsApp ──
  const openWhatsApp = (q: Quote) => {
    const quoteLink = `${window.location.origin}/quote/${q.id}`;
    const payLine = q.payment_link
      ? `\n\nPay ${q.deposit_amount ? `deposit of €${q.deposit_amount}` : "now"}: ${q.payment_link}`
      : "";
    setWhatsappMsg(
      `Hi ${q.customers.name.split(" ")[0]},\n\nHere is your quote for: ${q.description}\n\nTotal: €${Number(q.total_amount).toLocaleString()}\n\nView & approve here:\n${quoteLink}${payLine}\n\nKarl's Gas`
    );
    setWhatsappOpen(true);
  };

  const sendWhatsApp = (q: Quote) => {
    const phone = q.customers.phone.replace(/\D/g, "");
    const fullPhone = phone.startsWith("353") ? phone : phone.startsWith("0") ? "353" + phone.slice(1) : "353" + phone;
    window.open(`https://wa.me/${fullPhone}?text=${encodeURIComponent(whatsappMsg)}`, "_blank");
    updateStatus(q.id, "Sent", { sent_at: new Date().toISOString() });
    setWhatsappOpen(false);
  };

  // ── Payment ──
  const openPay = (q: Quote) => {
    setPayLink(q.payment_link || "");
    setPayType(q.deposit_amount ? "deposit" : "full");
    setPayDeposit(q.deposit_amount?.toString() || "");
    setPayOpen(true);
  };

  const savePay = async (q: Quote) => {
    if (!payLink.trim()) { toast({ title: "Enter a payment link", variant: "destructive" }); return; }
    await supabase.from("quotes").update({
      payment_link: payLink.trim(),
      deposit_amount: payType === "deposit" ? parseFloat(payDeposit) || null : null,
    } as any).eq("id", q.id);
    toast({ title: "Payment link saved" });
    setPayOpen(false);
    fetchQuotes();
  };

  // ── Relative time ──
  const relTime = (d: string | null) => {
    if (!d) return null;
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("en-IE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;

  if (authLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><FileText className="w-5 h-5 text-primary" /> Quotes</h1>
          <p className="text-sm text-muted-foreground">
            {sentCount > 0 ? `${sentCount} awaiting approval` : "All quotes"}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" /> New Quote
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { icon: <FileText className="w-4 h-4 text-primary" />, value: kpi.total, label: "Total", accent: "border-t-primary" },
          { icon: <Clock className="w-4 h-4 text-warning" />, value: kpi.open, label: "Open", accent: "border-t-warning" },
          { icon: <CheckCircle2 className="w-4 h-4 text-success" />, value: kpi.accepted, label: "Accepted", accent: "border-t-success" },
          { icon: <CreditCard className="w-4 h-4 text-success" />, value: kpi.paid, label: "Paid", accent: "border-t-success" },
        ].map((k) => (
          <Card key={k.label} className={`shadow-sm border-t-[3px] ${k.accent}`}>
            <CardContent className="pt-3 pb-3 px-4">
              <div className="mb-1">{k.icon}</div>
              <p className="text-xl font-extrabold">{k.value}</p>
              <p className="text-[11px] text-muted-foreground">{k.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => {
          const s = STATUS_STYLES[f];
          const active = filter === f;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`shrink-0 text-xs font-semibold px-3.5 py-1.5 rounded-full border transition-colors ${
                active
                  ? f === "All"
                    ? "bg-primary/10 text-primary border-primary"
                    : `${s?.bg} ${s?.text} border-current`
                  : "bg-card text-muted-foreground border-border hover:border-primary/30"
              }`}
            >
              {f}
            </button>
          );
        })}
      </div>

      {/* Send All Banner */}
      {!loading && <SendAllBanner unsentQuotes={unsentQuotes} onSendAll={() => setSendAllOpen(true)} />}

      {/* Quote cards */}
      {loading ? (
        <p className="text-center text-muted-foreground py-12">Loading quotes...</p>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center space-y-3">
            <FileText className="w-10 h-10 mx-auto text-muted-foreground" />
            <p className="font-bold">No {filter !== "All" ? filter : ""} quotes</p>
            <p className="text-sm text-muted-foreground">Tap + New Quote to create one</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((q) => {
            const ss = STATUS_STYLES[q.status] || STATUS_STYLES.Draft;
            const jt = JOB_TYPE_STYLES[q.service_calls?.job_type] || "bg-muted text-muted-foreground";
            return (
              <Card
                key={q.id}
                className="cursor-pointer hover:shadow-md transition-all border-l-4"
                style={{ borderLeftColor: `var(--${q.status === "Paid" ? "success" : q.status === "Sent" ? "primary" : q.status === "Rejected" ? "destructive" : q.status === "Accepted" ? "success" : "border"})` }}
                onClick={() => { setSelected(q); setTab("details"); }}
              >
                <CardContent className="p-4">
                  {/* Top row */}
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground font-semibold">Q-{q.id.slice(0, 4).toUpperCase()}</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${jt}`}>
                        {q.service_calls?.job_type || "Job"}
                      </span>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full ${ss.bg} ${ss.text}`}>
                      <span className={`w-[7px] h-[7px] rounded-full ${ss.dot}`} />
                      {q.status}
                    </span>
                  </div>
                  {/* Customer & description */}
                  <p className="font-extrabold text-base">{q.customers?.name}</p>
                  <p className="text-sm text-muted-foreground line-clamp-1 mb-2.5">{q.description}</p>
                  {/* Footer */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      <User className="w-3.5 h-3.5 inline mr-0.5" /> {q.service_calls?.assigned_engineer || "—"} · {relTime(q.created_at)}
                    </span>
                    <span className="text-lg font-extrabold">€{Number(q.total_amount).toLocaleString()}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Quote Detail Sheet ── */}
      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-[520px] overflow-y-auto p-0">
          {selected && (() => {
            const q = selected;
            const ss = STATUS_STYLES[q.status] || STATUS_STYLES.Draft;
            const jt = JOB_TYPE_STYLES[q.service_calls?.job_type] || "bg-muted text-muted-foreground";

            const timeline = [
              { label: "Quote created", time: fmtDate(q.created_at), done: true },
              { label: "Sent to customer", time: fmtDate(q.sent_at), done: ["Sent", "Accepted", "Paid", "Rejected"].includes(q.status) },
              { label: "Customer accepted", time: fmtDate(q.accepted_at), done: ["Accepted", "Paid"].includes(q.status) },
              { label: "Payment received", time: fmtDate(q.paid_at), done: q.status === "Paid" },
            ];

            return (
              <>
                {/* Header */}
                <div className="p-5 pb-4 border-b border-border">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[11px] text-muted-foreground font-semibold">Q-{q.id.slice(0, 4).toUpperCase()}</span>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${jt}`}>{q.service_calls?.job_type}</span>
                      </div>
                      <p className="text-xl font-extrabold">{q.customers.name}</p>
                      <p className="text-sm text-muted-foreground">{q.customers.address} · {q.customers.eircode}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full ${ss.bg} ${ss.text}`}>
                      <span className={`w-[7px] h-[7px] rounded-full ${ss.dot}`} />
                      {q.status}
                    </span>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-border">
                  {(["details", "timeline", "actions"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`flex-1 py-3 text-sm capitalize transition-colors ${
                        tab === t
                          ? "font-bold text-primary border-b-2 border-primary"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <div className="p-5">
                  {/* Details Tab */}
                  {tab === "details" && (
                    <div className="space-y-4">
                      <Card>
                        <CardContent className="p-4 space-y-3">
                          <div>
                            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">Work Description</p>
                            <p className="text-sm font-semibold">{q.description}</p>
                          </div>
                          {/* Price breakdown */}
                          <div className="border-t border-border pt-3 space-y-1.5">
                            {q.parts_cost ? (
                              <div className="flex justify-between text-sm border-b border-dashed border-border pb-1.5">
                                <span className="text-muted-foreground">Parts</span>
                                <span>€{Number(q.parts_cost).toFixed(2)}</span>
                              </div>
                            ) : null}
                            {q.labour_cost ? (
                              <div className="flex justify-between text-sm border-b border-dashed border-border pb-1.5">
                                <span className="text-muted-foreground">Labour</span>
                                <span>€{Number(q.labour_cost).toFixed(2)}</span>
                              </div>
                            ) : null}
                            {q.callout_cost ? (
                              <div className="flex justify-between text-sm border-b border-border pb-1.5">
                                <span className="text-muted-foreground">Call-Out</span>
                                <span>€{Number(q.callout_cost).toFixed(2)}</span>
                              </div>
                            ) : null}
                            <div className="flex justify-between pt-2">
                              <span className="text-base font-extrabold">TOTAL</span>
                              <span className="text-xl font-extrabold text-primary">€{Number(q.total_amount).toLocaleString()}</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Engineer info */}
                      <Card>
                        <CardContent className="p-4 flex justify-between">
                          <div>
                            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">Assigned Engineer</p>
                            <p className="text-sm font-bold">👷 {q.service_calls?.assigned_engineer || "Unassigned"}</p>
                          </div>
                          <div>
                            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">Job Type</p>
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${jt}`}>{q.service_calls?.job_type}</span>
                          </div>
                        </CardContent>
                      </Card>

                      {q.payment_link && (
                        <div className="flex items-center gap-2 text-xs text-success font-semibold p-3 bg-success/10 rounded-lg">
                          💳 Payment link attached
                        </div>
                      )}
                    </div>
                  )}

                  {/* Timeline Tab */}
                  {tab === "timeline" && (
                    <div className="space-y-4">
                      <div className="space-y-0">
                        {timeline.map((step, i) => (
                          <div key={i} className="flex gap-3">
                            <div className="flex flex-col items-center w-5">
                              <div className={`w-3 h-3 rounded-full shrink-0 mt-0.5 ${step.done ? "bg-primary ring-4 ring-primary/10" : "bg-border"}`} />
                              {i < 3 && <div className={`w-0.5 flex-1 my-1 min-h-[24px] ${step.done ? "bg-primary/20" : "bg-border"}`} />}
                            </div>
                            <div className="pb-4">
                              <p className={`text-sm ${step.done ? "font-bold" : "text-muted-foreground"}`}>{step.label}</p>
                              <p className="text-xs text-muted-foreground">{step.time || (step.done ? "Completed" : "Not yet")}</p>
                            </div>
                          </div>
                        ))}
                      </div>

                      <Card className={ss.bg}>
                        <CardContent className="p-4">
                          <p className={`text-sm font-bold ${ss.text}`}>Current status: {q.status}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {q.status === "Draft" && "Quote saved. Not yet sent to customer."}
                            {q.status === "Sent" && "Awaiting customer approval."}
                            {q.status === "Accepted" && "Customer approved. Awaiting payment."}
                            {q.status === "Paid" && "Quote fully settled. Job complete."}
                            {q.status === "Rejected" && "Customer declined this quote."}
                          </p>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {/* Actions Tab */}
                  {tab === "actions" && (
                    <div className="space-y-3">
                      {q.status === "Draft" && (
                        <>
                          <Button className="w-full justify-center" onClick={() => openWhatsApp(q)}>
                            <MessageCircle className="w-4 h-4 mr-2" /> Send via WhatsApp
                          </Button>
                          <Button variant="outline" className="w-full justify-center" onClick={() => {
                            const phone = q.customers.phone.replace(/\D/g, "");
                            const fp = phone.startsWith("353") ? phone : "353" + phone.replace(/^0/, "");
                            const quoteLink = `${window.location.origin}/quote/${q.id}`;
                            const sub = encodeURIComponent(`Your Quote from Karl's Gas — €${Number(q.total_amount).toFixed(2)}`);
                            const body = encodeURIComponent(`Hi ${q.customers.name},\n\nHere is your quote: ${quoteLink}\n\nTotal: €${Number(q.total_amount).toFixed(2)}\n\nKarl's Gas 🔥`);
                            window.open(`mailto:${q.customers.email}?subject=${sub}&body=${body}`, "_blank");
                            updateStatus(q.id, "Sent", { sent_at: new Date().toISOString() });
                          }}>
                            📧 Send via Email
                          </Button>
                          <Button variant="outline" className="w-full justify-center" onClick={() => navigate(`/jobs/${q.job_id}`)}>
                            <Edit2 className="w-4 h-4 mr-2" /> Edit Quote
                          </Button>
                        </>
                      )}

                      {q.status === "Sent" && (
                        <>
                          <Button className="w-full justify-center bg-success hover:bg-success/90" onClick={() => updateStatus(q.id, "Accepted", { accepted_at: new Date().toISOString() })}>
                            🧾 Mark as Accepted
                          </Button>
                          <Button variant="outline" className="w-full justify-center" onClick={() => openWhatsApp(q)}>
                            <MessageCircle className="w-4 h-4 mr-2" /> Resend via WhatsApp
                          </Button>
                          <Button variant="outline" className="w-full justify-center text-destructive hover:text-destructive" onClick={() => updateStatus(q.id, "Rejected")}>
                            <X className="w-4 h-4 mr-2" /> Mark as Rejected
                          </Button>
                        </>
                      )}

                      {q.status === "Accepted" && (
                        <>
                          <Button className="w-full justify-center bg-success hover:bg-success/90" onClick={() => openPay(q)}>
                            <CreditCard className="w-4 h-4 mr-2" /> Add Payment Link
                          </Button>
                          <Button variant="outline" className="w-full justify-center" onClick={() => updateStatus(q.id, "Paid", { paid_at: new Date().toISOString() })}>
                            ✅ Mark as Paid
                          </Button>
                        </>
                      )}

                      {q.status === "Paid" && (
                        <Card className="bg-success/10">
                          <CardContent className="p-6 text-center">
                            <p className="text-3xl mb-2">🎉</p>
                            <p className="font-bold text-success">Quote fully paid</p>
                            <p className="text-sm text-muted-foreground mt-1">€{Number(q.total_amount).toLocaleString()} received</p>
                          </CardContent>
                        </Card>
                      )}

                      {q.status === "Rejected" && (
                        <Card className="bg-destructive/10">
                          <CardContent className="p-6 text-center">
                            <p className="text-3xl mb-2">✕</p>
                            <p className="font-bold text-destructive">Customer declined</p>
                            <p className="text-sm text-muted-foreground mt-1">Follow up via WhatsApp</p>
                          </CardContent>
                        </Card>
                      )}

                      <Button variant="outline" className="w-full justify-center" onClick={() => navigate(`/customers/${q.customer_id}`)}>
                        <User className="w-4 h-4 mr-2" /> View Customer Profile
                      </Button>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* ── WhatsApp Send Dialog ── */}
      <Dialog open={whatsappOpen} onOpenChange={setWhatsappOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send via WhatsApp</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{selected.customers.name} · {selected.customers.phone}</p>
              <textarea
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[180px] font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={whatsappMsg}
                onChange={(e) => setWhatsappMsg(e.target.value)}
              />
              <p className="text-xs text-muted-foreground text-right">Edit before sending ↑</p>
              <Button className="w-full" onClick={() => sendWhatsApp(selected)}>📲 Open WhatsApp</Button>
              <Button variant="outline" className="w-full" onClick={() => setWhatsappOpen(false)}>Cancel</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Payment Link Dialog ── */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Payment Link</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Payment URL</Label>
                <Input value={payLink} onChange={(e) => setPayLink(e.target.value)} placeholder="https://buy.stripe.com/..." />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Payment Type</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setPayType("full")}
                    className={`p-3 rounded-xl border-2 text-sm font-semibold transition-colors ${
                      payType === "full" ? "border-primary bg-primary/5 text-primary" : "border-border text-foreground"
                    }`}
                  >
                    Full €{Number(selected.total_amount).toLocaleString()}
                  </button>
                  <button
                    onClick={() => setPayType("deposit")}
                    className={`p-3 rounded-xl border-2 text-sm font-semibold transition-colors ${
                      payType === "deposit" ? "border-primary bg-primary/5 text-primary" : "border-border text-foreground"
                    }`}
                  >
                    Deposit only
                  </button>
                </div>
              </div>
              {payType === "deposit" && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase text-muted-foreground">Deposit Amount</Label>
                  <Input type="number" value={payDeposit} onChange={(e) => setPayDeposit(e.target.value)} placeholder="€" />
                </div>
              )}
              <Button className="w-full bg-success hover:bg-success/90" onClick={() => savePay(selected)}>💳 Save Payment Link</Button>
              <Button variant="outline" className="w-full" onClick={() => setPayOpen(false)}>Cancel</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Create Quote Dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Quote</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Customer</Label>
              <Select value={formCustomerId} onValueChange={onCustomerSelect}>
                <SelectTrigger><SelectValue placeholder="Select customer..." /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name} — {c.phone}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formCustomerId && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Job</Label>
                <Select value={formJobId} onValueChange={setFormJobId}>
                  <SelectTrigger><SelectValue placeholder="Select job..." /></SelectTrigger>
                  <SelectContent>
                    {jobs.map((j) => (
                      <SelectItem key={j.id} value={j.id}>{j.job_type} — {j.scheduled_date || "Unscheduled"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Job Description *</Label>
              <Input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="e.g. Replace faulty burner unit" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Parts / Materials (optional)</Label>
              <Input value={formParts} onChange={(e) => setFormParts(e.target.value)} placeholder="e.g. Burner unit, ignition lead" />
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl border border-border">
              <span className="text-sm font-semibold">Show price breakdown</span>
              <Switch checked={showBreakdown} onCheckedChange={setShowBreakdown} />
            </div>

            {showBreakdown ? (
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Parts €", val: formPartsCost, set: setFormPartsCost },
                  { label: "Labour €", val: formLabourCost, set: setFormLabourCost },
                  { label: "Call-Out €", val: formCalloutCost, set: setFormCalloutCost },
                ].map((f) => (
                  <div key={f.label} className="space-y-1">
                    <Label className="text-[10px] font-semibold uppercase text-muted-foreground">{f.label}</Label>
                    <Input type="number" value={f.val} onChange={(e) => f.set(e.target.value)} placeholder="0" className="text-right" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Total Price *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base font-bold text-muted-foreground">€</span>
                  <Input value={formTotal} onChange={(e) => setFormTotal(e.target.value)} placeholder="0.00" className="pl-8 text-lg font-bold" type="number" />
                </div>
              </div>
            )}

            {showBreakdown && calcTotal > 0 && (
              <p className="text-right text-sm font-bold">Total: €{calcTotal.toFixed(2)}</p>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => handleCreate(false)} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                💾 Save Draft
              </Button>
              <Button className="flex-1" onClick={() => handleCreate(true)} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                📲 Send Now
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Send All Quotes Sheet */}
      <SendAllQuotesSheet
        open={sendAllOpen}
        onOpenChange={setSendAllOpen}
        quotes={unsentQuotes}
        onQuoteSent={handleQuoteSent}
      />
    </div>
  );
};

export default Quotes;
