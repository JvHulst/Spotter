// Sounds for the end of the rest timer. Most are synthesized with Web Audio, as a `play(ctx, t)`
// function of the AudioContext and the start time in seconds. A sound with a `file` (relative to
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

function biquad(ctx, type, frequency, q = 1) {
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  return filter;
}

/** One oscillator voice. `freq` is a number or [start, end] of an exponential sweep, `gain` the
 *  peak level, `attack` and `dur` the rise and the total length in seconds. `through` filters
 *  are [type, frequency, Q] triples applied in order. */
function voice(ctx, at, { type = "sine", freq, gain = 0.3, attack = 0.01, dur, through = [], vibrato = 0 }) {
  const osc = ctx.createOscillator();
  const [f0, f1] = [].concat(freq, freq);
  osc.type = type;
  osc.frequency.setValueAtTime(f0, at);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, at + dur);
  if (vibrato) {
    const lfo = ctx.createOscillator(), depth = ctx.createGain();
    lfo.frequency.value = 6;
    depth.gain.value = vibrato;
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(at);
    lfo.stop(at + dur);
  }
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(gain, at + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  let node = osc;
  for (const [kind, f, q] of through) {
    node = node.connect(biquad(ctx, kind, f, q));
  }
  node.connect(env).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

/** A burst of white noise through one filter. */
function noise(ctx, at, { gain = 0.3, dur, filter: [kind, f, q] = ["lowpass", 4000, 1] }) {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  buffer.getChannelData(0).forEach((_, i, data) => { data[i] = Math.random() * 2 - 1; });
  const src = ctx.createBufferSource(), filt = biquad(ctx, kind, f, q), env = ctx.createGain();
  src.buffer = buffer;
  env.gain.setValueAtTime(gain, at);
  env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(filt).connect(env).connect(ctx.destination);
  src.start(at);
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
  boom: {
    label: "Vine boom",
    play(ctx, t) {
      voice(ctx, t, { freq: [150, 38], gain: 0.9, attack: 0.005, dur: 1.4 });
      noise(ctx, t, { gain: 0.5, dur: 0.35, filter: ["lowpass", 900, 1] });
    },
  },
  horn: {
    label: "Air horn",
    // A major chord in three blasts, the third one long.
    play(ctx, t) {
      [[0, 0.18], [0.24, 0.18], [0.48, 0.8]].forEach(([at, dur]) =>
        [440, 554, 659].forEach((freq) => voice(ctx, t + at, { type: "sawtooth", freq, gain: 0.16, attack: 0.01, dur, through: [["lowpass", 3000]] })));
    },
  },
  trombone: {
    label: "Sad trombone",
    play(ctx, t) {
      [[0, 233, 0.45], [0.5, 220, 0.45], [1, 208, 0.45], [1.5, 196, 1.1]].forEach(([at, freq, dur], i, all) =>
        voice(ctx, t + at, { type: "sawtooth", freq: i === all.length - 1 ? [freq, freq * 0.93] : freq, gain: 0.35, attack: 0.05, dur,
          through: [["lowpass", 1200]], vibrato: i === all.length - 1 ? 5 : 0 }));
    },
  },
  bruh: {
    label: "Bruh",
    // A low "uh" that drops in pitch.
    play(ctx, t) {
      voice(ctx, t, { type: "sawtooth", freq: [170, 95], gain: 0.6, attack: 0.03, dur: 0.55, through: [["bandpass", 500, 3]] });
    },
  },
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
  const sound = SOUNDS[id];
  if (!audio || !sound) return;
  if (audio.state !== "running") audio.resume();
  if (!sound.file) return sound.play(audio, audio.currentTime + 0.02);
  const buffer = buffers.get(id);
  if (!buffer) return;
  const src = Object.assign(audio.createBufferSource(), { buffer });
  src.connect(audio.destination);
  src.start();
}
