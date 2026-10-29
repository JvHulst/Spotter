# Spotter

Spotter is a web app for hypertrophy (muscle growth) training. It plans the weight and reps of every set and shows your progress. It runs from the iPhone home screen and works offline in the gym. Try it at https://jvhulst.github.io/Spotter/. The sections below cite the study behind each choice, and numbers without a citation are chosen by hand.

Your data stays on your phone, and neither the hosted app nor its code repository holds any of it. Optionally, Spotter keeps an encrypted copy in a private GitHub repository of your own (see Sync and privacy). A lost phone then loses nothing, and any other device with a browser stays in step with your phone.

## Getting started

Spotter opens on the Today tab, which plans your next workout. The History, Progress, Muscles and Library tabs look back at your training, and the gear icon at the top right opens Settings. Setting up Spotter on your phone takes three steps.

1. Open the app in Safari, tap Share, then Add to Home Screen, and from then on open Spotter from the home screen. The home-screen app keeps its own storage, so workouts logged in a Safari tab do not appear in it.
2. To bring in your history from the Strong app, export it there (Settings, Export Strong Data) and choose Import in Spotter's Settings. Importing a newer export later adds the new workouts and updates the ones already imported, without duplicates. Exercise names that Spotter does not know become new exercises.
3. In Settings, set your bodyweight, which counts toward the load of pull-ups, dips and other bodyweight exercises.

To keep a copy of your data or to use a second device, set up sync on this phone next (see Sync and privacy).

## Training days

A split is a short list of training days that Spotter takes in turn. At equal weekly sets, training a muscle more often does not grow it more (Schoenfeld, Grgic & Krieger 2019, J. Sports Sci. 37:1286), so the right split is the one whose days fit your week. Today suggests the next training day of the active split, Start workout begins it, and the Change button switches to another split.

| Split | Days per week | Training days |
| --- | --- | --- |
| Full Body | 1–3 | A and B, each training every major muscle |
| Push / Pull | 2–4 | Push A and B with quads, Pull A and B with hamstrings |
| Upper / Lower | 4 | Upper A and B, Lower A and B |
| Push / Pull / Legs | 3 or 6 | Push, Pull, Legs |
| Upper / Lower + PPL | 5 | Upper A, Lower A, Push, Pull, Legs |

Growth depends on the weekly number of hard sets per muscle, that is, sets that end close to failure, and 10 or more per week grew muscle more than fewer (Schoenfeld, Ogborn & Krieger 2017, J. Sports Sci. 35:1073). A few exercises with three or four sets each reach that number with less setup and warm-up time than many exercises with one or two sets, so each day has four or five exercises.

Each training day is a list of slots, and each slot has a movement pattern, such as squat or row. Related patterns form a group: the squat pattern, for example, shares a group with the leg press and lunge patterns. The exercises of a slot's group are its alternatives, ranked by how often you logged them. The exercise card in a workout shows the first few alternatives, and one tap swaps to one of them. The slot keeps the new exercise in later workouts until you swap again. Before any swap, a slot starts with its preferred exercise. Squat, bench press and deadlift are preferred in their slots, because strength on these three lifts is a goal of its own (see How sets are planned). Two other slots prefer the exercise that grew the muscle more in a direct comparison: overhead triceps extensions over pushdowns (Maeo et al. 2023, Eur. J. Sport Sci. 23:1240) and seated over lying leg curls (Maeo et al. 2021, Med. Sci. Sports Exerc. 53:825).

A planned change of exercise can help growth, whereas frequent random changes can hurt it (Kassiano et al. 2022, J. Strength Cond. Res., doi:10.1519/JSC.0000000000004258). So Spotter suggests a change only when an exercise stalls, that is, after four workouts with it without a new best estimated one-rep max (see How sets are planned).

Besides the split, Today lists your own templates, which are fixed lists of exercises with their number of sets. The + Template button creates one, and Save as template turns the current workout into one. A Home template with pull-ups, push-ups, dips, inverted rows and split squats is included. To train without a plan, Start an empty workout begins a workout without any exercise.

## During a workout

The check mark at the end of a set's row logs the planned weight and reps in one tap, with the planned RIR (reps in reserve, the reps you could still have done). A second tap undoes it. When a set goes differently from the plan, tap the set itself to open steppers for weight and reps and buttons for the RIR. For dumbbell exercises, log the total weight of both dumbbells.

Logging a set starts the rest timer. Rests beyond 1:30 showed no detectable extra growth (Singer et al. 2024, Front. Sports Act. Living 6:1429789), so isolation sets get 1:30. Compound sets get 2:00, since heavier multi-joint lifts take longer to recover. The link button between two exercises makes a superset. Its sets alternate between the two exercises with 0:45 of rest in between. After each pair, the rest is the longer of the two exercises' normal rests.

## How sets are planned

Spotter uses double progression: the reps go up first, then the weight. Each exercise has a rep range and a target RIR, such as 6–10 reps at RIR 1–2. Sets closer to failure add growth but not strength (Robinson et al. 2024, Sports Med. 54:2209), so isolation sets aim for RIR 0–1. Compound sets aim for RIR 1–2, because failure on a heavy multi-joint lift costs more fatigue and risks a failed rep under the bar.

Squat, bench press and deadlift train at 4–6 reps, so that the app also builds strength on these three lifts. Heavy loads build more maximal strength, while growth is similar across loads when sets end near failure (Schoenfeld, Grgic, Ogborn & Krieger 2017, J. Strength Cond. Res. 31:3508). So the low range adds strength at no cost in growth. Every other exercise takes the higher range of its pattern, such as 6–10 or 10–15, so a leg press in the squat slot keeps the leg-press range. The Library page of an exercise changes its rep range and target RIR.

