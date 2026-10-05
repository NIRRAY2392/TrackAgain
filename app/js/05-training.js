/* ======================== §5 TRAINING RULES ========================
   Everything that decides "how good was that set" and "what next" lives
   here. No DOM access in this section. */

/* --- raw set maths --- */
/* Epley. A single is the max itself; reps are capped at 30 so high-rep sets
   (hypertrophy / endurance) still rank above fewer reps at the same weight. */
function estimateOneRepMax(weight, reps){
  const w = weight||0, r = Math.min(Math.max(reps||0, 0), 30);
  return r<=1 ? w : w * (1 + r/30);
}
/* Metrics whose sets carry a weight field (load, assistance or added load). */
function hasLoadField(metric){ return metric==='weight_reps' || metric==='assisted' || metric==='weighted_bw'; }
/* weighted_bw stores only the added load; scoring and volume add the lifter.
   Uses the latest weigh-in, or a typical adult weight when none is logged. */
const DEFAULT_BODYWEIGHT_KG = 75;
function bodyweightForScoring(){
  const latest = latestBodyWeight();
  return latest && latest.weight > 0 ? latest.weight : DEFAULT_BODYWEIGHT_KG;
}
function setVolumeLoad(set){
  if(set.isWarmup) return 0;
  const ex = getExercise(set.exerciseId);
  const extra = metricOf(ex)==='weighted_bw' ? bodyweightForScoring() : 0;
  const one = s=> (typeof s.weight==='number' && typeof s.reps==='number') ? (s.weight+extra)*s.reps : 0;
  if(set.isDropSet) return (set.stages||[]).reduce((sum,st)=> sum + one(st), 0);
  return one(set);
}
function betterIsHigher(metric){ return metric!=='assisted'; }
/* One comparable number per set, used for PRs and charts. */
function setPerformanceScore(set, metric){
  if(metric==='weight_reps') return estimateOneRepMax(set.weight, set.reps);
  if(metric==='weighted_bw') return estimateOneRepMax(bodyweightForScoring() + (set.weight||0), set.reps);
  if(metric==='reps_only')   return set.reps||0;
  if(metric==='time')        return set.duration||0;
  if(metric==='assisted')    return (set.weight||0) / (1 + (set.reps||0)/30); // less assistance = better
  return 0;
}

/* --- rep ranges & effective sets (the fatigue metric) ---
   effective sets = rep-range credit × effort factor.
   A 10-rep set taken near failure = 1.0. A 4-rep heavy single-ish set counts
   0.5 toward hypertrophy but 1.0 toward strength. An easy set counts half. */
function repRangeFor(reps){
  return TRAINING.repRanges.find(r=>reps<=r.maxReps) || TRAINING.repRanges[TRAINING.repRanges.length-1];
}
function isLowRepSet(set, metric){
  // Warm-ups are exempt: fewer than the working-set floor is normal while ramping up.
  if(!set || set.isWarmup) return false;
  return hasLoadField(metric) && (set.reps||0) > 0 && set.reps < TRAINING.lowRepWarningBelow;
}
function effectiveSetsFor(set, exercise){
  if(set.isWarmup) return 0;
  const metric = metricOf(exercise);
  const goalKey = goalConfig().key;
  let credit;
  if(set.isDropSet){
    const topReps = (set.stages && set.stages[0] && (set.stages[0].reps||0)) || 0;
    credit = metric==='time' ? TRAINING.timedHoldCredit : repRangeFor(topReps).credit[goalKey];
  } else if(metric==='time') credit = TRAINING.timedHoldCredit;
  else credit = repRangeFor(set.reps||0).credit[goalKey];
  if(!set.isDropSet && set.intent==='strength' && goalKey==='hypertrophy') credit = Math.min(credit, TRAINING.strengthIntentCredit);
  const effort = TRAINING.effortFactor[set.difficulty] != null ? TRAINING.effortFactor[set.difficulty] : 0.85;
  return credit * effort;
}
/* Per-muscle work for a list of sets. Secondary muscles bank a half share. */
function muscleWorkForSets(sets){
  const byMuscle = {};
  const add = (muscle, eff, vol)=>{
    const row = (byMuscle[muscle] ||= {muscle, effectiveSets:0, volumeLoad:0});
    row.effectiveSets += eff; row.volumeLoad += vol;
  };
  sets.forEach(set=>{
    const ex = getExercise(set.exerciseId); if(!ex) return;
    const eff = effectiveSetsFor(set, ex), vol = setVolumeLoad(set);
    add(primaryOf(ex), eff, vol);
    secondaryOf(ex).forEach(m=> add(m, eff*TRAINING.secondaryMuscleShare, vol*TRAINING.secondaryMuscleShare));
  });
  return Object.values(byMuscle).sort((a,b)=> b.effectiveSets - a.effectiveSets);
}
function totalEffectiveSets(sets){
  return sets.reduce((sum,set)=>{
    const ex = getExercise(set.exerciseId);
    return ex ? sum + effectiveSetsFor(set, ex) : sum;
  }, 0);
}
function sessionEffortSummary(sets){
  if(!sets.length) return {avg:2, label:'medium effort', mostlyEasy:false, mostlyHard:false};
  const avg = sets.reduce((sum,s)=>sum+(EFFORT_SCORE[s.difficulty]||2),0)/sets.length;
  const mostlyEasy = avg<=1.4, mostlyHard = avg>=2.5;
  return {avg, mostlyEasy, mostlyHard, label: mostlyEasy?'mostly easy':(mostlyHard?'mostly hard':'medium effort')};
}

