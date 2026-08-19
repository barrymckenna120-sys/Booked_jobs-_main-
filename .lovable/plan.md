# Next Job Card — Single Tap Target

## Goal
Make the entire Next Job card on `/engineer/today` tappable so it opens the Job Details screen, except for the action buttons inside it. Add a chevron next to the customer name as the tappable cue.

## Affected File
- `src/components/engineer/EngineerJobCard.tsx`

## Current State
- The card root has an `onClick` handler, but it is only attached when `isDone` is true (`isDone ? () => navigate(...) : undefined`).
- Active Next Job cards therefore have no tap-to-open behaviour.
- The `Details` button in `QuickActions` navigates to `/engineer/job/${jobId}`.
- Action buttons (Call, WhatsApp, Nav, Details, Certificates, Note, Media, Video, Extra Work, primary status, Message Office, Take Payment, receipt) currently have no `stopPropagation`, so a wrapper click would fire through them.

## Changes

### 1. Make the whole card tappable for the Next Job
- Add a wrapper `onClick` on the card root that navigates to `/engineer/job/${job.id}` when `isNextJob` is true.
- Keep the existing `isDone` navigation behaviour for completed/cancelled/no_show cards unchanged.
- Ensure the wrapper click does not fire when any inner button is tapped.

### 2. Add chevron cue next to customer name
- Import `ChevronRight` from `lucide-react`.
- Place it inline after the customer name in the header, sized and coloured consistently with existing chevrons elsewhere in the app (e.g. `w-4 h-4 text-muted-foreground/30` with a hover transition).
- Do not change font sizes, weights, or colours of the customer name.

### 3. Stop propagation on all action buttons
Add `e.stopPropagation()` (or wrap handlers with a stopPropagation helper) to every interactive control inside the card so they do not trigger the card-level navigation:
- `QuickActions`: Call, WhatsApp, Nav, Details, Certificates buttons.
- `SecondaryActions`: Note, Media, Video, Extra Work buttons.
- `PrimaryActions`: status-change / Complete / Cancel / No Access / Parts Needed buttons.
- Message Office button.
- Take Payment / receipt buttons shown for Completed / In Progress jobs.
- Any other clickable elements inside the card (e.g. phone link for completed cards).

Do not change what any button does, its styling, or its layout.

### 4. Preserve payment banner and other non-button content
- The deposit/balance banner from `InfoPills` / `resolveDepositPill` remains exactly as it is and only shows when money is owed.
- Tags, service history, notes, media grid, messages, and read-only sections stay unchanged.

## Verification
- Tap on the Next Job card background/header/address/issue area → navigates to `/engineer/job/{id}`.
- Tap Call, WhatsApp, Nav, Details, Certificates → performs its action and does not navigate.
- Tap primary status button (En Route / Arrived / Start Work / Complete / etc.) → performs status action and does not navigate.
- Tap Note / Media / Video / Extra Work / Message Office / Take Payment → performs its action and does not navigate.
- Payment banner still only renders when money is owed.
- Screenshot of Next Job card shows chevron next to customer name.

## Risk Level
Low — pure UI/UX change within a single component. No data, auth, payment, scheduling, or RLS logic touched.
