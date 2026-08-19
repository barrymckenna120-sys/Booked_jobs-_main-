# SumUp checkout attempt status write-back — actual diff (Steps 2 + 3)

Tests already pass on the current code: `deno test _shared/sumupWebhook.test.ts _shared/sumupCheckout.test.ts` → **67 passed | 0 failed (158ms)**. They will be re-run after the diff is applied.

Confirmations you asked for:

1. **Status vocabulary** — the written value is `status`, computed in `_shared/sumupWebhook.ts` as `(view.status ?? "").toUpperCase()` straight from SumUp's authoritative `GET /v0.1/checkouts/{id}`. So only `PAID` / `SUCCESSFUL` / `SUCCEEDED` (paid path) or `FAILED` / `EXPIRED` / `CANCELLED` / `CANCELED` (terminal path) reach the column. The handler's internal `outcome` (`paid`, `part_paid`, `duplicate`) is never written.
2. **409 / 23505 detection** — HTTP status code plus PostgREST's parsed JSON `code` field, no text matching: `if (res.status === 409 || code === "23505")`.

## Diff

### `supabase/functions/_shared/sumupWebhook.ts`

```diff
@@ -162,12 +162,16 @@
   /** One office notification per confirmed payment. */
 
   notifyOffice?: (entry: {
     organisationId: string | null;
     serviceCallId: string;
     customerId: string | null;
     jobReference: string | null;
     amount: number;
     fullyPaid: boolean;
+    /** SumUp's own checkout id and uppercased status, for attempt write-back. */
+    checkoutId: string;
+    status: string;
   }) => Promise<void>;
@@ -525,10 +529,12 @@
   if (deps.notifyOffice) {
     await deps.notifyOffice({
       organisationId: job.organisation_id,
       serviceCallId: job.id,
       customerId: job.customer_id ?? null,
       jobReference: job.job_reference ?? null,
       amount,
       fullyPaid,
+      checkoutId,
+      status,
     });
   }
```

### `supabase/functions/sumup-payment-webhook/index.ts`

```diff
@@ -54,6 +54,36 @@
   const supabase = createClient(
     Deno.env.get("SUPABASE_URL")!,
     Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
   );
 
+  const supabaseUrl = Deno.env.get("SUPABASE_URL")!.replace(/\/+$/, "");
+  const headers: Record<string, string> = {
+    apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
+    Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
+  };
+
+  /**
+   * Stamps the resolved SumUp status onto the attempt row(s) for this checkout.
+   * Audit only — it must never throw or delay the webhook response, so every
+   * failure is logged and swallowed (same pattern as the log writes below).
+   */
+  const recordAttemptStatus = async (checkoutId: string, resolvedStatus: string) => {
+    try {
+      await fetch(
+        `${supabaseUrl}/rest/v1/payment_checkout_attempts?checkout_id=eq.${encodeURIComponent(checkoutId)}`,
+        {
+          method: "PATCH",
+          headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
+          body: JSON.stringify({ status: resolvedStatus, updated_at: new Date().toISOString() }),
+        },
+      );
+    } catch (e) {
+      console.error("payment_checkout_attempts status write-back failed", e);
+    }
+  };
+
```

```diff
@@ notifyOffice: async (e) => {  (after the notifications insert)
         await supabase.from("notifications").insert(
           recipients.map((userId) => ({ ... })),
         );
 
+        await recordAttemptStatus(e.checkoutId, e.status);
+
       } catch (_e) {
         console.error("sumup-payment-webhook: notification insert failed", _e);
       }
```

```diff
@@ notifyPaymentFailed: async (e) => {  (first statement, before the dedupe read)
     notifyPaymentFailed: async (e) => {
       try {
         if (!e.organisationId) return;
 
+        // Terminal status is final for this checkout — record it even if the
+        // alert itself is deduped away below.
+        await recordAttemptStatus(e.checkoutId, e.status);
+
         // SumUp delivers the same failure event more than once. One alert per
```

### `supabase/functions/_shared/sumupCheckout.ts`

```diff
@@ -102,15 +102,29 @@
     async record(row) {
       const res = await doFetch(`${base}/rest/v1/payment_checkout_attempts`, {
         method: "POST",
         headers: { ...headers, "Content-Type": "application/json" },
         body: JSON.stringify({
           service_call_id: row.serviceCallId,
           organisation_id: row.organisationId,
           checkout_id: row.checkoutId,
           checkout_reference: row.checkoutReference,
           status: row.status,
         }),
       });
-      await res.text();
+      const text = await res.text();
+      if (res.ok) return;
+
+      // A unique violation on checkout_id means the attempt is already on
+      // record — that is the correct end state, not a failure. Same
+      // 23505-as-success reasoning as notifications_payment_failed_once.
+      let code: string | undefined;
+      try {
+        code = JSON.parse(text)?.code;
+      } catch { /* non-JSON error body */ }
+      if (res.status === 409 || code === "23505") {
+        console.warn(`sumup-checkout: attempt row already exists for ${row.checkoutId} — ignoring duplicate`);
+        return;
+      }
+      // Any other failure is logged, never thrown: tracking must not be able
+      // to fail a live checkout.
+      console.error(`sumup-checkout: attempt record http ${res.status} for ${row.checkoutId}`);
     },
```

## After approval
Apply exactly this diff, re-run both Deno test files and show the output. **No deploy** until you say so.
