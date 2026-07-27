DO $$
DECLARE
  v_orphans int;
  v_bad_status int;
BEGIN
  SELECT count(*) INTO v_orphans
  FROM public.profiles p
  WHERE p.deactivated_by IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.deactivated_by);

  IF v_orphans > 0 THEN
    RAISE EXCEPTION 'ABORT: % profiles.deactivated_by rows reference missing auth.users. Report offending rows before proceeding.', v_orphans;
  END IF;

  SELECT count(*) INTO v_bad_status
  FROM public.engineers
  WHERE status NOT IN ('active','blocked','deactivated');

  IF v_bad_status > 0 THEN
    RAISE EXCEPTION 'ABORT: % engineers rows have status outside (active,blocked,deactivated). Report offending rows before proceeding.', v_bad_status;
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_deactivated_by_fkey
  FOREIGN KEY (deactivated_by) REFERENCES auth.users(id);

ALTER TABLE public.engineers
  ADD CONSTRAINT engineers_status_check
  CHECK (status IN ('active','blocked','deactivated'));