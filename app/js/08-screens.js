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

function renderApp(){
  maybeAfkCloseWorkout();
  destroyHistoryCharts();
  afterHistoryRender = [];
  const app = document.getElementById('app');
  const dateLabel = new Date().toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
  app.innerHTML = '';
  const shell = el(`
    <div class="topbar">
      <div class="brand">${logoMarkHtml()}<span class="word">TrackA'<em>gain</em></span></div>
      <div class="topbar-meta">
        <span class="topbar-date">${escapeHtml(dateLabel)}</span>
        <span class="streak-pill">${icon('flame',14)} ${currentStreakDays()}</span>
      </div>
    </div>`);
  app.appendChild(shell);
  const screen = el(`<div></div>`);
  screen.appendChild((SCREENS[VIEW] || SCREENS.today)());
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

/* Workout clock. elapsedMs is the source of truth; one interval only repaints.
   Time while the WebView is hidden or suspended is not counted. */
let workoutTicker = null;
let workoutSeenAt = 0;
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
function discountSuspendedGap(){
  const now = Date.now();
  if(!workoutSeenAt){ workoutSeenAt = now; return; }
  const gap = now - workoutSeenAt;
  workoutSeenAt = now;
  if(gap<=3000) return;
  const log = activeWorkoutLog();
  if(!log || !log.timerRunningSince) return;
  log.timerRunningSince += gap - 1000;
  if(log.timerRunningSince>now) log.timerRunningSince = now;
}
function captureActiveWorkoutElapsed(){
  discountSuspendedGap();
  const log = activeWorkoutLog();
  if(!log || !log.timerRunningSince) return;
  if(document.hidden){ freezeWorkoutElapsed(log); return; }
  log.elapsedMs = workoutElapsedMs(log);
  log.timerRunningSince = Date.now();
}
function paintWorkoutTimer(){
  const node = document.querySelector('[data-workout-timer]');
  if(!node) return;
  const log = activeWorkoutLog();
  if(!log) return;
  node.textContent = formatWorkoutClock(workoutElapsedMs(log));
}
function tickWorkoutTimer(){
  if(maybeAfkCloseWorkout()){ renderApp(); return; }
  discountSuspendedGap();
  const log = activeWorkoutLog();
  if(!log || document.hidden){
    if(log) freezeWorkoutElapsed(log);
    clearWorkoutTicker();
    if(log) saveData(DATA);
    paintWorkoutTimer();
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
  workoutSeenAt = Date.now();
  workoutSaveAt = Date.now();
  workoutTicker = setInterval(tickWorkoutTimer, 1000);
}
function syncWorkoutTimer(){
  const log = activeWorkoutLog();
  if(!log || document.hidden){
    if(log && log.timerRunningSince){
      discountSuspendedGap();
      freezeWorkoutElapsed(log);
      clearWorkoutTicker();
      saveData(DATA);
    } else clearWorkoutTicker();
    return;
  }
  if(!log.timerRunningSince) log.timerRunningSince = Date.now();
  ensureWorkoutTicker();
  paintWorkoutTimer();
}
function pauseWorkoutForBackground(){
  const log = activeWorkoutLog();
  if(!log){ clearWorkoutTicker(); return; }
  discountSuspendedGap();
  const changed = !!log.timerRunningSince;
  freezeWorkoutElapsed(log);
  clearWorkoutTicker();
  if(changed) saveData(DATA);
  paintWorkoutTimer();
}
function stopWorkoutClock(log){
  discountSuspendedGap();
  freezeWorkoutElapsed(log);
  clearWorkoutTicker();
}

const AFK_CLOSE_MS = 3 * 60 * 60 * 1000;
function lastWorkoutActivityAt(log){
  let t = log.startedAt || 0;
  (log.sets||[]).forEach(s=>{ if(s.ts && s.ts>t) t = s.ts; });
  return t;
}
/* Save and close a stale session. Last set (or start) older than 3 hours. */
function maybeAfkCloseWorkout(){
  const log = activeWorkoutLog();
  if(!log) return false;
  const last = lastWorkoutActivityAt(log);
  if(!last || Date.now() - last < AFK_CLOSE_MS) return false;
  const now = Date.now();
  discountSuspendedGap();
  if(log.timerRunningSince){
    log.elapsedMs = Math.max(0, workoutElapsedMs(log, now) - (now - last));
    log.timerRunningSince = null;
  }
  clearWorkoutTicker();
  log.endedAt = last;
  log.active = false;
  log.completed = true;
  homeScreen = 'landing';
  saveData(DATA);
  showToast('Workout saved after 3 hours away');
  return true;
}

/* ------------------------------ Today ------------------------------ */
function startWorkout(){
  const log = persistLog(todayLog());
  // Copy the split as it is now. A plan left over from before Start
  // would ignore split edits made while no workout was running.
  if(!log.startedAt) log.plan = null;
  absorbQueuedExercises(log);
  log.active = true;
  if(!log.startedAt) log.startedAt = Date.now();
  if(typeof log.elapsedMs!=='number' || !isFinite(log.elapsedMs) || log.elapsedMs<0) log.elapsedMs = 0;
  log.timerRunningSince = null;
  log.completed = false;
  homeScreen = 'workout';
  VIEW = 'today';
  saveData(DATA);
  renderApp();
}
function reopenWorkout(log){
  absorbQueuedExercises(log);
  log.active = true; log.completed = false; log.endedAt = null;
  if(typeof log.elapsedMs!=='number' || !isFinite(log.elapsedMs) || log.elapsedMs<0) log.elapsedMs = 0;
  log.timerRunningSince = null;
  homeScreen = 'workout';
  VIEW = 'today';
  saveData(DATA);
  closeSheets();
  renderApp();
}
function finishWorkout(){
  const log = todayLog();
  confirmAction("Finish and save today's workout?", 'Finish', ()=>{
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
    const names = plan.map(row=>{
      const name = (getExercise(row.exerciseId)||{}).name || '?';
      return setsInLogFor(log,row.exerciseId).length ? `<span class="done-badge">${escapeHtml(name)} ✓</span>` : escapeHtml(name);
    }).join(', ');
    const canEditSplit = !Array.isArray(log.plan);
    const card = el(`
      <div class="card">
        <div class="row between">
          <p class="section-title" style="margin:0;">Today's hit list</p>
          ${canEditSplit ? '<button class="btn ghost" data-edit>Edit day →</button>' : ''}
        </div>
        <p class="small hit-list-names">${names}</p>
      </div>`);
    const editBtn = q('[data-edit]',card);
    if(editBtn) editBtn.onclick = ()=> openDayEditor(weekdayKey());
    wrap.appendChild(card);
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
            <div class="faint small">${last.sets.length} set${last.sets.length>1?'s':''} logged</div>
          </div>
          ${last.sets.some(s=>s.isPR) ? '<span class="trophy" style="font-size:20px;">🏆</span>' : ''}
        </div>
      </div>`));
  }
  return wrap;
}

function renderActiveWorkout(){
  const wrap = el(`<div></div>`);
  const log = todayLog();
  const plan = ensurePlanSnapshot(log);

  const thisWeek = weeklyVolumeLoad(0), lastWeek = weeklyVolumeLoad(1);
  const change = lastWeek>0 ? Math.round((thisWeek-lastWeek)/lastWeek*100) : (thisWeek>0?100:0);
  const changeText = (!lastWeek && !thisWeek) ? 'Log a set to start tracking growth'
    : (change>=0 ? `▲ ${change}% volume vs prior 7 days` : `▼ ${Math.abs(change)}% volume vs prior 7 days`);
  const prCount = log.sets.filter(s=>s.isPR).length;
  const startedAt = log.startedAt ? new Date(log.startedAt).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}) : '';
  const clock = formatWorkoutClock(workoutElapsedMs(log));

  const bar = el(`
    <div class="session-bar">
      <button type="button" class="btn ghost" data-back aria-label="Back to home" style="padding:8px 10px;">${icon('chevronLeft',18)} Back</button>
      <span class="lbl">
        <span class="session-clock" data-workout-timer>${clock}</span>
        <span style="display:block;font-size:11px;font-weight:600;color:var(--text-dim);">In progress${startedAt ? ' · '+startedAt : ''}</span>
      </span>
      <button class="btn" data-finish style="padding:8px 14px;font-size:13px;min-height:44px;">Finish</button>
    </div>`);
  q('[data-back]',bar).onclick = backToLanding;
  q('[data-finish]',bar).onclick = finishWorkout;
  wrap.appendChild(bar);

  const restWrap = el(`<div class="workout-rest"></div>`);
  restWrap.appendChild(restTimers[WORKOUT_REST_ID]
    ? restCardEl(WORKOUT_REST_ID)
    : restStartRowEl({exerciseId:WORKOUT_REST_ID}, ''));
  wrap.appendChild(restWrap);

  wrap.appendChild(el(`
    <div class="card">
      <p class="faint small">Current split · ${escapeHtml(activeSplit().label)} · ${escapeHtml(planNameForLog(log))} day</p>
      <div style="margin-top:10px;">${statGridHtml([
        {value:log.sets.length, label:'Sets today'},
        {value:roundTo(totalEffectiveSets(log.sets)), label:'Effective sets'},
        {value:prCount ? '🏆 '+prCount : Math.round(thisWeek), label:prCount ? 'PRs today' : 'Week volume'}
      ])}</div>
      <p class="faint small" style="margin-top:10px;">${changeText}</p>
    </div>`));

  if(!plan.length){
    wrap.appendChild(el(`
      <div class="card">
        <p class="muted">Scheduled rest day. Recovery is part of the plan — but you can still train if you want to.</p>
      </div>`));
  } else {
    wrap.appendChild(el(`<div class="section-title">Today's plan</div>`));
    groupPlanRows(plan).forEach(g=>{
      if(g.type==='superset' && g.members.length>=2){
        const roundsDone = Math.min(...g.members.map(m=>workingSetsInLogFor(log, m.row.exerciseId).length));
        const roundsTarget = Math.max(...g.members.map(m=>m.row.sets||0));
        const canRepeat = g.members.every(m=>setsInLogFor(log, m.row.exerciseId).length);
        const box = el(`
          <div class="superset-wrap">
            <div class="ss-label"><span class="badge-ss">${icon('link',12)} Superset</span><button class="btn ghost" data-ungroup style="margin-left:auto;padding:2px 6px;font-size:11.5px;">Ungroup</button></div>
            <p class="ss-round">${roundsDone} of ${roundsTarget} round${roundsTarget===1?'':'s'} logged</p>
            <div class="ss-actions" style="margin-top:0;margin-bottom:12px;">
              ${canRepeat ? '<button class="btn secondary" data-same-round>Same round</button>' : ''}
              <button class="btn add-set" data-log-round>${icon('plus',18)} Log round</button>
            </div>
            <div data-members></div>
          </div>`);
        const membersBox = q('[data-members]',box);
        g.members.forEach(m=> membersBox.appendChild(workoutExerciseCard(m.row, m.idx, log, {inSuperset:true})));
        q('[data-ungroup]',box).onclick = ()=>{
          g.members.forEach(m=> m.row.supersetId = null);
          saveData(DATA); renderApp();
        };
        q('[data-log-round]',box).onclick = ()=> openSupersetLogSheet(g.members);
        const sameRound = q('[data-same-round]',box);
        if(sameRound) sameRound.onclick = ()=> repeatSupersetRound(g.members);
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
      <button class="btn secondary" data-add style="width:100%;">＋ Add exercise</button>
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
  const targetLine = `${planRow.sets} sets${metric!=='time' ? ` · ${planRow.repsMin}–${planRow.repsMax} reps` : ''}${planRow.rpe?` · RPE ${planRow.rpe}`:''}`;
  const lastBits = lastLoggedBits(planRow.exerciseId);
  const lastToday = doneSets.filter(s=>!s.isDropSet).slice(-1)[0];
  const sample = lastToday || (lastBits && lastBits.set);
  const planned = loadPlanFor(planRow.exerciseId);
  const weightVal = (metric==='weight_reps'||metric==='assisted')
    ? (planned && planned.weight!=null ? planned.weight : (sample && sample.weight!=null ? sample.weight : '—'))
    : (metric==='time' ? (sample && sample.duration!=null ? sample.duration+'s' : '—') : '—');
  const repsVal = metric==='time' ? 'hold' : (sample && sample.reps!=null ? sample.reps : `${planRow.repsMin}–${planRow.repsMax}`);
  const feelVal = effortLabel(sample && sample.difficulty ? sample.difficulty : 'med');
  const openLog = ()=> openLogSetSheet({exerciseId:planRow.exerciseId, planRow});

  const card = el(`
    <div class="hit-card ${working.length>=planRow.sets ? 'done' : ''}" style="--i:${index||0}">
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
      ${setDotsHtml(working.length, planRow.sets)}
      ${progressMsg ? `<p class="small ${progressCls}">${progressMsg}</p>` : ''}
      <div class="hit-last"><strong>Last logged</strong>${lastToday ? `${escapeHtml(setValueText(lastToday, metric))} · Today` : (lastBits ? `${escapeHtml(lastBits.text)} · ${escapeHtml(relativeDay(lastBits.date))}` : 'No previous set yet')}</div>
      <div data-progression></div>
      ${opts.inSuperset ? '' : `<div class="hit-quick" data-quick>
        <div class="hit-field" data-log><span class="lbl">${metric==='assisted'?'assist':(metric==='time'?'time':'weight')}</span><span class="val">${escapeHtml(String(weightVal))}</span></div>
        <div class="hit-field" data-log><span class="lbl">${metric==='time'?'secs':'reps'}</span><span class="val">${escapeHtml(String(repsVal))}</span></div>
        <div class="hit-field" data-log><span class="lbl">feel</span><span class="val">${escapeHtml(feelVal)}</span></div>
      </div>`}
      <div data-sets style="margin-top:${doneSets.length?'10px':'0'}"></div>
      <div class="hit-actions">
        ${opts.inSuperset
          ? '<button class="btn ghost" data-log style="width:100%;">Log only this</button>'
          : `${doneSets.length ? '<button class="btn secondary" data-repeat>Same</button>' : ''}
             <button class="btn add-set" data-log>${icon('plus',18)} Add Set</button>`}
      </div>
    </div>`);

  q('[data-progression]',card).appendChild(progressionBlock(status, planRow));

  setRowsInto(q('[data-sets]',card), doneSets, metric, {
    targetSets: planRow.sets,
    onEdit: set=> openLogSetSheet({exerciseId:planRow.exerciseId, planRow, existingSet:set}),
    onDelete: set=>{
      confirmAction('Delete this set? This cannot be undone.', 'Delete', ()=>{
        log.sets = log.sets.filter(s=>s.id!==set.id);
        recomputePRs(planRow.exerciseId);
        saveData(DATA); renderApp();
      });
    }
  });

  const repeatBtn = q('[data-repeat]',card);
  if(repeatBtn) repeatBtn.onclick = ()=> repeatLastSet(planRow.exerciseId);
  qa('[data-log]',card).forEach(btn=> btn.onclick = openLog);
  const removeBtn = q('[data-remove]',card);
  if(removeBtn) removeBtn.onclick = ()=> removeExerciseFromActiveWorkout(log, planRow.exerciseId);
  const alt = q('[data-alternatives]',card);
  if(alt) alt.onclick = ()=> openAlternativesSheet({rows:planForLog(log), index, loggedSets:doneSets.length, fromSession:true, onChange:()=>{ saveData(DATA); renderApp(); }});
  return card;
}

/* The interactive part of progressive overload: accept / not today / adjust. */
function progressionBlock(status, planRow){
  const box = el(`<div></div>`);
  if(status.state==='ready'){
    const prompt = el(`
      <div class="prompt-box">
        <div class="ph">🎯 ${escapeHtml(status.headline)}</div>
        ${status.note?`<div class="pn">${escapeHtml(status.note)}</div>`:''}
        <div class="row">
          <button class="btn" data-accept>Use ${status.suggestedWeight}${units()}</button>
          <button class="btn secondary" data-defer>Not today</button>
          <button class="btn secondary" data-adjust>Adjust</button>
        </div>
      </div>`);
    q('[data-accept]',prompt).onclick = ()=>{
      setLoadPlan(status.exerciseId, {weight:status.suggestedWeight, deferred:false});
      showToast(`Locked in — ${status.suggestedWeight}${units()} today 💪`);
      renderApp();
    };
    q('[data-defer]',prompt).onclick = ()=>{
      setLoadPlan(status.exerciseId, {deferred:true, weight:null});
      showToast('No problem — same weight today.');
      renderApp();
    };
    q('[data-adjust]',prompt).onclick = ()=> openLoadAdjustSheet(status);
    box.appendChild(prompt);
    return box;
  }

  box.appendChild(el(`<div class="suggest-box">${escapeHtml(status.headline)}${status.note?' — '+escapeHtml(status.note):''}</div>`));
  if(status.state==='accepted' || status.state==='deferred'){
    const change = el(`<button class="btn ghost" style="padding:4px 0;font-size:12.5px;">Change today's weight</button>`);
    change.onclick = ()=> openLoadAdjustSheet(status);
    box.appendChild(change);
  } else if(status.progressText){
    box.appendChild(el(`
      <div>
        <p class="faint small" style="margin-top:6px;">${escapeHtml(status.progressText)}</p>
        <div class="meter"><span style="width:${Math.min(100, Math.round(status.qualifyingSessions/status.sessionsRequired*100))}%"></span></div>
      </div>`));
  }
  return box;
}

function duplicateLastSet(exerciseId){
  const mine = setsInLogFor(todayLog(), exerciseId);
  if(!mine.length) return null;
  const last = mine[mine.length-1];
  const metric = metricOf(getExercise(exerciseId));
  const clone = {id:uid(), exerciseId, difficulty:last.difficulty, intent:last.isDropSet?null:(last.intent||null), ts:Date.now(), isPR:false, isDropSet:!!last.isDropSet, isWarmup:last.isDropSet?false:!!last.isWarmup};
  if(last.isDropSet) clone.stages = (last.stages||[]).map(s=>({...s}));
  else if(metric==='weight_reps' || metric==='assisted'){ clone.weight=last.weight; clone.reps=last.reps; }
  else if(metric==='reps_only') clone.reps = last.reps;
  else if(metric==='time') clone.duration = last.duration;
  return clone;
}
function repeatLastSet(exerciseId){
  const log = todayLog();
  const clone = duplicateLastSet(exerciseId);
  if(!clone) return;
  log.sets.push(clone);
  persistLog(log);
  recomputePRs(exerciseId);
  saveData(DATA);
  if(clone.isDropSet) showToast('Drop set repeated 🔻'); else celebrateSet(clone);
  renderApp();
}
function repeatSupersetRound(members){
  const log = todayLog();
  if(members.some(m=>!setsInLogFor(log, m.row.exerciseId).length)){
    showToast('Log a round first');
    return;
  }
  const clones = members.map(m=>duplicateLastSet(m.row.exerciseId)).filter(Boolean);
  if(clones.length!==members.length) return;
  clones.forEach(clone=>{
    log.sets.push(clone);
    recomputePRs(clone.exerciseId);
  });
  persistLog(log);
  saveData(DATA);
  const pr = clones.find(s=>s.isPR);
  if(pr) showToast('🏆 New personal record! You crushed it!', true);
  else showToast('Same round logged');
  renderApp();
}

function openCelebrationSheet(log){
  const totalSets = log.sets.length;
  const volume = Math.round(log.sets.reduce((sum,s)=>sum+setVolumeLoad(s),0));
  const prCount = log.sets.filter(s=>s.isPR).length;
  const topMuscles = muscleWorkForSets(log.sets).slice(0,3).map(r=>`${r.muscle} ${roundTo(r.effectiveSets)}`).join(' · ');
  openSheet({
    centered:true,
    build:(body, sheet)=>{
      body.appendChild(el(`
        <div style="text-align:center;">
          <div style="font-size:42px;line-height:1;margin-bottom:8px;">🎉</div>
          <h3 style="font-size:20px;">Workout complete!</h3>
          <p class="muted small" style="margin:8px 0 18px;">${escapeHtml(appreciationLine(totalSets, prCount))}</p>
          ${statGridHtml([
            {value:totalSets, label:'Sets'},
            {value:roundTo(totalEffectiveSets(log.sets)), label:'Effective sets'},
            {value:prCount, label:'PRs'}
          ])}
          <p class="faint small" style="margin:12px 0 4px;">⏱ ${formatDuration(sessionDurationMs(log))} · ${volume}${units()} volume</p>
          ${topMuscles?`<p class="faint small" style="margin-bottom:16px;">${escapeHtml(topMuscles)} effective sets</p>`:''}
          <div class="row">
            <button class="btn secondary" data-reopen style="flex:1;">${icon('reopen',18)} Reopen</button>
            <button class="btn" data-summary style="flex:1;">View summary</button>
          </div>
        </div>`));
      q('[data-reopen]',body).onclick = ()=> reopenWorkout(log);
      q('[data-summary]',body).onclick = ()=>{ sheet.close(); openShareSummarySheet(log); };
    },
    onClosed: renderApp
  });
}

function openShareSummarySheet(log){
  const totalSets = log.sets.length;
  const volume = Math.round(log.sets.reduce((sum,s)=>sum+setVolumeLoad(s),0));
  const prCount = log.sets.filter(s=>s.isPR).length;
  const dur = sessionDurationMs(log);
  const minutes = dur==null ? null : Math.max(1, Math.round(dur/60000));
  const dateNice = parseDateKey(log.date).toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'});
  const names = [...new Set(log.sets.map(s=>(getExercise(s.exerciseId)||{}).name).filter(Boolean))];
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
            <div><div class="val">${volume}</div><div class="lbl">Volume (${units()})</div></div>
            <div><div class="val">${minutes!==null?minutes:'—'}</div><div class="lbl">Minutes</div></div>
            <div><div class="val">${prCount}</div><div class="lbl">PRs</div></div>
          </div>
          ${names.length ? `<div class="share-exlist">${names.map(escapeHtml).join('<br>')}</div>` : ''}
          <div class="share-quote">${escapeHtml(appreciationLine(totalSets, prCount))}</div>
          <div class="share-streak">🔥 ${currentStreakDays()} day streak</div>
        </div>`));
      const work = muscleWorkCard(log.sets, 'Muscle work');
      if(work){ work.style.marginTop='14px'; body.appendChild(work); }
    }
  });
}

