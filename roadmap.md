# Roadmap

- [x] BJ-0090 — Jobs list shows full assigned team (Lead + Assistants) on desktop table and mobile card; role labels only when assists exist; single batched `job_engineers` lookup; unit tests for grouping/labels.
- [x] Bug: Possible Duplicate badge missing on Schedule page — `Schedule.tsx` now carries `possible_duplicate` into `ScheduleJob`; badge rendered on weekly grid (desktop + mobile) and Unallocated Jobs cards. Detection logic untouched.
- [x] BJ — Lookup failures must not become "no match"/successful skip: `DeliveryLookupError` in `_shared/deliveryStatus.ts`, 503 `lookup_failed` in `whatsapp-delivery-webhook`, distinct `lookup_failed` consent reason.
- [ ] Inbound WhatsApp → Customer Message History: configure `WHATSAPP_INBOUND_SECRET` (missing → deployed `whatsapp-inbound` returns 401), run isolated scratch-customer end-to-end webhook test (persistence, matching, dedupe, UI), then hand off callback URL to 360Messenger (registration currently 403 — provider-side blocker).
