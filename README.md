# Spotter

Spotter is a web app for hypertrophy (muscle growth) training. It plans the weight and reps of every set and shows your progress. It runs from the iPhone home screen and works offline in the gym. Try it at https://jvhulst.github.io/Spotter/. The sections below cite the study behind each choice, and numbers without a citation are chosen by hand.

Your data stays on your phone, and neither the hosted app nor its code repository holds any of it. Optionally, Spotter keeps an encrypted copy in a private GitHub repository of your own (see Sync and privacy). A lost phone then loses nothing, and any other device with a browser stays in step with your phone.

## Getting started

Spotter opens on the Today tab, which plans your next workout. The History, Progress, Muscles and Library tabs look back at your training, and the gear icon at the top right opens Settings. Setting up Spotter on your phone takes three steps.

1. Open the app in Safari, tap Share, then Add to Home Screen, and from then on open Spotter from the home screen. The home-screen app keeps its own storage, so workouts logged in a Safari tab do not appear in it.
2. To bring in your history from the Strong app, export it there (Settings, Export Strong Data) and choose Import in Spotter's Settings. Importing a newer export later adds the new workouts and updates the ones already imported, without duplicates. Exercise names that Spotter does not know become new exercises, and drop sets marked in Strong stay drop sets.
3. In Settings, set your bodyweight, which counts toward the load of pull-ups, dips and other bodyweight exercises.

To keep a copy of your data or to use a second device, set up sync on this phone next (see Sync and privacy).

## Training days

A split is a short list of training days that Spotter takes in turn. At equal weekly sets, training a muscle more often does not grow it more (Schoenfeld, Grgic & Krieger 2019, J. Sports Sci. 37:1286), so the right split is the one whose days fit your week. Today suggests the next training day of the active split, Start workout begins it, and the Change button switches to another split. Today also offers your own templates and an empty workout.

| Split | Days per week | Training days |
| --- | --- | --- |
| Full Body | 1–3 | A and B, each training every major muscle |
| Push / Pull | 2–4 | Push A and B with quads, Pull A and B with hamstrings |
| Upper / Lower | 4 | Upper A and B, Lower A and B |
| Push / Pull / Legs | 3 or 6 | Push, Pull, Legs |
| Upper / Lower + PPL | 5 | Upper A, Lower A, Push, Pull, Legs |

What does matter is the weekly number of hard sets per muscle, that is, sets that end close to failure. Ten or more hard sets per week grew muscle more than fewer (Schoenfeld, Ogborn & Krieger 2017, J. Sports Sci. 35:1073), so Spotter's weekly guide is 10 hard sets per muscle. Every working set that Spotter plans ends close to failure (see How sets are planned), so each one counts toward the guide. A few exercises with three or four sets each reach the guide with less setup and warm-up time than many exercises with one or two sets, so each training day has four or five exercises of three or four sets.

Each training day is a list of slots, and each slot has a movement pattern, such as squat or row. Related patterns form a group: the squat pattern, for example, shares a group with the leg press and lunge patterns. The exercises of a slot's group are its alternatives, ranked by how often you logged them. The exercise card in a workout shows the first few alternatives, and one tap swaps to one of them. The slot keeps the new exercise in later workouts until you swap again. Before any swap, a slot starts with its preferred exercise. Squat, bench press and deadlift are preferred in their slots, because strength on these three lifts is a goal of its own (see How sets are planned). Two other slots prefer the exercise that grew the muscle more in a direct comparison: overhead triceps extensions over pushdowns (Maeo et al. 2023, Eur. J. Sport Sci. 23:1240) and seated over lying leg curls (Maeo et al. 2021, Med. Sci. Sports Exerc. 53:825).

