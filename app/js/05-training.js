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
  weight_reps:"Set 1 · find your working weight. Log it and I'll tune set 2.",
  reps_only:"Set 1 · your baseline. Clean reps, then I'll set the bar.",
  time:"Set 1 · your baseline hold. Log it and I'll set the target.",
  assisted:"Set 1 · find your assistance level. Log it and I'll tune set 2.",
  weighted_bw:"Set 1 · start at bodyweight. Log it and I'll tell you if it's time to add weight."
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
    status.targetValue = target;
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

/* --- live in-session coaching -----------------------------------------
   Reacts to the set just logged today rather than repeating the
   pre-session suggestion. Returns null before anything is logged, else
   {key, tone, headlines, note, nextWeight, volume}. `headlines` are
   wordings of one message (the card picks one); tone is good | adjust | neutral.
   Checks run in priority order and the first match wins. `reopened` is
   'bonus' or 'back' when a finished / left-behind card was opened by hand,
   so the line looks ahead instead of repeating the last set's summary. */
function liveSetFeedback(exerciseId, planRow, todaySets, status, reopened){
  if(!todaySets.length) return null;
  const ex = getExercise(exerciseId);
  const metric = metricOf(ex);
  const loadBased = hasLoadField(metric);
  const assisted = metric==='assisted';
  const repsMin = planRow.repsMin, repsMax = planRow.repsMax;
  const targetSets = planRow.sets || 0;
  const last = todaySets[todaySets.length-1];
  const working = todaySets.filter(s=>!s.isWarmup && !s.isDropSet);
  const history = recentSessions(exerciseId, 4, {before:todayKey()});
  const lastSession = history[0] ? history[0].sets.filter(s=>!s.isWarmup && !s.isDropSet) : [];
  const L = w=> loadLabel(w, metric);
  const val = s=> metric==='time' ? (s.duration||0) : (s.reps||0);
  const amount = n=> metric==='time' ? `${n}s` : `${n} rep${n===1?'':'s'}`;
  const clock = s=> `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  const sameLoad = (a,b)=> !loadBased || Math.abs((a.weight||0)-(b.weight||0)) < 0.01;
  const out = {key:'', tone:'good', headlines:[], note:null, nextWeight:null, volume:null};
  const say = (key, tone, headlines, extra)=> Object.assign(out, {key, tone, headlines}, extra||{});

  if(loadBased && !assisted && history[0]){
    const sum = sets=> Math.round(sets.reduce((a,s)=>a+setVolumeLoad(s),0));
    out.volume = {today:sum(todaySets), last:sum(history[0].sets)};
  }

  if(last.isWarmup){
    const target = status.targetWeight!=null ? status.targetWeight
      : status.state==='lower' ? status.lowerWeight : status.referenceWeight;
    if(loadBased && target!=null && !working.length && !(metric==='weighted_bw' && target<=0)){
      return say('warmup-target','neutral',[
        `Warm-up in. Working sets at ${L(target)}.`,
        `Primed. Load ${L(target)} for the real work.`,
        `Good warm-up. Next up: ${L(target)}.`], {nextWeight:target});
    }
    return say('warmup','neutral',[
      'Warm-up in. Now your first working set.',
      'Primed. Time for a real set.',
      "Warm-up logged. It won't count toward sets or PRs."]);
  }

  const n = working.length;
  const allDone = targetSets>0 && n===targetSets;
  const base = last.isDropSet && n ? working[n-1] : last;
  const reps = base.reps||0, w = base.weight||0;
  const step = assisted ? TRAINING.load.assistanceStepKg : loadStepFor(ex);
  const lastText = setValueText(last, metric);
  const prior = todaySets[todaySets.length-2];
  const restSec = prior && last.ts && prior.ts ? Math.round((last.ts-prior.ts)/1000) : null;
  const planRest = restSecondsFor(planRow);
  const shortRest = restSec!=null && planRest>0 && restSec>=10 && restSec < planRest*0.6;
  const longRest = restSec!=null && planRest>0 && restSec < 15*60 && restSec > Math.max(planRest*2, planRest+90);
  const bump = (from, times)=>{
    let x = from;
    for(let i=0;i<times;i++) x = assisted ? Math.max(0, roundTo(x-step, 2)) : nextLoadFor(ex, x);
    return x;
  };

  /* Same rep target and set count that sessionQualifiesForIncrease uses, so
     "counts toward more weight" matches what the next session decides. */
  const setsNeeded = Math.min(goalConfig().qualifyingSets, targetSets || goalConfig().qualifyingSets);
  const nextNote = ()=>{
    if(targetSets && n>=targetSets) return null;
    const refNext = lastSession[n];
    const lead = loadBased ? `Next: ${L(out.nextWeight!=null ? out.nextWeight : w)}` : 'Next set';
    if(!loadBased){
      if(status.targetValue!=null && val(base) < status.targetValue) return `${lead} · aim for ${amount(status.targetValue)}`;
      if(refNext) return `${lead} · beat ${amount(val(refNext))} from last time`;
      return `${lead} · match ${amount(val(base))}`;
    }
    if(out.nextWeight==null && status.repsTarget!=null && status.referenceWeight!=null){
      const atTarget = working.filter(s=> sameLoad(s, {weight:w}) && (s.reps||0) >= status.repsTarget).length;
      if(atTarget < setsNeeded) return `${lead} × ${status.repsTarget}+ · ${atTarget}/${setsNeeded} sets at target toward more weight`;
    }
    if(refNext && out.nextWeight==null && sameLoad(refNext, {weight:w})) return `${lead} · beat ${amount(val(refNext))} from last time`;
    return `${lead} × ${repsMin}–${repsMax}`;
  };
  const doneNote = ()=>{
    const total = working.reduce((a,s)=>a+val(s),0);
    if(loadBased && status.repsTarget!=null && status.referenceWeight!=null){
      const todayRef = mostCommonWeight(working, assisted);
      const qualifies = sessionQualifiesForIncrease({sets:working}, todayRef, status.repsTarget, setsNeeded, assisted);
      if(qualifies && Math.abs(todayRef - status.referenceWeight) < 0.01){
        const have = status.qualifyingSessions + 1;
        if(have >= status.sessionsRequired){
          const next = assisted ? Math.max(0, roundToPlate(todayRef - TRAINING.load.assistanceStepKg)) : nextLoadFor(ex, todayRef);
          return `Qualifying session ${have}/${status.sessionsRequired} — next time I'll offer ${L(next)}.`;
        }
        return `Qualifying session ${have}/${status.sessionsRequired} at ${L(todayRef)}. One step closer to more weight.`;
      }
      if(qualifies) return `First clean session at ${L(todayRef)}. Repeat it to earn the next jump.`;
    }
    if(lastSession.length){
      const before = lastSession.slice(0, n).reduce((a,s)=>a+val(s),0);
      const d = total - before;
      return d>0 ? `+${amount(d)} vs last session.` : d===0 ? 'Same total as last session.' : `${amount(-d)} under last session.`;
    }
    return "First session banked. Next time I'll coach you against today.";
  };
  const tail = ()=> allDone ? doneNote() : nextNote();

  if(reopened==='bonus' && working.length){
    const higher = betterIsHigher(metric);
    const top = working.reduce((a,s)=>{
      const d = setPerformanceScore(s, metric) - setPerformanceScore(a, metric);
      return (higher ? d>0 : d<0) ? s : a;
    });
    return say('reopen-bonus','good',[
      `Bonus round: beat your best today, ${setValueText(top, metric)}.`,
      `Extra set? Your number to beat is ${setValueText(top, metric)}.`],
      {note:'Or finish with a drop set.'});
  }
  if(reopened==='back' && working.length){
    const lastWork = working[working.length-1];
    say('reopen-back','neutral',[
      `Back on ${ex.name}: last set ${setValueText(lastWork, metric)}. Match it.`,
      `Picking ${ex.name} back up. Last set was ${setValueText(lastWork, metric)}.`]);
    out.note = nextNote();
    return out;
  }

  if(last.isDropSet){
    return say('drop','neutral',[
      "Drop set done — that's the finisher.",
      'Drop set in. Fully cooked.',
      'Drop set logged. Nothing left in the tank.']);
  }

  const heavierThanLast = loadBased && status.referenceWeight!=null
    && (assisted ? w < status.referenceWeight-0.01 : w > status.referenceWeight+0.01);
  const grace = heavierThanLast ? TRAINING.load.newLoadRepGrace : 0;
  if(loadBased && reps>0 && reps < repsMin - grace && !(metric==='weighted_bw' && w<=0)){
    const lower = lowerLoadFor(ex, w, reps, repsMin, assisted);
    const why = shortRest
      ? `Only ${clock(restSec)} rest (plan ${clock(planRest)}) — that likely cost reps.`
      : `${lastText} is below your ${repsMin}–${repsMax} range.`;
    return say('lower','adjust', assisted
      ? [`Add assistance: ${lower}${units()} for the next set.`, `${reps} reps is under range — go ${lower}${units()} assist.`]
      : [`Drop to ${L(lower)} for the next set.`, `Too heavy for ${repsMin}–${repsMax}. Go ${L(lower)} next.`, `${reps} reps is under range — ${L(lower)} next set.`],
      {nextWeight:lower, note:why});
  }

  if(last.isPR){
    say('pr','good',[`New best: ${lastText} 🏆`, `PR — ${lastText}. That's real progress.`, `${lastText} beats everything you've logged.`]);
    out.note = tail();
    return out;
  }

  const prev = working[n-2] || null;
  if(!history.length && loadBased && (!prev || !sameLoad(prev, last))){
    const over = reps - repsMax;
    if(over>0 || (reps>=repsMax && last.difficulty==='easy')){
      // Aim the jump at mid-range using the same one-rep-max estimate as PRs.
      const mid = Math.round((repsMin+repsMax)/2);
      const bw = metric==='weighted_bw' ? bodyweightForScoring() : 0;
      const ideal = Math.floor(((w+bw)*(1+reps/30)/(1+mid/30) - bw)/step + 1e-9) * step;
      const up = assisted ? bump(w, over>=4 ? 2 : 1) : Math.max(bump(w, 1), roundTo(ideal, 2));
      return say('feel-up','adjust',[`Too light — go ${L(up)} for set ${todaySets.length+1}.`, `${reps} reps is above ${repsMin}–${repsMax}. Try ${L(up)} next.`],
        {nextWeight:up, note:`Aim for a weight you can do ${repsMin}–${repsMax} times.`});
    }
    if(last.difficulty==='easy'){
      const up = bump(w, 1);
      return say('feel-easy','good',[`Good start. Add a step: ${L(up)} for set ${todaySets.length+1}.`, `Easy and in range — nudge up to ${L(up)}.`],
        {nextWeight:up, note:'Still easy next set? Keep climbing.'});
    }
    if(allDone){
      say('feel-done','good',[`All ${targetSets} sets done. ${L(w)} is your working weight.`, `Done — and you found your number: ${L(w)}.`]);
      out.note = doneNote();
      return out;
    }
    if(last.difficulty==='hard'){
      say('feel-hard','good',[`Right at your edge. Stay at ${L(w)}, keep form tight.`, `Hard but in range — ${L(w)} it is.`]);
      out.note = tail();
      return out;
    }
    say('feel-found','good',[`Found it — ${L(w)} is your working weight.`, `That's the one. Stay at ${L(w)}.`, `${L(w)} fits ${repsMin}–${repsMax}. Lock it in.`]);
    out.note = tail();
    return out;
  }

  // Load only goes up between sessions (see sessionQualifiesForIncrease), so no mid-session bump.
  if(loadBased && reps > repsMax+2 && !(assisted && w<=0)){
    say('over','good',[
      `${reps} reps — well above ${repsMin}–${repsMax}. Sessions like this earn the jump.`,
      `${reps} reps at ${L(w)}. Hold it — this is how the increase gets earned.`]);
    out.note = tail();
    return out;
  }

  if(prev && sameLoad(prev, last)){
    const drop = val(prev) - val(last);
    const seq = working.slice(-3).map(val).join(' → ');
    if(metric==='time' ? drop>=10 : drop>=3){
      if(shortRest){
        say('fade-rest','adjust',[
          `${val(prev)} → ${val(last)}: only ${clock(restSec)} rest. Take the full ${clock(planRest)}.`,
          `Short rest (${clock(restSec)}) cost you ${amount(drop)}. Rest ${clock(planRest)} next.`]);
        out.note = tail();
        return out;
      }
      // Still in range, so the weight stays; the too-heavy check above handles real drops.
      say('fade','adjust',[
        `Reps falling fast (${seq}). Rest a little longer before the next one.`,
        `${seq} — fatigue is building. Take an extra 30s, same weight.`]);
      out.note = tail();
      return out;
    }
    if(last.difficulty==='easy' && drop>=2){
      say('mismatch','neutral',[`Marked easy, but down ${amount(drop)}. Was it really easy?`, `Down ${amount(drop)} on an "easy" set — be honest with the effort tag.`]);
      out.note = tail();
      return out;
    }
    if(n>=3){
      const tri = working.slice(-3);
      if(tri.every(s=>sameLoad(s, last))){
        if(tri.every(s=>val(s)===val(last))){
          const flat = tri.map(val).join(' · ');
          say('steady','good',[`${flat} — rock solid.`, `${flat}. ${loadBased ? `${L(w)} is yours.` : 'Dead consistent.'}`]);
          out.note = tail();
          return out;
        }
        const e = tri.map(s=>EFFORT_SCORE[s.difficulty]||2);
        if(e[0]<e[1] && e[1]<e[2]){
          say('creep','neutral',['Easy → Medium → Hard. Getting heavy — keep form tight.', 'Effort is climbing every set. Stay crisp.']);
          out.note = tail();
          return out;
        }
      }
    }
  }

  if(allDone){
    const total = working.reduce((a,s)=>a+val(s),0);
    const totalText = metric==='time' ? `${total}s held` : `${total} reps`;
    return say('done','good',[`All ${targetSets} sets done — ${totalText} total.`, `Target hit: ${targetSets} sets, ${totalText}.`], {note:doneNote()});
  }
  if(targetSets && n>targetSets){
    say('bonus','good',[`Bonus set — ${lastText}. Extra credit.`, `Past the plan: ${lastText}. Extra credit.`]);
    out.note = doneNote();
    return out;
  }

  const ref = lastSession[n-1] || lastSession[lastSession.length-1];
  if(ref){
    if(sameLoad(ref, last)){
      const d = val(last) - val(ref);
      if(d>0) say('beat','good',[`+${amount(d)} vs last time${loadBased ? ` at ${L(w)}` : ''}.`, `Beat last session: ${setValueText(ref, metric)} → ${lastText}.`]);
      else if(d===0) say('match','good',[`Matched last session — ${lastText}.`, 'Same as last time. Now beat it.']);
      else say('short','neutral',[`${amount(-d)} short of last time (${setValueText(ref, metric)}).`, `Down ${amount(-d)} on last session — shake it off.`]);
      let note = null;
      if(loadBased){
        const bestAtW = Math.max(0, ...loggedSetsForExercise(exerciseId)
          .filter(s=> s!==last && !s.isWarmup && !s.isDropSet && Math.abs((s.weight||0)-w) < 0.01)
          .map(s=> s.reps||0));
        if(bestAtW - reps === 1) note = `1 rep off your best at ${L(w)} (${bestAtW}).`;
      }
      if(!note && longRest && d>=0) note = `Long rest (${clock(restSec)}). Keep it nearer ${clock(planRest)} to stay warm.`;
      out.note = note || tail();
      return out;
    }
    const heavier = assisted ? w < (ref.weight||0) : w > (ref.weight||0);
    say(heavier ? 'heavier' : 'lighter', heavier ? 'good' : 'neutral', heavier
      ? [`${L(w)} — up from ${L(ref.weight||0)} last time.`, `Heavier than last session: ${reps} reps at ${L(w)}.`]
      : [`Lighter than last time (${L(ref.weight||0)}). Make the reps count.`]);
    out.note = tail();
    return out;
  }

  if(prev){
    const pn = todaySets.indexOf(prev) + 1;
    if(sameLoad(prev, last)){
      const d = val(last) - val(prev);
      if(d>0) say('up-prev','good',[`+${amount(d)} on set ${pn}. Strong.`, `Better than set ${pn} — ${lastText}.`]);
      else if(d===0) say('same-prev','good',[`Same as set ${pn} — consistent.`, `${lastText} again. Locked in.`]);
      else say('down-prev','neutral',[`${amount(-d)} down on set ${pn} — normal fatigue.`, `Dipped ${amount(-d)}. Expected this deep in.`]);
    } else {
      const heavier = assisted ? w < (prev.weight||0) : w > (prev.weight||0);
      say(heavier ? 'heavier-prev' : 'lighter-prev', 'good', heavier
        ? [`Up to ${L(w)} and still ${reps} reps.`, `Heavier than set ${pn}: ${lastText}.`]
        : [`Back to ${L(w)} — ${reps} clean reps.`]);
    }
    out.note = tail();
    return out;
  }

  say('baseline','good',[`Baseline: ${lastText}. Match it next set.`, `${lastText} on the board. That's your number to beat.`]);
  out.note = tail();
  return out;
}

