-- BJ-next-E: only superadmins (or the service role, used by edge functions)
-- may change a sumup row's active environment or per-environment credential
-- archive. Credential fields for the active environment remain editable by
-- org integration managers via the sumup-integration function (service role).
CREATE OR REPLACE FUNCTION public.guard_sumup_environment_flip()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only sumup rows carry an environment switch.
  IF NEW.integration_type <> 'sumup' THEN
    RETURN NEW;
  END IF;

  -- No environment-related change → nothing to guard.
  IF NOT (
    (OLD.config -> 'environment') IS DISTINCT FROM (NEW.config -> 'environment')
    OR (OLD.config -> 'environments') IS DISTINCT FROM (NEW.config -> 'environments')
  ) THEN
    RETURN NEW;
  END IF;

  -- Service role (edge functions) has no JWT claims → allowed.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Otherwise require a superadmin profile.
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND role = 'superadmin'
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'sumup_environment_change_requires_superadmin';
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_sumup_environment_flip ON public.tenant_integrations;
CREATE TRIGGER trg_guard_sumup_environment_flip
BEFORE UPDATE ON public.tenant_integrations
FOR EACH ROW
EXECUTE FUNCTION public.guard_sumup_environment_flip();