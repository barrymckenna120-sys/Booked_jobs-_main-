## Plan

### 1. `src/pages/AdminPanel.tsx` — refresh after unblock

`handleUnblock(email)` currently only shows a toast. It doesn't know which org the email belongs to, and the popover stays open with stale data.

**Changes:**

- Change `handleUnblock` signature to `handleUnblock(email: string, orgId: string)`.
- After `toast.success("User unblocked successfully")`:
  1. Set `blockedStatus[orgId] = { loading: true, hasBlocked: prev.hasBlocked }`.
  2. Re-invoke `list-users` with `{ org_id: orgId }`.
  3. Compute `hasBlocked = users.some(u => !!u?.blocked)` and update `blockedStatus[orgId] = { loading: false, hasBlocked }`.
  4. On error, restore `{ loading: false, hasBlocked: prev }`.
- Add a mechanism to close the popover for that org:
  - Add `closeSignal?: number` prop to `UnblockUserPopover`. A `useEffect` inside the popover watches `closeSignal` and calls `setOpen(false)` when it changes.
  - Track `closeSignals: Record<string, number>` in `AdminPanel`. After successful unblock, bump `closeSignals[orgId]`.
- Update the render site (line 969) to pass `orgId` into `onUnblock`:
  ```tsx
  onUnblock={async (email) => { await handleUnblock(email, t.id); }}
  closeSignal={closeSignals[t.id] ?? 0}
  ```

No other logic in `UnblockUserPopover` or the unblock action changes.

### 2. `supabase/functions/reset-auth-block/index.ts` — CORS alignment

Replace the static `corsHeaders` object with a `getCorsHeaders(req)` helper matching `impersonate-org` / `list-users`:

- Allowed origins:
  - `https://kngasservices.bookedjobs.ie`
  - `https://dublin-gas.bookedjobs.ie`
  - any `*.lovableproject.com`
  - any `*.lovable.app`
  - reflect the request `Origin` when it matches; otherwise fall back to the first allowed origin.
- `Access-Control-Allow-Headers`: `authorization, content-type, apikey, x-client-info, x-org-id, x-org-impersonation-token`
- `Access-Control-Allow-Methods: POST, GET, OPTIONS`
- `Access-Control-Allow-Credentials: true`
- `Vary: Origin`

Compute `const corsHeaders = getCorsHeaders(req)` at the top of `Deno.serve`, and reuse it in the OPTIONS response and every existing JSON response (no other logic touched).

### 3. Deploy

Deploy the `reset-auth-block` Edge Function after the file change.

### Verification

- Open Unblock Users tab → confirm red buttons for tenants with blocked users.
- Click a blocked user, confirm unblock → popover closes, and that tenant's button turns back to the default outline style (blocked status re-fetched).
- Check browser console/network: no CORS preflight failure for `reset-auth-block`.
