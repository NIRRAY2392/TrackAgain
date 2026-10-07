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
