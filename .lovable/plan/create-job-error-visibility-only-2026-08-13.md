# Create Job — error visibility only

Scope: feedback and logging only. No change to what is written, how `organisation_id` is resolved, or any report query or filter.

## What changes

All in `src/components/jobs/NewJobPanel.tsx`.

1. **No-user guard stops being silent.** The `if (!user) return;` at the top of `handleSubmit` gains a `console.log("[NewJobPanel] submit blocked: no user")` and a destructive toast "Session issue — please refresh and try again" before returning.

2. **Organisation guard.** `useOrgId()` already exposes a `ready` flag; the panel currently ignores it, so it will now read `const { orgId, ready: orgReady } = useOrgId()`.
   - While `orgReady` is false, the Create Job button renders disabled with a spinner and "Checking organisation…". This is passed into the Payment step as a single new prop.
   - If `orgReady` is true but `orgId` is null, `handleSubmit` logs `[NewJobPanel] submit blocked: orgId null`, shows a destructive toast "Could not resolve your organisation — please refresh and try again", and returns without attempting any insert. The `orgId!` assertions on the insert bodies stay exactly as they are — this guard simply means they can no longer be reached with a null value.

3. **Insert logging.** The existing `service_calls` insert already has an `if (jobErr) throw jobErr` branch that surfaces through the destructive "Error creating job" toast. The log line becomes `[NewJobPanel] insert failed:` + error, and the success path logs `[NewJobPanel] insert succeeded:` with the returned `id`, `organisation_id` and `status`. To log those three fields the insert's `.select("id")` becomes `.select("id, organisation_id, status")` — a read-back only, the inserted data is unchanged.

## Not touched

- The insert payloads, column values, and `organisation_id` resolution logic.
- `SalesLedger.tsx`, `OutstandingBalances.tsx`, `useEngineerJobs.ts`, and every other report or list query.
- The customer insert/update, audit log, and WhatsApp invoke behaviour.

## Verification

After the edit, a diff check confirms `src/components/jobs/NewJobPanel.tsx` is the only modified file, and a typecheck confirms the new prop and destructured flag are wired correctly.
