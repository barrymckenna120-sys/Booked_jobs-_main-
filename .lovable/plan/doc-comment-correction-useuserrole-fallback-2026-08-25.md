# Doc-comment correction: useUserRole fallback

## What changes

One comment line in `src/hooks/useUserRole.ts`. No functional change, no behaviour change, no database change.

The docstring above `useUserRole` currently says the role "Falls back to 'admin'". The actual code sets the role to `engineer` when the signed-in user has no engineer row. The comment is misleading for anyone reading the role gate.

## Technical detail

- File: `src/hooks/useUserRole.ts`, line 12
- Current: `* is linked to an engineer record. Falls back to "admin".`
- New: notes that a signed-in user without an engineer row falls back to `"engineer"`, and that the `"admin"` value on line 15 is only the pre-resolution initial state while `loading` is true.

Nothing else in the file, and no other file, is touched.

## Out of scope

- The anon table-level DELETE privileges finding (RLS still blocks it) — separate decision.
- Any change to how roles are resolved or gated.
