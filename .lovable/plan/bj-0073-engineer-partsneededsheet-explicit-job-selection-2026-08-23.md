# BJ-0073 — Engineer PartsNeededSheet: explicit job selection

## Background

The engineer's standalone parts-order sheet (`src/components/engineer/PartsNeededSheet.tsx`) currently defaults `jobId` to `""`, which is treated as a "no job" phone order. This caused two recent parts requests for a customer with eligible jobs to be created with `service_call_id = NULL` instead of being linked to KN-518.

## Goal

Force an explicit choice when the selected customer has one or more eligible recent jobs. Keep the current behavior when the customer has zero eligible jobs or when the manual-name path is used.

## Implementation

File: `src/components/engineer/PartsNeededSheet.tsx`

1. Replace `jobId` initial state `""` with a sentinel string `'unset'`.
2. Render the job `<Select>` as follows when eligible jobs exist:
   - Disabled placeholder item first: `Select a job…` with value `'unset'`.
   - Then the customer's eligible recent jobs (existing logic).
   - Then explicit final option: `No job (phone order)` with value `'none'`.
3. `canConfirm` requires `jobId !== 'unset'` when the customer has one or more eligible jobs.
4. When `canConfirm` is false due to the unset job selection, show helper text: `Choose a job, or 'No job (phone order)'`.
5. On submit:
   - If `jobId === 'none'`, set `serviceCallId = null`.
   - Otherwise, set `serviceCallId = jobId`.
6. Customers with zero eligible jobs keep current behavior: no picker shown, `serviceCallId = null`.
7. No changes to `src/components/jobs/NewPartsOrderSheet.tsx` (office sheet stays optional).

## Verification

- Screenshot case 1: customer with eligible jobs — Confirm disabled until a job or `No job (phone order)` is explicitly chosen.
- Screenshot case 2: customer with zero eligible jobs — unchanged behavior, no picker, submits normally.
- Diff included in return.

## Out of scope

BJ-0074 (tracking/comments display in `PartsArrivedModal.tsx`) remains lower priority and separate.