# Help & Training access — findings and recommendation

## Where it is today (checked in the preview, signed in)

| Place | Where Help & Training is |
|---|---|
| Office laptop | Top-right header: "Help" button (lifebuoy icon, between "Take the tour" and the bell) opens a small menu: Take the tour / Help & Training / Report an issue. Clicking it opened /help. There is no three-dot menu on Office laptop. |
| Office phone | Three-dot menu (top right): New Job, Settings, Take the tour, Help & Training, Report an issue, Sign Out. |
| Engineer phone | Three-dot menu (top right): Order Parts, Fault Finder, Take the tour, Help & Training, Report a Bug, Sign Out. |
| Engineer laptop | Not present. Header shows Order Parts, Fault Finder, Take the tour, Report a Bug, Alerts — no Help & Training. |
| Direct link | Opening /help/engineer directly while signed in loads the guide. |

So Office laptop does have an entry, but it is hidden one click deep inside "Help", which reads like the tour/support button.

## Recommended location (awaiting your approval — nothing changed)

1. Office laptop: turn the existing "Help" header button into a direct link straight to Help & Training (same place, same icon, label "Help & Training"). Keep "Take the tour" beside it, and move "Report an issue" into the Help & Training home page or keep it as its own small button. No sidebar change.
2. Engineer laptop (gap found): add a "Help & Training" button to the existing header row, next to "Take the tour".

No other menu items are removed, renamed or reordered. No auth, data or other changes.

## Technical details
- Office laptop: `src/components/layout/AppLayout.tsx` lines 356-367 (dropdown).
- Engineer laptop: `src/components/engineer/EngineerLayout.tsx` desktop header (~line 142 onward).
