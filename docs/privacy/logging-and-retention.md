# Logging and retention — record of processing

Last reviewed: 23/09/26. Owner: BookedJobs (processor). Tenants (gas/heating
companies) remain the data controllers for their own customer data; the logs
described here are processed by BookedJobs for platform security.

## 1. What is logged

### Login and session activity — `auth_activity_events`
| Field | Purpose |
| --- | --- |
| event type | sign-in success/failure, sign-out, password reset requested, password changed, account locked |
| failure reason | short code only (`invalid_credentials`, `network_error`, `account_blocked`, …) |
| user id, email | identifies the account involved |
| organisation id | the tenant the account belongs to (resolved server-side) |
| IP address | security investigation, abuse and fraud detection |
| browser, version, OS, device type, display mode, user agent | diagnosing device-specific failures (e.g. iOS Safari sign-in) |
| route | which screen the event came from |

Written only by the `log-auth-event` Edge Function. The IP is taken from the
request itself, never from the browser payload. No password, token or session
material is read or stored.

### Access to the log — `auth_activity_access_log`
One row each time a superadmin opens the Login Activity screen: viewer, tenant
filter, filters used. Answers "who looked at this".

### Existing logs covered by the same retention rules
- `edge_function_logs` — backend failure records.
- `support_reports` — device diagnostics attached to a user-submitted report.

## 2. Legal basis

Legitimate interest (Article 6(1)(f) GDPR): platform security, fraud and abuse
prevention, and diagnosing service failures. IP addresses are personal data, so
the retention period is deliberately short and the data is not used for
profiling, marketing or analytics.

## 3. Retention

| Data | Retained | Then |
| --- | --- | --- |
| Login events — full IP | 90 days | IP shortened to /24 (IPv4) or /48 (IPv6), `ip_truncated = true` |
| Login events — remainder | 12 months | deleted |
| Access log | 12 months | deleted |
| Backend failure logs | 30 days | deleted |
| Support reports | 12 months | deleted |
| Crash/error reports (Sentry) | as configured in Sentry | deleted by Sentry |

Enforced automatically by `public.purge_activity_logs()`, scheduled nightly at
03:20 via `pg_cron` (job `purge-activity-logs`). The function returns a count of
rows masked/deleted per table and can be run manually for verification.

Sentry is the diagnostic layer only (stack traces, replay, releases). IP
addresses are not sent to Sentry; they stay in the EU-hosted database under the
retention above.

## 4. Access control

- Readable only by users with `profiles.role = 'superadmin'`.
- Enforced in the database by RLS using `public.is_superadmin(auth.uid())`, so a
  tenant owner cannot read another tenant's rows even by calling the API
  directly. `anon` has no access.
- Writes are service-role only (the Edge Function).
- The screen lives at Admin → User Activity → Login Activity, behind the
  existing superadmin gate. No account email is hardcoded anywhere.

## 5. Data subject requests

Subject access and erasure requests must include `auth_activity_events`,
`auth_activity_access_log` and `support_reports`. Look the person up by email
(`lower(email)` is indexed) and by `user_id`. Security logs may be retained
against an erasure request where needed to establish or defend legal claims, but
that must be recorded case by case, with a reason, not applied by default.

## 6. Out of scope (not built)

- Anonymous visitor tracking (Phase 3 — decision pending on consent model).
- Failure-path reporting sweep across the app (Phase 4).
