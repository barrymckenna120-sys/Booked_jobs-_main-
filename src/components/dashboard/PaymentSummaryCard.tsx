import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Banknote, CreditCard, FileText, Loader2, TrendingUp } from "lucide-react";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { fetchFinanceJobs, type DashboardJob } from "@/lib/financeJobs";
import {
  paidJobsInPeriod,
  completedJobsInPeriod,
  collectedAmount,
} from "@/lib/financeMetrics";

type Period = "today" | "week";

const num = (v: unknown) => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};

const PaymentSummaryCard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>("today");
  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");
  const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-payment-summary", user?.id, todayStr],
    queryFn: async () => {
      // The week window contains today, so one fetch serves both periods.
      const jobs = await fetchFinanceJobs(
        weekStart < todayStr ? weekStart : todayStr,
        weekEnd > todayStr ? weekEnd : todayStr,
      );

      const summarize = (startStr: string, endStr: string) => {
        const start = new Date(startStr + "T00:00:00");
        const end = new Date(endStr + "T23:59:59");

        const paid = paidJobsInPeriod(jobs, start, end) as DashboardJob[];
        const sum = (arr: DashboardJob[]) => arr.reduce((s, j) => s + collectedAmount(j), 0);

        const cash = paid.filter((j) => j.payment_method === "cash");
        const card = paid.filter((j) => j.payment_method === "card");

        // Invoiced but not settled — money still to come in, not money taken.
        const invoice = [...paid, ...(completedJobsInPeriod(jobs, start, end) as DashboardJob[])]
          .filter((j, i, arr) => arr.findIndex((x) => x.id === j.id) === i)
          .filter(
            (j) =>
              j.payment_method === "invoice" &&
              (j.payment_status || "").toLowerCase() !== "paid",
          );

        return {
          cashCount: cash.length,
          cashTotal: sum(cash),
          cardCount: card.length,
          cardTotal: sum(card),
          invoiceCount: invoice.length,
          invoiceTotal: invoice.reduce(
            (s, j) => s + (num(j.balance_due) > 0 ? num(j.balance_due) : num(j.revenue)),
            0,
          ),
        };
      };

      return {
        today: summarize(todayStr, todayStr),
        week: summarize(weekStart, weekEnd),
      };
    },
    enabled: !!user,
  });

  const stats = data?.[period];

  const methods = [
    {
      label: "Cash",
      icon: Banknote,
      count: stats?.cashCount || 0,
      total: stats?.cashTotal || 0,
      color: "text-emerald-600",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Card",
      icon: CreditCard,
      count: stats?.cardCount || 0,
      total: stats?.cardTotal || 0,
      color: "text-blue-600",
      bg: "bg-blue-500/10",
    },
  ];

  const invoiceData = {
    count: stats?.invoiceCount || 0,
    total: stats?.invoiceTotal || 0,
  };

  const grandTotal = (stats?.cashTotal || 0) + (stats?.cardTotal || 0);

  return (
    <Card className="shadow-sm border-border/60">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Banknote className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Payments</h3>
          </div>
          <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
            {(["today", "week"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 text-[11px] font-semibold rounded-md transition-all duration-150 ${
                  period === p
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p === "today" ? "Today" : "This Week"}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {methods.map((m) => (
                <div key={m.label} className={`rounded-xl ${m.bg} p-3.5`}>
                  <div className="flex items-center gap-2 mb-2">
                    <m.icon className={`w-4 h-4 ${m.color}`} />
                    <span className="text-xs font-bold text-foreground">{m.label}</span>
                  </div>
                  <div className="text-xl font-extrabold text-foreground leading-none">
                    €{m.total.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {m.count} job{m.count !== 1 ? "s" : ""}
                  </div>
                </div>
              ))}
            </div>

            {/* Total Taken row */}
            {(stats?.cashCount || 0) + (stats?.cardCount || 0) > 0 && (
              <div className="bg-foreground/[0.04] rounded-xl p-3.5 flex items-center gap-3 mb-3">
                <TrendingUp className="w-5 h-5 text-primary shrink-0" />
                <div className="flex-1">
                  <div className="text-[11px] text-muted-foreground font-medium">Total Taken</div>
                  <div className="text-xl font-extrabold text-foreground leading-none mt-0.5">
                    €{grandTotal.toLocaleString()}
                  </div>
                </div>
              </div>
            )}

            {invoiceData.count > 0 && (
              <button
                onClick={() => navigate("/jobs?payment=invoice")}
                className="w-full bg-warning/8 border border-warning/20 rounded-xl p-3.5 flex items-center gap-3 hover:bg-warning/15 transition-colors text-left"
              >
                <FileText className="w-4 h-4 text-warning shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-foreground">
                    {invoiceData.count} invoice{invoiceData.count !== 1 ? "s" : ""} outstanding
                  </div>
                  <div className="text-[11px] text-muted-foreground/60">
                    €{invoiceData.total.toLocaleString()} to be invoiced
                  </div>
                </div>
                <span className="text-xs font-bold text-primary">View →</span>
              </button>
            )}

            {!stats?.cashCount && !stats?.cardCount && !stats?.invoiceCount && (
              <p className="text-xs text-muted-foreground/60 text-center py-3">No payments recorded</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default PaymentSummaryCard;
