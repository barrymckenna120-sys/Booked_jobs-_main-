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
