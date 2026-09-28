import { assert, assertEquals } from "jsr:@std/assert@1";
import { mapTallyForm, TALLY_FORM_MAPS } from "./tallyFormMaps.ts";
import { tallySignatureFor, verifyTallySignature } from "./tallySignature.ts";

const map = TALLY_FORM_MAPS.Zjq5rA;

const body = {
  formId: "Zjq5rA",
  data: {
    responseId: "r1",
    fields: [
      { key: "question_OBVJg7", label: "Contact details", type: "INPUT_TEXT", value: "Test Person" },
      { key: "question_4NGoqk", label: "Moblie number", type: "INPUT_PHONE_NUMBER", value: "+353870000000" },
      { key: "question_EbaJgX", label: "Email", type: "INPUT_TEXT", value: "t@example.ie" },
      { key: "question_V1xMdJ", label: "Eircode", type: "INPUT_TEXT", value: "D01 X2Y3" },
      {
        key: "question_oVx7gP", label: "Property", type: "MULTIPLE_CHOICE", value: ["o1"],
        options: [{ id: "o1", text: "Semi-detached" }, { id: "o2", text: "Apartment" }],
      },
      { key: "question_RBrJgd", label: "Interested…", type: "INPUT_TEXT", value: "Smart controls" },
      { key: "question_GB7Jgp", label: "Photos current boiler", type: "FILE_UPLOAD", value: [{ url: "https://storage.tally.so/a.jpg", name: "a.jpg" }] },
      { key: "question_NEW123", label: "Renamed new question", type: "INPUT_TEXT", value: "Hello" },
    ],
  },
};

Deno.test("Zjq5rA: contact, columns, fixed source/type", () => {
  const m = mapTallyForm(map, body);
  assertEquals(m.contact, { name: "Test Person", phone: "+353870000000", email: "t@example.ie" });
  assertEquals(m.columns.eircode, "D01 X2Y3");
  assertEquals(m.columns.property_type, "Semi-detached");
  assertEquals(m.source, "kn-website-new-boiler");
  assertEquals(m.enquiryType, "new_boiler");
});

Deno.test("Zjq5rA: notes in order, unknown field to other_answers, photos kept", () => {
  const m = mapTallyForm(map, body);
  assertEquals(m.notes.survey_answers, [
    { label: "Property", value: "Semi-detached" },
    { label: "Extras", value: "Smart controls" },
  ]);
  assertEquals(m.notes.other_answers, [{ label: "Renamed new question", value: "Hello" }]);
  assertEquals(m.photoUrls, ["https://storage.tally.so/a.jpg"]);
});

Deno.test("Zjq5rA: missing optional fields still maps", () => {
  const m = mapTallyForm(map, { formId: "Zjq5rA", data: { fields: [{ key: "question_EbaJgX", value: "x@y.ie" }] } });
  assertEquals(m.contact.email, "x@y.ie");
  assertEquals(m.contact.phone, null);
  assertEquals(m.notes.survey_answers, []);
});

Deno.test("signature over JSON.stringify(parsed) accepted for pretty-printed raw body", async () => {
  const raw = JSON.stringify(body, null, 2);
  const sig = await tallySignatureFor(JSON.stringify(body), "s3cret");
  assert(await verifyTallySignature(raw, sig, "s3cret"));
  assertEquals(await verifyTallySignature(raw, sig, "wrong"), false);
});
