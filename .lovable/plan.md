
## One-line debug log in `tally-incoming-job`

Add a single unconditional `console.log` of the raw parsed body, then deploy the Edge Function.

### The diff

`supabase/functions/tally-incoming-job/index.ts` — insert one line immediately after `body` is parsed (line 56). This is the earliest point in the `try` block where `body` exists; validation, org lookup, and everything else run after it.

```diff
     const body = JSON.parse(cleanText);
+    console.log("[tally-incoming-job] RAW BODY:", JSON.stringify(body));
 
     // Extract and sanitize fields
     const customerName = sanitize(body.customer_name, MAX_NAME_LEN);
```

That's the only change to the file. Nothing else touched.

### Scope confirmation

- `tally-boiler-rebook`: not touched.
- `tally-webhook`: not touched.
- No other logging, comments, refactors, or conditional wrapping added.

### Deploy

After the edit, explicitly deploy `tally-incoming-job` (Publish does not redeploy Edge Functions).

### Note on placement

You wrote "the absolute first statement in the try block, before any other logic runs." The `try` block currently starts with three lines that produce `body`:

```ts
const rawText = await req.text();
const cleanText = rawText.replace(/[\x00-\x1F\x7F]/g, ...);
const body = JSON.parse(cleanText);
```

The log has to come after `body` exists, so it goes on the line immediately after `JSON.parse` — before validation, org lookup, sanitization, everything. That's the earliest point where there's anything to log. Flag if you'd rather also log `rawText` (pre-sanitization) as well — say the word and I'll add that as a second line above it. Otherwise proceeding with just the one line as specified.

Switch to build mode to apply.
