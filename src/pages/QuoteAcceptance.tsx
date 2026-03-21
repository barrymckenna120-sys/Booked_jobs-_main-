import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Clock, CheckCircle2, Shield, Star, Wrench, Download } from "lucide-react";

type LineItem = { description: string; qty: number; unit_price: number; line_total: number };

type QuoteData = {
  id: string; description: string; parts_cost: number | null; labour_cost: number | null;
  callout_cost: number | null; total_amount: number; status: string; payment_link: string | null;
  deposit_amount: number | null; created_at: string; customer_id: string; job_id: string;
  expiry_date: string | null; discount: number | null; vat_enabled: boolean | null;
  balance_due: number | null; quote_number: string | null; notes: string | null; job_type: string | null;
  pdf_url: string | null;
};

type PublicQuoteData = {
  quote: QuoteData; customer_name: string | null; customer_address: string | null;
  business_name: string; business_phone: string | null; whatsapp_number: string | null;
  logo_url: string | null; line_items: LineItem[];
};

/* ── Helpers ─────────────────────────────────────────── */
const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-IE", { day: "numeric", month: "long", year: "numeric" });
const fmtShortDate = (d: string) => new Date(d).toLocaleDateString("en-IE", { day: "numeric", month: "long" });
const eur = (n: number) => `€${n.toFixed(2)}`;

