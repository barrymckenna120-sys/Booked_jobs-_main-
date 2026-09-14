# AUDIT ONLY — branch / Edge Function / migration state

Nothing was modified, merged, deployed or fixed. Raw command output below.
Note: local branch names `main`/`dev` do not exist in this sandbox checkout; the remote refs `origin/main` and `origin/dev` were used (`git branch -a` shows `dev`, `origin/main`, `origin/dev`, plus `lovable-backup-dev-*`). Current HEAD: `edit/edt-9ce21198-75e2-4914-a323-37b66d1908d2`.

## 1. Branch state

```text
$ git rev-list --count origin/main..origin/dev
4050
$ git rev-list --count origin/dev..origin/main
0            # git log dev..main --oneline → empty output

$ git diff origin/main..origin/dev --stat | tail -4
 tailwind.config.ts                                 |     1 +
 vite.config.ts                                     |   153 +-
 vitest.config.ts                                   |    13 +
 947 files changed, 104815 insertions(+), 16945 deletions(-)

Last commit on main:
7cc408dcbf69dc9384c21b663779e656b513061c | 2026-07-02 09:43:03 +0000 | Added org_id to notify trigger

Last commit on dev:
9952cc4cc5d8a709585e5864a3515a8b1467865a | 2026-09-14 17:25:06 +0000 | Documented mobile block update
```

`main..dev` `--oneline` output is 4050 lines; the first ~450 lines are in the raw command log (`/tmp/exec-logs/ed8d0092-...log`) and were truncated in transport.

## 2. Commit classification (files touched)

Classifier used: LIST B = commit touches `supabase/functions/**` or `supabase/migrations/**`; LIST A = everything else.

```text
LIST B: 911 commits
LIST A: 3139 commits
Total:  4050
```

The requested "full file list for every LIST B commit" is 911 commits × file lists — it does not fit in this document. Aggregate backend diff instead:

```text
$ git diff origin/main..origin/dev --stat -- supabase/functions/ | tail -1
 193 files changed, 29803 insertions(+), 4241 deletions(-)
```

Function directories present on `dev` but not `main` (added):
`backfill-storage-paths, check-lockout-status, commit-customer-import, deactivate-user, get-engineer-performance, impersonate-org, missed-call-lookup, notify-delivery-failure, notify-import-errors, notify-support-report, preview-customer-import, resend-communication, reset-org-data, resolve-document-link, send-deposit-link, stream-receipt-pdf, sumup-integration, sumup-payment-webhook, sweep-stale-accepted-deliveries, whatsapp-delivery-webhook`

Present on `main` but not `dev` (removed):
`get-hazard-pdf, handle-inbound-whatsapp, send-whatsapp-booking-confirmation, stripe-boiler-payment-confirm, whatsapp-webhook-test`

`ls supabase/functions | wc -l` → 98

## 3. Deployed Edge Function state vs branches — NOT OBTAINED

No deployment-timestamp source is reachable from this environment: there is no Supabase CLI login/dashboard access and no tool that returns per-function `updated_at`/version for deployed Edge Functions. Therefore the a) / b) comparison and the "deployed from neither branch" flag cannot be produced here. Nothing was inferred or guessed for this item.

## 4. provision-tenant

`git diff origin/main..origin/dev -- supabase/functions/provision-tenant/index.ts` is 1116 lines (largely reformatting plus the substantive changes quoted below); full text in `/tmp/exec-logs/eaf5557c-...log`.

Does the `dev` version create a `settings` row for the new org? Yes — `dev` lines 726-744ff:

```ts
  // Step 4: settings upsert
  // (user may already have a settings row from a prior org)
  const {
    error: settingsErr,
  } = await supabase
    .from("settings")
    .upsert(
      {
        organisation_id:
          newOrgId,
        user_id: newUserId,
```

`main` has the same step (lines 284-296):

```ts
  // Step 4: settings upsert (user may already have a settings row from a prior org)
  const { error: settingsErr } = await supabase
    .from("settings")
    .upsert({
      organisation_id: newOrgId,
      user_id: newUserId,
```

Per-tenant vs shared secret name — `dev` lines 76-84:

