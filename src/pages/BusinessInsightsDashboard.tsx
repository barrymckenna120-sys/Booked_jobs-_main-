import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Users, CheckCircle2, Euro, FileWarning, Wallet, AlertTriangle } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";

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

const StatCard = ({
  label, value, icon: Icon,
}: { label: string; value: string | number; icon: React.ComponentType<{ className?: string }> }) => (
  <Card>
    <CardContent className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-2 font-mono text-2xl font-bold tracking-tight">{value}</div>
    </CardContent>
  </Card>
);

const BusinessInsightsDashboard = () => {
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data: res, error: err } = await supabase.functions.invoke("get-business-insights");
      if (cancelled) return;
      if (err || !res || (res as any).error) {
        setError(err?.message || (res as any)?.error || "Failed to load insights");
      } else {
        setData(res as Insights);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
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

  const dueChart = [
    { name: "0–30 days", value: data.retention.due_next_30_days, fill: "hsl(0 72% 51%)" },
    { name: "31–60 days", value: data.retention.due_31_60_days, fill: "hsl(38 92% 50%)" },
    { name: "61–90 days", value: data.retention.due_61_90_days, fill: "hsl(142 71% 45%)" },
  ];

  const atRiskChart = [
    { name: "Green (reminded)", value: data.at_risk.green, fill: "hsl(142 71% 45%)" },
    { name: "Amber (no reminder)", value: data.at_risk.amber, fill: "hsl(38 92% 50%)" },
  ];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Business Insights</h1>
        <p className="text-sm text-muted-foreground">
          Customer retention &amp; revenue health overview
        </p>
      </div>

      {/* Overview */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Total Customers" value={data.overview.total_customers} icon={Users} />
        <StatCard label="Jobs This Month" value={data.overview.jobs_completed_this_month} icon={CheckCircle2} />
        <StatCard label="Revenue This Month" value={fmtEur(data.overview.revenue_this_month)} icon={Euro} />
        <StatCard label="Outstanding Invoices" value={data.overview.outstanding_invoices_count} icon={FileWarning} />
        <StatCard label="Outstanding Value" value={fmtEur(data.overview.outstanding_invoices_value)} icon={Wallet} />
      </section>

      {/* Retention */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-extrabold">Service Due — Next 90 Days</CardTitle>
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
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-2">
            <StatCard label="No Next Service Set" value={data.retention.no_next_service_due} icon={FileWarning} />
            <StatCard label="Opted Out" value={data.retention.opted_out} icon={AlertTriangle} />
          </div>
        </CardContent>
      </Card>

      {/* At Risk */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-extrabold">At Risk — Reminder Status (Next 90 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={atRiskChart} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} allowDecimals={false} />
                <YAxis dataKey="name" type="category" stroke="hsl(var(--muted-foreground))" fontSize={12} width={150} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {atRiskChart.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BusinessInsightsDashboard;
