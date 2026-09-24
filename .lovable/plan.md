# Boiler Fault Finder — Phase 1 only (mobile search screen)

Per the brief, this plan covers the audit plus Phase 1. Phases 2–5 (shared library tables, admin import, parts, job history) each get their own plan later.

## Audit findings (read so far)
- Engineer job screen: `EngineerJobCard` already has a `SecondaryActions` row (Note / Media / Video / Extra Work), plus `QuickActions` and `JobServiceHistory`. The new button goes in `SecondaryActions`, so it uses the same layout.
- There is no engineer "Tools" area. The header overflow menu in `EngineerLayout` holds Order Parts, Back to Office and Log Out. The secondary entry goes in that menu. No new bottom tab.
- Brand and model data: `boiler_brands` (brand_name, model_name, shared across all companies by design) and the customer's boiler brand and model fields. These are reused to prefill the form. No changes to them.
- There is no fault-code data anywhere in the system yet.

## What engineers will see
- A "Fault Finder" button on the job card. It opens a full-height sheet with Brand and Model already filled in from the job.
- Also available from the header menu, where it opens empty.
- Three fields: Brand (searchable), Model (searchable, filtered by brand) and Fault Code. One "Find Fault" button. All touch targets are 44px or larger, in one column with no sideways scrolling.
- The last brand and model used are remembered on the device.
- The screen has loading, offline ("Needs a connection") and unknown-code states.
- **Until Phase 2 adds verified data, every search shows the unknown-code message.** It says: "This code isn't in the verified library yet — check the official manufacturer manual," with a link to the manufacturer's official support page. It also includes a standing note that the work is for RGI or qualified engineers only. No diagnosis is shown that hasn't been verified.
- There is no "Save to Job" yet. That comes in Phase 5.

## Risk
Low. It's a new screen that only reads existing data. There are no database changes, no payments, and no data from other companies. Office views are unaffected.

## Technical details
- New file `src/components/engineer/FaultFinderSheet.tsx`, built on the existing `EngineerSheet` and the shadcn Command/Input.
- New file `src/lib/faultFinder.ts`:
  - `lookupFault()` sits behind an interface. For now it always returns `{status:"unknown"}`, and Phase 2 will add a database lookup behind it.
  - A small constant maps the 6 manufacturers to their official manual pages.
- Brand and model options come from `boiler_brands` (a `select('*')` read-only query) together with the 6 starter brands.
- Recent selections are stored in localStorage (brand and model only, no customer data).
- Edits to existing files: `SecondaryActions.tsx` gets one button and an `onFaultFinder` prop, `EngineerJobCard.tsx` wires up the sheet, and `EngineerLayout.tsx` gets one menu item.
- Tests in `faultFinder.test.ts` cover the unknown result, manual links for each brand, and recent-selection storage.
- Checks: existing tests, a type check, the build, and a Playwright run at iPhone size (390px) for the sheet, the prefill and the unknown-code state.

## Next plan (Phase 2, not in this change)
Shared reference tables (manufacturers, models, fault codes, manuals, verification status). Everyone can read published entries and only superadmins can write. A small set of verified sample codes follows, taken from official manuals, with page references and your sign-off.