Spotter also proposes a swap itself, but at two moments only. A planned change of exercise can help growth, whereas frequent random changes can hurt it (Kassiano et al. 2022, J. Strength Cond. Res., doi:10.1519/JSC.0000000000004258). The first moment is when an exercise stalls, that is, when its last four workouts did not beat the best estimated one-rep max of the four before them (see How sets are planned). The second is after eight weeks on the same exercise. This second moment skips squat, bench press and deadlift, because strength on a lift grows mainly by training that lift. The proposal appears on the exercise card. It is an alternative that you have logged before but not in the last eight weeks, so that Spotter can plan it from your earlier sets, and the one you logged most when several qualify. When none qualifies, it is your most logged alternative. The Switch button takes it, and the Keep button stays with the current exercise and postpones every proposal for it by eight weeks.

Besides the split, Today lists your own templates, which are fixed lists of exercises with their number of sets. The + Template button creates one, and the Save as template button turns the current workout into one. A Home template with pull-ups, push-ups, dips, inverted rows and split squats is included. A workout of only bodyweight exercises without added weight, such as one from the Home template, is a home workout, and every exercise Spotter proposes in a home workout is such a bodyweight exercise. Any other workout is a gym workout. To choose exercises as you go, Start an empty workout begins one with no exercises, and it counts as a gym workout until all its exercises are bodyweight exercises.

Whatever the workout, Spotter checks whether a muscle is far behind the weekly guide. It adds up the sets of each major muscle over the last 7 days and today's plan, counted as in the Muscles tab (see Progress and records). The major muscles are all muscles of the Muscles tab except the optional calves, abs and traps. When the lowest total is below 5 sets, half the guide, Spotter proposes below the exercise cards the exercise for that muscle that you logged most in the last half year. The Add button puts it in the workout.

## During a workout

The check mark at the end of a set's row logs the planned weight and reps in one tap, with the planned RIR (reps in reserve, the reps you could still have done). A second tap undoes it. When a set goes differently from the plan, tap the set itself to open steppers for weight and reps and buttons for the RIR. For dumbbell exercises, log the total weight of both dumbbells.

Logging a set starts the rest timer. Rests beyond 1:30 showed no detectable extra growth (Singer et al. 2024, Front. Sports Act. Living 6:1429789), so isolation sets get 1:30. Compound sets get 2:00, since heavier multi-joint lifts take longer to recover. Supersets change these rests. The link button between two exercises makes a superset. Its sets alternate between the two exercises with 0:45 of rest in between. After each pair, the rest is the longer of the two exercises' normal rests. Some training days come with supersets, and these pair only isolation exercises, because heavy compound lifts need their full 2:00 of rest.

Isolation exercises, where failure costs little recovery, can also end with a finisher, a few extra reps close to failure in little time, and some isolation exercises of the training days come with one. Spotter has two finishers. A drop set follows the last set at once with 25% less weight for the same reps. Myo-reps follow the last set with three mini-sets of a third of the reps at the same weight, each after 0:15 of rest. Drop sets grew muscle as much as traditional sets in less time (Sødal et al. 2023, Sports Med. Open 9:66). Myo-reps are a form of rest-pause training, and in trained men rest-pause and drop-set training matched traditional sets in strength and growth (Enes et al. 2021, Appl. Physiol. Nutr. Metab. 46:1417). The finisher button on an exercise card switches between no finisher, a drop set and myo-reps, and the training day or template keeps the choice. Finisher sets are marked D and M, and each counts as half a set in the weekly sets per muscle. The plan of the next workout ignores them, so their low reps do not hold back the weight.

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

The rules above need a weight step. Exercises without one, such as push-ups and pull-ups, keep their weight and add reps past the top of the range. However, pull-ups, chin-ups and dips logged with added weight are filed as their weighted variant, a separate exercise that has a step and so progresses by weight. So once every set of plain pull-ups, chin-ups or dips reaches the top of the range, Spotter proposes the weighted variant on the exercise card in the next gym workout (see Training days).

During the workout, Spotter compares each logged set with its plan. When the reps done plus the RIR logged exceed the planned reps plus the upper end of the target RIR, the remaining sets get heavier. When they fall short of the planned reps plus the lower end, the remaining sets get lighter. Either way the weight moves by at most one step, so an exercise without a step keeps its weight.

Before the working sets, Spotter plans warm-up sets: 10 reps at 50%, 6 at 70% and 3 at 85% of the working weight for compound exercises, and one set of 8 reps at 60% for isolation exercises. Warm-up sets do not count toward weekly sets, records or volume.

