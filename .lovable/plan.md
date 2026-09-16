# Wire a genuine SumUp sandbox for K&N (gated on a real sandbox key)

## Where things stand (confirmed by read-only checks)

- Production K N Gas Services Limited is wired **live**: merchant `M9MEJM9K`, key name `SUMUP_API_KEY_KNGAS_LTD`. It does have a live credential, so any wiring must leave that untouched.
- The saved `SUMUP_SANDBOX_API_KEY_KN_V2` authenticates as **live** merchant `M9MEJM9K` (WEBLIVEVIEW LIMITED), no `extdev` flag. It cannot be used.
- `M9GH65GY` is already stored as **Dublin Gas's live merchant code**, so it must never be written as K&N's sandbox merchant.

Nothing is wired and no checkout is created until a key passes the gate below.

## Step 1 — Obtain and prove a real sandbox key

1. You generate an API key from **inside the sandbox account itself** (SumUp Dashboard, Developer settings, Sandboxes tab, open the sandbox, then create a key there). A key created from the main account always comes out live.
2. Save it as a new secret `SUMUP_SANDBOX_API_KEY_KN_V3` (V2 stays untouched; it is a live key and will be dealt with in step 5).
3. **Gate:** read-only whoami against the new key. It must return a merchant code that is neither `M9MEJM9K` nor `M9GH65GY`, and must carry the sandbox/`extdev` marker. If it returns either live merchant, I stop and report — no config write, no checkout.
4. Only once the gate passes: the €11.00 always-fails sandbox test, to confirm sandbox decline behaviour before any config change.

## Step 2 — Wire K&N's sandbox environment

A single scoped write to the K&N `tenant_integrations` SumUp row, using the merchant code whoami actually returned:

```text
config.environments.sandbox = {
  merchant_code:  <merchant code from whoami>
  api_key_secret: "SUMUP_SANDBOX_API_KEY_KN_V3"
}
```

- `environments.live`, the top-level live merchant/key, `webhook_secret` and `is_active` are all left exactly as they are.
- Which org row gets the sandbox entry (dev `8c37827f…` vs production `c0aa41ac…`) is decided with you before the write — production is currently the live one, so the dev row is the safer host for sandbox testing.
- `environment` is only switched to `sandbox` on the row we agree, never on production without your explicit say-so.
- Written idempotently, merged not replaced, read back afterwards and diffed.
- Resolver re-run for K&N **and** Dublin Gas to prove DG still resolves to its own live pair unchanged.

## Step 3 — End-to-end test on scratch data only

1. Scratch job under a clearly-named test customer, reserved scratch phone number, small amount. No real customer is contacted.
2. Create a checkout and confirm the hosted URL comes back against the sandbox merchant, not either live one.
3. Pay the sandbox checkout, then read back `sumup_webhook_events`, `payment_checkout_attempts`, `job_payments`, and the job's `payment_status` / `paid_at` / `balance_due`.
4. Run the €11 always-fails card again through the real flow to confirm the decline path and the payment-failed notification.
5. Delete the scratch job, its webhook/payment/activity rows and the scratch customer; re-query each to show zero rows.

## Step 4 — Regression coverage for this week's payment fixes

Before claiming coverage, I re-read today's payment changes from git history and list each fix with the exact sandbox scenario that exercises it — expected to cover the payment-status misclassification, the duplicate-entry submit guard, the missing job total, and the payment-completion diagnostics. Any fix a sandbox checkout genuinely cannot reach is named as still requiring another method, rather than being claimed as covered.

## Step 5 — Clean up the misleading live-key secret

Re-query `tenant_integrations` for any row referencing `SUMUP_SANDBOX_API_KEY_KN_V2`. If nothing references it, delete it — a secret named "sandbox" holding a live key is a real hazard. If any row does reference it, flag it and delete nothing.

## Out of scope

- No changes to the resolver, webhook handler, or checkout-creation code.
- No changes to Dublin Gas, and no move of any tenant to sandbox mode beyond the one row we agree.
- `SUMUP_API_KEY_KNGAS_LTD` and `SUMUP_API_KEY_DUBLIN_GAS` are left alone.
- Refunds for earlier real test charges are a separate ticket.

## Order and gating

Steps run strictly in order. Each database write is its own review-gated, read-back-verified step. No configuration is touched until whoami and the €11 test prove the key is genuinely sandbox.
