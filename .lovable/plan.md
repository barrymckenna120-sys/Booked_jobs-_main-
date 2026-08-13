# Create Job — findings and proposed next step

Read-only investigation is complete. Findings are in chat. Nothing has been changed.

## What the evidence shows

- No `service_calls` row was written in the last hour, so the most recent Create Job attempt did not persist.
- The console snapshot contains no `[NewJobPanel]` logs and the network snapshot contains no POST to `service_calls`, so the submit either never ran or never reached the network in that session.
- The console snapshot is also from a different signed-in user (`ed429061…`) than the network snapshot (`574c0743…`), with zero notification rows — so the two snapshots are not from the same session as the failed click.

## Most likely causes, in order

1. `handleSubmit` starts with `if (!user) return;` — no toast, no spinner, no log. The button appears completely dead.
2. `organisation_id: orgId!` is a non-null assertion. `useOrgId` can return `null` (missing profile row, or its 8s timeout), and the submit does not wait for its `ready` flag. A null org fails the RLS insert check and surfaces only as a raw database message.
3. The job is created but invisible in reports because of filter mismatches, not table mismatches: the wizard never writes `payment_method`, so an "Invoice After" job fails every branch of the Outstanding Amounts filter; and the Sales report is cash-basis so an unpaid job is correctly absent.

## Proposed next step (no code changes yet)

Reproduce the click in the preview browser end to end and capture the exact request and response:

- Drive the four wizard steps with a throwaway customer, submit, and record the `POST /rest/v1/service_calls` status code and response body plus all `[NewJobPanel]` console output.
- Record the observed UI outcome — nothing, spinner-then-back, error toast, or success screen.
- Delete the test row afterwards so no test data is left behind.

That single run distinguishes cause 1, 2 and 3 definitively. Once confirmed, a separate small fix can be scoped.
