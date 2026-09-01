import { useState } from "react";
import { buildApproveToast } from "@/lib/quoteApproveMessage";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invokeFunction } from "@/lib/invokeFunction";
import type { Database } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Edit2, Download, MessageCircle, CheckCircle2, Loader2, FileText, Eye } from "lucide-react";
import { format } from "date-fns";
import { classifyWhatsAppError, getWhatsAppErrorToast } from "@/lib/whatsappErrors";
import { useWhatsAppConnection } from "@/hooks/useWhatsAppConnection";
import DeliveryStatusBadge from "@/components/comms/DeliveryStatusBadge";

type QuoteRow = Database["public"]["Tables"]["quotes"]["Row"];
type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];
type QuoteWithCustomer = QuoteRow & { customers: CustomerRow };

const STATUS_BADGE: Record<string, string> = {
  Draft: "bg-muted text-muted-foreground",
  draft: "bg-muted text-muted-foreground",
  Sent: "bg-primary/10 text-primary",
  sent: "bg-primary/10 text-primary",
  viewed: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]",
  Accepted: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]",
  accepted: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]",
  expired: "bg-destructive/10 text-destructive",
  Rejected: "bg-destructive/10 text-destructive",
  converted: "bg-primary/10 text-primary",
  Paid: "bg-[hsl(var(--success))]/20 text-[hsl(var(--success))]",
};

const QuoteDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as any)?.returnTo as string | undefined;
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const queryClient = useQueryClient();
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [approving, setApproving] = useState(false);
  const { setConnectionError, clearConnectionError } = useWhatsAppConnection();

  const { data: quote, isLoading } = useQuery({
    queryKey: ["quote-detail", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("quotes")
        .select("*, customers!inner(id, name, phone, email, address, eircode)")
        .eq("id", id!)
        .single();
      return data;
    },
    enabled: !!id,
  });

  const { data: settings } = useQuery({
    queryKey: ["settings-for-quote"],
    queryFn: async () => {
      const { data } = await supabase.from("settings").select("business_name, business_phone, whatsapp_number").limit(1).single();
      return data;
    },
    enabled: !!user,
  });

  const { data: lineItems = [] } = useQuery({
    queryKey: ["quote-line-items", id],
    queryFn: async () => {
      const { data } = await supabase.from("quote_line_items").select("*").eq("quote_id", id!).order("sort_order");
      return data || [];
    },
    enabled: !!id,
  });

  // The deposit lives on the job created from this quote, not on the quote row.
  const convertedJobId = (quote as any)?.converted_job_id as string | null | undefined;
  const { data: convertedJob } = useQuery({
    queryKey: ["quote-converted-job", convertedJobId],
    queryFn: async () => {
      const { data } = await supabase
        .from("service_calls")
        .select("id, deposit_amount, deposit_paid, payment_status, paid_at")
        .eq("id", convertedJobId!)
        .maybeSingle();
      return data;
    },
    enabled: !!convertedJobId,
  });

  const depositPaidAt = convertedJob?.deposit_paid ? convertedJob.paid_at : null;
  const depositAmount = Number(convertedJob?.deposit_amount ?? 0);

  const respondToQuote = async (accepted: boolean) => {
    if (!id) return;
    if (accepted && approving) return; // guard double-tap: one approval only
    try {
      if (accepted) {
        // Route staff acceptance through the same edge function as the public
        // approval page so the whole sequence runs in order and reports which
        // stage failed: approval -> office bell -> deposit link -> WhatsApp.
        setApproving(true);
        const { data, error } = await supabase.functions.invoke("accept-quote", {
          body: { quote_id: id, access_token: quote?.access_token },
        });
        const toastPayload = buildApproveToast(data ?? null, error?.message ?? null);
        toast(toastPayload as any);
        // Refresh either way — the job may exist even when a later stage failed.
        queryClient.invalidateQueries({ queryKey: ["quote-detail", id] });
        queryClient.invalidateQueries({ queryKey: ["quote-converted-job"] });
        return;
      }

      const { error } = await supabase.rpc("respond_to_quote", {
        p_quote_id: id,
        p_accepted: false,
        p_access_token: quote?.access_token,
      });
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Quote rejected" });
      queryClient.invalidateQueries({ queryKey: ["quote-detail", id] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      if (accepted) setApproving(false);
    }
  };





  const sendWhatsApp = async () => {
    if (!quote || !id) return;
    const qw: any = quote;
    const cust: any = qw.customers;
    if (!cust?.phone) {
      toast({ title: "No phone number", description: "Customer has no mobile number on file.", variant: "destructive" });
      return;
    }
    setSendingWhatsApp(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-quote-whatsapp", {
        body: {
          quote_id: id,
          customer_name: cust.name,
          mobile_number: cust.phone,
          job_description: qw.description,
          quote_amount: qw.total_amount,
          parts_cost: qw.parts_cost,
          labour_cost: qw.labour_cost,
          deposit_amount: qw.deposit_amount || qw.deposit,
          business_phone: settings?.whatsapp_number || settings?.business_phone,
          business_name: settings?.business_name,
          pdf_url: qw.pdf_url,
          quote_number: qw.quote_number,
        },
      });
      if (error || !data?.success) {
        const errorDetail = data?.error_detail || data?.error || error?.message;
        const errorType = classifyWhatsAppError(errorDetail);
        const customerName = (quote as any)?.customers?.name;
        toast(getWhatsAppErrorToast(errorType, customerName, errorDetail));
        if (errorType === "connection") setConnectionError(true);
      } else {
        clearConnectionError();
        toast({ title: `WhatsApp sent successfully to ${(quote as any)?.customers?.name || "customer"} ✅`, duration: 4000 });
        queryClient.invalidateQueries({ queryKey: ["quote-detail", id] });
      }
    } catch (err: any) {
      toast({ title: "WhatsApp failed", description: err.message, variant: "destructive" });
    }
    setSendingWhatsApp(false);
  };

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!quote) return <div className="text-center py-20 text-muted-foreground">Quote not found</div>;

  const q = quote as QuoteWithCustomer;
  const customer: any = q.customers;

  // Use quote_line_items table rows if available, otherwise fall back to JSONB line_items column
  const displayLineItems = lineItems.length > 0
    ? lineItems
    : (Array.isArray(q.line_items) ? q.line_items.map((li: any, i: number) => ({
        id: `json-${i}`,
        description: li.description,
        qty: li.quantity ?? li.qty ?? 1,
        unit_price: li.unit_price,
        line_total: li.line_total ?? (li.quantity ?? li.qty ?? 1) * li.unit_price,
        sort_order: i,
      })) : []);

  const subtotal = displayLineItems.reduce((s: number, li: any) => s + Number(li.line_total || 0), 0);
  const effectiveTotal = subtotal > 0 ? subtotal : Number(q.total_amount || 0);
  const discountVal = Number(q.discount || 0);
  const afterDiscount = Math.max(effectiveTotal - discountVal, 0);
  const vatAmt = q.vat_enabled ? afterDiscount * 0.23 : 0;
  const total = Math.max(afterDiscount + vatAmt, 0);
  const depositVal = Number(q.deposit || 0);
  const balance = Math.max(total - depositVal, 0);

  const statusLabel = q.status?.charAt(0).toUpperCase() + q.status?.slice(1);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => returnTo ? navigate(returnTo) : navigate(-1)}><ArrowLeft className="w-5 h-5" /></Button>
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold text-foreground">{q.quote_number || `Q-${q.id.slice(0, 4).toUpperCase()}`}</h1>
        </div>
        <span className={`text-xs font-bold px-3 py-1 rounded-full ${STATUS_BADGE[q.status] || STATUS_BADGE.draft}`}>
          {statusLabel}
        </span>
      </div>

      {/* Customer Info */}
      <Card className="mb-4">
        <CardContent className="p-4 space-y-1">
          <p className="font-bold text-foreground">{customer?.name}</p>
          <p className="text-sm text-muted-foreground">{customer?.address}</p>
          <p className="text-sm text-muted-foreground">{customer?.phone}</p>
          {customer?.email && <p className="text-sm text-muted-foreground">{customer.email}</p>}
        </CardContent>
      </Card>

      {/* Job Info */}
      <Card className="mb-4">
        <CardContent className="p-4 space-y-1">
          {q.job_type && q.job_type !== "other" && (
            <p className="text-sm"><span className="text-muted-foreground">Job Type:</span> <span className="font-semibold">{q.job_type}</span></p>
          )}
          {q.description && <p className="text-sm"><span className="text-muted-foreground">Description:</span> {q.description}</p>}
        </CardContent>
      </Card>

      {/* Line Items */}
      {displayLineItems.length > 0 && (
        <Card className="mb-4">
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-2.5 text-muted-foreground font-semibold">#</th>
                  <th className="px-4 py-2.5 text-muted-foreground font-semibold">Description</th>
                  <th className="px-4 py-2.5 text-muted-foreground font-semibold text-right">Qty</th>
                  <th className="px-4 py-2.5 text-muted-foreground font-semibold text-right">Unit Price</th>
                  <th className="px-4 py-2.5 text-muted-foreground font-semibold text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {displayLineItems.map((li: any, i: number) => (
                  <tr key={li.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-2.5 font-medium">{li.description}</td>
                    <td className="px-4 py-2.5 text-right">{li.qty}</td>
                    <td className="px-4 py-2.5 text-right">€{Number(li.unit_price).toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">€{Number(li.line_total).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Pricing */}
      <Card className="mb-4">
        <CardContent className="p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span>€{subtotal.toFixed(2)}</span>
          </div>
          {discountVal > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Discount</span>
              <span>−€{discountVal.toFixed(2)}</span>
            </div>
          )}
          {q.vat_enabled && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">VAT 23%</span>
              <span>€{vatAmt.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between font-extrabold text-base border-t border-border pt-2">
            <span>Total</span>
            <span>€{total.toFixed(2)}</span>
          </div>
          {depositVal > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Deposit</span>
              <span>−€{depositVal.toFixed(2)}</span>
            </div>
          )}
          {depositVal > 0 && (
            <div className="flex justify-between text-sm font-bold">
              <span className="text-muted-foreground">Balance Due</span>
              <span>€{balance.toFixed(2)}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notes & Terms */}
      {(q.notes || q.terms) && (
        <Card className="mb-4">
          <CardContent className="p-4 space-y-3">
            {q.notes && (
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Notes</p>
                <p className="text-sm whitespace-pre-wrap">{q.notes}</p>
              </div>
            )}
            {q.terms && (
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Terms & Conditions</p>
                <p className="text-sm whitespace-pre-wrap">{q.terms}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Activity Timeline */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Activity</p>
          <div className="relative pl-6">
            {[
              { label: "Created", date: q.created_at, fmt: "dd MMM yyyy", active: true },
              { label: "Sent", date: q.sent_at, fmt: "dd MMMM yyyy HH:mm", active: !!q.sent_at },
              { label: "Viewed", date: q.viewed_at, fmt: "dd MMMM yyyy HH:mm", active: !!q.viewed_at },
              { label: "Accepted", date: q.accepted_at, fmt: "dd MMMM yyyy HH:mm", active: !!q.accepted_at },
              {
                label: depositAmount > 0 ? `Deposit Paid · €${depositAmount.toFixed(2)}` : "Deposit Paid",
                date: depositPaidAt,
                fmt: "dd MMMM yyyy HH:mm",
                active: !!depositPaidAt,
                // Stays on the timeline before payment, greyed out like any
                // other step that has not been reached yet.
                pending: !depositPaidAt,
              },
              { label: "Expires", date: q.expiry_date, fmt: "dd MMMM yyyy", active: !!q.expiry_date },
            ]
              .filter((step) => step.active || (step as { pending?: boolean }).pending)
              .map((step, i, arr) => {
                const pending = !step.active;
                return (
                <div key={step.label} className="relative pb-5 last:pb-0">
                  {/* Connecting line */}
                  {i < arr.length - 1 && (
                    <span className="absolute left-[-16px] top-[18px] w-0.5 h-[calc(100%-6px)] bg-border" />
                  )}
                  {/* Dot */}
                  <span
                    className={`absolute left-[-20px] top-[5px] w-[9px] h-[9px] rounded-full border-2 ${
                      pending || step.label === "Expires"
                        ? "border-muted-foreground bg-muted"
                        : "border-primary bg-primary"
                    }`}
                  />
                  <p className="text-sm leading-tight">
                    <span className={`font-semibold ${pending ? "text-muted-foreground" : "text-foreground"}`}>
                      {step.label}
                    </span>
                    <span className="text-muted-foreground ml-2">
                      {step.date ? format(new Date(step.date), step.fmt) : "—"}
                    </span>
                  </p>
                </div>
                );
              })}

          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2 pb-8">
        <Button variant="outline" onClick={() => navigate(`/quotes/${id}/edit`)}>
          <Edit2 className="w-4 h-4 mr-1" /> Edit Quote
        </Button>
        <Button
          variant="outline"
          disabled={generatingPdf}
          onClick={async () => {
            if (!id) return;
            setGeneratingPdf(true);
            try {
              // Must carry the signed-in session: generate-quote-pdf is tenant-guarded
              // and rejects the anon key.
              const { data: result, error: pdfError } = await invokeFunction<any>(
                "generate-quote-pdf",
                { body: { quote_id: id } },
              );
              if (pdfError || !result?.success) {
                toast({ title: "PDF generation failed. Please try again.", description: pdfError?.message ?? result?.error, variant: "destructive" });
              } else {
                await supabase.from("quotes").update({ pdf_url: result.pdf_url } as any).eq("id", id);
                toast({ title: "PDF regenerated — opening preview" });
                queryClient.invalidateQueries({ queryKey: ["quote-detail", id] });
                window.open(result.pdf_url, "_blank");
              }
            } catch (err: any) {
              toast({ title: "PDF generation failed. Please try again.", variant: "destructive" });
            }
            setGeneratingPdf(false);
          }}
        >
          {generatingPdf ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <FileText className="w-4 h-4 mr-1" />}
          {generatingPdf ? "Generating..." : q.pdf_url ? "Regenerate PDF" : "Generate PDF"}
        </Button>
        {q.pdf_url && (
          <Button variant="outline" onClick={() => window.open(q.pdf_url, "_blank")}>
            <Eye className="w-4 h-4 mr-1" /> Preview PDF
          </Button>
        )}
        <Button
          variant="outline"
          onClick={async () => {
            if (!q.pdf_url) {
              toast({ title: "No PDF found. Please regenerate." });
              return;
            }
            setDownloadingPdf(true);
            try {
              const response = await fetch(q.pdf_url);
              if (!response.ok) throw new Error("Failed to fetch");
              const blob = await response.blob();
              const url = window.URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = (q.quote_number || "quote") + ".pdf";
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              window.URL.revokeObjectURL(url);
            } catch {
              toast({ title: "Download failed. Please try again.", variant: "destructive" });
            } finally {
              setDownloadingPdf(false);
            }
          }}
          disabled={!q.pdf_url || downloadingPdf}
        >
          {downloadingPdf ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Download className="w-4 h-4 mr-1" />}
          {downloadingPdf ? "Downloading..." : "Download PDF"}
        </Button>
        <div className="w-full">
          <DeliveryStatusBadge commType="quote" relatedId={q.id} />
        </div>
        <Button variant="outline" onClick={sendWhatsApp} disabled={sendingWhatsApp}>
          {sendingWhatsApp ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <MessageCircle className="w-4 h-4 mr-1" />}
          Resend WhatsApp
        </Button>
        {!["Accepted", "accepted", "converted", "Paid"].includes(q.status) && (
          <Button onClick={() => respondToQuote(true)} disabled={approving}>
            {approving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
            {approving ? "Approving…" : "Mark Accepted"}
          </Button>
        )}


        {q.converted_job_id && (
          <Button variant="outline" onClick={() => navigate(`/jobs/${q.converted_job_id}`)}>
            📋 View Job
          </Button>
        )}
      </div>
    </div>
  );
};

export default QuoteDetail;
