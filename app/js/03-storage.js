/* ============================ §3 STORAGE ============================ */
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function clone(value){ return JSON.parse(JSON.stringify(value)); }
function dateKey(d=new Date()){ const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }
function parseDateKey(dateStr){ return new Date(dateStr+'T00:00:00'); }
function todayKey(){ return dateKey(); }
function weekdayKey(d=new Date()){ return DAY_KEYS[d.getDay()]; }
function units(){ return 'kg'; }

function makeExercise(c){
  return {id:uid(), name:c.name, catalogKey:c.name, primary:c.primary, muscleGroup:c.primary, secondary:(c.secondary||[]).slice(),
    pattern:c.pattern||'other', equipment:c.equipment||'other', equipmentNote:'', tier:c.tier||'isolation',
    metric:c.metric||'weight_reps', popularity:c.popularity||50, notes:'', userAdded:false, flagged:false, metaVersion:2};
}
function seedExercises(){ return CATALOG.map(makeExercise); }
function guessEquipment(text){
  const t = (text||'').toLowerCase();
  if(!t) return null;
  if(t.includes('smith')) return 'smith';
  if(t.includes('cable') || t.includes('pulley')) return 'cable';
  if(t.includes('dumbbell') || t.includes('db')) return 'dumbbell';
  if(t.includes('barbell') || t.includes('ez') || t.includes('bar ')) return 'barbell';
  if(t.includes('kettlebell')) return 'kettlebell';
  if(t.includes('band')) return 'band';
  if(t.includes('bodyweight') || t.includes('body weight')) return 'bodyweight';
  if(t.includes('machine')) return 'machine';
  return null;
}
function defaultPlanSets(){
  const n = DATA && DATA.settings && parseInt(DATA.settings.defaultPlanSets, 10);
  return Math.min(8, Math.max(1, n || 3));
}
function newPlanRow(exerciseId, opts){
  const ex = getExercise(exerciseId);
  const goal = TRAINING.goals[(opts && opts.goal) || 'hypertrophy'];
  const timed = ex && ex.metric==='time';
  const compound = ex && ex.tier==='compound';
  return {
    exerciseId, sets:defaultPlanSets(),
    repsMin: timed?30:(compound?Math.max(4, goal.repsMin-2):goal.repsMin),
    repsMax: timed?60:(compound?goal.repsMax-2:goal.repsMax),
    rpe:null, notes:'', restSeconds:null,
    supersetId:null, oftenDoneAsDropSet:false
  };
}

function seedSplits(exercises){
  const idOf = name => { const e = exercises.find(x=>x.name===name); return e ? e.id : null; };
  const rows = (names, compoundReps, isoReps) => names.map((n,i)=>{
    const id = idOf(n); if(!id) return null;
    const r = i<2 ? compoundReps : isoReps;
    return { exerciseId:id, sets:3, repsMin:r[0], repsMax:r[1], rpe:null, notes:'', supersetId:null, oftenDoneAsDropSet:false };
  }).filter(Boolean);
  const push  = ['Bench Press','Incline Barbell Press','Overhead Press','Lateral Raise','Triceps Pushdown'];
  const pull  = ['Deadlift','Pull-up','Barbell Row','Face Pull','Barbell Curl'];
  const legs  = ['Squat','Romanian Deadlift','Leg Press','Leg Curl','Calf Raise'];
  const core  = ['Plank','Hanging Leg Raise','Cable Crunch','Russian Twist','Ab Wheel Rollout'];
  const upper = ['Bench Press','Barbell Row','Overhead Press','Barbell Curl','Triceps Pushdown','Lateral Raise'];
  const lower = ['Squat','Romanian Deadlift','Leg Press','Leg Curl','Calf Raise'];
  const C=[6,10], I=[10,15];
  return {
    ppl: { label:'PPL', days:{
      mon:{name:'Push', exercises:rows(push,C,I)}, tue:{name:'Pull', exercises:rows(pull,C,I)}, wed:{name:'Legs', exercises:rows(legs,C,I)},
      thu:{name:'Push', exercises:rows(push,C,I)}, fri:{name:'Pull', exercises:rows(pull,C,I)}, sat:{name:'Legs', exercises:rows(legs,C,I)},
      sun:{name:'Rest', exercises:[]}
    }},
    pplul: { label:'PPL + UL', days:{
      mon:{name:'Push', exercises:rows(push,C,I)}, tue:{name:'Pull', exercises:rows(pull,C,I)}, wed:{name:'Legs', exercises:rows(legs,C,I)},
      thu:{name:'Core & Cardio', exercises:rows(core,[12,20],[12,20])}, fri:{name:'Upper', exercises:rows(upper,C,I)},
      sat:{name:'Lower', exercises:rows(lower,C,I)}, sun:{name:'Rest', exercises:[]}
    }}
  };
}