## Progress and records

The Progress tab shows workouts per week, the estimated one-rep max over time of squat, bench press, deadlift and your most logged exercises, weekly sets per muscle, weekly volume (weight times reps) and your personal records of the last 30 days.

Muscles shows the sets of the last 7 days per muscle against the weekly guide of 10 sets from Training days. In both tabs, a set counts fully for an exercise's main muscle and half for the muscles it trains indirectly, such as the biceps in a row. This way of counting predicted growth best (Pelland et al. 2026, Sports Med. 56:481). However, exercises of the squat pattern count fully for the glutes as well as the quads, since squats grew the glutes as much as hip thrusts did (Plotkin et al. 2023, Front. Physiol. 14:1279170). Spotter counts the lunge pattern the same way, a choice by hand. In contrast, compound lifts count little or nothing for calves, abs and traps, so without direct work these muscles fall short of the guide. Direct work for them is a matter of taste, so Muscles lists them as optional.

Besides the records of the last 30 days in Progress, the Library shows the records of each exercise: the best estimated one-rep max, the heaviest weight, the best set and workout by volume, and the heaviest weight for each number of reps next to the weight the current estimate predicts. History lists every workout with its records and the best set of each exercise, and Edit on a workout changes its date, sets and exercises.

## Sync and privacy

Sync keeps a copy of your data in a private GitHub repository of your own, encrypted on the device before upload. The passphrase that the key comes from never leaves the device, so GitHub cannot decrypt the data. For the same reason, Spotter cannot recover a forgotten passphrase, and without it the synced copy cannot be read. Anyone who can see the repository still sees the size of the data and the times of syncs, so keep the repository private. For those who want to check the details, the data is compressed and encrypted with AES-GCM under a 256-bit key derived from the passphrase (PBKDF2 with SHA-256 and 600,000 iterations).

To set up sync, you need a free GitHub account. On GitHub, create a new repository, for example `spotter-data`, and set it to Private. Then, under Settings, Developer settings, Personal access tokens, Fine-grained tokens, create a token with access to only that repository and set its Contents permission to Read and write. In Spotter's Settings, enter the repository as `your-github-name/spotter-data`, the token and a passphrase of at least 12 characters, such as four random words. Do this first on the device that holds your workouts. A device that connects later keeps its own workouts, but it takes over the program of the synced data (the active split, your templates and the targets of your exercises) and the settings. Other devices connect with the same repository, token and passphrase. From then on, Spotter syncs at startup, a few seconds after each change, and when it returns to the screen.

Without sync, Export backup in Settings saves all data to one file. The same Import button that reads Strong exports also reads such a backup. It adds the workouts of the backup and, after asking, its program.

## Exercise data

The exercises, movement patterns and splits are defined in data files, so changing them needs no code. `data/exercises.csv` lists the exercises with their main `muscle`, movement `pattern`, `equipment`, `increment` (the weight step in kg that the plan uses), and other names (`aliases`, separated by `|`) for matching Strong exports. Its `load` column says how bodyweight counts: `none` for external weight only, `add` for bodyweight plus the logged weight, and `subtract` for bodyweight minus assistance. `data/patterns.csv` gives each pattern its rep range (`reps_low` and `reps_high`), its `kind` (compound or isolation, which sets the target RIR, the rest and the warm-ups), its alternatives `group` and its `secondary` muscles. `data/splits.json` defines the splits, and `js/program.js` the Home template.

## Development

The app is plain HTML, CSS and JavaScript modules without a build step. To run it locally, run `python -m http.server 8765` in the folder that contains the repository folder and open `http://127.0.0.1:8765/<repository folder>/`. `tests/progression.html` runs the unit tests in the browser. `tests/dev-load.html` fills a local copy of the app with test data and opens it. It reads a Strong export from `strong_workouts.csv` next to the repository folder, which is why the server runs in the parent folder, and the comment at its top lists its options. A service worker caches the app for offline use, so a changed file takes effect on the second launch after it was published.
