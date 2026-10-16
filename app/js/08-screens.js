/* ============================ §8 SCREENS ============================ */
let VIEW = 'today';
/* Home has two in-place screens. 'workout' is not a tab. */
let homeScreen = 'landing';
const TABS = [
  {key:'today',     icon:'home',     label:'Home'},
  {key:'split',     icon:'calendar', label:'Split'},
  {key:'history',   icon:'history',  label:'History'},
  {key:'records',   icon:'trophy',   label:'Records'},
  {key:'settings',  icon:'settings', label:'Settings'}
];
const SCREENS = {
  today:     ()=> (homeScreen==='workout' && todayLog().active) ? renderActiveWorkout() : renderLanding(),
  split:     ()=> renderSplitScreen(),
  history:   ()=> renderHistoryScreen(),
  records:   ()=> renderRecordsScreen(),
  settings:  ()=> renderSettingsScreen()
};
function goToTab(key){
  if(key==='today') homeScreen = 'landing';
  VIEW = key;
  window.scrollTo(0,0);
  renderApp();
}
function openWorkoutScreen(){
  if(!todayLog().active){ startWorkout(); return; }
  homeScreen = 'workout';
  VIEW = 'today';
  window.scrollTo(0,0);
  renderApp();
}
function backToLanding(){
  homeScreen = 'landing';
  VIEW = 'today';
  window.scrollTo(0,0);
  renderApp();
}

/* ------------------------------ Welcome ------------------------------ */
/* First launch only. Every field is optional; Skip keeps the defaults. */
function renderWelcome(){
  const app = document.getElementById('app');
  document.body.classList.add('welcome-mode');
  document.getElementById('tabbar').innerHTML = '';
  let gender = DATA.settings.gender;
  const chips = (attr, options, current)=> options.map(([value,label])=>
    `<button type="button" class="chip${value===current?' on':''}" data-${attr}="${value}">${label}</button>`).join('');
  const node = el(`
    <div class="welcome">
      <div class="welcome-brand">${logoMarkHtml()}</div>
      <h1 class="welcome-title">Welcome to TrackA'<em>gain</em></h1>
      <p class="welcome-sub">A few optional details to make it yours. Fill in what you like, or skip.</p>
      <div class="welcome-privacy">${icon('info',16)}<span><b>No account, no sign-up.</b> Everything you enter stays on this phone. Nothing leaves your device.</span></div>
      <div class="card welcome-card">
        <div class="field"><label>Your name</label><input id="wName" placeholder="${escapeHtml(DEFAULT_USER_NAME)}" autocomplete="given-name" maxlength="40"></div>
        <div class="field"><label>Gender</label><div class="welcome-chips">${chips('g', [['male','Male'],['female','Female'],['unspecified','Prefer not to say']], gender)}</div></div>
        <div class="field"><label>Body weight (kg)</label><input id="wWeight" type="number" step="0.1" min="1" max="400" inputmode="decimal" placeholder="e.g. 77"></div>
        <div class="field" style="margin:0;"><label>Theme</label><div class="welcome-chips">${chips('t', [['dark',icon('moon',15)+' Dark'],['light',icon('sun',15)+' Light']], currentTheme())}</div></div>
      </div>
      <button class="btn hero-cta" data-go>Let's go ${icon('chevronRight',18)}</button>
      <button class="btn ghost welcome-skip" data-skip>Skip for now</button>
    </div>`);
  qa('[data-g]',node).forEach(b=> b.onclick = ()=>{
    gender = b.dataset.g;
    qa('[data-g]',node).forEach(x=> x.classList.toggle('on', x===b));
  });
  qa('[data-t]',node).forEach(b=> b.onclick = ()=>{
    setTheme(b.dataset.t);
    qa('[data-t]',node).forEach(x=> x.classList.toggle('on', x===b));
  });
  const finish = (useAnswers)=>{
    if(useAnswers){
      const rawWeight = q('#wWeight',node).value.trim();
      const weight = parseFloat(rawWeight);
      if(rawWeight && (isNaN(weight) || weight<=0 || weight>400)){ showToast('Enter a weight in kg, or leave it empty'); return; }
      const name = q('#wName',node).value.trim();
      if(name) DATA.settings.userName = name;
      DATA.settings.gender = gender;
      if(rawWeight) saveBodyWeightEntry(roundTo(weight,1), '', todayKey());
    }
    DATA.settings.onboarded = true;
    saveData(DATA);
    document.body.classList.remove('welcome-mode');
    VIEW = 'today';
    homeScreen = 'landing';
    window.scrollTo(0,0);
    renderApp();
  };
  q('[data-go]',node).onclick = ()=> finish(true);
  q('[data-skip]',node).onclick = ()=> finish(false);
  app.innerHTML = '';
  app.appendChild(node);
}

function renderApp(){
  if(!DATA.settings.onboarded){ renderWelcome(); return; }
  closeStaleWorkout();
  maybeTrimAwayTime();
  destroyHistoryCharts();
  afterHistoryRender = [];
  const app = document.getElementById('app');
  const dateLabel = new Date().toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
  app.innerHTML = '';
  const head = el(`
    <header class="app-head">
      <div class="topbar">
        <div class="brand">${logoMarkHtml()}<span class="word">TrackA'<em>gain</em></span></div>
        <div class="topbar-meta">
          <span class="topbar-date">${escapeHtml(dateLabel)}</span>
          <span class="streak-pill">${icon('flame',14)} ${currentStreakDays()}</span>
        </div>
      </div>
    </header>`);
  app.appendChild(head);
  const screen = el(`<div></div>`);
  screen.appendChild((SCREENS[VIEW] || SCREENS.today)());
  // A screen can mark one element (the workout timer bar) to live in the fixed header.
  const pinned = q('[data-pin-head]', screen);
  if(pinned) head.appendChild(pinned);
  app.appendChild(screen);
  const historyPaints = afterHistoryRender;
  afterHistoryRender = [];
  historyPaints.forEach(paint=>{ try{ paint(); }catch(err){ console.error(APP_NAME+': history chart failed', err); } });
  const bar = document.getElementById('tabbar');
  bar.innerHTML = TABS.map(t=>`
    <button data-tab="${t.key}" class="${VIEW===t.key?'active':''}" aria-label="${t.label}">
      <span class="ic">${icon(t.icon,22)}</span><span>${t.label}</span>
    </button>`).join('');
  qa('button',bar).forEach(b=> b.onclick = ()=> goToTab(b.dataset.tab));
  const oldFab = document.getElementById('quickAddFab');
  if(oldFab) oldFab.remove();
  syncWorkoutTimer();
}

/* Workout clock. elapsedMs + timerRunningSince is the source of truth; one
   interval only repaints. The clock is wall time: it keeps running while the
   phone is locked between sets. Only Finish stops it, and maybeTrimAwayTime
   takes off long idle gaps. */
let workoutTicker = null;
let workoutSaveAt = 0;
function activeWorkoutLog(){
  return (DATA && DATA.logs && DATA.logs.find(l=>l.active)) || null;
}
function clearWorkoutTicker(){
  if(!workoutTicker) return;
  clearInterval(workoutTicker);
  workoutTicker = null;
}
function freezeWorkoutElapsed(log){
  if(!log || !log.timerRunningSince) return;
  log.elapsedMs = workoutElapsedMs(log);
  log.timerRunningSince = null;
}
function captureActiveWorkoutElapsed(){
  const log = activeWorkoutLog();
  if(!log || !log.timerRunningSince) return;
  const now = Date.now();
  log.elapsedMs = workoutElapsedMs(log, now);
  log.timerRunningSince = now;
}
function paintWorkoutTimer(){
  const node = document.querySelector('[data-workout-timer]');
  if(!node) return;
  const log = activeWorkoutLog();
  if(!log) return;
  paintSlotClock(node, formatWorkoutClock(workoutElapsedMs(log)));
}
function tickWorkoutTimer(){
  if(closeStaleWorkout()){ renderApp(); return; }
  maybeTrimAwayTime();
  const log = activeWorkoutLog();
  if(!log || document.hidden){
    clearWorkoutTicker();
    if(log) saveData(DATA);
    return;
  }
  if(!log.timerRunningSince) log.timerRunningSince = Date.now();
  paintWorkoutTimer();
  if(Date.now()-workoutSaveAt>=15000){
    workoutSaveAt = Date.now();
    saveData(DATA);
  }
}
function ensureWorkoutTicker(){
  if(workoutTicker) return;
  workoutSaveAt = Date.now();
  workoutTicker = setInterval(tickWorkoutTimer, 1000);
}
function syncWorkoutTimer(){
  const log = activeWorkoutLog();
  if(!log){
    clearWorkoutTicker();
    setScreenAwake(false);
    return;
  }
  if(!log.timerRunningSince) log.timerRunningSince = Date.now();
  if(document.hidden){ clearWorkoutTicker(); return; }
  setScreenAwake(true);
  ensureWorkoutTicker();
  paintWorkoutTimer();
}
/* Hidden or locked: the clock keeps running; only the repaint stops. */
function pauseWorkoutForBackground(){
  clearWorkoutTicker();
  if(activeWorkoutLog()) saveData(DATA);
}
function stopWorkoutClock(log){
  freezeWorkoutElapsed(log);
  clearWorkoutTicker();
  setScreenAwake(false);
}

