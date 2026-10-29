"""Build an Overload data repository from a Strong export and a Fitbit export.

The data repository is the private store that the app syncs with:

    program.json           splits, their training days (templates), per-exercise targets
    sessions/YYYY-MM.json  logged workouts, one file per month, one session per line
    body.json              daily bodyweight, sleep, HRV and resting heart rate

Re-running the script replaces the sessions it imported before and keeps sessions logged
in the app. program.json is written only when it is missing, so edits made in the app
survive; pass --rebuild-program to derive it from the Strong log again.

Usage:
    python tools/import_data.py --strong ../strong_workouts.csv --fitbit ../Fitbit --out ../overload-data
"""
import argparse
import json
import re
from pathlib import Path

import numpy as np
import pandas as pd

LIBRARY_DIR = Path(__file__).resolve().parent.parent / "data"

# Strong does not flag warm-ups. A set counts as a warm-up when it comes before the first
# set within this fraction of the session's heaviest load for that exercise.
WARMUP_FRACTION = 0.9
# Longer Strong sessions were left running by accident, so their duration is dropped.
MAX_DURATION_MIN = 240
# Templates are derived from the routines in this many most recent weeks of the log.
TEMPLATE_WINDOW_WEEKS = 26
# A routine becomes a template when it has at least this many sessions in that window.
TEMPLATE_MIN_SESSIONS = 8
# A movement pattern becomes a slot when it occurs in at least this share of a routine's sessions.
SLOT_MIN_SHARE = 0.25
# Rep targets are seeded from an exercise's working sets in its most recent sessions.
REP_SEED_SESSIONS = 8
# Candidate rep ranges for double progression, lowest first.
REP_RANGES = [(5, 8), (6, 10), (8, 12), (10, 15), (12, 20), (15, 25)]
# Squat, bench press and deadlift are trained for strength as well as size. Heavy loads build
# more one-rep-max strength than light ones, while growth is similar across loads when sets
# end near failure (Schoenfeld et al. 2017, J. Strength Cond. Res. 31:3508).
STRENGTH_LIFTS = {"squat-barbell", "bench-press-barbell", "deadlift-barbell"}
STRENGTH_REPS = [4, 6]
# Target RIR by pattern kind. Sets closer to failure add growth but not strength (Robinson et al.
# 2024, Sports Med. 54:2209), and isolation sets can end closer to failure at little cost.
RIR_BY_KIND = {"compound": [1, 2], "isolation": [0, 1]}
# The Fitbit export stores bodyweight in pounds.
LBS_TO_KG = 0.45359237


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def number(x):
    """Return x as an int when it is whole, so JSON stays compact (68 rather than 68.0)."""
    return int(x) if float(x).is_integer() else round(float(x), 2)


def write_rows(path, rows):
    """Write a JSON array with one compact element per line, which keeps git diffs readable."""
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = ",\n".join(json.dumps(r, separators=(",", ":")) for r in rows)
    path.write_text(f"[\n{lines}\n]\n", encoding="utf-8")


def load_library():
    """Return the exercise table, the pattern table, and a map from every Strong name to an exercise id."""
    exercises = pd.read_csv(LIBRARY_DIR / "exercises.csv", keep_default_na=False).set_index("id")
    patterns = pd.read_csv(LIBRARY_DIR / "patterns.csv").set_index("pattern")
    lookup = {}
    for ex_id, row in exercises.iterrows():
        for name in [row["name"], *filter(None, row["aliases"].split("|"))]:
            lookup[name] = ex_id
    return exercises, patterns, lookup


# --- Strong ---------------------------------------------------------------------------

def read_strong(path, exercises, lookup):
    """Read a Strong CSV export into one row per set, with exercise ids and warm-ups marked."""
    df = pd.read_csv(path)
    unknown = sorted(set(df["Exercise Name"]) - set(lookup))
    if unknown:
        raise SystemExit("Add these exercises to data/exercises.csv as a name or alias:\n  " + "\n  ".join(unknown))
    df = df.rename(columns={"Workout Name": "workout", "Weight": "kg", "Reps": "reps",
                            "Seconds": "sec", "Distance": "dist", "Duration": "duration"})
    df["start"] = pd.to_datetime(df["Date"])
    df["ex"] = df["Exercise Name"].map(lookup)
    df["warmup"] = mark_warmups(df, exercises)
    return df


