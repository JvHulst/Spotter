# Hand-off: Spotter

Spotter is a hypertrophy-training PWA: plain HTML/CSS/JS ES modules, no build step, IndexedDB storage, encrypted GitHub sync, GitHub Pages hosting (the repo root is the site root). [README.md](./README.md) is the spec; keep it in step with the code.

## Your first job: try to break it

A lot of UI was added quickly by a previous agent and verified only in desktop Chrome. Before building anything new:

1. Read every file in `js/` and look for bugs, duplicated logic and poor structure. Known candidates are listed under "Known weak spots".
2. Run `tests/progression.html` in a real browser (88 tests). The sync/crypto tests hang in the previous agent's headless environment and were never run there; confirm they pass.
3. Serve the folder (`python -m http.server`), open it on a phone-sized viewport, and attack it: rapid taps, cancelled drags, offline start, a sync arriving mid-workout, two devices editing, an empty history, a huge history, a corrupt backup.
4. Fix what you find and add a test for each fix.

The service worker is cache-first with a background refresh: after a deploy, a device sees the new version on the second launch. Bump `CACHE` in `sw.js` on every release and add new shell files to its `SHELL` list.

## File map

| Path | Role |
|---|---|
| `js/app.js` | Router, render loop, mini bar for a minimized workout, global pointer/drag dispatch, tick |
| `js/state.js`, `js/db.js` | In-memory state, IndexedDB persistence |
| `js/program.js` | Training days, slots, own templates, tracked exercises, program settings |
| `js/progression.js` | Pure planning: rep ranges, load progression, 1RM, set targets |
| `js/workout.js` | Active-workout mutations: sets, swap, move, superset, set types |
| `js/carry.js` | Gray prefilled numbers and propagation to later identical sets |
| `js/rest.js` | Rest-timer rules (warm-up, working, superset, myo/drop) |
| `js/history.js`, `js/strong.js` | History records and PRs; Strong CSV import |
| `js/sync.js` | Encrypted GitHub sync (PBKDF2, AES-GCM) |
| `js/sounds.js`, `js/confetti.js`, `js/reorder.js` | Rest sounds, PR confetti, generic pointer drag-to-reorder |
| `js/views/*` | One view per screen; a view returns `{title, body, back, right, tab, mainClass}`; an action returning `"keep"` skips the re-render |
| `data/` | `exercises.csv`, `patterns.csv`, `splits.json`, `cues.json` (generated) |
| `tools/build_cues.py` | Builds `data/cues.json` and `img/ex/` from free-exercise-db |

Set model: `{kg, planKg, reps, planReps, rir, done, edited, repsEdited, warmup?, type?}`. Entry model: `{ex, slot, superset, finisher, warmup, note, plan, sets}`.

## Done

Rest timer rules and sounds (incl. FAHHH); select-all on focus; popup scroll lock; exercise details in the ⋯ menu; accent colors; set-type and RIR pickers; gray prefilled numbers with propagation; drag-to-reorder in workouts, the template editor and the tracked list (superset links that a move would split are cleared); minimize bar; summary screen; PR display and confetti; fully custom own templates versus adaptive split days; 3-set leg compounds; no warm-ups for isolations; finisher as a set-type flag; exercise steps and photos for all 125 library exercises; sync race fix; Strong import.

## To do

### 1. Settings architecture (highest priority, design first)
Today the customization surface is too large and overlapping: per-group RIR, timings and rep ranges, per-exercise overrides, program settings and template options all exist or are planned. Design one simple model before adding anything. Requirements:

- **One owner per setting.** Each setting is changed in exactly one place, so an edit can never silently overwrite another. Define a precedence chain (for example app default, then category, then exercise) with at most two levels, and show in the UI which level a value comes from.
- **Defaults stay visible.** An unmodified setting follows the app default, including future improvements to that default. A modified setting is marked and has its own "Revert to default" control, per setting and not only global.
- **Little learning curve.** A new user should need to touch nothing. Offer a few presets (for example volume: low/standard/high; rest: short/standard/long) instead of many numeric fields, with an advanced section for exact values.
- **Enough freedom that templates need little manual care after a while.** Own templates stay fully manual. Split days stay adaptive and obey the defaults. Exercise-specific exceptions (for example an exercise in a heavy-compound group that should go to failure) are the one thing that needs per-exercise control.
- Propose the model in a short design note (in the README) and get the user's agreement before building it.