const AFK_CLOSE_MS = 3 * 60 * 60 * 1000;
function lastWorkoutActivityAt(log){
  let t = log.startedAt || 0;
  (log.sets||[]).forEach(s=>{ if(s.ts && s.ts>t) t = s.ts; });
  return t;
}
/* Remembers the clock reading at the last real action (start, reopen, set). */
function markWorkoutActivity(log){
  if(!log) return;
  log.activityAt = Date.now();
  log.activityElapsedMs = workoutElapsedMs(log);
}
/* After 3+ hours with no activity, take the time away off the clock.
   The workout stays open; only closeStaleWorkout finishes one left from an earlier day. */
function maybeTrimAwayTime(){
  const log = activeWorkoutLog();
  if(!log) return false;
  const now = Date.now();
  const last = log.activityAt || lastWorkoutActivityAt(log);
  if(!last || now - last < AFK_CLOSE_MS) return false;
  const current = workoutElapsedMs(log, now);
  const atLast = (typeof log.activityElapsedMs==='number' && isFinite(log.activityElapsedMs))
    ? log.activityElapsedMs
    : Math.max(0, current - (now - last));
  log.elapsedMs = Math.max(0, Math.min(current, atLast));
  log.timerRunningSince = now;
  markWorkoutActivity(log);
  saveData(DATA);
  showToast('Welcome back. Time away was left off the timer');
  return true;
}
/* A workout left open from an earlier day and idle for 3+ hours is finished
   at its last activity, so today's sets don't land on the old date. */
function closeStaleWorkout(){
  const log = activeWorkoutLog();
  if(!log || log.date===todayKey()) return false;
  const now = Date.now();
  const last = log.activityAt || lastWorkoutActivityAt(log);
  if(last && now - last < AFK_CLOSE_MS) return false;
  const current = workoutElapsedMs(log, now);
  const atLast = (typeof log.activityElapsedMs==='number' && isFinite(log.activityElapsedMs))
    ? log.activityElapsedMs
    : Math.max(0, current - (now - (last || now)));
  log.elapsedMs = Math.max(0, Math.min(current, atLast));
  log.timerRunningSince = null;
  log.endedAt = last || now;
  log.active = false;
  log.completed = log.sets.length>0;
  if(homeScreen==='workout') homeScreen = 'landing';
  stopRestTimer(WORKOUT_REST_ID);
  cancelAllRestNotifications();
  clearWorkoutHolds(log);
  clearWorkoutTicker();
  setScreenAwake(false);
  saveData(DATA);
  showToast(`Your ${formatLogDate(log.date)} workout was still open, so it was finished`);
  return true;
}

/* ------------------------------ Today ------------------------------ */
function startWorkout(){
  const log = persistLog(todayLog());
  // Copy the split as it is now. A plan left over from before Start
  // would ignore split edits made while no workout was running.
  if(!log.startedAt){
    log.plan = null;
    log.warmups = null;
    log.warmupDone = [];
  }
  absorbQueuedExercises(log);
  log.active = true;
  if(!log.startedAt) log.startedAt = Date.now();
  if(typeof log.elapsedMs!=='number' || !isFinite(log.elapsedMs) || log.elapsedMs<0) log.elapsedMs = 0;
  log.timerRunningSince = Date.now();
  log.completed = false;
  markWorkoutActivity(log);
  homeScreen = 'workout';
  VIEW = 'today';
  saveData(DATA);
  renderApp();
}
function reopenWorkout(log){
  absorbQueuedExercises(log);
  log.active = true; log.completed = false; log.endedAt = null;
  if(typeof log.elapsedMs!=='number' || !isFinite(log.elapsedMs) || log.elapsedMs<0) log.elapsedMs = 0;
  log.timerRunningSince = Date.now();
  markWorkoutActivity(log);
  homeScreen = 'workout';
  VIEW = 'today';
  saveData(DATA);
  closeSheets();
  renderApp();
}
function finishWorkout(){
  const log = todayLog();
  confirmAction("Finish and save today's workout?", 'Finish', ()=>{
    stopRestTimer(WORKOUT_REST_ID);
    cancelAllRestNotifications();
    clearWorkoutHolds(log);
    stopWorkoutClock(log);
    log.endedAt = Date.now(); log.active = false; log.completed = true;
    homeScreen = 'landing';
    saveData(DATA);
    openCelebrationSheet(log);
  });
}

function renderLanding(){
  const wrap = el(`<div></div>`);
  const log = todayLog();
  const plan = planForLog(log);
  const trainedToday = log.sets.length>0;
  const last = lastCompletedWorkout();
  const subtitle = plan.length
    ? `${activeSplit().label} · ${planNameForLog(log)} day · ${plan.length} exercises planned`
    : 'Scheduled rest day — recovery is part of the plan';

  const hero = el(`
    <div class="hero-card">
      <p class="hero-eyebrow">${escapeHtml(new Date().toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}).toUpperCase())}</p>
      <h1 class="hero-greet">${escapeHtml(greetingText(DATA.settings.userName||'there'))}</h1>
      <p class="hero-sub">${escapeHtml(subtitle)}</p>
      <p class="hero-quote">${escapeHtml(quoteOfTheDay())}</p>
      ${log.active
        ? `<button class="btn hero-cta" data-goto>${icon('dumbbell',18)} Go to Workout</button>`
        : trainedToday
        ? `<div class="row">
             <button class="btn secondary" data-reopen style="flex:1;">${icon('reopen',18)} Reopen Workout</button>
             <button class="btn" data-summary style="flex:1;">View summary</button>
           </div>`
        : `<button class="btn hero-cta" data-start>${icon('plus',18)} Start Workout</button>`}
      <div class="hero-meta">
        <span class="pill">${icon('flame',14)} ${currentStreakDays()} day streak</span>
        <span class="pill">${last ? `Last workout: ${relativeDay(last.date)}` : 'No workouts logged yet'}</span>
      </div>
    </div>`);
  if(log.active){
    q('[data-goto]',hero).onclick = openWorkoutScreen;
  } else if(trainedToday){
    q('[data-reopen]',hero).onclick = ()=> reopenWorkout(log);
    q('[data-summary]',hero).onclick = ()=> openShareSummarySheet(log);
  } else {
    q('[data-start]',hero).onclick = startWorkout;
  }
  wrap.appendChild(hero);

  if(shouldShowWeightReminder()){
    const remind = el(`
      <div class="weigh-card" data-log>
        <div class="copy">
          <div class="title">Today’s weigh-in day – log your weight.</div>
          <div class="sub">Tap to log · Later hides this until next week</div>
        </div>
        <button class="btn ghost" data-snooze style="flex:0 0 auto;">Later</button>
      </div>`);
    remind.onclick = (e)=>{
      if(e.target.closest('[data-snooze]')) return;
      goToTab('history');
      openLogWeightSheet();
    };
    q('[data-snooze]',remind).onclick = (e)=>{
      e.stopPropagation();
      snoozeWeightReminder();
      showToast('Reminder snoozed until next week');
      renderApp();
    };
    wrap.appendChild(remind);
  }

  if(plan.length){
    let n = 0;
    const rowHtml = (row, inSuperset)=>{
      n++;
      const ex = getExercise(row.exerciseId);
      const done = setsInLogFor(log,row.exerciseId).length>0;
      const range = formatRepRange(row.repsMin, row.repsMax);
      const target = isMinuteHold(ex) ? `${row.sets} × ${formatHoldRange(row.repsMin, row.repsMax)}`
        : `${row.sets} × ${range}${metricOf(ex)==='time' ? 's' : ''}`;
      return `
        <div class="hl-row${done?' done':''}">
          <span class="hl-idx">${done ? icon('check',14) : n}</span>
          <span class="hl-name">${escapeHtml(ex ? ex.name : '?')}${inSuperset ? `<span class="hl-link" title="Superset" aria-label="Superset">${icon('link',13)}</span>` : ''}</span>
          <span class="hl-target">${target}</span>
        </div>`;
    };
    const rows = groupPlanRows(plan).map(g=> g.type==='single'
      ? rowHtml(g.row, false)
      : g.members.map(m=> rowHtml(m.row, g.members.length>1)).join('')
    ).join('');
    wrap.appendChild(el(`
      <div class="card hl-card">
        <div class="hl-head">
          <p class="section-title" style="margin:0;">Today's hit list</p>
          <span class="hl-day">${escapeHtml(planNameForLog(log))} <span class="count-pill">${plan.length}</span></span>
        </div>
        <div class="hl-rows">${rows}</div>
      </div>`));
  }

  if(trainedToday){
    const work = muscleWorkCard(log.sets, "Today's muscle work");
    if(work) wrap.appendChild(work);
  } else if(last){
    wrap.appendChild(el(`
      <div class="card flat">
        <p class="section-title" style="margin-top:0;">Last workout</p>
        <div class="row between">
          <div>
            <strong>${formatLogDate(last.date)}</strong>
            <div class="faint small">${workingSetCount(last.sets)} set${workingSetCount(last.sets)===1?'':'s'} logged</div>
          </div>
          ${last.sets.some(s=>s.isPR) ? '<span class="trophy" style="font-size:20px;">🏆</span>' : ''}
        </div>
      </div>`));
  }
  return wrap;
}

