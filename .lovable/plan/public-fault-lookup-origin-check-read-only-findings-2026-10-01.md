# public-fault-lookup origin check (read-only findings)

## Logs, last 15 minutes (16:20–16:35 UTC, 01/10/26)
- The function's logs contain only start-up and shut-down entries. The function does not log each request, so it records no action, Origin or status per request.
- The request-log tables returned no rows for this function.
- Result: I cannot report time, Origin or status for any action=models request from the existing logs. I have not guessed any of these.

## Current PUBLIC_FAULT_ALLOWED_ORIGINS (6 entries, exact form)
```text
0 https://kngasservices.lovable.app          (33 chars)
1 https://<K&N custom domain>                (27)
2 https://www.<K&N custom domain>            (31)
3 https://newgasboilers.ie                   (24)
4 https://www.newgasboilers.ie               (28)
5 https://<new-boilers-project>.lovable.app  (41)
```
None has a trailing slash, a space or http. Every entry uses https and no entry has a path.

## Likely gap (unconfirmed)
The match is exact. Lovable preview pages load from `https://id-preview--<id>.lovable.app` or `*.lovableproject.com`. Those origins are not on the list, so the editor preview gets a 403 `origin_not_allowed`, but the published site does not.

## Proposed next step (needs approval, changes nothing else)
Pick one:
1. Open the calling page in a browser, read the Origin it sends and the response status, then compare it against the list above. This step is read-only.
2. Add one `console.log` line to the function (time, action, Origin, status) and deploy it, so future requests show up in the logs.
