import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Download, CalendarPlus, Loader2, Send, FileText, Eye, AlertTriangle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import CertificateFlow from "@/components/engineer/CertificateFlow";
import HazardNotificationFlow from "@/components/engineer/HazardNotificationFlow";
import { resolveReceiptUrl } from "@/lib/resolveReceiptUrl";
import { invokeFunction } from "@/lib/invokeFunction";


const formatDate = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-IE", { day: "2-digit", month: "short", year: "numeric" });

const addMonths = (d: string, months: number) => {
  const date = new Date(d + "T00:00:00");
  date.setMonth(date.getMonth() + months);
  return date.toLocaleDateString("en-IE", { day: "2-digit", month: "short", year: "numeric" });
};

const openExternalUrl = (url: string) => {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
};

const ServiceReceipt = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [job, setJob] = useState<any>(null);
  const [customer, setCustomer] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [certificate, setCertificate] = useState<{ id: string; pdf_url: string | null; cert_number: string | null } | null>(null);
  const [showCertificate, setShowCertificate] = useState(false);
  const [showHazard, setShowHazard] = useState(false);
  const [engineerInfo, setEngineerInfo] = useState<{ name: string; rgi_number: string | null }>({ name: "", rgi_number: null });
  const [loading, setLoading] = useState(true);
  const [whatsappSending, setWhatsappSending] = useState(false);
  const [whatsappSent, setWhatsappSent] = useState(false);
  const [latestPaymentAmount, setLatestPaymentAmount] = useState<number | null>(null);

  useEffect(() => {
    if (user && id) loadData();
  }, [user, id]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("engineers")
      .select("name, rgi_number")
      .eq("auth_user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setEngineerInfo({ name: data.name, rgi_number: (data as any).rgi_number || null });
      });
  }, [user]);

  // Auto-send WhatsApp receipt on page load
  useEffect(() => {
    if (
      job &&
      !job.receipt_sent &&
      job.payment_method !== "invoice" &&
      !whatsappSent &&
      !whatsappSending
    ) {
      handleSendWhatsApp();
    }
  }, [job]);

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data: profileData, error: profileError } = await withRequestTimeout(
        supabase.from("profiles").select("organisation_id").eq("user_id", user!.id).maybeSingle()
      );
      if (profileError) throw profileError;
      const orgId = profileData?.organisation_id;
      // Tenant parity: both K&N and Dublin Gas resolve branding from their own
      // org row, so a missing org must fail loudly rather than render an
      // unbranded receipt.
      if (!orgId) throw new Error("Your account isn't linked to an organisation.");

      const [jobRes, settingsRes] = await withRequestTimeout(
        Promise.all([
          supabase.from("service_calls").select("*").eq("id", id).maybeSingle(),
          supabase.from("settings").select("*").eq("organisation_id", orgId).maybeSingle(),
        ])
      );

      if (jobRes.error) throw jobRes.error;
      if (settingsRes.error) throw settingsRes.error;

      if (!jobRes.data) {
        toast({ title: "Job not found", variant: "destructive" });
        navigate(-1);
        return;
      }

      const [custRes, certRes, paymentRes] = await withRequestTimeout(
        Promise.all([
          supabase.from("customers").select("*").eq("id", jobRes.data.customer_id).maybeSingle(),
          supabase.from("certificates").select("id, pdf_url, cert_number").eq("job_id", id).maybeSingle(),
          supabase
            .from("job_payments")
            .select("amount")
            .eq("service_call_id", id)
            .gt("amount", 0)
            .order("paid_at", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ])
      );

      if (custRes.error) throw custRes.error;
      if (!custRes.data) throw new Error("Customer details for this receipt couldn't be loaded.");

      setJob(jobRes.data);
      setCustomer(custRes.data);
      setSettings(settingsRes.data);
      setCertificate(certRes.data || null);
      setLatestPaymentAmount(paymentRes.data?.amount ?? null);
      if (jobRes.data.receipt_sent) setWhatsappSent(true);
    } catch (err: any) {
      console.error("[ServiceReceipt] load failed:", err);
      setLoadError(
        err?.message === "Request timed out"
          ? "This is taking too long — your connection may be weak."
          : err?.message || "Something went wrong loading this receipt."
      );
    } finally {
      // Always reached, so the spinner can never persist indefinitely.
      setLoading(false);
    }
  };


  const getReceiptData = () => {
    const businessName = settings?.business_name || "";
    const businessPhone = settings?.business_phone || "";
    const serviceDate = job.scheduled_date || new Date().toISOString().split("T")[0];
    const paymentMethodLabel = job.payment_method === "cash" ? "Cash" : job.payment_method === "card" ? "Card" : "Invoice";
    const amountSource = latestPaymentAmount ?? job.revenue ?? job.deposit_amount ?? 120;
    const amount = `€${Number(amountSource).toFixed(2)}`;
    const nextDue = addMonths(serviceDate, 12);

    return {
      receiptNumber: job.receipt_number || "—",
      issueDate: formatDate(new Date().toISOString().split("T")[0]),
      customerName: customer?.name || "—",
      customerAddress: `${customer?.address || ""} ${customer?.eircode || ""}`.trim(),
      serviceType: job.job_type || "Boiler Service",
      serviceDate: formatDate(serviceDate),
      paymentMethod: paymentMethodLabel,
      amountPaid: amount,
      nextServiceDue: nextDue,
      businessName,
      businessPhone,
      businessTagline: "",
      businessAddress: settings?.business_address || undefined,
      rgiNumber: settings?.rgi_number || undefined,
    };
  };

  const generateReceiptPdf = async (): Promise<string | null> => {
    // If we already have a URL, return it
    if (job.receipt_pdf_url) return job.receipt_pdf_url;

    try {
      const { data, error } = await invokeFunction<any>("generate-receipt-pdf", {
        body: latestPaymentAmount ? { job_id: job.id, payment_amount: latestPaymentAmount } : { job_id: job.id },
        signOutOnRefreshFailure: false,
      });
      if (error || !data?.pdf_url) return null;
      // Update local state so we don't re-generate
      setJob((prev: any) => prev ? { ...prev, receipt_pdf_url: data.pdf_url } : prev);
      return data.pdf_url;
    } catch {
      return null;
    }
  };

  const handleDownloadPdf = async () => {
    const path = await generateReceiptPdf();
    const signed = path ? await resolveReceiptUrl(job?.access_token) : null;
    if (signed) {
      openExternalUrl(signed);
    } else {
      toast({ title: "Could not generate receipt PDF", variant: "destructive" });
    }
  };

  const handleSendWhatsApp = async () => {
    console.log("handleSendWhatsApp fired — job.id:", job?.id, "whatsappSending:", whatsappSending, "whatsappSent:", whatsappSent);
    if (whatsappSending || whatsappSent) return;
    if (!job?.id) return;

    setWhatsappSending(true);

    try {
      const { data, error } = await invokeFunction<any>("send-whatsapp-receipt", {
        body: latestPaymentAmount ? { job_id: job.id, payment_amount: latestPaymentAmount } : { job_id: job.id },
        signOutOnRefreshFailure: false,
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "WhatsApp send failed");

      setWhatsappSent(true);
      setJob((prev: any) => prev ? { ...prev, receipt_sent: true, receipt_sent_at: new Date().toISOString() } : prev);
    } catch (err: any) {
      console.error("send-whatsapp-receipt error:", err);
      toast({ title: "WhatsApp send failed — please try again", variant: "destructive" });
    } finally {
      setWhatsappSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!job || !customer) return null;

  const data = getReceiptData();

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
        {/* Receipt card */}
        <div className="bg-background rounded-2xl border border-border shadow-[0_4px_24px_rgba(0,0,0,0.06)] overflow-hidden">
          {/* Business header */}
          <div className="px-5 pt-6 pb-4 text-center">
            <h1 className="text-lg font-extrabold text-foreground">{data.businessName}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{data.businessTagline}</p>
            <p className="text-xs text-muted-foreground">Phone: {data.businessPhone}</p>
            {data.businessAddress && (
              <p className="text-[11px] text-muted-foreground mt-0.5">{data.businessAddress}</p>
            )}
          </div>

          {/* Success indicator */}
          <div className="flex flex-col items-center py-4">
            <div className="w-14 h-14 rounded-full bg-success/10 flex items-center justify-center mb-2">
              <CheckCircle2 className="w-8 h-8 text-success" />
            </div>
            <span className="text-sm font-bold text-success">Payment Successful</span>
          </div>

          {/* Receipt info */}
          <div className="mx-5 border-t border-[hsl(220,13%,91%)]" />
          <div className="px-5 py-3 flex justify-between text-xs">
            <div>
              <span className="text-muted-foreground">Receipt No.</span>
              <span className="ml-1.5 font-bold text-foreground">{data.receiptNumber}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Issued</span>
              <span className="ml-1.5 font-bold text-foreground">{data.issueDate}</span>
            </div>
          </div>
          {job.job_reference && (
            <div className="px-5 pb-3 text-xs">
              <span className="text-muted-foreground">Job Ref</span>
              <span className="ml-1.5 font-bold text-foreground">{job.job_reference}</span>
            </div>
          )}

          {/* Service card */}
          <div className="mx-5 bg-[hsl(220,14%,96%)] rounded-xl p-4 mb-3">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Service</div>
            <div className="flex justify-between items-start">
              <div>
                <div className="text-sm font-bold text-foreground">{data.serviceType}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{data.serviceDate}</div>
              </div>
              <div className="text-lg font-extrabold text-foreground">{data.amountPaid}</div>
            </div>
          </div>

          {/* Customer details */}
          <div className="mx-5 border-t border-[hsl(220,13%,91%)]" />
          <div className="px-5 py-3">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Customer</div>
            <div className="text-sm font-bold text-foreground">{data.customerName}</div>
            <div className="text-xs text-muted-foreground">{data.customerAddress}</div>
          </div>

          {/* Payment details */}
          <div className="mx-5 border-t border-[hsl(220,13%,91%)]" />
          <div className="px-5 py-3">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Payment</div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Method</span>
              <span className="text-sm font-bold text-foreground">{data.paymentMethod}</span>
            </div>
            <div className="flex justify-between items-center mt-2 pt-2 border-t border-[hsl(220,13%,91%)]">
              <span className="text-sm font-bold text-foreground">Total Paid</span>
              <span className="text-xl font-extrabold text-primary">{data.amountPaid}</span>
            </div>
          </div>

          {/* Footer */}
          <div className="mx-5 border-t border-[hsl(220,13%,91%)]" />
          <div className="px-5 py-4 text-center">
            <p className="text-xs text-muted-foreground">
              Thank you for choosing {data.businessName}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Next Boiler Service Due — {data.nextServiceDue}
            </p>
            {data.rgiNumber && (
              <p className="text-[11px] text-muted-foreground mt-1">
                RGI Reg: {data.rgiNumber}
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
            Download PDF Receipt
          </Button>
          <Button
            className={`w-full h-12 text-sm font-extrabold gap-2 ${whatsappSent ? "bg-success hover:bg-success/90 text-white" : "bg-primary hover:bg-primary/90 text-primary-foreground"}`}
            onClick={handleSendWhatsApp}
            disabled={whatsappSending || whatsappSent}
          >
            {whatsappSending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
            ) : whatsappSent ? (
              <><CheckCircle2 className="w-4 h-4" /> Receipt Sent</>
            ) : (
              <><Send className="w-4 h-4" /> Send via WhatsApp</>
            )}
          </Button>
          {certificate?.pdf_url ? (
            <Button asChild className="w-full h-12 text-sm font-extrabold gap-2 text-white bg-success hover:bg-success/90">
              <a href={certificate.pdf_url} target="_blank" rel="noopener noreferrer">
                <Eye className="w-4 h-4" /> View Certificate{certificate.cert_number ? ` — ${certificate.cert_number}` : ""}
              </a>
            </Button>
          ) : (
            <Button
              className="w-full h-12 text-sm font-extrabold gap-2 text-white"
              style={{ backgroundColor: "#1e3a5f" }}
              onClick={() => setShowCertificate(true)}
            >
              <FileText className="w-4 h-4" /> Generate Certificate
            </Button>
           )}
           <Button
             className="w-full h-12 text-sm font-extrabold gap-2 text-white"
             style={{ backgroundColor: "#1e3a5f" }}
             onClick={() => setShowHazard(true)}
           >
             <AlertTriangle className="w-4 h-4" /> Notification of Hazard
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

      {showCertificate && job && customer && (
        <CertificateFlow
          job={job}
          customer={customer}
          engineerName={engineerInfo.name}
          engineerRgi={engineerInfo.rgi_number}
          onClose={() => { setShowCertificate(false); loadData(); }}
        />
      )}
      {showHazard && job && customer && (
        <HazardNotificationFlow
          job={job}
          customer={customer}
          engineerName={engineerInfo.name}
          engineerRgi={engineerInfo.rgi_number}
          onClose={() => { setShowHazard(false); loadData(); }}
        />
      )}
    </div>
  );
};

export default ServiceReceipt;