/* One bar for the clocks in the fixed header. Training: the workout clock.
   A plank or treadmill countdown replaces it while that hold is running.
   Resting: only the rest countdown. The workout clock keeps counting
   underneath and comes back when the hold or rest ends. */
function workoutTimerBarEl(log){
  const restId = WORKOUT_REST_ID;
  const hold = findActiveHold(log);
  const resting = !hold && !!restTimers[restId];
  const startedAt = log.startedAt ? new Date(log.startedAt).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}) : '';
  const clock = formatWorkoutClock(workoutElapsedMs(log));
  const holdText = hold ? holdRemainingText(hold) : '';
  const holdName = hold ? ((getExercise(hold.exerciseId)||{}).name || 'Hold') : '';
  const left = resting ? restRemainingText(restId) : '';
  const center = hold
    ? `<span class="session-clock slot-clock" data-holdcountdown="${hold.id}" data-shape="${slotShape(holdText)}" role="timer" aria-label="${escapeHtml(holdText)}">${slotClockHtml(holdText, true)}</span>
       <span class="tb-sub"><b>${escapeHtml(holdName)}</b></span>`
    : resting
    ? `<span class="session-clock slot-clock" data-restcountdown="${restId}" data-shape="${slotShape(left)}" role="timer" aria-label="${left}">${slotClockHtml(left, true)}</span>
       <span class="tb-sub"><b>Resting</b></span>`
    : `<span class="session-clock slot-clock" data-workout-timer data-shape="${slotShape(clock)}" role="timer" aria-label="${clock}">${slotClockHtml(clock)}</span>
       <span class="tb-sub">In progress${startedAt ? ' · '+startedAt : ''}</span>`;
  const fill = hold
    ? `<div class="tb-fill-wrap"><div class="tb-fill" data-holdfill="${hold.id}" style="width:${holdProgressPct(hold)}%"></div></div>`
    : resting
    ? `<div class="tb-fill-wrap"><div class="tb-fill" data-restfill="${restId}" style="width:${restProgressPct(restId)}%"></div></div>`
    : '';
  const bar = el(`
    <div class="session-bar timer-bar${hold?' holding':''}${resting?' resting':''}" data-pin-head>
      ${fill}
      <div class="tb-top">
        <button type="button" class="btn ghost" data-back aria-label="Back to home" style="padding:8px 10px;">${icon('chevronLeft',18)} Back</button>
        <span class="lbl">${center}</span>
        <button class="btn" data-finish style="padding:8px 14px;font-size:13px;min-height:44px;">Finish</button>
      </div>
    </div>`);
  q('[data-back]',bar).onclick = backToLanding;
  q('[data-finish]',bar).onclick = finishWorkout;
  if(hold) bar.appendChild(holdControlsEl());
  else {
    const lastRow = lastLoggedPlanRow(log);
    const lastEx = lastRow && getExercise(lastRow.exerciseId);
    bar.appendChild(restControlsEl(restId, lastRow, lastEx ? lastEx.name : ''));
  }
  return bar;
}
/* Rest start/extend/skip/expiry only change the timer bar. Swapping just the
   bar keeps focus (and the phone keyboard) in the set inputs. */
function refreshTimerBar(){
  const old = document.querySelector('[data-pin-head]');
  const log = activeWorkoutLog();
  if(!old || !log || VIEW!=='today' || homeScreen!=='workout') return;
  old.replaceWith(workoutTimerBarEl(log));
  paintWorkoutTimer();
}
/* The plan row of the exercise logged most recently, so Rest uses its rest time. */
function lastLoggedPlanRow(log){
  const last = log.sets[log.sets.length-1];
  if(!last) return null;
  return planForLog(log).find(r=>r.exerciseId===last.exerciseId) || null;
}
/* What the rest-complete alert points to: more sets of the exercise just
   logged, else the next unfinished exercise in plan order, else finishing. */
function restUpNextText(){
  const fallback = 'Rest complete – ready for your next set';
  const log = activeWorkoutLog();
  if(!log) return fallback;
  const plan = planForLog(log);
  const name = id=> (getExercise(id)||{}).name || 'your next exercise';
  const pending = r=> workingSetsInLogFor(log, r.exerciseId).length < (r.sets||0);
  const last = log.sets[log.sets.length-1];
  const row = last && plan.find(r=>r.exerciseId===last.exerciseId);
  if(row){
    const group = row.supersetId ? plan.filter(r=>r.supersetId===row.supersetId) : [row];
    if(group.some(pending)){
      if(group.length>1){
        const round = Math.min(...group.map(r=> workingSetsInLogFor(log, r.exerciseId).length)) + 1;
        return `Rest complete – ready for round ${round} of ${group.map(r=>name(r.exerciseId)).join(' + ')}`;
      }
      return `Rest complete – ready for set ${setsInLogFor(log, row.exerciseId).length+1} of ${name(row.exerciseId)}`;
    }
  }
  const next = plan.find(pending);
  if(next) return `Rest complete – next up: ${name(next.exerciseId)}`;
  return 'Rest complete – every exercise is done. Finish when you’re ready';
}
/* Starts the rest after a set (or a superset round) when Settings allows it.
   A superset rests for the longest rest among its members. Nothing starts
   once every exercise has hit its target sets. */
function autoStartRest(rows, name){
  const log = activeWorkoutLog();
  if(log && !planForLog(log).some(r=> workingSetsInLogFor(log, r.exerciseId).length < (r.sets||0))){
    stopRestTimer(WORKOUT_REST_ID);
    return;
  }
  if(!DATA.settings.restAutoStart || !rows.length) return;
  const seconds = Math.max(...rows.map(r=> restSecondsFor(r)));
  if(seconds>0) startRestTimer(WORKOUT_REST_ID, seconds, name);
}
/* After a plank or treadmill countdown ends or is stopped, rest uses the
   same rules as logging a set: only the last exercise of a superset rests,
   and nothing starts once every exercise has hit its target. */
function restAfterHold(set){
  const log = activeWorkoutLog();
  if(!log || !set) return;
  const plan = planForLog(log);
  const row = plan.find(r=> r.exerciseId===set.exerciseId);
  if(!row) return;
  const group = row.supersetId ? plan.filter(r=> r.supersetId===row.supersetId) : [row];
  if(group[group.length-1].exerciseId!==set.exerciseId) return;
  const ex = getExercise(set.exerciseId);
  autoStartRest(group, ex ? ex.name : '');
}

function workoutWarmupCard(log){
  const warmups = warmupsForLog(log);
  if(!warmups.length) return null;
  if(!Array.isArray(log.warmupDone)) log.warmupDone = [];
  const done = new Set(log.warmupDone);
  const mins = warmupsMinutes(warmups);
  const doneN = warmups.filter(w=> done.has(w.id)).length;
  const card = el(`
    <div class="card wu-workout-card">
      <div class="wu-workout-head">
        <p class="section-title" style="margin:0;">Warm-up</p>
        <span class="wu-workout-meta">${doneN}/${warmups.length}${mins?` · ~${mins} min`:''}</span>
      </div>
      <p class="faint small" style="margin:4px 0 8px;">Do these before your working sets. Tap to check off.</p>
      <div class="wu-workout-rows">
        ${warmups.map(w=>{
          const on = done.has(w.id);
          const dose = [w.detail, w.minutes?`~${w.minutes} min`:''].filter(Boolean).join(' · ');
          const howTo = resolveWarmupHowTo(w);
          return `<div class="wu-workout-row wu-howto-scope${on?' done':''}">
            <div class="wu-row-top">
              <button type="button" class="wu-workout-main" data-wu-id="${escapeHtml(w.id)}">
                <span class="wu-check" aria-hidden="true">${on ? icon('check',14) : ''}</span>
                <span class="wu-copy">
                  <span class="wu-title">${escapeHtml(w.title||'Warm-up')}</span>
                  ${dose ? `<span class="wu-dose">${escapeHtml(dose)}</span>` : ''}
                </span>
              </button>
              ${howTo ? warmupHowToButtonHtml() : ''}
            </div>
            ${warmupHowToBodyHtml(howTo)}
          </div>`;
        }).join('')}
      </div>
    </div>`);
  qa('[data-wu-id]',card).forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.dataset.wuId;
      const i = log.warmupDone.indexOf(id);
      if(i>=0) log.warmupDone.splice(i,1);
      else log.warmupDone.push(id);
      persistLog(log);
      saveData(DATA);
      renderApp();
    };
  });
  bindWarmupHowTo(card);
  return card;
}

