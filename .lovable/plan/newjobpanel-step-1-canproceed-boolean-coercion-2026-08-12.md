NewJobPanel Step 1 canProceed Boolean coercion

1. Open `src/components/jobs/NewJobPanel.tsx`.
2. Around line 147, change:
   ```tsx
   const canProceed = selected ? true : isNew && name.trim() && phone.trim() && address.trim();
   ```
   to:
   ```tsx
   const canProceed = Boolean(
     selected ? true : isNew && name.trim() && phone.trim() && address.trim()
   );
   ```
3. Verify the primary Step 1 button (lines ~299-301) already uses `disabled={!canProceed}` and leave it untouched.
4. Verify `prefilledCustomer` is optional (`prefilledCustomer?: any`) and is never defaulted to a non-null value; `selected` is initialized with `prefilledCustomer || null`, so `!prefilledCustomer` behaves correctly. No change needed.
5. Run the build/typecheck to confirm no regression.

No other logic, styling, or variable names will be changed.
