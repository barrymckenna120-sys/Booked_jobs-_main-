// ─── Shared iOS-safe Web Audio utility ───
// Single AudioContext instance, unlocked on first user gesture.
// HTMLAudio fallback for when WebAudio context is suspended (background tabs,
// long-idle sessions, browser autoplay throttling).
import { debugLog } from "@/utils/debugLog";

let ctx: AudioContext | null = null;

// ── HTMLAudio fallback: tiny generated WAV beeps, primed on unlock ──
function makeBeepDataUri(freq: number, durationMs: number, volume = 0.4): string {
  const sampleRate = 8000;
  const samples = Math.floor((sampleRate * durationMs) / 1000);
  const bytesPerSample = 2;
  const dataSize = samples * bytesPerSample;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  // Simple envelope to avoid clicks
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const env = Math.min(1, i / 80) * Math.min(1, (samples - i) / 80);
    const v = Math.sin(2 * Math.PI * freq * t) * volume * env;
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 0x7fff, true);
  }
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return "data:audio/wav;base64," + btoa(binary);
}

let htmlBeep: HTMLAudioElement | null = null;
let htmlChime: HTMLAudioElement | null = null;
let htmlMessage: HTMLAudioElement | null = null;

function getHtmlAudio(): { beep: HTMLAudioElement; chime: HTMLAudioElement; message: HTMLAudioElement } | null {
  try {
    if (!htmlBeep) {
      htmlBeep = new Audio(makeBeepDataUri(880, 140, 0.5));
      htmlBeep.preload = "auto";
    }
    if (!htmlChime) {
      htmlChime = new Audio(makeBeepDataUri(440, 380, 0.4));
      htmlChime.preload = "auto";
    }
    if (!htmlMessage) {
      htmlMessage = new Audio(makeBeepDataUri(1200, 240, 0.45));
      htmlMessage.preload = "auto";
    }
    return { beep: htmlBeep, chime: htmlChime, message: htmlMessage };
  } catch {
    return null;
  }
}

function playHtml(el: HTMLAudioElement | undefined) {
  if (!el) return;
  try {
    el.currentTime = 0;
    const p = el.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch {}
}


function getCtx(): AudioContext | null {
  if (ctx && ctx.state !== "closed") return ctx;
  try {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    return ctx;
  } catch {
    return null;
  }
}

async function ensureRunning(c: AudioContext): Promise<void> {
  // iOS Safari can leave the context in "interrupted" after backgrounding /
  // phone calls / PWA throttling — handle both suspended and interrupted.
  const state = c.state as string;
  if (state === "suspended" || state === "interrupted") {
    // Race resume() against a 500ms timeout so a stuck context doesn't
    // block the caller — the HTMLAudio fallback (fired synchronously
    // before ensureRunning) still plays regardless of WebAudio state.
    try {
      await Promise.race([
        c.resume(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("resume-timeout")), 500)),
      ]);
    } catch {
      // Swallow — WebAudio path will be skipped by the caller's state check;
      // HTMLAudio fallback has already been triggered.
    }
  }
}

/** Call once — attaches a one-time touchstart/click listener that
 *  resumes the AudioContext + plays a silent buffer (required on iOS). */
let unlockHandlerAttached = false;

export const AUDIO_UNLOCKED_KEY = "audio_unlocked";

export function isAudioUnlocked(): boolean {
  try {
    return localStorage.getItem(AUDIO_UNLOCKED_KEY) === "true";
  } catch {
    return false;
  }
}

export function getAudioContextState(): string {
  return ctx?.state ?? "no-ctx";
}

function markUnlocked() {
  try { localStorage.setItem(AUDIO_UNLOCKED_KEY, "true"); } catch {}
}

/** Shared core: resume the AudioContext, play a silent unlock buffer and
 *  prime HTMLAudio fallback elements. Safe to call multiple times. */
async function performUnlock(): Promise<{ ok: boolean; reason?: string; state: string }> {
  const c = getCtx();
  if (!c) return { ok: false, reason: "no-audio-context", state: "no-ctx" };
  try {
    if (c.state === "suspended" || (c.state as string) === "interrupted") {
      await c.resume();
    }
  } catch (err) {
    console.warn("[audio] AudioContext.resume() failed:", err);
  }
  try {
    const buf = c.createBuffer(1, 1, 22050);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    src.start(0);
  } catch (err) {
    console.warn("[audio] Silent unlock buffer failed:", err);
  }
  const html = getHtmlAudio();
  if (html) {
    await Promise.all(
      [html.beep, html.chime, html.message].map(async (el) => {
        try {
          el.muted = true;
          const p = el.play();
          if (p && typeof p.then === "function") {
            await p.then(() => {
              el.pause();
              el.currentTime = 0;
              el.muted = false;
            }).catch((err) => {
              el.muted = false;
              console.warn("[audio] HTMLAudio prime failed:", err);
            });
          } else {
            el.pause();
            el.currentTime = 0;
            el.muted = false;
          }
        } catch (err) {
          el.muted = false;
          console.warn("[audio] HTMLAudio prime threw:", err);
        }
      })
    );
  }
  const running = c.state === "running";
  if (running) markUnlocked();
  return {
    ok: running,
    reason: running ? undefined : `audio-context-${c.state}`,
    state: c.state,
  };
}

/** Explicit, button-driven unlock. Runs the unlock immediately inside the
 *  user gesture so we don't have to wait for a follow-up tap. */
