/* ============================= §4 MODEL ============================= */
function cloneSplit(split){ return clone(split); }
function trainedDayCount(split){
  if(!split || !split.days) return 0;
  return DAY_KEYS.filter(dk=>((split.days[dk]||{}).exercises||[]).length).length;
}
function activeSplit(){ return DATA.splits[DATA.activeSplit]; }
function splitDays(){ return activeSplit().days; }
function getExercise(id){ return DATA.exercises.find(e=>e.id===id); }
function metricOf(ex){ return (ex && ex.metric) || 'weight_reps'; }
function primaryOf(ex){ return (ex && (ex.primary || ex.muscleGroup)) || 'Other'; }
function secondaryOf(ex){ return (ex && ex.secondary) || []; }
function patternOf(ex){ return (ex && ex.pattern) || 'other'; }
function equipOf(ex){ return (ex && ex.equipment) || 'other'; }
function tierOf(ex){ return (ex && ex.tier) || 'isolation'; }
function equipLabel(ex){ return EQUIPMENT_LABELS[equipOf(ex)] || 'Other'; }
function goalConfig(){
  const preset = TRAINING.goals[DATA.settings.goal] || TRAINING.goals.hypertrophy;
  return {...preset, ...DATA.settings.overload, key:DATA.settings.goal};
}

/* Library ordering: compounds first, then by popularity, then alphabetically. */
function compareExercises(a,b){
  const tier = (tierOf(a)==='compound'?0:1) - (tierOf(b)==='compound'?0:1);
  if(tier) return tier;
  const pop = (b.popularity||0) - (a.popularity||0);
  if(pop) return pop;
  return a.name.localeCompare(b.name);
}
function exercisesForMuscle(muscle){ return DATA.exercises.filter(e=>primaryOf(e)===muscle).sort(compareExercises); }
function searchExercises(term, pool){
  const t = (term||'').trim().toLowerCase();
  const list = (pool||DATA.exercises).slice();
  if(!t) return list.sort(compareExercises);
  return list.filter(e=>
      e.name.toLowerCase().includes(t) ||
      primaryOf(e).toLowerCase().includes(t) ||
      equipLabel(e).toLowerCase().includes(t) ||
      secondaryOf(e).some(m=>m.toLowerCase().includes(t))
    ).sort((a,b)=>{
      const sa = a.name.toLowerCase().startsWith(t)?0:1, sb = b.name.toLowerCase().startsWith(t)?0:1;
      return sa!==sb ? sa-sb : compareExercises(a,b);
    });
}
function exerciseSubtitle(ex){
  const bits = [primaryOf(ex), equipLabel(ex)];
  if(patternOf(ex)!=='other') bits.push(PATTERN_LABELS[patternOf(ex)]);
  if(metricOf(ex)!=='weight_reps') bits.push(METRIC_LABELS[metricOf(ex)]);
  return bits.join(' · ');
}

/* --- today's log & plan ---------------------------------------------
   DATA.activeSplit is the current split. Home follows it. Saving a day,
   copying a day, switching PPL / PPL + UL, or loading a preset refreshes
   an in-progress workout and, when today already has a saved plan, the
   hit list too. A hit list with no saved plan reads the split directly.
   sessionOnly rows were added for this workout only. hiddenExerciseIds
   are split exercises removed from this workout without deleting them
   from the split. */
