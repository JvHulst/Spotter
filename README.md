# Overload

Overload is a progressive web app for hypertrophy training. It runs from the iPhone home screen and works offline in the gym. It plans the weight and reps of every set, logs the workout, and shows progress per exercise and weekly sets per muscle.

Overload plans each exercise with double progression, in which the reps go up first and then the weight. An exercise has a rep range and a target range of reps in reserve (RIR), such as 6–10 reps at RIR 1–2. Every set not marked as a warm-up is a working set, and a session's top weight is the heaviest weight among its working sets. Once every working set at the top weight reaches the top of the range with at least the lower end of the target RIR left (RIR 1 for a target of 1–2), the next session adds one load increment. A set logged without RIR meets this condition by its reps alone.

Which exercises a session holds is set by the program, the training plan that the app stores. The program holds several splits, and one of them is active. A split is a short list of training days that the app takes in a fixed rotation. Each training day is made of slots, such as "Incline press" or "Row". A slot fixes the number of sets and names either one exercise or a movement pattern, a group of exercises that train the same movement. A pattern slot offers a few exercises of its pattern. Each slot starts with the exercise last logged in it, or with the first exercise it offers when nothing has been logged in it yet. Choosing another exercise of the same pattern during the workout is a swap, and the slot keeps the swapped exercise for the next session of that day.

The program, the sessions and the body data are the app's data. They live in a private GitHub repository, the data repository, separate from this repository, whose code can be served publicly. This repository holds the app, the exercise library, the split definitions and an import script. The script reads past sessions from an export of the Strong workout app, and body and sleep data from a Fitbit export. From the split definitions and the Strong sessions it also builds the program, and it writes all of this to a local clone of the data repository. The app does not read the data repository directly. It keeps its own copy of the data on the phone, which the Import files button in Settings fills (see Data on the phone).

## Using the app

The app is plain HTML, CSS and JavaScript modules without a build step, so any static file host, such as GitHub Pages, can serve it. Opening its address in Safari on the iPhone and choosing Share, then Add to Home Screen, installs it. The app has five tabs.

- Today shows the active split and suggests the next training day in its rotation, which is the day after the one of the split trained most recently, or the first day when none has been trained. For each slot it lists the exercise with its planned weight and reps. Another day of the split can be chosen before starting. The Change button lists all splits, and tapping one makes it active. When the phone has no program, Today points to Settings to import one.
- History lists past sessions by month, each with its sets.
- Library lists all exercises. An exercise's page shows its estimated one-rep max over time (see How sets are planned) and its recent sessions. The page also edits the exercise's rep range, target RIR, load increment and rest time. These are stored in the program and take precedence over the `increment` of the exercise library and the default rest times of Settings.
- Muscles shows, for each muscle, the time since it was last trained and its working sets over the last 7 days. The sets are shown against a guide of 10 per week, since growth rises with weekly sets per muscle and 10 or more sets outperform fewer (Schoenfeld, Ogborn & Krieger 2017, J. Sports Sci. 35:1073).
- Settings imports and exports data and sets the default rest times and the theme.

Starting a training day from Today opens the workout, in which each exercise is a card with its warm-up and working sets, its previous session and the reason for today's plan (the case of How sets are planned that set it). The tick at the end of a set logs the shown weight and reps in one tap, with the RIR prefilled from the plan, which is usually the lower end of the target RIR. Tapping the set itself opens steppers for weight and reps and a row of RIR buttons. Tapping an exercise's name offers a swap, listing the other exercises of the slot first and then the remaining exercises of the same movement pattern, with a search over the whole library. Finishing the workout saves it as a session, which appears in History.

Logging a set starts the rest timer, which sounds when the rest is over while the app is open. The default rest is 1:30 after isolation sets, because rests beyond about 90 s showed no detectable extra hypertrophy (Singer et al. 2024, Front. Sports Act. Living 6:1429789). Compound sets get 2:00, a margin chosen for heavier multi-joint sets. Whether an exercise is compound or isolation follows from the `kind` of its pattern in `data/patterns.csv`.

A superset changes the rest. The link button between two cards pairs them as a superset, and their sets then alternate in rounds of one set from each exercise. The rest is 45 s between the two sets of a round and the longer of the two exercises' rests after the round.

### Data on the phone

The app keeps its data in the browser's storage on the phone, so a workout needs no connection. Import files in Settings fills this storage. It reads `program.json`, `body.json` and the month files in `sessions/` of the data repository (see Data repository), or the single file that the import script writes with `--bundle` (see Importing Strong and Fitbit data). The iOS Files picker reaches these files when they sit in a OneDrive or iCloud Drive folder on a computer, which the service syncs to the phone.

The app never writes to the data repository, so sessions logged in the app and program changes made in it, such as the active split and the settings edited in Library, exist only on the phone. An import replaces the program and the body data on the phone, which discards these program changes. Imported sessions replace sessions with the same id, and all other sessions on the phone are kept. To keep the data that exists only on the phone, Export backup in Settings writes all app data to one file, which Import files also reads.

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