export async function unlockAudioNow(): Promise<{ ok: boolean; reason?: string; state: string }> {
  // Make sure the passive gesture-handler is also wired up for future taps.
  unlockAudio();
  const res = await performUnlock();
  console.log("[audio] unlockAudioNow result:", res);
  return res;
}

export function unlockAudio() {
  if (unlockHandlerAttached) return;
  unlockHandlerAttached = true;

  // Persistent handler — re-runs on EVERY user gesture so iOS can re-unlock
  // after the AudioContext re-suspends (backgrounding, phone calls, PWA throttling).
  const handler = () => {
    // Fire-and-forget; performUnlock handles its own errors and logging.
    performUnlock().catch((err) => console.warn("[audio] performUnlock threw:", err));
  };

  document.addEventListener("pointerdown", handler, { capture: true, passive: true });
  document.addEventListener("touchstart", handler, { capture: true, passive: true });
  document.addEventListener("click", handler, { capture: true });
}

export interface PlayResult { played: boolean; reason?: string; state: string; }

async function tryResumeRunning(c: AudioContext): Promise<void> {
  const state = c.state as string;
  if (state === "suspended" || state === "interrupted") {
    try {
      await c.resume();
    } catch (err) {
      console.warn("[audio] resume failed inside play:", err);
    }
  }
}

/** 880Hz square double-beep for high-priority notifications */
export async function playDoubleBeep(): Promise<PlayResult> {
  console.log("[audio] playDoubleBeep() called. ctx state:", ctx?.state ?? "no-ctx");
  playHtml(getHtmlAudio()?.beep);
  try {
    const c = getCtx();
    if (!c) return { played: false, reason: "no-audio-context", state: "no-ctx" };
    await tryResumeRunning(c);
    if (c.state !== "running") {
      console.warn("[audio] playDoubleBeep: context not running:", c.state);
      return { played: false, reason: `audio-context-${c.state}`, state: c.state };
    }
    [0, 0.15].forEach((delay) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "square";
      osc.frequency.value = 880;
      gain.gain.value = 0.15;
      osc.connect(gain).connect(c.destination);
      osc.start(c.currentTime + delay);
      osc.stop(c.currentTime + delay + 0.1);
    });
    return { played: true, state: c.state };
  } catch (err) {
    console.error("[audio] playDoubleBeep failed:", err);
    return { played: false, reason: String((err as any)?.message ?? err), state: ctx?.state ?? "no-ctx" };
  }
}

/** 440Hz sine soft chime for completed notifications */
export async function playSoftChime(): Promise<PlayResult> {
  console.log("[audio] playSoftChime() called. ctx state:", ctx?.state ?? "no-ctx");
  playHtml(getHtmlAudio()?.chime);
  try {
    const c = getCtx();
    if (!c) return { played: false, reason: "no-audio-context", state: "no-ctx" };
    await tryResumeRunning(c);
    if (c.state !== "running") {
      console.warn("[audio] playSoftChime: context not running:", c.state);
      return { played: false, reason: `audio-context-${c.state}`, state: c.state };
    }
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = 440;
    gain.gain.value = 0.12;
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.5);
    osc.connect(gain).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.5);
    return { played: true, state: c.state };
  } catch (err) {
    console.error("[audio] playSoftChime failed:", err);
    return { played: false, reason: String((err as any)?.message ?? err), state: ctx?.state ?? "no-ctx" };
  }
}

/** 880Hz sine double-beep for message alerts */
export async function playMessageBeep(): Promise<PlayResult> {
  playHtml(getHtmlAudio()?.message);
  try {
    const c = getCtx();
    if (!c) return { played: false, reason: "no-audio-context", state: "no-ctx" };
    await tryResumeRunning(c);
    if (c.state !== "running") {
      return { played: false, reason: `audio-context-${c.state}`, state: c.state };
    }
    [0, 0.23].forEach((delay) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.8;
      osc.connect(gain).connect(c.destination);
      osc.start(c.currentTime + delay);
      osc.stop(c.currentTime + delay + 0.15);
    });
    return { played: true, state: c.state };
  } catch (err) {
    console.error("[audio] playMessageBeep failed:", err);
    return { played: false, reason: String((err as any)?.message ?? err), state: ctx?.state ?? "no-ctx" };
  }
}

/** 1200Hz triangle triple-chirp for engineer message alerts — distinct from job notifications */
export async function playEngineerMessageAlert(): Promise<PlayResult> {
  console.log("[audio] playEngineerMessageAlert() called. ctx state:", ctx?.state ?? "no-ctx");
  playHtml(getHtmlAudio()?.message);
  try {
    const c = getCtx();
    debugLog("Audio state at play:", c?.state ?? "no-ctx");
    if (!c) return { played: false, reason: "no-audio-context", state: "no-ctx" };
    await tryResumeRunning(c);
    if (c.state !== "running") {
      console.warn("[audio] playEngineerMessageAlert: context not running:", c.state);
      return { played: false, reason: `audio-context-${c.state}`, state: c.state };
    }
    [0, 0.12, 0.24].forEach((delay, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "triangle";
      osc.frequency.value = 1200 + i * 100;
      gain.gain.value = 0.2;
      osc.connect(gain).connect(c.destination);
      osc.start(c.currentTime + delay);
      osc.stop(c.currentTime + delay + 0.08);
    });
    return { played: true, state: c.state };
  } catch (err) {
    console.error("[audio] playEngineerMessageAlert failed:", err);
    return { played: false, reason: String((err as any)?.message ?? err), state: ctx?.state ?? "no-ctx" };
  }
}


