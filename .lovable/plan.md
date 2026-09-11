# Safe receipt view/download verification

## Confirmed safe path

Use DG-1019 without resetting or changing anything. Its receipt is already marked sent and already has a generated PDF, so:

- Opening `/receipt-view/edc1f2dc-3082-4726-9187-7903d008e0aa` does not auto-send because the page checks the existing sent marker first.
- “Send via WhatsApp” appears disabled as “Receipt Sent.”
- “Download PDF Receipt” opens the existing PDF; it does not change the sent marker or call the WhatsApp sender.

Do not use DG-998 or DG-ZZ-501 for this check: their receipts are currently marked unsent, and merely opening their receipt screens would trigger the current automatic WhatsApp-send behavior.

## Verification steps

1. Read and record DG-1019’s sent marker, sent time, existing PDF path, and current receipt-message/delivery counts.
2. Open DG-1019’s receipt screen and confirm the receipt details and disabled “Receipt Sent” control.
3. Click “Download PDF Receipt” and confirm the PDF opens successfully with the correct receipt number and amount.
4. Read the same records again and prove:
   - the sent marker and sent time are unchanged;
   - no new WhatsApp message row exists;
   - no new receipt-delivery attempt exists.

## Scope and safety

- No database writes or status resets.
- No WhatsApp-send action invoked.
- No payment, receipt, or customer data changed.
- No code changes are required for this verification.
