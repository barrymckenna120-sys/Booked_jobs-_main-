# Add opt-out checks to 9 customer-facing WhatsApp Edge Functions

## Current state

`_shared/optOut.ts` already provides a pure `evaluateOptOut()` helper and a `fetchOptOutDecision()` REST fetcher. It is used today by:

- `send-upcoming-reminders` — uses `evaluateOptOut()` on the joined `customers` row and skips opted-out customers before any send.
- `send-warranty-whatsapp` — fetches `customers.organisation_id, opted_out, phone` and uses `evaluateOptOut()`, returning `{ skipped: true, reason: "customer_opted_out" }` when opted out.

Of the 9 functions below, **none currently check `customers.opted_out`** before sending a WhatsApp message.

## Proposed changes

Add an opt-out guard to every function before the 360Messenger API call. The guard pattern depends on whether the customer row is already loaded:

- If the customer is already fetched, add `opted_out` to the select and use `evaluateOptOut()`.
- If the customer is not loaded, fetch or use `fetchOptOutDecision()` by `customer_id`.

All functions already return a 200/400/404 on missing data, so the guard should return a 200 `skipped` response (or log a silent skip) to avoid callers treating an opt-out as a failure.

### 1. `send-payment-link` (payment link / balance due)

Current customer fetch:

```ts
const { data: customer } = await supabase
  .from("customers")
  .select("name, phone")
  .eq("id", job.customer_id)
  .single();
```

Proposed diff:

```diff
- .select("name, phone")
+ .select("name, phone, opted_out")

  if (!customer?.phone) {
    ...
  }

+ // Respect opt-out before sending a payment reminder.
+ import { evaluateOptOut } from "../_shared/optOut.ts"; // add at top
+ const optOut = evaluateOptOut(customer);
+ if (optOut.skip) {
+   return new Response(JSON.stringify({ success: true, skipped: true, reason: optOut.reason }), {
+     status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
+   });
+ }
```

### 2. `create-job-invoice` (invoice + WhatsApp)

Current customer fetch:

```ts
const { data: job, error: jErr } = await sb
  .from("service_calls")
  .select("*, customers!inner(name, phone, email, address, eircode)")
  .eq("id", job_id)
  .single();
```

Proposed diff:

```diff
- .select("*, customers!inner(name, phone, email, address, eircode)")
+ .select("*, customers!inner(name, phone, email, address, eircode, opted_out)")

+ import { evaluateOptOut } from "../_shared/optOut.ts"; // add at top
+
  const cust = (job as any).customers;
+ const optOut = evaluateOptOut(cust);
+ if (optOut.skip) {
+   return new Response(JSON.stringify({
+     success: true,
+     invoice_id: invoice.id,
+     invoice_number: invNum,
+     pdf_url: pdfUrl,
+     whatsapp_sent: false,
+     skipped: true,
+     reason: optOut.reason,
+   }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
+ }
```

### 3. `send-reschedule-notification`

Current customer fetch:

```ts
const custRes = await fetch(`${supabaseUrl}/rest/v1/customers?id=eq.${job.customer_id}&select=name,phone`, {
  headers: dbHeaders,
});
```

Proposed diff:

```diff
- &select=name,phone
+ &select=name,phone,opted_out

+ import { evaluateOptOut } from "../_shared/optOut.ts"; // add at top
+
  const customer = Array.isArray(custRows) ? custRows[0] : null;
+ const optOut = evaluateOptOut(customer);
+ if (optOut.skip) {
+   return new Response(JSON.stringify({ success: true, skipped: true, reason: optOut.reason }), {
+     status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
+   });
+ }
```

### 4. `cancel-job-notify`

This function already joins `customers(name, phone)` on the service call, so `opted_out` is available without an extra fetch.

Proposed diff:

```diff
  const { data: sc, error: scErr } = await supabase
    .from("service_calls")
-   .select("id, user_id, customer_id, organisation_id, customers(name, phone)")
+   .select("id, user_id, customer_id, organisation_id, customers(name, phone, opted_out)")
    .eq("id", service_call_id)
    .maybeSingle();

+ import { evaluateOptOut } from "../_shared/optOut.ts"; // add at top
+
  const customer: any = (sc as any).customers;
+ const optOut = evaluateOptOut(customer);
+ if (optOut.skip) {
+   return new Response(JSON.stringify({ success: true, skipped: true, reason: optOut.reason }), {
+     status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
+   });
+ }
```

### 5. `send-quote-whatsapp`

