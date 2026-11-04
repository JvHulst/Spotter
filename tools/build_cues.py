"""Builds data/cues.json: execution steps and image paths for every exercise in data/exercises.csv.

Source: free-exercise-db (https://github.com/yuhonas/free-exercise-db, public domain). Each library
exercise id maps to the closest entry of that database by name in MATCH; exercises without an
exact counterpart use the nearest movement. Run from the repo root:

    python tools/build_cues.py            (downloads dist/exercises.json)

Output: data/cues.json, {id: {"steps": [...], "images": ["<folder>/0.jpg", "<folder>/1.jpg"]}}, and
the images downscaled to 400 px under img/ex/<folder>/ (needs Pillow). Existing images are kept.
"""
import csv
import io
import json
import os
import urllib.parse
import urllib.request

from PIL import Image  # pip install pillow

SOURCE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json"
IMAGE_BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/"

MATCH = {
    "bench-press-barbell": "Barbell Bench Press - Medium Grip",
    "bench-press-wide-grip-barbell": "Wide-Grip Barbell Bench Press",
    "bench-press-dumbbell": "Dumbbell Bench Press",
    "bench-press-smith-machine": "Smith Machine Bench Press",
    "decline-bench-press-barbell": "Decline Barbell Bench Press",
    "chest-press-machine": "Machine Bench Press",
    "push-up": "Pushups",
    "decline-deficit-push-ups": "Decline Push-Up",
    "incline-bench-press-barbell": "Barbell Incline Bench Press - Medium Grip",
    "incline-bench-press-dumbbell": "Incline Dumbbell Press",
    "incline-bench-press-smith-machine": "Smith Machine Incline Bench Press",
    "incline-bench-press-cable": "Incline Cable Chest Press",
    "incline-chest-press-machine": "Leverage Incline Chest Press",
    "chest-fly-dumbbell": "Dumbbell Flyes",
    "incline-chest-fly-dumbbell": "Incline Dumbbell Flyes",
    "chest-fly": "Butterfly",
    "chest-fly-band": "Cable Crossover",
    "cable-fly": "Cable Crossover",
    "pec-deck-machine": "Butterfly",
    "decline-chest-fly-cable": "Cable Crossover",
    "chest-dip": "Dips - Chest Version",
    "overhead-press-barbell": "Standing Military Press",
    "overhead-press-dumbbell": "Dumbbell Shoulder Press",
    "seated-overhead-press-dumbbell": "Dumbbell Shoulder Press",
    "arnold-press-dumbbell": "Arnold Dumbbell Press",
    "shoulder-press-machine": "Machine Shoulder (Military) Press",
    "shoulder-press-plate-loaded": "Leverage Shoulder Press",
    "pike-push-up": "Handstand Push-Ups",
    "lateral-raise-dumbbell": "Side Lateral Raise",
    "lateral-raise-cable": "Cable Seated Lateral Raise",
    "front-raise-dumbbell": "Front Dumbbell Raise",
    "front-raise-plate": "Front Plate Raise",
    "front-raise-cable": "Front Cable Raise",
    "face-pull-cable": "Face Pull",
    "reverse-fly-cable": "Cable Rear Delt Fly",
    "reverse-fly-machine": "Reverse Machine Flyes",
    "reverse-fly-dumbbell": "Bent Over Dumbbell Rear Delt Raise With Head On Bench",
    "shrug-dumbbell": "Dumbbell Shrug",
    "lat-pulldown-cable": "Wide-Grip Lat Pulldown",
    "lat-pulldown-close-grip-cable": "Close-Grip Front Lat Pulldown",
    "lat-pulldown-wide-grip-cable": "Wide-Grip Lat Pulldown",
    "lat-pulldown-underhand-cable": "Underhand Cable Pulldowns",
    "lat-pulldown-machine": "Wide-Grip Lat Pulldown",
    "pull-up": "Pullups",
    "wide-pull-up": "Wide-Grip Rear Pull-Up",
    "pull-up-assisted": "Band Assisted Pull-Up",
    "chin-up": "Chin-Up",
    "weighted-pull-up": "Weighted Pull Ups",
    "weighted-chin-up": "Weighted Pull Ups",
    "chin-up-assisted": "Band Assisted Pull-Up",
    "bent-over-row-barbell": "Bent Over Barbell Row",
    "bent-over-row-dumbbell": "Bent Over Two-Dumbbell Row",
    "one-arm-row-dumbbell": "One-Arm Dumbbell Row",
    "seated-row-cable": "Seated Cable Rows",
    "seated-row-wide-grip-cable": "Seated Cable Rows",
    "seated-row-machine": "Leverage Iso Row",
    "t-bar-row": "T-Bar Row with Handle",
    "bent-over-row-smith-machine": "Smith Machine Bent Over Row",
    "chest-supported-row-dumbbell": "Dumbbell Incline Row",
    "inverted-row-bodyweight": "Inverted Row",
    "straight-arm-pulldown": "Straight-Arm Pulldown",
    "pullover-dumbbell": "Bent-Arm Dumbbell Pullover",
    "squat-barbell": "Barbell Squat",
    "front-squat-barbell": "Front Barbell Squat",
    "hack-squat": "Hack Squat",
    "squat-machine": "Lying Machine Squat",
    "squat-smith-machine": "Smith Machine Squat",
    "goblet-squat-dumbbell": "Goblet Squat",
    "pistol-squat": "Kettlebell Pistol Squat",
    "leg-press": "Leg Press",
    "seated-leg-press-machine": "Leg Press",
    "bulgarian-split-squat": "Split Squat with Dumbbells",
    "bulgarian-split-squat-bodyweight": "Split Squats",
    "lunge-dumbbell": "Dumbbell Lunges",
    "lunge-barbell": "Barbell Lunge",
    "leg-extension-machine": "Leg Extensions",
    "romanian-deadlift-barbell": "Romanian Deadlift",
    "romanian-deadlift-dumbbell": "Romanian Deadlift",
    "romanian-deadlift-smith-machine": "Smith Machine Stiff-Legged Deadlift",
    "single-leg-romanian-deadlift-barbell": "Romanian Deadlift",
    "stiff-leg-deadlift-barbell": "Stiff-Legged Barbell Deadlift",
    "deadlift-barbell": "Barbell Deadlift",
    "good-morning-barbell": "Good Morning",
    "back-extension": "Hyperextensions (Back Extensions)",
    "leg-curl-machine": "Seated Leg Curl",
    "seated-leg-curl-machine": "Seated Leg Curl",
    "lying-leg-curl-machine": "Lying Leg Curls",
    "nordic-hamstring-curl": "Natural Glute Ham Raise",
    "hip-thrust-barbell": "Barbell Hip Thrust",
    "lateral-band-walk": "Monster Walk",
    "standing-calf-raise-bodyweight": "Standing Calf Raises",
    "standing-calf-raise-dumbbell": "Standing Dumbbell Calf Raise",
    "seated-calf-raise-plate-loaded": "Seated Calf Raise",
    "calf-press-on-seated-leg-press": "Calf Press On The Leg Press Machine",
    "bicep-curl-barbell": "Barbell Curl",
    "bicep-curl-dumbbell": "Dumbbell Bicep Curl",
    "bicep-curl-cable": "Standing Biceps Cable Curl",
    "bicep-curl-machine": "Machine Bicep Curl",
    "bicep-curl-incline": "Incline Dumbbell Curl",
    "bicep-curl-flat-bench": "Dumbbell Bicep Curl",
    "hammer-curl-dumbbell": "Hammer Curls",
    "preacher-curl-barbell": "Preacher Curl",
    "preacher-curl-dumbbell": "One Arm Dumbbell Preacher Curl",
    "concentration-curl-dumbbell": "Concentration Curls",
    "triceps-pushdown-cable": "Triceps Pushdown",
    "triceps-pushdown-cable-straight-bar": "Triceps Pushdown",
    "triceps-pushdown-cable-rope": "Triceps Pushdown - Rope Attachment",
    "triceps-extension-cable": "Low Cable Triceps Extension",
    "triceps-extension": "Machine Triceps Extension",
    "skullcrusher-barbell": "EZ-Bar Skullcrusher",
    "skullcrusher-dumbbell": "EZ-Bar Skullcrusher",
    "overhead-tricep-extension-dumbbell": "Standing Dumbbell Triceps Extension",
    "close-grip-bench-press-barbell": "Close-Grip Barbell Bench Press",
    "dip": "Dips - Triceps Version",
    "weighted-dip": "Dips - Triceps Version",
    "bench-dip": "Bench Dips",
    "crunch": "Crunches",
    "decline-crunch": "Decline Crunch",
    "ab-wheel": "Ab Roller",
    "flat-leg-raise": "Flat Bench Lying Leg Raise",
    "hanging-leg-raise": "Hanging Leg Raise",
    "plank": "Plank",
    "side-plank": "Side Bridge",
    "dead-hang": "One Handed Hang",
    "running": "Running, Treadmill",
}