/* Built-in preset: God's Plan (PPL-UL). Added once via migrate if missing. */
function godsPlanRow(exercises, name, sets, repsMin, repsMax, restSeconds, notes, supersetId){
  const ex = exercises.find(x=>x.name===name);
  if(!ex) return null;
  return {
    exerciseId:ex.id, sets, repsMin, repsMax, rpe:null,
    notes:notes||'', restSeconds, supersetId:supersetId||null, oftenDoneAsDropSet:false
  };
}
function buildGodsPlanSplit(exercises){
  const R = (name, sets, a, b, rest, notes, ss)=> godsPlanRow(exercises, name, sets, a, b, rest, notes, ss);
  const wu = n => `Set 1 warmup x${n}`;
  const friArms = 'godsplan-fri-arms';
  const days = {
    mon:{name:'Chest & Triceps', exercises:[
      R('Dumbbell Press',3,8,10,120,wu(10)),
      R('Incline Dumbbell Press',3,8,10,90,wu(10)),
      R('Pec Deck',3,12,15,60,wu(12)),
      R('Triceps Pushdown',3,10,12,60,wu(12)),
      R('Overhead Triceps Extension',2,10,12,60,'Cable or dumbbell')
    ].filter(Boolean)},
    tue:{name:'Back & Biceps', exercises:[
      R('Lat Pulldown',3,8,10,120,wu(10)),
      R('Seated Cable Row',3,8,10,90,wu(10)),
      R('Hyperextension',3,12,15,60,wu(10)+' · weighted'),
      R('Incline Dumbbell Curl',3,10,12,60,wu(10)+' · seated'),
      R('Hammer Curl',2,10,12,45,null),
      R('Preacher Curl',2,10,12,45,null)
    ].filter(Boolean)},
    wed:{name:'Legs & Shoulders', exercises:[
      R('Leg Press',3,10,12,120,wu(10)),
      R('Leg Curl',3,10,12,90,wu(10)+' · seated or lying'),
      R('Leg Extension',3,10,12,60,wu(10)),
      R('Machine Shoulder Press',3,8,10,90,wu(10)+' · or dumbbells'),
      R('Lateral Raise',2,12,15,45,'Dumbbell or cable'),
      R('Rear Delt Fly',2,12,15,45,'Machine or dumbbell'),
      R('Incline Treadmill Walk',1,600,900,0,'10–15 min, easy-moderate incline (5–8%)')
    ].filter(Boolean)},
    thu:{name:'Core & Cardio', exercises:[
      R('Crunch',3,15,20,45,wu(15)),
      R('Hanging Leg Raise',3,12,15,45,wu(12)+' · lying or hanging'),
      R('Russian Twist',3,15,20,45,wu(15)+' · per side, use a plate'),
      R('Plank',2,45,60,45,'Hold'),
      R('Incline Treadmill Walk',1,1200,1500,0,'20–25 min, conversational pace')
    ].filter(Boolean)},
    fri:{name:'Upper', exercises:[
      R('Incline Barbell Press',3,6,8,120,wu(8)),
      R('Pull-up',3,8,10,120,wu(8)+' · add weight if easy, or Lat Pulldown'),
      R('Dumbbell Shoulder Press',3,8,10,90,wu(8)+' · seated'),
      R('Chest-Supported Row',3,8,10,90,wu(8)),
      R('Lateral Raise',2,12,15,45,null),
      R('Face Pull',2,15,15,45,null),
      R('EZ-Bar Curl',2,10,12,45,'Superset with Rope Pushdown',friArms),
      R('Rope Pushdown',2,10,12,45,'Superset with EZ-Bar Curl',friArms)
    ].filter(Boolean)},
    sat:{name:'Lower', exercises:[
      R('Front Squat',3,6,8,150,wu(8)+' · or trap bar deadlift'),
      R('Romanian Deadlift',3,8,10,120,wu(8)),
      R('Bulgarian Split Squat',3,8,10,90,wu(8)+' · per leg'),
      R('Seated Leg Curl',3,10,12,60,wu(10)+' · or lying'),
      R('Standing Calf Raise',2,12,15,45,null),
      R('Cable Crunch',2,12,15,60,'or Hanging Leg Raise')
    ].filter(Boolean)},
    sun:{name:'Rest', exercises:[]}
  };
  return { label:'PPL + UL', days };
}
function ensureGodsPlanPreset(data){
  data.presets = data.presets || [];
  data.settings = data.settings || {};
  if(data.settings.dismissedGodsPlan) return;
  if(data.presets.some(p=>p.id==='builtin-gods-plan' || (p.name||'').trim().toLowerCase()==="god's plan")) return;
  const split = buildGodsPlanSplit(data.exercises);
  data.presets.unshift({
    id:'builtin-gods-plan', name:"God's Plan", subtitle:'PPL-UL', splitKey:'pplul',
    split, savedAt:Date.now()
  });
}

