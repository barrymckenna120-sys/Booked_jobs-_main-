-- Guard: verify no orphan profile rows exist before adding the FK.
DO $$
DECLARE
  orphan_count int;
BEGIN
  SELECT count(*) INTO orphan_count
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.user_id
  WHERE u.id IS NULL;

  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Aborting: % orphan profile row(s) still exist. Clean them up first.', orphan_count;
  END IF;
END $$;

-- Drop any pre-existing FK on profiles.user_id (name unknown; enumerate defensively).
DO $$
DECLARE
  fk record;
BEGIN
  FOR fk IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND contype = 'f'
      AND conkey = ARRAY[(
        SELECT attnum FROM pg_attribute
        WHERE attrelid = 'public.profiles'::regclass AND attname = 'user_id'
      )]::int2[]
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', fk.conname);
  END LOOP;
END $$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;