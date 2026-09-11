import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { invokeFunction } from "@/lib/invokeFunction";
import { RequestTimeoutError, withRequestTimeout } from "@/lib/queryDefaults";
import {
  downloadReceiptPdf,
  fetchReceiptPdf,
  receiptPdfFilename,
  ReceiptPdfStreamError,
} from "@/lib/receiptPdfStream";

type DownloadFailure = "offline" | "timeout" | "generate" | "resolve" | "forbidden";

const failureCopy: Record<DownloadFailure, string> = {
  offline: "You're offline. Reconnect and try again.",
  timeout: "The receipt is taking too long to open. Check your signal and try again.",
  generate: "The receipt PDF couldn't be prepared. Please try again.",
  resolve: "The receipt PDF couldn't be opened. Please try again.",
  forbidden: "This receipt is unavailable or you don't have access to it.",
};

const ReceiptDownload = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");
  const amountParam = searchParams.get("amount");
  const paymentAmount = amountParam === null ? null : Number(amountParam);
  const [failure, setFailure] = useState<DownloadFailure | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [downloaded, setDownloaded] = useState<Blob | null>(null);

  const download = useCallback(async () => {
    setFailure(null);
    setDownloaded(null);
    if (!navigator.onLine) {
      setFailure("offline");
      return;
    }
    if (!id || !token) {
      setFailure("resolve");
      return;
    }

    try {
      const { data, error } = await withRequestTimeout(
        invokeFunction<{ pdf_url?: string }>("generate-receipt-pdf", {
          body: Number.isFinite(paymentAmount) && Number(paymentAmount) > 0
            ? { job_id: id, payment_amount: paymentAmount }
            : { job_id: id },
          signOutOnRefreshFailure: false,
        }),
      );
      if (error || !data?.pdf_url) {
        setFailure("generate");
        return;
      }

      const pdf = await withRequestTimeout(fetchReceiptPdf({ job_id: id, token }));
      if (downloadReceiptPdf(pdf, receiptPdfFilename(data.pdf_url))) {
        setDownloaded(pdf);
      }
    } catch (error) {
      setFailure(
        error instanceof RequestTimeoutError
          ? "timeout"
          : error instanceof ReceiptPdfStreamError && (error.status === 401 || error.status === 403 || error.status === 404)
            ? "forbidden"
            : navigator.onLine
              ? "resolve"
              : "offline",
      );
    }
  }, [id, token, paymentAmount, attempt]);

  useEffect(() => {
    void download();
  }, [download]);

  const close = () => {
    window.close();
    window.setTimeout(() => navigate(-1), 100);
  };

  return (
    <main className="min-h-screen bg-background px-4 flex items-center justify-center">
      <section className="w-full max-w-sm text-center">
        {failure ? (
          <>
            <AlertTriangle className="mx-auto h-9 w-9 text-destructive" aria-hidden="true" />
            <h1 className="mt-4 text-lg font-bold text-foreground">Couldn&apos;t open receipt</h1>
            <p className="mt-2 text-sm text-muted-foreground">{failureCopy[failure]}</p>
            <div className="mt-6 space-y-2">
              <Button className="min-h-[44px] w-full gap-2" onClick={() => setAttempt((value) => value + 1)}>
                <RefreshCw className="h-4 w-4" /> Try Again
              </Button>
              <Button variant="outline" className="min-h-[44px] w-full gap-2" onClick={close}>
                <X className="h-4 w-4" /> Close
              </Button>
            </div>
          </>
        ) : downloaded ? (
          <>
            <CheckCircle2 className="mx-auto h-9 w-9 text-primary" aria-hidden="true" />
            <h1 className="mt-4 text-lg font-bold text-foreground">Receipt downloaded</h1>
            <p className="mt-2 text-sm text-muted-foreground">Check your downloads for the PDF receipt.</p>
            <div className="mt-6 space-y-2">
              <Button variant="outline" className="min-h-[44px] w-full gap-2" onClick={close}>
                <X className="h-4 w-4" /> Close
              </Button>
            </div>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-9 w-9 animate-spin text-primary" aria-hidden="true" />
            <h1 className="mt-4 text-lg font-bold text-foreground">Downloading receipt…</h1>
            <p className="mt-2 text-sm text-muted-foreground">This may take a moment on a weak connection.</p>
          </>
        )}
      </section>
    </main>
  );
};

export default ReceiptDownload;
