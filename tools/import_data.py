"""Build an Overload data repository from a Strong export and a Fitbit export.

The data repository is the private store that the app syncs with:

    program.json           training days (templates), their rotation, per-exercise targets
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
DEFAULT_RIR = [1, 2]
# Sets per slot on the full-body days, by pattern kind.
FULL_BODY_SETS = {"compound": 3, "isolation": 2}
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
    """Derive the program: slot templates from recent Strong routines, two full-body days built
    from those slots (the rotation), and rep and RIR targets per exercise.

    Each frequent movement pattern in a routine becomes a slot. Its options are the exercises
    used for that pattern in the routine (most frequent first), its set count is the median
    number of working sets, and slots are ordered by where the pattern usually falls in a session.
    """
    recent = df[df["start"] > df["start"].max() - pd.Timedelta(weeks=TEMPLATE_WINDOW_WEEKS)]
    working = recent[~recent["warmup"]]
    templates = []
    for name, routine in recent.groupby("workout"):
        n_sessions = routine["start"].nunique()
        if n_sessions < TEMPLATE_MIN_SESSIONS:
            continue
        order = routine.drop_duplicates(["start", "ex"]).copy()
        order["position"] = order.groupby("start").cumcount()
        order["pattern"] = order["ex"].map(exercises["pattern"])
        slots = []
        for pattern, p in order.groupby("pattern"):
            if p["start"].nunique() < SLOT_MIN_SHARE * n_sessions:
                continue
            sets = working[working["start"].isin(p["start"]) & working["ex"].isin(p["ex"])]
            n_sets = sets.groupby(["start", "ex"]).size().median()
            slots.append((p["position"].median(), {
                "id": f"{slug(name)}-{pattern}",
                "name": patterns.loc[pattern, "label"],
                "pattern": pattern,
                "options": p["ex"].value_counts().index.tolist(),
                "sets": int(np.clip(round(n_sets), 2, 5)),
            }))
        slots = [slot for _, slot in sorted(slots, key=lambda s: s[0])]
        templates.append((n_sessions, {"id": slug(name), "name": name, "slots": slots}))

    templates = [t for _, t in sorted(templates, key=lambda t: -t[0])]
    full_body = full_body_days(templates, exercises, patterns)
    used = sorted({ex for t in templates for s in t["slots"] for ex in s["options"]})
    targets = {ex: {"reps": seed_rep_range(df, ex, exercises, patterns), "rir": DEFAULT_RIR} for ex in used}
    return {"rotation": [t["id"] for t in full_body], "templates": full_body + templates, "exercises": targets}


def full_body_days(templates, exercises, patterns):
    """Redistribute the slots of the routine templates over two full-body days, A and B.

    Every session then trains every major muscle, which keeps weekly sets per muscle even
    when only one or two sessions fit in a week. A compound slot goes to the day that
    patterns.csv assigns to its pattern. An isolation slot goes to the day without a compound
    slot for the same muscle, or else to the day with fewer sets. Within a day, compound slots
    come first, in the order of patterns.csv.
    """
    merged = {}
    for t in templates:
        for slot in t["slots"]:
            options = merged.setdefault(slot["pattern"], [])
            options += [ex for ex in slot["options"] if ex not in options]

    order = {p: i for i, p in enumerate(patterns.index)}
    days = {"A": [], "B": []}
    compound_days = {}
    for pattern in sorted(merged, key=lambda p: (patterns.loc[p, "kind"] != "compound", order[p])):
        muscle = exercises.loc[merged[pattern][0], "muscle"]
        if patterns.loc[pattern, "kind"] == "compound":
            day = patterns.loc[pattern, "full_body"]
            compound_days.setdefault(muscle, set()).add(day)
        else:
            free = {"A", "B"} - compound_days.get(muscle, set())
            sets = {d: sum(s["sets"] for s in days[d]) for d in sorted(free or days)}
            day = min(sets, key=sets.get)
        days[day].append({
            "id": f"full-body-{day.lower()}-{pattern}",
            "name": patterns.loc[pattern, "label"],
            "pattern": pattern,
            "options": merged[pattern],
            "sets": FULL_BODY_SETS[patterns.loc[pattern, "kind"]],
        })
    return [{"id": f"full-body-{d.lower()}", "name": f"Full Body {d}", "slots": days[d]} for d in "AB"]


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


if __name__ == "__main__":
    main()
