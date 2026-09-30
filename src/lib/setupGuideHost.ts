/** Web address shown on the iPhone setup mockups. Never hard-codes a tenant. */
export const FALLBACK_SETUP_HOST = "yourcompany.bookedjobs.ie";

export const getSetupGuideHost = (
  hostname: string = typeof window !== "undefined" ? window.location.hostname : "",
): string => (hostname.endsWith(".bookedjobs.ie") ? hostname : FALLBACK_SETUP_HOST);
