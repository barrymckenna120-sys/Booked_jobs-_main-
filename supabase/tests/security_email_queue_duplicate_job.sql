-- Regression: email queue insert path + duplicate-job tenant authorisation.
-- Run: psql -v ON_ERROR_STOP=1 -f supabase/tests/security_email_queue_duplicate_job.sql
-- Runs in a rolled-back transaction; writes nothing.
BEGIN;
DO $$ BEGIN
  ASSERT NOT has_function_privilege('anon','public.enqueue_email(text,jsonb)','EXECUTE'), 'anon can enqueue email';
  ASSERT NOT has_function_privilege('authenticated','public.enqueue_email(text,jsonb)','EXECUTE'), 'authenticated can enqueue email';
  ASSERT has_function_privilege('service_role','public.enqueue_email(text,jsonb)','EXECUTE'), 'service_role lost enqueue';
  ASSERT NOT has_function_privilege('anon','public.find_duplicate_job(uuid,text,text,text,integer,uuid)','EXECUTE'), 'anon can run duplicate check';
  ASSERT has_function_privilege('authenticated','public.find_duplicate_job(uuid,text,text,text,integer,uuid)','EXECUTE'), 'office users lost duplicate check';
  ASSERT has_function_privilege('service_role','public.find_duplicate_job(uuid,text,text,text,integer,uuid)','EXECUTE'), 'service_role lost duplicate check';
END $$;

-- Pick a real engineer/office user and a different organisation (read-only).
SELECT user_id AS uid, organisation_id AS own_org FROM public.profiles
 WHERE organisation_id IS NOT NULL AND role <> 'superadmin' LIMIT 1 \gset
SELECT id AS other_org FROM public.organisations WHERE id <> :'own_org' LIMIT 1 \gset

-- Authenticated, no impersonation: cross-tenant must fail, own tenant must work.
SELECT set_config('request.jwt.claims', json_build_object('sub', :'uid', 'role','authenticated')::text, true);
SELECT set_config('request.jwt.claim.sub', :'uid', true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM * FROM public.find_duplicate_job(current_setting('bj.other')::uuid, '+353870000000', 'Boiler Service', 'x', 60, NULL);
    RAISE EXCEPTION 'CROSS_TENANT_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
