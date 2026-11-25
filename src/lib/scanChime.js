// Short Web Audio feedback tones for the gate scanner. No audio files needed.
let sharedContext = null;

function audioContext() {
  if (typeof window === "undefined") return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedContext) sharedContext = new Ctx();
  if (sharedContext.state === "suspended") sharedContext.resume().catch(() => {});
  return sharedContext;
}

function blip(ctx, frequency, offset, duration, peak, type) {
  const start = ctx.currentTime + offset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** Two rising notes — a pass was accepted. */
export function playSuccessChime() {
  const ctx = audioContext();
  if (!ctx) return;
  blip(ctx, 880, 0, 0.22, 0.22, "sine");
  blip(ctx, 1318.5, 0.12, 0.3, 0.2, "sine");
}

/** One falling buzz — a pass was rejected. */
export function playErrorTone() {
  const ctx = audioContext();
  if (!ctx) return;
  blip(ctx, 240, 0, 0.4, 0.18, "square");
  blip(ctx, 150, 0.14, 0.4, 0.16, "square");
}