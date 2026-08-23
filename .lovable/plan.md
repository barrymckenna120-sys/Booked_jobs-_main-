# BJ-0071 security correction — real SQL for review (nothing executed yet)

## Confirmed current state (verified this turn)

- `public.protect_parts_request_office_fields()` is `SECURITY DEFINER`, owner `postgres`. Inside it, `current_user` is the **owner**, not the caller — so the existing clause `current_user IN ('service_role','postgres','supabase_admin')` is effectively always true and the bypass reduces to `auth.uid() IS NULL`.
- `parts_requests`: RLS enabled, all 8 policies `TO authenticated`, but the table ACL still grants `anon=arwdDxtm`.
- Trigger in place: `trg_protect_parts_request_office_fields BEFORE INSERT OR UPDATE ... FOR EACH ROW`.
- Function execute ACL is already restricted (`postgres`, `service_role` only) — no change needed there.

## 1 + 2. Complete replacement function and trigger statements

The trigger definition itself does not change shape, but it is dropped and recreated so the deployed object is unambiguous.

```sql
CREATE OR REPLACE FUNCTION public.protect_parts_request_office_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_claims     text;
  v_claim_role text;
  v_is_system  boolean;
  v_changed    boolean;
BEGIN
  -- Caller classification.
  --
  -- NOTE: this function is SECURITY DEFINER owned by postgres, so current_user
  -- is ALWAYS the owner and tells us nothing about the caller. Caller identity
  -- must come from the PostgREST request context instead.
  --
  -- request.jwt.claims is set by PostgREST from the JWT it has already verified
  -- against the project JWT secret. It is:
  --   * absent/empty  -> no API request at all: direct Postgres session
  --                      (migration, pg_cron job, reviewed backfill)
  --   * role 'anon'          -> unauthenticated API request
  --   * role 'authenticated' -> end-user API request (has a sub claim)
  --   * role 'service_role'  -> server-side secret-key request (edge function)
  v_claims := nullif(current_setting('request.jwt.claims', true), '');

  IF v_claims IS NOT NULL THEN
    BEGIN
      v_claim_role := v_claims::jsonb ->> 'role';
    EXCEPTION WHEN others THEN
      v_claim_role := NULL;   -- unparseable claims are never trusted
    END;
  END IF;

  v_is_system := (v_claims IS NULL AND auth.uid() IS NULL)   -- direct DB session
                 OR v_claim_role = 'service_role';           -- server-side key

  -- An anon API request is never a system context, whatever else is true.
  IF v_claim_role = 'anon' THEN
    v_is_system := false;
  END IF;

  IF v_is_system THEN
    RETURN NEW;
  END IF;

  -- Office roles may write these fields at any status.
  IF auth.uid() IS NOT NULL
     AND public.get_user_role(auth.uid()) = ANY (
       ARRAY['admin','owner','office','manager','superadmin']
     )
  THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_changed := NEW.quoted_cost IS NOT NULL
              OR NEW.actual_cost IS NOT NULL
              OR NEW.expected_delivery_date IS NOT NULL
              OR NEW.customer_notified_at IS NOT NULL
              OR NEW.customer_notified_by IS NOT NULL
              OR NEW.customer_notified_method IS NOT NULL
              OR NEW.quote_reference IS NOT NULL
              OR NEW.cost_currency IS DISTINCT FROM 'EUR';
  ELSE
    v_changed := NEW.quoted_cost              IS DISTINCT FROM OLD.quoted_cost
              OR NEW.actual_cost              IS DISTINCT FROM OLD.actual_cost
              OR NEW.cost_currency            IS DISTINCT FROM OLD.cost_currency
              OR NEW.expected_delivery_date   IS DISTINCT FROM OLD.expected_delivery_date
              OR NEW.customer_notified_at     IS DISTINCT FROM OLD.customer_notified_at
              OR NEW.customer_notified_by     IS DISTINCT FROM OLD.customer_notified_by
              OR NEW.customer_notified_method IS DISTINCT FROM OLD.customer_notified_method
              OR NEW.quote_reference          IS DISTINCT FROM OLD.quote_reference;
  END IF;

  IF v_changed THEN
    RAISE EXCEPTION
      'Parts cost, delivery, customer-notified and quote reference fields are office-only';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.protect_parts_request_office_fields() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_protect_parts_request_office_fields ON public.parts_requests;

CREATE TRIGGER trg_protect_parts_request_office_fields
BEFORE INSERT OR UPDATE ON public.parts_requests
FOR EACH ROW
EXECUTE FUNCTION public.protect_parts_request_office_fields();
```

## 3. Each allowed system context, and the actual mechanism that keeps a browser out

| Allowed context | What produces it | Why a browser cannot produce it |
|---|---|---|
| `v_claims IS NULL AND auth.uid() IS NULL` — direct Postgres session | Migrations, `pg_cron`, reviewed backfills, admin SQL | These are TCP connections to Postgres with no PostgREST request context. A browser reaches the database only through the Data API, and PostgREST always sets `request.jwt.claims` for a request it serves — including a request with no `Authorization` header, which it serves as `role: anon`. So the "claims absent" branch is unreachable over the API surface a browser has. |
| `v_claim_role = 'service_role'` | Edge functions / server code using the secret service key | The role value is read from a JWT PostgREST already verified against the project JWT secret. A browser only ever holds the publishable/anon key, so the verified claim it can present is `anon` or `authenticated` — it cannot forge `role: service_role` without the JWT secret, which is server-side only and never shipped to the client. |

