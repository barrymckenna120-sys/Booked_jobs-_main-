# Wire up the genuine SumUp sandbox key for K&N

Goal: make K&N's sandbox environment point at the real sandbox credential, prove it end to end, then remove the three misleadingly-named live secrets.

## Pre-check already done (read-only)

A codebase-wide search found **zero references** to `SUMUP_API_KEY_DUBLIN_GAS_SANDBOX`, `SUMUP_API_KEY_DUBLIN_GAS_TEST`, or `SUMUP_API_KEY_DUBLIN_GAS_MCR_SANDBOX` anywhere in the project — no runtime code, no edge function, no test fixture, no docs. Credential resolution is data-driven from `tenant_integrations`, so the only place a secret name can be referenced is a config row. Those will be re-checked in the database immediately before deletion.

## Steps

1. **Confirm the new secret exists.** List configured secret names and verify `SUMUP_SANDBOX_API_KEY_KN` is present. Stop and report if it isn't yet saved.

2. **Read-only whoami first, before changing any config.** Call SumUp `GET /v0.1/me` with the new key and report the merchant code and account name. If it returns `M9MEJM9K` / WEBLIVEVIEW LIMITED, it is another live credential — stop, change nothing, and report. Only a genuine non-live sandbox merchant proceeds.

3. **Point K&N's sandbox config at it.** Single scoped write to K&N's `tenant_integrations` SumUp row: set `environments.sandbox.api_key_secret = "SUMUP_SANDBOX_API_KEY_KN"` (and the merchant code returned by whoami, replacing `MBBMEYG7`). Merge with `||`, leave the top-level live config, `is_active`, and Dublin Gas untouched. Read the row back to confirm it persisted, then re-run the resolver for both K&N and Dublin Gas to confirm K&N resolves to the sandbox merchant and DG is unchanged.

4. **Scratch checkout + webhook read-back.** Create a scratch job under K&N (test title prefix, internal test phone, no real customer), raise a checkout against the sandbox environment, then read back `payment_checkout_attempts`, `job_payments`, and `sumup_webhook` rows to confirm the full flow settles. Report the amount, checkout reference, and merchant it landed on. Then clean up the scratch job. This step needs a superadmin preview session; if none is injected, it is reported as blocked, not skipped.

5. **Delete the three misleading secrets.** Re-query `tenant_integrations` for any row referencing them. If none, delete `SUMUP_API_KEY_DUBLIN_GAS_SANDBOX`, `SUMUP_API_KEY_DUBLIN_GAS_TEST`, `SUMUP_API_KEY_DUBLIN_GAS_MCR_SANDBOX`. If any row does reference one, flag it and delete nothing.

## Out of scope

- `SUMUP_API_KEY` and `SUMUP_API_KEY_DUBLIN_GAS` stay as they are (both live, both in use).
- No refund decisions on the €4,117.50 of prior test charges — separate ticket.
- No changes to payment business logic.

## Order and gating

Steps run strictly in order; each database write is its own isolated, read-back-verified step. Nothing is deleted before the new key is proven to work.
