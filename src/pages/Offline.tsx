import { useCallback } from "react";
import { WifiOff, RefreshCw } from "lucide-react";

const Offline = () => {
  const handleRetry = useCallback(() => {
    window.location.reload();
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground px-6">
      <div className="flex flex-col items-center gap-6 max-w-sm text-center">
        <img
          src="/icons/icon-192.png"
          alt="BookedJobs"
          className="w-16 h-16 rounded-xl shadow-md"
        />
        <div className="flex flex-col items-center gap-2">
          <WifiOff className="w-10 h-10 text-muted-foreground" strokeWidth={1.5} />
          <h1 className="text-xl font-semibold tracking-tight">
            You're offline
          </h1>
          <p className="text-sm text-muted-foreground">
            Please check your connection and try again.
          </p>
        </div>
        <button
          onClick={handleRetry}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-[0.98] transition-transform"
        >
          <RefreshCw className="w-4 h-4" />
          Try again
        </button>
      </div>
    </div>
  );
};

export default Offline;
