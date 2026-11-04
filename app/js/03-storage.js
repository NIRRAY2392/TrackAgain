/* ============================ §3 STORAGE ============================ */
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function clone(value){ return JSON.parse(JSON.stringify(value)); }
function roundTo(value, dp=1){ const f=Math.pow(10,dp); return Math.round(value*f)/f; }
function dateKey(d=new Date()){ const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }
function parseDateKey(dateStr){ return new Date(dateStr+'T00:00:00'); }
function todayKey(){ return dateKey(); }
function weekdayKey(d=new Date()){ return DAY_KEYS[d.getDay()]; }
function daysInclusive(from, to){
  return Math.max(1, Math.round((parseDateKey(to)-parseDateKey(from))/86400000)+1);
}
function units(){ return 'kg'; }

function makeExercise(c){
  return {id:uid(), name:c.name, catalogKey:c.name, primary:c.primary, muscleGroup:c.primary, secondary:(c.secondary||[]).slice(),
    pattern:c.pattern||'other', equipment:c.equipment||'other', equipmentNote:'', tier:c.tier||'isolation',
    metric:c.metric||'weight_reps', popularity:c.popularity||50, notes:'', userAdded:false, flagged:false, loadStep:null,
    defaultPlan:null, metaVersion:2};
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
  const d = liveData();
  const n = d && d.settings && parseInt(d.settings.defaultPlanSets, 10);
  return Math.min(8, Math.max(1, n || 2));
}
/* Saved sets/time on the exercise itself, used when it is not on the split. */
function normalizeDefaultPlan(raw){
  if(!raw || typeof raw!=='object') return null;
  const sets = parseInt(raw.sets, 10);
  const repsMin = parseInt(raw.repsMin, 10);
  const repsMax = parseInt(raw.repsMax, 10);
  if(!(sets>=1) || !(repsMin>=1) || !(repsMax>=1)) return null;
  let restSeconds = null;
  if(raw.restSeconds!=null && raw.restSeconds!==''){
    const n = parseInt(raw.restSeconds, 10);
    if(!isNaN(n) && n>=0) restSeconds = n;
  }
  let rpe = null;
  if(raw.rpe!=null && raw.rpe!==''){
    const n = parseFloat(raw.rpe);
    if(!isNaN(n)) rpe = Math.min(10, Math.max(5, n));
  }
  let loadStep = null;
  if(typeof raw.loadStep==='number' && raw.loadStep>0) loadStep = Math.min(50, roundTo(raw.loadStep, 2));
  const equipment = (typeof raw.equipment==='string' && EQUIPMENT_LABELS[raw.equipment]) ? raw.equipment : null;
  return {
    sets: Math.min(20, sets),
    repsMin: Math.min(repsMin, repsMax),
    repsMax: Math.max(repsMin, repsMax),
    rpe,
    notes: typeof raw.notes==='string' ? raw.notes : '',
    restSeconds,
    loadStep,
    equipment,
    oftenDoneAsDropSet: !!raw.oftenDoneAsDropSet
  };
}
function defaultPlanFromExercise(ex){
  return normalizeDefaultPlan(ex && ex.defaultPlan);
}
function planFieldsFromDefault(plan){
  const p = normalizeDefaultPlan(plan) || {};
  return {
    sets: p.sets||defaultPlanSets(),
    repsMin: p.repsMin||8,
    repsMax: p.repsMax||12,
    rpe: p.rpe!=null ? p.rpe : null,
    notes: p.notes||'',
    restSeconds: p.restSeconds!=null ? p.restSeconds : null,
    loadStep: p.loadStep!=null ? p.loadStep : null,
    equipment: p.equipment || null,
    oftenDoneAsDropSet: !!p.oftenDoneAsDropSet
  };
}
/* A brand-new row, before any split day is copied in. Timed holds are not
   30–60 second strength sets: a walk is one long set, a plank is a short hold.
   A defaultPlan saved on the exercise wins over the built-in numbers. */
function newPlanRow(exerciseId, opts){
  const ex = getExercise(exerciseId);
  const saved = defaultPlanFromExercise(ex);
  if(saved){
    return Object.assign({exerciseId, supersetId:null}, planFieldsFromDefault(saved));
  }
  const goal = TRAINING.goals[(opts && opts.goal) || 'hypertrophy'];
  const name = ((ex && ex.name) || '').toLowerCase();
  const timed = ex && ex.metric==='time';
  const compound = ex && ex.tier==='compound';
  let sets = defaultPlanSets();
  let repsMin = compound ? Math.max(4, goal.repsMin-2) : goal.repsMin;
  let repsMax = compound ? goal.repsMax-2 : goal.repsMax;
  let restSeconds = null;
  if(name.includes('treadmill')){
    sets = 1; repsMin = 600; repsMax = 600; restSeconds = 0;
  } else if(name.includes('plank')){
    sets = 2; repsMin = 45; repsMax = 60;
  } else if(timed){
    sets = 2; repsMin = 30; repsMax = 60;
  }
  return {
    exerciseId, sets, repsMin, repsMax,
    rpe:null, notes:'', restSeconds, loadStep:null, equipment:null,
    supersetId:null, oftenDoneAsDropSet:false
  };
}
function genericTreadmillIds(exercises){
  const ids = new Set();
  (exercises||[]).forEach(e=>{
    if(e && (e.name||'').toLowerCase().includes('treadmill')) ids.add(e.id);
  });
  return ids;
}
/* Rows created by the old timed default: 2 sets of 30–60 seconds. God's Plan
   walks (10–15 and 20–25 min) are left alone. */
