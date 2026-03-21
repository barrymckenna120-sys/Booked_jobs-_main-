import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Edit2, Download, MessageCircle, CheckCircle2, ArrowRightCircle, Loader2, FileText } from "lucide-react";
import { format } from "date-fns";

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
  const queryClient = useQueryClient();
  const [converting, setConverting] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);

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

  const markAccepted = async () => {
    if (!id) return;
    await supabase.from("quotes").update({ status: "Accepted", accepted_at: new Date().toISOString() } as any).eq("id", id);
    toast({ title: "Quote marked as accepted" });
    queryClient.invalidateQueries({ queryKey: ["quote-detail", id] });
  };

  const convertToJob = async () => {
    if (!quote || !user) return;
    setConverting(true);
    const { data: newJob, error } = await supabase.from("service_calls").insert({
      customer_id: quote.customer_id,
      user_id: user.id,
      job_type: (quote as any).job_type || "Other",
      job_issue: quote.description,
      status: "Pending",
      has_quote: true,
      notes: `Created from quote ${(quote as any).quote_number || quote.id.slice(0, 8)}`,
      source: "Quote",
      revenue: quote.total_amount || null,
    } as any).select("id").single();

    if (newJob && !error) {
      await supabase.from("quotes").update({ status: "converted", converted_job_id: newJob.id } as any).eq("id", id!);
      toast({ title: "Job created from quote" });
      queryClient.invalidateQueries({ queryKey: ["quote-detail", id] });
      navigate(`/jobs/${newJob.id}`);
    } else {
      toast({ title: "Error", description: error?.message, variant: "destructive" });
    }
    setConverting(false);
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
        toast({ title: "WhatsApp failed", description: data?.error || error?.message, variant: "destructive" });
      } else {
        toast({ title: "Quote sent via WhatsApp ✅" });
        queryClient.invalidateQueries({ queryKey: ["quote-detail", id] });
      }
    } catch (err: any) {
      toast({ title: "WhatsApp failed", description: err.message, variant: "destructive" });
    }
    setSendingWhatsApp(false);
  };

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (!quote) return <div className="text-center py-20 text-muted-foreground">Quote not found</div>;

  const q: any = quote;
  const customer: any = q.customers;
  const subtotal = lineItems.reduce((s: number, li: any) => s + Number(li.line_total || 0), 0);
  const discountVal = Number(q.discount || 0);
  const afterDiscount = Math.max(subtotal - discountVal, 0);
  const vatAmt = q.vat_enabled ? afterDiscount * 0.23 : 0;
  const total = Math.max(afterDiscount + vatAmt, 0);
  const depositVal = Number(q.deposit || 0);
  const balance = Math.max(total - depositVal, 0);

  const statusLabel = q.status?.charAt(0).toUpperCase() + q.status?.slice(1);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/quotes")}><ArrowLeft className="w-5 h-5" /></Button>
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
      {lineItems.length > 0 && (
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
                {lineItems.map((li: any, i: number) => (
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

      {/* Dates & Meta */}
      <Card className="mb-6">
        <CardContent className="p-4 space-y-1 text-sm">
          {q.expiry_date && <p><span className="text-muted-foreground">Expires:</span> {format(new Date(q.expiry_date), "dd MMM yyyy")}</p>}
          {q.sent_at && <p><span className="text-muted-foreground">Sent:</span> {format(new Date(q.sent_at), "dd MMM yyyy 'at' HH:mm")}</p>}
          {q.accepted_at && <p><span className="text-muted-foreground">Accepted:</span> {format(new Date(q.accepted_at), "dd MMM yyyy 'at' HH:mm")}</p>}
          <p><span className="text-muted-foreground">Created:</span> {format(new Date(q.created_at), "dd MMM yyyy")}</p>
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
              const { data, error } = await supabase.functions.invoke("generate-quote-pdf", {
                body: { quote_id: id },
              });
              if (error || !data?.success) {
                toast({ title: "PDF failed", description: data?.error || error?.message, variant: "destructive" });
              } else {
                toast({ title: "PDF generated ✅" });
                queryClient.invalidateQueries({ queryKey: ["quote-detail", id] });
                window.open(data.pdf_url, "_blank");
              }
            } catch (err: any) {
              toast({ title: "PDF failed", description: err.message, variant: "destructive" });
            }
            setGeneratingPdf(false);
          }}
        >
          {generatingPdf ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <FileText className="w-4 h-4 mr-1" />}
          {q.pdf_url ? "Regenerate PDF" : "Generate PDF"}
        </Button>
        {q.pdf_url && (
          <Button variant="outline" asChild>
            <a href={q.pdf_url} target="_blank" rel="noopener noreferrer">
              <Download className="w-4 h-4 mr-1" /> Download PDF
            </a>
          </Button>
        )}
        {q.pdf_url && (
          <Button variant="outline" onClick={sendWhatsApp} disabled={sendingWhatsApp}>
            {sendingWhatsApp ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <MessageCircle className="w-4 h-4 mr-1" />}
            Resend WhatsApp
          </Button>
        )}
        {!["Accepted", "accepted", "converted", "Paid"].includes(q.status) && (
          <Button onClick={markAccepted}>
            <CheckCircle2 className="w-4 h-4 mr-1" /> Mark Accepted
          </Button>
        )}
        {["Accepted", "accepted"].includes(q.status) && !q.converted_job_id && (
          <Button onClick={convertToJob} disabled={converting}>
            {converting && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
            <ArrowRightCircle className="w-4 h-4 mr-1" /> Convert to Job
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
