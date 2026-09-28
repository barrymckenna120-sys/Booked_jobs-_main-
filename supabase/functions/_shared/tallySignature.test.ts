import { assert, assertEquals } from "jsr:@std/assert@1";
import { tallyFieldSchema, tallySignatureFor, verifyTallySignature } from "./tallySignature.ts";
import { validatePhoneOrEmail } from "./boilerEnquiryPayload.ts";

const body = JSON.stringify({ formId: "Zjq5rA", data: { responseId: "r1" } });

Deno.test("valid signature verifies", async () => {
  const sig = await tallySignatureFor(body, "s3cret");
  assert(await verifyTallySignature(body, sig, "s3cret"));
});

Deno.test("bad signature rejected", async () => {
  const sig = await tallySignatureFor(body, "other");
  assertEquals(await verifyTallySignature(body, sig, "s3cret"), false);
});

Deno.test("tampered body rejected", async () => {
  const sig = await tallySignatureFor(body, "s3cret");
  assertEquals(await verifyTallySignature(body + " ", sig, "s3cret"), false);
});

Deno.test("missing signature or secret rejected", async () => {
  assertEquals(await verifyTallySignature(body, null, "s3cret"), false);
  assertEquals(await verifyTallySignature(body, "", "s3cret"), false);
  assertEquals(await verifyTallySignature(body, "abc", ""), false);
});

Deno.test("field schema never includes answer values", () => {
  const schema = tallyFieldSchema({
    data: { fields: [{ key: "question_abc", label: "Email", type: "INPUT_EMAIL", value: "a@b.ie" }] },
  });
  assertEquals(schema, [{ key: "question_abc", label: "Email", type: "INPUT_EMAIL" }]);
  assert(!JSON.stringify(schema).includes("a@b.ie"));
});

Deno.test("phone-or-email rule", () => {
  assert(validatePhoneOrEmail({ name: null, phone: "0871234567", email: null }).ok);
  assert(validatePhoneOrEmail({ name: null, phone: null, email: "a@b.ie" }).ok);
  assertEquals(validatePhoneOrEmail({ name: "Jo", phone: null, email: null }).ok, false);
});
