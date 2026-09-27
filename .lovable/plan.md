# Tour feedback visible to superadmin

## 1. What the feedback screen does today (confirmed)
- It isn't going nowhere. On submit, `src/components/OnboardingTour.tsx` (line 128) inserts into the existing table **`onboarding_feedback`** with `user_id`, `tour_type`, `rating`, `clarity` and `comment`.
- The live table has **11 rows**. It has no `organisation_id` and no device or role column.
- Its access rules only let a user insert or read **their own** rows. Nobody else can read them, including the superadmin, so the feedback is effectively invisible.
- The insert result is never checked: a failure still shows "Thanks", with no error toast.
- Skip calls `onComplete()` and writes nothing.
- The desktop office dialog currently skips feedback entirely, because Finish closes it straight away.
- Nothing reads from localStorage or calls a function on submit.

## 2. Migration (one migration, schema only)
```sql
CREATE TABLE public.tour_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text,
  tour_type text NOT NULL CHECK (tour_type IN ('office','engineer')),
  device text NOT NULL CHECK (device IN ('mobile','desktop')),
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text NULL CHECK (comment IS NULL OR char_length(comment) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tour_feedback_org_created_idx ON public.tour_feedback (organisation_id, created_at DESC);

REVOKE ALL ON public.tour_feedback FROM anon;
GRANT INSERT, SELECT ON public.tour_feedback TO authenticated;
GRANT ALL ON public.tour_feedback TO service_role;

ALTER TABLE public.tour_feedback ENABLE ROW LEVEL SECURITY;

-- Server fills these; the client never supplies them.
ALTER TABLE public.tour_feedback
  ALTER COLUMN organisation_id SET DEFAULT public.get_my_org_id(),
  ALTER COLUMN user_id SET DEFAULT auth.uid();

CREATE POLICY tour_feedback_insert_own ON public.tour_feedback
  FOR INSERT TO authenticated
  WITH CHECK (organisation_id = public.get_my_org_id() AND user_id = auth.uid());

CREATE POLICY tour_feedback_select_superadmin ON public.tour_feedback
  FOR SELECT TO authenticated
  USING (public.is_superadmin(auth.uid()));
-- No UPDATE / DELETE policies.
```
- `role` is filled by a small BEFORE INSERT trigger from `get_user_role(auth.uid())`, so the client can't set it. The trigger also overwrites `organisation_id` and `user_id` with the session values, even if a client tries to send them.
- The superadmin check is `is_superadmin()`, the same one /admin relies on.
- The old `onboarding_feedback` table and its 11 rows are left untouched. Copying them across would be a separate, review-gated data step, and only if you want it. They lack org and device, so they would need a join through `profiles`.

## 3. Client changes
- **`OnboardingTour.tsx` (mobile/engineer sheet):** submit inserts into `tour_feedback` with only `tour_type`, `device` (`desktop` when the width is at least 1024px, otherwise `mobile`), `rating` and `comment`. It checks the error: on failure it shows an error toast and stays on the screen; on success it shows "Thanks" as now. The "clarity" yes/no question stays on screen but is no longer stored, because the spec has no column for it (confirm if you want a column instead). Skip is unchanged.
- **`OfficeTourDesktop.tsx`:** Finish on step 7 switches the dialog body to the same feedback screen: stars, an optional comment with a 1000-character limit, a Submit button, and Skip. Skip closes without writing. Tour completion still happens exactly as today. Replaying the tour from Help shows the feedback screen too, but it still never writes `onboarding_complete`.
- After a successful insert, the client calls the new function `notify-tour-feedback` with `{ feedback_id }` only, fire-and-forget. An email failure never blocks the save or rolls it back.

## 4. Edge function `notify-tour-feedback` (new)
- It requires a signed-in user. It loads the row by id using the service role, and only acts if `row.user_id` matches the caller.
- It sends only when `rating <= 3` or the comment isn't empty.
- It uses the existing `sendAdminEmail` from `_shared/notifyOrgAdmins.ts` (Resend, noreply@bookedjobs.ie). The recipients are `platformOwnerAlertEmails()`, from the `PLATFORM_OWNER_EMAILS` secret; no email address is written into the code.
- Subject: `Tour feedback: <rating>★ from <tenant>`. The body gives the tenant, role, tour type, device, rating and the escaped comment.
- It won't be deployed until you approve.

## 5. /admin "Tour feedback" section
- A new `src/components/admin/TourFeedbackSection.tsx`, mounted in `AdminPanel.tsx` without changing the existing tabs.
- **Summary:** average rating, total responses, and a split of office vs engineer (count and average for each).
- **Table:** newest first, showing tenant name, role, tour type, device, rating, comment and date (DD/MM/YY). It has a tenant filter plus loading, empty and error states. Tenant names come from `organisations`, which the superadmin can already read.

## 6. Verification (Test Gas 4 only, org 93ec32a9…)
- Mint a session for the Test Gas 4 admin and submit desktop feedback with 2 stars and a comment. Then read the row back with SQL, check the org and user, and take a screenshot of it in /admin as the superadmin.
- As the Test Gas 4 user, select from `tour_feedback` and show an empty result, even though their own row exists.
- Try inserting with a different `organisation_id` and show it is rejected or rewritten.
- The test email is sent to the platform owner address. Please confirm you received it; I can only confirm the send result.
- Run the type check and build, and give the commit hash(es). Commits land on an edit branch, so I'll say so if dev isn't confirmed. Nothing will be published.

## Open question
- Should "clarity" be dropped or kept? The plan drops it from storage, because the spec lists no column for it.
