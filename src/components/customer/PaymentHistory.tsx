import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, Receipt, Loader2, Copy } from "lucide-react";
import { resolveReceiptUrl } from "@/lib/resolveReceiptUrl";
import { buildReceiptText, copyTextToClipboard } from "@/lib/receiptText";
import { useToast } from "@/hooks/use-toast";

type ReceiptJob = {
  id: string;
  receipt_number: string;
  scheduled_date: string | null;
  revenue: number | null;
  payment_method: string | null;
  paid_at: string | null;
  assigned_engineer: string | null;
  receipt_pdf_url: string | null;
  access_token: string | null;
};

interface Props {
  customerId: string;
  customerName?: string;
  onCountReady?: (count: number) => void;
}

const PaymentHistory = ({ customerId, customerName, onCountReady }: Props) => {
  const [jobs, setJobs] = useState<ReceiptJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [copying, setCopying] = useState<string | null>(null);
  const { toast } = useToast();


  useEffect(() => {
    const fetchReceipts = async () => {
      const { data } = await supabase
        .from("service_calls")
        .select("id, receipt_number, scheduled_date, revenue, payment_method, paid_at, assigned_engineer, receipt_pdf_url, access_token")
        .eq("customer_id", customerId)
        .not("receipt_number", "is", null)
        .order("paid_at", { ascending: false, nullsFirst: false });
      const result = (data || []) as ReceiptJob[];
      setJobs(result);
      onCountReady?.(result.length);
      setLoading(false);
    };
    fetchReceipts();
  }, [customerId]);

  // iOS/PWA-safe external open: window.open is blocked in standalone mode.
  const openExternalUrl = (url: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleDownload = async (job: ReceiptJob) => {
    setDownloading(job.id);
    const openFallback = () => openExternalUrl(`/receipt-view/${job.id}`);
    try {
      if (job.receipt_pdf_url) {
        const signed = await resolveReceiptUrl(job.access_token);
        if (signed) openExternalUrl(signed);
        else openFallback();
        setDownloading(null);
        return;
      }
      const { data, error } = await supabase.functions.invoke("generate-receipt-pdf", {
        body: { job_id: job.id },
      });
      if (!error && data?.pdf_url) {
        const signed = await resolveReceiptUrl(job.access_token);
        if (signed) openExternalUrl(signed);
        else openFallback();
      } else {
        toast({
          title: "Couldn't open receipt",
          description: "The receipt PDF isn't available yet. Showing the on-screen receipt instead.",
        });
        openFallback();
      }
    } catch {
      toast({
        title: "Couldn't open receipt",
        description: "Showing the on-screen receipt instead.",
      });
      openFallback();
    }
    setDownloading(null);
  };


  const handleCopy = async (job: ReceiptJob) => {
    const text = buildReceiptText({ ...job, customerName });
    if (!text) {
      toast({ title: "No receipt to copy", description: "This payment has no receipt yet.", variant: "destructive" });
      return;
    }
    setCopying(job.id);
    const ok = await copyTextToClipboard(text);
    setCopying(null);
    toast(
      ok
        ? { title: "Receipt copied", description: `${job.receipt_number} copied to clipboard.` }
        : { title: "Couldn't copy", description: "Clipboard access was blocked. Try again or download the receipt.", variant: "destructive" },
    );
  };



  const formatDate = (val: string | null) =>
    val ? new Date(val).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" }) : "—";

  const formatMethod = (m: string | null) => {
    if (!m) return "—";
    return m === "cash" ? "Cash" : m === "card" ? "Card" : m === "invoice" ? "Invoice" : m;
  };

  if (loading) return null;
  if (jobs.length === 0) return <p className="text-sm text-muted-foreground text-center py-4">No payment history yet.</p>;

  const total = jobs.reduce((sum, j) => sum + (j.revenue || 0), 0);

  return (
    <div className="space-y-3">
      {jobs.map((j) => (
        <div
          key={j.id}
          className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-muted/30"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Receipt className="w-4 h-4 text-primary shrink-0" />
              <button
                type="button"
                onClick={() => handleDownload(j)}
                disabled={downloading === j.id}
                aria-label={`Open receipt ${j.receipt_number}`}
                className="font-bold text-sm text-primary underline underline-offset-2 hover:opacity-80 disabled:opacity-60 min-h-[44px] -my-2 py-2 text-left"
              >
                {j.receipt_number}
              </button>
              <Badge variant="secondary" className="text-xs">
                {formatMethod(j.payment_method)}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3">
              <span>{formatDate(j.scheduled_date)}</span>
              {j.assigned_engineer && <span>{j.assigned_engineer}</span>}
              <span className="font-semibold text-foreground">
                €{(j.revenue || 0).toFixed(2)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              aria-label="Copy customer receipt"
              disabled={copying === j.id}
              onClick={() => handleCopy(j)}
            >
              {copying === j.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              aria-label="Download receipt"
              disabled={downloading === j.id}
              onClick={() => handleDownload(j)}
            >
              {downloading === j.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
            </Button>
          </div>

        </div>
      ))}
      <div className="pt-3 border-t border-border flex justify-between items-center">
        <span className="text-sm font-semibold">Total paid</span>
        <span className="text-sm font-bold">€{total.toFixed(2)}</span>
      </div>
    </div>
  );
};

export default PaymentHistory;
