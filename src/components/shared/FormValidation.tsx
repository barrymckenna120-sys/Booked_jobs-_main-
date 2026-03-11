import { cn } from "@/lib/utils";

/**
 * Shared amber validation styling for form fields.
 * Use `validationBorder` on the field wrapper/trigger and `ValidationMessage` below it.
 */

export const VALIDATION_MSG = "Don't forget to fill this in";
export const AMBER = "#F59E0B";

/** Returns border class for invalid fields — amber ring */
export const validationBorderClass = (hasError: boolean) =>
  hasError ? "ring-2 ring-[#F59E0B] border-[#F59E0B]" : "";

/** Inline amber error text below a field */
export const ValidationMessage = ({ show }: { show: boolean }) => {
  if (!show) return null;
  return (
    <p className="text-xs mt-1 font-medium" style={{ color: AMBER }}>
      {VALIDATION_MSG}
    </p>
  );
};
