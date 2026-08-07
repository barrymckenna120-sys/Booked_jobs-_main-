# Fix: tally-incoming-job "server error" on submissions with no file upload

## The actual error

The edge function logs for the failing attempts all show the same thing — this is not a database or validation error, the request body never parses:

```text
tally-incoming-job error: SyntaxError: Unexpected token ',',
..."_upload": ,    "orga"... is not valid JSON
    at JSON.parse (<anonymous>)
    at Object.handler (.../tally-incoming-job/index.ts:56:23)
```

Line 56 is `const body = JSON.parse(cleanText)`. The incoming JSON literally contains:

```text
"photo_video_upload": ,
"organisation_id": "..."
```

The Make scenario builds the request body as a raw JSON string with a mapped token for `photo_video_upload`. When the caller uploads no file, that token resolves to nothing, leaving a bare `:` followed by `,` — invalid JSON. So the request reaches the function, passes the secret check, and dies immediately on parse. One earlier attempt shows `"_upload": ,,` (two commas), the same root cause.

This means no job row was created for `e7b9c4aa-6635-47a4-9543-128db22e63b4` — the function never got past parsing.

## Where to fix it

Two layers; recommend doing both.

1. **Make scenario (real fix, no code):** in the HTTP module body, wrap the upload token so an empty value emits valid JSON — either quote it (`"photo_video_upload": "{{token}}"`) or use Make's JSON module instead of a hand-written body string. Best done by you on the Make side.

2. **Edge function (defensive, so a malformed body never 500s):** in `tally-incoming-job`, after the existing control-character clean-up and before `JSON.parse`:
   - Repair empty JSON values: replace `: ,` with `: null,` and `: }` with `: null}`, and collapse `,,` to `,` and a trailing `,}` to `}`.
   - Wrap `JSON.parse` in its own try/catch that returns **400** with `error: "Malformed JSON body"` plus a truncated snippet of the offending text, instead of falling through to the generic 500.
   - Log the raw text (truncated) on parse failure so future occurrences are diagnosable from the logs.

`photo_video_upload` is already handled as optional downstream, so `null` is safe.

## Not changing

No schema changes, no auth changes, no changes to validation rules or the job-creation path.

## After the fix

Re-send the same test submission from Tally (with and without a photo) and confirm a job row is created and the response is `success: true`.
