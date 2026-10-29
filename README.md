# Overload

Overload is a progressive web app for hypertrophy training. It runs from the iPhone home screen and works offline in the gym. It plans the weight and reps of every set, logs the workout, and shows progress per exercise and weekly sets per muscle.

Overload plans each exercise with double progression, in which the reps go up first and then the weight. An exercise has a rep range and a target range of reps in reserve (RIR), such as 6–10 reps at RIR 1–2. Every set not marked as a warm-up is a working set, and a session's top weight is the heaviest weight among its working sets. Once every working set at the top weight reaches the top of the range with at least the lower end of the target RIR left (RIR 1 for a target of 1–2), the next session adds one load increment. A set logged without RIR meets this condition by its reps alone.

The program consists of training days, which the app takes in a fixed rotation. Each training day is made of slots, such as "Incline press" or "Row". A slot fixes the movement pattern and the number of sets, and offers a few exercises of that pattern. The slot keeps the exercise chosen last time. Choosing another one on the day is a swap.

The code and the data live in separate repositories. This repository holds the app, the exercise library, and an import script that reads past sessions from the Strong workout app and body and sleep data from Fitbit. The script also builds the program, a rotation of two full-body days, A and B (see Importing Strong and Fitbit data). Its output goes to a private GitHub repository, the data repository. The app keeps its own copy of the data on the phone and loads the files of the data repository through Import files in Settings.

## Using the app

The app is plain HTML, CSS and JavaScript modules without a build step, so any static file host, such as GitHub Pages, can serve it. Opening its address in Safari on the iPhone and choosing Share, then Add to Home Screen, installs it. The app has five tabs.

- Today suggests the next training day in the rotation and lists each slot's exercise with its planned weight and reps. Any other training day can be chosen instead before starting.
- History lists past sessions by month, each with its sets.
- Library lists all exercises. An exercise's page shows its estimated one-rep max over time (see How sets are planned) and its recent sessions. The page also edits the exercise's rep range, target RIR, load increment and rest time. These are stored in the program and take precedence over the `increment` of the exercise library and the default rest times of Settings.
- Muscles shows, for each muscle, the time since it was last trained and its working sets over the last 7 days. The sets are shown against a guide of 10 per week, since growth rises with weekly sets per muscle and 10 or more sets outperform fewer (Schoenfeld, Ogborn & Krieger 2017, J. Sports Sci. 35:1073).
- Settings imports and exports data and sets the default rest times and the theme.

Starting a training day opens the workout, in which each exercise is a card with its warm-up and working sets, its previous session and the reason for today's plan. Tapping an exercise's name offers the other exercises of its slot, and of its movement pattern, as a swap. The next set opens with steppers for weight and reps, prefilled with the plan, and a row of RIR buttons. Finishing the workout saves it as a session, which appears in History.

Logging a set starts the rest timer, which sounds when the rest is over while the app is open. The default rest is 1:30 after isolation sets, because rests beyond about 90 s showed no detectable extra hypertrophy (Singer et al. 2024, Front. Sports Act. Living 6:1429789). Compound sets get 2:00, a margin chosen for heavier multi-joint sets. Whether an exercise is compound or isolation follows from the `kind` of its pattern in `data/patterns.csv`.

A superset changes the rest. The link button between two cards pairs them as a superset, and their sets then alternate in rounds of one set from each exercise. The rest is 45 s between the two sets of a round and the longer of the two exercises' rests after the round.

The copy of the data on the phone lives in the browser's storage, so a workout needs no connection. Import files reads `program.json`, `body.json` and the month files in `sessions/` of the data repository. The iOS Files picker reaches these files when the clone of the data repository on a computer sits in a OneDrive or iCloud Drive folder, which syncs it to the phone. An imported program and imported body data replace those on the phone, including program changes made in the app. Imported sessions replace sessions with the same id, and all other sessions on the phone are kept. Sessions logged in the app, and program changes made in the app, stay on the phone. Export backup writes all app data to one file, which Import files also reads.

## How sets are planned

The plan for an exercise comes from its most recent session. The double progression rule decides when the weight goes up, and a session that falls below the rep range brings it down. An estimate of the one-rep max sets the weight and reps where these rules alone do not.

The estimate is the Epley formula (Epley 1985, Boyd Epley Workout, Body Enterprises) with the reps left in reserve added to the reps done. A set with load `w` kg for `r` reps at RIR `q` gives an estimated one-rep max of `w (1 + (r + q) / 30)`. For bodyweight exercises the load includes bodyweight, as the `load` column of the exercise library sets out. Conversely, an estimate `E` allows `r` reps at RIR `q` with load `w` when `w (1 + (r + q) / 30)` is at most `E`. A session's estimate is the highest over its working sets. For this estimate, sets without RIR, such as those imported from Strong, count as ending at RIR 1.

The first of the following cases that applies sets the plan. All weights are a whole number of increments away from the last top weight.

