import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { printReceipt } from "@/lib/printReceipt";
import { sanitizeServiceCallUpdatePayload } from "@/lib/serviceCallUpdate";
import { resolvePaymentSheetState } from "@/lib/paymentSheetAmount";
import { gateJobPayment, isJobAlreadyPaidError } from "@/lib/paymentPreWriteGate";
import JobFullyPaidPanel from "@/components/payments/JobFullyPaidPanel";
import { buildPaymentPatch } from "@/lib/paymentUpdate";
import { priorCollected } from "@/lib/priorCollected";
import { invokeFunction } from "@/lib/invokeFunction";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CreditCard, Banknote, FileText, Loader2, CheckCircle2, Send, Download, AlertTriangle,
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
  const navigate = useNavigate();
  // Single shared classifier (same helper the engineer PaymentSheet uses).
  // Case D = deposit required, not yet paid → collect the deposit
  // Case A = deposit paid, balance remains  → collect the balance
  // Case B = nothing owing                  → block further collection
  // Case C = no deposit                     → collect the full job total
  const paymentState = resolvePaymentSheetState(job);
  const isFullyPaid = paymentState.case === "B";
  const hasDeposit = paymentState.case === "A" || paymentState.case === "D";
  const jobTotal = paymentState.jobTotal;
  const depositAmount = paymentState.depositAmount;
  const isDepositPaid = paymentState.depositPaid;
  const collectingDeposit = paymentState.case === "D";
  const balanceDue = paymentState.amount ?? 0;
  const defaultAmount = paymentState.amount !== undefined
    ? String(paymentState.amount)
    : (job.revenue ? String(job.revenue) : "120");

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [method, setMethod] = useState<"card" | "cash" | "invoice" | null>(null);
  const [amount, setAmount] = useState(defaultAmount);
  const [amountError, setAmountError] = useState("");
  const [settings, setSettings] = useState<any>(null);
  /** Pre-write gate refused: the job is already settled (local copy was stale). */
  const [gateBlocked, setGateBlocked] = useState(false);
  const hasPhone = !!customer.phone?.trim();

  // Processing step state
  const [procStep, setProcStep] = useState(0); // 0=generating, 1=uploading, 2=done
  const [receiptData, setReceiptData] = useState<any>(null);
  const [pdfUrl, setPdfUrl] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [whatsappSending, setWhatsappSending] = useState(false);
  const [whatsappSent, setWhatsappSent] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(1);
      setMethod(null);
      setAmount(defaultAmount);
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
    // Guard, not just hidden UI: never record a payment on a settled job.
    if (isFullyPaid) {
      toast({ title: "Already paid", description: "This job is fully paid — no further payment can be collected." });
      return;
    }
    if (!method || !validate()) return;

    // Invoice flow — save payment record, then navigate to invoice preview
    if (method === "invoice") {
      setStep(2);
      setProcStep(0);
      try {
        const revenueAmt = parseFloat(amount) || 0;
        const orgId = (job as any).organisation_id;
        const { nextInvoiceNumber } = await import("@/lib/nextInvoiceNumber");
        const invoiceNum = await nextInvoiceNumber(orgId);
        const updatePayload: Record<string, any> = {
          payment_method: "invoice",
          invoiced_at: new Date().toISOString(),
          status: "Completed",
          completed_at: new Date().toISOString(),
          ...buildPaymentPatch({
            type: "invoice",
            amount: revenueAmt,
            revenue: Number(job.revenue || 0),
            collectedToDate: hasDeposit && isDepositPaid ? Number(job.deposit_amount || 0) : 0,
            revenueMode: "fill",
          }),

        };
        if (invoiceNum) updatePayload.invoice_number = invoiceNum;
        await supabase.from("service_calls").update(sanitizeServiceCallUpdatePayload(updatePayload as any)).eq("id", job.id);
        setProcStep(2);

        // Navigate to invoice preview screen
        setTimeout(() => {
          onPaymentComplete?.("");
          onClose();
          navigate(`/invoice-view/${job.id}`);
        }, 600);
      } catch (e: any) {
        toast({ title: "Error", description: e.message, variant: "destructive" });
        setStep(1);
      }
      return;
    }

    // Cash / Card flow — generate receipt
    setStep(2);
    setProcStep(0);

    try {
      // Authoritative pre-write gate (BJ-next-D). organisation_id is never taken
      // from the caller's prop: the ledger insert runs as `authenticated` against
      // job_payments_insert (WITH CHECK organisation_id = get_my_org_id()), and
      // revenue/balance_due/status must be the values as they are *before* this
      // payment is applied. A settled job throws JobAlreadyPaidError.
      let gate;
      try {
        gate = await gateJobPayment(supabase, job.id);
      } catch (e) {
        if (isJobAlreadyPaidError(e)) {
          setGateBlocked(true);
          setStep(1);
          return;
        }
        throw e;
      }
      const scRow = gate.row as any;
      const orgId = scRow.organisation_id as string;
      // Classification comes from the fresh row, not the (possibly stale) prop.
      const freshCase = gate.state.case;
      const freshCollectingDeposit = freshCase === "D";
      const freshHasDeposit = freshCase === "A" || freshCase === "D";

      // recorded_by / created_by, resolved once regardless of paid or partial.
      const { data: { user: authUser } } = await supabase.auth.getUser();
      const { data: profile } = authUser
        ? await supabase.from("profiles").select("id").eq("user_id", authUser.id).maybeSingle()
        : { data: null };

      const { data: settingsRow } = await supabase
        .from("settings")
        .select("cert_prefix")
        .eq("organisation_id", orgId)
        .maybeSingle();
      const prefix = ((settingsRow as any)?.cert_prefix || "").trim() || "R";
      const yr = new Date().getFullYear();
      const rand = String(Math.floor(Math.random() * 9999) + 1).padStart(4, "0");
      const receiptNum = `${prefix}-${yr}-${rand}`;
      setReceiptNumber(receiptNum);

      const businessName = settings?.business_name || "";
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

      // One timestamp for the job row and the ledger row so they agree exactly.
      const paidAtIso = new Date().toISOString();
      const paidAmount = parseFloat(amount) || 0;
      // Cumulative: everything already collected on this job, not just the
      // deposit. Read pre-write. See src/lib/priorCollected.ts.
      const alreadyCollected = freshCollectingDeposit
        ? 0
        : priorCollected(scRow.revenue, scRow.balance_due);
      const paymentType = freshCollectingDeposit ? "deposit" : freshHasDeposit ? "balance" : "full";


      const updatePayload: Record<string, any> = {
        receipt_number: receiptNum,
        payment_method: method,
        paid_at: paidAtIso,
        ...buildPaymentPatch({
          // Deposit collection stays partial; anything else settles the job.
          type: paymentType,
          amount: paidAmount,
          revenue: Number((scRow as any).revenue || 0),
          collectedToDate: alreadyCollected,
        }),

      };

      // BJ-0061a: settle-and-complete, but only where the work is known done.
      // Three of the four entry points into this modal gate the button on
      // In Progress / Completed; the engineer outstanding-balances ledger does
      // not and can reach Booked jobs, which must not be auto-completed here.
      const priorStatus = String((scRow as any).status || "").toLowerCase();
      const workDone = priorStatus === "in progress" || priorStatus === "completed";
      if (updatePayload.payment_status === "paid" && workDone) {
        updatePayload.status = "Completed";
        updatePayload.completed_at = paidAtIso;
      }

      const { error: updateError } = await supabase
        .from("service_calls")
        .update(sanitizeServiceCallUpdatePayload(updatePayload as any))
        .eq("id", job.id);
      // Nothing downstream may run on a failed write — no activity row, no
      // ledger row, no PDF, no WhatsApp, no navigation to the receipt.
      if (updateError) throw updateError;

      // Append-only payment ledger. Payment is already recorded on the job, so
      // a failure here is loud but non-blocking.
      try {
        const { error: ledgerError } = await supabase.from("job_payments").insert({
          organisation_id: orgId,
          service_call_id: job.id,
          customer_id: (scRow as any).customer_id,
          amount: paidAmount,
          payment_type: paymentType,
          method,
          source: "office_modal",
          checkout_id: null,
          recorded_by: profile?.id || null,
          paid_at: paidAtIso,
          metadata: { receipt_number: receiptNum },
        } as any);
        if (ledgerError) throw ledgerError;
      } catch (e: any) {
        console.error("LEDGER_INSERT_FAILED job_payments:", e);
        toast({
          title: "Payment recorded, but not added to the payment ledger",
          description: e?.message || "Please let the office know so it can be reconciled.",
          variant: "destructive",
        });
      }

      // Log payment_received activity when fully paid
      if (updatePayload.payment_status === "paid") {
        try {
          const methodLabel = method === "cash" ? "Cash" : "Card";
          const activityAmount = Number(paidAmount).toLocaleString("en-IE", { maximumFractionDigits: 0 });
          await supabase.from("customer_activity").insert({
            organisation_id: orgId,
            customer_id: (scRow as any).customer_id,
            service_call_id: job.id,
            event_type: "payment_received",
            event_label: `Payment received — €${activityAmount} — ${methodLabel}`,
            created_by: profile?.id || null,
          } as any);
        } catch (e) {
          console.error("Failed to log payment activity:", e);
        }
      }

      // Generate receipt PDF so it's ready for WhatsApp. Routed through
      // invokeFunction so a stale session is refreshed and retried once, and a
      // real failure is visible instead of vanishing silently.
      invokeFunction("generate-receipt-pdf", { body: { job_id: job.id, payment_amount: paidAmount }, signOutOnRefreshFailure: false })
        .then(({ error }) => {
          if (error) throw error;
        })
        .catch((err) => {
          console.error("generate-receipt-pdf error:", err);
          toast({
            title: "Receipt PDF not generated",
            description: "Payment was recorded. Tap Download on the receipt screen to retry.",
            variant: "destructive",
          });
        });

      // Send WhatsApp payment-received confirmation
      if (updatePayload.payment_status === "paid") {
        invokeFunction("send-payment-received", { body: { service_call_id: job.id, payment_amount: paidAmount }, signOutOnRefreshFailure: false })
          .then(({ error }) => {
            if (error) throw error;
          })
          .catch((err) => {
            console.error("send-payment-received error:", err);
            toast({
              title: "Payment confirmation not sent",
              description: "Payment was recorded, but the customer wasn't notified.",
              variant: "destructive",
            });
          });
      }

      // Navigate to receipt preview screen
      setTimeout(() => {
        onPaymentComplete?.(receiptNum);
        onClose();
        navigate(`/receipt-view/${job.id}`);
      }, 600);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setStep(1);
    }
  };



  const handleWhatsApp = async () => {
    if (!job?.id || whatsappSending || whatsappSent) return;
    setWhatsappSending(true);
    try {
      const paidAmount = Number.parseFloat(amount);
      const body = Number.isFinite(paidAmount) && paidAmount > 0
        ? { job_id: job.id, payment_amount: paidAmount }
        : { job_id: job.id };
      const { data, error } = await invokeFunction<any>("send-whatsapp-receipt", {
        body,
        signOutOnRefreshFailure: false,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "WhatsApp send failed");

      setWhatsappSent(true);
    } catch (err: any) {
      console.error("send-whatsapp-receipt error:", err);
      toast({ title: "WhatsApp send failed — please try again", variant: "destructive" });
    } finally {
      setWhatsappSending(false);
    }
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

            {isFullyPaid ? (
              <>
                <div className="rounded-xl p-4 space-y-1.5 text-sm bg-[hsl(142,71%,45%)]/10 border border-[hsl(142,71%,45%)]/25">
                  <div className="flex items-center gap-2 font-extrabold text-[hsl(142,71%,30%)]">
                    <CheckCircle2 className="w-4 h-4" /> This job is fully paid
                  </div>
                  <p className="text-xs text-[hsl(220,9%,46%)] font-medium">
                    No further payment can be collected for this job.
                  </p>
                  {(jobTotal > 0 || depositAmount > 0) && (
                    <div className="flex justify-between pt-1.5">
                      <span className="text-[hsl(220,9%,46%)]">Amount already collected</span>
                      <span className="font-extrabold text-[hsl(222,47%,11%)]">
                        €{(jobTotal > 0 ? jobTotal : depositAmount).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
                <Button
                  variant="secondary"
                  className="w-full h-12 text-sm font-extrabold"
                  onClick={onClose}
                >
                  Close
                </Button>
              </>
            ) : (
              <>
            {/* Deposit summary for deposit jobs */}
            {hasDeposit && (
              <div className="bg-[hsl(220,14%,96%)] rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[hsl(220,9%,46%)]">Job Total</span>
                  <span className="font-bold text-[hsl(222,47%,11%)]">€{jobTotal.toFixed(2)}</span>
                </div>
                {isDepositPaid ? (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-[hsl(220,9%,46%)]">Deposit Paid</span>
                      <span className="font-bold text-[hsl(142,71%,35%)]">−€{depositAmount.toFixed(2)} ✅</span>
                    </div>
                    <div className="border-t border-[hsl(220,13%,91%)] pt-2 flex justify-between items-center">
                      <span className="font-bold text-[hsl(222,47%,11%)]">Balance Due</span>
                      <span className="text-lg font-extrabold text-[hsl(35,92%,50%)]">€{balanceDue.toFixed(2)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-[hsl(220,9%,46%)]">Deposit Required</span>
                      <span className="font-bold text-[hsl(35,92%,50%)]">€{depositAmount.toFixed(2)}</span>
                    </div>
                    <div className="border-t border-[hsl(220,13%,91%)] pt-2 flex justify-between items-center">
                      <span className="font-bold text-[hsl(222,47%,11%)]">Collect Now</span>
                      <span className="text-lg font-extrabold text-[hsl(35,92%,50%)]">€{depositAmount.toFixed(2)}</span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Payment method */}
            <div>
              <p className="text-xs font-bold text-[hsl(220,9%,46%)] uppercase tracking-wider mb-2">Payment Method</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: "card" as const, label: "Card", icon: CreditCard },
                  { value: "cash" as const, label: "Cash", icon: Banknote },
                  { value: "invoice" as const, label: "Invoice", icon: FileText },
                ].map((m) => {
                  const Icon = m.icon;
                  const selected = method === m.value;
                  return (
                    <button
                      key={m.value}
                      onClick={() => setMethod(m.value)}
                      className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all ${
                        selected
                          ? "border-[hsl(217,91%,60%)] bg-[hsl(217,91%,60%)]/5 ring-1 ring-[hsl(217,91%,60%)]/20"
                          : "border-[hsl(220,13%,91%)] hover:border-[hsl(217,91%,60%)]/30"
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        selected ? "bg-[hsl(217,91%,60%)] text-white" : "bg-[hsl(220,14%,96%)] text-[hsl(220,9%,46%)]"
                      }`}>
                        <Icon className="w-5 h-5" />
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
              <p className="text-xs font-bold text-[hsl(220,9%,46%)] uppercase tracking-wider mb-2">
                {paymentState.case === "A" ? "Balance Due" : paymentState.case === "D" ? "Collect Deposit" : "Amount"}
              </p>
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
              {method === "invoice" ? "Send Payment Link" : "Generate & Send Receipt"}
            </Button>
              </>
            )}
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
                className={`w-full h-12 text-sm font-extrabold gap-2 ${whatsappSent ? "bg-success hover:bg-success text-white" : "bg-[hsl(217,91%,60%)] hover:bg-[hsl(217,91%,50%)] text-white"}`}
                disabled={!hasPhone || whatsappSending || whatsappSent}
                onClick={handleWhatsApp}
                title={!hasPhone ? "No phone number on file" : undefined}
              >
                {whatsappSending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : whatsappSent ? <><CheckCircle2 className="w-4 h-4" /> Receipt Sent</> : <><Send className="w-4 h-4" /> Send via WhatsApp</>}
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
