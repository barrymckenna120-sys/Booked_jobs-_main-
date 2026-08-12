# Evidence + fixes: engineer identity repair, picker scoping, insertPartsRequest tests

## 1. Stage 1 data repair — actual query output

### After (live, queried just now)

```text
id                                    | name              | org               | email                   | role     | status      | user_id                               | auth_user_id
5473f748-dd80-4a11-8f03-bfb5c2faa02e  | nicole  enginner  | K&N Gas Services  | officeapp@gmail.com     | admin    | active      | b646f6de-843e-4d3f-ab1d-245573f38d94  | NULL
d7a1e4dc-e4b7-4ca7-bfb5-dd79bb63f70d  | Paul              | K&N Gas Services  | barrytest2024@gmail.com | engineer | deactivated | 2efeab15-ff5d-4639-af68-2c2fe5c50eac  | NULL
5cfe22c3-4a41-478b-9132-00d6e3b288e1  | Paul              | Dublin Gas        | btestjuly2025@gmail.com | engineer | active      | 0a338021-c056-4c5c-a617-6deaa3a19e2f  | 0a338021-c056-4c5c-a617-6deaa3a19e2f
```

### Before

Full disclosure: no pre-update snapshot was captured as its own query, so the before values
below are reconstructed from output already in this thread, not from a row-level snapshot
taken immediately before the write. That is a process gap on my side.

```text
5473f748 (nicole  enginner, K&N)  auth_user_id = b646f6de-843e-4d3f-ab1d-245573f38d94 (no auth.users row), status active
d7a1e4dc (Paul, K&N)              auth_user_id = 2efeab15-ff5d-4639-af68-2c2fe5c50eac (Cavan Gas admin), status active
                                  — confirmed verbatim by the constraint-error row dump on the first write attempt
5cfe22c3 (Paul, Dublin Gas)       auth_user_id = 0a338021 (correct), user_id = 574c0743 (nicole office manager, K&N)
```

Also visible above and not fixed: `5473f748.user_id` still holds the dead
`b646f6de` reference. I cleared only `auth_user_id`. The legacy `user_id`
column should be cleared too — included as a step below.

### Was there a third "Paul"?

No. Two Paul records exist in total, both already established earlier in this thread:

- `d7a1e4dc` — K&N, email `barrytest2024@gmail.com`, the record that was cross-linked to the
  Cavan Gas admin account. Now unlinked and deactivated.
- `5cfe22c3` — Dublin Gas, email `btestjuly2025@gmail.com`, correctly linked.

Nothing new surfaced.

### Jobs referencing the deactivated K&N record — this needs a decision

7 `service_calls` rows point at `d7a1e4dc`. 0 `parts_requests` rows do.

```text
ref     | status  | scheduled_date | assigned_engineer (denormalised)
KN-389  | On Site | 2026-06-30     | Barry test KN
KN-390  | Booked  | 2026-07-02     | Barry test KN
KN-391  | Booked  | 2026-07-01     | Barry test KN
KN-393  | Booked  | 2026-07-03     | Paul
KN-394  | Booked  | 2026-07-02     | Barry test KN
KN-397  | Booked  | 2026-07-03     | Barry test KN
KN-423  | Booked  | 2026-07-30     | Paul
```

So: not clean. All 7 are non-terminal statuses (`Booked` / `On Site`) pointing at a now
deactivated engineer. All 7 are past-dated (latest 2026-07-30, today is 2026-08-12), so
nothing future-dated is stranded, but they were already stale before this repair — the
deactivation did not create the staleness, it exposed it. I have not touched them.

### Dev vs production

This distinction does not exist for this project: there is one Lovable Cloud backend, and
the read/write tools plus `psql` all point at it. The repair ran against that single live
database. There is no separate dev copy to stage data repairs through, which is exactly why
the before/after snapshot should have been captured first.

## 2. Engineer picker role scoping — direct answer

It does **not** filter by role. The actual filter is:

```ts
.eq("organisation_id", organisationId)
.eq("status", "active")
```

So the 8 options include non-engineer roles: `barry manager` (owner), `Mary Byrne` (office),
`nicole enginner` (admin), `nicole office manager` (office). That is wrong for this picker.

Fix: add `.in("role", ["engineer"])` so only `role = 'engineer'` rows appear.

## 3. What I will change

1. **Role filter** in `src/components/parts/NewPartsOrderSheet.tsx` — engineers only.
2. **Stop writing `engineer_id`** from this form. It currently passes the selected engineer's
   `auth_user_id` into `engineer_id`; per the schema decision that column is for
   engineer-originated requests. The form will pass `engineerId: null`.
   Consequence to be aware of: `notify_on_parts_request_change` targets
   `engineer_id` / `assigned_engineer_id`, so an office-created order will not notify the
   engineer on later status changes. Data confirms `assigned_engineer_id` is NULL on every
   existing row, and `assigned_to` is the column that actually carries `engineers.id`, so the
   form keeps writing `assigned_to` only. If you want office-created orders to notify, that
   is a separate trigger change — not folded in here.
3. **Finish the identity repair**: clear the dead `user_id` on `5473f748`.
4. **Tests** in a new `src/lib/newPartsOrderRow.test.ts` against `buildPartsRequestRow`,
   asserting the exact payload shape the form builds:
   - job-linked: `service_call_id` set, `customer_id` set, snapshot name/phone/address NULL
     (the builder deliberately nulls snapshots when `customer_id` is present)
   - manual entry: `service_call_id` NULL, `customer_id` NULL, snapshot fields carry the
     typed name/phone/address
   - engineer assigned: `assigned_to` = the selected `engineers.id`
   - unassigned: `assigned_to` NULL
   - `engineer_id` NULL in every case, and `assigned_engineer_id` never written
   - quantity/priority coercion (blank or `0` qty falls back to 1)

Test output gets pasted back once it runs.

## Open item for you

KN-389 / 390 / 391 / 393 / 394 / 397 / 423 — 7 live-status jobs on a deactivated engineer.
Options: reassign to an active K&N engineer, or close them out as historical. I have not
guessed; say which and I will do it in a follow-up with before/after output.
