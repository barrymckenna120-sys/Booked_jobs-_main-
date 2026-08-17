# Receipt footer comparison — no changes

Read-only comparison of the live Boiler Details / Notes footer against the uploaded mockup is complete. Your decision: report only, no code changes.

## Outcome

The live footer matches the mockup on column ratio (1:1), gap (`gap-4`), icon-before-label ordering and spacing, and the 10px label / 13px value type scale.

Accepted deviations, all intentional and staying as-is:

- Responsive stacking (`grid-cols-1 sm:grid-cols-2`) plus column collapse when one side is empty, for phone rendering.
- Notes heading right-aligned only at `sm` and above.
- Semantic tokens in place of literal slate/blue/emerald values, which makes the notes tint a neutral grey-blue rather than a distinctly blue wash.
- Section headings and empty states share `muted-foreground` instead of the mockup's paler second grey tier.
- `whitespace-pre-line` on note text to preserve typed line breaks.
- Section chrome (`border-t` + `pt-4`) follows the surrounding receipt blocks.

One unintentional delta, also left as-is: row icons render at 14px (`w-3.5`) instead of the mockup's 13px.

## Next step

No implementation work. Approve to close this out, or tell me if you want any of the above revisited later.
