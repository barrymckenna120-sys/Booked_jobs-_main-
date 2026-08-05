# Selectable VAT Rate (13.5% / 23%) on the Quote Builder

Scope: `src/components/quotes/QuoteForm.tsx` only.

## What to build

Add a 13.5% / 23% VAT selector to the quote builder while keeping every other field and flow unchanged.

## Changes

1. **State**
   - Add `const [vatRate, setVatRate] = useState(23)`.
   - When loading an existing quote (near line 101, next to `setVatEnabled`), set `vatRate` from `q.vat_rate` with a fallback to `23`.
   - New quotes keep the default `23`.

2. **Calculation**
   - Replace `const vatAmount = vatEnabled ? afterDiscount * 0.23 : 0;` (line 138) with `const vatAmount = vatEnabled ? afterDiscount * (vatRate / 100) : 0;`.
   - `subtotal`, `afterDiscount`, `total`, `depositNum`, and `balanceDue` formulas remain unchanged.

3. **Save payload**
   - Add `vat_rate: vatRate` to the `quotePayload` object alongside `vat_enabled: vatEnabled` (near line 192).

4. **UI**
   - Keep the existing VAT `Switch` and its behaviour exactly as-is.
   - Change the static label from `VAT 23%` to `VAT`.
   - Next to the switch, add a compact two-button segmented control (`13.5%` / `23%`) using the existing `Button` component:
     - Active option: `variant="default"`.
     - Inactive option: `variant="outline"`.
     - `size="sm"` to match the compact totals layout.
   - The segmented control renders only when `vatEnabled` is true, consistent with the existing `{vatEnabled && ...}` VAT amount display.

## Verification

- Open an existing quote without touching the selector: VAT amount and total remain identical to today, and `vat_rate` stays `23`.
- Switch to `13.5%`: VAT and total recalculate; deposit auto-percentage and balance due follow from the new total automatically.
- Toggle VAT off: selector hides and VAT amount becomes zero, same as today.
- Reopen a quote saved at `13.5%`: the selector shows `13.5%` selected.
