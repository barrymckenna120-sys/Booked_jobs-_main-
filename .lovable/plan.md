# Payment completion check — what the records actually show

Only three jobs have taken payment in the last 10 days (all Dublin Gas): DG-1015, DG-1019, DG-1022. Plus DG-1008 (deposit only, earlier).

## Answers to your three questions

**1. Did payment status update correctly?**
Partly. All three now read "paid" with a zero balance, and none is misclassified as a deposit. But two jobs are not clean:

- DG-1015: marked paid, €120 collected, but the job total on the record is empty. Because revenue is blank, this job contributes €0 to Finance/revenue reporting even though €120 was taken. It also shows "deposit paid" while no deposit was ever configured.
- DG-1022: a €100 job with four payment rows totalling €400 — two identical €100 entries recorded 0.23 seconds apart from the engineer app, a third from the office screen, then a €100 final payment. The job itself reads correctly (€100, paid), so the customer wasn't over-charged, but the payment history is wrong and would overstate takings in any report built from it.
- DG-1019 is settled financially but its job status is still "In Progress", so it never reached Completed.

**2. Did the diagnostic logging capture anything?**
No. The logging I added writes to the phone's own browser console only — nothing is stored in the backend, and the server-side log tables hold no entries for these attempts. So there is no record to review after the fact. That is a gap, not a clean result.

**3. Were these deposit-style jobs like DG-1019?**
Mixed, and none is a true repeat of DG-1019's setup:
- DG-1022 did have prior deposit payments before its final payment (closest match — and it's the one with duplicate rows).
- DG-1015 had no prior payment at all.
- DG-1019 itself is the one job that was manually reconciled.

## Verdict

This is not genuine confirmation. One job was a fresh no-deposit case, and the one deposit-configured case produced duplicate payment records. Two new defects surfaced.

## Proposed follow-up work

1. **Persist payment diagnostics server-side.** Send the existing diagnostic payload to the backend log table so future attempts leave a reviewable trail instead of only a console line on the engineer's phone. Read-only addition; no change to payment maths.
2. **Investigate DG-1022's duplicate entries before fixing.** Cause unconfirmed: it could be a double submit from the engineer app, or the same payment entered twice on two screens. Step one is to establish which, from the record timestamps and who entered them, then decide between a submit guard and a duplicate-entry check.
3. **Investigate why DG-1015 was paid with no job total.** Confirm whether the total was never set at booking or was cleared during completion, then decide the fix. Not a data patch until the cause is known.
4. **Decide DG-1019's job status** — settle whether it should be moved to Completed, as its own reviewed step.

Each item ships separately and is independently reversible. No payment calculation changes are proposed until a cause is proven.
