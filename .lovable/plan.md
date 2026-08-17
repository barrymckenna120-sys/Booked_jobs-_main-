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

## Proposed diff

**1. Remove both hardcoded fallbacks** — read the tenant config into plain trimmed strings, no seeded defaults:

```ts
const cfg = Array.isArray(tiRows) ? tiRows[0]?.config : null;
const companyName = String(cfg?.company_name ?? "").trim();
const companyPhone = String(cfg?.company_phone ?? "").trim();
```

**2. Add a skip-and-log guard immediately after that read**, before the WhatsApp key resolution and before message assembly, matching B1/B2a/B2b exactly:

```ts
const missingConfig = !companyName
  ? "company_name_not_configured"
  : !companyPhone
    ? "company_phone_not_configured"
    : null;

if (missingConfig) {
  // edge_function_logs row (function_name: "deposit-link")
  // message_log row: message_type "payment_link", status "failed",
  //   content "Skipped: <reason>", related_id = serviceCallId
  return { ok: true, skipped: missingConfig, paymentLink };
}
```

The two Edge Functions that call this module already surface `skipped` as HTTP 200 `{ success: false, skipped: true, reason }`, so their response shape needs no change.

**3. Reason codes** — reuse the exact strings already in use in `send-payment-received`, `send-deposit-reminder`, `send-area-bulk-whatsapp` and `send-extrawork-payment-link`: `company_name_not_configured` and `company_phone_not_configured`. No new vocabulary.

## Explicitly untouched

- SumUp checkout creation, credential resolution, return-URL construction, attempt tracking, and the reuse guard — all unchanged.
- The `payment_link` / `sumup_checkout_id` write-back to `service_calls` — unchanged.
- Every existing skip condition stays exactly as-is: `no_deposit_amount`, `no_service_call`, `no_organisation`, `opted_out`, `no_phone`, `no_sumup_credentials`, `checkout_already_pending`, `no_whatsapp_key`.
- The opt-out guard keeps its current position, ahead of any SumUp work.
- Message wording itself is unchanged.

## Ordering note (worth a decision)

The branding read sits *after* the SumUp checkout is created. Placing the guard there means a skipped tenant still has a live checkout and a `payment_link` saved on the job — nothing was sent, but a checkout exists. Two options:

- **A (minimal, proposed above):** guard where the branding read already is. Smallest diff, no reordering of the money path. A skipped send leaves a valid unused checkout, which the reuse guard will hand back on the next attempt once config is fixed.
- **B:** move the branding read and guard up to sit beside the opt-out/phone guards, so a misconfigured tenant never creates a checkout at all. Cleaner outcome, but it reorders the money path and needs its own verification pass.

Option A is the recommendation for this change; B is a separate follow-up if you want it.

## Follow-up items surfaced, not in this diff

`send-reschedule-notification` ("Karl's Gas Services"), `quote-accepted-alert` ("K&N Gas Services"), and `send-whatsapp-receipt`'s `KN-` job-ref fallback still carry tenant-identifying literals.
