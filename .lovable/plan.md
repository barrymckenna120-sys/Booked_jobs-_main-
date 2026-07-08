## Publish to production

Lovable projects don't have dev/main branches or merge conflicts — the current project state is what gets deployed. Your custom domains (`kngasservices.bookedjobs.ie` and `dublin-gas.bookedjobs.ie`) are already connected to this project, so publishing updates them both.

### Steps
1. Run a security scan and confirm no unresolved critical findings block publishing.
2. Call `preview_ui--publish` to deploy the current frontend state.
3. Confirm the Lovable URL and remind you the custom domains update automatically once the deploy finishes (~1 minute).

### Notes
- All recent Edge Function changes (`reset-auth-block`, etc.) are already live — backend deploys happen immediately and don't require publish.
- Only frontend changes need this publish step to go live on the custom domains.