function renderActiveWorkout(){
  const wrap = el(`<div></div>`);
  const log = todayLog();
  const plan = ensurePlanSnapshot(log);

  wrap.appendChild(workoutTimerBarEl(log));

  const wuCard = workoutWarmupCard(log);
  if(wuCard) wrap.appendChild(wuCard);

  if(!plan.length){
    wrap.appendChild(el(`
      <div class="card">
        <p class="muted">Scheduled rest day. Recovery is part of the plan — but you can still train if you want to.</p>
      </div>`));
  } else {
    wrap.appendChild(el(`<div class="section-title">Workout starts here</div>`));
    groupPlanRows(plan).forEach(g=>{
      if(g.type==='superset' && g.members.length>=2){
        const roundsDone = Math.min(...g.members.map(m=>workingSetsInLogFor(log, m.row.exerciseId).length));
        const roundsTarget = Math.max(...g.members.map(m=>m.row.sets||0));
        const groupIds = g.members.map(m=> m.row.exerciseId);
        const groupKey = `${log.date}:ss:${groupIds.join('+')}`;
        const groupStarted = startedCards.has(groupKey) || groupIds.some(id=> setsInLogFor(log, id).length);
        const box = el(`
          <div class="superset-wrap">
            <div class="ss-label"><span class="badge-ss">${icon('link',12)} Superset</span><button class="btn ghost" data-ungroup style="margin-left:auto;padding:2px 6px;font-size:11.5px;">Ungroup</button></div>
            <p class="ss-round">${roundsDone} of ${roundsTarget} round${roundsTarget===1?'':'s'} logged</p>
            <div class="ss-actions" style="margin-top:0;margin-bottom:12px;">
              ${groupStarted
                ? `<button class="btn add-set" data-log-round>${icon('plus',18)} Log round</button>`
                : `<button class="btn add-set start-ex" data-start-group>${icon('plus',18)} Start superset</button>`}
            </div>
            <div data-members></div>
          </div>`);
        const membersBox = q('[data-members]',box);
        g.members.forEach(m=> membersBox.appendChild(workoutExerciseCard(m.row, m.idx, log, {inSuperset:true, groupIds, groupStarted})));
        q('[data-ungroup]',box).onclick = ()=>{
          g.members.forEach(m=> m.row.supersetId = null);
          saveData(DATA); renderApp();
        };
        if(groupStarted) q('[data-log-round]',box).onclick = ()=> logSupersetRound(g.members, log);
        else q('[data-start-group]',box).onclick = ()=>{
          startedCards.add(groupKey);
          renderApp();
          scrollCardIntoView(groupIds[0]);
        };
        wrap.appendChild(box);
      } else {
        const members = g.type==='superset' ? g.members : [{row:g.row, idx:g.idx}];
        members.forEach(m=> wrap.appendChild(workoutExerciseCard(m.row, m.idx, log)));
      }
    });
  }

  if(log.sets.length){
    const work = muscleWorkCard(log.sets, 'Muscle work so far');
    if(work) wrap.appendChild(work);
  }

  if(plan.length>=2){
    const ssBox = el(`
      <div class="card flat" style="text-align:center;">
        <button class="btn secondary" data-create-ss style="width:100%;">🔗 Group exercises into a superset</button>
      </div>`);
    q('[data-create-ss]',ssBox).onclick = ()=> openSupersetPickerSheet(plan);
    wrap.appendChild(ssBox);
  }

  const addBox = el(`
    <div class="card flat" style="text-align:center;">
      <button class="btn dashed" data-add style="width:100%;">${icon('plus',16)} Add exercise</button>
      <p class="faint small" style="margin-top:8px;">Adds it to this workout. You can keep it on your split, or just for today.</p>
    </div>`);
  q('[data-add]',addBox).onclick = ()=> openExercisePicker({
    title:'Add exercise',
    exclude: plan.map(r=>r.exerciseId),
    onPick:(id)=> addExerciseToActiveWorkout(id)
  });
  wrap.appendChild(addBox);
  return wrap;
}

/* Pick 2-4 of today's exercises and group them into a superset on the fly. */
function openSupersetPickerSheet(plan){
  let picked = new Set();
  function draw(){
    openSheet({
      root:SHEET_ROOT.picker, zIndex:150, title:'Create a superset',
      build:(body, sheet)=>{
        body.appendChild(el(`<p class="faint small" style="margin-bottom:12px;">Pick 2-4 exercises from today's plan to group together.</p>`));
        plan.forEach((row,idx)=>{
          const ex = getExercise(row.exerciseId);
          const already = !!row.supersetId;
          const item = el(`
            <label class="row between" style="padding:10px 4px;border-bottom:1px solid var(--border);cursor:pointer;">
              <span>${escapeHtml(ex?ex.name:'?')} ${already?'<span class="faint small">(already grouped)</span>':''}</span>
              <input type="checkbox" style="width:auto;" ${picked.has(idx)?'checked':''}>
            </label>`);
          q('input',item).onchange = (e)=>{ e.target.checked ? picked.add(idx) : picked.delete(idx); draw(); };
          body.appendChild(item);
        });
        const canCreate = picked.size>=2 && picked.size<=4;
        const btn = el(`<button class="btn" ${canCreate?'':'disabled'} style="width:100%;margin-top:14px;">Create superset (${picked.size} selected)</button>`);
        btn.onclick = ()=>{
          if(!canCreate) return;
          const groupId = uid();
          plan.forEach((row,idx)=>{ if(picked.has(idx)) row.supersetId = groupId; });
          dissolveTinySupersets(plan);
          saveData(DATA);
          sheet.close();
          showToast('Superset created 🔗');
          renderApp();
        };
        body.appendChild(btn);
      }
    });
  }
  draw();
}

/* Keys are `${log.date}:${exerciseId}` so lists collapse and drafts reset each day. */
const openSetLists = new Set();
const setDrafts = new Map();
/* {setId, stage, backup}: the row loaded into the steppers, and the draft to restore afterwards. */
const editingSets = new Map();
/* Cards reopened by hand after being finished or left behind; cleared whenever a set is logged. */
const expandedCards = new Set();
/* Cards opened with "Start exercise" before their first set. Untouched cards hide the logger. */
const startedCards = new Set();

function defaultHoldSeconds(sample, planRow, minute){
  if(sample && sample.duration) return sample.duration;
  if(!minute) return 30;
  const plan = planRow && planRow.repsMin;
  if(plan && plan>=60) return plan;
  return 60;
}
/* Values in the card's inline logger. They carry over between sets and
   follow the planned load when the overload suggestion is accepted. */
function setDraftFor(key, planRow, sample, plannedWeight){
  let d = setDrafts.get(key);
  if(!d){
    const minute = isMinuteHold(getExercise(planRow.exerciseId));
    d = {
      weight: sample && sample.weight!=null ? sample.weight : 0,
      reps: sample && sample.reps ? sample.reps : (planRow.repsMin || 8),
      duration: defaultHoldSeconds(sample, planRow, minute),
      effort: (sample && sample.difficulty) || 'med',
      warmup: false,
    };
    setDrafts.set(key, d);
  }
  if(plannedWeight!=null && plannedWeight!==d.planW) d.weight = plannedWeight;
  d.planW = plannedWeight;
  return d;
}

function stepperHtml(field, value, unit, label, decimal){
  return `
    <div class="stp" data-field="${field}">
      <button type="button" class="stp-btn" data-dec aria-label="Less ${label}">${icon('minus',16)}</button>
      <label class="stp-val"><input type="number" inputmode="${decimal||field==='weight'?'decimal':'numeric'}" value="${value}" aria-label="${label}"><span>${unit}</span></label>
      <button type="button" class="stp-btn" data-inc aria-label="More ${label}">${icon('plus',16)}</button>
    </div>`;
}

/* Rows carry data-stage: '' for a whole normal set, otherwise the drop stage index.
   Drop stages after the first sit indented under their set. */
function todaySetRowsHtml(doneSets, metric, targetSets, showAll, editing){
  let working = 0;
  const isEditing = (set, stage)=> editing && editing.setId===set.id && editing.stage===stage;
  const rows = doneSets.map((set,i)=>{
    if(!set.isWarmup) working++;
    const bonus = !set.isWarmup && working > targetSets;
    const mainStage = set.isDropSet ? 0 : null;
    const mainVal = set.isDropSet ? setValueText({...set.stages[0], exerciseId:set.exerciseId}, metric) : setValueText(set, metric);
    let html = `
      <div class="ts-row${bonus?' bonus':''}${set.isWarmup?' warmup':''}${isEditing(set, mainStage)?' editing':''}" data-edit-set="${set.id}" data-stage="${mainStage==null?'':mainStage}" role="button" tabindex="0" aria-label="Edit set ${i+1}">
        <span class="ts-num">${i+1}</span>
        <span class="ts-val">${escapeHtml(mainVal)}${set.isPR?' <span class="trophy">🏆</span>':''}${set.intent==='strength'?' <span class="ts-tag">Strength</span>':''}${set.isDropSet?' <span class="ts-tag">Drop set</span>':''}</span>
        <span class="ts-feel">${set.isWarmup?'Warm-up':effortLabel(set.difficulty)}</span>
        <button type="button" class="ts-del" data-del-set="${set.id}" data-stage="" aria-label="Delete set ${i+1}">${icon('x',15)}</button>
      </div>`;
    if(set.isDropSet) set.stages.slice(1).forEach((stage,k)=>{
      html += `
        <div class="ts-row ts-sub${isEditing(set, k+1)?' editing':''}" data-edit-set="${set.id}" data-stage="${k+1}" role="button" tabindex="0" aria-label="Edit drop ${k+1} of set ${i+1}">
          <span class="ts-branch" aria-hidden="true"></span>
          <span class="ts-val">${escapeHtml(setValueText({...stage, exerciseId:set.exerciseId}, metric))}</span>
          <span class="ts-feel">Drop ${k+1}</span>
          <button type="button" class="ts-del" data-del-set="${set.id}" data-stage="${k+1}" aria-label="Delete drop ${k+1}">${icon('x',15)}</button>
        </div>`;
    });
    return html;
  });
  return (showAll ? rows : rows.slice(-2)).join('');
}

