# TrackA'gain release notes

<!--
How this file works
- Newest release first. Each release is "# vX.Y.Z" followed by "## <date>".
- Inside a release, notes go under: Features, Improvements, Fixes, Nerd stuff.
- New work goes under "# Unreleased". The release script turns it into the
  next version, stamps today's date and publishes it to the Download page.
- Write Features / Improvements / Fixes for people using the app.
  Technical details belong in Nerd stuff.
-->

# Unreleased
### Features
### Improvements
### Fixes
### Nerd stuff

# v1.6.0
## 22 October 2026
### Features
- **Train a different day.** Under Today’s hit list, tap Something else? to do another day from your split, or start a custom session and add exercises as you go. Your split stays as it is.
### Improvements
- The rest and hold timer fills from white into light yellow, and the time sits in the middle of the bar.
- **Workout summary shows growth.** On History, the score is the month’s attendance out of 100. Miss a training day and it eases down. Train again, even on a rest day, and it climbs back. It stops at 100. Rest days are not absences, and today is not a miss until the day is over. All time is the average of those months. The i in the top right explains it.
- On Records, the progress line follows the heaviest weight you logged each day, so a lighter day pulls the line down. Your record itself stays the best you have done.
### Fixes
- Plank, side plank, and treadmill say Start, then the countdown runs. Stopping early saves the time you actually held, not the full time you started.
- Set steppers on a workout card look right again, and + / − change the number. The in-app picker styling had stretched the number into a full field and covered the buttons.
### Nerd stuff
- Field rules use `:where()` so excluding checkbox/radio no longer outranks `.stp-val input` (and other compact inputs).
- `applyTodaySession` / `openTodaySessionSheet`. A swapped day sets `log.dayKey` plus a plan snapshot. `log.customSession` keeps an empty plan through Start and split sync. Logged sets are kept.
- Working minute holds (`isMinuteHold`, not a warm-up) label the card button Start via `formatHoldAmount`. `stopActiveHold` stores elapsed seconds (at least 1, at most the time you started) and `recomputePRs`. The record toast waits for `completeActiveHold` or `stopActiveHold`.
- `monthAttendance(ym)` is the History score, using `workedDateList` (working sets only, so a warm-up does not start the clock). Training weekdays on the current split that have passed count as expected days. A date with working sets counts as attended, including a rest day, and the result is capped at 100. Today is ignored until you train or the day has passed. Days before the first working set are ignored. All time averages those monthly scores. `openScoreInfoSheet` explains it. `historyWeightRows` still feeds Vs previous.
- Records progress uses `sessionSeriesForExercise`: one best working set per day, including days that were lighter than the record. The line plots that weight. `prMomentsForExercise` is still the PR log and the current record.