This function reads the quote but does not fetch the customer row. The customer ID is available as `resolvedCustomerId` (from the quote or request body). Use `fetchOptOutDecision()`.

Proposed diff:

```diff
+ import { fetchOptOutDecision } from "../_shared/optOut.ts"; // add at top
+
  const resolvedCustomerId = ...;
+ if (resolvedCustomerId) {
+   const optOut = await fetchOptOutDecision(supabaseUrl!, supabaseKey!, resolvedCustomerId);
+   if (optOut.skip) {
+     return new Response(JSON.stringify({ success: true, skipped: true, reason: optOut.reason }), {
+       status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
+     });
+   }
+ }
```

### 6. `send-certificate-whatsapp`

Current customer fetch:

```ts
const custRes = await fetch(
  `${supabaseUrl}/rest/v1/customers?id=eq.${cert.customer_id}&select=name,phone`,
  { headers }
);
```

Proposed diff:

```diff
- &select=name,phone
+ &select=name,phone,opted_out

+ import { evaluateOptOut } from "../_shared/optOut.ts"; // add at top
+
  const customer = Array.isArray(custs) ? custs[0] : null;
+ const optOut = evaluateOptOut(customer);
+ if (optOut.skip) {
+   return new Response(JSON.stringify({ success: true, skipped: true, reason: optOut.reason }), {
+     status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
+   });
+ }
```

### 7. `send-hazard-whatsapp`

Current customer fetch:

```ts
const custRes = await fetch(
  `${supabaseUrl}/rest/v1/customers?id=eq.${hazard.customer_id}&select=name,phone`,
  { headers }
);
```

Proposed diff:

```diff
- &select=name,phone
+ &select=name,phone,opted_out

+ import { evaluateOptOut } from "../_shared/optOut.ts"; // add at top
+
  const customer = Array.isArray(custs) ? custs[0] : null;
+ const optOut = evaluateOptOut(customer);
+ if (optOut.skip) {
+   return new Response(JSON.stringify({ success: true, skipped: true, reason: optOut.reason }), {
+     status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
+   });
+ }
```

### 8. `send-part-arrived`

This function does not fetch the customer row; it receives `customer_name` and `customer_phone` in the body and has `jobRow.customer_id`. Add a fetch for `opted_out` or use `fetchOptOutDecision()`.

Proposed diff (using `fetchOptOutDecision` with the available `customer_id`):

```diff
+ import { fetchOptOutDecision } from "../_shared/optOut.ts"; // add at top
+
  const jobRow = ...;
+ if (jobRow?.customer_id) {
+   const optOut = await fetchOptOutDecision(supabaseUrl!, supabaseKey!, jobRow.customer_id);
+   if (optOut.skip) {
+     return new Response(JSON.stringify({ success: true, skipped: true, reason: optOut.reason }), {
+       status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
+     });
+   }
+ }
```

### 9. `send-whatsapp-receipt`

Current customer fetch:

```ts
const { data: customer } = await supabase
  .from("customers")
  .select("name, phone")
  .eq("id", job.customer_id)
  .single();
```

Proposed diff:

```diff
- .select("name, phone")
+ .select("name, phone, opted_out")

+ import { evaluateOptOut } from "../_shared/optOut.ts"; // add at top
+
+ const optOut = evaluateOptOut(customer);
+ if (optOut.skip) {
+   return new Response(JSON.stringify({ success: true, skipped: true, reason: optOut.reason }), {
+     status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
+   });
+ }
```

## Transactional vs outreach note

Per the existing comment in `_shared/optOut.ts`, the helper is intended for "automated (non-transactional)" sends. The list above mixes both:

- **Outreach / reminder-style**: `send-reschedule-notification`, `send-part-arrived`.
- **Transactional / requested**: `send-payment-link`, `create-job-invoice`, `send-quote-whatsapp`, `send-certificate-whatsapp`, `send-hazard-whatsapp`, `send-whatsapp-receipt`, `cancel-job-notify`.

The proposed diff gates **all 9** at the same point. If the business prefers to keep true transactional sends ungated, we can limit the change to only `send-reschedule-notification` and `send-part-arrived`. Confirm before implementation.

## Testing plan

1. Add a unit test for `evaluateOptOut()` covering `customer_opted_out`, `no_phone_number`, and `customer_not_found`.
2. For each modified function, verify via direct `curl` to a sandbox org that:
   - A customer with `opted_out = true` returns `skipped: true` and no `message_log` row is created.
   - A customer with `opted_out = false` or `NULL` sends normally.
3. Run existing Edge Function test suite to ensure no field-name regressions in `message_log` inserts.
