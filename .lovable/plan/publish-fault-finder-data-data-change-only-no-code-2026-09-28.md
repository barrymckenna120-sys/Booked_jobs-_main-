# Publish fault finder data (data change only, no code)

## Verified current state (read-only queries already run)

The 5 target models exist, all currently `status='draft'`. Two model names differ slightly from the request — the actual DB names will be used:

| Model (actual DB name) | Codes to publish | draft_test_excluded (skipped) |
|---|---|---|
| Ideal — Logic MAX Combi2 C24 C30 C35 | 21 | 0 |
| Ideal — Logic+ Combi2 C24 C30 C35 | 18 | 3 |
| Baxi — 600 Combi 2 (24 - 30 - 36) | 60 | 3 |
| Baxi — 800 Combi (24 - 30 - 36) | 10 | 0 |
| Glow-worm — Energy7 25c-A (H-GB) / Energy7 30c-A (H-GB) / Energy7 35c-A (H-GB) | 10 | 0 |

**Totals: 5 models published, 119 codes published, 6 codes stay draft (draft_test_excluded).**

## Steps

1. **Publish codes** — one `run_sql` UPDATE on `boiler_fault_codes`:
   `SET status='published', verified_at=now()` WHERE `model_id` IN (the 5 IDs above) AND `status='draft'` AND `draft_test_excluded = false`. Expect 119 rows.
2. **Publish models** — one `run_sql` UPDATE on `boiler_fault_models`:
   `SET status='published', verified_at=now()` WHERE `id` IN (the 5 IDs) AND `status='draft'`. Expect 5 rows.
3. **Verify by SQL read-back** — counts of published models/codes per brand; confirm the 6 excluded codes and all Vaillant/Viessmann/Worcester Bosch rows remain `draft`.
4. **Verify via the live public function** — GET `public-fault-lookup?action=models&brand=Ideal` (and Baxi, Glow-worm), plus `action=lookup&model_id=<Logic+ id>&code=E1`; paste the JSON responses.

## Safety

- No code changes, no schema changes — data UPDATEs only.
- No `verified_by` is set (no approver UUID was provided); only `status` and `verified_at` change. Say the word if you want a specific approver UUID recorded.
- Nothing is deleted; re-running the same UPDATEs is harmless (guarded by `status='draft'`).
- Other brands and empty models (Baxi 400 Combi 2.1, 800 Combi 2, Assure 500 Combi 2) are untouched.