def mark_warmups(df, exercises):
    """Flag the ramp-up sets that precede an exercise's working sets within a session.

    Only externally loaded exercises are checked. On bodyweight exercises the logged weight
    is added or assisting load, so a lighter set is not a warm-up.
    """
    warmup = pd.Series(False, index=df.index)
    external = df["ex"].map(exercises["load"]).eq("none")
    for _, idx in df[external].groupby(["start", "ex"], sort=False).groups.items():
        kg = df.loc[idx, "kg"].to_numpy()
        if kg.max() > 0:
            first_working = np.argmax(kg >= WARMUP_FRACTION * kg.max())
            warmup.loc[idx[:first_working]] = True
    return warmup


def duration_minutes(text):
    """Parse a Strong duration such as '1h 20m' or '45m'; return None for implausible values."""
    hours = re.search(r"(\d+)h", text)
    minutes = re.search(r"(\d+)m", text)
    total = (int(hours.group(1)) * 60 if hours else 0) + (int(minutes.group(1)) if minutes else 0)
    return total if 0 < total <= MAX_DURATION_MIN else None


def strong_sessions(df):
    """Convert set rows into session records, keeping exercise and set order."""
    sessions = []
    for start, s in df.groupby("start"):
        exercises = []
        for ex, e in s.groupby("ex", sort=False):
            sets = []
            for row in e.itertuples():
                st = {"kg": number(row.kg), "reps": int(row.reps)}
                if row.warmup:
                    st["warmup"] = True
                if row.sec > 0:
                    st["sec"] = number(row.sec)
                if row.dist > 0:
                    st["dist"] = number(row.dist)
                sets.append(st)
            exercises.append({"ex": ex, "sets": sets})
        name = s["workout"].iloc[0]
        sessions.append({
            "id": f"strong-{start:%Y%m%dT%H%M%S}",
            "start": start.isoformat(),
            "name": name,
            "template": slug(name),
            "durationMin": duration_minutes(s["duration"].iloc[0]),
            "source": "strong",
            "exercises": exercises,
        })
    return sessions


def write_sessions(sessions, out):
    """Store sessions per month, replacing earlier Strong imports and keeping app-logged sessions."""
    folder = out / "sessions"
    by_month = {}
    for s in sessions:
        by_month.setdefault(s["start"][:7], []).append(s)
    months = set(by_month) | {p.stem for p in folder.glob("*.json")}
    for month in sorted(months):
        path = folder / f"{month}.json"
        existing = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
        kept = [s for s in existing if s.get("source") != "strong"]
        write_rows(path, sorted(kept + by_month.get(month, []), key=lambda s: s["start"]))
    return len(months)


# --- Program --------------------------------------------------------------------------

def build_program(df, exercises, patterns):
    """Build the program: the splits of data/splits.json filled with exercises from the log,
    the recent Strong routines as one more split, and rep and RIR targets per exercise."""
    recent = df[df["start"] > df["start"].max() - pd.Timedelta(weeks=TEMPLATE_WINDOW_WEEKS)]
    splits, templates = blueprint_splits(df, recent, exercises, patterns)
    routines = routine_templates(recent, exercises, patterns)
    if routines:
        splits.append({"id": "strong", "name": "Strong routines", "perWeek": "",
                       "about": "The routines logged most in Strong over the last six months.",
                       "days": [t["id"] for t in routines]})
        templates += routines
    used = sorted({ex for t in templates for s in t["slots"] for ex in s["options"]})
    targets = {ex: target_for(df, ex, exercises, patterns) for ex in used}
    return {"split": splits[0]["id"], "splits": splits, "templates": templates, "exercises": targets}


