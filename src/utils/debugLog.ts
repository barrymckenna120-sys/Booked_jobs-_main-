// Tiny in-memory ring buffer for on-device debug logs.
// Persists to localStorage so it survives reloads.

const KEY = "audio_debug_logs";
const MAX = 200;

export type DebugEntry = { ts: string; msg: string };

function load(): DebugEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(entries: DebugEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX)));
  } catch {}
}

export function debugLog(...args: unknown[]) {
  const msg = args
    .map((a) => {
      if (typeof a === "string") return a;
      try { return JSON.stringify(a); } catch { return String(a); }
    })
    .join(" ");
  const entry: DebugEntry = { ts: new Date().toISOString(), msg };
  const entries = load();
  entries.push(entry);
  save(entries);
  // Also forward to real console
  // eslint-disable-next-line no-console
  console.log(...args);
  // Notify listeners (debug screen)
  try { window.dispatchEvent(new CustomEvent("audio-debug-log", { detail: entry })); } catch {}
}

export function getDebugLogs(): DebugEntry[] {
  return load();
}

export function clearDebugLogs() {
  try { localStorage.removeItem(KEY); } catch {}
  try { window.dispatchEvent(new CustomEvent("audio-debug-cleared")); } catch {}
}
