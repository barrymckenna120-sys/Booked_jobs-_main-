# Tour feedback visible to superadmin (upgrade onboarding_feedback in place)

## Pre-check (read-only, already run)
- `onboarding_feedback` has 11 rows. **All 11 match a `profiles` row that has an organisation** (profiles.user_id = user_id), and none match more than one. The backfill can go ahead.
- Existing constraints: only `onboarding_feedback_pkey`. There are no rating or comment CHECKs, no triggers, and only the primary-key index.
- Existing ratings are 1–5 with none blank, and comment lengths are 3–6 characters, so the new CHECKs will pass.
- Existing policies to drop: **"Users insert own feedback"** (INSERT) and **"Users read own feedback"** (SELECT). These are the only two.

## 1. Migration (one file)
```sql
-- a. New columns + checks
ALTER TABLE public.onboarding_feedback
  ADD COLUMN organisation_id uuid REFERENCES public.organisations(id) ON DELETE CASCADE,
  ADD COLUMN role text,
  ADD COLUMN device text NULL CHECK (device IN ('mobile','desktop')),
  ADD COLUMN is_replay boolean NOT NULL DEFAULT false,
  ADD COLUMN notified_at timestamptz NULL,
  ADD CONSTRAINT onboarding_feedback_rating_check CHECK (rating BETWEEN 1 AND 5),
  ADD CONSTRAINT onboarding_feedback_comment_len CHECK (comment IS NULL OR char_length(comment) <= 1000);

-- b. Backfill from profiles; abort the whole migration if any row is unmatched
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

-- c. NOT NULL, defaults, session-stamping trigger
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

-- d. Policies + grants
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

-- e. Index
CREATE INDEX onboarding_feedback_org_created_idx
  ON public.onboarding_feedback (organisation_id, created_at DESC);
```
Notes:
- The backfill is inside this migration because you asked for that. If any row doesn't match, the whole migration rolls back.
- After applying, I'll read back the row count (11), the count of blank `organisation_id` (0), the policies and the constraints.
- The trigger only resets `notified_at` to blank on insert, so a client can't pre-mark a row as already emailed. Only the edge function (service role, doing an UPDATE) can set it.

## 2. Final screen (all tours: desktop dialog, mobile sheet, engineer tour)
- On step 7 the primary button reads **"Next"**, not Finish.
- The final screen shows:
  - "How was the tour?"
  - 5 stars
  - the existing clarity question
  - an optional comment (1000-character limit)
  - **"Send & finish"**, disabled until a star is chosen
  - **"Skip & finish"**
- **Send & finish** inserts `tour_type`, `device`, `rating`, `clarity`, `comment` and `is_replay` only. On error it shows an error toast and stays open. On success it completes the tour exactly as today and closes. The separate "Thanks" step is removed.
- **Skip & finish** completes the tour and writes nothing.
- The progress row shows a small ✓ after 07, not a numbered tab.
- On replay, neither button writes `onboarding_complete`, and submissions set `is_replay = true`. The replay flag is passed from `useOnboardingTour` into both tour components.
- Device is `desktop` when the width is at least 1024px, otherwise `mobile`.
- After a successful insert, the client calls `notify-tour-feedback` with `{ feedback_id }`, fire-and-forget. An email failure never affects the save.

## 3. Edge function `notify-tour-feedback` (new)
- It requires a signed-in user, loads the row with the service role, and only acts if `row.user_id` matches the caller.
- It sends only if `notified_at IS NULL` and either `rating <= 3` or the comment isn't empty.
- It claims the row first (`UPDATE ... SET notified_at = now() WHERE id = $1 AND notified_at IS NULL RETURNING id`), so two calls can't both send.
  - If the send fails, it resets `notified_at` to blank so the row can be retried.
  - With this ordering, `notified_at` means "sent or in flight". This is the safe version of "set after a successful send".
- It sends through the existing `sendAdminEmail` (Resend, noreply@bookedjobs.ie) to `platformOwnerAlertEmails()`.
- Subject: `Tour feedback: <rating>★ from <tenant>`. The body gives the tenant, role, tour type, device, clarity, whether it was a replay, and the escaped comment.

## 4. /admin "Tour feedback" section
- A new `src/components/admin/TourFeedbackSection.tsx`, mounted in `AdminPanel.tsx`. Existing tabs are unchanged.
- **Summary:** average rating, total responses, and office vs engineer (count and average for each). Averages exclude replays; totals show replays separately.
- **Table:** newest first, showing tenant, role, tour type, device ("—" when unknown), rating, clarity, a replay marker, comment and date (DD/MM/YY). It has a tenant filter plus loading, empty and error states. All 11 existing rows appear.

## 5. Verification (Test Gas 4, org 93ec32a9…)
- Row count before (11) and after (11 plus the test rows).
- As the Test Gas 4 admin: submit desktop feedback with 2 stars and a comment, read the row back with SQL (org, user, role, device, is_replay), and take a screenshot of it in /admin as the superadmin.
- As the Test Gas 4 user: a SELECT returns empty, and an insert that supplies another org's id gets rewritten to their own org.
- Call `notify-tour-feedback` twice with the same id: the first sends and the second skips. `notified_at` gets set once, and I'll show both responses. Please confirm you received the one email.
- Run the type check and build, and give the migration file name and commit hash(es). I'll say so if the commit isn't confirmed on dev. Nothing will be published and no function will be deployed until you approve.