During the workout, each working set logged with its RIR updates the plan for the remaining sets of the exercise, and a set logged without RIR leaves the plan as it is. The update starts from a new estimate computed from the logged set alone. With `w` the logged weight, `r` the planned reps of the set, and `a` and `b` the lower and upper ends of the target RIR, the plan expects the new estimate to lie between `w (1 + (r + a) / 30)` and `w (1 + (r + b) / 30)`. Inside that range the remaining sets keep their weights. Outside it, each remaining set's weight is scaled by the ratio of the new estimate to the nearer end of the range, rounded to a whole number of increments, and moved at most one increment from its weight before the update. In both cases the remaining sets keep their planned reps. An exercise without a logged session has no planned weight, so after its first logged set the remaining sets take the weight at which the new estimate leaves the middle of the target RIR at their planned reps, rounded to a whole number of increments from the logged weight and without the one-increment limit.

## Splits

The import script builds the program from the five splits defined in `data/splits.json` (see What the script infers). The splits differ in how they spread a muscle's weekly sets over the week. At equal weekly sets, training frequency has no meaningful effect on hypertrophy (Schoenfeld, Grgic & Krieger 2019, J. Sports Sci. 37:1286), so the split to choose is the one whose training days fit the week. Weekly sets per muscle still grow with the number of sessions, which the Muscles tab tracks. The table lists the days per week each split suits and its training days.

| Split | Days per week | Training days |
| --- | --- | --- |
| Full Body | 1–3 | A, B: every major muscle in every session |
| Push / Pull | 2–4 | Push A and B with quads, Pull A and B with hamstrings |
| Upper / Lower | 4 | Upper A and B, Lower A and B |
| Push / Pull / Legs | 3 or 6 | Push, Pull, Legs |
| Upper / Lower + PPL | 5 | Upper A, Lower A, Push, Pull, Legs |

The program also holds a sixth split, Strong routines, which the script builds from the Strong export.

Two choices shape the slots of every split in the table. First, squat, bench press and deadlift (`squat-barbell`, `bench-press-barbell` and `deadlift-barbell`) have slots that name them, so every split includes them. Their rep range of 4–6 (see What the script infers) trains them for strength alongside hypertrophy. Second, some pattern slots prefer the variant that grew the muscle more. Every triceps extension slot prefers an overhead triceps extension, which grew the triceps more than a pushdown (Maeo et al. 2023, Eur. J. Sport Sci. 23:1240). Every leg curl slot prefers a seated leg curl, which grew the hamstrings more than a lying one (Maeo et al. 2021, Med. Sci. Sports Exerc. 53:825).

In `splits.json`, a split has an `id`, a `name`, the days per week it suits (`perWeek`), a one-line description (`about`) and its `days`. A day has an `id`, a `name` and `slots`, or refers to a day of an earlier split with `ref`. A slot names either an `exercise` or a `pattern`, and gives its number of `sets`. A pattern slot can list exercises to offer first (`prefer`). The id of a slot is the id of its day followed by its exercise or pattern, as in `full-body-a-row`. Sessions logged in the app record this id (see Data repository), and through it a slot finds the exercise last logged in it.

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
- `kind` is `compound` or `isolation`, which sets the default rest, the warm-ups and the target RIR that the import script assigns (see What the script infers).
- `reps_low` and `reps_high` give the pattern's default rep range, which an exercise gets when the import script cannot infer its own.

## Data repository

The data repository holds three kinds of files.

