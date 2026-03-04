import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Banknote, CreditCard, FileText, Loader2 } from "lucide-react";
import { format, startOfWeek, endOfWeek } from "date-fns";

type Period = "today" | "week";

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
      const [todayRes, weekRes] = await Promise.all([
        supabase
          .from("service_calls")
          .select("payment_method, revenue")
          .eq("scheduled_date", todayStr)
          .eq("status", "Completed")
          .not("payment_method", "is", null),
        supabase
          .from("service_calls")
          .select("payment_method, revenue")
          .gte("scheduled_date", weekStart)
          .lte("scheduled_date", weekEnd)
          .eq("status", "Completed")
          .not("payment_method", "is", null),
      ]);

      const summarize = (rows: any[]) => {
        const cash = rows.filter((r) => r.payment_method === "cash");
        const card = rows.filter((r) => r.payment_method === "card");
        const invoice = rows.filter((r) => r.payment_method === "invoice");
        const sum = (arr: any[]) => arr.reduce((s, r) => s + (r.revenue || 0), 0);
        return {
          cashCount: cash.length,
          cashTotal: sum(cash),
          cardCount: card.length,
          cardTotal: sum(card),
          invoiceCount: invoice.length,
          invoiceTotal: sum(invoice),
        };
      };

      return {
        today: summarize(todayRes.data || []),
        week: summarize(weekRes.data || []),
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
                    {m.count}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    €{m.total.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>

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