- Without a logged session of the exercise, the plan gives the middle of the rep range, rounded down, and leaves the weight to the user.
- After more than 21 days away from the exercise, counted even when another exercise trained the same muscle, the last session's estimate is reduced by 1.25% per week beyond those 21 days, up to 15%. The plan uses the heaviest weight, at or below the last top weight, at which the reduced estimate allows the middle of the rep range at the upper end of the target RIR. Maximal strength declines little during the first weeks without training and more after that (Bosquet et al. 2013, Scand. J. Med. Sci. Sports 23:e140). The study supports this shape, while the 21 days, the rate and the cap are set by hand.
- When every working set at the last top weight reached the top of the rep range with at least the lower end of the target RIR left, the weight goes up one increment. The planned reps are those the estimate allows at the new weight with the lower end of the target RIR left, rounded down and kept within the rep range.
- When even the set with the most reps at the last top weight fell below the rep range, the weight goes down one increment and the plan gives the bottom of the range.
- Otherwise the weight stays, and each working set aims for one more rep than last time, up to the top of the range. A set that ended below the lower end of the target RIR keeps its reps instead.

Two kinds of exercise adapt these cases. For an assisted exercise (`load` is `subtract`), the top weight is the working set with the least assistance, and one increment up means one increment less assistance. An exercise with an increment of 0 keeps its weight and adds reps beyond the top of the range.

The plan starts each exercise with warm-up sets that ramp up to the first working weight. Compound exercises get 10 reps at 50%, 6 at 70% and 3 at 85% of it, and isolation exercises get 8 reps at 60%. Each warm-up weight is rounded down to a multiple of the increment. A barbell warm-up never goes below the empty 20 kg bar. Exercises whose `load` is `add` or `subtract`, and exercises with an increment of 0, get no warm-ups.

During the workout, each logged working set updates the plan for the remaining sets. A set logged with its RIR gives a new estimate from that set alone. The next set's target weight is the heaviest weight at which this estimate allows the planned reps with the middle of the target RIR left, rounded to the nearest increment. When the target is at least one increment away from the planned weight, the remaining sets move one increment toward it. For an exercise without history they take the target weight directly. Adjusted weights stay a whole number of increments away from the weight of the logged set.

## Exercise library

`data/exercises.csv` is the exercise library, with one row per exercise and these columns:

- `id` identifies the exercise, and sessions refer to it by this id. `name` is the display name.
- `muscle` is the muscle the exercise trains most. The app counts weekly working sets per muscle.
- `pattern` is the movement pattern, which decides the slot an exercise can fill and the exercises a swap offers.
- `equipment` is one of `barbell`, `dumbbell`, `cable`, `machine`, `plate` (plate-loaded machine), `band` and `bodyweight`.
- `increment` is the load increment in kg. An increment of 0 means the exercise progresses by reps only.
- `load` says how bodyweight enters the load, which the app uses for estimated one-rep maxes. With `none` the logged weight is the load. With `add` the load is bodyweight plus the logged weight (weighted pull-ups, dips), and with `subtract` it is bodyweight minus the logged assistance (assisted pull-ups). Bodyweight is the most recent `weightKg` in `body.json` on or before the session date.
- `aliases` lists other names for the same exercise, separated by `|`. The import matches each exercise name in a Strong export against `name` and `aliases`, so an exercise logged in Strong under different names gets a single `id`.

The logged weight of a `dumbbell` exercise is the total of the dumbbells used. For an exercise with a dumbbell in each hand, an increment of 4 kg is therefore one 2 kg step per hand. Fields contain no commas, so the app splits each line on commas.

`data/patterns.csv` lists the movement patterns, with these columns:

- `pattern` identifies the pattern, and the `pattern` column of `exercises.csv` refers to it.
- `label` is the name of the pattern's slots.
- `kind` is `compound` or `isolation`, which sets the default rest and the warm-ups.
- `reps_low` and `reps_high` give the pattern's default rep range, which an exercise gets when the import script cannot infer its own (see What the script infers).
- `full_body` assigns each compound pattern to day `A` or `B` of the full-body rotation and is empty for isolation patterns.

## Data repository

The data repository holds three kinds of files.

