# Fix: cleared fields silently keep their old value (Admin → Customer Integrations)

Blanking a field in **Admin → Customer Integrations** and saving shows "Integrations saved" but the old value stays in the database. Confirmed cause: the save handler drops every empty value before merging, so a cleared field is indistinguishable from an untouched one.

Scope is this one handler. The Stripe key-name split and the dead `company_name`/`company_phone` fields I flagged in the audit stay open as separate items.

## What changes for the user

- Clearing a field and saving now **removes that setting** from the tenant. The backend then treats it as never configured — e.g. a blank Renewal/Warranty Form URL makes warranty sends skip for that tenant instead of using a stale URL.
- Clearing a **credential** field asks for confirmation first, naming the tenant and the fields, because it stops payments or WhatsApp for that tenant immediately. Credential fields: SumUp Merchant Code, SumUp API Key Secret Name, 360Messenger Secret Name.
- Fields left untouched are unaffected, and any config keys this screen doesn't show are preserved exactly as before.
- The success toast reports what actually happened, so a save that changed nothing can't look like a save that changed something.

## How it works

**New pure helper — `src/lib/tenantIntegrationConfig.ts`**

`buildTenantConfigRows(sections, values, existingByType)` returns, per integration type:

- the merged config, where a trimmed non-empty value is written and an empty value causes `delete` of that key (rather than being filtered out of the patch),
- untouched keys from the existing config carried through unchanged,
- a summary of `{ updated: string[]; cleared: string[] }` for the confirmation step and the toast.

Values are trimmed on the way in, matching what the tenant-facing Integrations tab already does. A config that ends up empty is left as `{}` on the existing row — no row deletion, so `is_active` and row identity are untouched.

**`src/components/admin/CustomerIntegrationsTab.tsx`**

- `handleSave` calls the helper instead of the inline `cleaned` filter, then upserts the same way it does today (`onConflict: "organisation_id,integration_type"`).
- If the summary's `cleared` list contains any credential key, show an AlertDialog naming the tenant and the specific fields; proceed only on confirm.
- After a successful save, re-read the tenant's config so the form reflects the database rather than local state.
- Toast wording driven by the summary: `Integrations saved`, `Saved — 2 settings cleared`, or `No changes to save`.

**Tests — `src/lib/__tests__/tenantIntegrationConfig.test.ts`**

Regression test for the reported bug plus the boundaries:

- blanking a field removes the key from the merged config (the bug — fails before the change),
- a whitespace-only value counts as cleared,
- unrelated keys not shown on this screen survive the merge (`environments`, `country_code`, `templates`, `review_webhook_secret` all exist in live data),
- an untouched field keeps its value and is not listed as updated,
- the summary lists cleared credential keys so the confirmation can trigger,
- clearing every field of a type yields `{}` rather than a dropped row.

## Verification

- Full unit suite green, typecheck clean.
- Live check against **Cavan Gas** (the test tenant): clear its `tally.new_booking_url`, save, confirm via a database read that the key is gone; then re-enter it and confirm it comes back. No live tenant config touched.
- Confirm the credential confirmation dialog appears when clearing a SumUp field, and that cancelling it writes nothing.

## Risk

Medium — it writes tenant config that payment and WhatsApp routing read. The clearing path is new behaviour, so the merge logic is a pure, unit-tested function and the destructive case is gated behind confirmation. Verification uses Cavan Gas only.
