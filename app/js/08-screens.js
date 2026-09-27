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
        const box = el(`
          <div class="superset-wrap">
            <div class="ss-label"><span class="badge-ss">${icon('link',12)} Superset</span><button class="btn ghost" data-ungroup style="margin-left:auto;padding:2px 6px;font-size:11.5px;">Ungroup</button></div>
            <p class="ss-round">${roundsDone} of ${roundsTarget} round${roundsTarget===1?'':'s'} logged</p>
            <div class="ss-actions" style="margin-top:0;margin-bottom:12px;">
              <button class="btn add-set" data-log-round>${icon('plus',18)} Log round</button>
            </div>
            <div data-members></div>
          </div>`);
        const membersBox = q('[data-members]',box);
        const groupIds = g.members.map(m=> m.row.exerciseId);
        g.members.forEach(m=> membersBox.appendChild(workoutExerciseCard(m.row, m.idx, log, {inSuperset:true, groupIds})));
        q('[data-ungroup]',box).onclick = ()=>{
          g.members.forEach(m=> m.row.supersetId = null);
          saveData(DATA); renderApp();
        };
        q('[data-log-round]',box).onclick = ()=> logSupersetRound(g.members, log);
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

/* Keys are `${log.date}:${exerciseId}` so lists collapse and drafts reset each day. */
const openSetLists = new Set();
const setDrafts = new Map();
/* {setId, stage, backup}: the row loaded into the steppers, and the draft to restore afterwards. */
const editingSets = new Map();
/* Cards reopened by hand after being finished or left behind; cleared whenever a set is logged. */
const expandedCards = new Set();

/* Values in the card's inline logger. They carry over between sets and
   follow the planned load when the overload suggestion is accepted. */
function setDraftFor(key, planRow, sample, plannedWeight){
  let d = setDrafts.get(key);
  if(!d){
    d = {
      weight: sample && sample.weight!=null ? sample.weight : 0,
      reps: sample && sample.reps ? sample.reps : (planRow.repsMin || 8),
      duration: sample && sample.duration ? sample.duration : 30,
      effort: (sample && sample.difficulty) || 'med',
      warmup: false,
    };
    setDrafts.set(key, d);
  }
  if(plannedWeight!=null && plannedWeight!==d.planW) d.weight = plannedWeight;
  d.planW = plannedWeight;
  return d;
}

