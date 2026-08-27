import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, AlertCircle, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { format, startOfWeek, startOfMonth } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { fetchFinanceJobs } from "@/lib/financeJobs";
import {
  paidJobsInPeriod,
  completedJobsInPeriod,
  collectedAmount,
  isRevenueRecognised,
} from "@/lib/financeMetrics";

type PeriodMode = "today" | "week" | "month";

type UnpaidJob = {
  id: string;
  revenue: number | null;
  customer_name: string;
  job_ref: string;
};

const periodOptions: { value: PeriodMode; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
];

function getDateRange(mode: PeriodMode): { start: string; end: string } {
  const now = new Date();
  const end = format(now, "yyyy-MM-dd");
  switch (mode) {
    case "today":
      return { start: end, end };
    case "week": {
      const ws = startOfWeek(now, { weekStartsOn: 1 });
      return { start: format(ws, "yyyy-MM-dd"), end };
    }
    case "month": {
      const ms = startOfMonth(now);
      return { start: format(ms, "yyyy-MM-dd"), end };
    }
  }
}

const periodLabels: Record<PeriodMode, string> = {
  today: "Today's Revenue",
  week: "This Week's Revenue",
  month: "This Month's Revenue",
};

const TodaysRevenueCard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<PeriodMode>("today");
  const [unpaidExpanded, setUnpaidExpanded] = useState(false);

  const { start, end } = getDateRange(period);

  const { data, isLoading } = useQuery({
    queryKey: ["revenue-card", user?.id, start, end],
    queryFn: async () => {
      const jobs = await fetchFinanceJobs(start, end);

      const rangeStart = new Date(start + "T00:00:00");
      const rangeEnd = new Date(end + "T23:59:59");

      // Revenue basis: money actually taken in the period, whatever the job status.
      const paid = paidJobsInPeriod(jobs, rangeStart, rangeEnd);
      // Work delivered but not paid for — chase list.
      const unpaidJobs = completedJobsInPeriod(jobs, rangeStart, rangeEnd).filter(
        (j) => !isRevenueRecognised(j),
      );

      const customerIds = [
        ...new Set([...paid, ...unpaidJobs].map((j) => (j as any).customer_id).filter(Boolean)),
      ] as string[];

      const customerMap: Record<string, string> = {};
      if (customerIds.length > 0) {
        const { data: customers } = await supabase
          .from("customers")
          .select("id, name")
          .in("id", customerIds);
        for (const c of customers || []) {
          customerMap[c.id] = c.name;
        }
      }

      const byType: Record<string, { count: number; total: number }> = {};
      let cardTotal = 0;
      let cashTotal = 0;

      for (const j of paid) {
        const amount = collectedAmount(j);
        const type = j.job_type || "Other";
        if (!byType[type]) byType[type] = { count: 0, total: 0 };
        byType[type].count += 1;
        byType[type].total += amount;

        if (j.payment_method === "card") cardTotal += amount;
        else if (j.payment_method === "cash") cashTotal += amount;
      }

      const grandTotal = paid.reduce((s, j) => s + collectedAmount(j), 0);
      const unpaid = unpaidJobs.reduce((s, j) => s + Number(j.revenue || 0), 0);

      const unpaidList: UnpaidJob[] = unpaidJobs.map((j: any) => ({
        id: j.id,
        revenue: j.revenue,
        customer_name: customerMap[j.customer_id] || "Unknown",
        job_ref: j.job_reference || "KN-" + String(j.id).substring(0, 6).toUpperCase(),
      }));

      return { byType, grandTotal, unpaid, cardTotal, cashTotal, unpaidList };
    },
    enabled: !!user,
  });

  const entries = data ? Object.entries(data.byType).sort((a, b) => b[1].total - a[1].total) : [];

  return (
    <Card className="shadow-sm border-border/60">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">{periodLabels[period]}</h3>
          </div>

          {/* Period toggle */}
          <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
            {periodOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { setPeriod(opt.value); setUnpaidExpanded(false); }}
                className={`px-3 py-1 text-[11px] font-semibold rounded-md transition-all duration-150 ${
                  period === opt.value
                    ? "text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                style={period === opt.value ? { backgroundColor: "#4A86E8" } : undefined}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 && !data?.unpaid ? (
          <p className="text-xs text-muted-foreground/60 text-center py-3">No payments recorded</p>
        ) : (
          <>
            <div className="space-y-2.5 mb-3">
              {entries.map(([type, info]) => (
                <div key={type} className="flex items-center justify-between">
                  <span className="text-sm font-bold text-foreground">
                    {type} ({info.count})
                  </span>
                  <span className="text-base font-extrabold text-foreground">
                    €{info.total.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>

            <Separator className="my-3" />

            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-foreground">Total Collected</span>
              <span className="text-lg font-extrabold" style={{ color: "#4A86E8" }}>
                €{(data?.grandTotal || 0).toLocaleString()}
              </span>
            </div>

            {(data?.unpaidList?.length || 0) > 0 && (
              <div className="mb-3">
                <button
                  onClick={() => setUnpaidExpanded((v) => !v)}
                  className="flex items-center justify-between w-full hover:opacity-80 transition-opacity text-left"
                >
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                    <span className="text-xs font-bold text-destructive">
                      Unpaid ({data?.unpaidList?.length})
                    </span>
                    {unpaidExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5 text-destructive" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-destructive" />
                    )}
                  </div>
                  <span className="text-sm font-bold text-destructive">
                    €{(data?.unpaid || 0).toLocaleString()}
                  </span>
                </button>

                {unpaidExpanded && (
                  <div className="mt-2 space-y-1.5 pl-5">
                    {data?.unpaidList?.map((job) => (
                      <button
                        key={job.id}
                        onClick={() => navigate(`/jobs/${job.id}`)}
                        className="flex items-center justify-between w-full rounded-lg bg-destructive/5 px-3 py-2 hover:bg-destructive/10 transition-colors text-left"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-foreground truncate">
                            {job.customer_name}
                          </div>
                          <div className="text-[11px] text-muted-foreground">{job.job_ref}</div>
                        </div>
                        <span className="text-xs font-bold text-destructive shrink-0 ml-2">
                          €{(job.revenue || 0).toLocaleString()}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {((data?.cardTotal || 0) > 0 || (data?.cashTotal || 0) > 0) && (
              <div className="flex gap-2 mt-1">
                {(data?.cardTotal || 0) > 0 && (
                  <div className="flex items-center gap-1.5 bg-blue-500/10 text-blue-600 rounded-full px-3 py-1.5 text-xs font-bold">
                    💳 Card — €{(data?.cardTotal || 0).toLocaleString()}
                  </div>
                )}
                {(data?.cashTotal || 0) > 0 && (
                  <div className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-600 rounded-full px-3 py-1.5 text-xs font-bold">
                    💵 Cash — €{(data?.cashTotal || 0).toLocaleString()}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default TodaysRevenueCard;
