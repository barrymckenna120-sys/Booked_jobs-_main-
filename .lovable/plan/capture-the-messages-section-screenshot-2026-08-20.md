# Capture the Messages-section screenshot

The EngineerJobDetail sections (Service History, Photos & Videos, Messages) are already implemented and live. The only outstanding item is verification evidence for the Messages section.

## What happens
- Run a headless browser pass against `/engineer/job/:id` for a real KN Gas job at a 390px phone viewport.
- Expand the Messages section and capture a screenshot showing the quick-reply chips and the message input.
- Report the screenshot plus any console errors.

## Out of scope
No code changes at all. No project files are modified — the only writes are a throwaway browser script and screenshot under `/tmp/browser/`.