function stepperHtml(field, value, unit, label){
  return `
    <div class="stp" data-field="${field}">
      <button type="button" class="stp-btn" data-dec aria-label="Less ${label}">${icon('minus',16)}</button>
      <label class="stp-val"><input type="number" inputmode="${field==='weight'?'decimal':'numeric'}" value="${value}" aria-label="${label}"><span>${unit}</span></label>
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
    const mainVal = set.isDropSet ? setValueText({...set.stages[0]}, metric) : setValueText(set, metric);
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
          <span class="ts-val">${escapeHtml(setValueText({...stage}, metric))}</span>
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
  const targetLine = `${planRow.sets} sets${metric!=='time' ? ` · ${planRow.repsMin}–${planRow.repsMax} reps` : ''}${planRow.rpe?` · RPE ${planRow.rpe}`:''}`;
  const lastBits = lastLoggedBits(planRow.exerciseId);
  const lastToday = doneSets.filter(s=>!s.isDropSet).slice(-1)[0];
  const sample = lastToday || (lastBits && lastBits.set);
  const planned = loadPlanFor(planRow.exerciseId);
  const listKey = `${log.date}:${planRow.exerciseId}`;
  const showAll = openSetLists.has(listKey);
  const draft = setDraftFor(listKey, planRow, sample, planned && planned.weight!=null ? planned.weight : null);
  const refText = lastBits ? `Last time ${lastBits.text}` : doneSets.length ? '' : 'First time';

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

  const todayBox = doneSets.length ? `
    <div class="today-sets">
      <div class="ts-head">
        <span class="ts-title">Today</span>
        ${doneSets.length>2 ? `<button type="button" class="ts-more" data-toggle-sets>${showAll?'Show less':`Show all ${doneSets.length}`}</button>` : ''}
      </div>
      ${todaySetRowsHtml(doneSets, metric, planRow.sets, showAll, editing)}
    </div>` : '';

  const wStep = metric==='assisted' ? TRAINING.load.assistanceStepKg : loadStepFor(ex);
  const steppers = metric==='time' ? stepperHtml('duration', draft.duration, 'sec', 'seconds')
    : metric==='reps_only' ? stepperHtml('reps', draft.reps, 'reps', 'reps')
    : stepperHtml('weight', draft.weight, metric==='assisted'?'kg assist':units(), metric==='assisted'?'assistance':'weight')
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
      <div class="ns-steps${metric==='time'||metric==='reps_only'?' single':''}">${steppers}</div>
      <div class="seg" role="radiogroup" aria-label="How hard did it feel">
        ${['easy','med','hard'].map(k=>`<button type="button" role="radio" data-eff="${k}" aria-checked="${draft.effort===k}" class="${draft.effort===k?'on':''}">${effortLabel(k)}</button>`).join('')}
      </div>
    </div>`;

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
      <div class="hit-prog">
        ${setDotsHtml(working.length, planRow.sets)}
        ${progressMsg ? `<span class="${progressCls}">${progressMsg}</span>` : ''}
      </div>
      ${collapsed ? '' : '<div data-progression></div>'}
      ${todayBox}
      ${collapsed ? '' : nextSet}
      <div class="hit-actions">
        ${collapsed
          ? `<button type="button" class="btn secondary expand-btn" data-expand>${isDone ? `${icon('plus',18)} Add bonus set` : `Continue · set ${doneSets.length+1}`}</button>`
          : editing
          ? `<button type="button" class="btn secondary drop-btn" data-cancel-edit>Cancel</button>
             <button type="button" class="btn add-set" data-update>${icon('check',18)} Update set</button>`
          : `<button type="button" class="btn secondary drop-btn" data-drop>Log drop set</button>
             <button type="button" class="btn add-set" data-log-now>${icon('plus',18)} Log set ${doneSets.length+1}</button>`}
      </div>
    </div>`);

  const lastWorkSet = (metric==='weight_reps' || metric==='assisted')
    ? doneSets.filter(s=>!s.isDropSet && !s.isWarmup).slice(-1)[0] : null;
  const liveLower = lastWorkSet && (lastWorkSet.reps||0) > 0 && lastWorkSet.reps < planRow.repsMin;
  if(collapsed){
    q('[data-expand]',card).onclick = ()=>{ expandedCards.add(listKey); renderApp(); };
  } else if(liveLower){
    const weight = lowerLoadFor(ex, lastWorkSet.weight||0, lastWorkSet.reps, planRow.repsMin, metric==='assisted');
    const applied = draft.weight === weight;
    q('[data-progression]',card).appendChild(lowerAdviceBox({
      exerciseId: planRow.exerciseId, weight, applied,
      headline: applied ? `Next set at ${weight}${units()}${metric==='assisted'?' assist':''}`
        : metric==='assisted' ? `Add assistance: ${weight}${units()} for the next set`
        : `Drop to ${weight}${units()} for the next set`,
      note: `Last set ${setValueText(lastWorkSet, metric)} is below your ${planRow.repsMin}–${planRow.repsMax} range.`,
    }));
  } else {
    q('[data-progression]',card).appendChild(progressionBlock(status, planRow));
  }

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
    showToast('Set updated');
    renderApp();
  };

  const dropBtn = q('[data-drop]',card);
  if(dropBtn) dropBtn.onclick = ()=>{
    const target = doneSets.filter(s=>!s.isWarmup).slice(-1)[0];
    if(!target){ showToast('Log a set first, then drop the weight'); return; }
    const values = setValuesFrom(metric, draft);
    if(!validSetValues(values)){ showToast('Enter valid numbers'); return; }
    if(!addDropStage(target, values, draft.effort)){ showToast('A drop set can have up to 5 stages'); return; }
    showToast('Drop logged 🔻');
    renderApp();
  };

  const steps = {weight:{step:wStep, min:0, dp:2}, reps:{step:1, min:1, dp:0}, duration:{step:5, min:5, dp:0}};
  qa('.stp',card).forEach(stp=>{
    const field = stp.dataset.field, cfg = steps[field];
    const input = q('input',stp);
    const fit = ()=>{ input.style.width = (Math.max(String(input.value).length, 1) + 0.6) + 'ch'; };
    const set = v=>{ draft[field] = Math.max(cfg.min, roundTo(v, cfg.dp)); input.value = draft[field]; fit(); };
    fit();
    q('[data-dec]',stp).onclick = ()=> set((parseFloat(input.value)||0) - cfg.step);
    q('[data-inc]',stp).onclick = ()=> set((parseFloat(input.value)||0) + cfg.step);
    input.oninput = ()=>{ const v = parseFloat(input.value); if(!isNaN(v)) draft[field] = v; fit(); };
    input.onchange = ()=> set(parseFloat(input.value)||cfg.min);
  });
  qa('[data-eff]',card).forEach(btn=> btn.onclick = ()=>{
    draft.effort = btn.dataset.eff;
    qa('[data-eff]',card).forEach(b=>{ const on = b===btn; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  });
  const wu = q('[data-wu]',card);
  if(wu) wu.onchange = ()=>{ draft.warmup = wu.checked; };

  const logNow = q('[data-log-now]',card);
  if(logNow) logNow.onclick = ()=>{
    const values = setValuesFrom(metric, draft);
    if(!validSetValues(values)){ showToast('Enter valid numbers'); return; }
    const set = logNormalSet(planRow.exerciseId, values, draft.effort, draft.warmup, null);
    draft.warmup = false;
    expandedCards.clear();
    celebrateSet(set);
    renderApp();
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

/* "Too heavy" advice: reps fell below the range, so suggest a lighter load the
   steppers can jump to. `status` is only passed for the next-session version. */
function lowerAdviceBox({exerciseId, weight, applied, headline, note, status}){
  const box = el(`
    <div class="suggest-box lower-box">
      ${guideInfoBtnHtml()}
      <div class="sb-line">${escapeHtml(headline)}</div>
      <div class="lb-note">${escapeHtml(note)}</div>
      ${applied ? '' : `<button type="button" class="btn lb-use" data-use>Use ${weight}${units()}</button>`}
      ${overloadProgressHtml(status)}
    </div>`);
  const use = q('[data-use]',box);
  if(use) use.onclick = ()=>{
    setLoadPlan(exerciseId, {weight, deferred:false});
    showToast(`Steppers set to ${weight}${units()}`);
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
    bindGuideInfo(prompt, 'overload');
    box.appendChild(prompt);
    return box;
  }

  const adjustable = status.state==='accepted' || status.state==='deferred';
  const suggest = el(`
    <div class="suggest-box">
      ${guideInfoBtnHtml()}
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
  if(logged.some(s=>s.isPR)) showToast('🏆 New personal record! You crushed it!', true);
  else showToast('Round logged');
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

