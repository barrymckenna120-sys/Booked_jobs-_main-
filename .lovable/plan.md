# Mobile overlays must never trap the user

## Goal
Every Help image viewer and Take a Tour state (Office and Engineer, mobile and desktop) always shows a usable X that is independent of the image/tour content, and closing always leaves BookedJobs fully usable.

## Current state (checked)
- Help viewer: X is already fixed, 44px, above the image layer and safe-area aware. Zoom/pan happens underneath. Needs re-verification plus cleanup checks only.
- Mobile tour: the X sits inside the scrolling tour card, so scrolling the card can move it out of view. This is the real gap.

## Changes
1. Mobile tour card: move the X outside the scrolling area into a non-scrolling top row of the card, so card content scrolls underneath it. Keep 44x44px, safe-area aware, top-right. Applies to intro, every step and feedback, both Office and Engineer.
2. Cleanup: confirm that after closing any viewer/tour there is no leftover backdrop, page scrolling is restored, and no invisible layer blocks taps. Fix only if a leftover is found.
3. Help viewer: no code change unless testing shows a failure.

## Decision needed: "no forced completion"
Today, pressing X marks the tour as seen (it will not auto-open again; Take a Tour still replays it). Your earlier instruction said keep completion behaviour unchanged. This plan keeps it unchanged unless you say X should leave the tour unseen so it reappears next login.

## Verification (390x844 with safe area, and 1280px)
- Engineer Help image: open, enlarge, zoom, pan, X visible, close, Engineer screen tappable and scrollable.
- Engineer and Office tour: first pop-up X closes; reopen, advance several steps, scroll card, X still visible, close, screen usable, same page.
- Open/close each 3 times, then confirm no blocking layer remains.
- 1280px: Escape closes viewer and both tours.
- Report PASS/FAIL per check.

No guide content, tour wording, order or business functionality changes.
