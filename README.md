# Spotter

Spotter is a free workout tracker for the iPhone. It plans the weight and reps of every set, logs your workouts and charts your progress. Open it at https://jvhulst.github.io/Spotter/.

## Install

Open the link in Safari, tap Share, then tap Add to Home Screen. From then on, open Spotter from the home screen. It works offline there and keeps its own storage, separate from Safari.

## Your data

Your data stays on your device unless you turn on Sync. Settings exports a backup, and imports a backup, a workout export from the Strong app or a CSV file of weigh-ins with the columns `date` and `kg`.

The optional Sync keeps an encrypted copy in a private GitHub repository of your own. Create that repository and a fine-grained personal access token with Contents read and write access to only that repository. Then enter the repository (as `owner/repository`), the token and a passphrase of at least 12 characters in Settings. Do this first on the device that holds your workouts, then on your other devices with the same three entries.

## Development

The app is plain HTML, CSS and JavaScript modules without a build step. To run it, run `python -m http.server 8765` in the folder that contains the repository folder and open `http://127.0.0.1:8765/<repository folder>/`. The tests run at `tests/progression.html` on the same server. Change the `CACHE` name in `sw.js` with every push to `main`, so installed copies fetch the new files.

Rest-timer notifications come from a Cloudflare Worker in `push/`, which `python push/deploy.py` deploys.

The exercise instructions and photos come from the public-domain [free-exercise-db](https://github.com/yuhonas/free-exercise-db). `python tools/build_cues.py` rebuilds them into `data/cues.json` and `img/ex/`.
