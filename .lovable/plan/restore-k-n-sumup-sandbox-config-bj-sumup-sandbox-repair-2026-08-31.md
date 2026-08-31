# Restore K&N SumUp sandbox config (BJ — SumUp sandbox repair)

## Impact check first (already done, read-only)

Did any real K&N customer hit this failure between 26/08 and now? **No.**

- `service_calls` for K&N: the newest row carrying a `sumup_checkout_id` was created **24/08 16:25 UTC** (KN-522). Zero new K&N checkouts exist on or after 26/08 — the resolver change landed 26/08, so no checkout was even attempted.
- `message_log` for K&N since 25/08 contains only three payment-adjacent rows, all `success`/`sent`: `quote` (26/08 07:34), `quote_followup_day3` (27/08), `quote_followup_day6` (30/08). No `payment_link`, `deposit_link`, or receipt sends failed — none were attempted.
- No SumUp credential errors present in the retained edge-function logs.

Conclusion: the breakage is real but latent — K&N simply hasn't raised a SumUp checkout since 24/08. No customer was shown a broken link, and no payment was lost. Dublin Gas was unaffected throughout (its config has the correct `environments.live` shape).

## The fix

One data write to K&N's `tenant_integrations` row (org `8c37827f-…`, `integration_type = 'sumup'`), adding the per-environment entry the mode-aware resolver requires:

```
config.environments.sandbox = {
  merchant_code:  "MBBMEYG7",
  api_key_secret: "SUMUP_API_KEY"
}
```

- Matches Dublin Gas's shape exactly (DG has `environments.live`; K&N gets `environments.sandbox` because its active mode is sandbox).
- `environment` stays `sandbox`, top-level `merchant_code` / `api_key_secret` / `webhook_secret` stay untouched, `is_active` unchanged.
- `jsonb_set` with `create_missing`, scoped to the single K&N sumup row, written so re-running is idempotent.
- No code changes. No secret changes — `SUMUP_API_KEY` (shared sandbox key) is referenced by name only and never overwritten.
- Per the DB-write-isolation rule this is its own review-gated step, separate from any Dublin Gas work.

## Verification, in order

1. **Pre-write read-back:** print K&N's current `config` so the before/after diff is on record.
2. **Write**, then re-read the row and show the resulting `config` JSON.
3. **Resolver check:** run the real `resolveSumUpCredentials` against the *stored* config (not a hand-written copy) and confirm `{ ok: true, environment: "test", merchantCode: "MBBMEYG7" }`.
4. **Scratch-job checkout:** create a K&N scratch job (clearly-named test customer, scratch phone number from the reserved list, small amount), generate a SumUp checkout on it, and confirm a real hosted checkout URL comes back against merchant MBBMEYG7. Recipient is a scratch number only — no real customer is contacted.
5. **Webhook confirmation:** pay the sandbox checkout, then confirm a `sumup_webhook_events` row lands for that `checkout_id` under org `8c37827f-…` and the job's `payment_status` / `paid_at` / `balance_due` update correctly.
6. **Tenant-isolation regression:** re-run the resolver for Dublin Gas and confirm it still returns the live pair (`M9MEJM9K`) unchanged.
7. **Cleanup:** delete the scratch job, its webhook events, message_log and activity rows, and the scratch customer; re-query each to show zero rows.

If SumUp's sandbox declines the test card (the known BJ-0110 issue — MBBMEYG7 behaviour needs confirming at step 4), I stop and report rather than declaring green; steps 1-3 and 6 still stand as proof the config defect itself is fixed.

## Out of scope

- No changes to the resolver, webhook handler, or any checkout-creation code.
- No Dublin Gas config changes, and no move of DG to sandbox mode.
- No secret rotation or new secrets.
- The separate DG WhatsApp 403 issue is untouched here.
