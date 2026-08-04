# Auto-derive Dublin Area Code from Eircode (database trigger)

Add a database-level rule so that whenever a customer's Eircode is a Dublin routing key, the Area Code is filled in automatically — no matter whether the record came from an import, the customer form, or any future integration.

## Behaviour

- Eircode starts with `D` + 1–2 digits (optionally followed by `W`, for Dublin 6W) → Area Code is set to that prefix.
  - `D14 C584` → `D14`
  - `D18 V9F7` → `D18`
  - `d1 a123` → `D1`
  - `D6W 1234` → `D6W`
- Eircode is anything else (`A94NY05`, `T12 ...`) or blank/null → Area Code is left exactly as it is. No overwrite, no null-out.
- The rule only runs when the Eircode is actually being set or changed. Unrelated edits to a customer (name, phone, notes) never re-touch Area Code.
- Non-Dublin routing keys are out of scope — nothing is guessed for them.
- No existing customer records are changed. Shay's manually entered `SCD` stays `SCD` unless his Eircode itself changes to a Dublin key.

## Technical detail

New function `public.derive_area_code()` (`plpgsql`, `SET search_path = public`) plus one trigger on `public.customers`:

```sql
CREATE OR REPLACE FUNCTION public.derive_area_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_ec text;
  v_prefix text;
BEGIN
  -- only act when eircode is being set (insert) or changed (update)
  IF TG_OP = 'UPDATE' AND NEW.eircode IS NOT DISTINCT FROM OLD.eircode THEN
    RETURN NEW;
  END IF;

  v_ec := upper(btrim(coalesce(NEW.eircode, '')));
  IF v_ec = '' THEN
    RETURN NEW;                       -- blank: leave area_code untouched
  END IF;

  v_prefix := substring(v_ec from '^(D[0-9]{1,2}W?)');
  IF v_prefix IS NULL THEN
    RETURN NEW;                       -- non-Dublin: leave area_code untouched
  END IF;

  NEW.area_code := v_prefix;
  RETURN NEW;
END;
$$;

CREATE TRIGGER customers_derive_area_code
BEFORE INSERT OR UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.derive_area_code();
```

Notes:
- `D6W` is included because it is a genuine Dublin routing key; every other match is `D` + 1–2 digits.
- Nothing else changes: no other table, no application code, no data migration.

## Verification

After the migration is applied, run a transaction-scoped test (inserted rows rolled back, so no residue) covering:

| Case | Eircode | Expected `area_code` |
|---|---|---|
| Insert Dublin | `D14 C584` | `D14` |
| Insert Dublin | `D18 V9F7` | `D18` |
| Insert single digit | `D1 A123` | `D1` |
| Insert Dublin 6W | `D6W 1234` | `D6W` |
| Insert non-Dublin | `A94NY05` | unchanged (stays as supplied / NULL) |
| Insert blank | `''` | unchanged |
| Update to Dublin Eircode with existing `SCD` | `D14 C584` | `D14` |
| Update non-Eircode field with existing `SCD` | (unchanged) | `SCD` |
| Update to non-Dublin Eircode with existing `SCD` | `A94NY05` | `SCD` |

Results reported back with the function/trigger definition read from the database.

## Not included

No backfill of existing rows — that is a separate, explicitly approved step if wanted later.