function fixGenericTreadmillRow(row, ids){
  if(!row || !ids.has(row.exerciseId)) return;
  if(row.sets===2 && row.repsMin===30 && row.repsMax===60){
    row.sets = 1;
    row.repsMin = 600;
    row.repsMax = 600;
    row.restSeconds = 0;
  }
}
function fixGenericTreadmillRows(data){
  const ids = genericTreadmillIds(data.exercises);
  if(!ids.size) return;
  const daysOf = split=>{
    if(!split || !split.days) return;
    DAY_KEYS.forEach(dk=>{
      const day = split.days[dk];
      if(day && Array.isArray(day.exercises)) day.exercises.forEach(row=> fixGenericTreadmillRow(row, ids));
    });
  };
  Object.values(data.splits||{}).forEach(daysOf);
  (data.presets||[]).forEach(p=> daysOf(p.split));
  (data.logs||[]).forEach(log=>{
    (log.plan||[]).forEach(row=> fixGenericTreadmillRow(row, ids));
    (log.queued||[]).forEach(row=> fixGenericTreadmillRow(row, ids));
  });
}
function warmupLibraryIdFromTitle(title){
  const slug = String(title||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  return slug ? 'wu-'+slug : 'wu-'+uid();
}
function makeWarmupLibraryItem(seed, opts){
  const s = seed || {};
  const o = opts || {};
  const title = (typeof s.title==='string' && s.title.trim()) ? s.title.trim() : 'Warm-up';
  const primaryRaw = o.primary!=null ? o.primary : s.primary;
  const primary = MUSCLES.includes(primaryRaw) ? primaryRaw : 'Other';
  const howToRaw = o.howTo!=null ? o.howTo : s.howTo;
  return {
    id: o.id || s.id || warmupLibraryIdFromTitle(title),
    title,
    detail: typeof s.detail==='string' ? s.detail : '',
    minutes: Math.min(15, Math.max(1, Math.round(Number(s.minutes)||2))),
    primary,
    howTo: typeof howToRaw==='string' ? howToRaw : '',
    userAdded: !!o.userAdded
  };
}
function seedWarmupLibrary(){
  return WARMUP_LIBRARY_SEED.map(s=> makeWarmupLibraryItem(s, {userAdded:false}));
}
function warmupSeedByKey(){
  const map = {};
  WARMUP_LIBRARY_SEED.forEach(seed=>{
    const id = warmupLibraryIdFromTitle(seed.title);
    map[id] = seed;
    map[(seed.title||'').trim().toLowerCase()] = seed;
  });
  return map;
}
function ensureWarmupLibrary(data){
  if(!data) return [];
  if(!Array.isArray(data.warmupLibrary)) data.warmupLibrary = [];
  const seeds = warmupSeedByKey();
  data.warmupLibrary = data.warmupLibrary.map(w=>{
    if(!w || typeof w!=='object') return null;
    const seed = seeds[String(w.id||'').toLowerCase()] || seeds[(w.title||'').trim().toLowerCase()];
    /* Built-ins missing howTo pick it up from the seed on migrate. */
    const howTo = (typeof w.howTo==='string' && w.howTo.trim())
      ? w.howTo
      : (seed && seed.howTo) || '';
    return makeWarmupLibraryItem(Object.assign({}, w, {howTo}), {
      id: w.id || warmupLibraryIdFromTitle(w.title),
      userAdded: !!w.userAdded
    });
  }).filter(Boolean);
  const known = new Set();
  data.warmupLibrary.forEach(w=>{
    known.add((w.title||'').trim().toLowerCase());
    known.add(String(w.id||'').toLowerCase());
  });
  WARMUP_LIBRARY_SEED.forEach(seed=>{
    const titleKey = (seed.title||'').trim().toLowerCase();
    const id = warmupLibraryIdFromTitle(seed.title);
    if(known.has(titleKey) || known.has(id.toLowerCase())) return;
    data.warmupLibrary.push(makeWarmupLibraryItem(seed, {id, userAdded:false}));
    known.add(titleKey);
    known.add(id.toLowerCase());
  });
  return data.warmupLibrary;
}
function liveWarmupLibrary(){
  const d = liveData();
  return (d && Array.isArray(d.warmupLibrary)) ? d.warmupLibrary : [];
}
function getWarmupLibraryItem(id){
  return liveWarmupLibrary().find(w=>w && w.id===id) || null;
}
function warmupsForMuscle(muscle){
  return liveWarmupLibrary().filter(w=> (w.primary||'Other')===muscle)
    .sort((a,b)=> a.title.localeCompare(b.title));
}
function searchWarmups(term, pool){
  const q = String(term||'').trim().toLowerCase();
  const list = pool || liveWarmupLibrary();
  if(!q) return list.slice().sort((a,b)=> a.title.localeCompare(b.title));
  return list.filter(w=>{
    const hay = [w.title, w.detail, w.howTo, w.primary, MUSCLE_REGION[w.primary]||''].join(' ').toLowerCase();
    return hay.includes(q);
  }).sort((a,b)=> a.title.localeCompare(b.title));
}
function warmupSubtitle(w){
  if(!w) return '';
  const bits = [];
  if(w.detail) bits.push(w.detail);
  if(w.minutes) bits.push(`~${w.minutes} min`);
  if(w.primary && w.primary!=='Other') bits.push(w.primary);
  return bits.join(' · ');
}
function resolveWarmupHowTo(row){
  if(!row) return '';
  if(typeof row.howTo==='string' && row.howTo.trim()) return row.howTo.trim();
  if(row.libraryId){
    const lib = getWarmupLibraryItem(row.libraryId);
    if(lib && lib.howTo) return String(lib.howTo).trim();
  }
  const seed = (typeof warmupSeedByKey==='function' ? warmupSeedByKey() : {})[(row.title||'').trim().toLowerCase()];
  return seed && seed.howTo ? String(seed.howTo).trim() : '';
}
function newWarmupRow(partial){
  const p = partial || {};
  const row = {
    id: p.id || uid(),
    title: (typeof p.title==='string' && p.title.trim()) ? p.title.trim() : 'Warm-up',
    detail: typeof p.detail==='string' ? p.detail : '',
    minutes: Math.min(15, Math.max(1, Math.round(Number(p.minutes)||2))),
    howTo: typeof p.howTo==='string' ? p.howTo : ''
  };
  if(p.libraryId) row.libraryId = p.libraryId;
  return row;
}
function newWarmupRowFromLibrary(item){
  if(!item) return newWarmupRow({});
  return newWarmupRow({
    title: item.title,
    detail: item.detail,
    minutes: item.minutes,
    howTo: item.howTo || '',
    libraryId: item.id
  });
}
function normalizeWarmupRow(row){
  if(!row || typeof row!=='object') return null;
  const next = newWarmupRow(row);
  if(!next.howTo) next.howTo = resolveWarmupHowTo(row);
  return next;
}
function warmupNeedsGear(row){
  const text = `${row && row.title || ''} ${row && row.detail || ''}`;
  return /\b(bands?|barbells?|dumbbells?|kettlebells?|cables?|machines?|pushdowns?|smith)\b/i.test(text);
}
function replaceGearWarmups(list, hasExercises){
  const rows = (list||[]).map(normalizeWarmupRow).filter(Boolean);
  if(!rows.some(warmupNeedsGear)) return rows;
  return hasExercises ? basicWarmupsForDay() : rows.filter(w=>!warmupNeedsGear(w));
}
function warmupsMinutes(warmups){
  return (warmups||[]).reduce((sum,w)=> sum + (w && w.minutes ? w.minutes : 0), 0);
}
/* Everyday bodyweight basics — same short list for every training day. */
function basicWarmupsForDay(){
  return WARMUP_BASICS.map(b=> newWarmupRow({
    title: b.title,
    detail: b.detail,
    minutes: b.minutes,
    howTo: b.howTo || '',
    libraryId: warmupLibraryIdFromTitle(b.title)
  }));
}
function warmupTitleKey(row){
  return String(row && row.title || '').trim().toLowerCase();
}
/* True only when the list is still the seeded basics, in that order.
   An edit, add, remove, or reorder in Split counts as that day's own list. */
function isDefaultWarmupList(list){
  const titles = (list||[]).map(warmupTitleKey);
  const basics = WARMUP_BASICS.map(b=> warmupTitleKey(b));
  if(titles.length!==basics.length) return false;
  return titles.every((title,i)=> title===basics[i]);
}
function warmupRowFromSource(item){
  if(!item || warmupNeedsGear(item)) return null;
  if(item.id) return newWarmupRowFromLibrary(item);
  return newWarmupRow({
    title: item.title,
    detail: item.detail,
    minutes: item.minutes,
    howTo: item.howTo || '',
    libraryId: warmupLibraryIdFromTitle(item.title)
  });
}
/* Short bodyweight list for the muscles on this plan.
   One pulse raiser, then one library move per primary muscle (plan order, max 3).
   No exercises returns an empty list. */
function suggestWarmupsForExercises(exercises){
  const rows = exercises || [];
  if(!rows.length) return [];
  const picked = [];
  const used = new Set();
  const add = (item)=>{
    const row = warmupRowFromSource(item);
    if(!row || warmupNeedsGear(row)) return;
    const key = warmupTitleKey(row);
    if(!key || used.has(key)) return;
    used.add(key);
    picked.push(row);
  };
  const lib = liveWarmupLibrary();
  const pulse = lib.find(w=> warmupTitleKey(w)==='easy march or arm circles') || WARMUP_BASICS[0];
  add(pulse);
  const muscles = [];
  rows.forEach(row=>{
    if(typeof getExercise!=='function' || typeof primaryOf!=='function') return;
    const muscle = primaryOf(getExercise(row.exerciseId));
    if(!muscle || muscle==='Other' || muscles.includes(muscle)) return;
    muscles.push(muscle);
  });
  muscles.slice(0, 3).forEach(muscle=>{
    const item = warmupsForMuscle(muscle).find(w=> !used.has(warmupTitleKey(w)) && !warmupNeedsGear(w));
    add(item);
  });
  return picked;
}
function ensureDayWarmups(day, exercises, seedIfMissing, sweepGear){
  if(!day) return day;
  if(!Array.isArray(day.exercises)) day.exercises = [];
  if(!Array.isArray(day.warmups)){
    day.warmups = (seedIfMissing!==false && day.exercises.length)
      ? basicWarmupsForDay()
      : [];
  } else {
    day.warmups = day.warmups.map(normalizeWarmupRow).filter(Boolean);
  }
  if(sweepGear!==false && day.warmups.some(warmupNeedsGear)){
    day.warmups = day.exercises.length ? basicWarmupsForDay() : day.warmups.filter(w=>!warmupNeedsGear(w));
  }
  return day;
}
function ensureSplitWarmups(split, exercises){
  if(!split || !split.days) return split;
  DAY_KEYS.forEach(dk=>{
    if(!split.days[dk]) split.days[dk] = {name:'Rest', exercises:[], warmups:[]};
    ensureDayWarmups(split.days[dk], exercises, true);
  });
  return split;
}

function seedSplits(exercises){
  const idOf = name => { const e = exercises.find(x=>x.name===name); return e ? e.id : null; };
  const rows = (names, compoundReps, isoReps) => names.map((n,i)=>{
    const id = idOf(n); if(!id) return null;
    const r = i<2 ? compoundReps : isoReps;
    return { exerciseId:id, sets:3, repsMin:r[0], repsMax:r[1], rpe:null, notes:'', restSeconds:null, loadStep:null, supersetId:null, oftenDoneAsDropSet:false };
  }).filter(Boolean);
  const push  = ['Bench Press','Incline Barbell Press','Overhead Press','Lateral Raise','Triceps Pushdown'];
  const pull  = ['Deadlift','Pull-up','Barbell Row','Face Pull','Barbell Curl'];
  const legs  = ['Squat','Romanian Deadlift','Leg Press','Leg Curl','Calf Raise'];
  const core  = ['Plank','Hanging Leg Raise','Cable Crunch','Russian Twist','Ab Wheel Rollout'];
  const upper = ['Bench Press','Barbell Row','Overhead Press','Barbell Curl','Triceps Pushdown','Lateral Raise'];
  const lower = ['Squat','Romanian Deadlift','Leg Press','Leg Curl','Calf Raise'];
  const C=[6,10], I=[10,15];
  const ppl = { label:'PPL', days:{
    mon:{name:'Push', exercises:rows(push,C,I)}, tue:{name:'Pull', exercises:rows(pull,C,I)}, wed:{name:'Legs', exercises:rows(legs,C,I)},
    thu:{name:'Push', exercises:rows(push,C,I)}, fri:{name:'Pull', exercises:rows(pull,C,I)}, sat:{name:'Legs', exercises:rows(legs,C,I)},
    sun:{name:'Rest', exercises:[]}
  }};
  const pplul = { label:'PPL + UL', days:{
    mon:{name:'Push', exercises:rows(push,C,I)}, tue:{name:'Pull', exercises:rows(pull,C,I)}, wed:{name:'Legs', exercises:rows(legs,C,I)},
    thu:{name:'Core & Cardio', exercises:rows(core,[12,20],[12,20])}, fri:{name:'Upper', exercises:rows(upper,C,I)},
    sat:{name:'Lower', exercises:rows(lower,C,I)}, sun:{name:'Rest', exercises:[]}
  }};
  return { ppl: ensureSplitWarmups(ppl, exercises), pplul: ensureSplitWarmups(pplul, exercises) };
}

/* God's Plan (PPL-UL): the split new installs start on, and a built-in preset.
   `sets` are working sets; the warm-up note asks for one extra set before them. */
function warmupNote(reps){ return `Warm-up set first, x${reps}`; }
const OLD_WARMUP_NOTE = /^Set 1 warmup x(\d+)/;
function upgradeWarmupNote(row){
  if(row && typeof row.notes==='string') row.notes = row.notes.replace(OLD_WARMUP_NOTE, (_,n)=> warmupNote(n));
}
function godsPlanRow(exercises, name, sets, repsMin, repsMax, restSeconds, notes, supersetId){
  const ex = exercises.find(x=>x.name===name);
  if(!ex) return null;
  return {
    exerciseId:ex.id, sets, repsMin, repsMax, rpe:null,
    notes:notes||'', restSeconds, loadStep:null, supersetId:supersetId||null, oftenDoneAsDropSet:false
  };
}
function buildGodsPlanSplit(exercises){
  const R = (name, sets, a, b, rest, notes, ss)=> godsPlanRow(exercises, name, sets, a, b, rest, notes, ss);
  const wu = n => warmupNote(n);
  const friArms = 'godsplan-fri-arms';
  const days = {
    mon:{name:'Chest & Triceps', exercises:[
      R('Dumbbell Press',2,8,10,120,wu(10)),
      R('Incline Dumbbell Press',2,8,10,90,wu(10)),
      R('Pec Deck',2,12,15,60,wu(12)),
      R('Triceps Pushdown',2,10,12,60,wu(12)),
      R('Overhead Triceps Extension',2,10,12,60,'Cable or dumbbell')
    ].filter(Boolean)},
    tue:{name:'Back & Biceps', exercises:[
      R('Lat Pulldown',2,8,10,120,wu(10)),
      R('Seated Cable Row',2,8,10,90,wu(10)),
      R('Hyperextension',2,12,15,60,wu(10)+' · weighted'),
      R('Incline Dumbbell Curl',2,10,12,60,wu(10)+' · seated'),
      R('Hammer Curl',2,10,12,45,null),
      R('Preacher Curl',2,10,12,45,null)
    ].filter(Boolean)},
    wed:{name:'Legs & Shoulders', exercises:[
      R('Leg Press',2,10,12,120,wu(10)),
      R('Leg Curl',2,10,12,90,wu(10)+' · seated or lying'),
      R('Leg Extension',2,10,12,60,wu(10)),
      R('Machine Shoulder Press',2,8,10,90,wu(10)+' · or dumbbells'),
      R('Lateral Raise',2,12,15,45,'Dumbbell or cable'),
      R('Rear Delt Fly',2,12,15,45,'Machine or dumbbell'),
      R('Incline Treadmill Walk',1,600,600,0,'By feel · easy-moderate incline (5–8%)')
    ].filter(Boolean)},
    thu:{name:'Core & Cardio', exercises:[
      R('Crunch',2,15,20,45,wu(15)),
      R('Hanging Leg Raise',2,12,15,45,wu(12)+' · lying or hanging'),
      R('Russian Twist',2,15,20,45,wu(15)+' · per side, use a plate'),
      R('Plank',2,45,60,45,'Hold'),
      R('Incline Treadmill Walk',1,600,600,0,'By feel · until time is left, conversational pace')
    ].filter(Boolean)},
    fri:{name:'Upper', exercises:[
      R('Incline Barbell Press',2,6,8,120,wu(8)),
      R('Pull-up',2,8,10,120,wu(8)+' · add weight if easy, or Lat Pulldown'),
      R('Dumbbell Shoulder Press',2,8,10,90,wu(8)+' · seated'),
      R('Chest-Supported Row',2,8,10,90,wu(8)),
      R('Lateral Raise',2,12,15,45,null),
      R('Face Pull',2,12,15,45,null),
      R('EZ-Bar Curl',2,10,12,45,'Superset with Rope Pushdown',friArms),
      R('Rope Pushdown',2,10,12,45,'Superset with EZ-Bar Curl',friArms)
    ].filter(Boolean)},
    sat:{name:'Lower', exercises:[
      R('Front Squat',2,6,8,150,wu(8)+' · or trap bar deadlift'),
      R('Romanian Deadlift',2,8,10,120,wu(8)),
      R('Bulgarian Split Squat',2,8,10,90,wu(8)+' · per leg'),
      R('Seated Leg Curl',2,10,12,60,wu(10)+' · or lying'),
      R('Standing Calf Raise',2,12,15,45,null),
      R('Cable Crunch',2,12,15,60,'or Hanging Leg Raise')
    ].filter(Boolean)},
    sun:{name:'Rest', exercises:[]}
  };
  return ensureSplitWarmups({ label:"God's Plan", days }, exercises);
}

/* Light full-body hit list for Something else? after a break.
   Missing catalog names are skipped. */
function buildFullBodyPlan(exercises){
  const note = 'Easy weight · stop 3–4 reps short';
  const R = (name, sets, a, b, rest)=> godsPlanRow(exercises, name, sets, a, b, rest, note);
  return [
    R('Leg Press',2,10,12,120),
    R('Dumbbell Press',2,10,12,90),
    R('Lat Pulldown',2,10,12,90),
    R('Leg Curl',2,10,12,60),
    R('Seated Cable Row',2,10,12,90),
    R('Machine Shoulder Press',2,10,12,60),
    godsPlanRow(exercises, 'Plank', 2, 30, 45, 45, note)
  ].filter(Boolean);
}

/* Saved sessions under Something else? (outside the split).
   warmups:null means "suggest from the exercises" when used. */
const BUILTIN_SESSIONS = [
  {id:'builtin-fullbody', name:'Full Body', build:ex=> buildFullBodyPlan(ex)}
];
function normalizeSessionPlanRow(row){
  if(!row || typeof row!=='object') return null;
  if(typeof row.rpe === 'undefined') row.rpe = null;
  if(typeof row.notes !== 'string') row.notes = '';
  upgradeWarmupNote(row);
  if(!row.sets) row.sets = 3;
  if(!row.repsMin) row.repsMin = 8;
  if(!row.repsMax) row.repsMax = 12;
  if(typeof row.restSeconds === 'undefined') row.restSeconds = null;
  if(typeof row.loadStep !== 'number' || !(row.loadStep > 0)) row.loadStep = null;
  if(typeof row.supersetId === 'undefined') row.supersetId = null;
  if(typeof row.oftenDoneAsDropSet !== 'boolean') row.oftenDoneAsDropSet = false;
  ensureRowEquipment(row);
  return row;
}
function ensureBuiltinSessions(data){
  data.sessions = Array.isArray(data.sessions) ? data.sessions : [];
  const s = data.settings = data.settings || {};
  if(!Array.isArray(s.dismissedSessions)) s.dismissedSessions = [];
  const dismissed = new Set(s.dismissedSessions);
  BUILTIN_SESSIONS.forEach(b=>{
    if(dismissed.has(b.id)) return;
    const existing = data.sessions.find(p=> p && (p.id===b.id || (p.name||'').trim().toLowerCase()===b.name.toLowerCase()));
    if(existing){
      if(!existing.id) existing.id = b.id;
      return;
    }
    data.sessions.push({
      id:b.id,
      name:b.name,
      exercises:b.build(data.exercises || []),
      warmups:null
    });
  });
  data.sessions.forEach(session=>{
    if(!session || typeof session!=='object') return;
    if(!session.id) session.id = uid();
    if(typeof session.name !== 'string' || !session.name.trim()) session.name = 'Session';
    if(!Array.isArray(session.exercises)) session.exercises = [];
    session.exercises.forEach(normalizeSessionPlanRow);
    if(session.warmups!=null){
      if(!Array.isArray(session.warmups)) session.warmups = [];
      else session.warmups = session.warmups.map(normalizeWarmupRow).filter(Boolean);
    }
  });
  data.sessions = data.sessions.filter(p=>p && p.id);
}
function dismissBuiltinSession(session){
  if(!session) return;
  const s = DATA.settings;
  const ids = new Set(Array.isArray(s.dismissedSessions) ? s.dismissedSessions : []);
  BUILTIN_SESSIONS.forEach(b=>{
    if(session.id===b.id || (session.name||'').trim().toLowerCase()===b.name.toLowerCase()) ids.add(b.id);
  });
  s.dismissedSessions = [...ids];
}
function getSession(id){
  return (DATA.sessions||[]).find(s=>s && s.id===id) || null;
}
function warmupsForSession(session){
  if(!session) return [];
  if(Array.isArray(session.warmups)) return clone(session.warmups);
  return suggestWarmupsForExercises(session.exercises || []);
}

/* Presets every install gets. Deleting one records its id in
   settings.dismissedPresets so migrate doesn't add it back. */
const BUILTIN_PRESETS = [
  {id:'builtin-gods-plan', name:"God's Plan", subtitle:'PPL-UL used by Nirbhay Raut', build:ex=> buildGodsPlanSplit(ex)},
  {id:'builtin-ppl',       name:'PPL',        subtitle:'Push, pull, legs, twice a week',        build:ex=> seedSplits(ex).ppl},
  {id:'builtin-pplul',     name:'PPL + UL',   subtitle:'Push, pull, legs, core, upper, lower',  build:ex=> seedSplits(ex).pplul}
];
const PRESETS_VERSION = 4;
function ensureBuiltinPresets(data){
  data.presets = data.presets || [];
  const s = data.settings = data.settings || {};
  const dismissed = new Set(Array.isArray(s.dismissedPresets) ? s.dismissedPresets : []);
  BUILTIN_PRESETS.forEach(b=>{
    if(dismissed.has(b.id)) return;
    const existing = data.presets.find(p=> p.id===b.id || (p.name||'').trim().toLowerCase()===b.name.toLowerCase());
    if(!existing){
      data.presets.push({id:b.id, name:b.name, subtitle:b.subtitle, split:b.build(data.exercises), savedAt:Date.now(), customized:false});
    } else if(existing.id==='builtin-gods-plan' && !existing.customized && (s.presetsVersion||0) < PRESETS_VERSION){
      existing.split = b.build(data.exercises);
      if(!existing.subtitle || existing.subtitle==='PPL-UL') existing.subtitle = b.subtitle;
    }
  });
  s.presetsVersion = PRESETS_VERSION;
}
function dismissBuiltinPreset(preset){
  const s = DATA.settings;
  const ids = new Set(Array.isArray(s.dismissedPresets) ? s.dismissedPresets : []);
  BUILTIN_PRESETS.forEach(b=>{
    if(preset.id===b.id || (preset.name||'').trim().toLowerCase()===b.name.toLowerCase()) ids.add(b.id);
  });
  s.dismissedPresets = [...ids];
}
function builtinPresetDef(preset){
  if(!preset) return null;
  return BUILTIN_PRESETS.find(b=>b.id===preset.id) || null;
}
function presetNameTaken(name, exceptId, presets){
  const key = (name||'').trim().toLowerCase();
  if(!key) return false;
  return (presets||[]).some(p=> p && p.id!==exceptId && (p.name||'').trim().toLowerCase()===key);
}
function availablePresetName(presets, base){
  const root = (base||'').trim() || 'My split';
  if(!presetNameTaken(root, null, presets)) return root;
  const edited = root+' (edited)';
  if(!presetNameTaken(edited, null, presets)) return edited;
  let n = 2;
  while(presetNameTaken(root+' ('+n+')', null, presets)) n++;
  return root+' ('+n+')';
}
/* Week content only. Warm-up ids differ every time a built-in is built,
   so they stay out of the key. */
function splitContentKey(split){
  if(!split || !split.days) return '';
  const rowKey = row=> row ? [
    row.exerciseId||'', row.sets||0, row.repsMin||0, row.repsMax||0,
    row.rpe==null ? null : row.rpe, row.notes||'',
    row.restSeconds==null ? null : row.restSeconds,
    (typeof row.loadStep==='number' && row.loadStep>0) ? row.loadStep : null,
    row.supersetId||null, !!row.oftenDoneAsDropSet, row.equipment||null
  ] : null;
  const warmupKey = row=> row ? [
    (row.title||'').trim(), row.detail||'', row.minutes||0, row.howTo||''
  ] : null;
  return JSON.stringify(DAY_KEYS.map(dk=>{
    const day = split.days[dk] || {name:'Rest', exercises:[], warmups:[]};
    return [day.name||'', (day.exercises||[]).map(rowKey), (day.warmups||[]).map(warmupKey)];
  }));
}
function blankSplit(label){
  const days = {};
  DAY_KEYS.forEach(dk=>{ days[dk] = {name:'Rest', exercises:[], warmups:[]}; });
  return {label:(label||'').trim() || 'Preset', days};
}
/* The week Home follows is the preset in use. After a save the two copies
   in JSON are separate objects again, so this joins them on every load.
   The first time through, an edited week that matches nothing becomes its
   own preset instead of being dropped onto a built-in. */
function linkActivePreset(data){
  if(!data.splits || !data.activeSplit || !data.splits[data.activeSplit]) return;
  data.presets = data.presets || [];
  const live = data.splits[data.activeSplit];
  let preset = data.activePresetId && data.presets.find(p=> p.id===data.activePresetId && p.split && p.split.days);
  if(preset){
    if(splitContentKey(live)!==splitContentKey(preset.split)){
      preset.split = clone(live);
      if(builtinPresetDef(preset)) preset.customized = true;
    }
    preset.split.label = preset.name;
    data.splits[data.activeSplit] = preset.split;
    return;
  }
  const liveKey = splitContentKey(live);
  const matches = data.presets.filter(p=> p.split && p.split.days && splitContentKey(p.split)===liveKey);
  const labelKey = (live.label||'').trim().toLowerCase();
  preset = matches.find(p=> builtinPresetDef(p) && (p.name||'').trim().toLowerCase()===labelKey)
    || matches.find(p=> (p.name||'').trim().toLowerCase()===labelKey)
    || matches.find(p=> builtinPresetDef(p))
    || matches[0]
    || null;
  if(!preset){
    const name = availablePresetName(data.presets, live.label || 'My split');
    preset = {id:uid(), name, subtitle:'', split:live, savedAt:Date.now(), customized:false};
    data.presets.unshift(preset);
  }
  data.activePresetId = preset.id;
  preset.split.label = preset.name;
  data.splits[data.activeSplit] = preset.split;
}

/* The app keeps one weekly split. Older saves had a PPL / PPL + UL switcher:
   the split not in use is dropped if it's still the untouched generic one,
   otherwise it's kept as a preset so no edits are lost. */
function splitSignature(split){
  return JSON.stringify(DAY_KEYS.map(dk=>{
    const day = split.days[dk] || {name:'Rest', exercises:[]};
    return [day.name, (day.exercises||[]).map(r=>[r.exerciseId, r.sets, r.repsMin, r.repsMax])];
  }));
}
function collapseToSingleSplit(data){
  const keys = Object.keys(data.splits);
  if(keys.length <= 1) return;
  const generic = seedSplits(data.exercises);
  keys.filter(k=> k!==data.activeSplit).forEach(k=>{
    const split = data.splits[k];
    const untouched = generic[k] && splitSignature(generic[k])===splitSignature(split);
    if(!untouched){
      data.presets.push({id:uid(), name:`${split.label} (your split)`, subtitle:'Saved from your earlier split', split:clone(split), savedAt:Date.now()});
    }
    delete data.splits[k];
  });
}

const DEFAULT_USER_NAME = 'User';
function defaultSpotterSettings(){
  return { intensity:'normal', haptics:true, sound:false,
    jumps:{ barbell:2.5, dumbbell:2, machine:2.5, cable:2.5, bodyweight:2.5 } };
}
function ensureSpotterSettings(s){
  const d = defaultSpotterSettings();
  if(!s.spotter || typeof s.spotter!=='object') s.spotter = {};
  const sp = s.spotter;
  if(sp.intensity!=='minimal' && sp.intensity!=='normal' && sp.intensity!=='hype') sp.intensity = d.intensity;
  if(typeof sp.haptics!=='boolean') sp.haptics = d.haptics;
  if(typeof sp.sound!=='boolean') sp.sound = d.sound;
  if(!sp.jumps || typeof sp.jumps!=='object') sp.jumps = {};
  Object.keys(d.jumps).forEach(k=>{
    const n = Number(sp.jumps[k]);
    if(!(n>0)) sp.jumps[k] = d.jumps[k];
  });
}
function ensureRowEquipment(row){
  if(!row || typeof row!=='object') return;
  if(typeof row.equipment!=='string' || !EQUIPMENT_LABELS[row.equipment]) row.equipment = null;
}
function defaultSettings(){
  const goal = TRAINING.goals.hypertrophy;
  return { units:'kg', userName:DEFAULT_USER_NAME, goal:'hypertrophy',
    overload:{ repsToEarnIncrease:goal.repsToEarnIncrease, sessionsRequired:goal.sessionsRequired },
    spotter:defaultSpotterSettings(),
    restDefaultMinutes:3, restNotify:true, restSound:'default', restVibrate:true, restAutoStart:true, keepScreenOn:true, fullscreen:true,
    restSetupAsked:false, restBatteryHintDismissed:false,
    weighInDay:'mon', weightReminderSnoozedOn:null, dismissedPresets:[], dismissedSessions:[], presetsVersion:0,
    defaultPlanSets:2, onboarded:false, gender:'unspecified', weightedBwMigrated:true, muscleTagsV2:true, gearWarmupsSwept:true,
    badgesSeen:{}, badgesSeenSeeded:false };
}
const GENDERS = ['unspecified','male','female'];
function defaultSplits(exercises){ return { main: buildGodsPlanSplit(exercises) }; }
function defaultData(){
  const exercises = seedExercises();
  const data = {
    settings:defaultSettings(), exercises, warmupLibrary:seedWarmupLibrary(),
    splits:defaultSplits(exercises), activeSplit:'main', logs:[], progress:{}, bodyWeight:[], presets:[], sessions:[]
  };
  ensureBuiltinPresets(data);
  ensureBuiltinSessions(data);
  linkActivePreset(data);
  return data;
}

/* Migration is additive and id-preserving: old saves keep their exercise ids,
   logs and splits. Every new field gets a default here. */
function migrate(data){
  if(data.routineDays && !data.splits){
    data.splits = { ppl:{ label:'PPL', days:data.routineDays } };
    data.activeSplit = 'ppl';
    delete data.routineDays;
  }
  if(!data.splits || !Object.keys(data.splits).length) data.splits = defaultSplits(data.exercises);
  if(!data.activeSplit || !data.splits[data.activeSplit]) data.activeSplit = Object.keys(data.splits)[0];
  if(!data.progress) data.progress = {};
  ensureWarmupLibrary(data);
  if(!Array.isArray(data.presets)) data.presets = [];
  data.presets = data.presets.filter(p=>p && p.split && p.split.days);
  data.presets.forEach(p=>{
    if(!p.id) p.id = uid();
    if(typeof p.name !== 'string' || !p.name.trim()) p.name = 'Untitled preset';
    if(typeof p.subtitle !== 'string') p.subtitle = '';
    if(typeof p.customized !== 'boolean') p.customized = false;
    delete p.splitKey;
  });

  const s = data.settings = data.settings || {};
  s.units = 'kg';
  if(typeof s.userName !== 'string' || !s.userName.trim()) s.userName = DEFAULT_USER_NAME;
  // Saves from before the welcome screen existed belong to existing users.
  if(typeof s.onboarded !== 'boolean') s.onboarded = true;
  if(!GENDERS.includes(s.gender)) s.gender = 'unspecified';
  if(!TRAINING.goals[s.goal]) s.goal = 'hypertrophy';
  const preset = TRAINING.goals[s.goal];
  s.overload = s.overload || {};
  if(typeof s.overload.repsToEarnIncrease !== 'number') s.overload.repsToEarnIncrease = preset.repsToEarnIncrease;
  if(typeof s.overload.sessionsRequired !== 'number') s.overload.sessionsRequired = preset.sessionsRequired;
  if(typeof s.restDefaultMinutes !== 'number') s.restDefaultMinutes = 3;
  if(typeof s.restNotify !== 'boolean') s.restNotify = true;
  if(s.restSound!=='whistle' && s.restSound!=='default') s.restSound = 'default';
  if(typeof s.restVibrate !== 'boolean') s.restVibrate = true;
  if(typeof s.restAutoStart !== 'boolean') s.restAutoStart = true;
  if(typeof s.keepScreenOn !== 'boolean') s.keepScreenOn = true;
  if(typeof s.restSetupAsked !== 'boolean') s.restSetupAsked = false;
  if(typeof s.restBatteryHintDismissed !== 'boolean') s.restBatteryHintDismissed = false;
  if(!DAY_KEYS.includes(s.weighInDay)) s.weighInDay = 'mon';
  if(!Array.isArray(s.dismissedPresets)) s.dismissedPresets = [];
  if(s.dismissedGodsPlan && !s.dismissedPresets.includes('builtin-gods-plan')) s.dismissedPresets.push('builtin-gods-plan');
  delete s.dismissedGodsPlan;
  if(!Array.isArray(s.dismissedSessions)) s.dismissedSessions = [];
  if(typeof s.presetsVersion !== 'number') s.presetsVersion = 0;
  if(typeof s.defaultPlanSets !== 'number' || s.defaultPlanSets<1 || s.defaultPlanSets>8) s.defaultPlanSets = 2;
  if(typeof s.badgesSeen !== 'object' || !s.badgesSeen || Array.isArray(s.badgesSeen)) s.badgesSeen = {};
  if(typeof s.badgesSeenSeeded !== 'boolean') s.badgesSeenSeeded = false;
  ensureSpotterSettings(s);

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
      const legacyEquipment = String(e.equipment||'').trim();
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
    if(typeof e.loadStep !== 'number' || !(e.loadStep > 0)) e.loadStep = null;
    e.defaultPlan = normalizeDefaultPlan(e.defaultPlan);
    if(!MUSCLES.includes(e.primary)) e.primary = LEGACY_MUSCLE_MAP[e.primary] || 'Other';
    e.muscleGroup = e.primary; // legacy alias kept in sync
  });

  if(!data.settings.weightedBwMigrated){
    const moved = new Set();
    data.exercises.forEach(e=>{
      const key = String(e.catalogKey || e.name || '').trim().toLowerCase();
      if(e.metric==='reps_only' && WEIGHTED_BW_MOVES.has(key)){ e.metric = 'weighted_bw'; moved.add(e.id); }
    });
    (Array.isArray(data.logs) ? data.logs : []).forEach(log=> (log.sets||[]).forEach(set=>{
      if(!set || !moved.has(set.exerciseId)) return;
      if(typeof set.weight !== 'number') set.weight = 0;
      (set.stages||[]).forEach(st=>{ if(st && typeof st.weight !== 'number') st.weight = 0; });
    }));
    data.settings.weightedBwMigrated = true;
  }

  /* top up the library with catalog movements the user doesn't have */
  const known = new Set();
  data.exercises.forEach(e=>{
    known.add((e.name||'').trim().toLowerCase());
    if(e.catalogKey) known.add(String(e.catalogKey).trim().toLowerCase());
  });
  CATALOG.forEach(c=>{ if(!known.has(c.name.toLowerCase())) data.exercises.push(makeExercise(c)); });

  /* Obliques / Neck tags: retag catalog moves once. A user-edited primary stays. */
  if(!data.settings.muscleTagsV2){
    const RETAG_PRIMARY = new Set(['russian twist','side plank','cable woodchop']);
    const ADD_SECONDARY = {
      'hanging leg raise':'Obliques',
      'mountain climber':'Obliques',
      'shrug':'Neck',
      'barbell shrug':'Neck'
    };
    data.exercises.forEach(e=>{
      const key = String(e.catalogKey || e.name || '').trim().toLowerCase();
      const meta = CATALOG_BY_NAME[key];
      if(!meta) return;
      if(RETAG_PRIMARY.has(key) && e.primary==='Abs'){
        e.primary = meta.primary;
        e.secondary = meta.secondary.slice();
        e.muscleGroup = e.primary;
      }
      const add = ADD_SECONDARY[key];
      if(add){
        if(!Array.isArray(e.secondary)) e.secondary = [];
        if(!e.secondary.includes(add) && e.primary!==add) e.secondary.push(add);
      }
    });
    data.settings.muscleTagsV2 = true;
  }

  /* Old builds seeded warm-ups that need gear. Swap those out once; after that a
     user's own warm-up that mentions a band or machine is left alone. */
  const sweepGear = !s.gearWarmupsSwept;
  const migrateDayRows = (day)=>{
    if(!Array.isArray(day.exercises)) day.exercises = [];
    day.exercises = day.exercises.filter(row=> row && typeof row==='object');
    day.exercises.forEach(row=>{
      if(typeof row.rpe === 'undefined') row.rpe = null;
      if(typeof row.notes !== 'string') row.notes = '';
      upgradeWarmupNote(row);
      if(!row.sets) row.sets = 3;
      if(!row.repsMin) row.repsMin = 8;
      if(!row.repsMax) row.repsMax = 12;
      if(typeof row.restSeconds === 'undefined') row.restSeconds = null; // null = use the global default
      if(typeof row.loadStep !== 'number' || !(row.loadStep > 0)) row.loadStep = null;
      if(typeof row.supersetId === 'undefined') row.supersetId = null;
      if(typeof row.oftenDoneAsDropSet !== 'boolean') row.oftenDoneAsDropSet = false;
      ensureRowEquipment(row);
    });
    ensureDayWarmups(day, data.exercises, true, sweepGear);
  };

  /* split rows */
  Object.values(data.splits).forEach(split=>{
    if(!split.days || typeof split.days!=='object') split.days = {};
    DAY_KEYS.forEach(dk=>{
      if(!split.days[dk]) split.days[dk] = {name:'Rest', exercises:[], warmups:[]};
      migrateDayRows(split.days[dk]);
    });
  });

  /* logs + sets */
  if(!Array.isArray(data.logs)) data.logs = [];
  data.logs = data.logs.filter(log=> log && typeof log==='object');
  data.logs.forEach(log=>{
    if(!Array.isArray(log.sets)) log.sets = [];
    log.sets = log.sets.filter(set=> set && typeof set==='object');
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
    /* The workout clock is wall time. An active log keeps timerRunningSince
       across a relaunch; maybeTrimAwayTime removes long idle gaps. */
    if(typeof log.elapsedMs !== 'number' || !isFinite(log.elapsedMs) || log.elapsedMs<0){
      log.elapsedMs = (!log.active && log.startedAt && log.endedAt) ? Math.max(0, log.endedAt - log.startedAt) : 0;
    }
    if(!log.active || typeof log.timerRunningSince!=='number' || !isFinite(log.timerRunningSince)) log.timerRunningSince = null;
    if(typeof log.plan === 'undefined') log.plan = null;
    if(typeof log.planName !== 'string') log.planName = '';
    if(typeof log.customSession !== 'boolean') log.customSession = false;
    if(log.sessionKind==='fullbody' && !log.sessionId) log.sessionId = 'builtin-fullbody';
    delete log.sessionKind;
    if(typeof log.sessionId !== 'string' || !log.sessionId) log.sessionId = null;
    if(!Array.isArray(log.queued)) log.queued = [];
    else log.queued = log.queued.filter(row=>row && row.exerciseId);
    if(!Array.isArray(log.hiddenExerciseIds)) log.hiddenExerciseIds = [];
    if(Array.isArray(log.plan)) log.plan.forEach(row=>{
      upgradeWarmupNote(row);
      if(typeof row.supersetId === 'undefined') row.supersetId = null;
      if(typeof row.oftenDoneAsDropSet !== 'boolean') row.oftenDoneAsDropSet = false;
      if(typeof row.restSeconds === 'undefined') row.restSeconds = null;
      if(typeof row.loadStep !== 'number' || !(row.loadStep > 0)) row.loadStep = null;
      if(typeof row.sessionOnly !== 'boolean') row.sessionOnly = false;
      ensureRowEquipment(row);
    });
    if(Array.isArray(log.warmups)){
      if(sweepGear){
        const hadGear = log.warmups.some(warmupNeedsGear);
        log.warmups = replaceGearWarmups(log.warmups, true);
        if(hadGear) log.warmupDone = [];
      } else log.warmups = log.warmups.map(normalizeWarmupRow).filter(Boolean);
    } else log.warmups = null;
    if(!Array.isArray(log.warmupDone)) log.warmupDone = [];
    log.queued.forEach(row=>{
      if(typeof row.sessionOnly !== 'boolean') row.sessionOnly = true;
      ensureRowEquipment(row);
    });
  });
  /* same field defaults on saved presets */
  (data.presets||[]).forEach(p=>{
    if(!p.split || !p.split.days) return;
    DAY_KEYS.forEach(dk=>{
      if(p.split.days[dk]) migrateDayRows(p.split.days[dk]);
    });
  });
  s.gearWarmupsSwept = true;
  collapseToSingleSplit(data);
  ensureBuiltinPresets(data);
  ensureBuiltinSessions(data);
  fixGenericTreadmillRows(data);
  linkActivePreset(data);
  return data;
}

