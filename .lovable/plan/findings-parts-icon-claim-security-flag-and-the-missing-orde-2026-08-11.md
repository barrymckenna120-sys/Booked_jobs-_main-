# Findings: Parts icon claim, security flag, and the missing Ordered notification

## 1. `src/pages/Parts.tsx` did NOT get a status pill icon

Actual current source, every `status`/icon occurrence in that file:

```text
  7: import { Wrench, Package, CalendarClock, PackageCheck, X } from "lucide-react";
 34:   .in("status", ["Open", "Ordered", "Ready to Fit"])
 46:   .filter((p: any) => p.status === "Open")
 48:   const ordered = parts.filter((p: any) => p.status === "Ordered");
 49:   const ready = parts.filter((p: any) => p.status === "Ready to Fit");
171:   <PackageCheck className="w-3 h-3" /> Part Arrived
182:   <span ...><PackageCheck className="w-4 h-4" style={{ color: "#7C3AED" }} /> Ready to Fit</span>
```

The `PartCard` render in this file has only a **priority** pill (`pCfg.emoji + pCfg.label`) — there is no status pill at all, and `PartStatusIcon` is not imported. So the earlier claim that the shared status glyph was added to "the three office surfaces" is wrong for `Parts.tsx`: this page groups parts into `Parts Needed` / `Parts Ordered` / `Ready to Fit` sections, so status is conveyed by the section header (which does carry `PackageCheck`) plus the `Part Arrived` button. `JobDetail.tsx` and `PartsPanel.tsx` did get the pill glyph.

Proposed correction: add the shared `PartStatusIcon` glyph to each `PartCard` in `Parts.tsx` so a card read in isolation matches the engineer card — icon only, no colour/copy/layout change.

## 2. Security flag: 1 warn, pre-existing, unrelated to the icon work

Scanner output, verbatim finding:

- `MISSING_RLS_PROTECTION` / `boiler_brands_cross_tenant_read`, level `warn` — "Boiler brand data readable across all organisations". The `boiler_brands` SELECT policy `Authenticated users can read boiler_brands` uses `USING (true)` with no org scoping, so any authenticated user in any tenant can read another tenant's brand/warranty rows.

This is the same finding flagged previously, unrelated to Parts icons or the notification trigger. Fix (separate migration, if approved): replace the open SELECT policy with `organisation_id = public.get_my_org_id() OR is_default = true` so the shared default brand list stays visible while tenant-authored brands are org-scoped.

## 3. Real bug confirmed: office Open→Ordered inserts no notification

The row you changed (`nicole`, 14:56:45 created, moved to Ordered 14:57:08):

```text
id                                   | status  | engineer_id | assigned_engineer_id | logged_by                            | logged_by_name
acd0930c-778d-4367-9bc3-02f3a940140a | Ordered | <nil>       | <nil>                | 574c0743-d9f4-4b7e-a1c5-0c5768cff881 | nicole
```

Notifications for it: **none**. No `parts_update` row exists at all — the newest `parts_*` notifications are `parts_needed` from 13:18, from the older job-level path.

Table-wide:

```text
total | with_engineer_id | with_assigned_engineer_id | with_logged_by
   11 |                0 |                         0 |              2
```

### Root cause (not the status comparison)

The trigger's change test is correct — `NEW.status IS DISTINCT FROM OLD.status` evaluates true on Open→Ordered. The early return that fires is the next one:

```sql
IF NEW.engineer_id IS NULL AND NEW.assigned_engineer_id IS NULL THEN
  RETURN NULL;
END IF;
```

`buildPartsRequestRow` in `src/lib/partsStatus.ts` writes `logged_by`, `logged_by_name`, and `assigned_to` — it never writes `engineer_id` or `assigned_engineer_id`. Every one of the 11 rows has both NULL, so the engineer-notify branch can never run for any part request in the database. The cancellation branch works because it fans out to office users and doesn't read those columns — which is why the earlier verification passed: those test rows had `engineer_id` set manually.

### Fix (three parts, all needed)

1. **Insert path** — `buildPartsRequestRow` sets `engineer_id` to the requesting user's auth id (the same value it already puts in `logged_by`) so newly logged parts have a notify target.
2. **Trigger fallback** — in the office-update branch, resolve the recipient set as `COALESCE`-style union of `engineer_id`, `assigned_engineer_id`, and, when both are NULL, `logged_by` plus the linked job's `assigned_engineer_id` (via `service_calls` → `engineers.auth_user_id`). Actor exclusion and the office-role gate stay exactly as they are.
3. **Backfill** — one-off `UPDATE` setting `engineer_id = logged_by` where `engineer_id IS NULL AND logged_by IS NOT NULL`, so the two existing engineer-logged rows notify going forward. No status values change.

### Verification

- Re-run the Open→Ordered change on a temp row logged by an engineer, as an office actor, and paste the resulting `notifications` row.
- Negative re-checks kept: engineer edits own row (0 rows), `quantity`-only change (0 rows), actor never notified.
- Cancellation fan-out re-run to prove no regression.
- Existing 21 parts unit tests plus a new test asserting `buildPartsRequestRow` emits `engineer_id`.

## Scope note

Item 3 touches a live trigger and insert payload, so it is not a lite-review change — it gets the full test pass above. Items 1 and 2 are independent and can be approved separately.