/* --- personal records ---
   The first set ever logged is the baseline, not a PR: only beating it earns
   the trophy. Warm-ups and drop sets never hold one. */
function recomputePRs(exerciseId){
  const ex = getExercise(exerciseId); if(!ex) return;
  const metric = metricOf(ex), higher = betterIsHigher(metric);
  const refs = [];
  DATA.logs.forEach(log=> log.sets.forEach(set=>{
    if(set.exerciseId!==exerciseId) return;
    if(set.isDropSet || set.isWarmup){ set.isPR = false; return; }
    refs.push({log,set});
  }));
  refs.sort((a,b)=> a.log.date===b.log.date ? ((a.set.ts||0)-(b.set.ts||0)) : a.log.date.localeCompare(b.log.date));
  let best = null;
  refs.forEach(({set})=>{
    const score = setPerformanceScore(set, metric);
    const improved = best===null || (higher ? score>best : score<best);
    set.isPR = improved && best!==null;
    if(improved) best = score;
  });
}
/* Re-ranks every exercise once when the PR rules change. */
const PR_RULES_VERSION = 2;
function upgradePrFlags(){
  if((DATA.settings.prRulesVersion||0) >= PR_RULES_VERSION) return;
  new Set(DATA.logs.flatMap(l=> l.sets.map(s=>s.exerciseId))).forEach(id=> recomputePRs(id));
  DATA.settings.prRulesVersion = PR_RULES_VERSION;
  saveData(DATA);
}
/* Chronological PR moments (including the first logged set as the first PR).
   Same scoring as recomputePRs; drop sets excluded. Oldest first. */
function prMomentsForExercise(exerciseId){
  const ex = getExercise(exerciseId); if(!ex) return [];
  const metric = metricOf(ex), higher = betterIsHigher(metric);
  const refs = [];
  DATA.logs.forEach(log=> log.sets.forEach(set=>{
    if(set.exerciseId===exerciseId && !set.isDropSet && !set.isWarmup) refs.push({date:log.date, set});
  }));
  refs.sort((a,b)=> a.date===b.date ? ((a.set.ts||0)-(b.set.ts||0)) : a.date.localeCompare(b.date));
  let best = null;
  const moments = [];
  refs.forEach(({date,set})=>{
    const score = setPerformanceScore(set, metric);
    if(best===null || (higher ? score>best : score<best)){
      best = score;
      moments.push({date, set, score});
    }
  });
  return moments;
}
function exercisesWithPrs(muscle){
  return DATA.exercises.filter(e=>primaryOf(e)===muscle && prMomentsForExercise(e.id).length).sort(compareExercises);
}
function appHasAnyPrs(){ return DATA.exercises.some(e=>prMomentsForExercise(e.id).length>0); }