def blueprint_splits(df, recent, exercises, patterns):
    """Fill the splits of data/splits.json with exercises.

    A slot that names an exercise always uses it. A slot that names a pattern offers its
    preferred exercises first, then the logged exercises of that pattern, ranked by sessions in
    the recent window and then in the whole log. Exercises that the split already uses in its
    named slots are left out. A pattern that was never logged offers all library exercises of
    that pattern.
    """
    recent_count = recent.drop_duplicates(["start", "ex"])["ex"].value_counts()
    total_count = df.drop_duplicates(["start", "ex"])["ex"].value_counts()

    def ranked(pattern, exclude, prefer):
        pool = [e for e in exercises.index[exercises["pattern"] == pattern] if e not in exclude]
        logged = sorted((e for e in pool if e in total_count and e not in prefer),
                        key=lambda e: (-recent_count.get(e, 0), -total_count.get(e, 0)))
        return [e for e in prefer if e in pool] + logged or pool

    splits, templates = [], {}
    for blueprint in json.loads((LIBRARY_DIR / "splits.json").read_text(encoding="utf-8")):
        days = [d for d in blueprint["days"] if "ref" not in d]
        named = {s["exercise"] for d in days for s in d["slots"] if "exercise" in s}
        for day in days:
            slots = []
            for s in day["slots"]:
                if "exercise" in s:
                    ex = s["exercise"]
                    slots.append({"id": f"{day['id']}-{ex}", "name": re.sub(r" \(.*\)$", "", exercises.loc[ex, "name"]),
                                  "pattern": exercises.loc[ex, "pattern"], "options": [ex], "sets": s["sets"]})
                else:
                    slots.append({"id": f"{day['id']}-{s['pattern']}", "name": patterns.loc[s["pattern"], "label"],
                                  "pattern": s["pattern"], "sets": s["sets"],
                                  "options": ranked(s["pattern"], named, s.get("prefer", []))})
            templates[day["id"]] = {"id": day["id"], "name": day["name"], "slots": slots}
        splits.append({**{k: blueprint[k] for k in ("id", "name", "perWeek", "about")},
                       "days": [d.get("ref", d.get("id")) for d in blueprint["days"]]})
    return splits, list(templates.values())


def routine_templates(recent, exercises, patterns):
    """Turn each frequent recent Strong routine into a training day.

    Each frequent movement pattern in a routine becomes a slot, or several slots when sessions
    usually include several exercises of that pattern. A slot offers the exercises logged in its
    position (most frequent first), its set count is the median number of working sets, and the
    slots are ordered by where they usually fall in a session.
    """
    working = recent[~recent["warmup"]]
    templates = []
    for name, routine in recent.groupby("workout"):
        n_sessions = routine["start"].nunique()
        if n_sessions < TEMPLATE_MIN_SESSIONS:
            continue
        order = routine.drop_duplicates(["start", "ex"]).copy()
        order["position"] = order.groupby("start").cumcount()
        order["pattern"] = order["ex"].map(exercises["pattern"])
        order["rank"] = order.groupby(["start", "pattern"]).cumcount()
        slots = []
        for pattern, p in order.groupby("pattern"):
            if p["start"].nunique() < SLOT_MIN_SHARE * n_sessions:
                continue
            n_slots = int(round(p.groupby("start").size().median()))
            for k in range(n_slots):
                q = p[p["rank"] == k]
                n_sets = working.merge(q[["start", "ex"]]).groupby(["start", "ex"]).size().median()
                number = f" {k + 1}" if n_slots > 1 else ""
                slots.append((q["position"].median(), {
                    "id": f"{slug(name)}-{pattern}{number.replace(' ', '-')}",
                    "name": patterns.loc[pattern, "label"] + number,
                    "pattern": pattern,
                    "options": q["ex"].value_counts().index.tolist(),
                    "sets": int(np.clip(round(n_sets), 2, 5)),
                }))
        slots = [slot for _, slot in sorted(slots, key=lambda s: s[0])]
        templates.append((n_sessions, {"id": slug(name), "name": name, "slots": slots}))
    return [t for _, t in sorted(templates, key=lambda t: -t[0])]


def target_for(df, ex, exercises, patterns):
    """Rep range and target RIR of an exercise. The main lifts get the strength range, other
    exercises a range seeded from the log, and the target RIR follows the pattern's kind."""
    kind = patterns.loc[exercises.loc[ex, "pattern"], "kind"]
    reps = STRENGTH_REPS if ex in STRENGTH_LIFTS else seed_rep_range(df, ex, exercises, patterns)
    return {"reps": reps, "rir": RIR_BY_KIND[kind]}


def seed_rep_range(df, ex, exercises, patterns):
    """Pick the lowest candidate range that holds the recent median reps with room for one more rep.

    The pattern's default range is used when the exercise has fewer than three logged sessions.
    """
    sets = df[(df["ex"] == ex) & ~df["warmup"]]
    recent_starts = sets["start"].drop_duplicates().nlargest(REP_SEED_SESSIONS)
    pattern = patterns.loc[exercises.loc[ex, "pattern"]]
    if len(recent_starts) >= 3:
        median_reps = sets[sets["start"].isin(recent_starts)]["reps"].median()
        for low, high in REP_RANGES:
            if low <= median_reps <= high - 1:
                return [low, high]
    return [int(pattern["reps_low"]), int(pattern["reps_high"])]


