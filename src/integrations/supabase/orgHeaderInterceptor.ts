// Patches global fetch to inject a signed impersonation token
// (`x-org-impersonation-token`) on Supabase requests whenever a superadmin has
// selected a tenant org to view. The token is minted by the `impersonate-org`
// Edge Function and verified server-side by get_my_org_id().

const STORAGE_KEY = "adminViewingOrgId";
const TOKEN_KEY = "adminImpersonationToken";
const TOKEN_EXP_KEY = "adminImpersonationTokenExp";
const TOKEN_ORG_KEY = "adminImpersonationTokenOrg";

let adminSelectedOrgId: string | null =
  typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;

let cachedToken: string | null =
  typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
let cachedTokenExp: number =
  typeof window !== "undefined"
    ? Number(localStorage.getItem(TOKEN_EXP_KEY) || 0)
    : 0;
let cachedTokenOrg: string | null =
  typeof window !== "undefined" ? localStorage.getItem(TOKEN_ORG_KEY) : null;

export const setAdminSelectedOrgId = (orgId: string | null) => {
  adminSelectedOrgId = orgId;
  if (!orgId) clearImpersonationToken();
};

export const getAdminSelectedOrgId = (): string | null => adminSelectedOrgId;

export const setImpersonationToken = (
  orgId: string,
  token: string,
  exp: number,
) => {
  cachedToken = token;
  cachedTokenExp = exp;
  cachedTokenOrg = orgId;
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(TOKEN_EXP_KEY, String(exp));
    localStorage.setItem(TOKEN_ORG_KEY, orgId);
  } catch {
    /* ignore */
  }
};

export const clearImpersonationToken = () => {
  cachedToken = null;
  cachedTokenExp = 0;
  cachedTokenOrg = null;
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXP_KEY);
    localStorage.removeItem(TOKEN_ORG_KEY);
  } catch {
    /* ignore */
  }
};

export const getImpersonationTokenState = () => ({
  token: cachedToken,
  exp: cachedTokenExp,
  org: cachedTokenOrg,
});

let installed = false;

export const installOrgHeaderInterceptor = () => {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
          ? input.toString()
          : input.url;

      if (adminSelectedOrgId && supabaseUrl && url.startsWith(supabaseUrl)) {
        const headers = new Headers(
          init?.headers || (input instanceof Request ? input.headers : undefined),
        );

        // Prefer signed token when we have a fresh one for the selected org.
        const now = Math.floor(Date.now() / 1000);
        if (
          cachedToken &&
          cachedTokenOrg === adminSelectedOrgId &&
          cachedTokenExp - now > 30
        ) {
          headers.set("x-org-impersonation-token", cachedToken);
        } else {
          // LEGACY fallback: raw header. Removed in Turn 2 once verified.
          headers.set("x-org-id", adminSelectedOrgId);
        }

        return originalFetch(input, { ...(init || {}), headers });
      }
    } catch {
      // fall through to original fetch
    }
    return originalFetch(input, init);
  };
};
