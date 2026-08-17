# B3a — Remove K&N branding fallback from the deposit-request path

Diff proposal only. Nothing implemented.

## The problem

`supabase/functions/_shared/depositLink.ts` (lines 178–179) seeds branding with K&N's own name and phone before reading the tenant's config:

```ts
let companyName = "K & N Gas Services";
let companyPhone = "087 3686252";
```

If a tenant's `tenant_integrations.360messenger.config` has a blank `company_name` or `company_phone`, that tenant's deposit request goes out signed with K&N's details. This is the live money path used by both `accept-quote` and `send-deposit-link`, so it is the same severity class as the B1 invoice fix.

## Live exposure today

| Organisation | company_name | company_phone | Exposed? |
| --- | --- | --- | --- |
| K & N Gas Services | K & N Gas Services | 087 3686252 | No (its own details) |
| Dublin Gas | Dublin Gas | 014412618 | No |
| Webliveview Ltd | Webliveview Ltd | 0872354257 | No |
| Cavan Gas | Cavan Gas | *(empty)* | **Yes — would send "Cavan Gas ☎ 087 3686252"** |
| wexford gas (x2) | *(no 360messenger row)* | *(none)* | Yes on both fields, though these orgs stop later at the missing WhatsApp key |

So the leak is real and currently reachable for Cavan Gas: name is correct, phone would silently become K&N's mobile in the message footer.

No message has leaked yet — `message_log` has zero `payment_link` rows containing `087 3686252` for any organisation other than K&N.

## Proposed diff (Option B — guard before any SumUp call)

**1. Remove both hardcoded fallbacks.**

**2. Move the branding read up** to sit immediately after the `no_phone` guard, so the guard order becomes:

```text
no_deposit_amount → no_service_call → no_organisation
  → opted_out → no_phone
  → company_name_not_configured / company_phone_not_configured   [moved here]
  → no_sumup_credentials → createSumUpDepositCheckout(...)
```

A misconfigured tenant now returns before SumUp is touched, so no checkout row and no `payment_checkout_attempts` row is ever created for it.

```ts
const tiRes = await fetch(
  `${supabaseUrl}/rest/v1/tenant_integrations?organisation_id=eq.${orgId}&integration_type=eq.360messenger&select=config&limit=1`,
  { headers },
);
const tiRows = await tiRes.json();
const cfg = Array.isArray(tiRows) ? tiRows[0]?.config : null;
const companyName = String(cfg?.company_name ?? "").trim();
const companyPhone = String(cfg?.company_phone ?? "").trim();

const missingConfig = !companyName
  ? "company_name_not_configured"
  : !companyPhone
    ? "company_phone_not_configured"
    : null;

if (missingConfig) {
  // edge_function_logs row (function_name: "deposit-link")
  // message_log row: message_type "payment_link", status "failed",
  //   content "Skipped: <reason>", related_id = serviceCallId
  return { ok: true, skipped: missingConfig };
}
```

The skip returns without a `paymentLink`, because none exists yet — both callers already treat `skipped` as HTTP 200 `{ success: false, skipped: true, reason }`.

**3. Reason codes** — reuse the exact strings already used in `send-payment-received`, `send-deposit-reminder`, `send-area-bulk-whatsapp` and `send-extrawork-payment-link`: `company_name_not_configured` and `company_phone_not_configured`. No new vocabulary.

## Explicitly untouched

- SumUp checkout creation, credential resolution, return-URL construction, attempt tracking, and the BJ-0050b reuse guard — all unchanged, just now reached later.
- The `payment_link` / `sumup_checkout_id` write-back to `service_calls` — unchanged.
- Every existing skip condition stays as-is: `no_deposit_amount`, `no_service_call`, `no_organisation`, `opted_out`, `no_phone`, `no_sumup_credentials`, `checkout_already_pending`, `no_whatsapp_key`.
- Message wording itself is unchanged.
- Happy path: for a tenant with both branding fields set, `missingConfig` is null, execution falls through to the identical SumUp block, so checkout creation and the message are byte-identical to today.

## Verification pass (reordering-specific)

1. Read the final file top-to-bottom and confirm the three guards (opt-out, phone, branding) all return before the first `resolveSumUpCredentials` / `createSumUpDepositCheckout` call.
2. Cavan Gas scratch job (`company_phone` blank): expect HTTP 200 skip with `company_phone_not_configured`, **zero** `payment_checkout_attempts` rows for that job, one `edge_function_logs` row, one `message_log` row with `status: 'failed'`.
3. K&N scratch job to the test recipient: expect a real send, a created checkout, a `payment_checkout_attempts` row, and the message signed `K & N Gas Services ☎ 087 3686252`.
4. Delete scratch records afterwards and confirm no real customer was messaged.
5. Raw response bodies and raw query rows pasted verbatim for each step.


## Follow-up items surfaced, not in this diff

`send-reschedule-notification` ("Karl's Gas Services"), `quote-accepted-alert` ("K&N Gas Services"), and `send-whatsapp-receipt`'s `KN-` job-ref fallback still carry tenant-identifying literals.