# v1.5.0
## 16 October 2026
### Features
- **Minute countdown for plank and treadmill.** Log the minutes first, then a countdown runs in the workout bar. Stop leaves what you logged, and you can tap the set afterwards to change it.
- **Live Spotter on each exercise.** After a set, Spotter shows a clear “toward more weight” meter, updates as you change weight and reps, and offers tap chips (Hit target, Beat last time) that fill the steppers.
- **Day warm-ups on your split.** Each day can have a short bodyweight warm-up under Exercises. Edit them in Split, tap reset for everyday basics, or add more from the library, then check them off at the start of the workout (not on Home).
- **Warm-up library.** Settings → Warm-up library browses bodyweight warm-ups by muscle (search, add, edit). Split day “Add warm-up” picks from the same list.
### Improvements
- Plank and treadmill use separate min and sec steppers, so you can log 0:05 or 2:40 — not only whole minutes.
- The old “1/2 sets at target toward more weight” line is replaced by a plain meter, so it is clear those slots are about earning more weight, not today’s set dots.
- Spotter’s live line says “Same as last set” instead of “ties set 1”, and the Match last chip is gone (Hit target and Beat last time stay).
- Split day editor: Add exercise / Save day are full width again; warm-up rows match exercise cards; section titles are larger; warm-up reset restores everyday bodyweight basics (no bands or tools).
- Everyday warm-up suggestions are bodyweight-only basics; muscle-specific drills live in the Warm-up library instead (no bands or tools).
- Old tool warm-ups already saved on a day (like band curls) are replaced with the everyday bodyweight basics the next time the app opens.
- **How to** sits at the top right of each warm-up.
- **Weight jumps follow your gym.** Spotter and “ready for more weight” always move at least one full jump. Edit Weight jump per exercise on the Split day (or leave blank for the equipment default — machines/cables 5 kg, dumbbells/bars 2.5 kg).
- **In-app pickers** for Settings, History range, and exercise details — no more stock Android dropdowns.
- Toasts sit steadier and use the app’s card look instead of a harsh black pill.
- **Rest alert sound.** In Settings → Rest timer, pick Phone default or Whistle for the rest-complete (and hold) notification.
### Fixes
- Spotter no longer suggests odd mid-set jumps (like +1 kg on curls) that ignored the normal weight step.
- Full screen mode is gone. The app uses the normal status and navigation bars again, instead of hiding them.
- Checkboxes no longer flash a big lime focus rectangle when you tap them.
- When min and max reps are the same, Spotter and the exercise card say “15 reps” instead of “15–15”.
### Nerd stuff
- Minute holds (name contains plank or treadmill) still store `duration` in seconds, with min + sec steppers and sheet fields. `holdStartedAt` on the set drives the countdown, so locking the phone does not freeze it. Rest starts when the countdown ends or is stopped. Farmer's carry stays in seconds.
- `liveSetFeedback()` now returns `progress` (`repsTarget`, `setsNeeded`, `atTarget`, `trackWeight`). `makeStepperPreview()` and `spotterChipActions()` drive the live Spotter line and chips in `liveCoachBox()`.
- Split days store `warmups` (`id`, `title`, `detail`, `minutes`, `howTo`, optional `libraryId`). `basicWarmupsForDay()` seeds from `WARMUP_BASICS`. `DATA.warmupLibrary` seeded from `WARMUP_LIBRARY_SEED`. Workout logs snapshot `warmups` / `warmupDone`; not counted as sets. `resolveWarmupHowTo` drives the How to disclosure. Days that still list a tool warm-up are rewritten to `WARMUP_BASICS` on migrate.
- `loadStepFor(ex, planRow)` resolves plan → exercise → equip. `snapLoad` / `suggestHeavierLoad` harden Spotter `nextWeight`. Machine/cable defaults are 5 kg. Plan rows store optional `loadStep`.
- `FullscreenPlugin` and `MainActivity.applyFullscreen` removed. Boot no longer calls `setFullscreen`. The app uses normal system bars.
- `choiceFieldHtml` / `openChoiceSheet` / `bindChoiceField` replace native `<select>`. Toasts use `.toast-wrap` for position and `.toast` for opacity/slide only. Field input rules exclude checkbox/radio.
- `formatRepRange(min, max)` collapses equal bounds to a single number for Spotter and plan target lines.
- `settings.restSound` (`default` | `whistle`). Whistle channel `rest-heads-up-whistle-v1` uses `res/raw/whistle`; web preview plays `sounds/whistle.m4a`.

# v1.4.0
## 7 October 2026
### Features
- **Live coaching on every exercise card.** After each set, the card tells you what it means: match it, beat it, go lighter, or how close you are to earning more weight.
- **PR preview while you set up a set.** As you adjust weight and reps, a line shows how it compares with your last set and last session, and tells you when it would be a new PR.
- **Workout complete card.** Finishing a workout shows your time, sets, volume, PRs and streak, with buttons to reopen the workout or view the full summary.
- **Start exercise / Start superset buttons.** Untouched exercises stay compact until you start them.
- **Draggable sheets.** Pop-up sheets open at a short height so you can still see the screen behind, swipe up for full height, pull down to drop back, and pull further to close.
- **Check for updates.** Settings shows the app version and a button that tells you when a new version is out.
- **Full screen option (Android).** Hide the status and navigation bars from Settings → Appearance.

### Improvements
- The rest-complete alert now says what is next: the next set, the next superset round, the next exercise, or that you are done.
- Exercises you start move up under the ones you have already worked on, so the workout reads in the order you did it. Exercises added mid-workout land in the same place.
- Records: each muscle page has a cleaner header, and every exercise shows when its PR was set and how many PRs it has.
- Body weight card shows your current weight big and clear, with the change since your previous weigh-in.
- Light theme is now the default for new installs.
- Logging a set gives a light haptic tick (a double pulse for PRs and finishing your target sets) instead of a random toast. Only PRs still get a toast.
- Set progress dots animate when a set fills in.
- The first set of a new exercise is called a "Feeler set", with clearer guidance on finding your working weight.
- The workout summary opens at a short height so your greeting stays visible behind it.

