# Make cancelled parts requests findable on /parts

## What I confirmed

This is a **query change**, not just a rendering gap. Cancelled rows never reach the page.

`src/pages/Parts.tsx` fetches with an explicit allow-list:

```text
.in("status", ["Open", "Ordered", "Ready to Fit"])
```

`Cancelled` is not in that list, so those rows are excluded at the database level. There is no
section to render them, but adding a section alone would show nothing — the fetch has to change first.

## The "8 total" number

The sidebar badge in `src/components/layout/AppLayout.tsx` uses the **same** status allow-list,
so both it and the `{parts.length} total` label on the page **exclude Cancelled**.

Current K&N data: 2 Open + 6 Ready to Fit = **8 outstanding**, plus 5 Cancelled that are invisible.

So the "8" is a **true outstanding-work count**, not an all-time count. Office can trust it today,
and the fix must keep it that way — cancelled rows must not be added into that number.

## The fix

1. Widen the `/parts` query to also fetch `Cancelled` rows.
2. Keep `{parts.length} total` and the sidebar badge counting outstanding work only — derive them
   from the non-cancelled rows, so the visible "8" does not silently become "13".
3. Add a **collapsed, low-emphasis "Cancelled" section** at the bottom of the page, below Ready to Fit:
   - Collapsed by default, showing a count in the header (e.g. "Cancelled (5)").
   - Muted styling — no priority colours, no action buttons; these rows are terminal.
   - Uses the existing `PartStatusIcon` with `Cancelled` (`XCircle`), consistent with the rest of the app.
   - Each row still links through to its job, and shows who cancelled it and when.

## Technical notes

- `src/pages/Parts.tsx`: change the `.in()` list to include `"Cancelled"`; add a `cancelled` derived
  array alongside `open` / `ordered` / `ready`; base the total label on the outstanding subset.
- `src/components/layout/AppLayout.tsx`: badge query left unchanged — it already counts outstanding only.
- No database, RLS, or `parts_requests` structure changes. No changes to the engineer view.
