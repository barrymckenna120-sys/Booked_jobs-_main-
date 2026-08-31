/**
 * Canonical outbound payload shape for the 360Messenger `v2/sendMessage` endpoint.
 *
 * The API expects the recipient field to be spelled `phonenumber` (one word, no
 * underscore). `send-deposit-reminder` shipped with `phone_number` and every send it
 * ever attempted was rejected with HTTP 403 "Forbidden resource" — 26 of 26 attempts
 * across both live tenants, from 25/05/26 to 30/08/26. Centralising the field names
 * here so the spelling exists in exactly one place, with a test guarding it.
 */

/** The recipient field name 360Messenger requires. Never `phone_number`. */
export const WHATSAPP_PHONE_FIELD = "phonenumber";

/** The message body field name 360Messenger requires. */
export const WHATSAPP_TEXT_FIELD = "text";

export const WHATSAPP_SEND_URL = "https://api.360messenger.com/v2/sendMessage";

/**
 * Build the FormData body for a 360Messenger text send.
 *
 * Pure and side-effect free so the payload shape is directly unit-testable without
 * touching the network. Callers remain responsible for phone normalisation.
 */
export function buildSendMessageForm(phone: string, text: string): FormData {
  const form = new FormData();
  form.append(WHATSAPP_PHONE_FIELD, phone);
  form.append(WHATSAPP_TEXT_FIELD, text);
  return form;
}

/**
 * Describe a built form as a plain object — test/diagnostic helper so assertions can
 * inspect the exact field names that would go over the wire.
 */
export function describeSendMessageForm(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    out[key] = typeof value === "string" ? value : "[file]";
  }
  return out;
}
