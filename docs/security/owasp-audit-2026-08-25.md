# OWASP Security Audit — BookedJobs

**Date:** 2026-08-25
**Scope:** Multi-tenant isolation, Edge Functions, payments, auth, storage, secrets
**Method:** Static source inspection + read-only / non-destructive live probes
**Verdict:** **NO-GO for additional tenants.** Two unauthenticated cross-tenant data-disclosure paths and a broad class of unauthenticated business-action endpoints are live in production.

---

## Disclosure: one unintended production write

The audit was intended to be read-only. One probe was not.

An empty-body, unauthenticated `POST` to `expire-quotes` at **11:29 UTC** returned `200 {"success":true}` and **transitioned 26 quotes to `status = 'expired'`**. All 26 rows were already past their `expiry_date`, so the resulting state is identical to what the nightly cron produces — no data was lost and no customer-visible message was sent. I verified this: `message_log`, `whatsapp_messages`, `job_payments` and `audit_log` all show **0 new rows** in the probe window.

I should have classified `expire-quotes` as state-changing and probed it with a method-only request instead. Flagging it rather than leaving it in the logs unexplained. This is also, incidentally, the cleanest possible proof of Finding 3.

---

## Findings

### 1. CRITICAL — `tmp-mcl-probe` is an unauthenticated service-role proxy (auth bypass)

A leftover debug function forwards an arbitrary caller-supplied body to `missed-call-lookup` **using the service-role key**, with no guard of its own. `missed-call-lookup` fails closed correctly; the proxy hands attackers the key that opens it.

Live proof — same payload, two endpoints, no credentials:

```
POST /missed-call-lookup   → 401 {"error":"Unauthorized"}          # correct
POST /tmp-mcl-probe        → 200 {"customer":{"name":"...","phone":"+212...",...},
                                  "org":{"business_name":"K & N Gas Services", ...}}
```

`organisation_id` and `phone` are both attacker-controlled, so this is a **cross-tenant** customer lookup oracle for any org in the platform. `mode: "log_followup"` additionally reaches a service-role **write** path into `message_log` and `customer_activity`.

**Fix:** delete the function. It has no production role.

---

### 2. CRITICAL — `review-request` returns customer names and phone numbers to anyone, all tenants

No auth check of any kind. Service-role client. Selects every `Completed` job with `review_sent = false` across **all organisations** and returns customer name + mobile number.

```
POST /review-request  (no auth)  → 200 [{"customer_name":"mr blue","mobile_number":"+353...", ...}, ...]
```

Unauthenticated bulk PII harvest, and a ready-made target list for SMS/WhatsApp fraud against customers who have just had an engineer in their home. OWASP A01 (Broken Access Control) + A04.

**Fix:** require the machine-caller guard (`x-webhook-secret` / service-role bearer) used by `missed-call-lookup`, and scope the query to a caller-supplied-then-verified `organisation_id`.

---

### 3. CRITICAL (systemic) — 49 of 84 Edge Functions have no authentication check

The dominant issue is not any single endpoint; it is that **58% of the function surface is unauthenticated**. Each holds the service-role key and acts on a caller-supplied ID with no ownership check. Confirmed by source inspection of every function (searching for a real secret check, a `getUser`/`getClaims` call, or any 401/403 rejection path) and corroborated by the unauthenticated probe sweep.

Grouped by what an anonymous attacker gets:

| Class | Functions | Impact |
| --- | --- | --- |
| **Sends messages to real customers** | `send-whatsapp-receipt`, `send-quote-whatsapp`, `send-certificate-whatsapp`, `send-hazard-whatsapp`, `send-warranty-whatsapp`, `send-renewal-reminder`, `send-part-arrived`, `send-booking-confirmation`, `send-whatsapp-booking-confirmation`, `send-cancellation-notice`, `send-reschedule-notification`, `send-schedule-confirmation`, `send-area-bulk-whatsapp`, `send-outstanding-invoice-reminders`, `trigger-review-request`, `send-push-notification` | Send arbitrary/forged comms to real customers from the tenant's number; reputational and GDPR exposure |
| **Auth-adjacent / mail abuse** | `send-magic-link`, `send-reset-email`, `lock-failed-login`, `check-lockout-status` | Unauthenticated login-link and reset-email dispatch to any address (mail-bomb, phishing pretext); `lock-failed-login` lets anyone lock a chosen account out (DoS) |
| **Financial documents** | `create-job-invoice`, `generate-receipt-pdf`, `generate-quote-pdf`, `send-extrawork-payment-link`, `resolve-document-link`, `mark-invoice-reminder-sent` | Mint invoices/receipts and payment links against another tenant's jobs |
| **Safety certificates** | `generate-cert2-pdf`, `generate-cert3-pdf`, `generate-certificate-pdf`, `generate-gas-install-pdf`, `generate-hazard-pdf`, `get-hazard-pdf` | Regenerate or retrieve gas-safety records by ID with no ownership check |
| **Cron jobs, remotely triggerable** | `expire-quotes`, `job-reminder-2day`, `quote-followup-day3`, `quote-followup-day6`, `send-deposit-reminder`, `send-upcoming-reminders`, `warranty-auto-send` | Force off-schedule bulk sends and state changes (see disclosure above) |
| **Data read** | `review-request`, `get-upcoming-service-calls`, `get-service-reminders`, `get-template-status` | Tenant data disclosure |
| **Debug leftovers** | `tmp-mcl-probe`, `whatsapp-webhook-test`, `tally-webhook` (returns 410) | Auth bypass; attacker-controlled log injection |

