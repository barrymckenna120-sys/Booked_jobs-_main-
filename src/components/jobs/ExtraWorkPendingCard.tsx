import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Wrench, Banknote, CreditCard, FileText, CheckCircle2 } from "lucide-react";

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
  customer_id: string;
  user_id: string;
  quote_number: string | null;
  description: string;
  deposit_amount: number | null;
  deposit: number | null;
  pdf_url: string | null;
  access_token: string;
};

type OriginalQuote = {
  total_amount: number;
  deposit_amount: number | null;
  deposit: number | null;
};

const METHODS = [
  { key: "cash", label: "Cash", icon: Banknote, emoji: "💵" },
  { key: "card", label: "Card", icon: CreditCard, emoji: "💳" },
  { key: "invoice", label: "Send Payment Link", icon: FileText, emoji: "📄" },
];

interface Props {
  jobId: string;
  onQuoteChange: () => void;
}

const ExtraWorkPendingCard = ({ jobId, onQuoteChange }: Props) => {
  const { user } = useAuth();
  const { role } = useUserRole(user);
  const [pendingQuotes, setPendingQuotes] = useState<PendingQuote[]>([]);
  const [originalQuote, setOriginalQuote] = useState<OriginalQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [selectingMethodForId, setSelectingMethodForId] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [jobId]);

  const fetchData = async () => {
    setLoading(true);

    const { data: pending } = await supabase
      .from("quotes")
      .select("id, total_amount, line_items, created_at, customer_id, user_id, quote_number, description, deposit_amount, deposit, pdf_url, access_token")
      .eq("job_id", jobId)
      .eq("status", "Pending Approval");

    const extraWorkQuotes = (pending || []).filter((q: any) => {
      const items = q.line_items;
      return Array.isArray(items) && items.length > 0;
    }) as PendingQuote[];

    setPendingQuotes(extraWorkQuotes);

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

  const handleApprove = async (pq: PendingQuote, newTotal: number, method: string) => {
    setApprovingId(pq.id);
    try {
      // Step 1: Update quote status to Accepted with full combined total
      const { error: updateError } = await supabase
        .from("quotes")
        .update({
          status: "Accepted",
          accepted_at: new Date().toISOString(),
          total_amount: newTotal,
          balance_due: newTotal,
        })
        .eq("id", pq.id);

      if (updateError) throw new Error(`Failed to update quote: ${updateError.message}`);

      // Step 2: If Send Payment Link, call accept-quote for Stripe link first
      if (method === "invoice") {
        const { data: acceptData, error: acceptError } = await supabase.functions.invoke("accept-quote", {
          body: { quote_id: pq.id, access_token: pq.access_token },
        });
        if (acceptError) throw new Error(`Accept quote failed: ${acceptError.message}`);
        if (acceptData && !acceptData.success) throw new Error(acceptData.error || "Accept quote returned an error");
      }

      // Step 3: Get customer info for WhatsApp send
      const { data: customer } = await supabase
        .from("customers")
        .select("name, phone")
        .eq("id", pq.customer_id)
        .maybeSingle();

      const { data: settings } = await supabase
        .from("settings" as any)
        .select("business_phone, business_name")
        .eq("user_id", pq.user_id)
        .maybeSingle() as any;

      if (customer?.phone) {
        await supabase.functions.invoke("send-quote-whatsapp", {
          body: {
            quote_id: pq.id,
            customer_name: customer.name,
            mobile_number: customer.phone,
            job_description: pq.description || "Extra Work",
            quote_amount: newTotal,
            deposit_amount: 0,
            business_phone: settings?.business_phone || "",
            business_name: settings?.business_name || "",
            pdf_url: pq.pdf_url || "",
            quote_number: pq.quote_number || "",
            customer_id: pq.customer_id,
            sent_by_user_id: user?.id || pq.user_id,
          },
        });
      }

      toast.success("Invoice resent successfully");
      setSelectingMethodForId(null);
      setSelectedMethod(null);
      onQuoteChange();
      await fetchData();
    } catch (err: any) {
      console.error("Approve error:", err);
      toast.error("Approval failed", { description: err.message || "Something went wrong" });
    } finally {
      setApprovingId(null);
    }
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
        const isApproving = approvingId === pq.id;
        const isSelectingMethod = selectingMethodForId === pq.id;

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

              {/* Approve button or payment method selector — office/admin only */}
              {isOfficeOrAdmin && (
                <>
                  {!isSelectingMethod ? (
                    <Button
                      className="w-full h-12 text-base font-extrabold gap-2"
                      disabled={isApproving}
                      onClick={() => {
                        setSelectingMethodForId(pq.id);
                        setSelectedMethod(null);
                      }}
                    >
                      ✅ Approve & Resend Invoice
                    </Button>
                  ) : (
                    <div className="space-y-3 border-t border-border pt-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Payment Method</p>
                      <div className="grid grid-cols-3 gap-2">
                        {METHODS.map((m) => {
                          const isSelected = selectedMethod === m.key;
                          return (
                            <button
                              key={m.key}
                              type="button"
                              onClick={() => setSelectedMethod(m.key)}
                              className={`min-h-[56px] rounded-xl border-2 flex flex-col items-center justify-center gap-1 text-sm font-bold transition-all ${
                                isSelected
                                  ? "border-primary bg-primary/10 text-primary shadow-sm"
                                  : "border-border bg-secondary text-muted-foreground hover:border-primary/40"
                              }`}
                            >
                              <span className="text-lg">{m.emoji}</span>
                              {m.label}
                            </button>
                          );
                        })}
                      </div>

                      <Button
                        className="w-full h-12 text-base font-extrabold gap-2"
                        disabled={!selectedMethod || isApproving}
                        onClick={() => selectedMethod && handleApprove(pq, newTotal, selectedMethod)}
                      >
                        {isApproving ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Processing…
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-5 h-5" />
                            Confirm & Send
                          </>
                        )}
                      </Button>
                      <button
                        onClick={() => {
                          setSelectingMethodForId(null);
                          setSelectedMethod(null);
                        }}
                        className="w-full text-center text-muted-foreground text-sm font-semibold py-1"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        );
      })}
    </>
  );
};

export default ExtraWorkPendingCard;
