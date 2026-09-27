ALTER TABLE public.onboarding_feedback
  ADD COLUMN organisation_id uuid REFERENCES public.organisations(id) ON DELETE CASCADE,
  ADD COLUMN role text,
  ADD COLUMN device text NULL CHECK (device IN ('mobile','desktop')),
  ADD COLUMN is_replay boolean NOT NULL DEFAULT false,
  ADD COLUMN notified_at timestamptz NULL,
  ADD CONSTRAINT onboarding_feedback_rating_check CHECK (rating BETWEEN 1 AND 5),
  ADD CONSTRAINT onboarding_feedback_comment_len CHECK (comment IS NULL OR char_length(comment) <= 1000);

UPDATE public.onboarding_feedback f
   SET organisation_id = p.organisation_id
  FROM public.profiles p
 WHERE p.user_id = f.user_id AND f.organisation_id IS NULL;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.onboarding_feedback WHERE organisation_id IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'onboarding_feedback backfill: % unmatched rows, aborting', n;
  END IF;
END $$;

ALTER TABLE public.onboarding_feedback
  ALTER COLUMN organisation_id SET NOT NULL,
  ALTER COLUMN organisation_id SET DEFAULT public.get_my_org_id(),
  ALTER COLUMN user_id SET DEFAULT auth.uid();

CREATE OR REPLACE FUNCTION public.stamp_onboarding_feedback()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.user_id := auth.uid();
    NEW.organisation_id := public.get_my_org_id();
    NEW.role := public.get_user_role(auth.uid());
  END IF;
  NEW.notified_at := NULL;
  RETURN NEW;
END $$;

CREATE TRIGGER onboarding_feedback_stamp
  BEFORE INSERT ON public.onboarding_feedback
  FOR EACH ROW EXECUTE FUNCTION public.stamp_onboarding_feedback();

DROP POLICY IF EXISTS "Users insert own feedback" ON public.onboarding_feedback;
DROP POLICY IF EXISTS "Users read own feedback" ON public.onboarding_feedback;

REVOKE ALL ON public.onboarding_feedback FROM anon;
REVOKE ALL ON public.onboarding_feedback FROM authenticated;
GRANT INSERT, SELECT ON public.onboarding_feedback TO authenticated;
GRANT ALL ON public.onboarding_feedback TO service_role;
ALTER TABLE public.onboarding_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY onboarding_feedback_insert_own ON public.onboarding_feedback
  FOR INSERT TO authenticated
  WITH CHECK (organisation_id = public.get_my_org_id() AND user_id = auth.uid());

CREATE POLICY onboarding_feedback_select_superadmin ON public.onboarding_feedback
  FOR SELECT TO authenticated
  USING (public.is_superadmin(auth.uid()));

CREATE INDEX onboarding_feedback_org_created_idx
  ON public.onboarding_feedback (organisation_id, created_at DESC);