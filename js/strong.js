// Import of a workout export from the Strong app (Settings > Export Strong Data > CSV). Each row
// is one set; rows with the same date and time form one session.

/** Weight unit conversion for exports in pounds. */
const LBS_TO_KG = 0.45359237;
/** Sets before the first set within this fraction of an exercise's heaviest weight in the
 *  session count as warm-ups, for exercises in which Strong marked none. */
const WARMUP_FRACTION = 0.9;
/** Longer durations come from workouts left running in Strong and are dropped. */
const MAX_DURATION_MIN = 240;

/** Rows of a CSV text as objects keyed by the header. Fields may be quoted; the delimiter is
 *  a comma or, in some locales, a semicolon. */
export function parseCsv(text) {
  text = text.replace(/^﻿/, "");
  const head = text.slice(0, text.search(/\r?\n/));
  const delim = head.split(";").length > head.split(",").length ? ";" : ",";
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') field += text[++i];
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.some(Boolean));
  return body.map((r) => Object.fromEntries(header.map((k, i) => [k.trim(), (r[i] ?? "").trim()])));
}

/** What a CSV holds: "strong" for a Strong export (recognized by its set columns), "weights" for
 *  weigh-ins (a date column and a kg or weight column), and null otherwise. */
export function csvKind(rows) {
  const keys = Object.keys(rows[0] ?? {});
  if (keys.includes("Set Order") && keys.includes("Exercise Name")) return "strong";
  return keys.some((k) => /^date$/i.test(k)) && keys.some((k) => WEIGHT_COLUMN.test(k)) ? "weights" : null;
}

const WEIGHT_COLUMN = /^(kg|weight|weight ?\(?kg\)?)$/i;

/** Weigh-ins from the rows of a weigh-in CSV, as a map from date (YYYY-MM-DD, optionally followed
 *  by a time) to {kg, at}. Rows without a valid date or positive weight are skipped. */
export function weighIns(rows) {
  const keys = Object.keys(rows[0] ?? {});
  const date = keys.find((k) => /^date$/i.test(k)), kg = keys.find((k) => WEIGHT_COLUMN.test(k));
  const out = {};
  for (const r of rows) {
    const value = parseFloat(String(r[kg]).replace(",", "."));
    const day = /^\d{4}-\d\d-\d\d(?!\d)/.exec(r[date])?.[0];
    if (day && value > 0) out[day] = { kg: Math.round(value * 10) / 10, at: 0 };
  }
  return out;
}

/** Bodyweight exercises and their weighted variants. The plain exercise progresses by reps and
 *  the weighted one by load, so a logged exercise with added weight is the weighted variant. */
export const WEIGHTED = { "pull-up": "weighted-pull-up", "wide-pull-up": "weighted-pull-up", "chin-up": "weighted-chin-up",
  "dip": "weighted-dip", "chest-dip": "weighted-dip" };

/** Move exercises logged with added weight to their weighted variant. Returns the changed sessions. */
export function splitWeighted(sessions) {
  return sessions.filter((s) => s.exercises.reduce((moved, e) => {
    if (!WEIGHTED[e.ex] || !e.sets.some((x) => !x.warmup && x.kg > 0)) return moved;
    e.ex = WEIGHTED[e.ex];
    return true;
  }, false));
}

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function minutes(text = "") {
  const h = /(\d+)h/.exec(text), m = /(\d+)m/.exec(text);
  const total = (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0);
  return total > 0 && total <= MAX_DURATION_MIN ? total : null;
}

/**
 * Sessions from the rows of a Strong export, as {sessions, extra}. Exercise names are matched
 * to the library by name or alias, ignoring case; other names become new exercises in `extra`.
 * A set that Strong marks as a warm-up ("W") stays one, and an exercise without marked warm-ups
 * gets them by the WARMUP_FRACTION rule when its logged weight is its whole load. A drop set
 * ("D") stays one, a set marked as a failure set ("F") gets RIR 0, and a logged RPE gives RIR
 * 10 − RPE.
 */
export function strongSessions(rows, library) {
  const lookup = new Map();
  for (const e of library.exercises.values()) {
    for (const name of [e.name, ...(e.aliases ? e.aliases.split("|") : [])]) lookup.set(name.toLowerCase(), e.id);
  }
  const extra = new Map();
  const idFor = (name) => {
    const key = name.toLowerCase();
    if (!lookup.has(key)) {
      const id = `custom-${slug(name)}`;
      extra.set(id, { id, name, muscle: "other", pattern: "other", equipment: "other", load: "none", increment: 2.5, aliases: "" });
      lookup.set(key, id);
    }
    return lookup.get(key);
  };
  const weightKey = Object.keys(rows[0] ?? {}).find((k) => k.startsWith("Weight")) ?? "Weight";
  const toKg = /lb/i.test(weightKey) ? LBS_TO_KG : 1;

  const sessions = new Map();
  for (const r of rows) {
    const order = r["Set Order"];
    if (!r.Date || !r["Exercise Name"] || !/^(\d+|[WDF])$/.test(order)) continue;
    let s = sessions.get(r.Date);
    if (!s) {
      s = { id: `strong-${r.Date.replace(/\D/g, "").replace(/^(\d{8})/, "$1T")}`, start: r.Date.replace(" ", "T"),
        name: r["Workout Name"], template: slug(r["Workout Name"]), durationMin: minutes(r.Duration), source: "strong", exercises: [] };
      sessions.set(r.Date, s);
    }
    const ex = idFor(r["Exercise Name"]);
    let e = s.exercises.find((x) => x.ex === ex);
    if (!e) s.exercises.push(e = { ex, sets: [] });
    const set = { kg: Math.round(Number(r[weightKey] || 0) * toKg * 100) / 100, reps: Math.round(Number(r.Reps || 0)) };
    if (order === "W") set.warmup = true;
    if (order === "D") set.type = "drop";
    if (order === "F") set.rir = 0;
    else if (Number(r.RPE) > 0) set.rir = Math.max(0, Math.min(5, Math.round(10 - Number(r.RPE))));
    if (Number(r.Seconds) > 0) set.sec = Number(r.Seconds);
    if (Number(r.Distance) > 0) set.dist = Number(r.Distance);
    e.sets.push(set);
  }

  for (const s of sessions.values()) {
    for (const e of s.exercises) {
      const load = library.exercises.get(e.ex)?.load ?? "none";
      const max = Math.max(...e.sets.map((x) => x.kg));
      if (load !== "none" || max <= 0 || e.sets.some((x) => x.warmup)) continue;
      const first = e.sets.findIndex((x) => x.kg >= WARMUP_FRACTION * max);
      e.sets.slice(0, first).forEach((x) => { x.warmup = true; });
    }
  }
  splitWeighted([...sessions.values()]);
  return { sessions: [...sessions.values()].sort((a, b) => a.start.localeCompare(b.start)), extra: [...extra.values()] };
}
