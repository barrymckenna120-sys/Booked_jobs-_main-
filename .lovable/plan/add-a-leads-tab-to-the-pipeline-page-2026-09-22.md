# Add a Leads tab to the Pipeline page

## Scope
Modify **only** `src/pages/Pipeline.tsx`. No other file changes — BoilerEnquiries.tsx, IncomingJobs.tsx, QuotesList.tsx, Renewals.tsx, WarrantyTracker.tsx and App.tsx stay untouched.

## What changes
1. Import the existing `BoilerEnquiries` page component and a Lucide icon (Flame) for the tab.
2. Add a `LEADS_TAB` constant beside the existing `WARRANTY_TAB` constant.
3. In the `tabs` useMemo, insert the Leads tab **between Incoming and Quotes** when the user is admin/office — same conditional pattern as Warranty (one `splice(1, 0, LEADS_TAB)` next to the existing conditional `push(WARRANTY_TAB)`).
4. Extend the `TabKey` type with `"leads"`.
5. Add one branch to the tab content switch: `activeTab === "leads" && <BoilerEnquiries />` — same as the other tabs.

## What does NOT change
- The standalone `/boiler-enquiries` route in App.tsx stays exactly as it is — the page stays reachable both ways, same as Quotes.
- The Boiler Enquiries page itself is untouched; it keeps rendering its own layout inside the Pipeline tab, like Incoming/Quotes/Renewals/Warranty do.

## Verification
1. Type check and full test suite.
2. Playwright against the preview, signed in as the superadmin (office view): confirm the tab order is **Incoming → Leads → Quotes** and clicking Leads shows the Boiler Enquiries list.
3. Engineer check: confirm the Leads tab is not rendered for an engineer account (role logic gates on `isAdmin || isOffice`).
