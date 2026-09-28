# Fault Finder result card — code first, then explanation

## What should this do?
On the mobile Fault Finder sheet, when a fault code is found, show the code as the big heading first, then the explanation as body text — so the engineer reads the code before the diagnosis. Long texts wrap instead of overflowing.

## Current state (verified by reading the file)
- `src/components/engineer/FaultFinderSheet.tsx` lines 314–330, the `result.status === "found"` card renders in this order:
  1. meta line: `{brand} · {model} · {code}` (small grey uppercase)
  2. category pill (status / display message), if any
  3. explanation as the bold heading (`text-base font-extrabold ... mt-0.5`)
- There is no existing FaultFinderSheet test file. Project test convention (e.g. `PrimaryActions.gating.test.tsx`) is `renderToStaticMarkup`, no @testing-library, vitest node environment.

## Change (one source file + one new test file)

### src/components/engineer/FaultFinderSheet.tsx
- Extract the found-result card JSX (lines 314–359) into an exported presentational subcomponent `FaultFoundCard` **inside the same file**, used inline in place of the JSX. Props: `fault`, `brand`, `model`, `isDraft`. No logic changes — pure move of the markup.
  - Why: the sheet's found state only exists after internal `useState`/`useQuery` interactions, which a static-render test cannot reach. Extracting the card lets the new test render it directly with the same pattern the project already uses, without mocking react-query or the Supabase client.
- In `FaultFoundCard`, reorder to:
  1. meta line: `{brand} · {model}` — code removed from this line
  2. code heading: `text-xl font-extrabold text-foreground break-words`
  3. category pill unchanged, directly under the code
  4. explanation: `text-base font-semibold text-foreground mt-1 break-words` (no longer a heading)
- Draft banner, possible causes, manual button, and technical details section stay byte-identical.

### src/components/engineer/__tests__/FaultFinderSheet.card.test.tsx (new)
- One test: render `FaultFoundCard` with a found fault (code `E133`, explanation "Ignition failure — boiler will not light") via `renderToStaticMarkup`, assert the code heading markup appears **before** the explanation in the DOM string, and that the meta line no longer contains the code.

## Checks
- Run the full vitest suite and the TypeScript typecheck.
- Confirm existing FaultFinder logic tests (`src/lib/faultFinder.test.ts`) still pass.
- Visual check in the mobile preview: found card shows code → pill → explanation; a long display message (e.g. "Flame On Before Gas On") wraps without overflow; draft banner and all other sections unchanged.

## Report back
Diff summary, commit hash on dev, test count and typecheck result.
