import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { printReceipt } from "@/lib/printReceipt";
import { CheckCircle2, Download, CalendarPlus, Loader2, Send, FileText, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import CertificateFlow from "@/components/engineer/CertificateFlow";


const formatDate = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-IE", { day: "2-digit", month: "short", year: "numeric" });

const addMonths = (d: string, months: number) => {
  const date = new Date(d + "T00:00:00");
  date.setMonth(date.getMonth() + months);
  return date.toLocaleDateString("en-IE", { day: "2-digit", month: "short", year: "numeric" });
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
  const [engineerInfo, setEngineerInfo] = useState<{ name: string; rgi_number: string | null }>({ name: "", rgi_number: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && id) loadData();
  }, [user, id]);


  const loadData = async () => {
    setLoading(true);
    const [jobRes, settingsRes] = await Promise.all([
      supabase.from("service_calls").select("*").eq("id", id).maybeSingle(),
      supabase.from("settings").select("*").limit(1).maybeSingle(),
    ]);

    if (!jobRes.data) {
      toast({ title: "Job not found", variant: "destructive" });
      navigate(-1);
      return;
    }

    const custRes = await supabase.from("customers").select("*").eq("id", jobRes.data.customer_id).maybeSingle();

    setJob(jobRes.data);
    setCustomer(custRes.data);
    setSettings(settingsRes.data);
    setLoading(false);
  };

  const getReceiptData = () => {
    const businessName = settings?.business_name || "Karl's Gas";
    const businessPhone = settings?.business_phone || "087 686 252";
    const serviceDate = job.scheduled_date || new Date().toISOString().split("T")[0];
    const paymentMethodLabel = job.payment_method === "cash" ? "Cash" : job.payment_method === "card" ? "Card" : "Invoice";
    const amount = job.revenue ? `€${Number(job.revenue).toFixed(2)}` : job.deposit_amount ? `€${Number(job.deposit_amount).toFixed(2)}` : "€120.00";
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
      businessTagline: "Professional Gas & Boiler Services",
    };
  };

  const handleDownloadPdf = () => {
    const data = getReceiptData();
    printReceipt(data);
  };

  const formatPhoneForWhatsApp = (phone: string): string => {
    let cleaned = phone.replace(/[\s\-()]/g, "");
    if (cleaned.startsWith("0")) cleaned = "353" + cleaned.slice(1);
    if (!cleaned.startsWith("+") && !cleaned.startsWith("353")) cleaned = "353" + cleaned;
    return cleaned.replace("+", "");
  };

  const handleSendWhatsApp = async () => {
    const phone = customer?.phone?.trim();
    if (!phone) {
      toast({
        title: "No phone number on file for this customer — receipt cannot be sent via WhatsApp.",
        variant: "destructive",
        className: "bg-amber-500 text-white border-amber-600",
      });
      return;
    }

    const data = getReceiptData();
    const formattedPhone = formatPhoneForWhatsApp(phone);
    const messageText = `Hi ${data.customerName}, here is your receipt from ${data.businessName} for your boiler service on ${data.serviceDate}. Receipt No: ${data.receiptNumber}. Amount Paid: ${data.amountPaid}. Paid by: ${data.paymentMethod}. Thank you for choosing ${data.businessName}.`;

    // Log to message_log
    const { data: logRow } = await supabase.from("message_log").insert({
      customer_id: customer?.id || null,
      message_type: "receipt",
      channel: "whatsapp",
      direction: "outbound",
      content: messageText,
      status: "sent",
      related_id: id,
      related_type: "job",
      sent_by: user?.id || "system",
      sent_at: new Date().toISOString(),
    } as any).select("id").single();

    const message = encodeURIComponent(messageText);
    window.open(`https://wa.me/${formattedPhone}?text=${message}`, "_blank");

    // Mark receipt as sent
    await supabase
      .from("service_calls")
      .update({ receipt_sent: true, receipt_sent_at: new Date().toISOString() } as any)
      .eq("id", id);

    toast({ title: "Receipt sent via WhatsApp" });
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
        {/* Receipt card */}
        <div className="bg-background rounded-2xl border border-border shadow-[0_4px_24px_rgba(0,0,0,0.06)] overflow-hidden">
          {/* Business header */}
          <div className="px-5 pt-6 pb-4 text-center">
            <h1 className="text-lg font-extrabold text-foreground">{data.businessName}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{data.businessTagline}</p>
            <p className="text-xs text-muted-foreground">Phone: {data.businessPhone}</p>
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
            className="w-full h-12 text-sm font-extrabold gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={handleSendWhatsApp}
          >
            <Send className="w-4 h-4" />
            Send via WhatsApp
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

export default ServiceReceipt;
