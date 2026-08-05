# Selectable VAT rate (13.5% / 23%) on quotes

Scope: one migration on `public.quotes` plus `src/components/quotes/QuoteForm.tsx`. Nothing else.

## 1. Database

```sql
ALTER TABLE public.quotes
ADD COLUMN IF NOT EXISTS vat_rate numeric NOT NULL DEFAULT 23;
```

Every existing quote gets `23`, so stored behaviour is unchanged.

## 2. QuoteForm.tsx changes

**State**
- New `const [vatRate, setVatRate] = useState(23)`.
- Loading an existing quote (around line 101, next to `vat_enabled`): `setVatRate(Number((q as any).vat_rate ?? 23))`.
- New quotes keep the `23` default — no settings key is introduced.

**Calculation (line 138)**
- `const vatAmount = vatEnabled ? afterDiscount * (vatRate / 100) : 0;`
- The literal `0.23` is removed. `subtotal`, `afterDiscount`, `total`, `depositNum` and `balanceDue` formulas are otherwise untouched, so Discount / Deposit / Balance Due logic is unchanged.

**Save payload (around line 189)**
- Add `vat_rate: vatRate` alongside the existing `vat_enabled: vatEnabled`. No other payload field changes.

**UI (lines 433-437)**
- Keep the existing VAT `Switch` and its behaviour exactly as-is.
- Change the static label `VAT 23%` to just `VAT`.
- Next to the switch, add a small two-button segmented control (`13.5%` / `23%`) built from the existing `Button` component, active state via `variant="default"` vs `variant="outline"`, matching the compact sizing already used in the totals block.
- The segmented control renders only when `vatEnabled` is true, consistent with the existing `{vatEnabled && …}` amount display. When VAT is off, nothing about the current layout or behaviour changes.

## Verification

- Existing quote opened and saved without touching the control: VAT amount and total identical to today, `vat_rate` stays 23.
- Switching to 13.5% recalculates VAT and total; deposit auto-% and balance due follow from the new total as they already do.
- Toggling VAT off hides the selector and zeroes VAT, same as today.
- Reopening a quote saved at 13.5% shows 13.5% selected.