const DEFAULT_USER_NAME = 'User';
function defaultSettings(){
  const goal = TRAINING.goals.hypertrophy;
  return { units:'kg', userName:DEFAULT_USER_NAME, goal:'hypertrophy',
    overload:{ repsToEarnIncrease:goal.repsToEarnIncrease, sessionsRequired:goal.sessionsRequired },
    restDefaultMinutes:3, restNotify:true, restVibrate:true,
    restSetupAsked:false, restBatteryHintDismissed:false,
    weighInDay:'mon', weightReminderSnoozedOn:null, dismissedGodsPlan:false,
    defaultPlanSets:3, demoSeeded:false };
}
function defaultData(){
  const exercises = seedExercises();
  const data = { settings:defaultSettings(), exercises, splits:seedSplits(exercises), activeSplit:'ppl', logs:[], progress:{}, bodyWeight:[], presets:[] };
  ensureGodsPlanPreset(data);
  return data;
}

/* Migration is additive and id-preserving: old saves keep their exercise ids,
   logs and splits. Every new field gets a default here. */
function migrate(data){
  if(data.routineDays && !data.splits){
    data.splits = { ppl:{ label:'PPL', days:data.routineDays }, pplul: seedSplits(data.exercises).pplul };
    data.activeSplit = 'ppl';
    delete data.routineDays;
  }
  if(!data.splits) data.splits = seedSplits(data.exercises);
  if(!data.activeSplit || !data.splits[data.activeSplit]) data.activeSplit = 'ppl';
  if(!data.progress) data.progress = {};
  if(!Array.isArray(data.presets)) data.presets = [];
  data.presets = data.presets.filter(p=>p && p.split && p.split.days);
  data.presets.forEach(p=>{
    if(!p.id) p.id = uid();
    if(typeof p.name !== 'string' || !p.name.trim()) p.name = 'Untitled preset';
    if(typeof p.subtitle !== 'string') p.subtitle = '';
    if(!p.splitKey || !data.splits[p.splitKey]) p.splitKey = data.activeSplit || 'ppl';
  });

  const s = data.settings = data.settings || {};
  s.units = 'kg';
  if(typeof s.userName !== 'string' || !s.userName.trim()) s.userName = DEFAULT_USER_NAME;
  if(!TRAINING.goals[s.goal]) s.goal = 'hypertrophy';
  const preset = TRAINING.goals[s.goal];
  s.overload = s.overload || {};
  if(typeof s.overload.repsToEarnIncrease !== 'number') s.overload.repsToEarnIncrease = preset.repsToEarnIncrease;
  if(typeof s.overload.sessionsRequired !== 'number') s.overload.sessionsRequired = preset.sessionsRequired;
  if(typeof s.restDefaultMinutes !== 'number') s.restDefaultMinutes = 3;
  if(typeof s.restNotify !== 'boolean') s.restNotify = true;
  if(typeof s.restVibrate !== 'boolean') s.restVibrate = true;
  if(typeof s.restSetupAsked !== 'boolean') s.restSetupAsked = false;
  if(typeof s.restBatteryHintDismissed !== 'boolean') s.restBatteryHintDismissed = false;
  if(!DAY_KEYS.includes(s.weighInDay)) s.weighInDay = 'mon';
  if(typeof s.dismissedGodsPlan !== 'boolean') s.dismissedGodsPlan = false;
  if(typeof s.defaultPlanSets !== 'number' || s.defaultPlanSets<1 || s.defaultPlanSets>8) s.defaultPlanSets = 3;
  if(typeof s.demoSeeded !== 'boolean') s.demoSeeded = false;

  if(!Array.isArray(data.bodyWeight)) data.bodyWeight = [];
  data.bodyWeight = data.bodyWeight.filter(e=>e && typeof e.weight==='number' && e.date);
  data.bodyWeight.forEach(e=>{
    if(!e.id) e.id = uid();
    if(typeof e.note !== 'string') e.note = '';
  });

  /* exercises → v2 metadata shape */
  data.exercises.forEach(e=>{
    const meta = CATALOG_BY_NAME[(e.name||'').trim().toLowerCase()];
    if(e.metaVersion !== 2){
      const legacyEquipment = (e.equipment||'').trim();
      if(meta){
        e.primary = meta.primary; e.secondary = meta.secondary.slice();
        e.pattern = meta.pattern; e.tier = meta.tier; e.popularity = meta.popularity;
        if(!e.metric) e.metric = meta.metric;
        if(legacyEquipment && !EQUIPMENT_LABELS[legacyEquipment.toLowerCase()]) e.equipmentNote = legacyEquipment;
        e.equipment = meta.equipment;
      } else {
        e.primary = e.primary || LEGACY_MUSCLE_MAP[e.muscleGroup] || 'Other';
        e.secondary = Array.isArray(e.secondary) ? e.secondary : [];
        e.pattern = e.pattern || 'other';
        e.tier = e.tier || 'isolation';
        e.popularity = typeof e.popularity==='number' ? e.popularity : 50;
        if(EQUIPMENT_LABELS[legacyEquipment.toLowerCase()]) e.equipment = legacyEquipment.toLowerCase();
        else {
          if(legacyEquipment) e.equipmentNote = legacyEquipment;
          e.equipment = guessEquipment(legacyEquipment) || guessEquipment(e.name) || 'other';
        }
      }
      e.userAdded = (typeof e.userAdded==='boolean') ? e.userAdded : !!e.isCustom;
      e.metaVersion = 2;
    }
    if(!e.catalogKey){
      const byName = CATALOG_BY_NAME[(e.name||'').trim().toLowerCase()];
      if(byName) e.catalogKey = byName.name;
    }
    if(!e.metric) e.metric = 'weight_reps';
    if(!e.equipmentNote) e.equipmentNote = '';
    if(typeof e.flagged !== 'boolean') e.flagged = false;
    if(!MUSCLES.includes(e.primary)) e.primary = LEGACY_MUSCLE_MAP[e.primary] || 'Other';
    e.muscleGroup = e.primary; // legacy alias kept in sync
  });

  /* top up the library with catalog movements the user doesn't have */
  const known = new Set();
  data.exercises.forEach(e=>{
    known.add((e.name||'').trim().toLowerCase());
    if(e.catalogKey) known.add(String(e.catalogKey).trim().toLowerCase());
  });
  CATALOG.forEach(c=>{ if(!known.has(c.name.toLowerCase())) data.exercises.push(makeExercise(c)); });

  /* split rows */
  Object.values(data.splits).forEach(split=>{
    DAY_KEYS.forEach(dk=>{
      if(!split.days[dk]) split.days[dk] = {name:'Rest', exercises:[]};
      if(!Array.isArray(split.days[dk].exercises)) split.days[dk].exercises = [];
      split.days[dk].exercises.forEach(row=>{
        if(typeof row.rpe === 'undefined') row.rpe = null;
        if(typeof row.notes !== 'string') row.notes = '';
        if(!row.sets) row.sets = 3;
        if(!row.repsMin) row.repsMin = 8;
        if(!row.repsMax) row.repsMax = 12;
        if(typeof row.restSeconds === 'undefined') row.restSeconds = null; // null = use the global default
        if(typeof row.supersetId === 'undefined') row.supersetId = null;
        if(typeof row.oftenDoneAsDropSet !== 'boolean') row.oftenDoneAsDropSet = false;
      });
    });
  });

  /* logs + sets */
  data.logs.forEach(log=>{
    log.sets.forEach(set=>{
      if(typeof set.difficulty === 'number') set.difficulty = set.difficulty<=4?'easy':(set.difficulty<=7?'med':'hard');
      if(typeof set.isPR !== 'boolean') set.isPR = false;
      if(typeof set.intent === 'undefined') set.intent = null; // 'strength' when the user tags a low-rep set
      if(typeof set.isDropSet !== 'boolean') set.isDropSet = false;
      if(set.isDropSet && !Array.isArray(set.stages)) set.stages = [];
      if(typeof set.isWarmup !== 'boolean') set.isWarmup = false;
    });
    if(typeof log.active !== 'boolean') log.active = false;
    if(typeof log.completed !== 'boolean') log.completed = log.sets.length>0;
    if(typeof log.startedAt === 'undefined') log.startedAt = null;
    if(typeof log.endedAt === 'undefined') log.endedAt = null;
    /* elapsedMs is foreground time only. timerRunningSince is never trusted
       across a launch: a killed WebView must not add the time the app was closed. */
    if(typeof log.elapsedMs !== 'number' || !isFinite(log.elapsedMs) || log.elapsedMs<0){
      log.elapsedMs = (!log.active && log.startedAt && log.endedAt) ? Math.max(0, log.endedAt - log.startedAt) : 0;
    }
    log.timerRunningSince = null;
    if(typeof log.plan === 'undefined') log.plan = null;
    if(typeof log.planName !== 'string') log.planName = '';
    if(!Array.isArray(log.queued)) log.queued = [];
    else log.queued = log.queued.filter(row=>row && row.exerciseId);
    if(!Array.isArray(log.hiddenExerciseIds)) log.hiddenExerciseIds = [];
    if(Array.isArray(log.plan)) log.plan.forEach(row=>{
      if(typeof row.supersetId === 'undefined') row.supersetId = null;
      if(typeof row.oftenDoneAsDropSet !== 'boolean') row.oftenDoneAsDropSet = false;
      if(typeof row.restSeconds === 'undefined') row.restSeconds = null;
      if(typeof row.sessionOnly !== 'boolean') row.sessionOnly = false;
    });
    log.queued.forEach(row=>{
      if(typeof row.sessionOnly !== 'boolean') row.sessionOnly = true;
    });
  });
  /* same field defaults on saved presets */
  (data.presets||[]).forEach(p=>{
    if(!p.split || !p.split.days) return;
    DAY_KEYS.forEach(dk=>{
      (p.split.days[dk] && p.split.days[dk].exercises || []).forEach(row=>{
        if(typeof row.rpe === 'undefined') row.rpe = null;
        if(typeof row.notes !== 'string') row.notes = '';
        if(!row.sets) row.sets = 3;
        if(!row.repsMin) row.repsMin = 8;
        if(!row.repsMax) row.repsMax = 12;
        if(typeof row.restSeconds === 'undefined') row.restSeconds = null;
        if(typeof row.supersetId === 'undefined') row.supersetId = null;
        if(typeof row.oftenDoneAsDropSet !== 'boolean') row.oftenDoneAsDropSet = false;
      });
    });
  });
  ensureGodsPlanPreset(data);
  return data;
}

