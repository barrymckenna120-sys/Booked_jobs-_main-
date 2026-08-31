import { assertEquals, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildSendMessageForm,
  describeSendMessageForm,
  WHATSAPP_PHONE_FIELD,
  WHATSAPP_SEND_URL,
  WHATSAPP_TEXT_FIELD,
} from "./whatsappPayload.ts";

Deno.test("recipient field is spelled 'phonenumber', never 'phone_number'", () => {
  assertEquals(WHATSAPP_PHONE_FIELD, "phonenumber");
  const form = buildSendMessageForm("353871234567", "hello");
  assert(form.has("phonenumber"), "outbound payload must carry a 'phonenumber' field");
  assert(
    !form.has("phone_number"),
    "'phone_number' is rejected by 360Messenger with HTTP 403 Forbidden resource",
  );
});

Deno.test("payload carries exactly the two expected fields with the given values", () => {
  const form = buildSendMessageForm("353871234567", "Hi Bob, your deposit is outstanding.");
  assertEquals(describeSendMessageForm(form), {
    phonenumber: "353871234567",
    text: "Hi Bob, your deposit is outstanding.",
  });
});

Deno.test("text field name and send URL are stable", () => {
  assertEquals(WHATSAPP_TEXT_FIELD, "text");
  assertEquals(WHATSAPP_SEND_URL, "https://api.360messenger.com/v2/sendMessage");
});

Deno.test("builder does not mutate or normalise the phone it is given", () => {
  // Normalisation is the caller's job; the builder must be a faithful pass-through so a
  // caller's normalisation bug cannot be masked here.
  const form = buildSendMessageForm("+353 87 123 4567", "x");
  assertEquals(describeSendMessageForm(form).phonenumber, "+353 87 123 4567");
});

Deno.test("multi-line message bodies survive intact", () => {
  const body = "Line one\n\nLine two ☎ +353871234567";
  const form = buildSendMessageForm("353871234567", body);
  assertEquals(describeSendMessageForm(form).text, body);
});