# Entries of the database without steps get written ones.
STEPS = {
    "side-plank": [
        "Lie on your side with your legs straight and your forearm on the floor under your shoulder.",
        "Lift your hips until your body forms a straight line from your head to your feet.",
        "Hold the position without letting your hips sag, then repeat on the other side.",
    ],
}


def main():
    with urllib.request.urlopen(SOURCE) as response:
        source = {e["name"]: e for e in json.load(response)}
    with open("data/exercises.csv", encoding="utf-8") as f:
        ids = [row["id"] for row in csv.DictReader(f)]

    problems = [f"{i}: unmapped" for i in ids if i not in MATCH]
    problems += [f"{i}: '{MATCH[i]}' not in source" for i in ids if i in MATCH and MATCH[i] not in source]
    problems += [f"{i}: not in library" for i in MATCH if i not in ids]
    if problems:
        raise SystemExit("\n".join(problems))

    cues = {i: {"steps": STEPS.get(i) or source[MATCH[i]]["instructions"], "images": source[MATCH[i]]["images"][:2]} for i in ids}
    with open("data/cues.json", "w", encoding="utf-8") as f:
        json.dump(cues, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(cues)} exercises")

    for path in sorted({p for c in cues.values() for p in c["images"]}):
        target = os.path.join("img", "ex", path)
        if os.path.exists(target):
            continue
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with urllib.request.urlopen(IMAGE_BASE + urllib.parse.quote(path)) as response:
            image = Image.open(io.BytesIO(response.read())).convert("RGB")
        image.thumbnail((400, 400))
        image.save(target, "JPEG", quality=68, optimize=True, progressive=True)


main()
