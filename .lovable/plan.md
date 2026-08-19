# Needs Attention Section — Parts Awaiting

## Current state
- The Today screen is `src/pages/engineer/EngineerToday.tsx`.
- It already renders the Next Job card, Today's Jobs, Cancelled jobs, Job Stats, and `EngineerOutstandingBalances`.
- The existing header "Order Parts" button navigates to `/engineer/parts`.
- `parts_requests` statuses are: `Open`, `Ordered`, `Ready to Fit`, `Cancelled`.
- `EngineerParts.tsx` already queries a logged-in engineer's own requests using `engineer_id`, `assigned_engineer_id`, and `assigned_to`.

## Goal
Add a "Needs Attention" section to the Today screen that surfaces the logged-in engineer's own not-yet-ordered parts requests (`status = 'Open'`). It must render nothing when the count is zero.

## Plan

### 1. Query parts_requests inside `EngineerToday.tsx`
- On mount / when `user.id` is available, run a `supabase.from("parts_requests").select("id", { count: "exact", head: true })` query scoped to the signed-in engineer.
- Use the same three filters already proven in `EngineerParts.tsx`:
  - `engineer_id.eq.${user.id}`
  - `assigned_engineer_id.eq.${user.id}`
  - `assigned_to.eq.${engineerRowId}` (requires resolving the `engineers` row for the auth user first)
- Filter by `status.eq.Open`.
- Store only the count in local state; do not fetch the full rows.

### 2. Render the "Needs Attention" section
- Position the new section at the bottom of the Today screen content, after `EngineerOutstandingBalances` and before the "Switch to Office App" button.
- If the count is `0`, render absolutely nothing (no card, no divider, no placeholder).
- If the count is `1` or more, render a card styled like the existing `NeedsAttentionCard` amber pattern:
  - Amber header: "Needs Attention" with `AlertTriangle` icon.
  - Single row: `Package` icon, large count, label "Parts Awaiting", and a `ChevronRight`.
- Tapping the row calls `navigate("/engineer/parts")`.

### 3. Reuse existing patterns
- Use `useAuth` for the current user.
- Use `useNavigate` for navigation.
- Use existing Tailwind tokens: `bg-card`, `border-border/60`, `bg-warning/10`, `text-warning`, `rounded-xl`, etc.
- No new colours, fonts, or component libraries.

### 4. Failure handling
- If the engineer-row lookup or the `parts_requests` count query fails for any reason, treat it as a zero count — render nothing.
- A failure in this new query must never block, delay, or break rendering of the Next Job card, Today's Jobs list, or any other existing content on the screen.

### 4. Out of scope
- No "Incomplete Jobs" row.
- No changes to the header, Next Job card, Today's Jobs list, Cancelled section, Job Stats, or `EngineerOutstandingBalances`.
- No changes to `service_calls.parts_ordered` / `parts_needed` columns.
- No backend / RLS changes (the existing engineer-scoped read policy already supports this).

## Verification
- With outstanding Open parts requests for the signed-in engineer, the "Needs Attention" card appears with the correct count.
- With zero Open requests, nothing renders.
- Tapping the row navigates to `/engineer/parts`.
- The count matches only the signed-in engineer's requests, not the whole organisation.
- Header, Next Job card, Today's Jobs, and stats remain visually and functionally unchanged.