/* --- progressive overload ---------------------------------------------
   Gradual by design: you must repeat a qualifying session before the app
   asks for more load, and the ask is a suggestion the user accepts,
   defers or adjusts (see §9 openLoadAdjustSheet).

   A session qualifies when, at the same load or better:
     · at least `qualifyingSets` sets reached `repsTarget` reps, and
     · average effort is at most maxEffortToQualify (one Hard set is ok).
   repsTarget = the user's "reps before more weight" setting, capped at the
   programmed row's top rep and never below its bottom rep. */
function repsTargetFor(repsMin, repsMax){
  const earn = goalConfig().repsToEarnIncrease;
  if(typeof earn !== 'number' || earn <= 0) return repsMax;
  return Math.max(repsMin, Math.min(repsMax, earn));
}
function roundToPlate(weight){
  const step = TRAINING.load.plateStepKg;
  return Math.round(weight/step)*step;
}
/* Smallest load change for this exercise: its own "weight jump" if set,
   otherwise the equipment default. Increases always move at least this much. */
function loadStepFor(exercise){
  if(exercise && exercise.loadStep > 0) return exercise.loadStep;
  const step = (TRAINING.load.minIncrementByEquip||{})[equipOf(exercise)];
  return step > 0 ? step : TRAINING.load.plateStepKg;
}
function nextLoadFor(exercise, currentWeight){
  const pct = LOWER_BODY_MUSCLES.has(primaryOf(exercise)) ? TRAINING.load.increasePctLower : TRAINING.load.increasePctUpper;
  const step = loadStepFor(exercise);
  const bump = Math.max(step, currentWeight * pct/100);
  const next = roundTo(Math.round((currentWeight + bump)/step)*step, 2);
  if(next >= currentWeight + step - 1e-9) return next;
  return roundTo(Math.ceil((currentWeight + step)/step - 1e-9)*step, 2);
}
/* The load to move to after reps fell below the range. Uses the same
   one-rep-max estimate as PRs to aim for the bottom of the range, rounds down
   to the equipment step and always moves at least one step. Assisted
   exercises get more assistance instead. */
function lowerLoadFor(exercise, weight, reps, targetReps, assisted){
  if(assisted){
    const step = TRAINING.load.assistanceStepKg;
    return roundTo(weight + step*Math.max(1, Math.ceil((targetReps-reps)/2)), 2);
  }
  const step = loadStepFor(exercise);
  const bw = metricOf(exercise)==='weighted_bw' ? bodyweightForScoring() : 0;
  const ideal = (weight + bw) * (1 + reps/30) / (1 + targetReps/30) - bw;
  const down = Math.floor(ideal/step + 1e-9) * step;
  return Math.max(0, roundTo(Math.min(down, weight - step), 2));
}
function mostCommonWeight(sets, assisted){
  const freq = {};
  sets.forEach(s=>{ const w=s.weight||0; freq[w]=(freq[w]||0)+1; });
  const rows = Object.keys(freq).map(k=>({w:+k, n:freq[k]}));
  rows.sort((a,b)=> b.n-a.n || (assisted ? a.w-b.w : b.w-a.w));
  return rows[0] ? rows[0].w : 0;
}
function sessionQualifiesForIncrease(session, referenceWeight, repsTarget, setsNeeded, assisted){
  const good = session.sets.filter(set=>{
    if(set.isDropSet || set.isWarmup) return false;
    const weightOK = assisted ? (set.weight||0) <= referenceWeight+0.01 : (set.weight||0) >= referenceWeight-0.01;
    return weightOK && (set.reps||0) >= repsTarget;
  });
  if(good.length < setsNeeded) return false;
  const avgEffort = good.reduce((sum,s)=>sum+(EFFORT_SCORE[s.difficulty]||2),0)/good.length;
  return avgEffort <= TRAINING.load.maxEffortToQualify;
}

const FIRST_SESSION_COPY = {
  weight_reps:'No history yet — pick a weight you can control for the full rep range, then log it.',
  reps_only:'No history yet — do as many clean reps as you can, then log it.',
  time:'No history yet — hold as long as you can with good form, then log it.',
  assisted:'No history yet — pick an assistance level that lets you complete the reps, then log it.',
  weighted_bw:'No history yet — do clean reps at bodyweight (add weight only if it is easy), then log it.'
};