/* Builds a checker for the card steppers: given the draft, returns one short
   line comparing it with the previous set, last session and the all-time best. */
function makeStepperPreview(exerciseId, planRow, todaySets){
  const ex = getExercise(exerciseId);
  const metric = metricOf(ex);
  const loadBased = hasLoadField(metric);
  const assisted = metric==='assisted';
  const higher = betterIsHigher(metric);
  const working = todaySets.filter(s=>!s.isWarmup && !s.isDropSet);
  const history = recentSessions(exerciseId, 1, {before:todayKey()});
  const lastSession = history[0] ? history[0].sets.filter(s=>!s.isWarmup && !s.isDropSet) : [];
  const prevToday = working[working.length-1] || null;
  const lastRef = lastSession[working.length] || lastSession[lastSession.length-1] || null;
  const prevLabel = prevToday ? `set ${todaySets.indexOf(prevToday)+1}` : '';
  const weightRef = prevToday ? {set:prevToday, label:prevLabel} : lastRef ? {set:lastRef, label:'last time'} : null;
  const scores = loggedSetsForExercise(exerciseId).filter(s=>!s.isWarmup && !s.isDropSet).map(s=> setPerformanceScore(s, metric));
  const best = scores.length ? (higher ? Math.max(...scores) : Math.min(...scores)) : null;
  const val = s=> metric==='time' ? (s.duration||0) : (s.reps||0);
  const amount = n=> metric==='time' ? `${n}s` : `${n} rep${n===1?'':'s'}`;

  return draft=>{
    if(draft.warmup) return {text:"Warm-up: won't count toward sets or PRs.", tone:'neutral'};
    const v = setValuesFrom(metric, draft);
    if(!validSetValues(v)) return {text:'', tone:'neutral'};
    const score = setPerformanceScore(v, metric);
    if(best!=null && (higher ? score > best+1e-9 : score < best-1e-9)) return {text:`${setValueText(v, metric)} would be a new PR 🏆`, tone:'pr'};
    if(!weightRef) return {text:'', tone:'neutral'};
    const parts = [];
    if(loadBased){
      const dw = roundTo((v.weight||0) - (weightRef.set.weight||0), 2);
      if(Math.abs(dw) >= 0.01) parts.push(`${dw>0?'+':'−'}${Math.abs(dw)}${units()}${assisted?' assist':''} vs ${weightRef.label}`);
    }
    const repsRef = [lastRef, prevToday].find(s=> s && (!loadBased || Math.abs((s.weight||0)-(v.weight||0)) < 0.01));
    if(repsRef){
      const label = repsRef===prevToday ? prevLabel : 'last time';
      const dv = val(v) - val(repsRef);
      parts.push(dv>0 ? `+${amount(dv)} vs ${label}` : dv===0 ? `ties ${label}` : `beat ${amount(val(repsRef))} (${label})`);
    }
    if(loadBased && v.reps < planRow.repsMin) parts.push(`below ${planRow.repsMin}–${planRow.repsMax}`);
    else if(loadBased && v.reps > planRow.repsMax) parts.push(`above ${planRow.repsMin}–${planRow.repsMax}`);
    return {text: parts.join(' · ') || `Same as ${weightRef.label}`, tone:'neutral'};
  };
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

