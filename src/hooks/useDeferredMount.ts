import { useEffect, useState } from "react";

/**
 * Step 4 — Calm the Network.
 *
 * Returns false until the browser is idle (or the fallback delay elapses), so
 * secondary panels mount — and therefore fetch — only after the core screen has
 * painted. On weak 4G this stops analytics requests competing with today's
 * schedule for the handful of available connections.
 */
export function useDeferredMount(fallbackDelayMs = 400): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const mark = () => {
      if (!cancelled) setReady(true);
    };

    const idle = (window as any).requestIdleCallback as
      | ((cb: () => void, opts?: { timeout: number }) => number)
      | undefined;

    if (typeof idle === "function") {
      const handle = idle(mark, { timeout: fallbackDelayMs * 3 });
      return () => {
        cancelled = true;
        (window as any).cancelIdleCallback?.(handle);
      };
    }

    const timer = setTimeout(mark, fallbackDelayMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fallbackDelayMs]);

  return ready;
}
