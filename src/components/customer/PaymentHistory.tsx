import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, Receipt, Loader2 } from "lucide-react";

type ReceiptJob = {
  id: string;
  receipt_number: string;
  scheduled_date: string | null;
  revenue: number | null;
  payment_method: string | null;
  paid_at: string | null;
  assigned_engineer: string | null;
  receipt_pdf_url: string | null;
};

const PaymentHistory = ({ customerId }: { customerId: string }) => {
  const [jobs, setJobs] = useState<ReceiptJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    const fetchReceipts = async () => {
      const { data } = await supabase
        .from("service_calls")
        .select("id, receipt_number, scheduled_date, revenue, payment_method, paid_at, assigned_engineer, receipt_pdf_url")
        .eq("customer_id", customerId)
        .not("receipt_number", "is", null)
        .order("paid_at", { ascending: false, nullsFirst: false });
      setJobs((data || []) as ReceiptJob[]);
      setLoading(false);
    };
    fetchReceipts();
  }, [customerId]);

  const handleDownload = async (job: ReceiptJob) => {
    setDownloading(job.id);
    try {
      // Use permanent public URL if available
      if (job.receipt_pdf_url) {
        window.open(job.receipt_pdf_url, "_blank");
        setDownloading(null);
        return;
      }

      // Try generating the PDF on-demand
      const { data, error } = await supabase.functions.invoke("generate-receipt-pdf", {
        body: { job_id: job.id },
      });

      if (!error && data?.pdf_url) {
        window.open(data.pdf_url, "_blank");
      } else {
        // Fallback: navigate to receipt page
        window.open(`/receipt/${job.id}`, "_blank");
      }
    } catch {
      window.open(`/receipt/${job.id}`, "_blank");
    }
    setDownloading(null);
  };

  const formatDate = (val: string | null) =>
    val ? new Date(val).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" }) : "—";

  const formatMethod = (m: string | null) => {
    if (!m) return "—";
    return m === "cash" ? "Cash" : m === "card" ? "Card" : m === "invoice" ? "Invoice" : m;
  };

  if (loading) return null;
  if (jobs.length === 0) return null;

  const total = jobs.reduce((sum, j) => sum + (j.revenue || 0), 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">🧾 Payment History</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {jobs.map((j) => (
          <div
            key={j.id}
            className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-muted/30"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Receipt className="w-4 h-4 text-primary shrink-0" />
                <span className="font-bold text-sm">{j.receipt_number}</span>
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
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
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
        ))}
        <div className="pt-3 border-t border-border flex justify-between items-center">
          <span className="text-sm font-semibold">Total paid</span>
          <span className="text-sm font-bold">€{total.toFixed(2)}</span>
        </div>
      </CardContent>
    </Card>
  );
};

export default PaymentHistory;
