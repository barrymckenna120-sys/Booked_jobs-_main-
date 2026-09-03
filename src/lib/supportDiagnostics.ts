/**
 * Support-report diagnostics.
 *
 * Pure helpers (parsing / labelling) live here so they can be unit tested, plus
 * one thin browser collector. Only information the browser already exposes to
 * every page is read — no fingerprinting, no extra probing.
 */

export type SupportApp = "office" | "engineer";

export type SupportDiagnostics = {
  browser: string | null;
  browser_version: string | null;
  os: string | null;
  device_type: string | null;
  viewport: string | null;
  app_version: string | null;
  is_online: boolean | null;
  user_agent: string | null;
};

/** Browser name + major version from a user-agent string. Best effort. */
export function parseBrowser(ua: string): { name: string | null; version: string | null } {
  if (!ua) return { name: null, version: null };
  const tests: Array<[string, RegExp]> = [
    ["Edge", /Edg(?:e|A|iOS)?\/(\d+)/],
    ["Opera", /OPR\/(\d+)/],
    ["Samsung Internet", /SamsungBrowser\/(\d+)/],
    ["Firefox", /(?:Firefox|FxiOS)\/(\d+)/],
    ["Chrome", /(?:Chrome|CriOS)\/(\d+)/],
    ["Safari", /Version\/(\d+).*Safari/],
  ];
  for (const [name, re] of tests) {
    const m = ua.match(re);
    if (m) return { name, version: m[1] };
  }
  return { name: null, version: null };
}

/** Operating system from a user-agent string. Best effort. */
export function parseOs(ua: string): string | null {
  if (!ua) return null;
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Android/.test(ua)) return "Android";
  if (/Windows NT/.test(ua)) return "Windows";
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return null;
}

/** Coarse device class from a user-agent string. */
export function parseDeviceType(ua: string): string | null {
  if (!ua) return null;
  if (/iPad|Tablet/.test(ua)) return "Tablet";
  if (/Mobi|iPhone|Android/.test(ua)) return "Mobile";
  return "Desktop";
}

/**
 * Human label for where the report came from. Never renders a dangling
 * separator when the screen is missing.
 */
export function formatAppScreen(app: string | null, screen: string | null): string {
  const appLabel = app === "engineer" ? "Engineer" : app === "office" ? "Office" : "Unknown";
  const s = (screen ?? "").trim();
  return s ? `${appLabel} — ${s}` : appLabel;
}

/** Friendly screen name derived from a route path. */
export function screenFromRoute(route: string): string | null {
  const path = (route || "").split("?")[0].replace(/\/+$/, "");
  if (!path || path === "/") return "Home";
  const seg = path.split("/").filter(Boolean);
  const map: Record<string, string> = {
    dashboard: "Dashboard",
    jobs: "Jobs",
    schedule: "Schedule",
    customers: "Customers",
    quotes: "Quotes",
    finance: "Finance",
    parts: "Parts",
    settings: "Settings",
    reports: "Reports",
    messages: "Messages",
    inbox: "Inbox",
    today: "Today",
    upcoming: "Upcoming",
    completed: "Completed",
  };
  if (seg[0] === "engineer") {
    if (seg[1] === "job") return "Job Screen";
    return map[seg[1] ?? ""] ?? "Engineer";
  }
  if (seg[0] === "jobs" && seg[1]) return "Job Screen";
  return map[seg[0]] ?? seg[0].charAt(0).toUpperCase() + seg[0].slice(1);
}

/** Collect the diagnostics available in the current browser session. */
export function collectDiagnostics(): SupportDiagnostics {
  if (typeof window === "undefined") {
    return {
      browser: null, browser_version: null, os: null, device_type: null,
      viewport: null, app_version: null, is_online: null, user_agent: null,
    };
  }
  const ua = navigator.userAgent || "";
  const { name, version } = parseBrowser(ua);
  const buildVersion =
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_APP_VERSION ?? null;
  return {
    browser: name,
    browser_version: version,
    os: parseOs(ua),
    device_type: parseDeviceType(ua),
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    app_version: buildVersion,
    is_online: typeof navigator.onLine === "boolean" ? navigator.onLine : null,
    user_agent: ua,
  };
}