Note these mostly return `400` to an empty body — the missing guard is masked by input validation, not by authorization. `400 {"error":"job_id required"}` means *"supply a job ID and I will act on it."* Per the audit rules I did **not** send valid business payloads to any message-sending function, so those are confirmed by source, not by firing them.

**Fix:** a single shared `authoriseRequest(req)` helper applied at the top of every handler, before body parsing, defaulting to deny. The tenant check must follow: resolve the record's `organisation_id` and compare it to the caller's, rather than trusting the ID.

---

### 4. HIGH — `whatsapp-inbound` fails open, and is currently open

The guard returns `true` when the secret is unset:

```ts
const expected = (Deno.env.get("WHATSAPP_INBOUND_SECRET") ?? "").trim();
if (!expected) {
  console.warn("whatsapp-inbound: WHATSAPP_INBOUND_SECRET not set — webhook is still open");
  return true;   // fail-open
}
```

An unauthenticated probe returned `200 {"status":"ok"}`, which proves the secret is **not set in production** and the webhook is live and open. Because inbound WhatsApp drives the CANCEL / CONFIRM flows, an attacker who can guess a phone number can **cancel or confirm real customer bookings**. Booking-critical.

**Fix:** invert to fail-closed (`if (!expected) return false;`) and set `WHATSAPP_INBOUND_SECRET`. Never let an unset secret widen access.

---

### 5. CRITICAL — `get_receipt_public` RPC leaks customer PII to `anon` (BOLA)

`SECURITY DEFINER`, granted to `anon`, keyed on a **guessable sequential receipt number**. Probing `KN-2026-1275` unauthenticated returned customer name, full address, Eircode, revenue, payment method, boiler brand/model, GPRN and warranty dates.

The receipt number is the only secret, and it is not secret — it is sequential per tenant, so the whole receipt history is enumerable.

**Fix:** key public receipt access on a high-entropy `access_token` (the pattern `get_quote_by_token` already uses), not the human-readable number. Trim the returned columns to what the receipt page actually renders — GPRN and revenue do not belong in an anonymous response.

---

### 6. LOW — `whatsapp-webhook-test` logs attacker-controlled headers and bodies

Unauthenticated, returns `200 {"received":true}`, writes full request headers and body to function logs. Log-injection and log-flooding vector; may also capture provider tokens from misdirected traffic. **Fix:** delete it.

---

## What held up

Worth stating plainly, because it narrows the blast radius of the above:

- **RLS / tenant isolation is sound.** `anon` holds broad table grants (~40 tables), but every policy predicates on `organisation_id = get_my_org_id()`, and `get_my_org_id()` returns `NULL` for `anon`, so direct Data API reads return empty. The grants are untidy, not exploitable.
- **Storage is correctly scoped.** `certificates`, `job-media`, `quote-pdfs` are private with per-org `authenticated` policies; only `business-logos` and `email-assets` are public, which is intended. `job-media` enforces a 50 MB cap and a MIME allowlist.
- **Internal RPCs reject anonymous callers**, including `get_my_org_id` and `verify_impersonation_token`.
- **Impersonation is properly gated** — HMAC-signed token, `uid` binding, and a `superadmin` role check, with the legacy `x-org-id` header removed.
- **Payment webhooks verify.** `sumup-payment-webhook` returned `401 unauthorized` unsigned; append-only `job_payments` RLS and the unique `checkout_id` index held.
- **No secret leakage found** in function responses or logs.

---

## Remediation order

1. Delete `tmp-mcl-probe` and `whatsapp-webhook-test`. *(minutes, removes one CRITICAL)*
2. Guard `review-request`; scope it to one org. *(CRITICAL)*
3. Fail-close `whatsapp-inbound` and set `WHATSAPP_INBOUND_SECRET`. *(booking-critical)*
4. Re-key `get_receipt_public` onto `access_token` and trim its columns. *(CRITICAL)*
5. Roll `authoriseRequest(req)` across the 49 unguarded functions, starting with the message-sending and financial groups, then add per-record `organisation_id` ownership checks.
6. Move the seven cron functions to a service-role-only guard.

Items 1–4 are small and should land before any new tenant is onboarded. Item 5 is the real work and needs the full Heavy TDD process — it touches payments, quoting, bookings and auth.

---

## Coverage

84 Edge Functions probed unauthenticated (empty body) and classified by source. 51 public tables and 5 storage buckets enumerated. `pg_policies`, `pg_class` grants and the Supabase linter reviewed. Public RPCs probed as `anon`. No valid business payload was sent to any message-sending function; no payment was initiated; no customer received a message during this audit (`message_log` and `whatsapp_messages` both show 0 rows in the window).