/* While loadData() runs, DATA is not assigned yet and reading it throws.
   Helpers that migrate() reaches read the save being migrated through this instead. */
function liveData(){ return dataReady ? DATA : loadingData; }
function parseAndMigrate(text, what){
  const parsed = JSON.parse(text);
  if(!parsed || !parsed.exercises) throw new Error(what+' unrecognised');
  loadingData = parsed;
  try{ return migrate(parsed); }
  finally{ loadingData = null; }
}
function hasLoggedWork(data){
  return Array.isArray(data && data.logs) && data.logs.some(l=> l && Array.isArray(l.sets) && l.sets.length);
}
/* A launch that could not read the save parks it under _broken. Bring it back on a
   later launch if it now loads and the current save has no workouts of its own. */
function recoverBrokenSave(current){
  const broken = localStorage.getItem(STORAGE_KEY+'_broken');
  if(!broken || hasLoggedWork(current)) return current;
  try{
    const recovered = parseAndMigrate(broken, 'parked save');
    if(!hasLoggedWork(recovered)) return current;
    localStorage.removeItem(STORAGE_KEY+'_broken');
    setTimeout(()=> showToast('Recovered your saved workouts'), 400);
    return recovered;
  }catch(err){
    console.error(APP_NAME+': parked save still unreadable', err);
    return current;
  }
}
function loadData(){
  const raw = localStorage.getItem(STORAGE_KEY);
  let data = null, justParked = false;
  if(raw){
    try{ data = parseAndMigrate(raw, 'save'); }
    catch(err){
      console.error(APP_NAME+': storage read failed', err);
      try{ localStorage.setItem(STORAGE_KEY+'_broken', raw); justParked = true; }catch(e){}
      const bak = localStorage.getItem(STORAGE_KEY+'_bak');
      if(bak && bak!==raw){
        try{
          data = parseAndMigrate(bak, 'backup');
          setTimeout(()=> showToast('Restored from backup after a save error'), 400);
        }catch(err2){ console.error(APP_NAME+': backup restore failed', err2); }
      }
      if(!data) setTimeout(()=> showToast('Could not read your saved data. A copy was kept to recover later.'), 400);
    }
  }
  if(!data) data = defaultData();
  if(!justParked) data = recoverBrokenSave(data);
  saveData(data);
  return data;
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
  catch(err){
    console.error(APP_NAME+': storage write failed', err);
    if(typeof showToast==='function') showToast('Could not save — storage unavailable');
  }
}

