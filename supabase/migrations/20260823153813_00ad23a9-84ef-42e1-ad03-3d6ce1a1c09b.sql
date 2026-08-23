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
  --   * absent/empty         -> no API request at all: direct Postgres session
  --                             (migration, pg_cron job, reviewed backfill)
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

REVOKE ALL ON public.parts_requests          FROM anon;
REVOKE ALL ON public.parts_request_comments  FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.parts_requests         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parts_request_comments TO authenticated;
GRANT ALL ON public.parts_requests         TO service_role;
GRANT ALL ON public.parts_request_comments TO service_role;