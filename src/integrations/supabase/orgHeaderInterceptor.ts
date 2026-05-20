// Patches global fetch to inject an `x-org-id` header on Supabase requests
// whenever an admin has selected a tenant org to view.
//
// The selected org id is stored at module scope (and mirrored in localStorage
// via useAdminViewAs) so it can be read synchronously from a fetch wrapper.

const STORAGE_KEY = "adminViewingOrgId";

let adminSelectedOrgId: string | null =
  typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;

export const setAdminSelectedOrgId = (orgId: string | null) => {
  adminSelectedOrgId = orgId;
};

export const getAdminSelectedOrgId = (): string | null => adminSelectedOrgId;

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
        const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
        headers.set("x-org-id", adminSelectedOrgId);
        return originalFetch(input, { ...(init || {}), headers });
      }
    } catch {
      // fall through to original fetch
    }
    return originalFetch(input, init);
  };
};
