/**
 * Maps the shared opt-out decision onto the skip reason/message pair that
 * send-booking-confirmation returns to the caller. Pure, so it is unit-testable.
 */
import { evaluateOptOut, type OptOutCandidate } from "./optOut.ts";

export type BookingSkip = {
  skip: boolean;
  reason?: "opted_out" | "no_phone" | "customer_not_found";
  message?: string;
};

export function bookingConfirmationSkip(customer: OptOutCandidate): BookingSkip {
  const decision = evaluateOptOut(customer);
  if (!decision.skip) return { skip: false };
  switch (decision.reason) {
    case "customer_opted_out":
      return { skip: true, reason: "opted_out", message: "Customer opted out of messages" };
    case "no_phone_number":
      return { skip: true, reason: "no_phone", message: "Customer has no phone number" };
    default:
      return { skip: true, reason: "customer_not_found", message: "Customer record could not be read" };
  }
}
