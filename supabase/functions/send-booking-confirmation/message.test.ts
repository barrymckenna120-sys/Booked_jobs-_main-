import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildBookingMessage, capitaliseFirst, formatBookingDate, parseMode } from "./message.ts";

const base = {
  firstName: "Barry",
  companyName: "K&N Gas Services",
  timeSlot: "AM",
  engineerName: "Karl",
  messageFooter: "K&N Gas Services | 0871234567",
};

Deno.test("confirm text is unchanged", () => {
  assertEquals(
    buildBookingMessage({ ...base, mode: "confirm", formattedDate: formatBookingDate("2026-10-01", false) }),
    "Hi Barry, your booking with K&N Gas Services is confirmed.\n\n" +
      "📅 Date: 01/10/2026\n⏰ Time: AM\n👷 Engineer: Karl\n\n" +
      "If you need to make any changes please reply to this message.\n\nK&N Gas Services | 0871234567",
  );
});

Deno.test("reschedule text is exact", () => {
  assertEquals(
    buildBookingMessage({ ...base, mode: "reschedule", formattedDate: formatBookingDate("2026-10-01", true) }),
    "Hi Barry, there's been a change to our schedule and we've had to move your appointment with K&N Gas Services. Apologies for any inconvenience.\n\n" +
      "📅 New date: Thu 01/10/2026\n⏰ Time: AM\n👷 Engineer: Karl\n\n" +
      "Does this new time suit? Please reply to this message to confirm, or let us know and we'll find another time.\n\nK&N Gas Services | 0871234567",
  );
});

Deno.test("reschedule without footer or company", () => {
  assertEquals(
    buildBookingMessage({ ...base, companyName: "", messageFooter: "", mode: "reschedule", formattedDate: "TBC" }).startsWith(
      "Hi Barry, there's been a change to our schedule and we've had to move your appointment with us.",
    ),
    true,
  );
});

Deno.test("first-name capitalisation", () => {
  assertEquals(capitaliseFirst("barry"), "Barry");
  assertEquals(capitaliseFirst("McKenna"), "McKenna");
  assertEquals(capitaliseFirst(""), "");
});

Deno.test("mode parsing defaults to confirm", () => {
  assertEquals(parseMode("reschedule"), "reschedule");
  assertEquals(parseMode("confirm"), "confirm");
  assertEquals(parseMode("other"), "confirm");
  assertEquals(parseMode(undefined), "confirm");
});