function todayLog(){
  const overnight = DATA.logs.find(l=>l.active);
  if(overnight) return overnight;
  const date = todayKey();
  let log = DATA.logs.find(l=>l.date===date);
  if(log) return log;
  return {id:uid(), date, dayKey:weekdayKey(), sets:[], active:false, completed:false,
    startedAt:null, endedAt:null, elapsedMs:0, timerRunningSince:null, plan:null, planName:'', _transient:true};
}
function persistLog(log){
  if(!log || !log._transient) return log;
  delete log._transient;
  if(!DATA.logs.some(l=>l.id===log.id)) DATA.logs.push(log);
  return log;
}
function routineForLog(log){ return splitDays()[log.dayKey] || {name:'Rest', exercises:[]}; }
function planForLog(log){ return Array.isArray(log.plan) ? log.plan : routineForLog(log).exercises; }
function planNameForLog(log){ return log.planName || routineForLog(log).name || 'Workout'; }
function ensurePlanSnapshot(log){
  persistLog(log);
  if(!Array.isArray(log.plan)){
    const routine = routineForLog(log);
    log.plan = clone(routine.exercises || []);
    log.plan.forEach(row=>{ row.sessionOnly = false; });
    log.planName = routine.name || 'Workout';
    saveData(DATA);
  }
  return log.plan;
}
function splitDayFor(dayKey){
  return splitDays()[dayKey] || {name:'Rest', exercises:[]};
}
function exerciseInSplit(dayKey, exerciseId){
  return (splitDayFor(dayKey).exercises || []).some(r=>r.exerciseId===exerciseId);
}
function dissolveTinySupersets(rows){
  const counts = {};
  rows.forEach(r=>{ if(r.supersetId) counts[r.supersetId] = (counts[r.supersetId]||0)+1; });
  rows.forEach(r=>{ if(r.supersetId && counts[r.supersetId]<2) r.supersetId = null; });
}
function absorbQueuedExercises(log){
  const queued = Array.isArray(log.queued) ? log.queued : [];
  log.queued = [];
  const plan = ensurePlanSnapshot(log);
  queued.forEach(row=>{
    if(!row || !row.exerciseId) return;
    if(plan.some(r=>r.exerciseId===row.exerciseId)) return;
    const copy = clone(row);
    copy.sessionOnly = true;
    plan.push(copy);
  });
  return plan;
}
/* The log Home is showing. An in-progress workout wins. Otherwise, a
   save / switch / preset load can refresh today's stored plan so the hit
   list matches the split after the workout has already been started once.
   A day with no stored plan is left alone — the hit list reads the split. */
function homePlanLog(opts){
  const active = activeWorkoutLog();
  if(active) return active;
  if(!opts || (!opts.fromSave && !opts.replaceAll)) return null;
  const log = DATA.logs.find(l=>l.date===todayKey());
  if(!log || !Array.isArray(log.plan)) return null;
  return log;
}
/* Pull the current split's day into the plan Home shows.
   replaceAll is for switching splits or loading a preset.
   dayKey limits a day-save to that plan's weekday.
   Returns true when a stored plan was rewritten. */
