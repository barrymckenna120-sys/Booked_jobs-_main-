# Edge Function Guard Rollout (post-audit remediation)

Batched by caller type. Each batch applies one consistent guard pattern, is deployed and live-verified before the next batch starts. No behaviour changes for legitimate callers.

## Guard patterns

Four patterns, reused across all batches (all already exist in the codebase — no new invention):

1. **Machine-secret gate** — require a shared secret header (as `trigger-outstanding-reminder`, `log-message`, `handle-whatsapp-opt-out` already do). Used for pg_cron and Make.com callers.
2. **Webhook-signature gate** — provider secret/HMAC compare (as `tally-incoming-job`, `sumup-payment-webhook`, `whatsapp-inbound` already do).
3. **User-JWT gate** — `Authorization` header + `auth.getUser()`, 401 on failure, org resolved server-side via `get_my_org_id()` (as `cancel-job-notify` and `generate-accountant-export` already do). Used for UI-invoked functions.
4. **Tenant-ID hardening** — stop trusting `organisation_id` from the request body; derive it from the authenticated caller or from the validated resource. Applied wherever the audit flagged a body-sourced tenant ID.

## Batch 1 — pg_cron callers (5 functions)

`job-reminder-2day`, `quote-followup-day3`, `quote-followup-day6`, `send-deposit-reminder`, `warranty-auto-send`

All five are invoked by `cron.job` with a service-role bearer token. Add the machine-secret gate accepting either the service-role bearer or the machine secret; reject anything else with 401. Cron commands are not modified (they already send the bearer).

Verify: run each function once via authorized call and confirm a 200 with the same body as today, then confirm an unauthenticated call returns 401. Row counts are currently 0 for all five selection windows, so no outbound messages will fire during verification.

## Batch 2 — Make.com / external webhook callers (15 functions)

`renewal-reminder-30`, `renewal-reminder-14`, `renewal-reminder-7`, `get-tomorrows-jobs`, `get-upcoming-jobs`, `get-upcoming-service-calls`, `get-service-reminders`, `get-outstanding-invoices`, `mark-reminder-sent`, `mark-invoice-reminder-sent`, `log-message`, `handle-whatsapp-opt-out`, `missed-call-lookup`, `create-booking-link`, `get-template-status`

Add or complete the machine-secret gate on the ones missing it, and apply tenant-ID hardening to every one that currently reads `organisation_id` from the body: the org must come from the machine caller's own bound tenant record or from the validated resource ID, never from a caller-supplied field.

Because these are called by live Make.com scenarios, this batch is staged: the gate accepts the secret **or** logs-and-allows for one observation window, so any scenario still sending no secret is identified from logs before enforcement flips on. Enforcement flip is a separate approval step.

Webhook-signature batch (`tally-incoming-job`, `tally-boiler-rebook`, `sumup-payment-webhook`, `whatsapp-inbound`, `auth-email-hook`) already has signature gates — only the body-sourced `organisation_id` reads in the two Tally functions are hardened here.

## Batch 3 — UI-invoked functions (largest batch)

All functions whose only confirmed caller is `src/`. Add the user-JWT gate plus server-side org resolution. Split into three deploy waves so a regression is easy to attribute:

- **3a Comms/customer-facing:** `send-booking-confirmation`, `send-cancellation-notice`, `send-renewal-reminder`, `send-warranty-whatsapp`, `send-area-bulk-whatsapp`, `send-part-arrived`, `send-quote-whatsapp`, `accept-quote`*, `send-certificate-whatsapp`, `send-hazard-whatsapp`, `send-extrawork-payment-link`, `send-push-notification`, `trigger-review-request`
- **3b Documents/PDF:** `generate-quote-pdf`, `generate-cert2-pdf`, `generate-cert3-pdf`, `generate-certificate-pdf`, `generate-gas-install-pdf`, `generate-hazard-pdf`, `resolve-document-link`*
- **3c Auth/email surfaces:** `send-magic-link`, `send-reset-email`, `lock-failed-login`, `check-lockout-status`, `track-failed-login`, `notify-failed-login`

\* `accept-quote` and `resolve-document-link` are reached by unauthenticated customers on public routes and must keep a public path — they get resource-token validation and tenant scoping instead of a JWT gate.

Already-gated UI functions (`cancel-job-notify`, `generate-accountant-export`, `send-payment-received`, `send-payment-link`, `send-deposit-link`, `send-block-notification`, `sumup-integration`, admin/team functions) are untouched, except tenant-ID hardening where the audit flagged a body-sourced org on a superadmin-gated path — those stay as-is since the superadmin check already bounds them.

## Batch 4 — Unknown-caller functions: guard now, delete after watch period

`send-invoice-whatsapp`, `send-outstanding-invoice-reminders`, `send-schedule-confirmation`, `send-upcoming-reminders`, `send-reschedule-notification`, `send-whatsapp-booking-confirmation`, `quote-accepted-alert`, `review-request`, `expire-quotes`, `get-hazard-pdf`, `tally-webhook`, `mcp`, `tmp-mcl-probe`, `whatsapp-webhook-test`, `backfill-storage-paths`

Two steps:

1. **Guard + instrument now** — machine-secret gate (401 without it) plus an invocation log row on every request, authorized or not, recording caller IP class, origin, and whether a secret was presented.
2. **Watch, then delete** — after the agreed watch period, review the invocation log. Anything with zero invocations is deleted, including its `config.toml` entry. Anything that did fire gets a documented caller and moves into the matching batch above. The delete pass is its own approval step with the log evidence attached.

`tmp-mcl-probe` and `whatsapp-webhook-test` are named test/probe endpoints with no auth and no CORS — proposed for immediate deletion rather than a watch period, since a probe firing during the window proves nothing legitimate.

## Cross-cutting

- CORS: replace the `"*"` + wide allow-list header on every touched function with the shared dynamic-origin helper already used by `list-users`, `impersonate-org`, and `reset-org-data`.
- `config.toml`: add explicit entries for functions currently missing one, matching the guard each receives.
- BJ-SEC01 (`create-job-invoice`, `generate-receipt-pdf`, `send-whatsapp-receipt`) and BJ-SEC06 (`tmp-mcl-probe`, `whatsapp-webhook-test`, `backfill-storage-paths`) overlap this rollout; where a function appears in both, this plan defers to the existing ticket's guard so it is implemented once.
- No database writes or migrations in this plan except the invocation-log table for Batch 4, which is its own isolated review-gated step.

## Verification per batch

Deploy, then for each function: one authorized live call confirming an unchanged 200 body, one unauthenticated call confirming 401. Any live outbound comms verification uses scratch jobs/test numbers only, never a real customer. Full test suite and typecheck run before each batch is considered done.
