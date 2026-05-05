import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Users, CheckCircle2, Euro, FileWarning, Wallet, AlertTriangle,
  TrendingUp, UserPlus, Clock, ChevronRight, Lightbulb,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
  LineChart, Line, Legend,
} from "recharts";
import { useToast } from "@/hooks/use-toast";

type Insights = {
  overview: {
    total_customers: number;
    jobs_completed_this_month: number;
    revenue_this_month: number;
    outstanding_invoices_count: number;
    outstanding_invoices_value: number;
  };
  retention: {
    due_next_30_days: number;
    due_31_60_days: number;
    due_61_90_days: number;
    no_next_service_due: number;
    opted_out: number;
  };
  at_risk: { green: number; amber: number };
};

const fmtEur = (n: number) =>
  new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n || 0);

const BRAND_BLUE = "hsl(213 94% 50%)";
const GREEN = "hsl(142 71% 45%)";
const AMBER = "hsl(38 92% 50%)";
const RED = "hsl(0 72% 51%)";
const SLATE = "hsl(215 16% 47%)";

const LiveBadge = () => (
  <Badge variant="secondary" className="ml-2 text-[10px] font-semibold uppercase tracking-wide">
    Live data
  </Badge>
);
const PreviewBadge = () => (
  <Badge variant="outline" className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
    Preview data
  </Badge>
);

const KpiCard = ({
  label, value, icon: Icon, badge,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  badge: "live" | "preview";
}) => (
  <Card>
    <CardContent className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          {badge === "live" ? <LiveBadge /> : <PreviewBadge />}
        </div>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-2 font-mono text-2xl font-bold tracking-tight">{value}</div>
    </CardContent>
  </Card>
);

const StatCard = ({
  label, value, icon: Icon, accent,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;
}) => (
  <Card>
    <CardContent className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Icon className="h-4 w-4" style={accent ? { color: accent } : undefined} />
      </div>
      <div
        className="mt-2 font-mono text-2xl font-bold tracking-tight"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </div>
    </CardContent>
  </Card>
);

// Dummy data ────────────────────────────────────────────────
const monthlyData = [
  { month: "May 25", returning: 32, new: 12 },
  { month: "Jun 25", returning: 28, new: 9 },
  { month: "Jul 25", returning: 34, new: 14 },
  { month: "Aug 25", returning: 30, new: 11 },
  { month: "Sep 25", returning: 36, new: 13 },
  { month: "Oct 25", returning: 41, new: 16 },
  { month: "Nov 25", returning: 38, new: 12 },
  { month: "Dec 25", returning: 27, new: 8 },
  { month: "Jan 26", returning: 33, new: 15 },
  { month: "Feb 26", returning: 35, new: 17 },
  { month: "Mar 26", returning: 39, new: 14 },
  { month: "Apr 26", returning: 42, new: 18 },
];

const yoyData = [
  { month: "May", thisYear: 44, lastYear: 36 },
  { month: "Jun", thisYear: 37, lastYear: 33 },
  { month: "Jul", thisYear: 48, lastYear: 39 },
  { month: "Aug", thisYear: 41, lastYear: 35 },
  { month: "Sep", thisYear: 49, lastYear: 38 },
  { month: "Oct", thisYear: 57, lastYear: 42 },
  { month: "Nov", thisYear: 50, lastYear: 41 },
  { month: "Dec", thisYear: 35, lastYear: 32 },
  { month: "Jan", thisYear: 48, lastYear: 38 },
  { month: "Feb", thisYear: 52, lastYear: 40 },
  { month: "Mar", thisYear: 53, lastYear: 44 },
  { month: "Apr", thisYear: 60, lastYear: 47 },
];

const atRisk = [
  { customer: "M. Byrne", lastService: "12 Mar 25", nextDue: "12 Mar 26", daysOverdue: 54, status: "Overdue" },
  { customer: "S. O'Reilly", lastService: "02 Apr 25", nextDue: "02 Apr 26", daysOverdue: 33, status: "Overdue" },
  { customer: "J. Murphy", lastService: "18 Apr 25", nextDue: "18 Apr 26", daysOverdue: 17, status: "Overdue" },
  { customer: "K. Doyle", lastService: "—", nextDue: "—", daysOverdue: 0, status: "No date set" },
  { customer: "P. Walsh", lastService: "01 May 25", nextDue: "01 May 26", daysOverdue: 4, status: "Overdue" },
];

// ────────────────────────────────────────────────────────────