const QuoteAcceptance = () => {
  const { quoteId } = useParams<{ quoteId: string }>();
  const [data, setData] = useState<PublicQuoteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [depositTapped, setDepositTapped] = useState(false);

  useEffect(() => { if (quoteId) fetchQuote(); }, [quoteId]);

  const fetchQuote = async () => {
    const { data: result, error } = await supabase.rpc("get_quote_public", { p_quote_id: quoteId });
    if (error || !result || !(result as any).quote) { setLoading(false); return; }
    setData(result as unknown as PublicQuoteData);
    setLoading(false);
  };

  /* ── Derived ────────────────────────────────────────── */
  const quote = data?.quote ?? null;
  const biz = data?.business_name ?? "BookedJobs";
  const custName = data?.customer_name ?? "Customer";
  const custAddr = data?.customer_address ?? "";
  const contactNum = data?.whatsapp_number ?? data?.business_phone ?? null;
  const lineItems = data?.line_items ?? [];

  /* ── Loading ────────────────────────────────────────── */
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  /* ── Not found ──────────────────────────────────────── */
  if (!quote) return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-[440px] shadow-md"><CardContent className="p-8 text-center">
        <p className="text-lg font-bold">Quote Not Found</p>
        <p className="text-sm text-muted-foreground mt-2">This quote link is no longer valid.</p>
      </CardContent></Card>
    </div>
  );

  /* ── Expired ────────────────────────────────────────── */
  const isExpired = quote.expiry_date && new Date(quote.expiry_date) < new Date() && !["Accepted", "Paid", "converted"].includes(quote.status);
  if (isExpired) return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-[440px] shadow-md"><CardContent className="p-8 text-center space-y-3">
        <p className="text-4xl">⏰</p>
        <p className="text-lg font-bold">This quote has expired</p>
        <p className="text-sm text-muted-foreground">Please contact us for an updated quote.</p>
        {contactNum && <p className="text-sm text-muted-foreground">Call us on {contactNum}</p>}
        <p className="text-xs text-muted-foreground pt-2">{biz}</p>
      </CardContent></Card>
    </div>
  );

  /* ── Already accepted ───────────────────────────────── */
  if (quote.status === "Accepted" || quote.status === "Paid" || accepted) return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-[440px] shadow-md"><CardContent className="p-8 text-center space-y-3">
        <p className="text-4xl">✅</p>
        <p className="text-lg font-bold">{quote.status === "Paid" ? "Quote Paid — Thank You!" : "This quote has already been accepted."}</p>
        <p className="text-sm text-muted-foreground">We'll be in touch shortly.</p>
        <p className="text-xs text-muted-foreground pt-2">{biz}</p>
      </CardContent></Card>
    </div>
  );

  /* ── Declined ───────────────────────────────────────── */
  if (quote.status === "Rejected") return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-[440px] shadow-md"><CardContent className="p-8 text-center space-y-3">
        <p className="text-sm text-muted-foreground">This quote has been declined.</p>
        {contactNum && <p className="text-sm text-muted-foreground">If you'd like to discuss, call us on {contactNum}.</p>}
        <p className="text-xs text-muted-foreground pt-2">{biz}</p>
      </CardContent></Card>
    </div>
  );

  /* ── Pricing calc ───────────────────────────────────── */
  const subtotal = lineItems.length > 0
    ? lineItems.reduce((s, li) => s + Number(li.line_total || 0), 0)
    : Number(quote.total_amount);
  const disc = Number(quote.discount || 0);
  const afterDisc = Math.max(subtotal - disc, 0);
  const vatOn = quote.vat_enabled === true;
  const vatAmt = vatOn ? afterDisc * 0.23 : 0;
  const total = Math.max(afterDisc + vatAmt, 0);
  const deposit = Number(quote.deposit_amount || 0);
  const balance = Math.max(total - deposit, 0);

  /* ── Actions ────────────────────────────────────────── */
  const handleApprove = async () => {
    setActionLoading(true);
    await supabase.rpc("respond_to_quote", { p_quote_id: quote.id, p_accepted: true });
    setAccepted(true);
    setActionLoading(false);
  };

  const handleDeposit = () => setDepositTapped(true);

  /* ── MAIN RENDER ────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-background">
      {/* ─── 1. HEADER ─────────────────────────────────── */}
      <div className="bg-card border-b border-border">
        <div className="max-w-[440px] mx-auto px-5 py-6 space-y-3">
          <div className="flex items-center justify-between">
            {data?.logo_url
              ? <img src={data.logo_url} alt={biz} className="h-10 object-contain" />
              : <span className="text-2xl">🔧</span>}
            <div className="text-right">
              {quote.quote_number && <p className="text-sm font-bold text-foreground">{quote.quote_number}</p>}
              <p className="text-xs text-muted-foreground">Issued {fmtDate(quote.created_at)}</p>
            </div>
          </div>
          <p className="text-lg font-bold text-foreground">{biz}</p>

          {/* Valid Until pill */}
          {quote.expiry_date && (
            <div className="inline-flex items-center gap-1.5 bg-muted/60 rounded-full px-3 py-1.5">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                Valid until <span className="font-semibold text-foreground">{fmtShortDate(quote.expiry_date)}</span>
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-[440px] mx-auto px-5 py-6 space-y-5">

        {/* ─── 2. QUOTE FOR ──────────────────────────────── */}
        <div className="space-y-0.5">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Quote for</p>
          <p className="text-base font-bold text-foreground">{custName}</p>
          {custAddr && <p className="text-sm text-muted-foreground">{custAddr}</p>}
          {contactNum && <p className="text-sm text-muted-foreground">{contactNum}</p>}
        </div>

        {/* ─── 3. JOB SUMMARY ────────────────────────────── */}
        <Card className="shadow-sm">
          <CardContent className="p-5 space-y-2">
            {quote.job_type && (
              <span className="inline-block text-xs font-semibold bg-primary/10 text-primary rounded px-2 py-0.5 capitalize">
                {quote.job_type.replace(/_/g, " ")}
              </span>
            )}
            <p className="text-sm text-foreground leading-relaxed">{quote.description}</p>
          </CardContent>
        </Card>

        {/* ─── 4. PRICING BREAKDOWN ──────────────────────── */}
        <Card className="shadow-md">
          <CardContent className="p-5 space-y-4">
            {/* Line items */}
            {lineItems.length > 0 && (
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Description</th>
                      <th className="text-center px-2 py-2 text-xs font-semibold text-muted-foreground">Qty</th>
                      <th className="text-right px-2 py-2 text-xs font-semibold text-muted-foreground">Price</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((li, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="px-3 py-2.5 text-foreground">{li.description}</td>
                        <td className="px-2 py-2.5 text-center text-muted-foreground">{Number(li.qty)}</td>
                        <td className="px-2 py-2.5 text-right text-muted-foreground">{eur(Number(li.unit_price))}</td>
                        <td className="px-3 py-2.5 text-right font-medium text-foreground">{eur(Number(li.line_total))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Legacy fallback */}
            {lineItems.length === 0 && (quote.parts_cost || quote.labour_cost || quote.callout_cost) && (
              <div className="space-y-1 text-sm">
                {quote.parts_cost ? <div className="flex justify-between"><span className="text-muted-foreground">Parts</span><span>{eur(Number(quote.parts_cost))}</span></div> : null}
                {quote.labour_cost ? <div className="flex justify-between"><span className="text-muted-foreground">Labour</span><span>{eur(Number(quote.labour_cost))}</span></div> : null}
                {quote.callout_cost ? <div className="flex justify-between"><span className="text-muted-foreground">Call-Out</span><span>{eur(Number(quote.callout_cost))}</span></div> : null}
              </div>
            )}

            {/* Summary rows */}
            <div className="border-t border-border pt-3 space-y-1.5 text-sm">
              {(disc > 0 || vatOn) && (
                <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{eur(subtotal)}</span></div>
              )}
              {disc > 0 && (
                <div className="flex justify-between text-green-600 dark:text-green-400"><span>Special Offer Applied</span><span>-{eur(disc)}</span></div>
              )}
              {vatOn && (
                <div className="flex justify-between text-muted-foreground"><span>VAT (23%)</span><span>{eur(vatAmt)}</span></div>
              )}
              <div className="flex justify-between text-lg font-extrabold pt-1 border-t border-border">
                <span>Total</span><span>{eur(total)}</span>
              </div>
              {deposit > 0 && (
                <>
                  <div className="flex justify-between text-sm text-muted-foreground"><span>Deposit Required</span><span>{eur(deposit)}</span></div>
                  <div className="flex justify-between text-sm font-semibold"><span>Balance Due</span><span>{eur(balance)}</span></div>
                </>
              )}
              <p className="text-[11px] text-muted-foreground pt-1">No hidden costs. Fixed price.</p>
            </div>
          </CardContent>
        </Card>

        {/* ─── 5. WHAT'S INCLUDED ────────────────────────── */}
        <Card className="shadow-sm">
          <CardContent className="p-5">
            <p className="font-semibold text-sm mb-3 text-foreground">What's Included</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {["Full installation", "System testing & commissioning", "Old unit removal", "Clean-up included"].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* ─── 6. CTA SECTION ────────────────────────────── */}
        <div className="space-y-4 pt-2">
          <div className="text-center space-y-1">
            <p className="font-bold text-base text-foreground">Secure your installation date today</p>
            {deposit > 0 && <p className="text-xs text-muted-foreground">Deposit required to confirm your booking</p>}
          </div>

          <Button
            className="w-full py-6 text-base font-bold rounded-xl"
            onClick={handleApprove}
            disabled={actionLoading}
          >
            {actionLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            ✅ Approve Quote
          </Button>

          {deposit > 0 && !depositTapped && (
            <Button
              variant="outline"
              className="w-full py-5 text-base rounded-xl border-2"
              onClick={handleDeposit}
            >
              💳 Pay Deposit {eur(deposit)}
            </Button>
          )}

          {depositTapped && (
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground">Our team will be in touch to arrange your deposit.</p>
            </div>
          )}

          {quote.pdf_url && (
            <Button
              variant="outline"
              className="w-full py-5 text-base rounded-xl border-2"
              asChild
            >
              <a href={quote.pdf_url} target="_blank" rel="noopener noreferrer">
                <Download className="w-4 h-4 mr-2" />
                Download Quote PDF
              </a>
            </Button>
          )}

          <p className="text-xs text-muted-foreground text-center">
            We'll contact you shortly to confirm your appointment.
          </p>
        </div>

        {/* ─── 7. TRUST SECTION ──────────────────────────── */}
        <div className="pt-4 pb-6">
          <div className="flex items-center justify-center gap-8">
            <div className="flex flex-col items-center gap-1.5">
              <Star className="w-7 h-7 text-yellow-500" />
              <span className="text-[11px] text-muted-foreground text-center leading-tight font-medium">4.9 Google<br />Rating</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <Shield className="w-7 h-7 text-primary" />
              <span className="text-[11px] text-muted-foreground text-center leading-tight font-medium">RGI<br />Registered</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <Wrench className="w-7 h-7 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground text-center leading-tight font-medium">Fully<br />Insured</span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground text-center mt-4">
            Trusted by homeowners across Dublin
          </p>
        </div>
      </div>
    </div>
  );
};

export default QuoteAcceptance;
