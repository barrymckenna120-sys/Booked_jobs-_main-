# Plan: Fix `reset-auth-block` organisation guard

## Goal
Replace the invalid/pseudocode organisation check in `supabase/functions/reset-auth-block/index.ts` with complete, valid TypeScript adapted from the working `unblock-user` implementation.

## Scope
- Change only `supabase/functions/reset-auth-block/index.ts`.
- Do not touch `TeamManagement.tsx` or any other file.
- Preserve the existing role gate, auth ban update, and engineers update logic.

## Implementation
1. Use the existing `unblock-user` pattern as the reference:
   - Resolve caller organisation from `profiles.user_id`, falling back to `engineers.auth_user_id`.
   - Resolve target organisation from `profiles.user_id`, falling back to `engineers.auth_user_id`.
   - Allow `superadmin` to bypass the organisation comparison.
   - Return the full 403 JSON response when organisations are missing or different.
2. Insert the complete guard before the ban-clearing update runs in `reset-auth-block`.
3. Ensure there are no placeholder variables, pseudocode responses, or comment-only logic.

## Verification
Run the available type/build check after editing and report:
- The exact command used.
- PASS or FAIL.
- Relevant output if it fails.

## Final response format
Return only:
- Existing `unblock-user` code snippet used as reference.
- New `reset-auth-block` adapted TypeScript snippet.
- Verification command and PASS/FAIL result.
