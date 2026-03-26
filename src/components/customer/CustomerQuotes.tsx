import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Loader2 } from "lucide-react";
import { format } from "date-fns";

const STATUS_BADGE: Record<string, string> = {
  Draft: "bg-muted text-muted-foreground",
  draft: "bg-muted text-muted-foreground",
  Sent: "bg-primary/10 text-primary",
  sent: "bg-primary/10 text-primary",
  viewed: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]",
  Viewed: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]",
  Accepted: "bg-[hsl(142,76%,92%)] text-[hsl(142,72%,29%)]",
  accepted: "bg-[hsl(142,76%,92%)] text-[hsl(142,72%,29%)]",
  expired: "bg-destructive/10 text-destructive",
  Rejected: "bg-destructive/10 text-destructive",
  converted: "bg-primary/10 text-primary",
  Paid: "bg-[hsl(160,84%,90%)] text-[hsl(160,84%,18%)]",
};

const CustomerQuotes = ({ customerId }: { customerId: string }) => {
  const navigate = useNavigate();

  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ["customer-quotes", customerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("quotes")
        .select("id, quote_number, created_at, total_amount, status")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!customerId,
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">📋 Quotes</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : quotes.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-center">
            <FileText className="w-8 h-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No quotes yet for this customer.</p>
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-3 py-2 font-semibold text-muted-foreground">Quote #</th>
                  <th className="px-3 py-2 font-semibold text-muted-foreground">Date</th>
                  <th className="px-3 py-2 font-semibold text-muted-foreground text-right">Total</th>
                  <th className="px-3 py-2 font-semibold text-muted-foreground text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q: any) => {
                  const statusLabel = q.status?.charAt(0).toUpperCase() + q.status?.slice(1);
                  return (
                    <tr
                      key={q.id}
                      className="border-b border-border last:border-0 hover:bg-muted/40 cursor-pointer transition-colors"
                      onClick={() => navigate(`/quotes/${q.id}`)}
                    >
                      <td className="px-3 py-2.5 font-bold text-foreground">
                        {q.quote_number || `Q-${q.id.slice(0, 4).toUpperCase()}`}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                        {format(new Date(q.created_at), "dd/MM/yyyy")}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold">
                        €{Number(q.total_amount).toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${STATUS_BADGE[q.status] || STATUS_BADGE.draft}`}>
                          {statusLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CustomerQuotes;
