import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { printReceipt } from "@/lib/printReceipt";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CreditCard, Banknote, Loader2, CheckCircle2, Send, Download, AlertTriangle,
} from "lucide-react";

interface TakePaymentModalProps {
  open: boolean;
  onClose: () => void;
  job: {
    id: string;
    customer_id: string;
    job_type: string;
    scheduled_date: string | null;
    assigned_engineer: string | null;
    user_id: string;
    receipt_number?: string | null;
    revenue?: number | null;
    deposit_required?: boolean;
    deposit_amount?: number | null;
    deposit_paid?: boolean;
    balance_due?: number | null;
  };
  customer: {
    id: string;
    name: string;
    phone?: string | null;
    address?: string;
    eircode?: string;
  };
  onPaymentComplete?: (receiptNumber: string) => void;
}

const formatDate = (d: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("en-IE", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const addMonths = (d: string, months: number) => {
  const date = new Date(d + "T00:00:00");
  date.setMonth(date.getMonth() + months);
  return date.toLocaleDateString("en-IE", { day: "2-digit", month: "short", year: "numeric" });
};

const TakePaymentModal = ({ open, onClose, job, customer, onPaymentComplete }: TakePaymentModalProps) => {
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [method, setMethod] = useState<"card" | "cash" | null>(null);
  const [amount, setAmount] = useState(job.revenue ? String(job.revenue) : "120");
  const [amountError, setAmountError] = useState("");
  const [settings, setSettings] = useState<any>(null);
  const hasPhone = !!customer.phone?.trim();

  // Processing step state
  const [procStep, setProcStep] = useState(0); // 0=generating, 1=uploading, 2=done
  const [receiptData, setReceiptData] = useState<any>(null);
  const [pdfUrl, setPdfUrl] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");

  useEffect(() => {
    if (open) {
      setStep(1);
      setMethod(null);
      setAmount(job.revenue ? String(job.revenue) : "120");
      setAmountError("");
      setProcStep(0);
      setReceiptData(null);
      setPdfUrl("");
      setReceiptNumber("");
      supabase.from("settings").select("*").limit(1).maybeSingle().then(({ data }) => {
        if (data) setSettings(data);
      });
    }
  }, [open, job.revenue]);

  const validate = () => {
    const val = parseFloat(amount);
    if (!amount.trim() || isNaN(val) || val <= 0) {
      setAmountError("Please enter a valid amount");
      return false;
    }
    setAmountError("");
    return true;
  };

  const handleGenerate = async () => {
    if (!method || !validate()) return;
    setStep(2);
    setProcStep(0);

    try {
      // Step 2a: Generate receipt number
      const { data: rn } = await supabase.rpc("generate_receipt_number", { p_user_id: job.user_id });
      const receiptNum = rn || "KG-000";
      setReceiptNumber(receiptNum);

      const businessName = settings?.business_name || "Karl's Gas";
      const businessPhone = settings?.business_phone || "087 686 252";
      const businessAddress = settings?.business_address || "";
      const serviceDate = job.scheduled_date || new Date().toISOString().split("T")[0];
      const paymentLabel = method === "cash" ? "Cash" : "Card";
      const amountStr = `€${parseFloat(amount).toFixed(2)}`;
      const nextDue = addMonths(serviceDate, 12);

      const rd = {
        receiptNumber: receiptNum,
        issueDate: formatDate(new Date().toISOString().split("T")[0]),
        customerName: customer.name,
        customerAddress: `${customer.address || ""} ${customer.eircode || ""}`.trim(),
        serviceType: job.job_type || "Boiler Service",
        serviceDate: formatDate(serviceDate),
        paymentMethod: paymentLabel,
        amountPaid: amountStr,
        nextServiceDue: nextDue,
        businessName,
        businessPhone,
        businessTagline: "Professional Gas & Boiler Services",
        businessAddress,
        engineerName: job.assigned_engineer || "—",
      };
      setReceiptData(rd);
      setProcStep(1);
      setProcStep(2);

      // Save to service_calls
      await supabase.from("service_calls").update({
        receipt_number: receiptNum,
        revenue: parseFloat(amount),
        payment_method: method,
        paid_at: new Date().toISOString(),
      } as any).eq("id", job.id);

      // Auto advance
      setTimeout(() => setStep(3), 600);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setStep(1);
    }
  };

  const handleWhatsApp = () => {
    if (!customer.phone || !receiptData) return;
    const phone = customer.phone.replace(/[^0-9]/g, "");
    const msg = encodeURIComponent(
      `Hi ${customer.name},\n\nThank you for choosing ${receiptData.businessName}. Here is your payment receipt:\n\n` +
      `📋 Receipt: ${receiptData.receiptNumber}\n🔧 Service: ${receiptData.serviceType}\n` +
      `💰 Amount: ${receiptData.amountPaid}\n📅 Date: ${receiptData.serviceDate}\n👷 Engineer: ${receiptData.engineerName}\n\n` +
      `📄 Download: ${pdfUrl}\n\nNext service due: ${receiptData.nextServiceDue}`
    );
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
  };

  const handleDownload = () => {
    if (receiptData) printReceipt(receiptData);
  };

  const handleClose = () => {
    if (receiptNumber) onPaymentComplete?.(receiptNumber);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-[440px] rounded-2xl p-0 overflow-hidden">
        {/* Step 1: Payment Details */}
        {step === 1 && (
          <div className="p-6 space-y-5">
            <DialogHeader>
              <DialogTitle className="text-lg font-extrabold text-[hsl(222,47%,11%)]">
                Take Payment
              </DialogTitle>
            </DialogHeader>

            {/* Job info */}
            <div className="bg-[hsl(220,14%,96%)] rounded-xl p-4 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-[hsl(220,9%,46%)]">Customer</span>
                <span className="font-bold text-[hsl(222,47%,11%)]">{customer.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[hsl(220,9%,46%)]">Service</span>
                <span className="font-bold text-[hsl(222,47%,11%)]">{job.job_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[hsl(220,9%,46%)]">Date</span>
                <span className="font-bold text-[hsl(222,47%,11%)]">{formatDate(job.scheduled_date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[hsl(220,9%,46%)]">Engineer</span>
                <span className="font-bold text-[hsl(222,47%,11%)]">{job.assigned_engineer || "—"}</span>
              </div>
            </div>

            {/* Payment method */}
            <div>
              <p className="text-xs font-bold text-[hsl(220,9%,46%)] uppercase tracking-wider mb-2">Payment Method</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: "card" as const, label: "Card", icon: CreditCard },
                  { value: "cash" as const, label: "Cash", icon: Banknote },
                ].map((m) => {
                  const Icon = m.icon;
                  const selected = method === m.value;
                  return (
                    <button
                      key={m.value}
                      onClick={() => setMethod(m.value)}
                      className={`flex flex-col items-center justify-center gap-2 p-5 rounded-xl border-2 transition-all ${
                        selected
                          ? "border-[hsl(217,91%,60%)] bg-[hsl(217,91%,60%)]/5 ring-1 ring-[hsl(217,91%,60%)]/20"
                          : "border-[hsl(220,13%,91%)] hover:border-[hsl(217,91%,60%)]/30"
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                        selected ? "bg-[hsl(217,91%,60%)] text-white" : "bg-[hsl(220,14%,96%)] text-[hsl(220,9%,46%)]"
                      }`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <span className={`text-sm font-bold ${selected ? "text-[hsl(217,91%,60%)]" : "text-[hsl(222,47%,11%)]"}`}>
                        {m.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Amount */}
            <div>
              <p className="text-xs font-bold text-[hsl(220,9%,46%)] uppercase tracking-wider mb-2">Amount</p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-bold text-[hsl(222,47%,11%)]">€</span>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setAmountError(""); }}
                  className="pl-8 h-12 text-lg font-bold"
                  min="0"
                  step="0.01"
                />
              </div>
              {amountError && (
                <p className="text-sm text-destructive mt-1 font-semibold">{amountError}</p>
              )}
            </div>

            {/* Phone warning */}
            {!hasPhone && (
              <div className="flex items-start gap-2 rounded-lg p-3 bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 font-medium">
                  No customer phone number on file — receipt can be downloaded but cannot be sent via WhatsApp.
                </p>
              </div>
            )}

            <Button
              className="w-full h-12 text-sm font-extrabold gap-2 bg-[hsl(217,91%,60%)] hover:bg-[hsl(217,91%,50%)] text-white"
              disabled={!method}
              onClick={handleGenerate}
            >
              Generate & Send Receipt
            </Button>
          </div>
        )}

        {/* Step 2: Processing */}
        {step === 2 && (
          <div className="p-6 space-y-6">
            <DialogHeader>
              <DialogTitle className="text-lg font-extrabold text-[hsl(222,47%,11%)]">Processing...</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {[
                { label: "Generating receipt", done: procStep >= 1 },
                { label: "Saving payment record", done: procStep >= 2 },
                { label: "Receipt ready", done: procStep >= 2 },
              ].map((s, i) => (
                <div key={i} className="flex items-center gap-3">
                  {s.done ? (
                    <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
                  ) : (
                    <Loader2 className="w-5 h-5 animate-spin text-[hsl(217,91%,60%)] shrink-0" />
                  )}
                  <span className={`text-sm font-semibold ${s.done ? "text-success" : "text-[hsl(222,47%,11%)]"}`}>
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Receipt Preview */}
        {step === 3 && receiptData && (
          <div className="p-6 space-y-5">
            <DialogHeader>
              <DialogTitle className="text-lg font-extrabold text-[hsl(222,47%,11%)]">Receipt Ready</DialogTitle>
            </DialogHeader>

            <div className="bg-[hsl(220,14%,96%)] rounded-xl p-5 space-y-3">
              <div className="text-center mb-3">
                <h3 className="text-base font-extrabold text-[hsl(222,47%,11%)]">{receiptData.businessName}</h3>
                <p className="text-xs text-[hsl(220,9%,46%)]">{receiptData.businessTagline}</p>
                <p className="text-xs text-[hsl(220,9%,46%)]">Phone: {receiptData.businessPhone}</p>
              </div>
              <div className="border-t border-[hsl(220,13%,91%)]" />
              <div className="space-y-1.5 text-sm">
                {[
                  ["Receipt No.", receiptData.receiptNumber],
                  ["Issue Date", receiptData.issueDate],
                  ["Customer", receiptData.customerName],
                  ["Address", receiptData.customerAddress],
                  ["Service", receiptData.serviceType],
                  ["Service Date", receiptData.serviceDate],
                  ["Engineer", receiptData.engineerName],
                  ["Payment", receiptData.paymentMethod],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-[hsl(220,9%,46%)]">{k}</span>
                    <span className="font-bold text-[hsl(222,47%,11%)] text-right max-w-[60%]">{v}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-[hsl(220,13%,91%)] pt-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-[hsl(222,47%,11%)]">Total Paid</span>
                  <span className="text-xl font-extrabold text-[hsl(217,91%,60%)]">{receiptData.amountPaid}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2.5">
              <Button
                className="w-full h-12 text-sm font-extrabold gap-2 bg-[hsl(217,91%,60%)] hover:bg-[hsl(217,91%,50%)] text-white"
                disabled={!hasPhone}
                onClick={handleWhatsApp}
                title={!hasPhone ? "No phone number on file" : undefined}
              >
                <Send className="w-4 h-4" /> Send via WhatsApp
              </Button>
              <Button
                variant="outline"
                className="w-full h-12 text-sm font-bold gap-2"
                onClick={handleDownload}
              >
                <Download className="w-4 h-4" /> Download PDF
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default TakePaymentModal;
