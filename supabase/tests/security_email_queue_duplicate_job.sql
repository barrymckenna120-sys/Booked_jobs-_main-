-- Regression: email-queue insert path + duplicate-job tenant authorisation.
-- Run: psql -v ON_ERROR_STOP=1 -f supabase/tests/security_email_queue_duplicate_job.sql
-- Everything runs inside a transaction that is rolled back; nothing is written.
BEGIN;

DO $$ BEGIN
  ASSERT NOT has_function_privilege('anon','public.enqueue_email(text,jsonb)','EXECUTE'), 'anon can enqueue email';
  ASSERT NOT has_function_privilege('authenticated','public.enqueue_email(text,jsonb)','EXECUTE'), 'authenticated can enqueue email';
  ASSERT has_function_privilege('service_role','public.enqueue_email(text,jsonb)','EXECUTE'), 'service_role lost enqueue';
  ASSERT NOT has_function_privilege('anon','public.find_duplicate_job(uuid,text,text,text,integer,uuid)','EXECUTE'), 'anon can run duplicate check';
  ASSERT has_function_privilege('authenticated','public.find_duplicate_job(uuid,text,text,text,integer,uuid)','EXECUTE'), 'signed-in users lost duplicate check';
  ASSERT has_function_privilege('service_role','public.find_duplicate_job(uuid,text,text,text,integer,uuid)','EXECUTE'), 'service_role lost duplicate check';
END $$;

-- Test identities (read-only lookups).
SELECT set_config('bj.uid', (SELECT user_id::text FROM public.profiles
  WHERE organisation_id IS NOT NULL AND role <> 'superadmin' ORDER BY created_at LIMIT 1), true);
SELECT set_config('bj.own', (SELECT organisation_id::text FROM public.profiles
  WHERE user_id = current_setting('bj.uid')::uuid), true);
SELECT set_config('bj.other', (SELECT id::text FROM public.organisations
  WHERE id <> current_setting('bj.own')::uuid ORDER BY created_at LIMIT 1), true);

-- 1. Signed out (no JWT): rejected.
SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM * FROM public.find_duplicate_job(current_setting('bj.own')::uuid, '+353870000000', 'Boiler Service', 'x', 60, NULL);
    RAISE EXCEPTION 'FAIL: no-user call allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

-- 2. Signed-in user, another company: rejected. 3. Own company: allowed.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('bj.uid'), 'role', 'authenticated')::text, true);
DO $$ BEGIN
  BEGIN
    PERFORM * FROM public.find_duplicate_job(current_setting('bj.other')::uuid, '+353870000000', 'Boiler Service', 'x', 60, NULL);
    RAISE EXCEPTION 'FAIL: cross-tenant call allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM * FROM public.find_duplicate_job(current_setting('bj.own')::uuid, '+353870000000', 'Boiler Service', 'x', 60, NULL);
END $$;

-- 4. Signed-in user cannot queue emails.
DO $$ BEGIN
  BEGIN
    PERFORM public.enqueue_email('transactional_emails', '{}'::jsonb);
    RAISE EXCEPTION 'FAIL: authenticated enqueue allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

-- 5. Signed out cannot run either.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
DO $$ BEGIN
  BEGIN
    PERFORM public.enqueue_email('transactional_emails', '{}'::jsonb);
    RAISE EXCEPTION 'FAIL: anon enqueue allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM * FROM public.find_duplicate_job(current_setting('bj.own')::uuid, '+353870000000', 'Boiler Service', 'x', 60, NULL);
    RAISE EXCEPTION 'FAIL: anon duplicate check allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

-- 6. Service role (Tally intake, auth-email-hook): any company still works.
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;
DO $$ BEGIN
  PERFORM * FROM public.find_duplicate_job(current_setting('bj.other')::uuid, '+353870000000', 'Boiler Service', 'x', 60, NULL);
END $$;
RESET ROLE;

SELECT 'ALL SECURITY CHECKS PASSED' AS result;
ROLLBACK;
