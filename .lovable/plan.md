# BJ-0064 follow-up — who gets notified on parts changes

Findings only. Nothing changed. Trigger wiring: `notify_on_parts_request_change` runs `AFTER INSERT OR UPDATE ON public.parts_requests FOR EACH ROW`.

## Branch 0 — INSERT (new request logged)

Recipients: office-side users only, plus the ops account. Engineers are never included.

```sql
SELECT DISTINCT auth_user_id FROM (
  SELECT auth_user_id FROM engineers
   WHERE organisation_id = NEW.organisation_id
     AND role IN ('admin','office','owner','manager','superadmin')
     AND status = 'active' AND auth_user_id IS NOT NULL
  UNION
  SELECT user_id FROM profiles
   WHERE organisation_id = NEW.organisation_id
     AND role IN ('admin','office','owner','manager','superadmin')
     AND COALESCE(is_active,true) AND user_id IS NOT NULL
  UNION
  SELECT user_id FROM profiles WHERE receives_ops_notifications = true
) r
WHERE (auth.uid() IS NULL OR auth_user_id <> auth.uid())
```

Type `parts_requested`, role `office`.

## Branch 1 — status becomes "Cancelled"

Recipients: office-side users only (same union as above, **minus** the `receives_ops_notifications` arm), actor excluded. Engineers are not notified when a part they requested is cancelled by the office.

Type `parts_cancelled`, role `office`.

## Branch 2 — any other status change or notes change ("Ordered", "Ready to Fit", notes)

This is the only engineer-facing branch, and it is gated three ways before any recipient is resolved:

- `auth.uid() IS NULL` -> returns, no notification (so anything done by an edge function / service role or SQL notifies nobody)
- actor role must be in `('admin','office','owner','manager','superadmin')` -> **an engineer moving a part to "Ordered" or "Ready to Fit" notifies nobody at all**, not the office and not the job's other engineer

Recipient set, actor excluded:

```sql
SELECT DISTINCT uid FROM (
  SELECT NEW.engineer_id
  UNION SELECT NEW.assigned_engineer_id
  UNION SELECT CASE WHEN NEW.engineer_id IS NULL AND NEW.assigned_engineer_id IS NULL
                    THEN NEW.logged_by END
  UNION SELECT CASE WHEN NEW.engineer_id IS NULL AND NEW.assigned_engineer_id IS NULL
                    THEN v_job_engineer END      -- see below
  UNION SELECT CASE WHEN NEW.engineer_id IS NULL AND NEW.assigned_engineer_id IS NULL
                    THEN v_assigned_auth END     -- engineers.auth_user_id for NEW.assigned_to
) s WHERE uid IS NOT NULL AND uid <> auth.uid()
```

`v_job_engineer` is the linked job's engineer, resolved only when both `engineer_id` and `assigned_engineer_id` are NULL:

```sql
SELECT e.auth_user_id FROM service_calls sc
  JOIN engineers e ON e.id = sc.assigned_engineer_id
 WHERE sc.id = NEW.service_call_id LIMIT 1
```

Answer to the direct question: on a move to "Ordered" (or "Ready to Fit"), the assigned engineer on the linked job **is** notified — but only when the office made the change **and** the request carries no `engineer_id` / `assigned_engineer_id` of its own. If either of those columns is set, the fallback arms are skipped entirely and the job's assigned engineer is not reached, even when they are a different person from the requester. If an engineer made the change, nobody is notified.

Type `parts_update`, role `engineer`.

## New order created by office and linked to a job with an assigned engineer

**No engineer notification exists.** The INSERT branch fans out to office roles + ops only, then `RETURN NULL` — it never reaches the engineer branch. So an office-sourced part on an engineer's job is invisible to that engineer until they open the Parts screen. That matches the user-facing question: they arguably should know a part is being sourced for their job.

Current counts in `notifications`: `parts_cancelled` 9, `parts_needed` 6, `parts_requested` 2, `parts_update` 4.

## Gaps identified (no fixes applied)

1. INSERT never notifies the linked job's assigned engineer.
2. Cancellation never notifies the requesting engineer, and omits the ops account that the INSERT branch includes.
3. Engineer-driven status changes notify nobody — the office does not learn when an engineer marks a part Ordered / Ready to Fit.
4. When a request has `engineer_id` or `assigned_engineer_id` set, the linked job's assigned engineer is excluded from status updates by the `IS NULL` guards.
5. Any status change made without an `auth.uid()` (edge function / automation) silently notifies nobody.

Tell me which of these to close and I'll write the migration.
