// Sounds for the end of the rest timer. A synthesized sound is a `play(ctx, t)` function of the
// AudioContext and the start time in seconds. A sound with a `file` (relative to
// the app, listed in the service worker's SHELL) is decoded once and played from its buffer.
//
// iOS only lets an AudioContext start sound after a user gesture, so unlockAudio() runs on every
// tap and playSound() does nothing before the first one.

let audio = null;
const buffers = new Map();
const loading = new Set();

export function unlockAudio() {
  try {
    if (!audio) {
      if (navigator.audioSession) navigator.audioSession.type = "transient";
      audio = new AudioContext();
    }
    // iOS leaves the context "interrupted" after the app was in the background.
    if (audio.state !== "running") audio.resume();
    loadFiles();
  } catch { audio = null; }
}

/** Decode the sound files, so that they play without delay when the rest ends. A file that
 *  failed to load is tried again on the next tap. */
function loadFiles() {
  for (const [id, { file }] of Object.entries(SOUNDS)) {
    if (!file || buffers.has(id) || loading.has(id)) continue;
    loading.add(id);
    fetch(file).then((res) => res.arrayBuffer()).then((data) => audio.decodeAudioData(data))
      .then((buffer) => buffers.set(id, buffer)).catch(() => {}).finally(() => loading.delete(id));
  }
}

/** One sine voice at `freq` Hz with peak level `gain`, rising for `attack` and lasting `dur` seconds. */
function voice(ctx, at, { freq, gain = 0.3, attack = 0.01, dur }) {
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(freq, at);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(gain, at + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(env).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

export const SOUNDS = {
  bell: {
    label: "Boxing bell",
    // A struck bell rings at inharmonic partials, and a round bell is three quick strikes.
    play(ctx, t) {
      for (const strike of [0, 0.3, 0.6]) {
        [[1, 0.35], [2.01, 0.2], [2.76, 0.25], [4.07, 0.12], [5.4, 0.08]].forEach(([ratio, gain]) =>
          voice(ctx, t + strike, { freq: 780 * ratio, gain, attack: 0.003, dur: 1.1 }));
      }
    },
  },
  fahh: { label: "FAHHH", file: "sounds/fahhh.mp3" },
  beep: {
    label: "Two beeps",
    play(ctx, t) {
      [[0, 880], [0.22, 1175]].forEach(([at, freq]) => voice(ctx, t + at, { freq, gain: 0.4, attack: 0.02, dur: 0.18 }));
    },
  },
};

export const DEFAULT_SOUND = "bell";

/** Play a sound by id (a key of SOUNDS); unknown ids and "off" are silent. */
export function playSound(id) {
  const sound = Object.hasOwn(SOUNDS, id) ? SOUNDS[id] : null;
  if (!audio || !sound) return;
  if (audio.state !== "running") audio.resume();
  if (!sound.file) return sound.play(audio, audio.currentTime + 0.02);
  const buffer = buffers.get(id);
  if (!buffer) return;
  const src = Object.assign(audio.createBufferSource(), { buffer });
  src.connect(audio.destination);
  src.start();
}