The stall rule in Training days, the rule for a break below, and the Progress tab use an estimated one-rep max. Spotter computes it with the Epley formula (Epley 1985, Boyd Epley Workout, Body Enterprises), counting the reps in reserve as reps that could have been done. A set of `w` kg for `r` reps at RIR `q` gives `w (1 + (r + q) / 30)`, so 100 kg for 8 reps at RIR 2 gives about 133 kg. Sets without a logged RIR, such as most sets from Strong, count as RIR 1.

Double progression works from the last workout with the exercise, by the first of these rules that applies. A step is the exercise's weight increment, such as 2.5 kg.

- Without any workout with the exercise, the plan gives the middle of the rep range and leaves the weight to you.
- After more than three weeks without the exercise, Spotter first lowers its last estimated one-rep max by 1.25% for each week beyond three, by at most 15%. It then plans the middle of the rep range at the heaviest weight that this estimate allows with the upper end of the target RIR in reserve, and no heavier than last time. Strength declines little in the first weeks without any training and more after that (Bosquet et al. 2013, Scand. J. Med. Sci. Sports 23:e140), and Spotter applies the same pattern to a break from one exercise.
- When every set at the heaviest weight of the last workout reached the top of the rep range with at least the lower end of the target RIR in reserve, the weight goes up one step. The reps are those the estimate allows at the new weight, within the rep range.
- When no set at that weight reached the bottom of the rep range, the weight goes down one step and the reps go to the bottom of the range.
- Otherwise the weight stays and each set aims for one more rep.

Exercises without a weight step, and bodyweight exercises done without added weight, such as push-ups at home, keep their weight and add reps beyond the range.

During the workout, Spotter compares each logged set with its plan. When the reps done plus the RIR logged exceed the planned reps plus the upper end of the target RIR, the remaining sets get heavier. When they fall short of the planned reps plus the lower end, the remaining sets get lighter. Either way the weight moves by at most one step.

Before the working sets, Spotter plans warm-up sets: 10 reps at 50%, 6 at 70% and 3 at 85% of the working weight for compound exercises, and one set of 8 reps at 60% for isolation exercises. Warm-up sets do not count toward weekly sets, records or volume.

## Progress and records

The Progress tab shows workouts per week, the estimated one-rep max over time of squat, bench press, deadlift and your most logged exercises, weekly sets per muscle, weekly volume (weight times reps) and your personal records of the last 30 days. Muscles shows the sets of the last 7 days per muscle against the guide of 10 per week from Training days. In both tabs, a set counts fully for an exercise's main muscle and half for the muscles it trains indirectly, such as the biceps in a row. This way of counting predicted growth best (Pelland et al. 2026, Sports Med. 56:481). Compound lifts train calves, abs and traps only a little, so these fall short of the guide without direct work. Direct work for them is a matter of taste, so Muscles lists them as optional.

In the Library, each exercise shows its records: the best estimated one-rep max, the heaviest weight, the best set and workout by volume, and the heaviest weight for each number of reps next to the weight the current estimate predicts. History lists every workout with its records and the best set of each exercise, and Edit on a workout changes its date, sets and exercises.

## Sync and privacy

Sync keeps a copy of your data in a private GitHub repository of your own, encrypted on the device before upload. The passphrase that the key comes from never leaves the device, so GitHub cannot decrypt the data. For the same reason, Spotter cannot recover a forgotten passphrase, and without it the synced copy cannot be read. Anyone who can see the repository still sees the size of the data and the times of syncs, so keep the repository private. For those who want to check the details, the data is compressed and encrypted with AES-GCM under a 256-bit key derived from the passphrase (PBKDF2 with SHA-256 and 600,000 iterations).

To set up sync, you need a free GitHub account. On GitHub, create a new repository, for example `spotter-data`, and set it to Private. Then, under Settings, Developer settings, Personal access tokens, Fine-grained tokens, create a token with access to only that repository and set its Contents permission to Read and write. In Spotter's Settings, enter the repository as `your-github-name/spotter-data`, the token and a passphrase of your choice. Do this first on the device that holds your workouts. A device that connects later keeps its own workouts, but it takes over the program of the synced data (the active split, your templates and the targets of your exercises) and the settings. Other devices connect with the same repository, token and passphrase. From then on, Spotter syncs at startup, a few seconds after each change, and when it returns to the screen.

Without sync, Export backup in Settings saves all data to one file. The same Import button that reads Strong exports also reads such a backup. It adds the workouts of the backup and, after asking, its program.

## Exercise data

The exercises, movement patterns and splits are defined in data files, so changing them needs no code. `data/exercises.csv` lists the exercises with their main `muscle`, movement `pattern`, `equipment`, `increment` (the weight step in kg that the plan uses), and other names (`aliases`, separated by `|`) for matching Strong exports. Its `load` column says how bodyweight counts: `none` for external weight only, `add` for bodyweight plus the logged weight, and `subtract` for bodyweight minus assistance. `data/patterns.csv` gives each pattern its rep range (`reps_low` and `reps_high`), its `kind` (compound or isolation, which sets the target RIR, the rest and the warm-ups), its alternatives `group` and its `secondary` muscles. `data/splits.json` defines the splits, and `js/program.js` the Home template.

## Development

The app is plain HTML, CSS and JavaScript modules without a build step. To run it locally, run `python -m http.server 8765` in the folder that contains the repository folder and open `http://127.0.0.1:8765/<repository folder>/`. `tests/progression.html` runs the unit tests in the browser. `tests/dev-load.html` fills a local copy of the app with test data and opens it. It reads a Strong export from `strong_workouts.csv` next to the repository folder, which is why the server runs in the parent folder, and the comment at its top lists its options. A service worker caches the app for offline use, so a changed file takes effect on the second launch after it was published.
