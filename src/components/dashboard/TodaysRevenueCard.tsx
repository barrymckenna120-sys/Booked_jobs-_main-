import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, AlertCircle, Loader2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";

const TodaysRevenueCard = () => {
  const { user } = useAuth();
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const { data, isLoading } = useQuery({
    queryKey: ["todays-revenue", user?.id, todayStr],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("service_calls")
        .select("job_type, revenue, payment_method, status")
        .eq("scheduled_date", todayStr)
        .eq("status", "Completed");

      const jobs = rows || [];

      // Group by job_type
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

      return { byType, grandTotal, unpaid, cardTotal, cashTotal };
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

            {/* Unpaid */}
            {(data?.unpaid || 0) > 0 && (
              <button
                onClick={() => navigate("/jobs?payment=unpaid")}
                className="flex items-center justify-between w-full mb-3 hover:opacity-80 transition-opacity text-left"
              >
                <div className="flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                  <span className="text-xs font-bold text-destructive underline">Unpaid</span>
                </div>
                <span className="text-sm font-bold text-destructive">
                  €{(data?.unpaid || 0).toLocaleString()}
                </span>
              </button>
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