function loadData(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw){ const fresh = defaultData(); saveData(fresh); return fresh; }
  const stashBroken = ()=>{ try{ localStorage.setItem(STORAGE_KEY+'_broken', raw); }catch(e){} };
  try{
    const parsed = JSON.parse(raw);
    if(!parsed.exercises) throw new Error('unrecognised save shape');
    const migrated = migrate(parsed);
    saveData(migrated);
    return migrated;
  }catch(err){
    console.error(APP_NAME+': storage read failed', err);
    stashBroken();
    const bak = localStorage.getItem(STORAGE_KEY+'_bak');
    if(bak && bak!==raw){
      try{
        const parsed = JSON.parse(bak);
        if(!parsed.exercises) throw new Error('backup unrecognised');
        const recovered = migrate(parsed);
        saveData(recovered);
        setTimeout(()=> showToast('Restored from backup after a save error'), 400);
        return recovered;
      }catch(err2){ console.error(APP_NAME+': backup restore failed', err2); }
    }
    const fresh = defaultData(); saveData(fresh); return fresh;
  }
}
function saveData(data){
  if(dataReady) captureActiveWorkoutElapsed();
  setIndex = null;
  try{
    const next = JSON.stringify(data || DATA);
    const prev = localStorage.getItem(STORAGE_KEY);
    if(prev && prev!==next){
      try{ localStorage.setItem(STORAGE_KEY+'_bak', prev); }catch(e){}
    }
    localStorage.setItem(STORAGE_KEY, next);
  }
  catch(err){ console.error(APP_NAME+': storage write failed', err); showToast('Could not save — storage unavailable'); }
}

