import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { CreditCard, TrendingUp, ChevronRight, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";

const RevenueSnapshot = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");
  const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const monthStart = format(startOfMonth(now), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(now), "yyyy-MM-dd");

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-revenue-snapshot", user?.id, todayStr],
    queryFn: async () => {
      const [todayRes, weekRes, monthRes, unpaidRes] = await Promise.all([
        supabase.from("service_calls").select("revenue").eq("scheduled_date", todayStr).eq("status", "Completed"),
        supabase.from("service_calls").select("revenue").gte("scheduled_date", weekStart).lte("scheduled_date", weekEnd).eq("status", "Completed"),
        supabase.from("service_calls").select("revenue").gte("scheduled_date", monthStart).lte("scheduled_date", monthEnd).eq("status", "Completed"),
        supabase.from("service_calls").select("revenue").eq("deposit_paid", false).not("status", "eq", "Cancelled"),
      ]);

      const sum = (rows: any[]) => rows.reduce((s, r) => s + (r.revenue || 0), 0);

      return {
        today: sum(todayRes.data || []),
        week: sum(weekRes.data || []),
        month: sum(monthRes.data || []),
        unpaid: sum(unpaidRes.data || []),
        unpaidCount: (unpaidRes.data || []).length,
      };
    },
    enabled: !!user,
  });

  const stats = [
    { label: "Today", value: data?.today || 0, accent: false },
    { label: "This Week", value: data?.week || 0, accent: false },
    { label: "This Month", value: data?.month || 0, accent: true },
  ];

  return (
    <Card className="shadow-sm border-border/60">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Revenue</h3>
          </div>
          <button
            onClick={() => navigate("/finance")}
            className="text-xs font-bold text-primary flex items-center gap-0.5 hover:underline"
          >
            Finance <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4 mb-5">
              {stats.map((s) => (
                <div key={s.label} className="text-center">
                  <div className={`text-xl font-extrabold leading-none ${s.accent ? "text-primary" : "text-foreground"}`}>
                    €{s.value.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-muted-foreground/60 font-semibold mt-1.5">{s.label}</div>
                </div>
              ))}
            </div>

            {(data?.unpaidCount || 0) > 0 && (
              <div className="bg-warning/8 border border-warning/20 rounded-xl p-3.5 flex items-center gap-3">
                <TrendingUp className="w-4 h-4 text-warning shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-foreground">
                    €{(data?.unpaid || 0).toLocaleString()} outstanding
                  </div>
                  <div className="text-[11px] text-muted-foreground/60">{data?.unpaidCount} unpaid job{data?.unpaidCount !== 1 ? "s" : ""}</div>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default RevenueSnapshot;