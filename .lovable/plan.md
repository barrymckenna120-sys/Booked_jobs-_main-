
## Fix 1 — K&N WhatsApp branding

`settings.business_name` for organisation `8c37827f…` (K&N Gas Services) currently reads `"Dublin gas "`. Every WhatsApp receipt/invoice sent from K&N is signed with the wrong company name.

- Data update via the insert (data) tool:
  - `UPDATE settings SET business_name='K & N Gas Services' WHERE organisation_id='8c37827f-ce2c-4507-a821-a5e807d89856';`
- Spot-check `settings.message_footer` and `brand_settings` for the same org for the same wrong string; correct if present.
- No code change — the resolver is correct (branding and API key both keyed off `service_calls.organisation_id`).

## Fix 2 — Role gating consistency (Karl)

Karl has `engineers.role='engineer'` + `can_access_office=true`, but the three code paths disagree on what that means. Result: he is redirected to `/dashboard` after login while `OfficeRoute` (used on some pages) would bounce him. Pick **one rule** and apply it everywhere:

**Rule:** an engineer with `can_access_office=true` is allowed into office views. This matches how the flag is described in `useUserRole` and how `resolveLandingPath` already behaves.

- `src/components/shared/OfficeRoute.tsx`
  - Change gate from `role === "engineer"` to `role === "engineer" && !canAccessOffice`.
  - Pull `canAccessOffice` from `useUserRole` (already exposed).
- `src/lib/resolveLandingPath.ts` — no change (already correct).
- Grep for any other place that treats `role === 'engineer'` as "must go to engineer app" and align with the same rule (expected: `App.tsx` routing, `EngineerLayout` guard). Read-only pass first, then adjust only sites that would wrongly bounce Karl.

## Fix 3 — Duplicate "Karl" profile

Two profile rows both display_name="Karl", both `role='admin'`:
- `57ebf8de…` — linked to the `engapp@bookedjobs.ie` engineer row. Legitimate.
- `c9de0c69…` — no engineer link, full admin. Orphan/duplicate; if signed into, gives Karl unrestricted admin with no engineer gating.

- Confirm with user which auth user `c9de0c69…` maps to (via list-users edge function) before deleting.
- If it is an unused duplicate: delete the auth user (cascades to profile). If it is a real second account Karl uses, downgrade `profiles.role` to `engineer` and add an engineer row (or merge).
- Also downgrade `profiles.role` for `57ebf8de…` from `admin` to `engineer` so profile role matches engineer role — office access continues to flow through `engineers.can_access_office`, not `profiles.role`.

## Verification

- Re-run login in a **clean incognito** as Karl (`engapp@…`). Expected: lands on `/dashboard`, can access office pages, no bounce.
- Send a test invoice from a K&N job → WhatsApp message signs off with "K & N Gas Services".
- Confirm Dublin Gas / Cavan Gas branding unaffected (their `settings.business_name` values are already correct).

## Out of scope

- No changes to `tenant_integrations`, secrets, or the WhatsApp helper.
- No schema changes.