/* Derived index: exerciseId → all logged sets (each carrying its date), oldest first.
   Declared before DATA because saveData() invalidates it. Rebuilt lazily. */
let setIndex = null;
let dataReady = false;
let DATA = loadData();
dataReady = true;
function demoExerciseId(name){
  const ex = DATA.exercises.find(e=>(e.name||'')===name);
  return ex ? ex.id : null;
}
function seedDemoHistory(force){
  if(!DATA || !DATA.settings || (DATA.settings.demoSeeded && !force)) return;
  const bench = demoExerciseId('Bench Press');
  const squat = demoExerciseId('Squat');
  const row = demoExerciseId('Barbell Row');
  const ohp = demoExerciseId('Overhead Press');
  const curl = demoExerciseId('Barbell Curl');
  if(!bench || !squat || !row) return;
  const mkSet = (exerciseId, ts, weight, reps, extra)=>{
    extra = extra || {};
    return {id:uid(), exerciseId, difficulty:extra.hard?'hard':'med', intent:null, ts, isPR:!!extra.pr, isDropSet:false, isWarmup:false, weight, reps};
  };
  const mkLog = (date, name, blocks)=>{
    const day = parseDateKey(date);
    const startedAt = day.getTime() + 18*3600*1000;
    const sets = [], plan = [];
    blocks.forEach(b=>{
      if(!b.id) return;
      plan.push({exerciseId:b.id, sets:b.target||3, repsMin:8, repsMax:12, rpe:null, notes:'', restSeconds:null, supersetId:null, oftenDoneAsDropSet:false, sessionOnly:false});
      (b.sets||[]).forEach((s,i)=> sets.push(mkSet(b.id, startedAt+(i+1)*4*60000, s[0], s[1], s[2])));
    });
    return {id:'demo-'+date, date, dayKey:weekdayKey(day), sets, active:false, completed:true,
      startedAt, endedAt:startedAt+55*60000, elapsedMs:48*60000, timerRunningSince:null,
      plan, planName:name, queued:[], hiddenExerciseIds:[]};
  };
  const pack = [
    mkLog('2026-09-26','Push',[{id:bench,target:3,sets:[[80,8],[82.5,8],[82.5,7],[80,6]]},{id:ohp||bench,target:3,sets:[[45,10],[45,9],[45,8]]}]),
    mkLog('2026-09-23','Pull',[{id:row,target:3,sets:[[70,10],[70,9],[70,8]]},{id:curl||row,target:3,sets:[[25,12],[25,11],[25,10]]}]),
    mkLog('2026-09-16','Legs',[{id:squat,target:3,sets:[[100,6],[100,6],[100,5,{hard:true,pr:true}]]}]),
    mkLog('2026-09-08','Push',[{id:bench,target:3,sets:[[77.5,9],[77.5,8],[77.5,8]]}]),
    mkLog('2026-08-19','Pull',[{id:row,target:3,sets:[[67.5,10],[67.5,10],[67.5,9]]}]),
    mkLog('2026-08-04','Legs',[{id:squat,target:3,sets:[[95,8],[95,7],[95,7]]}]),
    mkLog('2026-03-12','Push',[{id:bench,target:3,sets:[[70,10],[70,9],[70,9]]}]),
    mkLog('2025-12-18','Pull',[{id:row,target:3,sets:[[60,10],[60,10],[60,9]]}]),
    mkLog('2025-07-09','Legs',[{id:squat,target:3,sets:[[80,8],[80,8],[80,7]]}])
  ];
  if(!Array.isArray(DATA.logs)) DATA.logs = [];
  pack.forEach(log=>{
    if(!DATA.logs.some(l=>l && (l.id===log.id || (l.date===log.date && l.sets && l.sets.length)))) DATA.logs.push(log);
  });
  DATA.bodyWeight = DATA.bodyWeight || [];
  [['2026-09-21',78.2],['2026-09-14',78.6],['2026-08-17',79.1],['2025-12-15',80.4]].forEach(([date,weight])=>{
    if(!DATA.bodyWeight.some(e=>e && e.date===date)) DATA.bodyWeight.push({id:'demo-bw-'+date, date, weight, note:'demo'});
  });
  DATA.settings.demoSeeded = true;
  saveData(DATA);
}
function buildSetIndex(){
  setIndex = {};
  [...DATA.logs].sort((a,b)=>a.date.localeCompare(b.date)).forEach(log=>{
    log.sets.forEach(set=>{ (setIndex[set.exerciseId] ||= []).push({...set, date:log.date}); });
  });
}
function loggedSetsForExercise(exerciseId){
  if(!setIndex) buildSetIndex();
  return setIndex[exerciseId] || [];
}
function hasHistory(exerciseId){ return loggedSetsForExercise(exerciseId).length>0; }