const BusinessInsightsDashboard = () => {
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data: res, error: err } = await supabase.functions.invoke("get-business-insights");
      if (cancelled) return;
      if (err || !res || (res as any).error) {
        const msg = err?.message || (res as any)?.error || "Failed to load insights";
        setError(msg);
        toast({ title: "Couldn't load insights", description: msg, variant: "destructive" });
      } else {
        setInsights(res as Insights);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [toast]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !insights) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <div>
              <div className="font-semibold">Couldn't load insights</div>
              <div className="text-sm text-muted-foreground">{error}</div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const overdueCount = insights.at_risk.amber + insights.retention.no_next_service_due;

  // Funnel steps (only last is live)
  const funnel = [
    { label: "Had service last year", value: 312, color: SLATE },
    { label: "Returned this year", value: 231, color: GREEN },
    { label: "Not yet seen", value: 81, color: AMBER },
    { label: "Overdue 60+ days", value: insights.at_risk.amber, color: RED },
  ];

  const dueChart = [
    { name: "0–30 days", value: insights.retention.due_next_30_days, fill: RED },
    { name: "31–60 days", value: insights.retention.due_31_60_days, fill: AMBER },
    { name: "61–90 days", value: insights.retention.due_61_90_days, fill: GREEN },
  ];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Business Insights</h1>
        <p className="text-sm text-muted-foreground">
          Customer retention &amp; revenue health overview
        </p>
      </div>

      {/* 1. KPI ROW */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Retention Rate" value="74%" icon={TrendingUp} badge="preview" />
        <KpiCard label="New Customers" value="93" icon={UserPlus} badge="preview" />
        <KpiCard label="Overdue" value={overdueCount} icon={AlertTriangle} badge="live" />
        <KpiCard
          label="Outstanding Value"
          value={fmtEur(insights.overview.outstanding_invoices_value)}
          icon={Wallet}
          badge="live"
        />
      </section>

      {/* 2. RETENTION FUNNEL */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-base font-extrabold">
            Retention Funnel
            <PreviewBadge />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
            {funnel.map((step, i) => (
              <div key={step.label} className="flex flex-1 items-center gap-2">
                <div
                  className="flex flex-1 flex-col rounded-lg p-4 text-white"
                  style={{ backgroundColor: step.color }}
                >
                  <span className="text-[11px] font-semibold uppercase tracking-wide opacity-90">
                    {step.label}
                  </span>
                  <span className="mt-1 font-mono text-2xl font-bold">{step.value}</span>
                </div>
                {i < funnel.length - 1 && (
                  <ChevronRight className="hidden h-5 w-5 shrink-0 text-muted-foreground md:block" />
                )}
              </div>
            ))}
          </div>

          <div
            className="mt-4 flex items-start gap-3 rounded-lg border p-4"
            style={{ borderColor: AMBER, backgroundColor: "hsl(38 92% 50% / 0.08)" }}
          >
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" style={{ color: AMBER }} />
            <p className="text-sm">
              <span className="font-semibold">81 customers haven't rebooked yet.</span>{" "}
              At €150 average that's <span className="font-semibold">€12,150</span> available to
              recover with targeted outreach.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Overview row (existing live cards) */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Total Customers" value={insights.overview.total_customers} icon={Users} />
        <StatCard label="Jobs This Month" value={insights.overview.jobs_completed_this_month} icon={CheckCircle2} />
        <StatCard label="Revenue This Month" value={fmtEur(insights.overview.revenue_this_month)} icon={Euro} />
        <StatCard label="Outstanding Invoices" value={insights.overview.outstanding_invoices_count} icon={FileWarning} />
        <StatCard label="Outstanding Value" value={fmtEur(insights.overview.outstanding_invoices_value)} icon={Wallet} />
      </section>

      {/* 3. MONTHLY JOBS */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-base font-extrabold">
            Monthly Jobs — New vs Returning Customers
            <PreviewBadge />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="returning" name="Returning" fill={BRAND_BLUE} radius={[4, 4, 0, 0]} />
                <Bar dataKey="new" name="New" fill={GREEN} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* 4. YEAR ON YEAR */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-base font-extrabold">
            Year-on-Year Job Volume
            <PreviewBadge />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={yoyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone" dataKey="thisYear" name="This Year"
                  stroke={BRAND_BLUE} strokeWidth={2} dot={{ r: 3 }}
                />
                <Line
                  type="monotone" dataKey="lastYear" name="Last Year"
                  stroke={SLATE} strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Service Due — Next 90 Days (kept, live) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-base font-extrabold">
            Service Due — Next 90 Days
            <LiveBadge />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dueChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {dueChart.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* 5. AT RISK */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-base font-extrabold">
            At Risk
            <LiveBadge />
            <PreviewBadge />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <StatCard label="Serviced This Year" value={231} icon={CheckCircle2} accent={GREEN} />
            <StatCard label="Due Within 60 Days" value={insights.at_risk.amber} icon={Clock} accent={AMBER} />
            <StatCard label="Overdue" value={insights.retention.no_next_service_due} icon={AlertTriangle} accent={RED} />
          </div>

          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Customer</th>
                  <th className="px-3 py-2 text-left font-semibold">Last Service</th>
                  <th className="px-3 py-2 text-left font-semibold">Next Due</th>
                  <th className="px-3 py-2 text-right font-semibold">Days Overdue</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {atRisk.map((r) => (
                  <tr key={r.customer} className="border-t">
                    <td className="px-3 py-2">{r.customer}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.lastService}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.nextDue}</td>
                    <td className="px-3 py-2 text-right font-mono">{r.daysOverdue || "—"}</td>
                    <td className="px-3 py-2">
                      <Badge
                        variant="outline"
                        style={{
                          borderColor: r.status === "Overdue" ? RED : AMBER,
                          color: r.status === "Overdue" ? RED : AMBER,
                        }}
                      >
                        {r.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BusinessInsightsDashboard;