/* Returns everything the UI needs to describe "what should I do today?".
   state: no_history | build | lower | ready | accepted | deferred */
function progressionFor(exerciseId, planRow){
  const ex = getExercise(exerciseId);
  const metric = metricOf(ex);
  const goal = goalConfig();
  const repsMin = planRow ? planRow.repsMin : goal.repsMin;
  const repsMax = planRow ? planRow.repsMax : goal.repsMax;
  const status = {exerciseId, metric, repsMin, repsMax, state:'build',
    headline:'', note:null, lastLine:null, progressText:null,
    referenceWeight:null, suggestedWeight:null, targetWeight:null,
    qualifyingSessions:0, sessionsRequired:goal.sessionsRequired, repsTarget:null};

  const sessions = recentSessions(exerciseId, 4, {before:todayKey()});
  if(!sessions.length){
    status.state = 'no_history';
    status.headline = FIRST_SESSION_COPY[metric];
    return status;
  }
  const last = sessions[0];
  const lastNormal = last.sets.filter(s=>!s.isDropSet && !s.isWarmup);
  const effort = sessionEffortSummary(lastNormal.length ? lastNormal : last.sets);
  status.lastLine = `Last: ${last.sets.map(s=>setValueText(s,metric)).join(', ')} · felt ${effort.label}`;

  if(!lastNormal.length){
    status.headline = 'Logged as a drop set last time — no straight-set progression to suggest.';
    status.note = 'Log a normal set to get a load suggestion.';
    return status;
  }

  /* bodyweight reps and timed holds progress by reps/seconds, not load */
  if(metric==='reps_only' || metric==='time'){
    const key = metric==='time' ? 'duration' : 'reps';
    const best = Math.max(...lastNormal.map(s=>s[key]||0));
    const step = metric==='time' ? (effort.mostlyEasy?15:10) : (effort.mostlyEasy?2:1);
    const target = effort.mostlyHard ? best : best+step;
    status.headline = metric==='time' ? `Try holding for ${target}s` : `Try for ${target} reps`;
    status.note = effort.mostlyHard ? 'That was tough — match it and hold your form.'
      : effort.mostlyEasy ? 'Felt easy — push for more this time.' : 'Good session — add a little.';
    return status;
  }

  const assisted = metric==='assisted';
  const referenceWeight = mostCommonWeight(lastNormal, assisted);
  const repsTarget = repsTargetFor(repsMin, repsMax);
  const setsNeeded = Math.min(goal.qualifyingSets, planRow ? planRow.sets : goal.qualifyingSets);
  status.referenceWeight = referenceWeight;
  status.repsTarget = repsTarget;

  let qualifying = 0;
  for(const session of sessions){
    if(sessionQualifiesForIncrease(session, referenceWeight, repsTarget, setsNeeded, assisted)) qualifying++;
    else break;
  }
  status.qualifyingSessions = qualifying;

  if(qualifying >= goal.sessionsRequired){
    status.state = 'ready';
    if(assisted && referenceWeight<=0){
      status.suggestedWeight = 0;
      status.headline = 'Assistance is already 0 — add reps, or change this exercise to bodyweight reps in the library.';
      status.note = `${qualifying} clean session${qualifying>1?'s':''} at 0${units()} assist.`;
    } else {
      status.suggestedWeight = assisted
        ? Math.max(0, roundToPlate(referenceWeight - TRAINING.load.assistanceStepKg))
        : nextLoadFor(ex, referenceWeight);
      status.headline = assisted
        ? `Ready to drop assistance: ${referenceWeight} → ${status.suggestedWeight}${units()}`
        : `Ready to add load: ${loadLabel(referenceWeight, metric)} → ${loadLabel(status.suggestedWeight, metric)}`;
      status.note = `${qualifying} clean session${qualifying>1?'s':''} at ${loadLabel(referenceWeight, metric)} × ${repsTarget}+ reps.`;
    }
  } else {
    const bestReps = Math.max(...lastNormal.map(s=>s.reps||0));
    const atRef = lastNormal.filter(s=> Math.abs((s.weight||0) - referenceWeight) < 0.01);
    const bestAtRef = Math.max(...atRef.map(s=>s.reps||0));
    status.progressText = `Overload progress: ${qualifying}/${goal.sessionsRequired} qualifying sessions`;
    /* Reps falling a little after a weight increase is expected: hold the new
       weight instead of bouncing straight back down. */
    const prevNormal = sessions[1] ? sessions[1].sets.filter(s=>!s.isDropSet && !s.isWarmup) : [];
    const prevRef = prevNormal.length ? mostCommonWeight(prevNormal, assisted) : null;
    const justIncreased = prevRef!=null && (assisted ? referenceWeight < prevRef-0.01 : referenceWeight > prevRef+0.01);
    const grace = justIncreased ? TRAINING.load.newLoadRepGrace : 0;
    if(justIncreased && bestAtRef > 0 && bestAtRef < repsMin && bestAtRef >= repsMin - grace){
      status.headline = `Stay at ${loadLabel(referenceWeight, metric)} for ${repsMin}–${repsMax} reps`;
      status.note = `New weight — build back up to ${repsMin}+ reps before changing it.`;
      return applyTodaysLoadChoice(status, exerciseId, referenceWeight, assisted, repsMin, repsMax);
    }
    // At plain bodyweight there is nothing to take off: build reps instead.
    const canLower = !(metric==='weighted_bw' && referenceWeight<=0);
    if(canLower && bestAtRef > 0 && bestAtRef < repsMin){
      status.state = 'lower';
      status.lowerWeight = lowerLoadFor(ex, referenceWeight, bestAtRef, repsMin, assisted);
      status.headline = assisted
        ? `Add assistance: ${status.lowerWeight}${units()} assist for ${repsMin}–${repsMax} reps`
        : `Drop to ${loadLabel(status.lowerWeight, metric)} for ${repsMin}–${repsMax} reps`;
      status.note = `Last time: ${loadLabel(referenceWeight, metric)} for ${bestAtRef} reps, below your ${repsMin}–${repsMax} range. For ${goal.label}, pick a weight you can do at least ${repsMin} times.`;
      return applyTodaysLoadChoice(status, exerciseId, referenceWeight, assisted, repsMin, repsMax);
    }
    status.headline = `Stay at ${loadLabel(referenceWeight, metric)} for ${repsMin}–${repsMax} reps`;
    status.note = effort.mostlyHard ? 'That one felt hard — hold the load and chase one more rep.'
      : bestReps < repsTarget ? `Add reps first — ${setsNeeded} sets at ${repsTarget}+ reps unlocks more weight.`
      : (qualifying+1 >= goal.sessionsRequired)
        ? `One more session like that and you've earned the increase.`
        : `Need ${goal.sessionsRequired-qualifying} more clean session${goal.sessionsRequired-qualifying>1?'s':''} at ${repsTarget}+ reps.`;
  }
  return applyTodaysLoadChoice(status, exerciseId, referenceWeight, assisted, repsMin, repsMax);
}

