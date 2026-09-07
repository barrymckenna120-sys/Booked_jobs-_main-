import { WifiOff } from "lucide-react";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

/**
 * Step 3 — connectivity awareness for the office app.
 *
 * Presentation only. All detection logic comes from the existing, tested
 * useNetworkStatus hook (active probe + two-failure rule), so this never
 * trusts navigator.onLine on its own — which lies on weak mobile signal.
 *
 * `offline` is an optional controlled override: a layout that also needs to
 * react to the offline state (e.g. to offset a fixed sidebar) owns the hook
 * itself and passes the result down, so only one probe ever runs.
 */
const ConnectionBanner = ({
  message,
  offline,
}: {
  message?: string;
  offline?: boolean;
}) => {
  const controlled = offline !== undefined;
  // 30s active poll — matches the interval the engineer app already used.
  // Skipped entirely when a parent supplies the state.
  const { isOnline } = useNetworkStatus(controlled ? 0 : 30_000);

  const isOffline = controlled ? offline : !isOnline;
  if (!isOffline) return null;

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