function syncActiveWorkoutFromSplit(opts){
  opts = opts || {};
  const log = homePlanLog(opts);
  if(!log) return false;
  const dayKey = log.dayKey || weekdayKey();
  if(opts.dayKey && opts.dayKey!==dayKey) return false;
  if(!Array.isArray(log.hiddenExerciseIds)) log.hiddenExerciseIds = [];
  const routine = splitDays()[dayKey] || {name:'Rest', exercises:[]};
  const incoming = routine.exercises || [];
  const incomingIds = new Set(incoming.map(r=>r.exerciseId));
  if(opts.replaceAll) log.hiddenExerciseIds = [];
  else if(opts.fromSave) log.hiddenExerciseIds = log.hiddenExerciseIds.filter(id=> !incomingIds.has(id));
  else log.hiddenExerciseIds = log.hiddenExerciseIds.filter(id=> incomingIds.has(id));
  const fresh = clone(incoming.filter(r=> !log.hiddenExerciseIds.includes(r.exerciseId)));
  fresh.forEach(row=>{ row.sessionOnly = false; });
  const extras = opts.replaceAll ? [] : (log.plan||[]).filter(row=>
    row && row.sessionOnly && row.exerciseId && !incomingIds.has(row.exerciseId)
  );
  log.plan = fresh.concat(extras);
  log.planName = routine.name || 'Workout';
  return true;
}
function commitExerciseToSplit(log, exerciseId){
  const dayKey = log.dayKey || weekdayKey();
  const day = splitDays()[dayKey];
  if(!day){ showToast('Could not find that day on your split'); return; }
  if(!day.exercises.some(r=>r.exerciseId===exerciseId)){
    const sessionRow = (log.plan||[]).find(r=>r.exerciseId===exerciseId);
    const copy = clone(sessionRow || newPlanRow(exerciseId,{goal:DATA.settings.goal}));
    delete copy.sessionOnly;
    day.exercises.push(copy);
  }
  const sessionRow = (log.plan||[]).find(r=>r.exerciseId===exerciseId);
  if(sessionRow) sessionRow.sessionOnly = false;
  saveData(DATA);
  showToast('Added to your split');
  renderApp();
}
function addExerciseToActiveWorkout(exerciseId){
  const log = todayLog();
  if(!log.active){ showToast('Start the workout first'); return; }
  persistLog(log);
  const plan = ensurePlanSnapshot(log);
  if(plan.some(r=>r.exerciseId===exerciseId)){ showToast('Already in this workout'); return; }
  const row = newPlanRow(exerciseId,{goal:DATA.settings.goal});
  const dayKey = log.dayKey || weekdayKey();
  const inSplit = exerciseInSplit(dayKey, exerciseId);
  row.sessionOnly = !inSplit;
  plan.push(row);
  saveData(DATA);
  renderApp();
  if(inSplit){ showToast('Added to this workout'); return; }
  const name = (getExercise(exerciseId)||{}).name || 'This exercise';
  const dayLabel = DAY_LABELS[dayKey] || 'this day';
  chooseAction(
    `${name} is in this workout. Add it to your ${dayLabel} split for next time? It stays in this workout either way.`,
    'Add to Split',
    ()=> commitExerciseToSplit(log, exerciseId),
    'Only this workout',
    ()=> showToast('Kept for this workout only')
  );
}
function removeExerciseFromActiveWorkout(log, exerciseId){
  if(!log || !Array.isArray(log.plan)) return;
  const ex = getExercise(exerciseId);
  const name = ex ? ex.name : 'this exercise';
  const logged = setsInLogFor(log, exerciseId).length;
  const message = logged
    ? `Remove ${name} from this workout? Sets already logged stay in today’s history. Your split is left as it is.`
    : `Remove ${name} from this workout? Your split is left as it is.`;
  confirmAction(message, 'Remove', ()=>{
    const row = log.plan.find(r=>r.exerciseId===exerciseId);
    log.plan = log.plan.filter(r=>r.exerciseId!==exerciseId);
    dissolveTinySupersets(log.plan);
    if(row && !row.sessionOnly){
      if(!Array.isArray(log.hiddenExerciseIds)) log.hiddenExerciseIds = [];
      if(!log.hiddenExerciseIds.includes(exerciseId)) log.hiddenExerciseIds.push(exerciseId);
    }
    saveData(DATA);
    showToast('Removed from this workout');
    renderApp();
  });
}
function queueExerciseForToday(exerciseId){
  const log = todayLog();
  if(log.active){
    homeScreen = 'workout';
    VIEW = 'today';
    addExerciseToActiveWorkout(exerciseId);
    return;
  }
  persistLog(log);
  const dayKey = weekdayKey();
  if(!Array.isArray(log.queued)) log.queued = [];
  const inSplit = exerciseInSplit(dayKey, exerciseId);
  const queued = log.queued.some(r=>r.exerciseId===exerciseId);
  if(inSplit || queued){ showToast("Already in today's plan"); return; }
  const row = newPlanRow(exerciseId,{goal:DATA.settings.goal});
  row.sessionOnly = true;
  log.queued.push(row);
  saveData(DATA);
  showToast('Added for today only — not on your split');
  renderApp();
}
function setsInLogFor(log, exerciseId){ return log.sets.filter(s=>s.exerciseId===exerciseId); }
function workingSetsInLogFor(log, exerciseId){ return log.sets.filter(s=>s.exerciseId===exerciseId && !s.isWarmup); }
function workingSetCount(sets){ return (sets||[]).filter(s=>!s.isWarmup).length; }

