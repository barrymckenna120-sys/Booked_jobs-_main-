## Scope

`src/pages/TeamManagement.tsx` only. Other 4 files verified — no edits needed (all already filter `.eq('status','active')`).

## Changes to TeamManagement.tsx

### 1. Rename `handleDelete` → `handleDeactivate` (lines 381–425)

Refactor response handling to match spec exactly:

- **Success** → `toast({ title: "${deleteTarget.name} deactivated" })` (drop "has been"), refresh list via existing `setMembers` + `fetchAuthUsers()`.
- **`error === "active_jobs"`** → keep current copy: `"Cannot deactivate ${name} — they have ${count} active job(s) assigned. Reassign or complete these jobs first."`
- **`error === "Cross-tenant action not permitted"`** → NEW dedicated branch: `toast({ title: "Unable to complete this action", variant: "destructive" })` — no `description` field, no raw error passed through.
- **Any other error** → generic: `toast({ title: "Failed to deactivate user", variant: "destructive" })` — remove the current `description: data?.error || error?.message` so backend wording never leaks.

Update the audit log call and callsite name accordingly. Preserve the existing active-jobs guard behavior and the `setDeleteTarget(null)` cleanup on both success and error paths.

### 2. Rename `handleDelete` callsite

Line 972: `onClick={handleDelete}` → `onClick={handleDeactivate}`.

### 3. Update confirmation dialog copy (lines 963–967)

Replace description with exactly: `"Deactivate ${deleteTarget?.name}? Their access will be revoked and they can be reactivated later."` — drop the current two-sentence "immediately" wording. Title stays `Deactivate {name}?`.

### 4. `handleReactivate` — no new function needed

Current `handleUnblock` (lines 339–378) already branches on `status === 'deactivated'` and swaps toast + audit copy. Reactivate button (lines 725–736) and dropdown item (lines 790–794) already call it. No change needed here — flag to you and skip. If you want it split into a separate named `handleReactivate` for clarity anyway, say so.

### 5. Differentiate the "Deactivated" pill (lines 711–723)

Currently: Deactivated and Blocked both render with identical destructive-red styling. Spec says "same style/pattern... different label/color if one exists". Change the pill logic to:

- **Blocked** → keeps current `bg-destructive/10 text-destructive border-destructive/20` + `<Ban />` icon.
- **Deactivated** → same `Badge variant="outline"` component and same layout, but muted styling: `bg-muted text-muted-foreground border-border` + `<UserX />` icon (already imported? verify — otherwise use existing `Ban` and only swap colors).

This uses the same Badge component with a variant-style className swap — no new pill component. Filter counts + `isEffectivelyBlocked` behavior unchanged (a deactivated user is still in the "blocked" filter bucket, matching current behavior).

### 6. Do not touch

- Role editing, block flow, invite/link flow, password reset, RLS-touching queries.
- Engineer-selection queries in the other 4 files (verified correct).

## Deliverable

Full diff of `src/pages/TeamManagement.tsx` only. No other files.

## Open question

Your Part 2 message cut off after "confirm whether the engineers query already filters `.eq('status',`" — the table above answers that. Confirm you don't want any edits to those 4 files before I switch to build mode.
