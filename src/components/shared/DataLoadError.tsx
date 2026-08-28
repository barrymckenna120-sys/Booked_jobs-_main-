import { AlertTriangle, Loader2, RefreshCw, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DataLoadErrorProps {
  /** Human-readable reason. Falls back to a generic line when omitted. */
  message?: string | null;
  onRetry: () => void;
  onBack?: () => void;
  retrying?: boolean;
  title?: string;
}

/**
 * Step 4 — Calm the Network.
 *
 * Terminal state for a screen whose data request failed or timed out. This is a
 * recoverable data error inside a working screen (not a crash), so it lives in
 * the screen rather than in the Step 3 error-boundary fallback.
 */
const DataLoadError = ({
  message,
  onRetry,
  onBack,
  retrying = false,
  title = "Couldn't load this page",
}: DataLoadErrorProps) => (
  <div className="min-h-screen flex items-center justify-center px-6">
    <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center space-y-4">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-amber-500/10">
        <AlertTriangle className="h-5 w-5 text-amber-600" />
      </div>
      <div className="space-y-1">
        <h1 className="text-base font-semibold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {message || "Something went wrong. Check your signal and try again."}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Button onClick={onRetry} disabled={retrying} className="w-full">
          {retrying ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          {retrying ? "Retrying…" : "Retry"}
        </Button>
        {onBack && (
          <Button variant="ghost" onClick={onBack} className="w-full">
            <ArrowLeft className="mr-2 h-4 w-4" /> Go back
          </Button>
        )}
      </div>
    </div>
  </div>
);

export default DataLoadError;