/* Groups plan rows for display. Rows sharing a supersetId are gathered into
   one visual group (in the order they first appear); everything else is
   its own single-row group. A row has one supersetId, so it can never
   belong to two groups at once. */
function groupPlanRows(rows){
  const groups = []; const seen = new Set();
  rows.forEach((row, idx)=>{
    if(seen.has(idx)) return;
    if(row.supersetId){
      const members = [];
      rows.forEach((r2,idx2)=>{ if(r2.supersetId===row.supersetId){ members.push({row:r2, idx:idx2}); seen.add(idx2); } });
      groups.push({type:'superset', supersetId:row.supersetId, members});
    } else {
      groups.push({type:'single', row, idx});
      seen.add(idx);
    }
  });
  return groups;
}
/* Sessions (a date + that date's sets) for one exercise, newest first. */
function recentSessions(exerciseId, count=3, opts){
  const before = opts && opts.before;
  const byDate = new Map();
  loggedSetsForExercise(exerciseId).forEach(set=>{
    if(before && set.date>=before) return;
    if(!byDate.has(set.date)) byDate.set(set.date, []);
    byDate.get(set.date).push(set);
  });
  return [...byDate.entries()]
    .sort((a,b)=> b[0].localeCompare(a[0]))
    .slice(0, count)
    .map(([date,sets])=>({date, sets}));
}
function lastCompletedWorkout(){
  return [...DATA.logs].filter(l=>l.sets.length>0).sort((a,b)=> b.date.localeCompare(a.date))[0] || null;
}

function sortedBodyWeight(){
  return [...(DATA.bodyWeight||[])].sort((a,b)=> b.date.localeCompare(a.date) || (b.id||'').localeCompare(a.id||''));
}
function latestBodyWeight(){ return sortedBodyWeight()[0] || null; }
function bodyWeightOn(date){ return (DATA.bodyWeight||[]).find(e=>e.date===date) || null; }
function isWeighInDay(){ return weekdayKey() === (DATA.settings.weighInDay || 'mon'); }
function shouldShowWeightReminder(){
  if(!isWeighInDay()) return false;
  if(DATA.settings.weightReminderSnoozedOn === todayKey()) return false;
  if(bodyWeightOn(todayKey())) return false;
  return true;
}
function snoozeWeightReminder(){
  DATA.settings.weightReminderSnoozedOn = todayKey();
  saveData(DATA);
}
function saveBodyWeightEntry(weight, note, date){
  date = date || todayKey();
  const existing = bodyWeightOn(date);
  if(existing){
    existing.weight = weight;
    existing.note = note || '';
  } else {
    DATA.bodyWeight.push({id:uid(), date, weight, note:note||''});
  }
  if(date === todayKey()) DATA.settings.weightReminderSnoozedOn = todayKey();
  saveData(DATA);
}
function deleteBodyWeightEntry(id){
  DATA.bodyWeight = (DATA.bodyWeight||[]).filter(e=>e.id!==id);
  saveData(DATA);
}

/* --- today's load plan (accept / defer / adjust an overload suggestion) ---
   One small record per exercise, date-stamped so it self-expires. */
function loadPlanFor(exerciseId){
  const entry = DATA.progress[exerciseId];
  return (entry && entry.date===todayKey()) ? entry : null;
}
function setLoadPlan(exerciseId, patch){
  DATA.progress[exerciseId] = {date:todayKey(), weight:null, deferred:false, ...(loadPlanFor(exerciseId)||{}), ...patch};
  saveData(DATA);
}
function clearLoadPlan(exerciseId){ delete DATA.progress[exerciseId]; saveData(DATA); }

