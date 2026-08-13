CREATE OR REPLACE FUNCTION public.protect_organisation_billing_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Backend / admin processes bypass the guard entirely.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.role = 'superadmin'
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
     OR NEW.bookedjobs_plan IS DISTINCT FROM OLD.bookedjobs_plan
     OR NEW.is_blocked IS DISTINCT FROM OLD.is_blocked
     OR NEW.is_archived IS DISTINCT FROM OLD.is_archived
     OR NEW.archived_at IS DISTINCT FROM OLD.archived_at
     OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
     OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
     OR NEW.slug IS DISTINCT FROM OLD.slug
     OR NEW.id IS DISTINCT FROM OLD.id
  THEN
    RAISE EXCEPTION 'Billing and account status fields cannot be modified directly';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_organisation_billing_fields ON public.organisations;

CREATE TRIGGER trg_protect_organisation_billing_fields
BEFORE UPDATE ON public.organisations
FOR EACH ROW
EXECUTE FUNCTION public.protect_organisation_billing_fields();