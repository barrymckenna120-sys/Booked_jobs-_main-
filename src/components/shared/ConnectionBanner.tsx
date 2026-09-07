import { WifiOff } from "lucide-react";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

/**
 * Step 3 — connectivity awareness for the office app.
 *
 * Presentation only. All detection logic comes from the existing, tested
 * useNetworkStatus hook (active probe + two-failure rule), so this never
 * trusts navigator.onLine on its own — which lies on weak mobile signal.
 */
const ConnectionBanner = ({ message }: { message?: string }) => {
  // 30s active poll — matches the interval the engineer app already used.
  const { isOnline } = useNetworkStatus(30_000);

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full bg-[hsl(var(--warning))] text-white px-4 py-2 flex items-center justify-center gap-2 text-xs font-bold shadow-sm"
    >
      <WifiOff className="w-4 h-4 flex-shrink-0" />
      <span>{message ?? "No connection — changes won't save until you're back online"}</span>
    </div>
  );
};

export default ConnectionBanner;
