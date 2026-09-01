import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "bookedjobs_retry_queue";
const MAX_ATTEMPTS = 3;

export type RetryQueueItem = {
  id: string;
  table: string;
  operation: "update" | "insert";
  payload: Record<string, any>;
  filter?: { column: string; value: string };
  createdAt: number;
  attempts: number;
  /**
   * Id of another queued item this one depends on. The dependent is only
   * replayed once its dependency has succeeded, and is DROPPED if the
   * dependency is dropped. This bounds divergence to one safe direction:
   * a job update can exist without its ledger row, never the reverse.
   */
  dependsOnId?: string;
};

const readQueue = (): RetryQueueItem[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeQueue = (items: RetryQueueItem[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent("retry-queue-changed"));
  } catch (e) {
    console.error("Failed to write retry queue:", e);
  }
};

/** Returns the queued item's id so a caller can chain a dependent item to it. */
export const addToQueue = (
  item: Omit<RetryQueueItem, "id" | "createdAt" | "attempts">,
): string => {
  const queue = readQueue();
  const newItem: RetryQueueItem = {
    ...item,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: Date.now(),
    attempts: 0,
  };
  queue.push(newItem);
  writeQueue(queue);
  return newItem.id;
};


let processing = false;

export const processQueue = async (): Promise<void> => {
  if (processing) return;
  processing = true;
  try {
    const queue = readQueue();
    if (queue.length === 0) return;

    const remaining: RetryQueueItem[] = [];
    // Ids resolved during THIS pass. `deferred` holds items still waiting on a
    // dependency that has not been replayed yet.
    const succeeded = new Set<string>();
    const dropped = new Set<string>();
    const queuedIds = new Set(queue.map((i) => i.id));

    for (const item of queue) {
      if (item.dependsOnId) {
        if (dropped.has(item.dependsOnId)) {
          // The write this row belongs to will never land — drop the dependent
          // too, so a ledger row can never outlive its job update.
          console.error(
            "[retry-queue] dropping dependent of failed item:",
            item,
            item.dependsOnId,
          );
          continue;
        }
        const dependencyStillQueued =
          queuedIds.has(item.dependsOnId) && !succeeded.has(item.dependsOnId);
        if (dependencyStillQueued) {
          // Defer WITHOUT burning an attempt — waiting must not consume budget.
          remaining.push(item);
          continue;
        }
      }

      try {
        let error: any = null;
        // A request that returns no error but changes zero rows was refused by
        // the database — replaying it can never succeed, so it is dropped
        // (never counted as a successful mutation) instead of burning retries.
        let refused = false;
        if (item.operation === "update" && item.filter) {
          const res = await supabase
            .from(item.table as any)
            .update(item.payload as any)
            .eq(item.filter.column, item.filter.value)
            .select("id");
          error = res.error;
          if (!error) {
            const rows = Array.isArray(res.data) ? res.data : res.data ? [res.data] : [];
            refused = rows.length === 0;
          }
        } else if (item.operation === "insert") {
          const res = await supabase.from(item.table as any).insert(item.payload as any);
          error = res.error;
        } else {
          error = new Error("Invalid queue item shape");
        }

        if (refused) {
          dropped.add(item.id);
          console.error("[retry-queue] dropping item — update affected 0 rows:", item);
        } else if (error) {
          const next = { ...item, attempts: item.attempts + 1 };
          if (next.attempts >= MAX_ATTEMPTS) {
            dropped.add(item.id);
            console.error("[retry-queue] dropping item after max attempts:", next, error);
          } else {
            remaining.push(next);
          }
        } else {
          succeeded.add(item.id);
        }
      } catch (e) {
        const next = { ...item, attempts: item.attempts + 1 };
        if (next.attempts >= MAX_ATTEMPTS) {
          dropped.add(item.id);
          console.error("[retry-queue] dropping item after max attempts:", next, e);
        } else {
          remaining.push(next);
        }
      }
    }

    // A dependent left in `remaining` whose dependency was dropped in this same
    // pass (dependency ordered AFTER it in the queue) must not survive either.
    const survivors = remaining.filter((item) => {
      if (item.dependsOnId && dropped.has(item.dependsOnId)) {
        console.error("[retry-queue] dropping dependent of failed item:", item, item.dependsOnId);
        return false;
      }
      return true;
    });
    remaining.length = 0;
    remaining.push(...survivors);

    writeQueue(remaining);
  } finally {
    processing = false;
  }
};

export const useRetryQueue = () => {
  const [queueCount, setQueueCount] = useState<number>(() => readQueue().length);

  useEffect(() => {
    const refresh = () => setQueueCount(readQueue().length);
    window.addEventListener("retry-queue-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("retry-queue-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return { queueCount, addToQueue, processQueue };
};