/* The user's own decision for today wins over the suggestion. */
function applyTodaysLoadChoice(status, exerciseId, referenceWeight, assisted, repsMin, repsMax){
  const plan = loadPlanFor(exerciseId);
  if(plan && typeof plan.weight === 'number'){
    status.state = 'accepted';
    status.targetWeight = plan.weight;
    status.headline = `Today's target: ${loadLabel(plan.weight, status.metric)} × ${repsMin}–${repsMax} reps`;
    status.note = null;
  } else if(plan && plan.deferred){
    status.state = 'deferred';
    status.headline = `Holding ${loadLabel(referenceWeight, status.metric)} today — we'll ask again next session.`;
    status.note = null;
  }
  return status;
}

/* --- alternatives / variations ---------------------------------------
   Scored against the source movement; anything with no muscle overlap
   scores zero and is never shown. */
function patternFamily(pattern){ return PATTERN_FAMILY[pattern] || 'other'; }
function alternativeScore(source, candidate){
  const reasons = [];
  let score = 0;
  const srcSecondary = secondaryOf(source), candSecondary = secondaryOf(candidate);
  const srcMuscle = primaryOf(source), candMuscle = primaryOf(candidate);

  if(srcMuscle === candMuscle){ score += 50; reasons.push(`Same primary muscle (${srcMuscle})`); }
  else if(candSecondary.includes(srcMuscle)){ score += 20; reasons.push(`Still trains ${srcMuscle}`); }
  else if(srcSecondary.includes(candMuscle) && candSecondary.some(m=>srcSecondary.includes(m))){ score += 12; reasons.push('Overlapping muscles'); }
  else return {score:0, reasons:[]};

  const srcPattern = patternOf(source), candPattern = patternOf(candidate);
  if(srcPattern===candPattern && srcPattern!=='other'){ score += 30; reasons.push(`Same ${PATTERN_LABELS[srcPattern]} pattern`); }
  else if(patternFamily(srcPattern)===patternFamily(candPattern) && patternFamily(srcPattern)!=='other'){ score += 14; reasons.push('Similar movement pattern'); }

  if(tierOf(source)===tierOf(candidate)) score += 10;
  score += Math.min(9, candSecondary.filter(m=>srcSecondary.includes(m)).length * 3);

  if(equipOf(source)===equipOf(candidate)) score += 6;
  else { score += 3; reasons.push(`${equipLabel(candidate)} version`); }

  score += metricOf(source)===metricOf(candidate) ? 5 : -4;
  if(hasHistory(candidate.id)){ score += 4; reasons.push('You have history with this one'); }
  return {score, reasons:reasons.slice(0,3)};
}
function alternativesFor(exerciseId, opts){
  opts = opts || {};
  const source = getExercise(exerciseId);
  if(!source) return [];
  const skip = new Set(opts.exclude || []); skip.add(exerciseId);
  return DATA.exercises
    .filter(e=>!skip.has(e.id))
    .map(e=>({ex:e, ...alternativeScore(source, e)}))
    .filter(c=>c.score>0)
    .sort((a,b)=> b.score-a.score || compareExercises(a.ex,b.ex))
    .slice(0, opts.limit || 5);
}
function alternativeReason(alt){ return alt.reasons.length ? alt.reasons.join(' · ') : `Also trains ${primaryOf(alt.ex)}`; }

