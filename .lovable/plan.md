# Restore unknown-fault-code card in Fault Finder

## Problem
Commit `7db60246` (result-card reorder) removed the `result.status === "unknown"` render block from `src/components/engineer/FaultFinderSheet.tsx`. `resolveFaultResult` still returns `{ status: "unknown", manualUrl }`, so a code that is not in the published library now renders a blank result area. Restoring exactly the pre-7db60246 block fixes it.

## Scope — two files only
1. `src/components/engineer/FaultFinderSheet.tsx`
2. `src/components/engineer/__tests__/FaultFinderSheet.card.test.tsx`

No changes to `FaultFoundCard`, `faultFinder.ts`, `faultCode.ts`, draft-testing toggles, styling, or anything else. No publish.

## Step 1 — Restore the block
Insert the unknown-result block exactly as it was before `7db60246` (taken from `git show 7db60246^:src/components/engineer/FaultFinderSheet.tsx`), directly after the `{result.status === "found" && <FaultFoundCard … />}` block and before the safety warning:

```tsx
{result.status === "unknown" && (
  <div className="rounded-2xl border border-border bg-card p-4 space-y-3" data-testid="fault-unknown">
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{brand} · {code.trim().toUpperCase()}</div>
      <div className="text-base font-extrabold text-foreground mt-0.5">No verified explanation available for this code yet</div>
      <div className="text-sm text-muted-foreground mt-1">
        Check this code in the official manual for the exact model.
      </div>
    </div>
    {result.manualUrl ? (
      <Button type="button" className="w-full h-12 text-base font-bold gap-2" onClick={() => openExternalUrl(result.manualUrl!)}>
        <ExternalLink className="w-4 h-4" /> Open official {brand} manual
      </Button>
    ) : (
      <div className="text-sm text-foreground">No official manual link on file for this brand — check the manufacturer's website.</div>
    )}
  </div>
)}
```

`ExternalLink`, `Button` and `openExternalUrl` are already imported in the file — no import changes.

## Step 2 — Regression tests (no new packages)
The existing test setup is static render (`renderToStaticMarkup`, node environment, no DOM events), so the tests cannot literally type into the code field. Approach, per your choice:

- Keep the existing `FaultFoundCard` tests untouched; add a new `describe` in the same file.
- Mock `@tanstack/react-query`'s `useQuery` (module-level `vi.mock` with `vi.hoisted` scenario state) to return canned library data synchronously: a brands index containing Baxi, one library model, and code rows including `E133`.
- Mock `@/lib/faultFinder`'s `resolveFaultResult` only as an input injector: it calls the **real** `resolveFaultResult` with a scenario-driven `code`/`submitted` (the code field cannot receive input without a DOM). Brand, library codes and all matching logic stay real — so a submitted `ZZ9` on Baxi genuinely resolves unknown with Baxi's real manual link, and `E133` genuinely resolves found.
- Render the full default `FaultFinderSheet` with `prefill={{ brand, model }}`.

Cases:
a. Brand Baxi (manual link on file), submitted code `ZZ9` not in the library → `data-testid="fault-unknown"` card rendered with the "No verified explanation available for this code yet" heading, "Check this code in the official manual for the exact model." line, and the "Open official Baxi manual" button.
b. Brand with no manual link on file, submitted code not in the library → fault-unknown card rendered with the "No official manual link on file for this brand — check the manufacturer's website." line and no button.
c. Known code `E133` → `FaultFoundCard` rendered and fault-unknown absent.

## Step 3 — Verify
- Run the focused test file: `npx vitest run FaultFinderSheet.card.test.tsx` (all new + existing cases pass).
- Run the full suite (`npx vitest run`) and `tsgo --noEmit` typecheck (build if touched by CI config — build should be unaffected by a JSX restore, but typecheck is mandatory).
- Read back the restored block in the file to confirm exact text/testid.
- Report: commit hash on the working branch with origin/dev comparison (read-only `git rev-parse` check; if not on origin/dev I will say so), the diff, and the test output. No publish.
