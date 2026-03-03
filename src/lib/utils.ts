import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a date string (YYYY-MM-DD or ISO) to DD/MM/YYYY */
export function formatDateIE(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr.length === 10 ? dateStr + "T00:00:00" : dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-IE", { day: "2-digit", month: "2-digit", year: "numeric" });
}