/* One exercise card inside an active workout. */
function workoutExerciseCard(planRow, index, log, opts){
  opts = opts || {};
  const ex = getExercise(planRow.exerciseId);
  if(!ex) return el(`<div></div>`);
  const metric = metricOf(ex);
  const status = progressionFor(planRow.exerciseId, planRow);
  const doneSets = setsInLogFor(log, planRow.exerciseId);
  const working = workingSetsInLogFor(log, planRow.exerciseId);
  const progressMsg = !working.length ? ''
    : working.length < planRow.sets ? `${planRow.sets-working.length} set${planRow.sets-working.length>1?'s':''} to go`
    : working.length === planRow.sets ? 'Target hit — great work!'
    : `Bonus set${working.length-planRow.sets>1?'s':''} — you went further`;
  const progressCls = working.length > planRow.sets ? 'hit-bonus-msg'
    : working.length >= planRow.sets ? 'hit-done-msg' : 'hit-progress-msg';
  const minuteHold = isMinuteHold(ex);
  const targetLine = minuteHold
    ? `${planRow.sets} set${planRow.sets===1?'':'s'} · ${formatHoldRange(planRow.repsMin, planRow.repsMax)}${planRow.rpe?` · RPE ${planRow.rpe}`:''}`
    : `${planRow.sets} set${planRow.sets===1?'':'s'}${metric!=='time' ? ` · ${formatRepRange(planRow.repsMin, planRow.repsMax)} reps` : ''}${planRow.rpe?` · RPE ${planRow.rpe}`:''}`;
  const lastBits = lastLoggedBits(planRow.exerciseId);
  const lastToday = doneSets.filter(s=>!s.isDropSet).slice(-1)[0];
  const sample = lastToday || (lastBits && lastBits.set);
  const planned = loadPlanFor(planRow.exerciseId);
  const listKey = `${log.date}:${planRow.exerciseId}`;
  const showAll = openSetLists.has(listKey);
  const draft = setDraftFor(listKey, planRow, sample, planned && planned.weight!=null ? planned.weight : null);
  const refText = lastBits ? `Last time ${lastBits.text}` : doneSets.length ? '' : 'Feeler set';

  let editing = editingSets.get(listKey) || null;
  let editSet = editing && doneSets.find(s=>s.id===editing.setId);
  if(editing && (!editSet || (editing.stage!=null && !(editSet.isDropSet && editSet.stages[editing.stage])))){
    Object.assign(draft, editing.backup);
    editingSets.delete(listKey);
    editing = null; editSet = null;
  }
  const editIndex = editSet ? doneSets.indexOf(editSet) + 1 : 0;
  const editTitle = !editing ? ''
    : editing.stage ? `Editing set ${editIndex} · drop ${editing.stage}`
    : `Editing set ${editIndex}`;
  const isDone = working.length >= planRow.sets;
  const lastLogged = log.sets[log.sets.length-1];
  const ownIds = opts.groupIds || [planRow.exerciseId];
  const movedOn = doneSets.length > 0 && !!lastLogged && !ownIds.includes(lastLogged.exerciseId);
  const collapsed = !editing && !expandedCards.has(listKey) && (isDone || movedOn);
  const started = doneSets.length>0 || !!editing || startedCards.has(listKey) || !!opts.groupStarted;
  const latest = doneSets[doneSets.length-1];
  const fresh = isFreshSet(listKey, latest);
  const freshDot = fresh && !latest.isWarmup ? working.length-1 : -1;
  // Reopening a card swaps in a look-ahead line, unless the last set left advice to act on.
  const reopened = expandedCards.has(listKey) ? (isDone ? 'bonus' : movedOn ? 'back' : null) : null;
  const plainFeedback = liveSetFeedback(planRow.exerciseId, planRow, doneSets, status);
  const feedback = reopened && plainFeedback && plainFeedback.tone!=='adjust'
    ? liveSetFeedback(planRow.exerciseId, planRow, doneSets, status, reopened) : plainFeedback;
  // An unanswered "Ready to add load" prompt stays until Use / Not today / Adjust.
  const readyPrompt = status.state==='ready';
  const showCoach = !!feedback && !(readyPrompt && !working.length) && !editing && (!collapsed || !movedOn);

  const todayBox = doneSets.length ? `
    <div class="today-sets">
      <div class="ts-head">
        <span class="ts-title">Today</span>
        ${doneSets.length>2 ? `<button type="button" class="ts-more" data-toggle-sets>${showAll?'Show less':`Show all ${doneSets.length}`}</button>` : ''}
      </div>
      ${todaySetRowsHtml(doneSets, metric, planRow.sets, showAll, editing)}
    </div>` : '';

  const wStep = loadStepFor(ex, planRow);
  const weightUnit = metric==='assisted' ? 'kg assist' : metric==='weighted_bw' ? 'kg added'
    : equipOf(ex)==='dumbbell' ? `${units()} each` : units();
  const weightName = metric==='assisted' ? 'assistance' : metric==='weighted_bw' ? 'added weight' : 'weight';
  const hold = minuteHold ? holdParts(draft.duration) : null;
  const steppers = metric==='time'
    ? (minuteHold
      ? stepperHtml('holdMin', hold.min, 'min', 'minutes') + stepperHtml('holdSec', hold.sec, 'sec', 'seconds')
      : stepperHtml('duration', draft.duration, 'sec', 'seconds'))
    : metric==='reps_only' ? stepperHtml('reps', draft.reps, 'reps', 'reps')
    : stepperHtml('weight', draft.weight, weightUnit, weightName)
      + stepperHtml('reps', draft.reps, 'reps', 'reps');
  const showWarmup = !(editSet && editSet.isDropSet);
  const nextSet = `
    <div class="next-set${editing?' is-editing':''}">
      <div class="ns-head">
        ${editing
          ? `<span class="ns-title">${editTitle}</span>`
          : `<span class="ns-title">Set ${doneSets.length+1}${refText ? `<span class="ns-ref"> · ${escapeHtml(refText)}</span>` : ''}</span>`}
        ${showWarmup ? `<label class="ns-wu"><input type="checkbox" data-wu ${draft.warmup?'checked':''}><span>Warm-up</span></label>` : ''}
      </div>
      <div class="ns-steps${(!minuteHold && metric==='time')||metric==='reps_only'?' single':''}">${steppers}</div>
      ${editing || showCoach ? '' : '<div class="ns-preview" data-preview aria-live="polite"></div>'}
      <div class="seg" role="radiogroup" aria-label="How hard did it feel">
        ${['easy','med','hard'].map(k=>`<button type="button" role="radio" data-eff="${k}" aria-checked="${draft.effort===k}" class="${draft.effort===k?'on':''}">${effortLabel(k)}</button>`).join('')}
      </div>
    </div>`;

  const card = el(`
    <div class="hit-card ${working.length>=planRow.sets ? 'done' : ''}${started ? '' : ' not-started'}" data-ex="${planRow.exerciseId}" style="--i:${index||0}">
      <div class="row between" style="align-items:flex-start;">
        <div class="row" style="align-items:flex-start;min-width:0;flex:1;">
          <span class="hit-icon">${icon('dumbbell',20)}</span>
          <div style="min-width:0;">
            <div class="name">${escapeHtml(ex.name)} ${working.length>=planRow.sets ? '<span class="done-badge">✓</span>' : ''}</div>
            <div class="row wrap" style="margin-top:6px;gap:6px;">
              <span class="hit-muscle">${escapeHtml(primaryOf(ex))}</span>
            </div>
            <div class="hit-target">${escapeHtml(targetLine)}</div>
          </div>
        </div>
        <button class="btn ghost" data-remove title="Remove from this workout" aria-label="Remove from this workout" style="padding:8px;min-width:44px;color:var(--red);">${icon('x',18)}</button>
        <button class="btn ghost" data-alternatives title="Alternatives" aria-label="Alternatives" style="padding:8px;min-width:44px;">${icon('lightbulb',18)}</button>
      </div>
      ${planRow.notes ? `<p class="faint small" style="margin-top:8px;">${escapeHtml(planRow.notes)}</p>` : ''}
      ${planRow.oftenDoneAsDropSet ? `<p class="hint-oftendrop">Often done as a drop set</p>` : ''}
      <div class="hit-prog">
        ${setDotsHtml(working.length, planRow.sets, freshDot)}
        ${progressMsg ? `<span class="${progressCls}">${progressMsg}</span>` : ''}
      </div>
      ${collapsed && !showCoach ? '' : '<div data-progression></div>'}
      ${todayBox}
      ${collapsed || !started ? '' : nextSet}
      ${!started && opts.inSuperset ? '' : `<div class="hit-actions">
        ${collapsed
          ? `<button type="button" class="btn secondary expand-btn" data-expand>${isDone ? `${icon('plus',18)} Add bonus set` : `Continue · set ${doneSets.length+1}`}</button>`
          : !started
          ? `<button type="button" class="btn add-set start-ex" data-start>${icon('plus',18)} Start exercise</button>`
          : editing
          ? `<button type="button" class="btn secondary drop-btn" data-cancel-edit>Cancel</button>
             <button type="button" class="btn add-set" data-update>${icon('check',18)} Update set</button>`
          : `<button type="button" class="btn secondary drop-btn" data-drop>Log drop set</button>
             <button type="button" class="btn add-set" data-log-now>${icon('plus',18)} Log set ${doneSets.length+1}</button>`}
      </div>`}
    </div>`);

  if(collapsed) q('[data-expand]',card).onclick = ()=>{ expandedCards.add(listKey); renderApp(); };
  const startBtn = q('[data-start]',card);
  if(startBtn) startBtn.onclick = ()=>{
    startedCards.add(listKey);
    renderApp();
    scrollCardIntoView(planRow.exerciseId);
  };
  if(!collapsed && (readyPrompt || !showCoach)) q('[data-progression]',card).appendChild(progressionBlock(status, planRow));
  if(showCoach) q('[data-progression]',card).appendChild(liveCoachBox(feedback, {
    listKey, draft, metric, latest, fresh, exerciseId:planRow.exerciseId, planRow, status, todaySets:doneSets
  }));

  qa('[data-toggle-sets]',card).forEach(node=> node.onclick = ()=>{
    if(showAll) openSetLists.delete(listKey); else openSetLists.add(listKey);
    renderApp();
  });
  const stageOf = node=> node.dataset.stage==='' ? null : Number(node.dataset.stage);
  const draftCopy = ()=> ({weight:draft.weight, reps:draft.reps, duration:draft.duration, effort:draft.effort, warmup:draft.warmup});
  const endEdit = ()=>{
    const cur = editingSets.get(listKey);
    if(cur) Object.assign(draft, cur.backup);
    editingSets.delete(listKey);
  };
  qa('[data-edit-set]',card).forEach(row=>{
    const open = ()=>{
      const set = doneSets.find(s=>s.id===row.dataset.editSet);
      if(!set) return;
      const stage = stageOf(row);
      const prev = editingSets.get(listKey);
      const backup = prev ? prev.backup : draftCopy();
      const src = stage!=null ? set.stages[stage] : set;
      Object.assign(draft, backup, pickSetValues(src), {effort:set.difficulty || 'med', warmup:!!set.isWarmup});
      editingSets.set(listKey, {setId:set.id, stage, backup});
      renderApp();
    };
    row.onclick = open;
    row.onkeydown = e=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); open(); } };
  });
  qa('[data-del-set]',card).forEach(btn=> btn.onclick = e=>{
    e.stopPropagation();
    const set = doneSets.find(s=>s.id===btn.dataset.delSet);
    if(!set) return;
    const stage = stageOf(btn);
    if(editing && editing.setId===set.id) endEdit();
    const snap = removeSetOrStage(set, stage);
    renderApp();
    showToast(stage==null ? 'Set deleted' : 'Drop removed', false, {label:'Undo', onClick:()=>{ restoreSet(snap); renderApp(); }});
  });

  const cancelBtn = q('[data-cancel-edit]',card);
  if(cancelBtn) cancelBtn.onclick = ()=>{ endEdit(); renderApp(); };
  const updateBtn = q('[data-update]',card);
  if(updateBtn) updateBtn.onclick = ()=>{
    const values = setValuesFrom(metric, draft);
    if(!validSetValues(values)){ showToast('Enter valid numbers'); return; }
    updateLoggedSet(editSet, editing.stage, values, draft.effort, draft.warmup, null);
    endEdit();
    const holdFinished = typeof editSet.holdStartedAt==='number' && holdRemainingMs(editSet)<=0;
    syncHoldToDuration(editSet);
    if(!holdFinished) showToast('Set updated');
    renderApp();
  };

  const dropBtn = q('[data-drop]',card);
  if(dropBtn) dropBtn.onclick = ()=>{
    const target = doneSets.filter(s=>!s.isWarmup).slice(-1)[0];
    if(!target){ showToast('Log a set first, then drop the weight'); return; }
    const values = setValuesFrom(metric, draft);
    if(!validSetValues(values)){ showToast('Enter valid numbers'); return; }
    if(!addDropStage(target, values, draft.effort)){ showToast('A drop set can have up to 5 stages'); return; }
    hapticTick(false);
    renderApp();
  };

  const previewEl = q('[data-preview]',card);
  const liveEl = q('[data-live-spotter]',card);
  const preview = (previewEl || liveEl) ? makeStepperPreview(planRow.exerciseId, planRow, doneSets, status) : null;
  const paintPreview = ()=>{
    if(!preview) return;
    const p = preview(draft);
    if(liveEl){
      const next = p.text || '';
      if(liveEl.textContent !== next){
        liveEl.textContent = next;
        liveEl.classList.remove('spot-live-tick');
        void liveEl.offsetWidth;
        liveEl.classList.add('spot-live-tick');
      }
      liveEl.classList.toggle('is-pr', p.tone==='pr');
    }
    if(previewEl){
      previewEl.textContent = p.text;
      previewEl.classList.toggle('is-pr', p.tone==='pr');
    }
  };
  const syncSteppersFromDraft = ()=>{
    qa('.stp',card).forEach(stp=>{
      const field = stp.dataset.field;
      const input = q('input',stp);
      if(!input) return;
      if(field==='holdMin' || field==='holdSec'){
        const parts = holdParts(draft.duration||0);
        input.value = field==='holdMin' ? parts.min : parts.sec;
      } else if(field==='weight') input.value = draft.weight;
      else if(field==='reps') input.value = draft.reps;
      else if(field==='duration') input.value = draft.duration;
      input.style.width = (Math.max(String(input.value).length, 1) + 0.6) + 'ch';
    });
    paintPreview();
  };
  paintPreview();

  const coachBox = q('.coach-box',card);
  if(coachBox && coachBox._spotChips){
    qa('[data-chip]',coachBox).forEach(btn=>{
      const chip = coachBox._spotChips.find(c=>c.key===btn.dataset.chip);
      if(!chip) return;
      btn.onclick = ()=>{
        chip.apply(draft);
        hapticTick(false);
        syncSteppersFromDraft();
      };
    });
  }

  const steps = {
    weight:{step:wStep, min:0, dp:2},
    reps:{step:1, min:1, dp:0},
    duration:{step:5, min:5, dp:0},
    holdMin:{step:1, min:0, dp:0, hold:'min'},
    holdSec:{step:1, min:0, max:59, dp:0, hold:'sec'},
  };
  const paintHoldSteppers = ()=>{
    const parts = holdParts(draft.duration||0);
    qa('.stp',card).forEach(stp=>{
      if(stp.dataset.field!=='holdMin' && stp.dataset.field!=='holdSec') return;
      const input = q('input',stp);
      input.value = stp.dataset.field==='holdMin' ? parts.min : parts.sec;
      input.style.width = (Math.max(String(input.value).length, 1) + 0.6) + 'ch';
    });
    paintPreview();
  };
  const applyHold = (min, sec)=>{
    let m = Math.max(0, Math.round(Number(min)||0));
    let s = Math.round(Number(sec)||0);
    if(isNaN(s) || s<0) s = 0;
    while(s>=60){ m += 1; s -= 60; }
    draft.duration = Math.max(0, m*60 + s);
    paintHoldSteppers();
  };
  qa('.stp',card).forEach(stp=>{
    const field = stp.dataset.field, cfg = steps[field];
    if(!cfg) return;
    const input = q('input',stp);
    const fit = ()=>{ input.style.width = (Math.max(String(input.value).length, 1) + 0.6) + 'ch'; };
    if(cfg.hold){
      const bump = (delta)=>{
        const parts = holdParts(draft.duration||0);
        if(cfg.hold==='min') applyHold(parts.min + delta, parts.sec);
        else {
          let next = parts.sec + delta;
          let mins = parts.min;
          if(next>59){ mins += 1; next = 0; }
          else if(next<0){
            if(mins>0){ mins -= 1; next = 59; }
            else next = 0;
          }
          applyHold(mins, next);
        }
      };
      fit();
      q('[data-dec]',stp).onclick = ()=> bump(-cfg.step);
      q('[data-inc]',stp).onclick = ()=> bump(cfg.step);
      input.oninput = ()=>{
        const parts = holdParts(draft.duration||0);
        if(cfg.hold==='min') applyHold(input.value, parts.sec);
        else applyHold(parts.min, input.value);
      };
      input.onchange = ()=>{
        const parts = holdParts(draft.duration||0);
        if(cfg.hold==='min') applyHold(input.value, parts.sec);
        else applyHold(parts.min, Math.min(59, Math.max(0, parseInt(input.value,10)||0)));
      };
      return;
    }
    const commit = (shown, clamp)=>{
      let n = roundTo(parseFloat(shown), cfg.dp);
      if(isNaN(n) || n<=0) n = cfg.min;
      else if(clamp) n = Math.max(cfg.min, n);
      draft[field] = n;
      input.value = draft[field];
      fit(); paintPreview();
    };
    fit();
    q('[data-dec]',stp).onclick = ()=> commit((parseFloat(input.value)||0) - cfg.step, true);
    q('[data-inc]',stp).onclick = ()=> commit((parseFloat(input.value)||0) + cfg.step, true);
    input.oninput = ()=>{
      const v = parseFloat(input.value);
      if(isNaN(v)) return;
      draft[field] = v;
      fit(); paintPreview();
    };
    input.onchange = ()=> commit(input.value, false);
  });
  qa('[data-eff]',card).forEach(btn=> btn.onclick = ()=>{
    draft.effort = btn.dataset.eff;
    qa('[data-eff]',card).forEach(b=>{ const on = b===btn; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  });
  const wu = q('[data-wu]',card);
  if(wu) wu.onchange = ()=>{ draft.warmup = wu.checked; paintPreview(); };

  const logNow = q('[data-log-now]',card);
  if(logNow) logNow.onclick = ()=>{
    const values = setValuesFrom(metric, draft);
    if(!validSetValues(values)){ showToast('Enter valid numbers'); return; }
    const before = planForLog(log).indexOf(planRow);
    const set = logNormalSet(planRow.exerciseId, values, draft.effort, draft.warmup, null);
    draft.warmup = false;
    expandedCards.clear();
    const holding = startHoldIfMinute([set]);
    celebrateSet(set, !set.isWarmup && working.length+1===planRow.sets);
    renderApp();
    if(planForLog(log).indexOf(planRow) !== before) scrollCardIntoView(planRow.exerciseId);
    if(holding) return;
    // Inside a superset only the last member rests; the others go straight to the next exercise.
    const groupIds = opts.groupIds;
    if(!groupIds) autoStartRest([planRow], ex.name);
    else if(groupIds[groupIds.length-1]===planRow.exerciseId){
      const rows = planForLog(log).filter(r=> groupIds.includes(r.exerciseId));
      autoStartRest(rows, ex.name);
    }
  };
  const removeBtn = q('[data-remove]',card);
  if(removeBtn) removeBtn.onclick = ()=> removeExerciseFromActiveWorkout(log, planRow.exerciseId);
  const alt = q('[data-alternatives]',card);
  if(alt) alt.onclick = ()=> openAlternativesSheet({rows:planForLog(log), index, loggedSets:doneSets.length, fromSession:true, onChange:()=>{ saveData(DATA); renderApp(); }});
  return card;
}

function guideInfoBtnHtml(){
  return `<button type="button" class="sb-info" data-info aria-label="How this works">${icon('info',15)}</button>`;
}
function bindGuideInfo(node, section){
  const btn = q('[data-info]',node);
  if(btn) btn.onclick = e=>{ e.stopPropagation(); openTrainingGuideSheet(section); };
}
function overloadProgressHtml(status){
  if(!status || !status.progressText) return '';
  return `
    <div class="sb-progress">
      <span>${escapeHtml(status.progressText)}</span>
      <div class="meter"><span style="width:${Math.min(100, Math.round(status.qualifyingSessions/status.sessionsRequired*100))}%"></span></div>
    </div>`;
}

function scrollCardIntoView(exerciseId){
  const node = document.querySelector(`.hit-card[data-ex="${exerciseId}"]`);
  if(node) node.scrollIntoView({behavior:'smooth', block:'center'});
}

/* Per-card coach memory, keyed like setDrafts. A line keeps its wording across
   re-renders of the same set, and a wording is not reused twice in a row. */
const SPOTTER_LABEL = `<div class="sb-label">Spotter's suggestion</div>`;
const coachLines = new Map();
const coachVariantUsed = new Map();
const coachAnimated = new Map();
function pickCoachLine(listKey, setId, fb){
  const sig = `${setId}:${fb.key}`;
  const prev = coachLines.get(listKey);
  if(prev && prev.sig===sig) return prev.text;
  const count = fb.headlines.length;
  let i = Math.floor(Math.random()*count);
  if(count>1 && i===coachVariantUsed.get(fb.key)) i = (i+1) % count;
  coachVariantUsed.set(fb.key, i);
  coachLines.set(listKey, {sig, text:fb.headlines[i]});
  return fb.headlines[i];
}
/* True once per newly logged set, so later renders and app reloads don't replay the animation. */
function isFreshSet(listKey, set){
  if(!set || coachAnimated.get(listKey)===set.id) return false;
  coachAnimated.set(listKey, set.id);
  return Date.now() - (set.ts||0) < 10000;
}

function spotProgressMeterHtml(progress){
  if(!progress || !(progress.setsNeeded>0)) return '';
  const slots = Array.from({length:progress.setsNeeded},(_,i)=>
    `<span class="spot-slot${i<progress.atTarget?' on':''}" aria-hidden="true"></span>`).join('');
  return `
    <div class="spot-meter">
      <div class="spot-meter-label">Toward more weight · ${progress.atTarget} of ${progress.setsNeeded} at ${progress.repsTarget}+</div>
      <div class="spot-slots" role="img" aria-label="${progress.atTarget} of ${progress.setsNeeded} sets at ${progress.repsTarget} or more reps">${slots}</div>
    </div>`;
}
function liveCoachBox(fb, {listKey, draft, metric, latest, fresh, exerciseId, planRow, status, todaySets}){
  const text = pickCoachLine(listKey, latest.id, fb);
  const applied = fb.nextWeight!=null && Math.abs((draft.weight||0) - fb.nextWeight) < 0.001;
  const label = fb.nextWeight!=null ? escapeHtml(loadLabel(fb.nextWeight, metric)) : '';
  const vol = fb.volume && fb.volume.last>0 && fb.volume.today>0 ? fb.volume : null;
  const pct = vol ? Math.round(vol.today/vol.last*100) : 0;
  const chips = spotterChipActions(planRow, todaySets||[], status||{}, metric);
  const allDone = planRow && (todaySets||[]).filter(s=>!s.isWarmup && !s.isDropSet).length >= (planRow.sets||0);
  const showChips = !allDone && !applied;
  const box = el(`
    <div class="suggest-box coach-box tone-${fb.tone}${fresh?' coach-pop':''}" aria-live="polite">
      ${guideInfoBtnHtml()}
      ${SPOTTER_LABEL}
      <div class="sb-line">${escapeHtml(applied ? `Next set at ${loadLabel(fb.nextWeight, metric)}` : text)}</div>
      ${fb.note ? `<div class="lb-note">${escapeHtml(fb.note)}</div>` : ''}
      ${spotProgressMeterHtml(fb.progress)}
      <div class="spot-live" data-live-spotter aria-live="polite"></div>
      ${fb.nextWeight!=null && !applied ? `<button type="button" class="btn lb-use" data-use>Use ${label}</button>` : ''}
      ${showChips && chips.length ? `<div class="spot-chips" data-spot-chips>${chips.map(c=>
        `<button type="button" class="spot-chip" data-chip="${c.key}">${escapeHtml(c.label)}</button>`).join('')}</div>` : ''}
      ${vol ? `
        <div class="sb-progress">
          <span>Volume ${vol.today.toLocaleString()} / ${vol.last.toLocaleString()} ${units()} last time${pct>100 ? ` (+${pct-100}%)` : ''}</span>
          <div class="meter"><span style="width:${Math.min(100, pct)}%"></span></div>
        </div>` : ''}
    </div>`);
  const use = q('[data-use]',box);
  if(use) use.onclick = ()=>{
    draft.weight = fb.nextWeight;
    setLoadPlan(exerciseId, {weight:fb.nextWeight, deferred:false});
    expandedCards.add(listKey);
    hapticTick(false);
    renderApp();
  };
  box._spotChips = chips;
  bindGuideInfo(box, 'overload');
  return box;
}

/* "Too heavy" advice: reps fell below the range, so suggest a lighter load the
   steppers can jump to. `status` is only passed for the next-session version. */
function lowerAdviceBox({exerciseId, weight, applied, headline, note, status, metric}){
  const label = escapeHtml(loadLabel(weight, metric || (status && status.metric)));
  const box = el(`
    <div class="suggest-box lower-box">
      ${guideInfoBtnHtml()}
      ${SPOTTER_LABEL}
      <div class="sb-line">${escapeHtml(headline)}</div>
      <div class="lb-note">${escapeHtml(note)}</div>
      ${applied ? '' : `<button type="button" class="btn lb-use" data-use>Use ${label}</button>`}
      ${overloadProgressHtml(status)}
    </div>`);
  const use = q('[data-use]',box);
  if(use) use.onclick = ()=>{
    setLoadPlan(exerciseId, {weight, deferred:false});
    showToast(`Steppers set to ${loadLabel(weight, metric || (status && status.metric))}`);
    renderApp();
  };
  bindGuideInfo(box, 'lower');
  return box;
}

/* The interactive part of progressive overload: accept / not today / adjust. */
function progressionBlock(status, planRow){
  const box = el(`<div></div>`);
  if(status.state==='lower'){
    box.appendChild(lowerAdviceBox({exerciseId:status.exerciseId, weight:status.lowerWeight, applied:false,
      headline:status.headline, note:status.note, status}));
    return box;
  }
  if(status.state==='ready'){
    const prompt = el(`
      <div class="prompt-box">
        ${guideInfoBtnHtml()}
        ${SPOTTER_LABEL}
        <div class="ph">🎯 ${escapeHtml(status.headline)}</div>
        ${status.note?`<div class="pn">${escapeHtml(status.note)}</div>`:''}
        <div class="row">
          <button class="btn" data-accept>Use ${escapeHtml(loadLabel(status.suggestedWeight, status.metric))}</button>
          <button class="btn secondary" data-defer>Not today</button>
          <button class="btn secondary" data-adjust>Adjust</button>
        </div>
      </div>`);
    q('[data-accept]',prompt).onclick = ()=>{
      setLoadPlan(status.exerciseId, {weight:status.suggestedWeight, deferred:false});
      showToast(`Locked in — ${loadLabel(status.suggestedWeight, status.metric)} today 💪`);
      renderApp();
    };
    q('[data-defer]',prompt).onclick = ()=>{
      setLoadPlan(status.exerciseId, {deferred:true, weight:null});
      showToast('No problem — same weight today.');
      renderApp();
    };
    q('[data-adjust]',prompt).onclick = ()=> openLoadAdjustSheet(status);
    bindGuideInfo(prompt, 'overload');
    box.appendChild(prompt);
    return box;
  }

  const adjustable = status.state==='accepted' || status.state==='deferred';
  const suggest = el(`
    <div class="suggest-box">
      ${guideInfoBtnHtml()}
      ${SPOTTER_LABEL}
      <div class="sb-line">${escapeHtml(status.headline)}${status.note?' — '+escapeHtml(status.note):''}</div>
      ${adjustable ? `<button type="button" class="sb-change" data-change>Change today's weight</button>` : overloadProgressHtml(status)}
    </div>`);
  const change = q('[data-change]',suggest);
  if(change) change.onclick = ()=> openLoadAdjustSheet(status);
  bindGuideInfo(suggest, status.state==='no_history' ? 'overload' : 'qualifying');
  box.appendChild(suggest);
  return box;
}

/* Logs one set per superset member from each card's current stepper values. */
function logSupersetRound(members, log){
  const keyOf = m=> `${log.date}:${m.row.exerciseId}`;
  if(members.some(m=> editingSets.has(keyOf(m)))){ showToast('Finish editing first'); return; }
  const entries = [];
  for(const m of members){
    const ex = getExercise(m.row.exerciseId);
    const draft = setDrafts.get(keyOf(m));
    if(!ex || !draft) continue;
    const values = setValuesFrom(metricOf(ex), draft);
    if(!validSetValues(values)){ showToast(`Check the numbers for ${ex.name}`); return; }
    entries.push({exerciseId:ex.id, values, draft});
  }
  if(!entries.length) return;
  const logged = entries.map(({exerciseId, values, draft})=>{
    const set = logNormalSet(exerciseId, values, draft.effort, draft.warmup, null);
    draft.warmup = false;
    return set;
  });
  expandedCards.clear();
  celebrateSets(logged);
  renderApp();
  if(startHoldIfMinute(logged)) return;
  const names = members.map(m=> (getExercise(m.row.exerciseId)||{}).name).filter(Boolean);
  autoStartRest(members.map(m=>m.row), names.join(' + '));
}

function openCelebrationSheet(log){
  const totalSets = workingSetCount(log.sets);
  const volume = Math.round(log.sets.reduce((sum,s)=>sum+setVolumeLoad(s),0));
  const prSets = log.sets.filter(s=>s.isPR);
  const prCount = prSets.length;
  const topMuscles = muscleWorkForSets(log.sets).slice(0,3).map(r=>`${r.muscle} ${roundTo(r.effectiveSets)}`).join(' · ');
  const exerciseCount = new Set(log.sets.filter(s=>!s.isWarmup).map(s=>s.exerciseId)).size;
  const dateNice = parseDateKey(log.date).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
  // Best PR per exercise: the latest PR set of each one.
  const prByExercise = new Map();
  prSets.forEach(s=> prByExercise.set(s.exerciseId, s));
  const prRows = [...prByExercise.values()].map(s=>{
    const ex = getExercise(s.exerciseId);
    return ex ? {name:ex.name, value:formatPrValue(s, metricOf(ex))} : null;
  }).filter(Boolean);
  const shownPrs = prRows.slice(0,3);
  openSheet({
    centered:true,
    build:(body, sheet)=>{
      body.appendChild(el(`
        <div class="done-card">
          <div class="done-hero">
            <div class="done-check">${icon('check',30)}</div>
            <div class="done-kicker">Workout complete · ${escapeHtml(dateNice)}</div>
            <div class="done-day">${escapeHtml(planNameForLog(log))} day</div>
          </div>
          <div class="done-time">
            <div class="val">${formatDuration(sessionDurationMs(log))}</div>
            <div class="lbl">Time trained</div>
          </div>
          <div class="done-stats">
            <div><div class="val">${totalSets}</div><div class="lbl">Sets</div></div>
            <div><div class="val">${volume}<span class="unit">${units()}</span></div><div class="lbl">Volume</div></div>
            <div class="${prCount?'hot':''}"><div class="val">${prCount}</div><div class="lbl">PRs</div></div>
            <div><div class="val">${exerciseCount}</div><div class="lbl">Exercises</div></div>
          </div>
          ${shownPrs.length ? `<div class="done-prs">
            ${shownPrs.map(p=>`<div class="done-pr">
              <span class="ic">${icon('trophy',16)}</span>
              <span class="nm">${escapeHtml(p.name)}</span>
              <span class="pv">${escapeHtml(p.value)}</span>
            </div>`).join('')}
            ${prRows.length>shownPrs.length ? `<div class="done-pr-more">+${prRows.length-shownPrs.length} more</div>` : ''}
          </div>` : ''}
          <p class="done-line">${escapeHtml(appreciationLine(totalSets, prCount))}</p>
          ${topMuscles?`<p class="done-muscles">${escapeHtml(topMuscles)} effective sets</p>`:''}
          <div class="done-streak">${icon('flame',14)} ${currentStreakDays()} day streak</div>
          <div class="done-actions">
            <button class="btn secondary" data-reopen>${icon('reopen',18)} Reopen</button>
            <button class="btn" data-summary>View summary</button>
          </div>
        </div>`));
      q('[data-reopen]',body).onclick = ()=> reopenWorkout(log);
      q('[data-summary]',body).onclick = ()=>{ sheet.close(); openShareSummarySheet(log); };
      const modal = q('.modal', sheet.node);
      requestAnimationFrame(()=>{ modal.scrollTop = 0; });
    },
    onClosed: renderApp
  });
}

function openShareSummarySheet(log){
  const totalSets = workingSetCount(log.sets);
  const volume = Math.round(log.sets.reduce((sum,s)=>sum+setVolumeLoad(s),0));
  const prCount = log.sets.filter(s=>s.isPR).length;
  const dur = sessionDurationMs(log);
  const minutes = dur==null ? null : Math.max(1, Math.round(dur/60000));
  const dateNice = parseDateKey(log.date).toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'});
  const names = [...new Set(log.sets.map(s=>(getExercise(s.exerciseId)||{}).name).filter(Boolean))];
  const thisWeek = weeklyVolumeLoad(0), lastWeek = weeklyVolumeLoad(1);
  const change = lastWeek>0 ? Math.round((thisWeek-lastWeek)/lastWeek*100) : (thisWeek>0?100:0);
  const changeText = (!lastWeek && !thisWeek) ? ''
    : (change>=0 ? `▲ ${change}% volume vs prior 7 days` : `▼ ${Math.abs(change)}% volume vs prior 7 days`);
  openSheet({
    title:'Workout summary',
    onClosed: renderApp,
    build:(body)=>{
      body.appendChild(el(`
        <div class="share-card">
          <div class="share-brand">${escapeHtml(APP_NAME)}</div>
          <div class="share-title">Workout Complete 💪</div>
          <div class="share-date">${escapeHtml(dateNice)} · ${escapeHtml(planNameForLog(log))} day</div>
          <div class="share-stats">
            <div><div class="val">${totalSets}</div><div class="lbl">Sets</div></div>
            <div><div class="val">${roundTo(totalEffectiveSets(log.sets))}</div><div class="lbl">Effective sets</div></div>
            <div><div class="val">${volume}</div><div class="lbl">Volume (${units()})</div></div>
            <div><div class="val">${minutes!==null?minutes:'—'}</div><div class="lbl">Minutes</div></div>
            <div><div class="val">${prCount}</div><div class="lbl">PRs</div></div>
            <div><div class="val">${names.length}</div><div class="lbl">Exercises</div></div>
          </div>
          ${changeText ? `<div class="share-streak" style="margin-bottom:14px;">${changeText}</div>` : ''}
          ${names.length ? `<div class="share-exlist">${names.map(escapeHtml).join('<br>')}</div>` : ''}
          <div class="share-quote">${escapeHtml(appreciationLine(totalSets, prCount))}</div>
          <div class="share-streak">🔥 ${currentStreakDays()} day streak</div>
        </div>`));
      const work = muscleWorkCard(log.sets, 'Muscle work');
      if(work){ work.style.marginTop='14px'; body.appendChild(work); }
    }
  });
}