/* Derived index: exerciseId → all logged sets (each carrying its date), oldest first.
   Declared before DATA because saveData() invalidates it. Rebuilt lazily. */
let setIndex = null;
let dataReady = false;
let loadingData = null;
let DATA = loadData();
dataReady = true;
/* Older builds seeded sample workouts (ids "demo-<date>") and weigh-ins
   ("demo-bw-<date>"). Remove them and re-rank PRs without them. Runs from
   §10 because recomputePRs lives in §5. */
function purgeDemoData(){
  const isDemo = id=> typeof id==='string' && id.startsWith('demo-');
  const demoLogs = DATA.logs.filter(l=> isDemo(l.id));
  const demoWeights = DATA.bodyWeight.filter(e=> isDemo(e.id));
  const hadFlag = 'demoSeeded' in DATA.settings;
  if(!demoLogs.length && !demoWeights.length && !hadFlag) return;
  const touched = new Set(demoLogs.flatMap(l=> l.sets.map(s=> s.exerciseId)));
  DATA.logs = DATA.logs.filter(l=> !isDemo(l.id));
  DATA.bodyWeight = DATA.bodyWeight.filter(e=> !isDemo(e.id));
  delete DATA.settings.demoSeeded;
  touched.forEach(id=> recomputePRs(id));
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

