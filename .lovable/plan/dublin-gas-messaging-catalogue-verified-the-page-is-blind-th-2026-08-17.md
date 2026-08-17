# Dublin Gas Messaging Catalogue — verified: the page is blind, the config is fine

## Raw evidence (live, queried this turn)

`settings` for Dublin Gas — row exists and is populated:

```text
 cert_prefix | business_name | company_name | business_phone | company_phone |                    message_footer                     | google_review_url |          updated_at
 DG          | Dublin Gas    | Dublin Gas   | 01 2121211     | 01 5433433    | Dublin Gas | 5 Main Street, Swords, Co. Dublin | 01 5433433 | (blank)           | 2026-08-12 14:31:44.391426+00
```

`tenant_integrations` stripe row:

```text
 stripe | {"payment_link": "https://buy.stripe.com/28EbIU07v4d28zr9hIcQU0d", "payment_link_url": "https://buy.stripe.com/28EbIU07v4d28zr9hIcQU0d"} | 2026-07-15 14:13:37+00
```

Both keys hold the identical URL — no "different" link, just the same value under a second key name.

Nothing changed: `settings.updated_at` 2026-08-12; all `tenant_integrations.updated_at` 2026-07-15 (make row 2026-08-05).

## Root cause

`settings` RLS is own-org only, with no superadmin cross-org read:

```text
 settings_select | SELECT | (organisation_id = get_my_org_id())
 settings_insert | INSERT | with_check (organisation_id = get_my_org_id())
 settings_update | UPDATE | (organisation_id = get_my_org_id())
 settings_delete | DELETE | (organisation_id = get_my_org_id())
```

`tenant_integrations`, by contrast, has `Superadmin full access tenant_integrations`.

So for a superadmin whose own org is K&N, viewing Dublin Gas: the integrations read succeeds, the settings read returns `[]` (confirmed in the network capture). `resolveTenantConfig` then treats every settings-sourced key — cert_prefix, message_footer, business/company name and phone — as "not configured", cascading into the extra Will skip / Will degrade rows.

My earlier 30/1/7 figure came from a direct database query, which bypasses RLS — that describes the real config. The screenshot describes what the page can see. The page is under-reporting.

## Change to apply

One migration, SELECT only, mirroring the tenant_integrations pattern:

```sql
CREATE POLICY "Superadmin read all settings"
ON public.settings
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.user_id = auth.uid() AND p.role = 'superadmin'
));
```

No write access widened, no existing policy touched, no application file changed.

## Verification after applying

1. /admin → Messaging → Dublin Gas: resolved-config block shows cert_prefix `DG`, footer and both phones populated, google_review_url still "not configured".
2. Counts read 30 Ready / 1 Will degrade / 7 Will skip.
3. Reload K&N and Cavan Gas — neither regressed.
4. Request capture confirms SELECTs only from the page.
5. Re-run the catalogue drift-detection suite — still green.

## Separate audit (report only, no fix in this change)

`src/pages/admin/TenantDetail.tsx` is the other superadmin surface reading another tenant's `settings` (`TenantDetail.tsx:182-187`, business_name / business_email / business_phone / company_name / company_phone / owner_name). It hits the same gap today: the read returns null, so the tenant business-details card shows blanks and falls back to `organisations` values.

It also *writes* cross-tenant settings (`TenantDetail.tsx:233-248`): existence check, then update, else insert. Under the current policies the existence check returns nothing and the update matches zero rows, so the insert path runs and its WITH CHECK (`organisation_id = get_my_org_id()`) rejects it — "Failed to save settings" for any tenant other than the superadmin's own. The SELECT-only policy fixes the display and stops the bogus insert path, but saving another tenant's business details would still fail; whether superadmins should be able to write other tenants' settings is a separate decision.

Everything else reading `settings` (tenant Settings pages, engineer/job/quote/receipt flows, MessageStatusPanel) is own-org and unaffected.
