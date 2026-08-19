# Fix `send-payment-link` message_log insert

## What this does
Adds the required `organisation_id` to the `message_log` insert in `supabase/functions/send-payment-link/index.ts` and logs any insert error instead of silently proceeding.

## Diff

File: `supabase/functions/send-payment-link/index.ts`

```diff
     // Log to message_log
-    const { data: logRows } = await supabase.from("message_log").insert({
+    const { data: logRows, error: logError } = await supabase.from("message_log").insert({
       channel: "whatsapp",
       message_type: "payment_link",
       customer_id: job.customer_id,
+      organisation_id: job.organisation_id,
       related_id: service_call_id,
       related_type: "service_call",
       content: message,
       sent_by: "system",
       status: "pending",
       direction: "outbound",
     }).select("id");
 
     const logId = Array.isArray(logRows) ? logRows[0]?.id : null;
+
+    if (logError) {
+      console.error("send-payment-link: failed to insert message_log", {
+        error: logError.message,
+        service_call_id,
+        organisation_id: job.organisation_id,
+      });
+    }
```

## Verification after approval
1. Apply the diff.
2. Run Deno tests for affected shared modules (if any are impacted).
3. Run the project's typecheck / unit test suite.
4. Deploy only after you confirm the results look good.

## Notes
- No other logic changes.
- The parent SumUp/WhatsApp send continues even if logging fails (log-and-continue discipline).