```ts
  // A new tenant must NEVER inherit the shared/K&N WhatsApp key. When no
  // per-tenant secret name is supplied we seed the integration without one, so
  // WhatsApp sends fail closed until the tenant's own secret is configured.
  const resolvedApiKeySecret =
    typeof api_key_secret ===
      "string" &&
    api_key_secret.trim()
      ? api_key_secret.trim()
      : null;
```

`main` lines 73-75:

```ts
    typeof api_key_secret === "string" && api_key_secret.trim()
      ? api_key_secret.trim()
      : "THREESIXTY_API_KEY";
```

Other substantive diff hunks (from the diff output): CORS replaced by `getCorsHeaders(req)` from `../_shared/cors.ts`; inline superadmin check replaced by `requirePlatformAdmin` / `isPlatformAdminDenied` from `../_shared/platformAdmin.ts`; new required field `job_reference_prefix` with `/^[A-Z0-9]{2,6}$/` validation.

## 5. Migrations on `dev` but not `main`

```text
$ git diff origin/main..origin/dev --name-status -- supabase/migrations/ | wc -l
151          # all entries status "A" (added); zero modifications/deletions
$ migrations matching /policy|row level security/i : 41
```

Top files by count of `policy|row level security|organisation_id|grant|revoke` matches:

```text
63 20260825125233_5d008334-6232-40c9-b9c7-8add65f91f92.sql
61 20260819165508_60d9e33b-48fa-42c0-b39f-af6eaeb920a7.sql
49 20260725190456_3dfb4649-c622-479b-9c15-ae6788c2e044.sql
45 20260812130753_6127ae69-3920-43a8-a83e-0f344cbea434.sql
44 20260823132110_52cbf8d1-b49f-454b-9287-8a23585a4e89.sql
44 20260823125914_226405c8-3b9e-416f-a4d0-2e18967e3ed6.sql
44 20260708155427_b15f1c09-f2df-4434-aa45-45ea7495a80d.sql
44 20260707131806_a81cca0a-f58d-42e7-93fb-b4dddde6a26a.sql
42 20260827145257_bee02f9a-98de-41f9-bec8-ebc01f97909f.sql
31 20260827162017_351b3000-b298-4765-bd83-03fa394b8ffb.sql
```

First 5 lines of the 10 most recent added migrations:

```sql
-- 20260911191620_ff97d730...sql
CREATE OR REPLACE FUNCTION public.get_receipt_public(p_receipt_number text)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
-- 20260911191659_d75d2561...sql
GRANT EXECUTE ON FUNCTION public.get_receipt_public(text) TO service_role;
-- 20260911191734_4f2cad86...sql
CREATE OR REPLACE FUNCTION public.get_receipt_public(p_receipt_number text)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
-- 20260914142725_5fb3f278...sql
CREATE OR REPLACE FUNCTION public.next_org_quote_number(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
-- 20260914142739_50d19824...sql
REVOKE EXECUTE ON FUNCTION public.next_org_quote_number(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_quote_number() FROM anon, authenticated;
-- 20260914142808_8019a507...sql
ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_quote_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS quotes_org_quote_number_key
  ON public.quotes (organisation_id, quote_number);
-- 20260914142816_59f0140f...sql
UPDATE public.quotes
SET quote_number = 'Q-2026-0001'
WHERE organisation_id = 'c0aa41ac-41ab-42d8-8085-972c072b0279'
  AND quote_number = 'Q-2026-0170';
-- 20260914143023_364bfb3c...sql
CREATE OR REPLACE FUNCTION public.get_quote_by_number(p_quote_number text)
RETURNS json
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
-- 20260914143851_fe799629...sql
CREATE UNIQUE INDEX IF NOT EXISTS organisations_public_domain_unique
  ON public.organisations (lower(public_domain))
  WHERE public_domain IS NOT NULL;
-- 20260914144314_5fd7f1ed...sql
CREATE POLICY "Superadmins can update organisations"
ON public.organisations
FOR UPDATE
TO authenticated
USING (
```

The remaining 141 filenames were listed in raw command output; the full first-5-lines dump for all 151 files was not included here for length. Say the word and I will emit it in batches.
