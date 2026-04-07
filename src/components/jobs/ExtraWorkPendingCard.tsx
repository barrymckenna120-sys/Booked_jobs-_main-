import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Wrench } from "lucide-react";

type LineItem = {
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

type PendingQuote = {
  id: string;
  total_amount: number;
  line_items: LineItem[];
  created_at: string;
};

type OriginalQuote = {
  total_amount: number;
  deposit_amount: number | null;
  deposit: number | null;
};

interface Props {
  jobId: string;
  onQuoteChange: () => void;
}

const ExtraWorkPendingCard = ({ jobId, onQuoteChange }: Props) => {
  const { user } = useAuth();
  const { role } = useUserRole(user);
  const { toast } = useToast();
  const [pendingQuotes, setPendingQuotes] = useState<PendingQuote[]>([]);
  const [originalQuote, setOriginalQuote] = useState<OriginalQuote | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [jobId]);

  const fetchData = async () => {
    setLoading(true);

    // Fetch pending approval quotes with line_items
    const { data: pending } = await supabase
      .from("quotes")
      .select("id, total_amount, line_items, created_at")
      .eq("job_id", jobId)
      .eq("status", "Pending Approval");

    // Filter to only those with non-empty line_items arrays
    const extraWorkQuotes = (pending || []).filter((q: any) => {
      const items = q.line_items;
      return Array.isArray(items) && items.length > 0;
    }) as PendingQuote[];

    setPendingQuotes(extraWorkQuotes);

    // Fetch original approved/accepted/converted quote
    if (extraWorkQuotes.length > 0) {
      const { data: orig } = await supabase
        .from("quotes")
        .select("total_amount, deposit_amount, deposit")
        .eq("job_id", jobId)
        .in("status", ["Accepted", "accepted", "converted", "Paid"])
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      setOriginalQuote(orig as OriginalQuote | null);
    }

    setLoading(false);
  };

  if (loading) return null;
  if (pendingQuotes.length === 0) return null;

  const isOfficeOrAdmin = role === "admin" || role === "office";

  return (
    <>
      {pendingQuotes.map((pq) => {
        const extraSubtotal = pq.total_amount;
        const originalTotal = originalQuote?.total_amount ?? 0;
        const depositPaid = originalQuote?.deposit_amount ?? originalQuote?.deposit ?? 0;
        const newTotal = originalTotal + extraSubtotal;
        const balanceDue = newTotal - depositPaid;
        const items: LineItem[] = Array.isArray(pq.line_items) ? pq.line_items : [];

        return (
          <Card key={pq.id} className="border-l-4 border-amber-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-amber-800">
                <Wrench className="w-4 h-4 text-amber-500" />
                Extra Work — Pending Approval
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Line items table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="py-2 pr-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">Description</th>
                      <th className="py-2 px-2 text-xs font-bold text-muted-foreground uppercase tracking-wider text-center w-16">Qty</th>
                      <th className="py-2 px-2 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right w-24">Unit €</th>
                      <th className="py-2 pl-2 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right w-24">Total €</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((li, idx) => (
                      <tr key={idx} className="border-b border-border/50">
                        <td className="py-2 pr-2 font-medium">{li.description}</td>
                        <td className="py-2 px-2 text-center">{li.quantity}</td>
                        <td className="py-2 px-2 text-right">€{Number(li.unit_price).toFixed(2)}</td>
                        <td className="py-2 pl-2 text-right font-semibold">€{Number(li.line_total).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals summary */}
              <div className="space-y-2 border-t border-border pt-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Extra Work Subtotal</span>
                  <span className="font-bold">€{extraSubtotal.toFixed(2)}</span>
                </div>
                {originalQuote && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Original Quote Total</span>
                    <span className="font-semibold">€{originalTotal.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm border-t border-border pt-2">
                  <span className="font-bold">New Total</span>
                  <span className="text-lg font-extrabold">€{newTotal.toFixed(2)}</span>
                </div>
                {depositPaid > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Deposit Paid</span>
                    <span className="font-semibold text-success">−€{depositPaid.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="font-bold">Balance Due</span>
                  <span className={`text-lg font-extrabold ${balanceDue > 0 ? "text-amber-600" : "text-success"}`}>
                    €{balanceDue.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Approve button — office/admin only */}
              {isOfficeOrAdmin && (
                <Button
                  className="w-full h-12 text-base font-extrabold gap-2"
                  onClick={() => {
                    toast({ title: "Coming soon", description: "Approve & resend invoice will be wired in the next update." });
                  }}
                >
                  ✅ Approve & Resend Invoice
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </>
  );
};

export default ExtraWorkPendingCard;
