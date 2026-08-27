# Categories tenant isolation

Close the cross-tenant authorisation hole on `categories`, then give each organisation its own copy of the eight shared category rows and retire the shared ones.

This touches RLS and tenant isolation, so it runs as the full process: audit evidence first (done), then each database change as its own independently revertible, review-gated step, verified with a SQL read-back against more than one tenant.

## What is wrong today

- `categories` UPDATE and DELETE policies check the caller's role only — they have no organisation scoping. Any admin, office, owner or manager user in any tenant can rename or delete any category row in the table, including another tenant's.
- The UPDATE policy has no WITH CHECK, so such a user could also rewrite a row's `organisation_id` and hand it to a different tenant.
- INSERT has no organisation check either; correct scoping relies entirely on the column default `get_my_org_id()`, which an explicit `organisation_id` in the request body overrides.
- All eight existing rows have `organisation_id = NULL` and are read by every tenant through the SELECT policy's `organisation_id IS NULL` carve-out. Dublin Gas and K&N are both using the shared "Boilers" row.

The eight rows were created on 31 Mar 2026 and nothing has been added since, so no tenant has ever created its own category.

## Step 1 — Lock down the policies (migration)

Replace the three write policies so every command is scoped to the caller's organisation, and keep the read carve-out for now so nothing breaks before the data moves.

- INSERT: require `organisation_id = get_my_org_id()` in addition to the role check, so an explicit foreign org in the body is rejected rather than silently accepted.
- UPDATE: require `organisation_id = get_my_org_id()` in USING, and add a WITH CHECK with the same condition so a row cannot be reassigned to another org.
- DELETE: require `organisation_id = get_my_org_id()`, which also makes the shared NULL rows undeletable by any tenant.
- SELECT: unchanged in this step.

Read-back: confirm the four policy definitions, and confirm a Dublin Gas session can still read the shared rows.

## Step 2 — Copy the categories to every organisation (data write)

Separate, idempotent data step. For each of the six organisations, insert a copy of each of the eight shared categories (name and description preserved), skipping any name that organisation already has. Expected result: 48 org-owned rows, with the eight NULL rows still present and untouched.

Read-back: per-organisation row counts, and a check that no organisation is missing a name.

Nothing needs repointing — `products.category` is free text matched by name, not a foreign key, so copied rows keep working for existing products with no further change.

## Step 3 — Retire the shared rows (data write, then migration)

Once step 2 reads back clean:

- Delete the eight `organisation_id IS NULL` rows.
- Then drop the `organisation_id IS NULL` carve-out from the SELECT policy, leaving plain `organisation_id = get_my_org_id()`.

Read-back: zero NULL rows remain, and each tenant still sees exactly its own eight categories.

## Step 4 — Tidy the frontend

`src/components/products/CategoriesTab.tsx` inserts `{ name, description }` and lets the column default supply the organisation. Set `organisation_id` explicitly from `useOrgId`, matching how the Products page already does it, and block the save with the existing "Organisation not ready" style guard when the org has not resolved yet. Also add an explicit `organisation_id` filter to the two category reads (`CategoriesTab.tsx` and `src/pages/Products.tsx`) as defence in depth, so a future policy regression cannot leak the list.

## Verification

- Category list renders unchanged for K&N and for Dublin Gas (2+ tenants, per process).
- Creating a category from the UI produces a row carrying the correct `organisation_id`.
- A tenant cannot update or delete a category belonging to another organisation.
- Product category filter pills and the Add/Edit Product category dropdown still populate.
- Regression test covering the tenant-scoping predicate, plus loading and empty states checked.

## Not in scope

The `products` findings from the earlier audit (defence-in-depth organisation filters on the product reads, and the 12 Dublin Gas quote line items pointing at K&N products) are held for a separate pass.
