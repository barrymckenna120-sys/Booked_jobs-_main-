import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import DateRangeToggle, { type ViewMode, getDateRange } from "@/components/shared/DateRangeToggle";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useOrgId } from "@/hooks/useOrgId";
import { paidJobsInPeriod, completedJobsInPeriod, collectedAmount, outstandingTotal, completionDate, isoDay } from "@/lib/financeMetrics";
import { withRequestTimeout } from "@/lib/queryDefaults";


import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, Clock, CheckCircle2, BarChart3, Calendar, RefreshCw, AlertTriangle, ChevronDown, Send, ClipboardList, Coins, TrendingDown, Banknote, CreditCard, FileText } from "lucide-react";

const eur = (n: number) => `€${n.toLocaleString()}`;

const getDayName = () =>
  ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date().getDay()];

const getMonthYear = (offset = 0) => {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return d.toLocaleString("en-IE", { month: "long", year: "numeric" });
};

// ── Renewal Status Pill ──
function RenewalStatusPill({ status }: { status: string }) {
  const cls =
    status === "Overdue" ? "badge-overdue" :
    status === "Due Soon" ? "badge-due-soon" :
    "badge-scheduled";
  return <span className={cls}>{status}</span>;
}

// ── This Month Snapshot ──
function ThisMonth({ revenue, outstanding, jobsCompleted, avgJob, completedJobs, periodLabel }: {
  revenue: number; outstanding: number; jobsCompleted: number; avgJob: number;
  completedJobs: { name: string; value: number; type: string; date: string }[];
  periodLabel: string;
}) {
  const collectionRate = revenue + outstanding > 0
    ? Math.round((revenue / (revenue + outstanding)) * 100) : 100;
  const healthColor = collectionRate >= 85 ? "success" : collectionRate >= 70 ? "warning" : "destructive";
  const healthLabel = collectionRate >= 85 ? "Healthy" : collectionRate >= 70 ? "Watch" : "Action Needed";
  const [showJobs, setShowJobs] = useState(false);

  const cards = [
    { value: eur(revenue), label: `Revenue ${periodLabel.split(" – ")[0] || periodLabel}`, icon: TrendingUp, accent: "success", clickable: false },
    { value: eur(outstanding), label: "Outstanding", icon: Clock, accent: outstanding > 1000 ? "warning" : "success", clickable: false },
    { value: jobsCompleted.toString(), label: "Jobs Completed", icon: CheckCircle2, accent: "primary", clickable: true },
    { value: eur(avgJob), label: "Average Job Value", icon: BarChart3, accent: "primary", clickable: false },
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs font-extrabold text-muted-foreground uppercase tracking-wider">
        {periodLabel}
      </p>

      {/* Health badge */}
      <div className={`flex items-center gap-3 rounded-xl p-3 border bg-${healthColor}/10 border-${healthColor}/20`}>
        <div className={`w-2.5 h-2.5 rounded-full bg-${healthColor} flex-shrink-0`} />
        <p className="text-sm">
          <span className={`font-extrabold text-${healthColor}`}>{healthLabel}</span>
          <span className="text-muted-foreground font-medium"> · {collectionRate}% of revenue collected</span>
        </p>
      </div>

      {/* Stat cards */}
      <div className="space-y-3">
        {cards.map((card, i) => (
          <Card
            key={i}
            className={`shadow-sm border-l-4 border-l-${card.accent} ${card.clickable ? "cursor-pointer hover:bg-accent/50 transition-colors" : ""}`}
            onClick={card.clickable ? () => setShowJobs(v => !v) : undefined}
          >
            <CardContent className="py-4 px-5 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl bg-${card.accent}/10 flex items-center justify-center flex-shrink-0`}>
                <card.icon className={`w-6 h-6 text-${card.accent}`} />
              </div>
              <div className="flex-1">
                <p className="text-2xl font-black tracking-tight leading-none mb-1">{card.value}</p>
                <p className="text-sm font-semibold text-muted-foreground">{card.label}</p>
              </div>
              {card.clickable && (
                <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${showJobs ? "rotate-180" : ""}`} />
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Completed jobs list */}
      {showJobs && (
        <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <p className="text-xs font-bold text-muted-foreground uppercase px-1">Completed Jobs – {periodLabel}</p>
          {completedJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No completed jobs in this period.</p>
          ) : (
            completedJobs.map((job, i) => (
              <Card key={i} className="shadow-sm border-l-4 border-l-success">
                <CardContent className="py-3 px-4 flex justify-between items-center">
                  <div>
                    <p className="font-bold text-sm mb-1">{job.name}</p>
                    <p className="text-xs text-muted-foreground">{job.type} · {new Date(job.date + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</p>
                  </div>
                  <p className="text-base font-extrabold flex-shrink-0 ml-3">{eur(job.value)}</p>
                </CardContent>
              </Card>
            ))
          )}
          <div className="flex justify-between items-center px-1 pt-1">
            <span className="text-xs font-semibold text-muted-foreground">{completedJobs.length} jobs</span>
            <span className="text-sm font-extrabold">{eur(completedJobs.reduce((s, j) => s + j.value, 0))} total</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Next Month Forecast ──
function NextMonth({ scheduledJobs, forecastRevenue, renewalsDue, renewalValue }: {
  scheduledJobs: number; forecastRevenue: number; renewalsDue: number; renewalValue: number;
}) {
  const totalForecast = forecastRevenue + renewalValue;
  const estimatedBookings = Math.round(renewalsDue * 0.7);
  const estimatedValue = estimatedBookings * 120;

  const forecastCards = [
    { icon: <ClipboardList className="w-5 h-5 text-primary" />, value: scheduledJobs.toString(), label: "Scheduled Jobs", accent: "primary" },
    { icon: <Coins className="w-5 h-5 text-success" />, value: eur(forecastRevenue), label: "From Jobs", accent: "success" },
    { icon: <RefreshCw className="w-5 h-5 text-warning" />, value: renewalsDue.toString(), label: "Renewals Due", accent: "warning" },
    { icon: <TrendingUp className="w-5 h-5 text-primary" />, value: eur(renewalValue), label: "Renewal Value", accent: "primary" },
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs font-extrabold text-muted-foreground uppercase tracking-wider">
        Next Month Forecast · {getMonthYear(1)}
      </p>

      {/* Hero total */}
      <div className="bg-gradient-to-br from-primary to-primary-dark rounded-2xl p-6 text-primary-foreground relative overflow-hidden">
        <div className="absolute -top-8 -right-5 w-32 h-32 rounded-full bg-white/[.07] pointer-events-none" />
        <p className="text-xs font-bold uppercase tracking-wider opacity-70 mb-2">Total Forecast Revenue</p>
        <p className="text-4xl font-black tracking-tighter leading-none mb-1">{eur(totalForecast)}</p>
        <p className="text-sm opacity-65">Jobs {eur(forecastRevenue)} + Renewals {eur(renewalValue)}</p>
      </div>

      {/* 2×2 grid */}
      <div className="grid grid-cols-2 gap-3">
        {forecastCards.map((card, i) => (
          <Card key={i} className={`shadow-sm border-t-[3px] border-t-${card.accent}`}>
            <CardContent className="py-4 px-4">
              <div className="flex justify-center mb-2">{card.icon}</div>
              <p className="text-xl font-black tracking-tight leading-none mb-1">{card.value}</p>
              <p className="text-xs font-semibold text-muted-foreground">{card.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Warning note */}
      <div className="flex items-start gap-3 bg-warning/10 border border-warning/20 rounded-xl p-3">
        <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-foreground">Renewals depend on reminders going out</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {renewalsDue} customers due. Average 70% conversion = ~{estimatedBookings} booked.
            Estimated value: {eur(estimatedValue)}.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Renewals List ──
function RenewalsList({ renewals }: { renewals: { name: string; due: string; value: number; status: string }[] }) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<"30" | "60">("30");
  const [showAll, setShowAll] = useState(false);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + parseInt(range));

  const visible = renewals.filter(r => new Date(r.due) <= cutoff);
  const displayList = showAll ? visible : visible.slice(0, 5);
  const totalValue = visible.reduce((s, r) => s + r.value, 0);

  return (
    <div className="space-y-3">
      <p className="text-xs font-extrabold text-muted-foreground uppercase tracking-wider">Upcoming Renewals</p>

      <button
        onClick={() => setOpen(v => !v)}
        className={`w-full p-5 rounded-2xl border-[1.5px] text-left flex items-center justify-between transition-all shadow-sm ${
          open ? "border-primary bg-accent" : "border-border bg-card"
        }`}
      >
        <div className="flex items-center gap-3">
          <RefreshCw className={`w-5 h-5 ${open ? "text-primary" : "text-muted-foreground"}`} />
          <div>
            <p className={`font-bold ${open ? "text-primary" : "text-foreground"}`}>View Upcoming Renewals</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {renewals.length} customers · {eur(renewals.reduce((s, r) => s + r.value, 0))} estimated
            </p>
          </div>
        </div>
        <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Range toggle */}
          <div className="flex gap-2">
            {(["30", "60"] as const).map(r => (
              <button
                key={r}
                onClick={() => { setRange(r); setShowAll(false); }}
                className={`flex-1 py-3 rounded-xl border-[1.5px] text-sm font-semibold transition-all ${
                  range === r ? "border-primary bg-accent text-primary font-extrabold" : "border-border bg-card text-foreground"
                }`}
              >
                Next {r} Days
              </button>
            ))}
          </div>

          {/* Summary */}
          <Card className="shadow-sm">
            <CardContent className="py-3 px-4 flex justify-between items-center">
              <span className="text-sm font-semibold text-muted-foreground">{visible.length} renewals due</span>
              <span className="text-base font-extrabold">{eur(totalValue)} potential</span>
            </CardContent>
          </Card>

          {/* List */}
          <div className="space-y-2">
            {displayList.map((r, i) => {
              const borderColor =
                r.status === "Overdue" ? "border-l-destructive" :
                r.status === "Due Soon" ? "border-l-warning" : "border-l-primary";
              return (
                <Card key={i} className={`shadow-sm border-l-4 ${borderColor}`}>
                  <CardContent className="py-3 px-4 flex justify-between items-center">
                    <div>
                      <p className="font-bold text-sm mb-1">{r.name}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(r.due).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span>
                        <RenewalStatusPill status={r.status} />
                      </div>
                    </div>
                    <p className="text-base font-extrabold flex-shrink-0 ml-3">{eur(r.value)}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {!showAll && visible.length > 5 && (
            <Button variant="outline" className="w-full" onClick={() => setShowAll(true)}>
              Show {visible.length - 5} more →
            </Button>
          )}

          <Button className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-extrabold py-6" size="lg">
            <Send className="w-5 h-5 mr-2" />
            Send Reminders to All {visible.length}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Outstanding Payments ──
function OutstandingPayments({ invoices }: { invoices: { name: string; amount: number; daysAgo: number; type: string }[] }) {
  const [open, setOpen] = useState(false);
  const totalOwed = invoices.reduce((s, i) => s + i.amount, 0);

  return (
    <div className="space-y-3">
      <p className="text-xs font-extrabold text-muted-foreground uppercase tracking-wider">Outstanding Payments</p>

      <button
        onClick={() => setOpen(v => !v)}
        className={`w-full p-5 rounded-2xl border-[1.5px] text-left flex items-center justify-between transition-all shadow-sm ${
          open ? "border-warning bg-warning/10" : "border-border bg-card"
        }`}
      >
        <div className="flex items-center gap-3">
          <Clock className={`w-5 h-5 ${open ? "text-warning" : "text-muted-foreground"}`} />
          <div>
            <p className={`font-bold ${open ? "text-foreground" : "text-foreground"}`}>View Outstanding Payments</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {invoices.length} invoices · {eur(totalOwed)} owed
            </p>
          </div>
        </div>
        <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
          {invoices.map((inv, i) => (
            <Card key={i} className={`shadow-sm border-l-4 ${inv.daysAgo > 14 ? "border-l-destructive" : "border-l-warning"}`}>
              <CardContent className="py-3 px-4 flex justify-between items-center">
                <div>
                  <p className="font-bold text-sm mb-1">{inv.name}</p>
                  <p className="text-xs text-muted-foreground">{inv.type} · {inv.daysAgo} days ago</p>
                </div>
                <div className="text-right flex-shrink-0 ml-3">
                  <p className="text-base font-extrabold">{eur(inv.amount)}</p>
                  <button className="text-xs text-primary font-bold hover:underline mt-0.5">Send link →</button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Payment Method Breakdown ──
function PaymentBreakdown({ jobs, dateRange }: { jobs: any[]; dateRange: { start: Date; end: Date; label: string } }) {
  const periodJobs = useMemo(
    () => paidJobsInPeriod(jobs, dateRange.start, dateRange.end).filter(j => j.payment_method),
    [jobs, dateRange],
  );

  const sum = (arr: any[]) => arr.reduce((s, r) => s + collectedAmount(r), 0);
  const cash = periodJobs.filter(j => j.payment_method === "cash");
  const card = periodJobs.filter(j => j.payment_method === "card");
  const invoice = periodJobs.filter(j => j.payment_method === "invoice");


  const methods = [
    { label: "Cash", icon: Banknote, count: cash.length, total: sum(cash), color: "text-emerald-600", bg: "bg-emerald-500/10", border: "border-l-emerald-500" },
    { label: "Card", icon: CreditCard, count: card.length, total: sum(card), color: "text-blue-600", bg: "bg-blue-500/10", border: "border-l-blue-500" },
    { label: "Invoice", icon: FileText, count: invoice.length, total: sum(invoice), color: "text-amber-600", bg: "bg-amber-500/10", border: "border-l-amber-500" },
  ];

  const totalCollected = sum(cash) + sum(card);
  const totalInvoiced = sum(invoice);

  return (
    <div className="space-y-3">
      <p className="text-xs font-extrabold text-muted-foreground uppercase tracking-wider">
        Payment Breakdown · {dateRange.label}
      </p>

      <div className="space-y-2">
        {methods.map((m) => (
          <Card key={m.label} className={`shadow-sm border-l-4 ${m.border}`}>
            <CardContent className="py-3.5 px-5 flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl ${m.bg} flex items-center justify-center flex-shrink-0`}>
                <m.icon className={`w-5 h-5 ${m.color}`} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-foreground">{m.label}</p>
                <p className="text-xs text-muted-foreground">{m.count} job{m.count !== 1 ? "s" : ""}</p>
              </div>
              <p className="text-lg font-extrabold text-foreground">{eur(m.total)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-emerald-500/10 rounded-xl p-3.5 text-center">
          <p className="text-lg font-black text-emerald-700 leading-none">{eur(totalCollected)}</p>
          <p className="text-[11px] font-semibold text-muted-foreground mt-1">Collected</p>
        </div>
        <div className={`rounded-xl p-3.5 text-center ${totalInvoiced > 0 ? "bg-amber-500/10" : "bg-muted/30"}`}>
          <p className={`text-lg font-black leading-none ${totalInvoiced > 0 ? "text-amber-700" : "text-muted-foreground"}`}>{eur(totalInvoiced)}</p>
          <p className="text-[11px] font-semibold text-muted-foreground mt-1">To Invoice</p>
        </div>
      </div>

      {periodJobs.length === 0 && (
        <p className="text-xs text-muted-foreground/60 text-center py-2">No payments recorded in this period.</p>
      )}
    </div>
  );
}

// ── Main Finance Page ──
const Finance = () => {
  const { user, loading: authLoading } = useAuth();
  const { orgId } = useOrgId();

  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState(new Date());

  const dateRange = useMemo(() => getDateRange(viewMode, anchor), [viewMode, anchor]);

  // Keyed on user?.id rather than the full user object so auth-event churn
  // (re-emitted sessions, hourly token refresh) doesn't re-run the fetch.
  const userId = user?.id;

  useEffect(() => {
    if (!userId || !orgId) return;

    let cancelled = false;
    const fetchAll = async () => {
      setLoading(true);
      try {
        const [jobsRes, custRes, quotesRes] = await withRequestTimeout(Promise.all([
          supabase.from("service_calls").select("*, customers(name)").eq("organisation_id", orgId),
          supabase.from("customers").select("*").eq("organisation_id", orgId),
          supabase.from("quotes").select("*, customers(name)").eq("organisation_id", orgId),
        ]));
        if (cancelled) return;
        if (jobsRes.data) setJobs(jobsRes.data);
        if (custRes.data) setCustomers(custRes.data);
        if (quotesRes.data) setQuotes(quotesRes.data);
      } catch (err) {
        // Hung/failed fetch must not leave the loader spinning forever —
        // fall back to whatever data is already in state (empty on first load).
        console.warn("[Finance] data fetch failed or timed out:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [userId, orgId]);



  const now = new Date();
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0);

  // Revenue basis: jobs where money was actually taken (payment_status), dated by payment.
  const paidJobs = useMemo(() => paidJobsInPeriod(jobs, dateRange.start, dateRange.end), [jobs, dateRange]);
  // Delivery basis: jobs marked Completed — a separate metric from revenue.
  const completedJobs = useMemo(() => completedJobsInPeriod(jobs, dateRange.start, dateRange.end), [jobs, dateRange]);

  const revenue = useMemo(() => paidJobs.reduce((s, j) => s + collectedAmount(j), 0), [paidJobs]);
  const outstanding = useMemo(() => outstandingTotal(jobs), [jobs]);
  const avgJob = paidJobs.length > 0 ? Math.round(revenue / paidJobs.length) : 0;
  const completedJobsList = useMemo(() =>
    completedJobs.map(j => ({
      name: j.customers?.name || "Unknown",
      value: collectedAmount(j),
      type: j.job_type || "Service",
      date: isoDay(completionDate(j)),
    })).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
  [completedJobs]);


  // Next month forecast
  const nextMonthJobs = useMemo(() =>
    jobs.filter(j => {
      if (!j.scheduled_date) return false;
      const d = new Date(j.scheduled_date + "T00:00:00");
      return d >= nextMonthStart && d <= nextMonthEnd;
    }), [jobs]);

  const forecastRevenue = useMemo(() => {
    const withRevenue = nextMonthJobs.filter(j => j.revenue);
    const totalKnown = withRevenue.reduce((s, j) => s + (j.revenue || 0), 0);
    const unknownCount = nextMonthJobs.length - withRevenue.length;
    return totalKnown + (unknownCount * (avgJob || 120));
  }, [nextMonthJobs, avgJob]);

  // Renewals
  const renewals = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return customers
      .filter(c => c.next_service_due)
      .map(c => {
        const due = new Date(c.next_service_due + "T00:00:00");
        const daysUntil = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const status = daysUntil < 0 ? "Overdue" : daysUntil <= 30 ? "Due Soon" : "Upcoming";
        return { name: c.name, due: c.next_service_due, value: 120, status };
      })
      .sort((a, b) => new Date(a.due).getTime() - new Date(b.due).getTime());
  }, [customers]);

  const renewalsDueNextMonth = useMemo(() =>
    customers.filter(c => {
      if (!c.next_service_due) return false;
      const d = new Date(c.next_service_due + "T00:00:00");
      return d >= nextMonthStart && d <= nextMonthEnd;
    }).length, [customers]);

  // Outstanding invoices
  const outstandingInvoices = useMemo(() =>
    quotes
      .filter(q => q.status === "Sent" || q.status === "Accepted")
      .map(q => {
        const daysAgo = Math.ceil((now.getTime() - new Date(q.sent_at || q.created_at).getTime()) / (1000 * 60 * 60 * 24));
        return {
          name: q.customers?.name || "Unknown",
          amount: q.total_amount || 0,
          daysAgo,
          type: q.description || "Service",
        };
      })
      .sort((a, b) => b.daysAgo - a.daysAgo),
  [quotes]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const monthName = now.toLocaleString("en-IE", { month: "long" });

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-br from-[hsl(var(--success))] to-[hsl(142,72%,22%)] px-6 pt-10 pb-7 text-white relative overflow-hidden">
        <div className="absolute -top-10 -right-5 w-40 h-40 rounded-full bg-white/[.07] pointer-events-none" />
        <div className="absolute -bottom-12 left-5 w-30 h-30 rounded-full bg-white/[.05] pointer-events-none" />

        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-sm font-bold opacity-85 mb-1">{dateRange.label}</p>
            <h1 className="text-3xl font-black tracking-tight text-white">Finance</h1>
          </div>
          <div className="[&_span]:text-white [&_button]:text-white [&_button[class*=bg-primary]]:!bg-white/30 [&_button[class*=bg-primary]]:!text-white [&_button[class*=bg-primary]]:!font-extrabold [&_div]:border-white/30 [&_div]:bg-white/10 [&_button:hover]:bg-white/20">
            <DateRangeToggle value={viewMode} onChange={setViewMode} anchor={anchor} onAnchorChange={setAnchor} />
          </div>
        </div>

        <div className="bg-white/15 rounded-2xl px-5 py-4 inline-flex flex-col gap-1">
          <p className="text-[11px] font-bold uppercase tracking-wider opacity-65">{dateRange.label} Revenue</p>
          <p className="text-4xl font-black tracking-tighter leading-none text-white">{eur(revenue)}</p>
          <p className="text-xs opacity-65">{eur(outstanding)} outstanding</p>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-6 space-y-8 pb-24">
        <ThisMonth revenue={revenue} outstanding={outstanding} jobsCompleted={completedJobs.length} avgJob={avgJob} completedJobs={completedJobsList} periodLabel={dateRange.label} />
        <PaymentBreakdown jobs={jobs} dateRange={dateRange} />
        <NextMonth
          scheduledJobs={nextMonthJobs.length}
          forecastRevenue={forecastRevenue}
          renewalsDue={renewalsDueNextMonth}
          renewalValue={renewalsDueNextMonth * 120}
        />
        <RenewalsList renewals={renewals} />
        <OutstandingPayments invoices={outstandingInvoices} />
      </div>
    </div>
  );
};

export default Finance;
