# STOP replies: diagnosis and payload-format fix

## Answer: one root cause, not two
Both problems have the same cause. Today's two "stop" messages (14:40 and 14:41 UTC) passed the password check. The receiver then threw them away as "not a message", at the very first step. The opt-out update and the "Got it — we've removed you…" reply come later in that same code, so neither ran. There's no sign of a separate problem with the confirmation send. It was never attempted.

## Full path, checked against today's evidence

| Step | What happens | Status today |
|---|---|---|
| 1. Password check | `?s=` must match | PASS (since 14:40) |
| 2. Read message | expects `dataType`, `From`, `Chat` | **BREAKS**: 360 Messenger now sends `event`, `data.from`, `data.body` |
| 3. Duplicate guard | same sender and text within 10 min is skipped | not reached |
| 4. Match customer | by exact phone | not reached. +212656802656 matches 5 records (see risk below) |
| 5. Record opt-out | sets opted_out on the matched records | not reached |
| 6. Compose reply | "Got it — we've removed you…" plus company name | not reached |
| 7. Send reply | 360 Messenger, using the replying company's WhatsApp key | not reached. K&N Ltd's key is set up (`THREESIXTY_API_KEY`) |
| 8. Log result | message_log shows sent or failed | not reached. Last opt-out reply was on 10/08, sent OK |

Points 7 and 8 have worked before. On 10/08 one reply failed on phone format and a later one sent fine, and the phone format for +212 numbers has since been fixed. So once step 2 is fixed, the reply is expected to work. I'll confirm that from the logs rather than assume it.

## The fix (one file, one function)
In `whatsapp-inbound`, read both layouts:
- event type: `dataType` **or** `event`
- sender: `From` **or** `data.from`
- text: `Chat`/`Caption` **or** `data.body`
- time: `createdAt` **or** `data.timestamp`

Nothing else changes: not the matching, the opt-out writes, the reply wording or the password check. I'll add one regression test using today's real message layout, and check that the old layout still works.

## Deploy and verify
1. Deploy `whatsapp-inbound` only.
2. You send STOP from abdenneur1's phone (+212656802656).
3. I confirm from the database and logs:
   - the opt-out was recorded for abdenneur1 (K&N Ltd)
   - the confirmation reply shows as "sent" in message_log, and you confirm it arrived on the phone
   - if the reply failed, I report the exact 360 Messenger error. That would be a second, separate fix.

## Risk to know about (not changed by this fix)
+212656802656 is on 5 customer records across 3 companies: K&N Ltd (abdenneur1), Dublin Gas (2 scratch records) and K&N Gas Services (2 scratch/test records). All companies share one WhatsApp number, so a STOP opts out **every** record with that phone, in every company. For this test they are all test records, so it's safe. For real customers, one STOP would unsubscribe the person from every company that has them on file. That's arguably correct for a shared sender, but it's a tenant-isolation decision for you. I'll track it as a separate item and won't change it now.

## Cleanup (separate approval)
Reset opt-out on the test records afterwards if you want to reuse abdenneur1 for further tests.