### 2. Smart warm-up generator
Number of warm-ups from working weight, exercise intensity class, plate loading and an RIR curve (around 10 RIR early, approaching the working RIR). Heavy compounds get several, light compounds one or two, low-fatigue isolations none. Round to loadable plates. Warm-ups may exceed the working rep range.

### 3. Priority lifts
Up to 3 chosen lifts. Every generated split day starts with one that fits the day. Never the same lead lift on consecutive days. If the list is empty, behave as now.

### 4. Automatic finisher variations
Add drop/myo flags to isolation slots automatically and vary exercises over time. Finishers are only a set-type flag, not a separate module.

### 5. Notifications when the app is closed
Web push through the service worker plus a free Cloudflare Worker; the user runs iOS 27 with the app on the home screen. In-app sounds already exist; background delivery is not built. A lock-screen or Dynamic Island timer would need a native app and was declined.

### 6. Adversarial security review
Attack the repository and the web app: sync key handling, token storage, CSP, import parsing, service worker cache poisoning, XSS through exercise names and notes.

### 7. Set-number adaptation: cascade versus algorithm suggestions
Two mechanisms currently both write the gray prefilled numbers: the cascade in `carry.js` (editing one set updates later gray sets with the same numbers) and the algorithm's replanning after a completed set (`replan` in `workout.js`). They can conflict. Intended behavior: completing a set (the checkmark) triggers the algorithm's suggestion, which takes priority; a manual edit without completing triggers the cascade. Decide whether the cascade is still needed at all, or whether it should be a per-template option ("adaptive numbers" on or off). This is a design decision with the user; resolve it together with item 1 so that one place owns the behavior.

### 8. Interface work
- **Drag feedback.** Reordering gives poor visual feedback. The dragged item should follow the finger visually (lifted, shadow), with a visible gap where it will land. Applies to workouts, the template editor and the tracked list ([reorder.js](./js/reorder.js)).
- **Minimize gesture.** Add a natural gesture for minimizing the workout (for example swipe down on the workout header) and for restoring it from the mini bar.
- **Visual consistency pass.** Go through every screen for alignment, spacing, type scale and consistency between components. Numbers must not shift neighbors when a digit is added: use tabular numerals and fixed-width columns for kg, reps, 1RM and timers.
- **Muscles tab.** Too much text at the top; cut it down without dropping needed information.
- **Confetti.** Show it whenever a workout is completed, not only for a new 1RM record on the big three.
- **Library terminology.** The exercise list row reads "Bench press (barbell) 137 / e1RM kg": the unit is misplaced and "e1RM" is used only there while the rest of the app says "1RM". Use one term everywhere (with the unit directly after the number, for example "137 kg") and define it once.

### 9. Sounds and myo availability
- **Sounds.** Remove "bruh" and "air horn": the synthesized versions do not sound like what they are named after. Keep sounds that are genuinely what they claim to be (the bell, the supplied FAHHH recording) and add real recordings of funny or plain sounds. Only ship files with a license that permits it. Files live in `sounds/`; the picker is in [settings.js](./js/views/settings.js) and playback in [sounds.js](./js/sounds.js).
- **Myo sets.** Myo reps can currently be chosen only for certain exercises. Make them available wherever they make sense, and state the rule in one place (see item 1 for where such rules should live).

### 10. Smaller items
- Keyboard alternative to dragging.
- Persist a reordered workout back to slot order for built-in days (only supersets are stored now).
- Click-test confetti and the history set-type picker.
- Custom and Strong-imported exercises have no cues; allow adding a note or link.

## Known weak spots
- `!warmup && !type` ("working set") is repeated in `carry.js`, `rest.js` and `workout.js`; make one shared predicate.
- `setType` sets `entry.finisher` for exercises that do not allow finishers; harmless but untidy.
- `firstOpen` wrapper in `workout.js` is redundant.
- Several cue mappings in `tools/build_cues.py` are nearest-movement approximations (pike push-up, nordic curl, lateral band walk, squat machine).
- 216 JPEGs (about 3.3 MB) live in the repo.
- Terminology must stay consistent: "working set", "warm-up set", "drop set", "myo set".
- US spelling everywhere; no changelog prose in comments or docs.
