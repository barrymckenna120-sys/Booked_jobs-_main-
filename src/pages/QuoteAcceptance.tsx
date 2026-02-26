import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

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
};

type PublicQuoteData = {
  quote: QuoteData;
  customer_name: string | null;
  customer_address: string | null;
  business_name: string;
  business_phone: string | null;
  whatsapp_number: string | null;
  logo_url: string | null;
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-[420px] space-y-4">
        {data?.logo_url ? (
          <img src={data.logo_url} alt={businessName} className="mx-auto h-12 object-contain" />
        ) : (
          <p className="text-center text-2xl">🔧</p>
        )}
        <h1 className="text-center font-bold text-lg">{businessName}</h1>

        <Card className="shadow-md">
          <CardContent className="p-6 space-y-4">
            <div>
              <p className="font-bold text-base">Quote for {customerName}</p>
              <p className="text-sm text-muted-foreground">{customerAddress}</p>
            </div>

            <p className="text-sm">{quote.description}</p>

            {(quote.parts_cost || quote.labour_cost || quote.callout_cost) && (
              <div className="border-t border-border pt-3 space-y-1 text-sm">
                {quote.parts_cost ? <div className="flex justify-between"><span className="text-muted-foreground">Parts</span><span>€{Number(quote.parts_cost).toFixed(2)}</span></div> : null}
                {quote.labour_cost ? <div className="flex justify-between"><span className="text-muted-foreground">Labour</span><span>€{Number(quote.labour_cost).toFixed(2)}</span></div> : null}
                {quote.callout_cost ? <div className="flex justify-between"><span className="text-muted-foreground">Call-Out</span><span>€{Number(quote.callout_cost).toFixed(2)}</span></div> : null}
              </div>
            )}

            <div className="border-t border-border pt-3">
              <div className="flex justify-between text-lg font-extrabold">
                <span>TOTAL</span>
                <span>€{Number(quote.total_amount).toFixed(2)}</span>
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              <p>Prepared by {businessName}</p>
              <p>Date: {new Date(quote.created_at).toLocaleDateString("en-IE")}</p>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-2">
          <Button
            className="w-full py-6 text-base font-bold bg-[hsl(142,72%,29%)] hover:bg-[hsl(142,72%,24%)] text-white"
            onClick={handleAccept}
            disabled={actionLoading}
          >
            {actionLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            ✅ Accept Quote
          </Button>
          <Button
            variant="outline"
            className="w-full py-6 text-base"
            onClick={handleDecline}
            disabled={actionLoading}
          >
            ✕ Decline
          </Button>
        </div>
      </div>
    </div>
  );
};

export default QuoteAcceptance;
