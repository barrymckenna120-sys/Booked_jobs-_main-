# Follow-up answers (confirm-only) + probe plan

## 1. create-booking-link merge conflicts (BJ-0083)
Fixed in this batch. A repo-wide search for conflict markers in `supabase/functions/` returns nothing — no unresolved markers remain in source. `create-booking-link` now imports `_shared/orgAuth.ts` and resolves org via `requireBoundOrg`.

## 2. Cleanup status (BJ-0088)
- `tmp-mcl-probe` — REMOVED (directory gone).
- `whatsapp-webhook-test` — NOT STARTED. Still present, and `config.toml` has `verify_jwt = false` for it.
- `send-whatsapp-booking-confirmation` stub — NOT STARTED. Still present.
- `mcp` — NOT STARTED. Still present.

## 3. Job-list functions — org binding strength
Not bare trust. `requireBoundOrg` does, for machine callers: (a) require an explicit `organisation_id`, (b) verify it exists in `organisations`, (c) look up that tenant's `tenant_integrations(make).config.webhook_secret` and require the caller's `x-webhook-secret` / `x-make-secret` to equal **that tenant's** secret — a mismatch is 403.

The caveat: if a tenant has **no** `webhook_secret` configured, the function accepts a global shared secret and only logs a warning. For those tenants only, the risk is the same class as the Tally webhooks (BJ-0094) — claimed-org trust past a shared secret. It is not equivalent to `get-business-insights`, which now derives org server-side from the caller's profile with no client input. Closing action: set a per-tenant `webhook_secret` for every live tenant, then flip the no-secret branch from warn to deny.

## 4. Systemic IDOR (BJ-0089) — the 8 not in the guarded 11
The four `generate-*-pdf` functions (plus cert2/cert3/gas-install/hazard) are `verify_jwt = false` and take a job/quote id, with **no** org guard, **no** signed token, and no caller check. There is no protecting mechanism — the only mitigation is that the artefact they write lands in a private bucket where reads need a signed URL from `resolve-document-link`. Generation itself is an unauthenticated cross-tenant read of job/customer/engineer PII returned in the response. Treat as still-open RED, not "deliberately ungated".

`send-quote-whatsapp`, `send-schedule-confirmation`, `quote-accepted-alert`, `review-request` — missed in this batch, not deliberately deferred. All four take a resource id and none import `orgAuth`.

## 5. send-invoice-whatsapp (BJ-0090)
Fallback NOT removed. `index.ts` still ends the key chain with `Deno.env.get("THREESIXTY_API_KEY")`. `send-warranty-whatsapp` and `_shared/notifyAdmin.ts` also still read the shared key. The five functions named in the batch (job-reminder-2day, send-schedule-confirmation, send-renewal-reminder, send-payment-link, send-quote-whatsapp) are clean.

## 6. Live cross-tenant probes
Not run yet — these need approval because two of them have side effects on live tenants (`send-push-notification` would deliver a real push if the guard fails; `generate-accountant-export` can send mail). Proposed probe set, all against Dublin Gas + K&N with scratch data only:

1. `get-business-insights` — authenticated Dublin Gas session, assert no K&N job/customer rows and no K&N revenue in the response.
2. `get-upcoming-jobs` — three calls: Dublin Gas session claiming K&N `organisation_id` (expect 403), machine call with K&N secret claiming Dublin Gas org (expect 403), fully unauthenticated (expect 401).
3. `send-push-notification` — Dublin Gas session targeting a K&N user id (expect 403, and confirm no FCM send in logs).
4. `generate-accountant-export` — Cavan Gas (test tenant, no `accountant_email`), assert skip/log and no fallback recipient.

## Next fix batch (for approval separately)
BJ-0089 remainder: `orgAuth` guards on the 4 PDF generators + the 4 send functions; BJ-0088 removal of `whatsapp-webhook-test`, `send-whatsapp-booking-confirmation` stub, `mcp`; BJ-0090 remove the remaining shared-key fallbacks; BJ-0094 per-tenant `webhook_secret` then fail-closed.

## Tracker
Yes — mark these rows AMBER, pending confirmation, rather than done. The batch is real but unverified until the four probes above pass.
