import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, AlertCircle, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";

type UnpaidJob = {
  id: string;
  revenue: number | null;
  customer_name: string;
  job_ref: string;
};

const TodaysRevenueCard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const [unpaidExpanded, setUnpaidExpanded] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["todays-revenue", user?.id, todayStr],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("service_calls")
        .select("id, job_type, revenue, payment_method, status, customer_id")
        .eq("scheduled_date", todayStr)
        .eq("status", "Completed");

      const jobs = rows || [];

      // Collect unpaid customer IDs
      const unpaidJobs = jobs.filter((j) => !j.payment_method);
      const customerIds = [...new Set(jobs.map((j) => j.customer_id))];

      let customerMap: Record<string, string> = {};
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
      let unpaid = 0;
      let cardTotal = 0;
      let cashTotal = 0;

      for (const j of jobs) {
        const type = j.job_type || "Other";
        if (!byType[type]) byType[type] = { count: 0, total: 0 };
        byType[type].count += 1;
        byType[type].total += j.revenue || 0;

        if (!j.payment_method) {
          unpaid += j.revenue || 0;
        } else if (j.payment_method === "card") {
          cardTotal += j.revenue || 0;
        } else if (j.payment_method === "cash") {
          cashTotal += j.revenue || 0;
        }
      }

      const grandTotal = Object.values(byType).reduce((s, v) => s + v.total, 0);

      const unpaidList: UnpaidJob[] = unpaidJobs.map((j) => ({
        id: j.id,
        revenue: j.revenue,
        customer_name: customerMap[j.customer_id] || "Unknown",
        job_ref: "BJ-" + j.id.substring(0, 6).toUpperCase(),
      }));

      return { byType, grandTotal, unpaid, cardTotal, cashTotal, unpaidList };
    },
    enabled: !!user,
  });

  const entries = data ? Object.entries(data.byType).sort((a, b) => b[1].total - a[1].total) : [];

  return (
    <Card className="shadow-sm border-border/60">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Today's Revenue</h3>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 && !data?.unpaid ? (
          <p className="text-xs text-muted-foreground/60 text-center py-3">No completed jobs today</p>
        ) : (
          <>
            {/* Breakdown by job type */}
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

            {/* Total */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-foreground">Total</span>
              <span className="text-lg font-extrabold" style={{ color: "#4A86E8" }}>
                €{(data?.grandTotal || 0).toLocaleString()}
              </span>
            </div>

            {/* Unpaid - expandable */}
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

            {/* Net Total */}
            {(data?.unpaid || 0) > 0 && (
              <div className="flex items-center justify-between mb-3">
                <span className="text-base font-extrabold text-foreground">Net Total</span>
                <span className="text-xl font-extrabold" style={{ color: "#4A86E8" }}>
                  €{((data?.grandTotal || 0) - (data?.unpaid || 0)).toLocaleString()}
                </span>
              </div>
            )}

            {/* Card / Cash pills */}
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
