import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Clock, CheckCircle2, Star, Shield, Wrench, Download } from "lucide-react";

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
  customer_phone: string | null;
  business_name: string; business_phone: string | null; business_address: string | null;
  rgi_number: string | null; whatsapp_number: string | null;
  logo_url: string | null; line_items: LineItem[];
};

const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-IE", { day: "numeric", month: "long", year: "numeric" });
const fmtShortDate = (d: string) => new Date(d).toLocaleDateString("en-IE", { day: "numeric", month: "long" });
const eur = (n: number) => `€${n.toFixed(2)}`;

const BLUE = "#4A86E8";

const QuoteAcceptance = () => {
  // Route param renamed from :quoteNumber to :token — the URL now carries
  // an unguessable access_token instead of a sequential quote_number.
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PublicQuoteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [depositTapped, setDepositTapped] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [approveError, setApproveError] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => { if (token) fetchQuote(); }, [token]);

  const fetchQuote = async () => {
    try {
      // Resolve access_token to quote UUID via the public RPC.
      const { data: lookup } = await supabase.rpc("get_quote_by_token", { p_token: token as string });
      const quoteId = (lookup as any)?.quote_id;
      if (!quoteId) { return; }

      const { data: result, error } = await supabase.rpc("get_quote_public", { p_quote_id: quoteId });
      if (error || !result || !(result as any).quote) { return; }
      const publicData = result as unknown as PublicQuoteData;
      setData(publicData);
      const s = publicData.quote.status;
      if (s === "Sent" || s === "sent") {
        fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/mark_quote_viewed`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({ p_quote_id: quoteId }),
          }
        ).catch(() => {});
      }
    } catch {
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  };

  const quote = data?.quote ?? null;
  const biz = data?.business_name ?? "BookedJobs";
  const custName = data?.customer_name ?? "Customer";
  const custAddr = data?.customer_address ?? "";
  const custPhone = data?.customer_phone ?? null;
  const contactNum = data?.whatsapp_number ?? data?.business_phone ?? null;
  const lineItems = data?.line_items ?? [];
  const firstName = custName.split(" ")[0];

  /* ── Loading ── */
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: BLUE }} />
    </div>
  );

  /* ── Error loading quote ── */
  if (fetchError) return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, maxWidth: 440, width: "100%", padding: "32px 24px", textAlign: "center" }}>
        <p style={{ fontSize: 18, fontWeight: 700, color: "#111" }}>Something went wrong</p>
        <p style={{ fontSize: 14, color: "#6b7280", marginTop: 8 }}>We couldn&apos;t load this quote — please try again.</p>
      </div>
    </div>
  );

  /* ── Not found ── */
  if (!quote) return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, maxWidth: 440, width: "100%", padding: "32px 24px", textAlign: "center" }}>
        <p style={{ fontSize: 18, fontWeight: 700, color: "#111" }}>Quote Not Found</p>
        <p style={{ fontSize: 14, color: "#6b7280", marginTop: 8 }}>This quote link is no longer valid.</p>
      </div>
    </div>
  );

  /* ── Expired ── */
  const isExpired = quote.expiry_date && new Date(quote.expiry_date) < new Date() && !["Accepted", "Paid", "converted"].includes(quote.status);
  if (isExpired) return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, maxWidth: 440, width: "100%", padding: "32px 24px", textAlign: "center" }}>
        <p style={{ fontSize: 40 }}>⏰</p>
        <p style={{ fontSize: 18, fontWeight: 700, color: "#111", marginTop: 12 }}>This quote has expired</p>
        <p style={{ fontSize: 14, color: "#6b7280", marginTop: 8 }}>Please contact us for an updated quote.</p>
        {contactNum && <p style={{ fontSize: 14, color: "#6b7280", marginTop: 4 }}>Call us on {contactNum}</p>}
        <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 16 }}>{biz}</p>
      </div>
    </div>
  );

  /* ── Already accepted flag ── */
  const isAccepted = quote.status === "Accepted" || quote.status === "Paid" || quote.status === "converted" || accepted;

  /* ── Declined ── */
  if (quote.status === "Rejected") return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, maxWidth: 440, width: "100%", padding: "32px 24px", textAlign: "center" }}>
        <p style={{ fontSize: 14, color: "#6b7280" }}>This quote has been declined.</p>
        {contactNum && <p style={{ fontSize: 14, color: "#6b7280", marginTop: 4 }}>If you'd like to discuss, call us on {contactNum}.</p>}
        <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 16 }}>{biz}</p>
      </div>
    </div>
  );

  /* ── Pricing calc ── */
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

  /* ── Actions ── */
  const handleApprove = async () => {
    setActionLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/accept-quote`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quote_id: quote.id, access_token: token }),
        }
      );
      const result = await response.json();
      if (result.success) {
        setAccepted(true);
      } else {
        setApproveError(true);
      }
    } catch {
      setApproveError(true);
    }
    setActionLoading(false);
  };
  const handleDeposit = () => setDepositTapped(true);

  const cardStyle: React.CSSProperties = {
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: "20px",
    backgroundColor: "white",
  };

  /* ── RENDER ── */
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#ffffff", fontFamily: "'Inter', 'Poppins', sans-serif" }}>

      {/* ── BLUE TOP BAR ── */}
      <div style={{ height: 4, backgroundColor: BLUE, width: "100%" }} />

      {/* ── HEADER ── */}
      <div style={{ borderBottom: "1px solid #e5e7eb", backgroundColor: "#fafafa" }}>
        <div style={{ maxWidth: 440, margin: "0 auto", padding: "20px 20px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {data?.logo_url
              ? <img src={data.logo_url} alt={biz} style={{ height: 36, objectFit: "contain" }} />
              : <span style={{ fontSize: 20, fontWeight: 700, color: "#111" }}>{biz}</span>}
          </div>
          {!data?.logo_url ? null : (
            <p style={{ fontSize: 16, fontWeight: 700, color: "#111", marginTop: 8 }}>{biz}</p>
          )}
          <p style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
            {data?.rgi_number ? `RGI Registered (${data.rgi_number})` : "RGI Registered"} • Fully Insured
          </p>
          {data?.business_address && (
            <p style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{data.business_address}</p>
          )}
          {data?.business_phone && (
            <p style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{data.business_phone}</p>
          )}
        </div>
      </div>

      {/* ── ACCEPTED BANNER ── */}
      {isAccepted && (
        <div style={{ backgroundColor: "#22c55e", padding: "16px 20px" }}>
          <div style={{ maxWidth: 440, margin: "0 auto", display: "flex", alignItems: "center", gap: 10 }}>
            <CheckCircle2 style={{ width: 22, height: 22, color: "white", flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: 16, fontWeight: 700, color: "white" }}>
                {quote.status === "Paid" ? "Quote Paid — Thank You! ✓" : "Quote Accepted ✓"}
              </p>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.9)", marginTop: 2 }}>
                Thank you {firstName}. We've received your approval and will be in touch shortly.
              </p>
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 440, margin: "0 auto", padding: "20px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* ── QUOTE META ── */}
          <div style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                {quote.quote_number && (
                  <p style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>{quote.quote_number}</p>
                )}
                <p style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>Issued {fmtDate(quote.created_at)}</p>
              </div>
            </div>
            {quote.expiry_date && (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                backgroundColor: "#fffbeb", borderRadius: 20, padding: "6px 12px", marginTop: 12
              }}>
                <Clock style={{ width: 14, height: 14, color: "#b45309" }} />
                <span style={{ fontSize: 12, color: "#92400e" }}>
                  Price guaranteed until <span style={{ fontWeight: 600 }}>{fmtShortDate(quote.expiry_date)}</span>
                </span>
              </div>
            )}
          </div>

          {/* ── QUOTE FOR ── */}
          <div style={cardStyle}>
            <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9ca3af", marginBottom: 6 }}>Quote prepared for</p>
            <p style={{ fontSize: 18, fontWeight: 700, color: "#111" }}>{custName}</p>
            {custAddr && <p style={{ fontSize: 14, color: "#6b7280", marginTop: 2 }}>{custAddr}</p>}
            {custPhone && <p style={{ fontSize: 14, color: "#6b7280", marginTop: 2 }}>{custPhone}</p>}
          </div>

          {/* ── JOB SUMMARY ── */}
          <div style={cardStyle}>
            {quote.job_type && (
              <p style={{
                display: "inline-block", fontSize: 12, fontWeight: 600,
                backgroundColor: `${BLUE}15`, color: BLUE,
                borderRadius: 4, padding: "3px 10px", marginBottom: 8, textTransform: "capitalize"
              }}>
                {quote.job_type.replace(/_/g, " ")}
              </p>
            )}
            <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.6 }}>{quote.description}</p>
          </div>

          {/* ── PRICING ── */}
          <div style={{ ...cardStyle, padding: 0 }}>
            {/* Line items */}
            {lineItems.length > 0 && (
              <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                    <th style={{ textAlign: "left", padding: "12px 16px", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Description</th>
                    <th style={{ textAlign: "center", padding: "12px 8px", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Qty</th>
                    <th style={{ textAlign: "right", padding: "12px 16px", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((li, i) => (
                    <tr key={i} style={{ borderBottom: i < lineItems.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                      <td style={{ padding: "10px 16px", color: "#111" }}>{li.description}</td>
                      <td style={{ padding: "10px 8px", textAlign: "center", color: "#6b7280" }}>{Number(li.qty)}</td>
                      <td style={{ padding: "10px 16px", textAlign: "right", color: "#111", fontWeight: 500 }}>{eur(Number(li.line_total))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Legacy fallback */}
            {lineItems.length === 0 && (quote.parts_cost || quote.labour_cost || quote.callout_cost) && (
              <div style={{ padding: "16px 16px 0" }}>
                {quote.parts_cost ? <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}><span style={{ color: "#6b7280" }}>Parts</span><span>{eur(Number(quote.parts_cost))}</span></div> : null}
                {quote.labour_cost ? <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}><span style={{ color: "#6b7280" }}>Labour</span><span>{eur(Number(quote.labour_cost))}</span></div> : null}
                {quote.callout_cost ? <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}><span style={{ color: "#6b7280" }}>Call-Out</span><span>{eur(Number(quote.callout_cost))}</span></div> : null}
              </div>
            )}

            {/* Summary rows */}
            <div style={{ borderTop: "1px solid #e5e7eb", padding: "16px" }}>
              {(disc > 0 || vatOn) && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#6b7280", marginBottom: 6 }}>
                  <span>Subtotal</span><span>{eur(subtotal)}</span>
                </div>
              )}
              {disc > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#16a34a", marginBottom: 6 }}>
                  <span>Special Offer Applied</span><span>-{eur(disc)}</span>
                </div>
              )}
              {vatOn && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#6b7280", marginBottom: 6 }}>
                  <span>VAT (23%)</span><span>{eur(vatAmt)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, fontWeight: 800, color: "#111", paddingTop: 8, borderTop: "1px solid #e5e7eb" }}>
                <span>Total</span><span>{eur(total)}</span>
              </div>
              {deposit > 0 && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#6b7280", marginTop: 8 }}>
                    <span>Deposit</span><span>-{eur(deposit)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 700, color: "#111", marginTop: 4 }}>
                    <span>Balance Due</span><span>{eur(balance)}</span>
                  </div>
                </>
              )}
              <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 10 }}>No hidden costs. Fixed price.</p>
            </div>
          </div>

          {/* ── WHAT'S INCLUDED ── */}
          <div style={{ ...cardStyle, backgroundColor: "#f9fafb" }}>
            <p style={{ fontWeight: 600, fontSize: 15, color: "#111", marginBottom: 12 }}>What's Included</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {["Full installation", "System testing & commissioning", "Old unit removal", "Clean-up included"].map((t) => (
                <div key={t} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 14, color: "#4b5563" }}>
                  <CheckCircle2 style={{ width: 16, height: 16, color: "#22c55e", marginTop: 2, flexShrink: 0 }} />
                  <span>{t}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── CTA SECTION (hidden when accepted) ── */}
          {!isAccepted && (
          <div style={{ paddingTop: 8, paddingBottom: 4 }}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <p style={{ fontWeight: 700, fontSize: 16, color: "#111" }}>Secure your installation date today</p>
              <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>No hidden costs. Fixed price.</p>
            </div>

            <button
              onClick={handleApprove}
              disabled={actionLoading}
              style={{
                width: "100%", minHeight: 52, borderRadius: 10, border: "none",
                backgroundColor: BLUE, color: "white", fontSize: 16, fontWeight: 700,
                cursor: actionLoading ? "not-allowed" : "pointer", opacity: actionLoading ? 0.7 : 1,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              ✅ Approve Quote
            </button>

            {deposit > 0 && !approveError && (
              <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", marginTop: 10 }}>
                Deposit required to confirm your booking
              </p>
            )}

            {approveError && (
              <div style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: 16, textAlign: "center", marginTop: 12 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: "#dc2626" }}>Something went wrong</p>
                <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>Please call us directly to confirm your quote.</p>
                {contactNum && <p style={{ fontSize: 14, fontWeight: 600, color: "#111", marginTop: 8 }}>{contactNum}</p>}
              </div>
            )}

            {deposit > 0 && !depositTapped && (
              <button
                onClick={handleDeposit}
                style={{
                  width: "100%", minHeight: 52, borderRadius: 10,
                  border: `2px solid ${BLUE}`, backgroundColor: "transparent",
                  color: BLUE, fontSize: 16, fontWeight: 600, cursor: "pointer",
                  marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                💳 Pay Deposit {eur(deposit)}
              </button>
            )}

            {depositTapped && (
              <div style={{ backgroundColor: "#f9fafb", borderRadius: 10, padding: 16, textAlign: "center", marginTop: 12 }}>
                <p style={{ fontSize: 14, color: "#6b7280" }}>Our team will be in touch to arrange your deposit payment.</p>
              </div>
            )}

            {quote.pdf_url && (
              <button
                onClick={async () => {
                  setDownloadingPdf(true);
                  try {
                    const { data: resolved } = await supabase.functions.invoke("resolve-document-link", {
                      body: { type: "quote", token },
                    });
                    const signed = (resolved as any)?.signed_url;
                    if (!signed) throw new Error("no signed url");
                    const response = await fetch(signed);
                    if (!response.ok) throw new Error("Failed");
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = (quote.quote_number || "quote") + ".pdf";
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    window.URL.revokeObjectURL(url);
                  } catch {
                    // silent fail on public page
                  } finally {
                    setDownloadingPdf(false);
                  }
                }}
                disabled={downloadingPdf}
                style={{
                  width: "100%", minHeight: 52, borderRadius: 10,
                  border: "2px solid #e5e7eb", backgroundColor: "transparent",
                  color: "#374151", fontSize: 16, fontWeight: 500,
                  cursor: downloadingPdf ? "not-allowed" : "pointer", opacity: downloadingPdf ? 0.7 : 1,
                  marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                {downloadingPdf
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Download style={{ width: 16, height: 16 }} />}
                {downloadingPdf ? "Downloading..." : "Download Quote PDF"}
              </button>
            )}

            <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", marginTop: 14 }}>
              We'll contact you shortly to confirm your appointment.
            </p>
          </div>
          )}

          {/* ── PDF Download (always visible) ── */}
          {isAccepted && quote.pdf_url && (
            <button
              onClick={async () => {
                setDownloadingPdf(true);
                try {
                  const { data: resolved } = await supabase.functions.invoke("resolve-document-link", {
                    body: { type: "quote", token },
                  });
                  const signed = (resolved as any)?.signed_url;
                  if (!signed) throw new Error("no signed url");
                  const response = await fetch(signed);
                  if (!response.ok) throw new Error("Failed");
                  const blob = await response.blob();
                  const url = window.URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = (quote.quote_number || "quote") + ".pdf";
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  window.URL.revokeObjectURL(url);
                } catch {
                  // silent fail
                } finally {
                  setDownloadingPdf(false);
                }
              }}
              disabled={downloadingPdf}
              style={{
                width: "100%", minHeight: 52, borderRadius: 10,
                border: "2px solid #e5e7eb", backgroundColor: "transparent",
                color: "#374151", fontSize: 16, fontWeight: 500,
                cursor: downloadingPdf ? "not-allowed" : "pointer", opacity: downloadingPdf ? 0.7 : 1,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              {downloadingPdf
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Download style={{ width: 16, height: 16 }} />}
              {downloadingPdf ? "Downloading..." : "Download Quote PDF"}
            </button>
          )}

          {/* ── TRUST SECTION ── */}
          <div style={{ paddingTop: 16, paddingBottom: 32 }}>
            <div style={{ display: "flex", justifyContent: "center", gap: 48 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <Star style={{ width: 32, height: 32, color: "#eab308" }} />
                <span style={{ fontSize: 11, color: "#6b7280", textAlign: "center", lineHeight: 1.3, fontWeight: 500 }}>4.9 Google<br />Rating</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <Shield style={{ width: 32, height: 32, color: BLUE }} />
                <span style={{ fontSize: 11, color: "#6b7280", textAlign: "center", lineHeight: 1.3, fontWeight: 500 }}>RGI<br />Registered</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <Wrench style={{ width: 32, height: 32, color: "#6b7280" }} />
                <span style={{ fontSize: 11, color: "#6b7280", textAlign: "center", lineHeight: 1.3, fontWeight: 500 }}>Fully<br />Insured</span>
              </div>
            </div>
            <p style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", marginTop: 20 }}>
              Trusted by homeowners across Dublin
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};

export default QuoteAcceptance;
