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

export function unlockAudio() {
  if (unlockHandlerAttached) return;
  unlockHandlerAttached = true;

  // Persistent handler — re-runs on EVERY user gesture so iOS can re-unlock
  // after the AudioContext re-suspends (backgrounding, phone calls, PWA throttling).
  const handler = () => {
    const c = getCtx();
    if (!c) return;
    const state = c.state as string;
    if (state === "suspended" || state === "interrupted") {
      c.resume().catch(() => {});
    }
    // Silent buffer to fully unlock audio on iOS Safari & Chrome
    try {
      const buf = c.createBuffer(1, 1, 22050);
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(c.destination);
      src.start(0);
    } catch {
      // ignore
    }
    // Prime HTMLAudio fallback elements so .play() works later without gesture
    const html = getHtmlAudio();
    if (html) {
      [html.beep, html.chime, html.message].forEach((el) => {
        try {
          el.muted = true;
          const p = el.play();
          if (p && typeof p.then === "function") {
            p.then(() => {
              el.pause();
              el.currentTime = 0;
              el.muted = false;
            }).catch(() => { el.muted = false; });
          } else {
            el.pause();
            el.currentTime = 0;
            el.muted = false;
          }
        } catch {
          el.muted = false;
        }
      });
    }

  };

  document.addEventListener("pointerdown", handler, { capture: true, passive: true });
  document.addEventListener("touchstart", handler, { capture: true, passive: true });
  document.addEventListener("click", handler, { capture: true });
}

/** 880Hz square double-beep for high-priority notifications */
export async function playDoubleBeep() {
  // Synchronous HTMLAudio fallback first — guaranteed to fire if primed.
  playHtml(getHtmlAudio()?.beep);
  try {
    const c = getCtx();
    if (!c) return;
    await ensureRunning(c);
    if (c.state !== "running") return;
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
  } catch (err) {
    console.warn("Audio play failed:", err);
  }
}

/** 440Hz sine soft chime for completed notifications */
export async function playSoftChime() {
  playHtml(getHtmlAudio()?.chime);
  try {
    const c = getCtx();
    if (!c) return;
    await ensureRunning(c);
    if (c.state !== "running") return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = 440;
    gain.gain.value = 0.12;
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.5);
    osc.connect(gain).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.5);
  } catch (err) {
    console.warn("Audio play failed:", err);
  }
}

/** 880Hz sine double-beep for message alerts */
export async function playMessageBeep() {
  playHtml(getHtmlAudio()?.message);
  try {
    const c = getCtx();
    if (!c) return;
    await ensureRunning(c);
    if (c.state !== "running") return;
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
  } catch (err) {
    console.warn("Audio play failed:", err);
  }
}

/** 1200Hz triangle triple-chirp for engineer message alerts — distinct from job notifications */
export async function playEngineerMessageAlert() {
  playHtml(getHtmlAudio()?.message);
  try {
    const c = getCtx();
    debugLog("Audio state at play:", c?.state ?? "no-ctx");
    if (!c) return;
    await ensureRunning(c);
    if (c.state !== "running") return;
    [0, 0.12, 0.24].forEach((delay, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "triangle";
      osc.frequency.value = 1200 + i * 100; // ascending: 1200, 1300, 1400
      gain.gain.value = 0.2;
      osc.connect(gain).connect(c.destination);
      osc.start(c.currentTime + delay);
      osc.stop(c.currentTime + delay + 0.08);
    });
  } catch (err) {
    console.warn("Audio play failed:", err);
  }
}

