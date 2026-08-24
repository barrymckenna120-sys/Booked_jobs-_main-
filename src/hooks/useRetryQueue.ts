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
    for (const item of queue) {
      try {
        let error: any = null;
        if (item.operation === "update" && item.filter) {
          const res = await supabase
            .from(item.table as any)
            .update(item.payload as any)
            .eq(item.filter.column, item.filter.value);
          error = res.error;
        } else if (item.operation === "insert") {
          const res = await supabase.from(item.table as any).insert(item.payload as any);
          error = res.error;
        } else {
          error = new Error("Invalid queue item shape");
        }

        if (error) {
          const next = { ...item, attempts: item.attempts + 1 };
          if (next.attempts >= MAX_ATTEMPTS) {
            console.error("[retry-queue] dropping item after max attempts:", next, error);
          } else {
            remaining.push(next);
          }
        }
      } catch (e) {
        const next = { ...item, attempts: item.attempts + 1 };
        if (next.attempts >= MAX_ATTEMPTS) {
          console.error("[retry-queue] dropping item after max attempts:", next, e);
        } else {
          remaining.push(next);
        }
      }
    }
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
