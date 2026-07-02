
-- Tighten profiles_insert: still self-scoped, but block self-assigned superadmin
DROP POLICY IF EXISTS profiles_insert ON public.profiles;
CREATE POLICY profiles_insert ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND role IS DISTINCT FROM 'superadmin'
);

-- Tighten profiles_update: add WITH CHECK so users cannot escalate their own row
DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND role IS DISTINCT FROM 'superadmin'
);

-- Belt-and-braces trigger: only an existing superadmin (or service_role /
-- SECURITY DEFINER path with no auth.uid()) may assign the superadmin role.
CREATE OR REPLACE FUNCTION public.prevent_superadmin_self_assign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'superadmin'
     AND (TG_OP = 'INSERT' OR OLD.role IS DISTINCT FROM 'superadmin') THEN
    IF auth.uid() IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.profiles
         WHERE user_id = auth.uid() AND role = 'superadmin'
       )
    THEN
      RAISE EXCEPTION 'Only existing superadmins can assign the superadmin role';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_superadmin_self_assign ON public.profiles;
CREATE TRIGGER profiles_prevent_superadmin_self_assign
BEFORE INSERT OR UPDATE OF role ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_superadmin_self_assign();
