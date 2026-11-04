# Spotter

Spotter is a workout tracker for hypertrophy training on the iPhone. It plans the weight and reps of every set, logs your workouts and charts your progress. Open it at https://jvhulst.github.io/Spotter/. Once added to the home screen, it also works offline.

## Install

Open the link in Safari, tap Share, then tap Add to Home Screen. From then on, open Spotter only from the home screen. The home-screen app keeps its own storage, so anything you log in a Safari tab does not appear there.

## Using Spotter

The Today tab shows the next training day of your split, which you choose at the top of that tab. A training day is a list of exercise slots, such as a squat slot or a row slot. Each slot keeps the exercise you last chose for it, and Spotter proposes a swap when that exercise stalls. You can also build templates of your own, which keep exactly the exercises you saved in them.

Within a training day, Spotter plans each exercise by double progression. The reps rise to the top of the rep range, and then the weight goes up one step. Settings sets the rep range, target reps in reserve, rest and warm-up sets per category of exercise, and an exercise's page in the Library can set its own.

| Category | Reps | Reps in reserve |
| --- | --- | --- |
| Barbell compounds | 5–8 | 1–2 |
| Other compounds | 8–12 | 0–1 |
| Isolations | 10–20 | 0–1 |

In a workout, each set shows its planned weight and reps in gray. Type over them if you did something else, and tap the check mark to log the set. Logging starts the rest timer, which plays a sound when the rest is over while Spotter is open. When Spotter is in the background, a rest can also end with a notification, chosen in Settings.

The Progress tab shows workouts per week, estimated one-rep maxes, bodyweight, volume and records. The Muscles tab shows your sets per muscle over the last 7 days, and the Library tab shows each exercise with its records, steps and photos.

## Your data

Your data stays on your device, and neither the website nor this repository holds any of it. Export backup in Settings saves all data to one file. Settings also imports that file, an export from the Strong app (in Strong: Settings, Export Strong Data), or a CSV file of weigh-ins with the columns `date` (as 2025-12-21) and `kg`.

The one exception is the optional Sync. It keeps a copy in a private GitHub repository of your own, so a lost phone loses nothing and your other devices stay in step. Spotter encrypts this copy on the device with your passphrase, so GitHub cannot read it, and without the passphrase nobody can decrypt it.

To set up Sync, create a private repository on GitHub. Then create a fine-grained personal access token (on GitHub: Settings, Developer settings, Personal access tokens) with access to only that repository, and set its Contents permission to Read and write. In Spotter's Settings, enter the repository (for example `your-name/spotter-data`), the token and a passphrase of at least 12 characters. Do this first on the device that holds your workouts, then on your other devices with the same three entries.

## Development

The app is plain HTML, CSS and JavaScript modules without a build step. Run `python -m http.server 8765` in the folder that contains the repository folder and open `http://127.0.0.1:8765/<repository folder>/`. Open `tests/progression.html` on the same server to run the unit tests. A service worker caches the app for offline use, and a new value of `CACHE` in `sw.js` makes installed copies replace all cached files, so change it in every release. Sync encrypts with AES-GCM under a key derived from the passphrase with PBKDF2-SHA256 (600,000 iterations). The rest notifications come from a Cloudflare Worker in `push/`, which `python push/deploy.py` deploys.

The exercises, movement patterns and splits are defined in `data/`. The exercise steps and photos come from the public-domain [free-exercise-db](https://github.com/yuhonas/free-exercise-db), and `python tools/build_cues.py` rebuilds `data/cues.json` and `img/ex/` from it.
