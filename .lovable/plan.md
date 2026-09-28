# Publish Vaillant + Worcester Bosch to the public Fault Finder (Viessmann stays draft)

User approved with changes: Vaillant and Worcester Bosch only; Viessmann and its 10 codes remain draft and are NOT added to the allowed-brand list.

Worcester Bosch codes 200–208 were verified before publishing: all have category `status` (not `fault`) and homeowner-safe explanations ("Boiler in heating mode", "Boiler in hot water mode", "Boiler in anti-cycle mode", "Boiler in standby…", "Current primary water temperature higher than set value", "Chimney sweep demand"). Nothing fault-like. `boiler_fault_codes` has a `verified_by` column — it will be set to Barry's user id (ed429061-7b76-4272-af4a-25249ee6d719).

## Steps (run and report each separately)

1. **Code change (one file + its test):** In `supabase/functions/public-fault-lookup/logic.ts`, add `"Vaillant"` and `"Worcester Bosch"` to `ALLOWED_BRANDS` and add their official document pages to `MANUAL_LINKS` (`professional.vaillant.co.uk/downloads/product-manuals/`, `www.worcester-bosch.co.uk/support/literature`). Update the test in `logic.test.ts` that currently asserts these brands return null — they must now resolve canonically, and Viessmann must still return null. No other function changes. Run the function tests, then deploy `public-fault-lookup`.
2. **Data change (run_sql, not migration):** `UPDATE boiler_fault_codes SET status='published', verified_at=now(), verified_by='ed429061-7b76-4272-af4a-25249ee6d719'` for the 10 Vaillant + 10 Worcester Bosch codes (model ids: Vaillant aeea42b7-65dd-4ae6-bd51-ebcfd4e34d11, Worcester 4c2ffea2-c95e-4bc2-8b11-6f37b2d0e231), with the `draft_test_excluded` guard in the WHERE clause. Then `UPDATE boiler_fault_models SET status='published'` for those 2 models only. SQL read-back to confirm exactly 2 models / 20 codes published and zero Viessmann rows touched.
3. **Verify publicly:** Call `action=models` for Vaillant and Worcester Bosch with `Origin: https://kngasservices.lovable.app`, paste both responses, and confirm `action=models&brand=Viessmann` still returns `[]`. Spot-check one `action=lookup` per published brand.

## Expected result

2 models / 20 codes published. Viessmann untouched. No CORS, secret, RLS, or other-brand changes.
