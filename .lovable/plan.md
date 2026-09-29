# Footer data update and evidence (approved "Go")

## 1. Data
- Run the UPDATE exactly as you wrote it, with RETURNING. Confirm it returns exactly 2 rows and paste them.
- If it doesn't return exactly 2 rows, stop and report.
- Read back both companies again, and confirm the settings count for other companies is unchanged.

## 2. Tests
- Run the focused footer tests and the full test suite, and report both counts.
- Run the type check and report the result.

## 3. TEST K&N checks (c0aa41ac only)
- Send one booking confirmation on a scratch TEST K&N job to a reserved test number. Paste the footer line from message_log, which must be exactly "K&N Gas Services".
- Generate one receipt PDF and one quote PDF from existing TEST K&N records. Confirm the header reads "K&N Gas Services Limited" using the PDF text or a screenshot.
- Nothing is sent or generated on real K&N.

## 4. Report
- The hash on the working branch, since origin/dev can't be confirmed.
- Before/after data, test counts, the footer line and the PDF header evidence.
