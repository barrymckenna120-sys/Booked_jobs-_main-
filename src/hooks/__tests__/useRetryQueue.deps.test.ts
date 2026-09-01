import { describe, it, expect, beforeEach, vi } from "vitest";

// Minimal browser stubs — the queue is localStorage-backed and emits a
// window event on every write. Node's test environment has neither.
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};
(globalThis as any).window = { dispatchEvent: () => true };
(globalThis as any).CustomEvent = class {
  constructor(public type: string) {}
};


// Per-table failure control for the mocked Supabase client.
const failing = new Set<string>();
/** Tables whose UPDATE returns no error but zero rows (row-level filtered). */
const zeroRow = new Set<string>();
const attempted: string[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const result = () => {
        attempted.push(table);
        if (failing.has(table)) return { data: null, error: { message: `boom:${table}` } };
        return { data: zeroRow.has(table) ? [] : [{ id: "row-1" }], error: null };
      };
      return {
        insert: async () => result(),
        update: () => ({ eq: () => ({ select: async () => result() }) }),
      };
    },
  },
}));

import { addToQueue, processQueue } from "@/hooks/useRetryQueue";

const STORAGE_KEY = "bookedjobs_retry_queue";
const queue = () => JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");

const enqueuePair = () => {
  const jobId = addToQueue({
    table: "service_calls",
    operation: "update",
    payload: { payment_status: "paid" },
    filter: { column: "id", value: "job-1" },
  });
  addToQueue({
    table: "job_payments",
    operation: "insert",
    payload: { service_call_id: "job-1", amount: 400 },
    dependsOnId: jobId,
  });
  return jobId;
};

describe("useRetryQueue — dependent item semantics", () => {
  beforeEach(() => {
    localStorage.clear();
    failing.clear();
    attempted.length = 0;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  // Test 8
  it("defers a dependent without burning an attempt while its dependency is queued", async () => {
    failing.add("service_calls");
    enqueuePair();

    await processQueue();

    const items = queue();
    expect(items).toHaveLength(2);
    const ledger = items.find((i: any) => i.table === "job_payments");
    expect(ledger.attempts).toBe(0); // deferred, budget untouched
    expect(attempted).not.toContain("job_payments"); // never sent
    expect(items.find((i: any) => i.table === "service_calls").attempts).toBe(1);
  });

  // Test 9
  it("replays the dependent once its dependency succeeds", async () => {
    failing.add("service_calls");
    enqueuePair();
    await processQueue();
    expect(attempted).not.toContain("job_payments");

    failing.clear(); // connection back
    await processQueue();

    expect(attempted).toContain("service_calls");
    expect(attempted).toContain("job_payments");
    expect(queue()).toHaveLength(0);
  });

  // Test 10 — the critical invariant
  it("drops the dependent when its dependency is dropped after max attempts", async () => {
    failing.add("service_calls");
    enqueuePair();

    await processQueue(); // attempt 1
    await processQueue(); // attempt 2
    await processQueue(); // attempt 3 -> dependency dropped

    expect(queue()).toHaveLength(0); // ledger row dropped with it
    expect(attempted).not.toContain("job_payments"); // never inserted
    expect(attempted.filter((t) => t === "service_calls")).toHaveLength(3);
  });

  // Test 11
  it("leaves items without a dependency behaving exactly as before", async () => {
    addToQueue({
      table: "certificates",
      operation: "insert",
      payload: { cert_number: "C-1" },
    });
    await processQueue();
    expect(attempted).toContain("certificates");
    expect(queue()).toHaveLength(0);

    attempted.length = 0;
    failing.add("certificates");
    addToQueue({ table: "certificates", operation: "insert", payload: { cert_number: "C-2" } });
    await processQueue();
    expect(queue()[0].attempts).toBe(1);
    await processQueue();
    await processQueue();
    expect(queue()).toHaveLength(0); // dropped after 3
    expect(attempted).toHaveLength(3);
  });
});

// BJ-NEW-11 — a queued UPDATE that returns no error but changes zero rows was
// refused by the database. It must never be recorded as a successful mutation.
describe("useRetryQueue — zero-row (refused) updates", () => {
  beforeEach(() => {
    localStorage.clear();
    failing.clear();
    zeroRow.clear();
    attempted.length = 0;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("drops a refused update immediately instead of counting it as success", async () => {
    zeroRow.add("service_calls");
    addToQueue({
      table: "service_calls",
      operation: "update",
      payload: { status: "In Progress" },
      filter: { column: "id", value: "job-1" },
    });

    await processQueue();

    expect(attempted).toEqual(["service_calls"]); // sent exactly once, no retries
    expect(queue()).toHaveLength(0);
  });

  it("drops the dependent ledger row when the job update is refused", async () => {
    zeroRow.add("service_calls");
    enqueuePair();

    await processQueue();

    expect(attempted).not.toContain("job_payments");
    expect(queue()).toHaveLength(0);
  });

  it("still retries genuine transport failures", async () => {
    failing.add("service_calls");
    addToQueue({
      table: "service_calls",
      operation: "update",
      payload: { status: "In Progress" },
      filter: { column: "id", value: "job-1" },
    });

    await processQueue();

    expect(queue()[0].attempts).toBe(1); // queued for another attempt
  });
});
