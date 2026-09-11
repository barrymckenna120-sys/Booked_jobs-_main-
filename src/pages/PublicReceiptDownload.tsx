import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RequestTimeoutError, withRequestTimeout } from "@/lib/queryDefaults";
import {
  downloadReceiptPdf,
  fetchReceiptPdf,
  receiptPdfFilename,
} from "@/lib/receiptPdfStream";

type Failure = "offline" | "timeout" | "unavailable";

const PublicReceiptDownload = () => {
  const { receiptNumber } = useParams<{ receiptNumber: string }>();
  const navigate = useNavigate();
  const [failure, setFailure] = useState<Failure | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [downloaded, setDownloaded] = useState<Blob | null>(null);

  const download = useCallback(async () => {
    setFailure(null);
    setDownloaded(null);
    if (!navigator.onLine) {
      setFailure("offline");
      return;
    }
    if (!receiptNumber) {
      setFailure("unavailable");
      return;
    }
    try {
      const pdf = await withRequestTimeout(fetchReceiptPdf({ receipt_number: receiptNumber }));
      if (downloadReceiptPdf(pdf, receiptPdfFilename(receiptNumber))) {
        setDownloaded(pdf);
      }
    } catch (error) {
      setFailure(error instanceof RequestTimeoutError ? "timeout" : navigator.onLine ? "unavailable" : "offline");
    }
  }, [receiptNumber, attempt]);

  useEffect(() => {
    void download();
  }, [download]);

  const close = () => {
    window.close();
    window.setTimeout(() => navigate(-1), 100);
  };

  const message = failure === "offline"
    ? "You're offline. Reconnect and try again."
    : failure === "timeout"
      ? "The receipt is taking too long to open. Check your signal and try again."
      : "This receipt PDF isn't available.";

  return (
    <main className="min-h-screen bg-background px-4 flex items-center justify-center">
      <section className="w-full max-w-sm text-center">
        {failure ? (
          <>
            <AlertTriangle className="mx-auto h-9 w-9 text-destructive" aria-hidden="true" />
            <h1 className="mt-4 text-lg font-bold text-foreground">Couldn&apos;t open receipt</h1>
            <p className="mt-2 text-sm text-muted-foreground">{message}</p>
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

export default PublicReceiptDownload;