/* --- consistency & weekly totals --- */
function currentStreakDays(){
  let streak = 0;
  const cursor = new Date();
  for(let i=0;i<400;i++){
    const day = splitDays()[weekdayKey(cursor)];
    const isRestDay = !day || day.exercises.length===0;
    const log = DATA.logs.find(l=>l.date===dateKey(cursor));
    const trained = !!(log && log.sets.length);
    if(i===0 && !trained){ cursor.setDate(cursor.getDate()-1); continue; } // today doesn't break it yet
    if(isRestDay || trained){ if(trained) streak++; cursor.setDate(cursor.getDate()-1); continue; }
    break;
  }
  return streak;
}
function weeklyVolumeLoad(weeksAgo=0){
  const end = new Date(); end.setHours(0,0,0,0); end.setDate(end.getDate() - weeksAgo*7 + 1);
  const start = new Date(end); start.setDate(end.getDate()-7);
  const from = dateKey(start), to = dateKey(end);
  let total = 0;
  DATA.logs.forEach(log=>{ if(log.date>=from && log.date<to) log.sets.forEach(s=>{ total += setVolumeLoad(s); }); });
  return total;
}
function workoutElapsedMs(log, now){
  if(!log) return 0;
  const base = (typeof log.elapsedMs==='number' && isFinite(log.elapsedMs)) ? Math.max(0, log.elapsedMs) : 0;
  if(!log.timerRunningSince) return base;
  return base + Math.max(0, (now||Date.now()) - log.timerRunningSince);
}
function sessionDurationMs(log){
  if(!log || !log.startedAt) return null;
  if(log.active || typeof log.elapsedMs==='number') return workoutElapsedMs(log);
  if(!log.endedAt) return null;
  return Math.max(0, log.endedAt - log.startedAt);
}