- `program.json` holds the program. Each split in `splits` lists the ids of its training days (`days`) in rotation order, and `split` is the id of the active split. The file calls a training day a template. The templates (`templates`) hold their `slots`, each with an `id`, a `name`, a `pattern`, its exercises (`options`, a single exercise for a slot that names one) and its `sets`. Per exercise (`exercises`), the file holds a rep range (`reps`) and a target RIR (`rir`), and optionally a load increment (`increment`) and a rest time in seconds (`restSec`).
- `body.json` is an array with one element per `date`, holding any of `weightKg`, `sleepMin`, `sleepScore` (Fitbit's 0–100 score), `deepMin` (minutes of deep sleep), `hrv` (RMSSD in ms) and `rhr` (resting heart rate in bpm).
- `sessions/YYYY-MM.json` holds the sessions of one month as a JSON array with one session per line, which keeps git diffs readable. A session has an `id`, a `start` time, the training day's display `name` and its id in `program.json` (`template`), a `durationMin`, a `source`, and its exercises in order. The source is `strong` for imported sessions and `app` for sessions logged in the app, which reach files only through Export backup. Each exercise refers to the library through `ex` and lists its sets. Exercises logged in the app also record their `slot` and an optional `note`. A set records the logged weight `kg` and the `reps`, and optionally `rir`, `warmup`, `sec` (duration in seconds) and `dist` (distance, in the unit of the Strong export).

A line of a sessions file looks like this, shortened to one exercise with one warm-up set and one working set. The working set of 60 kg is two 30 kg dumbbells.

```json
{"id":"app-mh8k2x1c","start":"2026-01-12T18:05:00","name":"Full Body A","template":"full-body-a","durationMin":58,"source":"app","exercises":[{"ex":"incline-bench-press-dumbbell","slot":"full-body-a-incline-press","sets":[{"kg":28,"reps":10,"warmup":true},{"kg":60,"reps":9,"rir":2}]}]}
```

## Importing Strong and Fitbit data

`tools/import_data.py` fills the data repository from two exports. A CSV export of Strong fills `sessions/` and, together with the split definitions, `program.json`, because its sessions supply the exercises of the pattern slots. The `Fitbit` folder of a Google Takeout export fills `body.json`. Either input can be left out, and the files it would fill then stay as they are. With `--bundle` and a file name, the script also writes the whole data repository as one file for Import files. It needs Python with pandas and runs from the root of this repository. The paths below assume that the exports and a local clone of the data repository sit next to this repository.

```
python tools/import_data.py --strong ../strong_workouts.csv --fitbit ../Fitbit --out ../overload-data --bundle ../overload-import.json
```

The script writes the files but does not commit them. The app reads the result through Import files.

If the Strong export contains an exercise name that matches no `name` or alias in the library, the script stops before writing anything and lists the unmatched names. Add each of them to `data/exercises.csv`, as a new row or as an alias of an existing exercise, and run the script again.

The script can be run again after a new export. It replaces all sessions with source `strong`, leaves all other sessions in `sessions/` in place, and, when given a Fitbit export, rewrites `body.json`. It writes `program.json` only when the file does not exist, so edits made to that file are kept. The `--rebuild-program` option derives `program.json` again from the Strong export and the split definitions.

### What the script infers

The Strong export lacks two things the app needs, so the script infers them. The first is the warm-up flag. For each exercise with `load` set to `none`, the sets before the first set at 90% or more of the session's heaviest weight for that exercise are marked as warm-ups. Exercises with `add` or `subtract` get no warm-ups, because their logged weight is only part of the load and a lower assistance makes a set harder.

The second is the program. Each split of `splits.json` becomes a split of the program, and the first one, Full Body, is active. Each pattern slot offers its preferred exercises first. The logged exercises of its pattern follow, ordered by the number of sessions they appear in during the 26 weeks before the last logged session, with ties broken by their count in the whole Strong export. A pattern slot leaves out exercises that another slot of the same split names, so a named lift appears only in its own slot. A slot whose pattern was never logged offers all library exercises of that pattern.

Strong names each logged session after its routine, and the script turns these routines into one more split, named Strong routines, so the program can also continue the routines trained in Strong. Each routine with at least eight sessions in the same 26 weeks becomes a training day. Every movement pattern that appears in at least a quarter of a day's sessions becomes a slot. A pattern gets as many slots as the median number of its exercises in the sessions that hold it, so a day that usually has pull-ups followed by pulldowns gets two slots of their pattern. The first of these slots offers the exercises logged first among that pattern's exercises in a session, the second those logged second, each most frequent first. A slot's id is the routine's id followed by the pattern, with `-1`, `-2` and so on when the pattern has several slots. Its set count is the median number of working sets per session, clamped to 2–5, and the slots of a day are ordered by their median position in a session.

The program also holds a rep range and a target RIR per exercise. Squat, bench press and deadlift get a rep range of 4–6, because heavy loads build more one-rep-max strength than light ones, while muscle growth is similar across loads when sets end near failure (Schoenfeld et al. 2017, J. Strength Cond. Res. 31:3508). Every other exercise gets a range from the median reps of its working sets over its eight most recent sessions. The candidates are 5–8, 6–10, 8–12, 10–15, 12–20 and 15–25. The script takes the first candidate whose bottom is at most the median and whose top is at least one rep above it, so a median of 10 gives 8–12. An exercise with fewer than three sessions in the Strong export, or with a median that fits no candidate, gets its pattern's default range.

The target RIR follows the `kind` of the exercise's pattern: 1–2 for compound and 0–1 for isolation exercises. Both targets keep sets near failure, because sets closer to failure add growth, although not strength (Robinson et al. 2024, Sports Med. 54:2209). Isolation sets go one rep closer on the assumption that they cost less recovery, a choice set by hand.

## Development

To run the app locally, clone this repository as `overload` and the data repository as `overload-data` into one folder, the layout that the import command above and the test pages below assume. From that folder, run `python -m http.server 8765 --bind 127.0.0.1` and open `http://127.0.0.1:8765/overload/`. A service worker caches the app's files for offline use and refreshes them in the background, so a changed file takes effect on the launch after the one that downloaded it.

Two pages under `tests/`, opened through the same server, help with development. `tests/progression.html` runs the tests of the rules in How sets are planned and shows the result on the page. `tests/dev-load.html` replaces the app data in the browser's storage with the local data repository and opens the app. Its query parameters are `data` (the data folder, default `../../overload-data/`), `start` (the id of a training day to start) and `log` (the number of sets to log with their planned values, warm-ups included). For example, `tests/dev-load.html?start=full-body-a&log=3` starts Full Body A and logs its first three sets.
