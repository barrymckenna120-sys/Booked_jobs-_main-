/**
 * Decides whether a Schedule placement should send the reschedule wording.
 * First placement of Pending/incoming jobs (e.g. Tally, quote surveys with a
 * preferred date) must get the normal confirmation.
 */
export interface BookingModeInput {
  status: string | null;
  needsScheduling: boolean | null;
  oldDate: string | null;
  oldBlock: string | null;
  newDate: string;
  newBlock: string;
}

export const bookingConfirmationMode = (v: BookingModeInput): "reschedule" | "confirm" => {
  const status = (v.status ?? "").trim().toLowerCase();
  if (!status || status === "pending" || status === "incoming") return "confirm";
  if (v.needsScheduling === true) return "confirm";
  if (!v.oldDate || !v.oldBlock) return "confirm";
  const moved = v.oldDate.slice(0, 10) !== v.newDate.slice(0, 10) || v.oldBlock !== v.newBlock;
  return moved ? "reschedule" : "confirm";
};
