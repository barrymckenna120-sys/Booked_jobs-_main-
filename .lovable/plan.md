# Probe run — first results, blockers, and the approved fix batch

## Confirmed now (read-only)

### webhook_secret status — all three live tenants: MISSING
Queried `tenant_integrations` where `integration_type = 'make'`:

| Tenant | `make` row | `webhook_secret` |
|---|---|---|
| K&N Gas Services | exists | not present (length 0) |
| Dublin Gas | exists | not present (length 0) |
| Cavan Gas | exists | not present (length 0) |

So today **every** live tenant hits the warn-and-accept branch of `requireBoundOrg`. The per-tenant binding exists in code but binds nothing in practice — the job-list functions are currently bare trust-once-past-the-shared-secret, i.e. the same risk class as the Tally webhooks (BJ-0094). `requireBoundOrg` cannot be marked GREEN.

### generate-accountant-export precondition
`settings.accountant_email` is empty for Cavan Gas, set for Dublin Gas and K&N — so Cavan is a valid skip-path probe target.

### Probe 2c — unauthenticated get-upcoming-jobs: PASS
`POST /get-upcoming-jobs` with no `Authorization`/`apikey` and a K&N `organisation_id` in the body returns **401** `{"error":"Unauthorized","reason":"missing_credentials"}`.

## Blocker on the remaining probes
The preview session available to me is Barry's superadmin account, and `requireBoundOrg` deliberately lets `role = 'superadmin'` cross orgs. Probing 1, 2a, 2b, 3, 4 with that session would produce a false PASS or a meaningless PASS. Those probes need non-superadmin sessions minted for a Dublin Gas office user and a K&N user, plus a K&N scratch account for probe 3 — and minting sessions plus creating the scratch account are writes, so they belong in the approved run below rather than in plan mode.

## Approved run (step 1 — probes, no code changes)
1. Mint a non-superadmin Dublin Gas office session and a non-superadmin K&N session; confirm each `profiles.organisation_id` and `role` before probing.
2. Create (or identify) a K&N **scratch** engineer/staff account with no real FCM device token for probe 3. No real staff member is targeted.
3. Run:
   - `get-business-insights` — Dublin Gas session; assert zero K&N job/customer rows and that revenue totals reconcile to Dublin Gas rows only (cross-check against a direct SQL sum for Dublin Gas).
   - `get-upcoming-jobs` — Dublin Gas session claiming K&N `organisation_id` (expect 403); machine call with K&N's secret claiming Dublin Gas org (expect 403 — note: with no per-tenant `webhook_secret` set this will currently NOT deny, which is itself the finding to record); unauthenticated (already PASS, 401).
   - `send-push-notification` — Dublin Gas session targeting the K&N scratch user id; expect 403 and assert the edge function logs show no FCM dispatch for that call.
   - `generate-accountant-export` — Cavan Gas; assert (a) no email sent, (b) **a log row exists recording the skip** (`edge_function_logs` / function logs with the org id and reason). If the skip is silent with no log, record that as a separate finding, not a pass.

## Step 2 — fixes (only after probe results are reported and approved)
- **BJ-0094 / requireBoundOrg:** generate and store a distinct `webhook_secret` in `tenant_integrations(make).config` for K&N, Dublin Gas, and Cavan Gas (one isolated DB write step), then flip the no-secret branch in `_shared/orgAuth.ts` from `console.warn` to `deny(403)`. Deploy after Make scenarios carry the per-tenant secret.
- **BJ-0090 — scope now 7 functions, receipt confirmed.** `send-warranty-whatsapp` is added: it still ends its key chain on the shared `THREESIXTY_API_KEY` (`index.ts` ~line 411), separate from the already-fixed `renewal_form_url` issue. Also still on the shared key and to be tracked: `send-invoice-whatsapp` (~line 177) and `_shared/notifyAdmin.ts`.
- **BJ-0089 remainder:** `orgAuth` guards on the 4 `generate-*-pdf` functions and on `send-quote-whatsapp`, `send-schedule-confirmation`, `quote-accepted-alert`, `review-request`.
- **BJ-0088 remainder:** remove `whatsapp-webhook-test`, the `send-whatsapp-booking-confirmation` stub, and `mcp`.
- **generate-accountant-export:** add an explicit skip log if the probe shows the skip is silent.

## Tracker
All functions in the last batch stay AMBER — pending confirmation. `requireBoundOrg` stays AMBER regardless of probe outcome until per-tenant secrets exist and the branch denies.