- `program.json` holds the training days with their slots, the order of the rotation, and per exercise its rep range (`reps`) and target RIR (`rir`), plus a load increment (`increment`) and rest time in seconds (`restSec`) for exercises where these were set in the app.
- `body.json` is an array with one element per `date`, holding any of `weightKg`, `sleepMin`, `sleepScore` (Fitbit's 0–100 score), `deepMin` (minutes of deep sleep), `hrv` (RMSSD in ms) and `rhr` (resting heart rate in bpm).
- `sessions/YYYY-MM.json` holds the sessions of one month as a JSON array with one session per line, which keeps git diffs readable. A session has an `id`, a `start` time, the training day's display `name` and its id in `program.json` (`template`), a `durationMin`, a `source`, and its exercises in order. The source is `strong` for imported sessions and `app` for sessions logged in the app. Each exercise refers to the library through `ex` and lists its sets. Exercises logged in the app also record their `slot` and an optional `note`. A set records the logged weight `kg` and the `reps`, and optionally `rir`, `warmup`, `sec` (duration in seconds) and `dist` (distance, in the unit of the Strong export).

A line of a sessions file looks like this, shortened to one exercise with one warm-up set and one working set. The working set of 60 kg is two 30 kg dumbbells.

```json
{"id":"app-mh8k2x1c","start":"2026-01-12T18:05:00","name":"Full Body A","template":"full-body-a","durationMin":58,"source":"app","exercises":[{"ex":"incline-bench-press-dumbbell","slot":"full-body-a-incline-press","sets":[{"kg":28,"reps":10,"warmup":true},{"kg":60,"reps":9,"rir":2}]}]}
```

## Importing Strong and Fitbit data

`tools/import_data.py` fills the data repository from two exports. A CSV export of Strong fills `sessions/` and `program.json`, and the `Fitbit` folder of a Google Takeout export fills `body.json`. Either input can be left out, and the files it would fill then stay as they are. Without a Strong export there is no program, and Today then points to Settings. The script needs Python with pandas and runs from the root of this repository. The paths below assume that the exports and a local clone of the data repository sit next to this repository.

```
python tools/import_data.py --strong ../strong_workouts.csv --fitbit ../Fitbit --out ../overload-data
```

The script writes the files but does not commit them. The app reads the result through Import files.

If the Strong export contains an exercise name that matches no `name` or alias in the library, the script stops before writing anything and lists the unmatched names. Add each of them to `data/exercises.csv`, as a new row or as an alias of an existing exercise, and run the script again.

The script can be run again after a new export. It replaces all sessions with source `strong`, leaves all other sessions in `sessions/` in place, and, when given a Fitbit export, rewrites `body.json`. It writes `program.json` only when the file does not exist, so edits made to that file are kept. The `--rebuild-program` option derives `program.json` again from the Strong export.

### What the script infers

The Strong export lacks two things the app needs, so the script infers them. The first is the warm-up flag. For each exercise with `load` set to `none`, the sets before the first set at 90% or more of the session's heaviest weight for that exercise are marked as warm-ups. Exercises with `add` or `subtract` get no warm-ups, because their logged weight is only part of the load and a lower assistance makes a set harder.

The second is the program. Each Strong workout name with at least eight sessions in the 26 weeks before the last logged session becomes a training day. Within the same 26 weeks, every movement pattern that appears in at least a quarter of a day's sessions becomes a slot. The slot offers the exercises used for that pattern on that day, most frequent first. Its set count is the median number of working sets per session, clamped to 2–5.

The rotation consists of two full-body days, A and B, built from the slots of these training days. Full-body days suit a schedule of one to three sessions a week. On such a schedule each training day of a split comes around less than once a week, so the muscles it trains get fewer weekly sets. With the slot assignment below, a muscle that has both a compound and an isolation slot is trained on both full-body days. At equal weekly sets, training frequency has no meaningful effect on hypertrophy (Schoenfeld, Grgic & Krieger 2019, J. Sports Sci. 37:1286), so spreading the sets over more sessions costs no growth. The training days from Strong stay in `program.json` next to the rotation, and Today can start any of them.

The slots go to the two days as follows. Slots of the same pattern from different training days merge into one slot that offers all their exercises. The muscle of a slot is the `muscle` of its first exercise. Each compound slot goes to the day that `patterns.csv` assigns to its pattern. That file puts horizontal pushing and pulling and knee-dominant leg work on A, and vertical pushing and pulling and hip-dominant leg work on B. An isolation slot goes to the day without a compound slot for its muscle, if exactly one day lacks one, and otherwise to the day with fewer sets. A full-body slot has 3 sets for a compound pattern and 2 for an isolation pattern, whatever the set counts of the slots it merges.

Each exercise in a slot starts with a target of RIR 1–2. Its rep range comes from the median reps of its working sets over its eight most recent sessions. The candidates are 5–8, 6–10, 8–12, 10–15, 12–20 and 15–25. The script takes the first candidate whose bottom is at most the median and whose top is at least one rep above it, so a median of 10 gives 8–12. An exercise with fewer than three sessions, or with a median outside all candidates, gets its pattern's default range.

## Development

To run the app locally, clone this repository as `overload` and the data repository as `overload-data` into one folder, the layout that the import command above and the test pages below assume. From that folder, run `python -m http.server 8765 --bind 127.0.0.1` and open `http://127.0.0.1:8765/overload/`. A service worker caches the app's files for offline use and refreshes them in the background, so a changed file takes effect on the launch after the one that downloaded it.

Two pages under `tests/`, opened through the same server, help with development. `tests/progression.html` runs the tests of the rules in How sets are planned and shows the result on the page. `tests/dev-load.html` replaces the app data in the browser's storage with the local data repository and opens the app. Its query parameters are `data` (the data folder, default `../../overload-data/`), `start` (the id of a training day to start) and `log` (the number of sets to log with their planned values, warm-ups included). For example, `tests/dev-load.html?start=full-body-a&log=3` starts Full Body A and logs its first three sets.
