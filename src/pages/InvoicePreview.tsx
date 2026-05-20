import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { printReceipt } from "@/lib/printReceipt";
import {
  FileText, Download, Send, Loader2, ArrowLeft, CalendarPlus, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const formatDate = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-IE", { day: "2-digit", month: "short", year: "numeric" });

const addDays = (d: string, days: number) => {
  const date = new Date(d + "T00:00:00");
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString("en-IE", { day: "2-digit", month: "short", year: "numeric" });
};

const InvoicePreview = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [job, setJob] = useState<any>(null);
  const [customer, setCustomer] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (user && id) loadData();
  }, [user, id]);

  const loadData = async () => {
    setLoading(true);
    const { data: jobData } = await supabase
      .from("service_calls")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!jobData) {
      toast({ title: "Job not found", variant: "destructive" });
      navigate(-1);
      return;
    }

    const [settingsRes, custRes] = await Promise.all([
      supabase.from("settings").select("*").eq("organisation_id", jobData.organisation_id).maybeSingle(),
      supabase.from("customers").select("*").eq("id", jobData.customer_id).maybeSingle(),
    ]);

    setJob(jobData);
    setCustomer(custRes.data);
    setSettings(settingsRes.data);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!job || !customer) return null;

  const businessName = settings?.business_name || "";
  const businessPhone = settings?.business_phone || "";
  const businessAddress = settings?.business_address || "";
  const rgiNumber = settings?.rgi_number || "";

  const invoiceNumber = job.invoice_number || "—";
  const issueDate = job.invoiced_at
    ? new Date(job.invoiced_at).toLocaleDateString("en-IE", { day: "2-digit", month: "short", year: "numeric" })
    : formatDate(new Date().toISOString().split("T")[0]);
  const dueDateStr = job.invoiced_at
    ? addDays(new Date(job.invoiced_at).toISOString().split("T")[0], 30)
    : addDays(new Date().toISOString().split("T")[0], 30);

  const serviceDate = job.scheduled_date
    ? formatDate(job.scheduled_date)
    : "—";
  const jobRef = job.job_reference || `KN-${job.id.slice(0, 6).toUpperCase()}`;
  const serviceType = job.job_type || "Boiler Service";

  const totalAmount = job.revenue ? Number(job.revenue) : 0;
  const hasDeposit = !!job.deposit_paid && (job.deposit_amount ?? 0) > 0;
  const depositAmount = hasDeposit ? Number(job.deposit_amount) : 0;
  const balanceDue = hasDeposit
    ? (job.balance_due != null ? Number(job.balance_due) : totalAmount - depositAmount)
    : totalAmount;

  const handleDownloadPdf = () => {
    printReceipt({
      receiptNumber: invoiceNumber,
      issueDate,
      customerName: customer.name,
      customerAddress: `${customer.address || ""} ${customer.eircode || ""}`.trim(),
      serviceType,
      serviceDate,
      paymentMethod: "Invoice",
      amountPaid: `€${balanceDue.toFixed(2)}`,
      nextServiceDue: "",
      businessName,
      businessPhone,
      businessTagline: "Professional Gas & Boiler Services",
      businessAddress,
      jobReference: jobRef,
    });
  };

  const handleSendPaymentLink = async () => {
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("send-payment-link", {
        body: { service_call_id: job.id },
      });
      if (error) throw error;
      setSent(true);
    } catch (e: any) {
      toast({
        title: "Failed to send — please try again",
        variant: "destructive",
      });
    }
    setSending(false);
  };

  return (
    <div className="min-h-screen bg-[hsl(220,14%,96%)]">
      <div className="max-w-[430px] mx-auto px-4 py-6">
        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="mb-3 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {/* Invoice card */}
        <div className="bg-background rounded-2xl border border-border shadow-[0_4px_24px_rgba(0,0,0,0.06)] overflow-hidden">
          {/* Business header */}
          <div className="px-5 pt-6 pb-4 text-center">
            <h1 className="text-lg font-extrabold text-foreground">{businessName}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Professional Gas & Boiler Services</p>
            <p className="text-xs text-muted-foreground">Phone: {businessPhone}</p>
            {businessAddress && (
              <p className="text-[11px] text-muted-foreground mt-0.5">{businessAddress}</p>
            )}
          </div>

          {/* Invoice indicator */}
          <div className="flex flex-col items-center py-4">
            <div className="w-14 h-14 rounded-full bg-[hsl(35,92%,50%)]/10 flex items-center justify-center mb-2">
              <FileText className="w-8 h-8 text-[hsl(35,92%,50%)]" />
            </div>
            <span className="text-sm font-bold text-[hsl(35,92%,50%)]">Invoice — Payment Due</span>
          </div>

          {/* Invoice info */}
          <div className="mx-5 border-t border-[hsl(220,13%,91%)]" />
          <div className="px-5 py-3 flex justify-between text-xs">
            <div>
              <span className="text-muted-foreground">Invoice No.</span>
              <span className="ml-1.5 font-bold text-foreground">{invoiceNumber}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Issued</span>
              <span className="ml-1.5 font-bold text-foreground">{issueDate}</span>
            </div>
          </div>
          <div className="px-5 pb-3 flex justify-between text-xs">
            <div>
              <span className="text-muted-foreground">Job Ref</span>
              <span className="ml-1.5 font-bold text-foreground">{jobRef}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Due</span>
              <span className="ml-1.5 font-bold text-[hsl(35,92%,50%)]">{dueDateStr}</span>
            </div>
          </div>

          {/* Service card */}
          <div className="mx-5 bg-[hsl(220,14%,96%)] rounded-xl p-4 mb-3">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Service</div>
            <div className="flex justify-between items-start">
              <div>
                <div className="text-sm font-bold text-foreground">{serviceType}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{serviceDate}</div>
              </div>
              <div className="text-lg font-extrabold text-foreground">€{totalAmount.toFixed(2)}</div>
            </div>
          </div>

          {/* Customer details */}
          <div className="mx-5 border-t border-[hsl(220,13%,91%)]" />
          <div className="px-5 py-3">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Customer</div>
            <div className="text-sm font-bold text-foreground">{customer.name}</div>
            <div className="text-xs text-muted-foreground">
              {`${customer.address || ""} ${customer.eircode || ""}`.trim()}
            </div>
          </div>

          {/* Payment breakdown */}
          <div className="mx-5 border-t border-[hsl(220,13%,91%)]" />
          <div className="px-5 py-3">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Payment</div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Method</span>
              <span className="font-bold text-foreground">Invoice</span>
            </div>

            {hasDeposit && (
              <>
                <div className="flex justify-between items-center mt-2 text-sm">
                  <span className="text-muted-foreground">Job Total</span>
                  <span className="font-bold text-foreground">€{totalAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center mt-1 text-sm">
                  <span className="text-muted-foreground">Deposit Paid</span>
                  <span className="font-bold text-success">−€{depositAmount.toFixed(2)} ✅</span>
                </div>
              </>
            )}

            <div className="flex justify-between items-center mt-2 pt-2 border-t border-[hsl(220,13%,91%)]">
              <span className="text-sm font-bold text-foreground">
                {hasDeposit ? "Balance Due" : "Total Due"}
              </span>
              <span className="text-xl font-extrabold text-[hsl(35,92%,50%)]">
                €{balanceDue.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="mx-5 border-t border-[hsl(220,13%,91%)]" />
          <div className="px-5 py-4 text-center">
            <p className="text-xs text-muted-foreground">
              Thank you for choosing {businessName}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Payment due within 30 days
            </p>
            {rgiNumber && (
              <p className="text-[11px] text-muted-foreground mt-1">
                RGI Reg: {rgiNumber}
              </p>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-4 space-y-2.5">
          <Button
            className="w-full h-12 text-sm font-extrabold gap-2"
            onClick={handleDownloadPdf}
          >
            <Download className="w-4 h-4" />
            Download PDF Invoice
          </Button>
          <Button
            className="w-full h-12 text-sm font-extrabold gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={handleSendPaymentLink}
            disabled={sending || sent}
          >
            {sending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
            ) : sent ? (
              <>✅ Sent to {customer?.name} via WhatsApp</>
            ) : (
              <><Send className="w-4 h-4" /> Send Payment Link via WhatsApp</>
            )}
          </Button>
          <Button
            variant="outline"
            className="w-full h-12 text-sm font-bold gap-2"
            onClick={() => navigate(-1)}
          >
            <CalendarPlus className="w-4 h-4" /> Back to Jobs
          </Button>
        </div>
      </div>
    </div>
  );
};

export default InvoicePreview;