### Fixes
- A rest alert could still go off after you stopped the timer or finished the workout. It no longer does.
- The rest timer no longer starts once every exercise has hit its target sets.
- The page behind an open sheet no longer scrolls along with it.
- Swiping sideways through chip rows no longer drags the page.

### Nerd stuff
- New `liveSetFeedback()` in `05-training.js` picks the coach line by priority (warm-up, drop set, PR, qualifying session, rep range, rest length...) and uses the same qualifying rules as the overload engine, so "counts toward more weight" always matches the next session's suggestion.
- New `makeStepperPreview()` compares the stepper draft against the previous set, last session and the all-time best score.
- Rest notifications carry a token. Scheduling is async, so a timer stopped mid-schedule can no longer leave a notification behind. `cancelAllRestNotifications()` also sweeps pending `type: rest` alerts when a workout ends.
- `promoteStartedExercise()` / `indexAfterStarted()` reorder `log.plan` when a set is logged. Supersets move as one block.
- Bottom sheets got `attachSheetDrag()` in `07-ui.js`: transform-based snapping between peek (60% of the screen), full and closed, with velocity projection on release. Wheel, focus and resize are handled too. State is kept on the sheet root so in-place redraws don't drop back to peek.
- `html.overlay-open` is toggled by a MutationObserver on the sheet roots to lock page scroll.
- App version lives in `APP_VERSION` / `APP_BUILD` (`01-config.js`). The update check reads `version.json` from the website.

# v1.3.0
## 5 October 2026
### Features
- **Bodyweight + added weight** tracking for pull-ups, chin-ups and dips.
- **Per-exercise weight jump**, so each movement can progress in steps that match your gym.
- Redesigned day editor with collapsible exercise cards.

### Improvements
- The workout clock keeps counting with the screen locked and keeps the screen on during a workout.
- Rest starts automatically after each set, using that exercise's rest time.
- Smarter PRs: 100 kg × 12 beats 100 kg × 10, your first set is treated as a baseline, and warm-ups never count as PRs.
- Realistic weight steps: dumbbell, cable and machine exercises move in 2.5 kg steps.
- Warm-up sets no longer count toward volume.
- Old workouts left open now finish automatically.
- Light-red delete buttons in the day editor so destructive actions stand out.

### Fixes
- Coming back after 3+ hours away no longer locks you out of reopening the workout. It only trims the timer.
- The back button now asks before leaving the day editor with unsaved changes.

### Nerd stuff
- The workout timer is wall-clock based (start/end timestamps) instead of a ticking counter, so background throttling can't drift it.
- The new APK is signed with the same key and installs over the old one.

# v1.2.0
## 28 September 2026
### Features
- **Chai me up.** A support page with a UPI QR code, Save QR, a running total and a copy-UPI-ID button, linked from the website and the app.

### Improvements
- The website gets a "Buy me a chai" link and refreshed copy.

### Fixes
- Removed the direct UPI pay button. UPI apps decline payment links to personal UPI IDs, so the QR code is the reliable way.

### Nerd stuff
- The QR code is generated on the page with `qrcode.min.js`, so the amount can be changed without new images.

# v1.1.0
## 27 September 2026
### Features
- **History shows growth, consistency and muscle targeting**, not just a list of sessions.
- Weigh-ins use the same year / month tree as History.

### Improvements
- Bonus sets and saving after being away (AFK) work properly.
- A much larger daily quote list.

### Fixes
- The APK download now has the current app. It was still shipping the old single-file version.

### Nerd stuff
- The app was split from one large `index.html` into `css/app.css` and ten ordered scripts (`01-config.js` → `10-boot.js`).
- The APK is rebuilt from the split web assets inside the existing Capacitor project.

# v1.0.0
## 25 September 2026
### Features
- First public release: the TrackA'gain website with a downloadable Android APK and a web version for iPhone.
- Progressive overload suggestions, rest timer with alerts, automatic PR tracking, muscle-balance breakdowns, God's Plan / PPL / PPL + UL presets and a custom split builder.

### Improvements
- Works fully offline, with no account. Everything stays on your phone.

### Fixes
- Fixed the APK download link on the website.

### Nerd stuff
- Hosted on GitHub Pages. The APK is a Capacitor Android build of the web app.
