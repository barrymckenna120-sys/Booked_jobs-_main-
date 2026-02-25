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

type CustomerData = {
  name: string;
  address: string;
};

const QuoteAcceptance = () => {
  const { quoteId } = useParams<{ quoteId: string }>();
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [responded, setResponded] = useState<"accepted" | "declined" | null>(null);
  const [settings, setSettings] = useState<{ whatsapp_number?: string } | null>(null);

  useEffect(() => {
    if (quoteId) fetchQuote();
  }, [quoteId]);

  const fetchQuote = async () => {
    const { data: quoteData, error } = await supabase
      .from("quotes")
      .select("*")
      .eq("id", quoteId)
      .maybeSingle();

    if (error || !quoteData) {
      setLoading(false);
      return;
    }

    setQuote(quoteData as QuoteData);

    // Fetch customer name
    const { data: custData } = await supabase
      .from("customers")
      .select("name, address")
      .eq("id", quoteData.customer_id)
      .maybeSingle();
    if (custData) setCustomer(custData as CustomerData);

    // Fetch settings for phone number
    const { data: settingsData } = await supabase
      .from("settings")
      .select("whatsapp_number")
      .limit(1)
      .maybeSingle();
    if (settingsData) setSettings(settingsData);

    setLoading(false);
  };

  const handleAccept = async () => {
    if (!quote) return;
    setActionLoading(true);
    await supabase.from("quotes").update({ status: "Accepted", accepted_at: new Date().toISOString() } as any).eq("id", quote.id);
    await supabase.from("service_calls").update({ status: "Awaiting Deposit" } as any).eq("id", quote.job_id);
    setQuote({ ...quote, status: "Accepted" });
    setResponded("accepted");
    setActionLoading(false);
  };

  const handleDecline = async () => {
    if (!quote) return;
    setActionLoading(true);
    await supabase.from("quotes").update({ status: "Rejected" } as any).eq("id", quote.id);
    setQuote({ ...quote, status: "Rejected" });
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

  // Already responded states
  if (quote.status === "Paid") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-[420px] shadow-md">
          <CardContent className="p-8 text-center space-y-3">
            <p className="text-4xl">✅</p>
            <p className="text-lg font-bold">Quote Paid — Thank You!</p>
            <p className="text-sm text-muted-foreground">Karl's Gas 🔥</p>
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
            <p className="text-sm text-muted-foreground">Thank you{customer ? `, ${customer.name}` : ""}. We'll be in touch to confirm your appointment.</p>
            {quote.payment_link && (
              <Button className="w-full mt-4" asChild>
                <a href={quote.payment_link} target="_blank" rel="noopener noreferrer">
                  💳 Pay {quote.deposit_amount ? `Deposit — €${quote.deposit_amount}` : "Now"}
                </a>
              </Button>
            )}
            <p className="text-sm text-muted-foreground pt-2">Karl's Gas 🔥</p>
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
            {settings?.whatsapp_number && (
              <p className="text-sm text-muted-foreground">If you'd like to discuss the quote, call us on {settings.whatsapp_number}.</p>
            )}
            <p className="text-sm text-muted-foreground pt-2">Karl's Gas 🔥</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Active quote — show details + accept/decline
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-[420px] space-y-4">
        <p className="text-center text-2xl">🔥</p>
        <h1 className="text-center font-bold text-lg">Karl's Gas</h1>

        <Card className="shadow-md">
          <CardContent className="p-6 space-y-4">
            <div>
              <p className="font-bold text-base">Quote for {customer?.name || "Customer"}</p>
              <p className="text-sm text-muted-foreground">{customer?.address || ""}</p>
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
              <p>Prepared by Karl's Gas</p>
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
