# Activity, visitor and error visibility across tenants — findings and plan

No code or data changed. Everything below marked "checked" was read from the
live system today.

## 1. What already exists

**The built-in auth audit log is empty.** `auth.audit_log_entries` has zero
rows — no oldest record, no newest (checked). So there is nothing there to
surface: it is not a data source we can build a screen on top of today.

**The platform's own request logs hold IP and device, but only for hours.**
Auth and HTTP request logs do carry the caller's IP (checked — a live sign-in
request with its `remote_addr`), but the oldest record of any kind in the log
store this morning was roughly ten minutes old. These logs are for live
debugging, not a record you can look back through next week, and they are not
reachable from inside the app.

**Our own tables record who did what, but never where from.**
- `audit_log` — user, role, action, entity, tenant. No IP, no device (checked).
- `login_attempts` — a failed-attempt counter per email, for the lockout. No
  IP, no device, no success events (checked).
- `support_reports` — the richest device record we have: browser, version, OS,
  device type, viewport, user agent, online state, route — but only when
  someone taps "Report an issue" (checked).
- `edge_function_logs` — backend failures, shown at System Logs, with a "Clear
  All" button and no age limit or automatic purge (checked).
- The superadmin "Login Events" card does **not** read login events: it reads
  lockout notifications (checked). Successful logins, sign-outs, password
  resets and password changes are recorded nowhere.

**Nothing tracks visitors who are not logged in.** The published pages load a
third-party marketing visitor script; there is no first-party record of page
views at all. Separately, the privacy policy names Google Analytics, which the
app does not actually load — the policy and reality disagree and that needs
correcting either way.

**The privacy policy has no logging section.** Retention covers booking data,
closed accounts and trials only. IP addresses, device data and security logs
are not mentioned, so today we have no published basis for keeping them.

## 2. What is genuinely missing

1. A login/session event record: successful sign-in, sign-out, password reset,
   lockout, and the failure reason — with IP and device, per tenant.
2. A first-party record of anonymous site visits.
3. A superadmin screen to read all of it, filterable by tenant and user.
4. Failure-path reporting across the app. The Safari sign-in gap that was just
   closed was not unique: silent `catch` blocks are the norm rather than the
   exception, so most failures leave no trace anywhere.
5. Automatic deletion. Nothing in the system deletes logs on a schedule today.

## 3. Proposed build (four phases, each separately approved)

Approved scope: Phases 1 and 2 ship together as one piece of work, and only
after the Safari connection-check investigation is closed. Phases 3 and 4 are
on hold.

### Phase 1 — Login and session events, with a screen to read them
One new table written only by the server, so the IP comes from the request
itself and can never be spoofed by the browser. One row per event: type, time,
user, tenant, IP, and device summary (browser, OS, device type, app vs browser).

Recorded events: successful sign-in, failed sign-in (with the reason — wrong
password, network failure, locked out), sign-out, password reset requested,
password changed, and account lockout.

**Front-end deliverable — Login Activity screen (the point of Phase 1).**
A proper table screen inside the admin area, not database access:

- A tenant picker at the top: All tenants, or one company.
- Columns: Time (DD/MM/YY HH:MM), User (name and email), Result (green
  Success / red Failed badge with the reason), IP address, Device (browser,
  OS, phone or desktop, installed app or browser).
- Filters beside the tenant picker: result (all / success / failed only) and a
  search box for email or IP.
- Newest first, paged, with a refresh button; loading, empty and error states
  matching the existing admin tables.
- Mobile card layout so it is readable on a phone.

Access is by superadmin role, checked both in the screen and in the database —
no account email is hardcoded anywhere. Tenant owners and engineers cannot
reach the data at all, by screen or by direct API call.

### Phase 2 — Retention, documentation, and the legal paperwork
Scheduled nightly deletion for every log table, the retention table below
published in the privacy policy, and an internal record of processing
(what we log, why, how long, who can see it) written to `docs/privacy/`.
Also in this phase: correct the privacy policy's Google Analytics mention,
since the app does not load Google Analytics.

### Phase 3 — Anonymous visitor tracking
Recommended shape: server-side counting only — page, referrer, country,
device class, and a shortened IP that cannot identify a household. No
identifier is stored on the visitor's device, and visits are not linked
together into a journey. That keeps it outside consent-banner territory and
still answers "how many people hit the booking page, on what, from where".
If you want full per-visitor journeys instead, that needs a cookie banner and
becomes a bigger piece of work — flagging it as your decision, not an
assumption.

### Phase 4 — Failure-path reporting sweep
Go through the silent failure paths — sign-in, job completion, payment writes,
photo upload, WhatsApp sends — and make each one report with enough context to
diagnose it, the way sign-in now does. No new logging system; this feeds the
tools already in place.

## 4. Retention and access proposal

| Data | Kept | Then |
| --- | --- | --- |
| Login/session events, full IP | 90 days | IP shortened, event kept 12 months |
| Login/session events, no IP | 12 months | deleted |
| Anonymous visits (shortened IP) | 90 days raw | daily totals kept 24 months |
| Backend failure logs | 30 days | deleted |
| Support reports (device info) | 12 months | deleted |
| Crash/error reports in the error tool | as configured there | deleted by the tool |

Access: superadmin only, enforced in the database as well as in the screen, so
a tenant owner cannot reach another tenant's rows even by calling the API
directly. Reading the log screen is itself recorded, so there is an answer to
"who looked at this". Subject access and erasure requests must include these
tables — that gets written into the documentation in Phase 2.

Legal basis: legitimate interest (security and fraud prevention) for the login
and failure logs, which is the standard basis for security logging and is why
90 days is defensible where "forever" is not.

## 5. How this relates to the error-reporting tool

They stay separate, with one rule each:

- The error tool (Sentry, already live) is the **diagnostic** layer: stack
  traces, session replay, releases, tags. Short-lived, technical, disposable.
- The new activity log is the **record** layer: who signed in, from where, what
  changed. Legally significant, retention-controlled, superadmin-only.

Unifying them would be a mistake in both directions: it would either put
personal data into a third-party tool with looser retention, or turn our
database into a crash reporter it is not built to be. One thing does need
deciding in Phase 1: whether the error tool is allowed to attach IP addresses
at all. My recommendation is no — keep IP in our own EU-hosted database only,
with the retention above.

## Technical notes

- Superadmin gating exists already (`profiles.role = 'superadmin'`,
  `src/components/shared/SuperAdminRoute.tsx`). Phase 1 adds a matching
  security-definer helper so RLS can enforce the same rule, following the
  `has_office_access()` pattern already in the database.
- Events are written by an Edge Function reading the forwarded client IP, never
  by the browser; the client sends only the event type and device summary. IP
  stored as `inet`, shortened with `set_masklen` (/24 IPv4, /48 IPv6).
- Phase 1 needs grants plus RLS in the same migration, per the project rule,
  and no `anon` read.
- Deletion runs as `pg_cron` jobs with credentials inlined literally — the
  `current_setting('app.*')` pattern is known broken in this project.
- Reuse of existing parts rather than new ones: `supportDiagnostics.ts` already
  derives the device summary; `audit_log` keeps its current job (business
  actions) and is not merged into the new table.
- Out of scope throughout: tenant isolation rules, auth behaviour, payment
  paths, and the Safari investigation now in flight.
