# Roadmap

- [x] BJ-0090 — Jobs list shows full assigned team (Lead + Assistants) on desktop table and mobile card; role labels only when assists exist; single batched `job_engineers` lookup; unit tests for grouping/labels.
- [x] Bug: Possible Duplicate badge missing on Schedule page — `Schedule.tsx` now carries `possible_duplicate` into `ScheduleJob`; badge rendered on weekly grid (desktop + mobile) and Unallocated Jobs cards. Detection logic untouched.
- [x] BJ — Lookup failures must not become "no match"/successful skip: `DeliveryLookupError` in `_shared/deliveryStatus.ts`, 503 `lookup_failed` in `whatsapp-delivery-webhook`, distinct `lookup_failed` consent reason.
- [ ] Inbound WhatsApp → Customer Message History: configure `WHATSAPP_INBOUND_SECRET` (missing → deployed `whatsapp-inbound` returns 401), run isolated scratch-customer end-to-end webhook test (persistence, matching, dedupe, UI), then hand off callback URL to 360Messenger (registration currently 403 — provider-side blocker).
- [x] Mobile client-readiness follow-up: remove Quote Detail line-item overflow and place the labelled New Job action before the office-header utility icons.
- [x] Dashboard UI redesign — grouped office navigation, compact utility header, refined KPI/schedule/attention/revenue hierarchy, and responsive verification without logic or route changes.
- [x] Engineer View + Admin shell desktop refinement — persistent grouped navigation, explicit workspace switching, responsive Engineer content/detail views, and mobile-safe Admin navigation without route or workflow changes.
- [x] Engineer workspace utility refinement — shared desktop sidebar workspace switches, removed duplicate in-content switch, and renamed the existing bug-report action without changing mobile behavior or workflows.

- [x] Mobile UX redesign — Office + Engineer shared light header (identity, single permission-gated switch, bell, More menu), tidier dashboard/job-card hierarchy, always-labelled engineer bottom nav. Mobile only; desktop untouched.
- Mobile workspace switch clarity: plain current-workspace label, outlined destination switch, ArrowLeft back-to-Office (BJ mobile UX)
- [x] DG-1019 reconciliation — €1,537.50 card payment re-labelled full (was deposit), job marked paid with zero balance; status/completion left untouched.
- [x] Engineer job-card Media sheet photo upload — customer-scoped storage path + surfaced upload/insert errors (matches PhotoSheet/MediaGallery).
- [x] Weak-network auth — bounded sign-out with local fallback (single path), abandoned-attempt guard + bounded timeout on sign-in/lockout check, bounded pageshow session check.
- [x] Payment write diagnostics — structured before/patch/ledger/error logging and honest failure copy instead of blanket "No connection".
- [ ] Payment classification root cause (deposit vs full on completion) — awaiting real diagnostics from a live completion, then fix + regression test.
- [x] Fully paid presentation — settled jobs no longer show historical deposit wording; genuine partial deposits keep their deposit and balance labels.
- [x] Finance Sales search — customer, job reference, receipt and invoice matching; contextual no-results state; direct receipt action on Office job details.
- [x] Receipt PDF download — iOS-safe immediate loading route, bounded weak-network handling, secure public receipt resolution, and tenant-isolation verification for K&N and Dublin Gas.
- [x] Tenant initialisation v1 — product-owned `_shared/tenantDefaults.ts`, `organisations.tenant_config_version` (existing tenants stay 0), idempotent provisioning of approved BookedJobs defaults in `provision-tenant`. No K&N runtime source, no existing-tenant backfill.

- [x] Tenant initialisation v1 clean-tenant E2E — fresh tenant provisioned (Ennis Test Gas): blank public web address, empty service areas, config version 1, 6 categories, branding, 3 integrations, settings defaults. Job completion, certificate draft, renewal date, isolation (both directions) and re-run safety verified.
- [ ] BJ — Welcome tour hardcodes "Karl's Gas" (src/components/OnboardingTour.tsx:144); parameterise per tenant.
- [ ] BJ — Area-code/Eircode validation rejects F-prefix routing keys (AREA_CODE_RE in src/lib/customerValidation.ts); needs Irish routing-key review.
- [ ] BJ — WhatsApp/SumUp "not configured" errors surface raw technical text; replace with "WhatsApp is not connected for this company" style copy.
- [ ] BJ — Certificate form does not prefill the tenant's RGI number from settings (blank on new tenant cert).
- [ ] BJ — No tenant health-check/validation tool exists yet (P2 from provisioning audit).
- [x] Customer export — Select → Preview → Export flow (searchable, filterable, org-scoped selection) with one canonical row builder shared by preview and Excel, expanded customer-profile column set.
- [ ] Bookings Step 1 (re-targeted at K&N Gas Services Ltd) — Tally booking dates land in the past (first seen via DG-1023..DG-1026, dated 03/04 Sep). `tally-incoming-job` submission log now records submitted `preferred_day`/`preferred_time` + past-date diagnostics; evidence now comes from a real K&N Gas Services Ltd booking (book.kngasservices.ie), then agree the handling fix.
- [ ] Bookings Step 2 (re-targeted at K&N Gas Services Ltd) — one booking creating two jobs with distinct submission ids (id-based guard can't catch it); content-window dedupe at intake; shared code, verify against K&N Gas Services Ltd bookings.
- [ ] Bookings Step 3 — Schedule presentation: surface unallocated jobs dated outside the visible week and mark past booked dates; shared presentation code, all tenants.
- [ ] On hold awaiting Barry — confirm Dublin Gas's role (clarified 16/09/26 as a test account, K&N Gas Services Ltd the live booking tenant); until confirmed, DG-1023..DG-1026 left untouched as evidence; deferred fallback-door closure also waits on this.
