/** A link may only point at one of this organisation's own configured form addresses. */
export function isAllowedTarget(fullUrl: string, bases: Array<string | null | undefined>): boolean {
  return bases.some((b) => typeof b === "string" && b.trim().length > 0 && fullUrl.startsWith(b));
}
