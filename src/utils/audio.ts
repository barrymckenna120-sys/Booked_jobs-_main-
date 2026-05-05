// ─── Shared iOS-safe Web Audio utility ───
// Single AudioContext instance, unlocked on first user gesture.

let ctx: AudioContext | null = null;
let unlocked = false;

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
    await c.resume().catch(() => {});
  }
}

/** Call once — attaches a one-time touchstart/click listener that
 *  resumes the AudioContext + plays a silent buffer (required on iOS). */
export function unlockAudio() {
  if (unlocked) return;

  const handler = () => {
    if (unlocked) return;
    unlocked = true;
    const c = getCtx();
    if (c) {
      if (c.state === "suspended") c.resume().catch(() => {});
      // Silent buffer to fully unlock audio on iOS Safari & Chrome
      const buf = c.createBuffer(1, 1, 22050);
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(c.destination);
      src.start(0);
    }
    document.removeEventListener("pointerdown", handler, true);
    document.removeEventListener("touchstart", handler, true);
    document.removeEventListener("click", handler, true);
  };

  document.addEventListener("pointerdown", handler, { capture: true, passive: true });
  document.addEventListener("touchstart", handler, { capture: true, passive: true });
  document.addEventListener("click", handler, { capture: true });
}

/** 880Hz square double-beep for high-priority notifications */
export async function playDoubleBeep() {
  try {
    const c = getCtx();
    if (!c) return;
    await ensureRunning(c);
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
  try {
    const c = getCtx();
    if (!c) return;
    await ensureRunning(c);
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
  try {
    const c = getCtx();
    if (!c) return;
    await ensureRunning(c);
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
  try {
    const c = getCtx();
    if (!c) return;
    await ensureRunning(c);
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
