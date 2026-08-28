import { Button } from "@/components/ui/button";

interface ErrorFallbackProps {
  /** Retries in place without a full page load, when the boundary supports it. */
  onRetry?: () => void;
  /** Where the secondary action sends the user. */
  homePath?: string;
  title?: string;
  description?: string;
}

/**
 * Minimal recovery UI. Used by both the route-level boundaries and the root
 * Sentry boundary so no failure path can end in a blank white screen.
 */
const ErrorFallback = ({
  onRetry,
  homePath = "/dashboard",
  title = "Something went wrong",
  description = "This screen ran into a problem. Your other work is unaffected.",
}: ErrorFallbackProps) => (
  <div
    role="alert"
    className="min-h-[60vh] flex flex-col items-center justify-center gap-3 p-8 text-center"
  >
    <p className="text-lg font-bold text-foreground">{title}</p>
    <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
    <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
      {onRetry && (
        <Button onClick={onRetry}>Try again</Button>
      )}
      <Button
        variant={onRetry ? "outline" : "default"}
        onClick={() => {
          window.location.href = homePath;
        }}
      >
        Go back
      </Button>
    </div>
  </div>
);

export default ErrorFallback;
