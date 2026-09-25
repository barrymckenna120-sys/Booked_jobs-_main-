/** Return the originally captured phone unchanged for the rebooking form. */
export function rebookMobileParam(storedPhone: string | null | undefined): string {
  return storedPhone ?? "";
}
