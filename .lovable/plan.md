
## Fix 3 revised — clean up orphan profile + reconcile role source

Based on the evidence: `c9de0c69-f913-47ca-847c-e6d862000279` is **an orphaned profile row pointing at a non-existent auth user**. Not in `auth.users` (verified via `list-users`), zero activity, never modified since insert. Safe to delete — cannot be signed into, cannot escalate.

### Step 1 — Delete the orphan profile row

- Via the insert (data) tool:
  - `DELETE FROM public.profiles WHERE id='67a5d82c-4697-48e4-9ada-a97ebed82286' AND user_id='c9de0c69-f913-47ca-847c-e6d862000279';`
- Nothing else to touch — no auth.users row exists to delete, no service_calls/notifications/audit rows reference it.

### Step 2 — Prevent recurrence

Add `ON DELETE CASCADE` semantics so profile rows can't outlive their auth user. Two options:

- **Preferred:** add a FK `profiles.user_id → auth.users(id) ON DELETE CASCADE` (via migration). Requires that no *other* current orphans exist — verify with a `LEFT JOIN` first; abort if any surface.
- **Fallback if any other orphans exist:** delete them in the same migration after listing them for the user's approval.

### Step 3 — Reconcile "who is really an admin"

The K&N admin listing shows Karl as `admin` because it reads `profiles.role`, but his `engineers.role='engineer'`. Two paths:

- **A (surgical, low risk):** downgrade only Karl's `profiles.role` from `admin` → `engineer`. Office access continues via `engineers.can_access_office=true` (Fix 2 already makes this work in `OfficeRoute`).
  - `UPDATE profiles SET role='engineer' WHERE user_id='57ebf8de-b2d3-44bc-90b0-071d750a3f46';`
- **B (broader):** run the same reconciliation for every profile where `profiles.role='admin'` but the linked engineers row is `role='engineer'`. Report the list to the user first; only then update.

Recommend **A** now and **B** as a separate audit later.

### Step 4 — Verify

- `list-users` no longer returns a "Karl" admin duplicate.
- Karl (`engapp@…`) can still sign in (incognito), still lands on `/dashboard`, still reaches office pages (relies on Fix 2's `OfficeRoute` change + `can_access_office=true`).
- Nothing else in the admin listing changed.

### Out of scope

- Not touching `handle_new_user()` — root cause of the original orphan was likely a manual auth.users deletion, not the trigger.
- Not migrating every other org's admin/engineer profile mismatch — user should approve that as a separate pass (Step 3 option B).
