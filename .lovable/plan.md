# Fix "Send Message" on Ready to Fit parts cards (KN-143)

## What I traced

### 1. Which function the button calls

`src/components/dashboard/PartsPanel.tsx` (Parts panel card, `handleSendMessage`):

```ts
const { error } = await supabase.functions.invoke("send-part-arrived", {
  body: {
    job_id: part.service_call_id,
    customer_name: nameOf(part),
    customer_phone: phone,
    follow_up_detail: part.description || part.service_calls?.follow_up_detail || "",
  },
});
```

The same function is called from `src/components/jobs/PartsArrivedModal.tsx` (adds `message`) and `src/components/dashboard/FollowUpsPanel.tsx`.

### 2. The function's validation logic

`supabase/functions/send-part-arrived/index.ts` has exactly three failure gates before the send:

- L16: `!job_id || !customer_name || !customer_phone` -> 400 `"Missing required fields"`
- L41: job row has no `organisation_id` -> 400 `"Service call missing organisation_id"`
- L55: no WhatsApp key resolved -> 400 `"WhatsApp integration not configured for this organisation"`

The key lookup is L49-54:

```ts
`...tenant_integrations?organisation_id=eq.${orgId}&integration_type=eq.360messenger&select=config&limit=1`
const apiKey = (Array.isArray(tiRows) && tiRows[0]?.config?.api_key) || null;
```

The function never returns 422 on any path. It reads only `config.api_key` from the `360messenger` row and has no `api_key_secret` -> `Deno.env.get(...)` resolution step.

### 3. Actual payload and actual response for KN-143

Job `KN-143` = `b679707a-714d-4435-aeb7-fd883793f985`, org `8c37827f-...`, customer `4196d73b-...` ("barry test 11"). Its parts request `76530f9c-...` is status `Ready to Fit`, description `flue`.

Payload sent:

```json
{
  "job_id": "b679707a-714d-4435-aeb7-fd883793f985",
  "customer_name": "barry test 11",
  "customer_phone": "+353892109224",
  "follow_up_detail": "flue"
}
```

Actual response (live call against the deployed function):

```
status 400
{"success":false,"error":"WhatsApp integration not configured for this organisation"}
```

So the real status is **400**, not 422 — supabase-js surfaces any non-2xx as a generic `FunctionsHttpError` in the toast, which is why the status shown in the UI is not the function's status. Nothing is written to `message_log` on this path because the failure happens before the insert.

### 4. Phone format

Stored: `customers.phone = "+353892109224"` (`whatsapp_phone` is null). The function does `customer_phone.replace(/^\+/, "")` -> `353892109224`, which matches the 360 Messenger convention. Historic `edge_function_logs` rows for this same customer show `360Messenger HTTP 201: success` with `phonenumber: 353892109224`. **Phone format is not the problem.**

### 5. Credential resolution — the actual root cause

K&N has two overlapping rows in `tenant_integrations`:

- `integration_type = 'whatsapp'` — holds a literal `config.api_key` plus the `kn_gas_*` template map
- `integration_type = '360messenger'` — holds `api_key_secret: "THREESIXTY_API_KEY"`, `country_code: 353`, and **no `api_key`**

The function queries the `360messenger` row and expects a literal `api_key`, so it resolves `null` and bails with the 400.

`THREESIXTY_API_KEY` **is a real configured secret** (confirmed in project secrets, alongside `THREESIXTY_API_KEY_DUBLIN_GAS`). This is not the Dublin Gas / Cavan Gas placeholder pattern — the pointer is valid, the function just never dereferences it.

## The fix

Bring `send-part-arrived` in line with the other org-aware senders:

1. Resolve the WhatsApp credential in this order and use the first hit:
   - `360messenger` row: `config.api_key_secret` -> `Deno.env.get(secretName)`
   - `360messenger` row: literal `config.api_key` (back-compat for orgs stored that way)
   - `whatsapp` row: literal `config.api_key`
2. Keep the existing 400 when nothing resolves, but make the error message name which step failed (missing row, missing pointer, or secret not present in env) so the next failure is diagnosable from the toast/logs.
3. Log the resolution outcome (secret name used, never the value) to `edge_function_logs`.
4. Leave the phone handling, message body, `message_log` and `customer_activity` writes unchanged.

## Verification

- Re-run the exact KN-143 payload against the deployed function and paste the real response body; expect `success: true` with a `360Messenger HTTP 201` row in `edge_function_logs`.
- Confirm a `message_log` row for customer `4196d73b-...` flips `pending` -> `sent`.
- Negative check: call with an org that has no WhatsApp row and confirm the 400 with the new, specific message.
- Regression check: Parts panel card, `PartsArrivedModal`, and Follow-ups panel all still send (they share the function).

## Note on the credential rows

Longer term, K&N having both a `whatsapp` and a `360messenger` row is what caused this drift — different functions read different rows. Consolidating them is a separate change; this plan only makes `send-part-arrived` tolerant of both, and touches no RLS, schema, or table data.
