"use client";

// Alert tones generated with Web Audio — no audio files to download on slow data.
// Browsers only allow sound after a user gesture, so call unlockAudio() from a tap
// (e.g. the Clock in button).

type Tone = "order" | "ready" | "request" | "alert" | "info";

let ctx: AudioContext | null = null;

function context() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

export function unlockAudio() {
  const c = context();
  if (c && c.state === "suspended") void c.resume();
}

export function audioUnlocked() {
  return ctx?.state === "running";
}

function beep(c: AudioContext, freq: number, start: number, duration: number, volume = 0.25, type: OscillatorType = "sine") {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, c.currentTime + start);
  gain.gain.linearRampToValueAtTime(volume, c.currentTime + start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + start + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(c.currentTime + start);
  osc.stop(c.currentTime + start + duration + 0.05);
}

const patterns: Record<Tone, [number, number, number][]> = {
  order: [
    [880, 0, 0.18],
    [1175, 0.2, 0.3],
  ],
  ready: [
    [1047, 0, 0.12],
    [1047, 0.16, 0.12],
    [1319, 0.32, 0.3],
  ],
  request: [
    [740, 0, 0.2],
    [988, 0.22, 0.25],
  ],
  alert: [
    [660, 0, 0.18],
    [440, 0.2, 0.18],
    [660, 0.4, 0.18],
    [440, 0.6, 0.25],
  ],
  info: [[880, 0, 0.2]],
};

const vibrations: Record<Tone, number[]> = {
  order: [200, 100, 200],
  ready: [150, 80, 150, 80, 300],
  request: [250, 100, 250],
  alert: [400, 150, 400, 150, 400],
  info: [120],
};

export function playTone(tone: Tone) {
  const c = context();
  if (c && c.state === "running") {
    for (const [f, s, d] of patterns[tone]) beep(c, f, s, d, tone === "alert" ? 0.35 : 0.25, tone === "alert" ? "square" : "sine");
  }
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(vibrations[tone]);
}
