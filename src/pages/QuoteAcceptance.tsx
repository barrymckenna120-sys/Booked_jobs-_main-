import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Clock, CheckCircle2, Shield, Star, Wrench } from "lucide-react";

type LineItem = {
  description: string;
  qty: number;
  unit_price: number;
  line_total: number;
};

type QuoteData = {
  id: string;
  description: string;
  parts_cost: number | null;
  labour_cost: number | null;
  callout_cost: number | null;
  total_amount: number;
  status: string;
  payment_link: string | null;
  deposit_amount: number | null;
  created_at: string;
  customer_id: string;
  job_id: string;
  expiry_date: string | null;
  discount: number | null;
  vat_enabled: boolean | null;
  balance_due: number | null;
  quote_number: string | null;
  notes: string | null;
  job_type: string | null;
};

type PublicQuoteData = {
  quote: QuoteData;
  customer_name: string | null;
  customer_address: string | null;
  business_name: string;
  business_phone: string | null;
  whatsapp_number: string | null;
  logo_url: string | null;
  line_items: LineItem[];
};

const QuoteAcceptance = () => {
  const { quoteId } = useParams<{ quoteId: string }>();
  const [data, setData] = useState<PublicQuoteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [responded, setResponded] = useState<"accepted" | "declined" | null>(null);

  useEffect(() => {
    if (quoteId) fetchQuote();
  }, [quoteId]);

  const fetchQuote = async () => {
    const { data: result, error } = await supabase.rpc("get_quote_public", {
      p_quote_id: quoteId,
    });
    if (error || !result || !(result as any).quote) {
      setLoading(false);
      return;
    }
    setData(result as unknown as PublicQuoteData);
    setLoading(false);
  };

  const quote = data?.quote ?? null;
  const businessName = data?.business_name ?? "BookedJobs";
  const customerName = data?.customer_name ?? "Customer";
  const customerAddress = data?.customer_address ?? "";
  const contactNumber = data?.whatsapp_number ?? data?.business_phone ?? null;
  const lineItems = data?.line_items ?? [];

  const handleAccept = async () => {
    if (!quote) return;
    setActionLoading(true);
    await supabase.rpc("respond_to_quote", { p_quote_id: quote.id, p_accepted: true });
    setData(prev => prev ? { ...prev, quote: { ...prev.quote, status: "Accepted" } } : prev);
    setResponded("accepted");
    setActionLoading(false);
  };

  const handleDecline = async () => {
    if (!quote) return;
    setActionLoading(true);
    await supabase.rpc("respond_to_quote", { p_quote_id: quote.id, p_accepted: false });
    setData(prev => prev ? { ...prev, quote: { ...prev.quote, status: "Rejected" } } : prev);
    setResponded("declined");
    setActionLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-[420px] shadow-md">
          <CardContent className="p-8 text-center">
            <p className="text-lg font-bold">Quote Not Found</p>
            <p className="text-sm text-muted-foreground mt-2">This quote link is no longer valid.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (quote.status === "Paid") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-[420px] shadow-md">
          <CardContent className="p-8 text-center space-y-3">
            <p className="text-4xl">✅</p>
            <p className="text-lg font-bold">Quote Paid — Thank You!</p>
            <p className="text-sm text-muted-foreground">{businessName}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (responded === "accepted" || quote.status === "Accepted") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-[420px] shadow-md">
          <CardContent className="p-8 text-center space-y-3">
            <p className="text-4xl">✅</p>
            <p className="text-lg font-bold">Quote Accepted!</p>
            <p className="text-sm text-muted-foreground">Thank you{customerName !== "Customer" ? `, ${customerName}` : ""}. We'll be in touch to confirm your appointment.</p>
            {quote.payment_link && (
              <Button className="w-full mt-4" asChild>
                <a href={quote.payment_link} target="_blank" rel="noopener noreferrer">
                  💳 Pay {quote.deposit_amount ? `Deposit — €${quote.deposit_amount}` : "Now"}
                </a>
              </Button>
            )}
            <p className="text-sm text-muted-foreground pt-2">{businessName}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (responded === "declined" || quote.status === "Rejected") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-[420px] shadow-md">
          <CardContent className="p-8 text-center space-y-3">
            <p className="text-sm text-muted-foreground">We've noted your response.</p>
            {contactNumber && (
              <p className="text-sm text-muted-foreground">If you'd like to discuss the quote, call us on {contactNumber}.</p>
            )}
            <p className="text-sm text-muted-foreground pt-2">{businessName}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Calculate pricing
  const subtotal = lineItems.length > 0
    ? lineItems.reduce((sum, li) => sum + Number(li.line_total || 0), 0)
    : Number(quote.total_amount);
  const discountNum = Number(quote.discount || 0);
  const afterDiscount = Math.max(subtotal - discountNum, 0);
  const vatEnabled = quote.vat_enabled === true;
  const vatAmount = vatEnabled ? afterDiscount * 0.23 : 0;
  const total = Math.max(afterDiscount + vatAmount, 0);
  const depositNum = Number(quote.deposit_amount || 0);
  const balanceDue = Math.max(total - depositNum, 0);

  const expiryDate = quote.expiry_date
    ? new Date(quote.expiry_date).toLocaleDateString("en-IE", { day: "numeric", month: "long" })
    : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-[420px] space-y-5">
        {/* Header / Logo */}
        {data?.logo_url ? (
          <img src={data.logo_url} alt={businessName} className="mx-auto h-12 object-contain" />
        ) : (
          <p className="text-center text-2xl">🔧</p>
        )}
        <h1 className="text-center font-bold text-lg">{businessName}</h1>

        {/* 1. Customer Personalisation */}
        <div className="text-center space-y-0.5">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Quote for</p>
          <p className="text-base font-bold text-foreground">{customerName}</p>
          {customerAddress && (
            <p className="text-sm text-muted-foreground">{customerAddress}</p>
          )}
        </div>

        {/* 2. Urgency — Valid Until */}
        {expiryDate && (
          <div className="flex items-center justify-center gap-2 bg-muted/50 rounded-lg px-4 py-2.5">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Price guaranteed until <span className="font-semibold text-foreground">{expiryDate}</span>
            </p>
          </div>
        )}

        {/* Quote Details Card */}
        <Card className="shadow-md">
          <CardContent className="p-6 space-y-5">
            {/* Quote ref + description */}
            <div>
              {quote.quote_number && (
                <p className="text-xs text-muted-foreground mb-1">{quote.quote_number}</p>
              )}
              <p className="text-sm">{quote.description}</p>
            </div>

            {/* Line Items Table */}
            {lineItems.length > 0 && (
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground text-xs">Item</th>
                      <th className="text-center px-2 py-2 font-semibold text-muted-foreground text-xs">Qty</th>
                      <th className="text-right px-3 py-2 font-semibold text-muted-foreground text-xs">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((li, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="px-3 py-2.5 text-foreground">{li.description}</td>
                        <td className="px-2 py-2.5 text-center text-muted-foreground">{Number(li.qty)}</td>
                        <td className="px-3 py-2.5 text-right font-medium text-foreground">€{Number(li.line_total).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Legacy cost breakdown (if no line items) */}
            {lineItems.length === 0 && (quote.parts_cost || quote.labour_cost || quote.callout_cost) && (
              <div className="border-t border-border pt-3 space-y-1 text-sm">
                {quote.parts_cost ? <div className="flex justify-between"><span className="text-muted-foreground">Parts</span><span>€{Number(quote.parts_cost).toFixed(2)}</span></div> : null}
                {quote.labour_cost ? <div className="flex justify-between"><span className="text-muted-foreground">Labour</span><span>€{Number(quote.labour_cost).toFixed(2)}</span></div> : null}
                {quote.callout_cost ? <div className="flex justify-between"><span className="text-muted-foreground">Call-Out</span><span>€{Number(quote.callout_cost).toFixed(2)}</span></div> : null}
              </div>
            )}

            {/* Pricing Summary */}
            <div className="border-t border-border pt-4 space-y-1.5 text-sm">
              {(discountNum > 0 || vatEnabled) && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>€{subtotal.toFixed(2)}</span>
                </div>
              )}
              {discountNum > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Special Offer Applied</span>
                  <span>-€{discountNum.toFixed(2)}</span>
                </div>
              )}
              {vatEnabled && (
                <div className="flex justify-between text-muted-foreground">
                  <span>VAT (23%)</span>
                  <span>€{vatAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-extrabold pt-1">
                <span>TOTAL</span>
                <span>€{total.toFixed(2)}</span>
              </div>
              {/* 4. Pricing Confidence */}
              <p className="text-xs text-muted-foreground pt-0.5">No hidden costs. Fixed price.</p>
            </div>

            {/* Meta info */}
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>Prepared by {businessName}</p>
              <p>Date: {new Date(quote.created_at).toLocaleDateString("en-IE")}</p>
            </div>
          </CardContent>
        </Card>

        {/* 3. What's Included */}
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <p className="font-semibold text-sm mb-3 text-foreground">What's Included</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {["Full installation", "System testing & commissioning", "Old unit removal", "Clean-up included"].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* 5. CTA Section */}
        <div className="text-center space-y-1 pt-2">
          <p className="font-bold text-base text-foreground">Secure your installation date today</p>
          <p className="text-xs text-muted-foreground">No hidden costs. Fixed price.</p>
        </div>

        {/* 9. Buttons */}
        <div className="space-y-3">
          <Button
            className="w-full py-6 text-base font-bold bg-[hsl(142,72%,29%)] hover:bg-[hsl(142,72%,24%)] text-white rounded-xl"
            onClick={handleAccept}
            disabled={actionLoading}
          >
            {actionLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            ✅ Approve Quote
          </Button>

          {/* 6. Deposit Clarity */}
          {depositNum > 0 && (
            <p className="text-xs text-muted-foreground text-center">
              Deposit required to confirm your booking
            </p>
          )}

          {quote.payment_link && depositNum > 0 && (
            <Button
              variant="outline"
              className="w-full py-6 text-base rounded-xl border-2"
              asChild
            >
              <a href={quote.payment_link} target="_blank" rel="noopener noreferrer">
                💳 Pay Deposit — €{depositNum.toFixed(2)}
              </a>
            </Button>
          )}

          <Button
            variant="outline"
            className="w-full py-5 text-sm text-muted-foreground rounded-xl"
            onClick={handleDecline}
            disabled={actionLoading}
          >
            ✕ Decline
          </Button>
        </div>

        {/* 7. Next Step Reassurance */}
        <p className="text-xs text-muted-foreground text-center">
          We'll contact you shortly to confirm your appointment.
        </p>

        {/* 8. Trust Section */}
        <div className="pt-2 pb-4">
          <div className="flex items-center justify-center gap-6">
            <div className="flex flex-col items-center gap-1.5">
              <Star className="w-6 h-6 text-yellow-500" />
              <span className="text-[11px] text-muted-foreground text-center leading-tight">Google<br />Rated</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <Shield className="w-6 h-6 text-primary" />
              <span className="text-[11px] text-muted-foreground text-center leading-tight">RGI<br />Registered</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <Wrench className="w-6 h-6 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground text-center leading-tight">Fully<br />Insured</span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground text-center mt-3">
            Trusted by homeowners across Dublin
          </p>
        </div>
      </div>
    </div>
  );
};

export default QuoteAcceptance;
