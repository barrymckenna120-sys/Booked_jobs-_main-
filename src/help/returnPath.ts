/** Remembers where the user opened Help from, so "Back to BookedJobs" can exit correctly. */
const KEY = "help_return_path";

export function rememberHelpReturn(path: string) {
  try {
    if (!path.startsWith("/help")) sessionStorage.setItem(KEY, path);
  } catch (_e) { /* storage unavailable */ }
}

/** Stored origin, or "/" (role-aware root redirect) for direct deep links. */
export function getHelpReturn(): string {
  try {
    const p = sessionStorage.getItem(KEY);
    if (p && p.startsWith("/") && !p.startsWith("/help")) return p;
  } catch (_e) { /* storage unavailable */ }
  return "/";
}
