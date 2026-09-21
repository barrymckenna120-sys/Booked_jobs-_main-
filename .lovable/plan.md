# Phase 3B — Tally "Find My Boiler" → New Boiler Enquiry

## Audit findings (read-only, verified in code and database)

### What can be reused safely
- **Tenant resolution**: `bindMachineOrganisation` (`_shared/machineOrg.ts`) already resolves the tenant server-side from a per-tenant webhook secret or a Tally form id held in `tenant_integrations` (type `tally`). Existing tenants already store `webhook_secret` + `new_booking_form_id` / `renewal_form_id` there.
- **Customer matching**: `_shared/matchCustomer.ts` (exact phone → last-9 fallback → email), plus `_shared/phone.ts` normalisation. Exactly the required matching order.
- **Media**: private `job-media` bucket (images/video only, 50MB cap) + `job_media` rows + existing gallery/lazy-thumbnail components, and the Cloudinary intake path already used for Tally uploads.
- **Notifications**: `notifications` table with `role: 'office'` + existing bell/badge surface.
- **Activity**: `customer_activity` (event_type/event_label/event_data, org-scoped).
- **Diagnostics**: `edge_function_logs` + `debug_logs` patterns used by both Tally functions.
- **Office gating**: `OfficeRoute` (engineers excluded), `useOrgId`, standard RLS shape `organisation_id = get_my_org_id()`.
- **Quotes**: existing quote flow (`QuoteForm`) already creates or reuses a placeholder job when quoting a customer, so no quote rewrite is needed.

### What must NOT be reused
- **`tally-incoming-job` / `tally-boiler-rebook`**: both create a scheduled `service_calls` row. An enquiry is not a job — a separate function is required, and neither existing function will be touched.
- **`tally-webhook`**: legacy, no tenant scoping — not to be extended.
- **The `unbound_claim` fallback** in `bindMachineOrganisation` (accepts a body-supplied org when no tenant secret exists). The new endpoint will refuse to proceed unless the tenant was resolved from its own secret or form id.
- **`service_calls` as an enquiry store**: 92 columns, drives scheduling, reminders and revenue. Not appropriate.

### Prerequisite / blocker
There is **no "New Gas Boilers Dublin" organisation** in the database today. The tenant must be provisioned (existing provisioning flow) and given a `tally` integration row with its own webhook secret and the enquiry form id before the live form can be connected. Build and tests proceed against a test tenant meanwhile.

### Risks
- Tally webhooks are unauthenticated by default — the secret must be sent as a header from Tally/Make, or the endpoint rejects the call (fail closed).
- Tally file URLs expire, so photos are copied server-side at intake, with type/size validation.
- Writing the raw payload means personal data in a jsonb column — restricted to office/admin reads, never rendered in customer-facing UI.
- Risk to existing production flows: none of the booking, renewal, quote, payment, WhatsApp, scheduling or engineer paths are modified; the only edits to shared code are additive optional prefill on the quote form.

## What will be built

### Database (one migration)
- `boiler_enquiries` — org-scoped, `customer_id`, `enquiry_type`, `status` (NEW/CONTACTED/NEEDS_INFO/READY_TO_QUOTE/QUOTED/WON/LOST, default NEW), `assigned_to`, all property / existing-heating / heating-system / hot-water / preference / extras / heat-pump / contact fields from the brief, attribution (`source`, `landing_page`, `utm_*`, `referrer`), `external_source`, `external_submission_id`, `raw_payload jsonb`, timestamps + update trigger.
- Unique index on `(organisation_id, external_source, external_submission_id)` for idempotency.
- GRANTs then RLS: office/admin of the owning org can read and update; engineers get no access; writes from the webhook use the service role.
- Additive nullable `boiler_enquiry_id` on `job_media` (photos) and on `quotes` (enquiry → quote, many quotes per enquiry), each with an index. No existing column or policy changes.

### Backend
New Edge Function `tally-boiler-enquiry`: shared CORS, machine-auth gate, strict tenant binding, payload size + schema validation, field normalisation, submission-id idempotency (returns the existing enquiry), customer match-or-create (missing fields filled only when blank; differences recorded for office review, never overwritten), photo download → validate → tenant-scoped storage → `job_media` rows, attribution stored on the enquiry, `customer_activity` "Boiler enquiry received", office notification, and staged failure logging with no secrets.

### Office UI (behind `OfficeRoute`)
- `/enquiries` — list/cards: customer, area/eircode, property, current heating, beds, baths, timeframe, status, submitted, source; filters (status, timeframe, source, current heating) and search (name, mobile, email, address, eircode); NEW badge using the existing notification/badge style.
- `/enquiries/:id` — header with customer + Call / WhatsApp / Request Info / Create Quote; compact sections Property, Hot Water, Heating System, What Matters (prominent), Heat Pump (only when relevant), Photos (lazy thumbnails, tap to enlarge), Source & Attribution (collapsed), Activity, and linked quotes with number + status. Empty values are omitted.
- Create Quote opens the existing quote flow prefilled with the customer and the enquiry reference, and links the created quote back to the enquiry. Request Info and WhatsApp reuse the existing communication actions. No job is ever created automatically.

### Tests
New-customer intake, existing-customer intake, duplicate/retry submission, missing optional answers, absent conditional fields, with/without photos, invalid payload, unknown form (rejected), tenant isolation, existing customer with a different address, office-permission gating, and the enquiry→quote link. Plus the full existing suite, type check and production build.

## Notes for you
Nothing in Phase 3C is started: no boiler sizing, recommendations, heat-pump eligibility, deposits, finance, public quote URLs or scheduling. After implementation you will get the exact webhook URL, the header name and value to set in Tally/Make, and the full Tally field → BookedJobs field mapping.
