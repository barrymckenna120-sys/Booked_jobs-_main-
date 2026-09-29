/** Pure message builders for send-booking-confirmation (BJ-NEW-Z). */

export type BookingMode = "confirm" | "reschedule";

export const parseMode = (value: unknown): BookingMode =>
  value === "reschedule" ? "reschedule" : "confirm";

/** Uppercase the first character only; the rest is left untouched. */
export const capitaliseFirst = (name: string): string =>
  name ? name.charAt(0).toUpperCase() + name.slice(1) : name;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** DD/MM/YYYY (confirm) or Ddd DD/MM/YYYY (reschedule); "TBC" if no date. */
export const formatBookingDate = (scheduledDate: string | null | undefined, withWeekday: boolean): string => {
  if (!scheduledDate) return "TBC";
  const d = new Date(scheduledDate + "T12:00:00");
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const base = `${dd}/${mm}/${yyyy}`;
  return withWeekday ? `${WEEKDAYS[d.getDay()]} ${base}` : base;
};

export interface BookingMessageInput {
  mode: BookingMode;
  firstName: string;
  companyName: string;
  formattedDate: string;
  timeSlot: string;
  engineerName: string;
  messageFooter: string;
}

export const buildBookingMessage = (v: BookingMessageInput): string => {
  const footer = v.messageFooter ? `\n\n${v.messageFooter}` : "";
  if (v.mode === "reschedule") {
    return (
      `Hi ${v.firstName}, there's been a change to our schedule and we've had to move your appointment with ${v.companyName || "us"}. Apologies for any inconvenience.\n\n` +
      `📅 New date: ${v.formattedDate}\n` +
      `⏰ Time: ${v.timeSlot}\n` +
      `👷 Engineer: ${v.engineerName}\n\n` +
      `Does this new time suit? Please reply to this message to confirm, or let us know and we'll find another time.` +
      footer
    );
  }
  return (
    `Hi ${v.firstName}, your booking with ${v.companyName || "us"} is confirmed.\n\n` +
    `📅 Date: ${v.formattedDate}\n` +
    `⏰ Time: ${v.timeSlot}\n` +
    `👷 Engineer: ${v.engineerName}\n\n` +
    `If you need to make any changes please reply to this message.` +
    footer
  );
};