# --- Fitbit ---------------------------------------------------------------------------

def read_json_files(files):
    return [entry for f in sorted(files) for entry in json.loads(Path(f).read_text(encoding="utf-8"))]


def read_fitbit(folder):
    """Collect daily bodyweight, sleep, HRV and resting heart rate from a Fitbit (Google Takeout) export."""
    export = folder / "Global Export Data"
    columns = {}

    weight = pd.DataFrame(read_json_files(export.glob("weight-*.json")))
    weight["date"] = pd.to_datetime(weight["date"], format="%m/%d/%y")
    columns["weightKg"] = (weight.groupby("date")["weight"].mean() * LBS_TO_KG).round(1)

    sleep = pd.DataFrame(read_json_files(export.glob("sleep-*.json")))
    sleep = sleep[sleep["mainSleep"].astype(bool)].copy()  # naps are excluded
    sleep["date"] = pd.to_datetime(sleep["dateOfSleep"])
    columns["sleepMin"] = sleep.groupby("date")["minutesAsleep"].max()

    score = pd.read_csv(folder / "Sleep Score" / "sleep_score.csv")
    score["date"] = pd.to_datetime(score["timestamp"]).dt.tz_localize(None).dt.normalize()
    score = score.groupby("date")
    columns["sleepScore"] = score["overall_score"].max()
    columns["deepMin"] = score["deep_sleep_in_minutes"].max()

    hrv = pd.concat(pd.read_csv(f) for f in (folder / "Heart Rate Variability").glob("Daily Heart Rate Variability Summary - *.csv"))
    hrv["date"] = pd.to_datetime(hrv["timestamp"]).dt.normalize()
    columns["hrv"] = hrv.groupby("date")["rmssd"].mean().round(1)

    rhr = pd.DataFrame([e["value"] for e in read_json_files(export.glob("resting_heart_rate-*.json"))])
    rhr = rhr[rhr["value"] > 0]
    rhr["date"] = pd.to_datetime(rhr["date"], format="%m/%d/%y")
    columns["rhr"] = rhr.groupby("date")["value"].mean().round(1)

    daily = pd.DataFrame(columns).sort_index()
    return [{"date": f"{date:%Y-%m-%d}", **{k: number(v) for k, v in row.dropna().items()}}
            for date, row in daily.iterrows()]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--strong", type=Path, help="Strong CSV export")
    parser.add_argument("--fitbit", type=Path, help="Fitbit folder from a Google Takeout export")
    parser.add_argument("--out", type=Path, required=True, help="data repository folder")
    parser.add_argument("--rebuild-program", action="store_true", help="overwrite program.json")
    parser.add_argument("--bundle", type=Path, help="also write the data repository as one file for Import files")
    args = parser.parse_args()

    exercises, patterns, lookup = load_library()
    if args.strong:
        df = read_strong(args.strong, exercises, lookup)
        sessions = strong_sessions(df)
        n_months = write_sessions(sessions, args.out)
        print(f"Sessions: {len(sessions)} from Strong, {n_months} month files")
        program_path = args.out / "program.json"
        if args.rebuild_program or not program_path.exists():
            program = build_program(df, exercises, patterns)
            program_path.write_text(json.dumps(program, indent=2) + "\n", encoding="utf-8")
            print(f"Program: {', '.join(t['name'] for t in program['templates'])}")
    if args.fitbit:
        days = read_fitbit(args.fitbit)
        write_rows(args.out / "body.json", days)
        print(f"Body: {len(days)} days, {days[0]['date']} to {days[-1]['date']}")
    if args.bundle:
        write_bundle(args.out, args.bundle)
        print(f"Bundle: {args.bundle}")


def write_bundle(out, path):
    """Write the whole data repository as one file in the app's backup format, so that a
    single file selected in Import files loads the program, body data and all sessions."""
    def read(name):
        return json.loads((out / name).read_text(encoding="utf-8")) if (out / name).exists() else None
    sessions = [s for f in sorted((out / "sessions").glob("*.json")) for s in json.loads(f.read_text(encoding="utf-8"))]
    bundle = {"format": "overload-backup", "version": 1, "program": read("program.json"),
              "body": read("body.json") or [], "sessions": sessions}
    path.write_text(json.dumps(bundle, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main()
