/**
 * Phase 3 batch 1 — byte-for-byte equality between the OLD inline templates
 * (copied verbatim from git history, before the rewire) and the canonical
 * catalogue builders now used by the migrated Edge Functions.
 *
 * Batch 1 paths:
 *   send-upcoming-reminders  -> appointment_reminder
 *   job-reminder-2day        -> job_reminder_2day
 *   send-part-arrived        -> part_arrived
 *   send-hazard-whatsapp     -> hazard_notification
 *
 * Also asserts each migrated function calls the catalogue (no inline body left)
 * and still writes the same message_log.message_type and the 360Messenger
 * `phonenumber` payload field.
 */
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { buildCatalogueMessage } from "./whatsappCatalogue.ts";

// --- legacy replicas (verbatim from the pre-migration source) --------------

const legacyAppointmentReminder = (v: Record<string, string>) =>
  `Appointment Reminder 📅
${v.messageFooter}

Hi ${v.firstName}, just a reminder that your ${v.jobType} is booked for ${v.targetStr} between ${v.timeSlot}.

Your engineer ${v.engineerName} will be with you on the day. If you need to reschedule, please give us a call.

Thanks,
${v.messageFooter}`;

const legacyJobReminder2Day = (v: Record<string, unknown>) => {
  const engineerLine = v.engineerName ? `\nYour engineer will be ${v.engineerName}.\n` : "";
  return `Hi ${v.firstName},

This is a reminder from ${v.companyName} that your appointment is confirmed for ${v.formattedDate} at ${v.formattedTime}.
${engineerLine}
Please reply CONFIRM to confirm your appointment or CANCEL to cancel. Alternatively call us on ${v.companyPhone}.

${v.companyName} ☎ ${v.companyPhone}`;
};

const legacyPartArrived = (v: Record<string, unknown>) => {
  const baseMessage = v.customMessage ||
    `Hi ${v.firstName}, great news! The part we ordered for your boiler has arrived. 🔧\n\nWe'd like to arrange a time to come back and complete the work.\n\nDetails: ${
      v.follow_up_detail || "Follow-up repair"
    }\n\nPlease reply to this message or call us to book a time that suits you.`;
  return v.messageFooter ? `${baseMessage}\n\n${v.messageFooter}` : baseMessage;
};

const legacyHazard = (v: Record<string, unknown>) => {
  const linkLine = v.hazardUrl ? `\n\n📄 View Document:\n${v.hazardUrl}` : "";
  return `Hi ${v.firstName}, please find attached your Gas Installation Notification of Hazard/Non-Conformance from ${v.engineerName}.${linkLine}\n\n${v.messageFooter}`;
};

// --- equality cases -------------------------------------------------------

const appointmentCases = [
  {
    messageFooter: "K&N Gas Services",
    firstName: "Mary",
    jobType: "Boiler Service",
    targetStr: "Tuesday, 1 September",
    timeSlot: "9am - 1pm",
    engineerName: "Karl",
  },
  {
    messageFooter: "Dublin Gas",
    firstName: "Customer",
    jobType: "service",
    targetStr: "Wednesday, 2 September",
    timeSlot: "TBC",
    engineerName: "our engineer",
  },
];

Deno.test("appointment_reminder builder equals the legacy inline template", () => {
  for (const c of appointmentCases) {
    assertEquals(buildCatalogueMessage("appointment_reminder", c), legacyAppointmentReminder(c));
  }
});

Deno.test("job_reminder_2day builder equals the legacy inline template (F1 defect preserved)", () => {
  const cases: Record<string, unknown>[] = [
    {
      firstName: "Mary",
      companyName: "Dublin Gas",
      companyPhone: "01 555 0000",
      formattedDate: "01/09/26",
      formattedTime: "9am - 1pm",
      engineerName: "Paul",
    },
    // no engineer -> line omitted
    {
      firstName: "Mary",
      companyName: "Dublin Gas",
      companyPhone: "01 555 0000",
      formattedDate: "01/09/26",
      formattedTime: "9am - 1pm",
      engineerName: null,
    },
    // F1: missing branding still interpolates the literal "undefined"
    {
      firstName: "Mary",
      companyName: undefined,
      companyPhone: undefined,
      formattedDate: "01/09/26",
      formattedTime: "9am - 1pm",
      engineerName: "Paul",
    },
  ];
  for (const c of cases) {
    assertEquals(buildCatalogueMessage("job_reminder_2day", c), legacyJobReminder2Day(c));
  }
  // F1 is still present and NOT fixed by the rewire.
  assertStringIncludes(buildCatalogueMessage("job_reminder_2day", cases[2]), "undefined");
});

Deno.test("part_arrived builder equals the legacy inline template", () => {
  const cases: Record<string, unknown>[] = [
    { firstName: "Mary", follow_up_detail: "Fan replacement", customMessage: null, messageFooter: "K&N Gas Services" },
    { firstName: "Mary", follow_up_detail: null, customMessage: null, messageFooter: "K&N Gas Services" },
    { firstName: "Mary", follow_up_detail: "Fan replacement", customMessage: null, messageFooter: "" },
    { firstName: "Mary", follow_up_detail: "ignored", customMessage: "Custom office text", messageFooter: "Dublin Gas" },
  ];
  for (const c of cases) {
    assertEquals(buildCatalogueMessage("part_arrived", c), legacyPartArrived(c));
  }
});

Deno.test("hazard_notification builder equals the legacy inline template", () => {
  const cases: Record<string, unknown>[] = [
    {
      firstName: "Mary",
      engineerName: "Karl",
      hazardUrl: "https://kngasservices.bookedjobs.ie/hazard/abc",
      messageFooter: "K&N Gas Services",
    },
    { firstName: "Mary", engineerName: "your engineer", hazardUrl: null, messageFooter: "Dublin Gas" },
  ];
  for (const c of cases) {
    assertEquals(buildCatalogueMessage("hazard_notification", c), legacyHazard(c));
  }
});

// --- migration hygiene ----------------------------------------------------

const MIGRATED: Array<{ fn: string; key: string; messageType: string }> = [
  { fn: "send-upcoming-reminders", key: "appointment_reminder", messageType: "appointment_reminder" },
  { fn: "job-reminder-2day", key: "job_reminder_2day", messageType: "job_reminder_2day" },
  { fn: "send-part-arrived", key: "part_arrived", messageType: "part_arrived" },
  { fn: "send-hazard-whatsapp", key: "hazard_notification", messageType: "hazard_notification" },
];

Deno.test("migrated functions build via the catalogue and keep logging + payload shape", async () => {
  for (const m of MIGRATED) {
    const src = await Deno.readTextFile(new URL(`../${m.fn}/index.ts`, import.meta.url));
    assertStringIncludes(src, `buildCatalogueMessage("${m.key}"`);
    assertStringIncludes(src, `"${m.messageType}"`);
    assertStringIncludes(src, `"phonenumber"`);
    // no inline body left behind
    assertEquals(src.includes("please find attached your Gas Installation"), false);
    assertEquals(src.includes("just a reminder that your"), false);
    assertEquals(src.includes("This is a reminder from"), false);
    assertEquals(src.includes("The part we ordered for your boiler"), false);
  }
});