Two further points on the mechanism, so this does not rest on one control:

- The claims GUC is not client-settable through the Data API. Setting it would require running `SET` / `set_config(...)`, and PostgREST exposes no arbitrary-SQL endpoint — only tables/views and whitelisted RPCs. No `SECURITY DEFINER` RPC in this project calls `set_config` on `request.jwt.*`.
- `v_claim_role = 'anon'` is explicitly forced to non-system, so even if a future path left `auth.uid()` null on an anon API request, the guard denies instead of bypassing. That is the specific hole in today's `auth.uid() IS NULL`-only condition.

RLS remains the outer control (all policies `TO authenticated`), but the trigger no longer depends on it for caller classification.

## 4. Grant change SQL

Aligns grants with the authenticated-only policies:

```sql
REVOKE ALL ON public.parts_requests          FROM anon;
REVOKE ALL ON public.parts_request_comments  FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.parts_requests         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parts_request_comments TO authenticated;
GRANT ALL ON public.parts_requests         TO service_role;
GRANT ALL ON public.parts_request_comments TO service_role;
```

## 5. Verification script (runs in a transaction, ends in ROLLBACK — no data written)

Uses a real K&N parts row and a real engineer user id, resolved at the top.

```sql
BEGIN;

CREATE TEMP TABLE _v(step text, outcome text) ON COMMIT DROP;

DO $$
DECLARE
  v_part_id  uuid;
  v_eng_uid  uuid;
  v_off_uid  uuid;
BEGIN
  SELECT id INTO v_part_id FROM public.parts_requests ORDER BY created_at DESC LIMIT 1;
  SELECT auth_user_id INTO v_eng_uid FROM public.engineers
   WHERE auth_user_id IS NOT NULL AND role = 'engineer' LIMIT 1;
  SELECT user_id INTO v_off_uid FROM public.profiles
   WHERE role IN ('admin','owner','office','manager','superadmin') LIMIT 1;

  -- A. engineer API request writing a cost field -> must RAISE
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub',v_eng_uid)::text, true);
  BEGIN
    UPDATE public.parts_requests SET quoted_cost = 99.99 WHERE id = v_part_id;
    INSERT INTO _v VALUES ('A engineer cost write','FAIL - allowed');
  EXCEPTION WHEN others THEN
    INSERT INTO _v VALUES ('A engineer cost write','PASS - rejected: '||SQLERRM);
  END;

  -- B. engineer status-only update on an Open row -> must still work (regression)
  BEGIN
    UPDATE public.parts_requests SET status = status
     WHERE id = (SELECT id FROM public.parts_requests WHERE status='Open' LIMIT 1);
    INSERT INTO _v VALUES ('B engineer status-only','PASS - allowed');
  EXCEPTION WHEN others THEN
    INSERT INTO _v VALUES ('B engineer status-only','FAIL - rejected: '||SQLERRM);
  END;

  -- C. anon API request writing a cost field -> must RAISE (the fixed hole)
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  BEGIN
    UPDATE public.parts_requests SET quoted_cost = 77.77 WHERE id = v_part_id;
    INSERT INTO _v VALUES ('C anon cost write','FAIL - allowed');
  EXCEPTION WHEN others THEN
    INSERT INTO _v VALUES ('C anon cost write','PASS - rejected: '||SQLERRM);
  END;

  -- D. office API request writing cost/ETA/notified -> must succeed
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub',v_off_uid)::text, true);
  BEGIN
    UPDATE public.parts_requests
       SET quoted_cost = 55.00,
           expected_delivery_date = current_date + 3,
           customer_notified_at = now(),
           customer_notified_method = 'whatsapp'
     WHERE id = v_part_id;
    INSERT INTO _v VALUES ('D office tracking write','PASS - allowed');
  EXCEPTION WHEN others THEN
    INSERT INTO _v VALUES ('D office tracking write','FAIL - rejected: '||SQLERRM);
  END;

  -- E. service_role (edge function) -> must succeed
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  BEGIN
    UPDATE public.parts_requests SET actual_cost = 61.00 WHERE id = v_part_id;
    INSERT INTO _v VALUES ('E service_role write','PASS - allowed');
  EXCEPTION WHEN others THEN
    INSERT INTO _v VALUES ('E service_role write','FAIL - rejected: '||SQLERRM);
  END;

  -- F. direct DB session (no claims) -> must succeed
  PERFORM set_config('request.jwt.claims', '', true);
  BEGIN
    UPDATE public.parts_requests SET actual_cost = 62.00 WHERE id = v_part_id;
    INSERT INTO _v VALUES ('F direct DB session','PASS - allowed');
  EXCEPTION WHEN others THEN
    INSERT INTO _v VALUES ('F direct DB session','FAIL - rejected: '||SQLERRM);
  END;
END $$;

SELECT * FROM _v ORDER BY step;

ROLLBACK;
```

Post-verification checks, read-only:

```sql
-- grants now authenticated/service_role only, no anon
SELECT relname, relacl::text FROM pg_class
 WHERE relname IN ('parts_requests','parts_request_comments');

-- deployed function body matches what was reviewed
SELECT pg_get_functiondef(oid) FROM pg_proc
 WHERE proname = 'protect_parts_request_office_fields';
```

## Sequencing

One migration containing sections 1, 2 and 4 only. No data writes, no backfill. The verification script runs after it is applied and ends in `ROLLBACK`, so no rows persist. Nothing executes until Barry approves this content.
