# Dublin Gas Messaging Catalogue — verified: the page is wrong, not the config

## Raw evidence (live, queried just now)

`settings` for Dublin Gas — the row exists and is fully populated:

```text
 cert_prefix | business_name | company_name | business_phone | company_phone |                    message_footer                     | google_review_url |          updated_at
 DG          | Dublin Gas    | Dublin Gas   | 01 2121211     | 01 5433433    | Dublin Gas | 5 Main Street, Swords, Co. Dublin | 01 5433433 | (blank)           | 2026-08-12 14:31:44.391426+00
```

`tenant_integrations` for Dublin Gas — stripe row:

```text
 stripe | {"payment_link": "https://buy.stripe.com/28EbIU07v4d28zr9hIcQU0d", "payment_link_url": "https://buy.stripe.com/28EbIU07v4d28zr9hIcQU0d"} | updated_at 2026-07-15 14:13:37+00
```

Both stripe keys hold the identical URL, so there is no "different" link — only the same value read under a different key name.

Nothing changed: `settings.updated_at` is 2026-08-12, all `tenant_integrations.updated_at` are 2026-07-15 or earlier (make row 2026-08-05). No config edits between the two reports.

## Root cause

`settings` RLS has only own-org policies:

```text
 settings_select | SELECT | (organisation_id = get_my_org_id())
```

There is no superadmin cross-org SELECT policy on `settings`, unlike `tenant_integrations`, which does have `Superadmin full access tenant_integrations`.

So when a superadmin whose own org is K&N opens the catalogue for Dublin Gas:

- the `tenant_integrations` read succeeds (visible in the network capture)
- the `settings` read returns `[]` (also visible in the capture: `settings?...organisation_id=eq.f1950683...` → `[]`)

`resolveTenantConfig` then sees `settings = null`, so every settings-sourced key — cert_prefix, message_footer, business/company name, business/company phone, google_review_url — resolves to "not configured", cascading into the extra Will skip / Will degrade rows (booking confirmation, schedule/reschedule, cancellations, quote sent, quote follow-ups, quote accepted alert, acceptance confirmation).

My earlier 30 Ready / 1 degrade / 7 skip report was computed with a direct database query, which bypasses RLS. That number describes the real config; the page's number describes what the page can see. The screenshot is the honest one about the page — the page is under-reporting because it is blind to other tenants' `settings`.

## Fix

Add a superadmin cross-org read policy on `public.settings`, mirroring the existing one on `tenant_integrations`:

```sql
create policy "Superadmin read all settings"
on public.settings
for select
to authenticated
using (exists (
  select 1 from public.profiles p
  where p.user_id = auth.uid() and p.role = 'superadmin'
));
```

SELECT only — no write access widened, no change to own-org policies, no change to `resolveTenantConfig` or any UI file.

## Verify after the fix

1. Load /admin → Messaging → Dublin Gas in the browser and read the resolved-config block: cert_prefix `DG`, footer and phones populated, google_review_url still "not configured".
2. Confirm counts move to the true figures (expected 30 Ready / 1 Will degrade / 7 Will skip, remaining gaps being SumUp merchant code and Google review URL).
3. Load Cavan Gas and K&N to confirm neither regressed.
4. Confirm no writes: the page still issues SELECTs only.
5. Re-run the catalogue drift test suite.

## Open question

The tenant-facing Message Status panel is unaffected (tenants read their own `settings`, which their own-org policy allows) — worth a click-through on Dublin Gas as a sanity check but no change is expected there.
