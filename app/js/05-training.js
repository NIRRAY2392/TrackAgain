/* ======================== §5 TRAINING RULES ========================
   Everything that decides "how good was that set" and "what next" lives
   here. No DOM access in this section. */

/* ===== SPOTTER ENGINE (pure functions) =====
   Double progression for the next session and the set just logged.
   No DOM, no localStorage, no app data. Callers pass plain objects. */

function spotterFeel(value){
  if(value==null || value==='') return 'med';
  const k = String(value).toLowerCase();
  if(k==='easy' || k==='e') return 'easy';
  if(k==='hard' || k==='h') return 'hard';
  if(k==='med' || k==='medium' || k==='m') return 'med';
  return 'med';
}
function spotterRoundToJump(weight, jump){
  const j = jump > 0 ? jump : 2.5;
  const steps = Math.round((Number(weight) / j) + 1e-9);
  return Math.round(steps * j * 100) / 100;
}
function spotterNum(n){
  if(n==null || !isFinite(Number(n))) return '';
  const r = Math.round(Number(n) * 100) / 100;
  return Math.abs(r - Math.round(r)) < 0.001 ? String(Math.round(r)) : String(r);
}
function spotterKg(n){
  const t = spotterNum(n);
  return t ? t + ' kg' : '';
}
function spotterRangeText(min, max){
  const a = Math.round(Number(min)||0), b = Math.round(Number(max)||0);
  const lo = Math.min(a,b), hi = Math.max(a,b);
  return lo===hi ? String(lo) : lo + '–' + hi;
}
function spotterTargetText(targets){
  if(!targets || !targets.length) return '';
  const labels = targets.map(t => spotterRangeText(t[0], t[1]));
  return labels.every(l => l===labels[0]) ? labels[0] : labels.join(', ');
}
function spotterEquipBucket(equipment){
  const e = String(equipment||'').toLowerCase();
  if(e==='barbell' || e==='smith' || e==='bb') return 'barbell';
  if(e==='dumbbell' || e==='kettlebell' || e==='db') return 'dumbbell';
  if(e==='cable' || e==='band') return 'cable';
  if(e==='bodyweight' || e==='bw') return 'bodyweight';
  return 'machine';
}
function spotterInferEquipment(name){
  const t = String(name||'').toLowerCase();
  if(!t) return null;
  if(/\b(barbell|bb)\b/.test(t) || t.includes('barbell')) return 'barbell';
  if(/\b(dumbbell|db)\b/.test(t) || t.includes('dumbbell')) return 'dumbbell';
  if(t.includes('cable')) return 'cable';
  if(t.includes('machine') || t.includes('leg press') || t.includes('pec deck') || t.includes('pulldown')) return 'machine';
  if(/pull-?up|chin-?up|\bdips?\b|push-?up|plank/.test(t)) return 'bodyweight';
  return null;
}
/* Plan-row override, then the library, then the name, then machine.
   A catalog equipment value is never replaced by a name guess. */
function spotterEquipment(row, exercise){
  if(row && typeof row.equipment==='string' && row.equipment) return row.equipment;
  const lib = exercise && exercise.equipment;
  if(lib && lib!=='other') return lib;
  return spotterInferEquipment(exercise && exercise.name) || lib || 'machine';
}
function spotterParseRange(text){
  if(text==null || text==='') return null;
  if(typeof text==='number' && isFinite(text)){
    const n = Math.round(text);
    if(n<=0) return null;
    return [Math.max(1, n-2), n];
  }
  const s = String(text).trim().toLowerCase().replace(/[–—]/g,'-');
  const pair = s.match(/(\d+)\s*(?:-|to)\s*(\d+)/);
  if(pair){
    const a = parseInt(pair[1],10), b = parseInt(pair[2],10);
    if(a>0 && b>0) return [Math.min(a,b), Math.max(a,b)];
  }
  if(/^\d+$/.test(s)){
    const n = parseInt(s,10);
    return [Math.max(1, n-2), n];
  }
  return null;
}
function spotterRepRange(row, exercise){
  const min = row && row.repsMin, max = row && row.repsMax;
  if(typeof min==='number' && typeof max==='number' && min>0 && max>0)
    return [Math.min(min,max), Math.max(min,max)];
  const parsed = spotterParseRange(row && (row.reps!=null ? row.reps : row.repRange));
  if(parsed) return parsed;
  if(typeof min==='string' || typeof max==='string'){
    const joined = (min!=null && max!=null) ? (min+' to '+max) : (min!=null ? min : max);
    const fromText = spotterParseRange(joined);
    if(fromText) return fromText;
  }
  if(typeof min==='number' && min>0 && (max==null || max==='')) return [Math.max(1, Math.round(min)-2), Math.round(min)];
  const name = String((exercise && exercise.name) || (row && row.name) || '').toLowerCase();
  if(/curl|raise|extension|fly|kickback|pushdown|calf/.test(name)) return [10,15];
  if(spotterEquipBucket(spotterEquipment(row, exercise))==='barbell') return [6,10];
  return [8,12];
}
function spotterParseDate(v){
  if(v instanceof Date && !isNaN(v.getTime())){
    const d = new Date(v.getTime()); d.setHours(0,0,0,0); return d;
  }
  if(typeof v==='string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return new Date(v.slice(0,10)+'T00:00:00');
  return null;
}
function spotterGapDays(from, today){
  const a = spotterParseDate(from), b = spotterParseDate(today);
  if(!a || !b) return null;
  return Math.round((b.getTime()-a.getTime())/86400000);
}
function spotterWorkingFromRaw(sets, opts){
  const repsOnly = !!(opts && opts.repsOnly);
  const out = [];
  (sets||[]).forEach(set=>{
    if(!set || set.isWarmup || set.dropSegment || set.isDropSegment) return;
    let reps, weight, feel, ts, isPR, id;
    if(set.isDropSet){
      const top = set.stages && set.stages[0];
      if(!top) return;
      reps = Number(top.reps);
      weight = Number(top.weight);
      if(repsOnly && !isFinite(weight)) weight = 0;
      feel = spotterFeel(set.difficulty!=null ? set.difficulty : set.feel);
      ts = set.ts||0; isPR = !!set.isPR; id = set.id||null;
    } else {
      reps = Number(set.reps);
      weight = Number(set.weight);
      if(repsOnly && !isFinite(weight)) weight = 0;
      feel = spotterFeel(set.difficulty!=null ? set.difficulty : (set.feel!=null ? set.feel : null));
      ts = set.ts||0; isPR = !!set.isPR; id = set.id||null;
    }
    if(!(reps>0) || !isFinite(weight) || weight<0) return;
    out.push({reps, weight, feel, ts, isPR, id});
  });
  return out;
}
/* One past session: the most common working weight, and the sets at that weight. */
function spotterNormalise(sets, meta){
  meta = meta || {};
  const working = spotterWorkingFromRaw(sets, {repsOnly: !!meta.repsOnly});
  if(!working.length) return null;
  const freq = new Map();
  working.forEach(s=>{
    const key = String(s.weight);
    const row = freq.get(key) || {w:s.weight, n:0};
    row.n += 1;
    freq.set(key, row);
  });
  let W = working[0].weight, bestN = -1;
  freq.forEach(row=>{
    if(row.n>bestN || (row.n===bestN && row.w>W)){ bestN = row.n; W = row.w; }
  });
  const atW = working.filter(s=> Math.abs(s.weight-W)<0.001);
  const total = atW.reduce((sum,s)=> sum+s.reps, 0);
  return {
    date: meta.date || null,
    id: meta.id || null,
    startedAt: meta.startedAt || 0,
    W, n: atW.length, total,
    sets: atW.map(s=>({reps:s.reps, feel:s.feel}))
  };
}
function spotterSameWeight(a, b){ return Math.abs(Number(a)-Number(b))<0.001; }
function spotterFillTargets(planned, sets, build){
  const list = [];
  const last = Math.max(0, (sets && sets.length) ? sets.length-1 : 0);
  for(let i=0;i<planned;i++){
    const src = sets && sets.length ? sets[Math.min(i, last)] : null;
    list.push(build(src, i));
  }
  return list;
}
function spotterAddRepTarget(src, maxR){
  const reps = src ? src.reps : maxR;
  const feel = src ? src.feel : 'med';
  const delta = feel==='easy' ? 2 : feel==='hard' ? 0 : 1;
  const t = Math.min(maxR, reps + delta);
  return [t, t];
}
function spotterStartPlan(hist, plannedSets, range, jump, today, opts){
  opts = opts || {};
  const minR = range[0], maxR = range[1];
  const planned = Math.max(1, plannedSets||1);
  const step = jump>0 ? jump : 2.5;
  const bodyweight = !!opts.bodyweight;
  hist = (hist||[]).filter(Boolean);
  const blankTargets = spotterFillTargets(planned, [], ()=> [minR, maxR]);
  if(!hist.length){
    return {kind:'NEW_LIFT', message:'PLAN_NEW_LIFT', weight:null, targets:blankTargets, jump:step, gapDays:null, bodyweightBump:false};
  }
  const last = hist[0];
  const W = Number(last.W)||0;
  const sets = last.sets || [];
  const gapDays = spotterGapDays(last.date, today);
  const enough = last.n >= Math.min(2, planned);
  const allTop = enough && sets.length>0 && sets.every(s=> s.reps>=maxR);
  const allEasy = sets.length>0 && sets.every(s=> s.feel==='easy');
  const mid = Math.ceil((minR+maxR)/2);
  const easyOverride = enough && allEasy && sets.every(s=> s.reps>=mid);
  const overshoot = allEasy && sets.every(s=> s.reps>=maxR+3);
  const bwZero = bodyweight && !(W>0);
  let plan;
  if(allTop || easyOverride){
    const steps = overshoot ? 2 : 1;
    plan = {
      kind:'BUMP', message:'PLAN_BUMP', jump:step,
      weight: bwZero ? 0 : spotterRoundToJump(W + steps*step, step),
      targets: spotterFillTargets(planned, sets, ()=> [minR, Math.min(maxR, minR+2)]),
      bodyweightBump: bwZero
    };
  } else if(sets.some(s=> s.reps<minR)){
    const prev = hist[1];
    const prevMiss = !!(prev && spotterSameWeight(prev.W, W) && (prev.sets||[]).some(s=> s.reps<minR));
    if(prevMiss){
      if(bwZero){
        plan = {kind:'DELOAD', message:'PLAN_DELOAD', weight:0, jump:step, bodyweightBump:false,
          targets: spotterFillTargets(planned, sets, ()=> [minR, Math.min(maxR, minR+2)])};
      } else {
        const delta = Math.max(step, spotterRoundToJump(0.05*W, step));
        let weight = spotterRoundToJump(W - delta, step);
        if(weight >= W-1e-6) weight = spotterRoundToJump(W - step, step);
        if(weight<0) weight = 0;
        plan = {kind:'DELOAD', message:'PLAN_DELOAD', weight, jump:step, bodyweightBump:false,
          targets: spotterFillTargets(planned, sets, ()=> [minR, Math.min(maxR, minR+2)])};
      }
    } else {
      plan = {kind:'HOLD', message:'PLAN_HOLD', weight:W, jump:step, bodyweightBump:false,
        targets: spotterFillTargets(planned, sets, src=>{
          const t = Math.max(minR, src ? src.reps : minR);
          return [t, t];
        })};
    }
  } else {
    const sameW = [];
    for(let i=0;i<hist.length;i++){
      if(spotterSameWeight(hist[i].W, W)) sameW.push(hist[i]);
      else break;
    }
    let stallCount = 0;
    for(let i=0;i<sameW.length-1;i++){
      if(sameW[i].total <= sameW[i+1].total) stallCount++;
      else break;
    }
    if(stallCount>=3){
      plan = {kind:'RESET', message:'PLAN_RESET', jump:step, bodyweightBump:false,
        weight: bwZero ? 0 : Math.max(step, spotterRoundToJump(W*0.9, step)),
        targets: spotterFillTargets(planned, sets, ()=> [minR, Math.min(maxR, minR+2)])};
    } else if(stallCount===2){
      plan = {kind:'PLATEAU', message:'PLAN_PLATEAU', weight:W, jump:step, bodyweightBump:false,
        targets: spotterFillTargets(planned, sets, src=> spotterAddRepTarget(src, maxR))};
    } else {
      plan = {kind:'ADD_REPS', message:'PLAN_ADD_REPS', weight:W, jump:step, bodyweightBump:false,
        targets: spotterFillTargets(planned, sets, src=> spotterAddRepTarget(src, maxR))};
    }
  }
  plan.gapDays = gapDays;
  if(gapDays!=null && gapDays>28){
    const dropped = bwZero ? 0 : spotterRoundToJump(W*0.9, step);
    plan = {kind:'COMEBACK', message:'PLAN_COMEBACK', weight:dropped, jump:step, gapDays, gentle:false, bodyweightBump:false,
      targets: spotterFillTargets(planned, sets, ()=> [minR, Math.min(maxR, minR+2)])};
  } else if(gapDays!=null && gapDays>=15 && gapDays<=28 && plan.kind==='BUMP'){
    plan = {kind:'COMEBACK', message:'PLAN_COMEBACK', weight:W, jump:step, gapDays, gentle:true, bodyweightBump:false,
      targets: spotterFillTargets(planned, sets, ()=> [Math.max(minR, maxR-2), maxR])};
  }
  return plan;
}
function spotterOrderPair(lo, hi){
  return lo<=hi ? [lo, hi] : [hi, lo];
}
/* The set just logged. Warm-ups and dropped segments return a silent tick. */
function spotterLive(plan, todayWorking, justLogged, lastSession, range, opts){
  opts = opts || {};
  plan = plan || {};
  const minR = range[0], maxR = range[1];
  const step = (plan.jump>0 ? plan.jump : (opts.jump>0 ? opts.jump : 2.5));
  const planned = Math.max(1, opts.plannedSets || (plan.targets ? plan.targets.length : 1));
  if(!justLogged || justLogged.warmup || justLogged.isWarmup || justLogged.dropSegment || justLogged.isDropSegment){
    return {silent:true, type:null, status:null, nextWeight:null, nextTarget:null, lastTime:null, wrap:null, prCopyKey:null};
  }
  const working = todayWorking || [];
  const idx = Math.max(0, working.length-1);
  const reps = Number(justLogged.reps)||0;
  const weight = Number(justLogged.weight);
  const feel = spotterFeel(justLogged.feel!=null ? justLogged.feel : justLogged.difficulty);
  const targets = plan.targets || [];
  const target = targets[Math.min(idx, Math.max(0, targets.length-1))] || [minR, maxR];
  let status = 'on';
  if(reps < target[0]) status = 'below';
  else if(reps > target[1]) status = 'beat';
  const first = idx===0;
  const bwZero = !!opts.bodyweight && !(weight>0);
  let nextWeight = isFinite(weight) ? weight : (plan.weight!=null ? plan.weight : 0);
  let adjust = null;
  if(first && feel==='easy' && reps >= maxR+2){
    adjust = 'TOO_LIGHT';
    nextWeight = bwZero ? 0 : spotterRoundToJump(weight + step, step);
  } else if(first && feel==='hard' && reps < minR){
    adjust = 'TOO_HEAVY';
    nextWeight = bwZero ? 0 : Math.max(0, spotterRoundToJump(weight - step, step));
  }
  let nextTarget;
  if(feel==='hard') nextTarget = spotterOrderPair(Math.max(minR, reps-2), Math.max(minR, reps-1));
  else if(feel==='easy') nextTarget = spotterOrderPair(reps, Math.min(maxR, reps+1));
  else nextTarget = spotterOrderPair(Math.max(minR, reps-1), reps);
  const lastTime = lastSession && lastSession.sets && lastSession.sets[idx] ? lastSession.sets[idx].reps : null;
  const isLast = working.length===planned;
  const isExtra = working.length>planned;
  const counted = working.slice(0, planned);
  let wrap = null;
  if(counted.length===planned){
    const freq = new Map();
    counted.forEach(s=>{
      const row = freq.get(String(s.weight)) || {w:Number(s.weight)||0, n:0};
      row.n += 1; freq.set(String(s.weight), row);
    });
    let todayW = Number(counted[0].weight)||0, bestN = -1;
    freq.forEach(row=>{
      if(row.n>bestN || (row.n===bestN && row.w>todayW)){ bestN = row.n; todayW = row.w; }
    });
    const atW = counted.filter(s=> spotterSameWeight(s.weight, todayW));
    const total = atW.reduce((sum,s)=> sum + (Number(s.reps)||0), 0);
    const earnedBump = atW.length>0 && atW.every(s=> s.reps>=maxR);
    let cmp = 'same';
    if(lastSession){
      const up = todayW > lastSession.W+0.001 || (spotterSameWeight(todayW, lastSession.W) && total > lastSession.total);
      const down = todayW < lastSession.W-0.001 || total < lastSession.total;
      cmp = up ? 'progress' : down ? 'light' : 'same';
    }
    const bwBump = !!(opts.bodyweight && !(todayW>0) && earnedBump);
    wrap = {
      cmp, earnedBump, bodyweightBump: bwBump,
      nextWeight: earnedBump ? (bwBump ? 0 : spotterRoundToJump(todayW + step, step)) : todayW,
      nextReps: minR,
      repsDelta: lastSession ? total - lastSession.total : null,
      weightDelta: lastSession ? Math.round((todayW-lastSession.W)*100)/100 : null
    };
  }
  let prCopyKey = null;
  if(justLogged.isPR && !justLogged.isWarmup && !justLogged.isDropSet){
    prCopyKey = opts.prKind || (opts.prior ? spotterPrKind(justLogged, opts.prior, minR) : null) || 'PR_E1RM';
  }
  let type = 'SET_ON_TARGET';
  if(prCopyKey) type = prCopyKey;
  else if(wrap && wrap.earnedBump && !isExtra) type = 'BUMP_UNLOCKED';
  else if(adjust==='TOO_HEAVY') type = 'SET_TOO_HEAVY';
  else if(adjust==='TOO_LIGHT') type = 'SET_TOO_LIGHT';
  else if(status==='below') type = 'SET_BELOW_TARGET';
  else if(isLast && !isExtra) type = wrap.cmp==='progress' ? 'WRAP_EX_PROGRESS' : wrap.cmp==='light' ? 'WRAP_EX_LIGHT' : 'WRAP_EX_SAME';
  else if(status==='beat') type = 'SET_BEAT_TARGET';
  else if(feel==='hard') type = 'SET_GRIND';
  return {silent:false, type, status, nextWeight, nextTarget, lastTime, wrap, prCopyKey, adjust, idx, target, feel};
}
/* Read-only PR kind. The first working set of an exercise is a baseline, not a PR.
   Warm-ups and dropped segments are ignored. Drop-set tops count as working sets. */
function spotterPrKind(set, prior, minR){
  const curList = spotterWorkingFromRaw([set]);
  if(!curList.length) return null;
  const cur = curList[0];
  const past = spotterWorkingFromRaw(prior||[]);
  if(!past.length) return null;
  const floor = minR>0 ? minR : 1;
  const priorQualified = past.filter(s=> s.reps>=floor);
  const bestW = priorQualified.reduce((m,s)=> Math.max(m, s.weight), -Infinity);
  const isWeight = cur.reps>=floor && priorQualified.length>0 && cur.weight > bestW+0.001;
  const same = past.filter(s=> spotterSameWeight(s.weight, cur.weight));
  const bestReps = same.reduce((m,s)=> Math.max(m, s.reps), 0);
  const isReps = same.length>0 && cur.reps > bestReps;
  let isE1 = false;
  if(cur.reps<=12 && cur.weight>0){
    const e1 = cur.weight * (1 + cur.reps/30);
    let prevBest = -Infinity, any = false;
    past.forEach(s=>{
      if(!(s.reps>0) || s.reps>12 || !(s.weight>0)) return;
      any = true;
      prevBest = Math.max(prevBest, s.weight * (1 + s.reps/30));
    });
    isE1 = any && e1 > prevBest+1e-6;
  }
  if(isWeight) return 'PR_WEIGHT';
  if(isE1) return 'PR_E1RM';
  if(isReps) return 'PR_REPS';
  return null;
}
function spotterClip(text, max){
  const s = String(text||'').replace(/\s+/g,' ').trim();
  if(s.length<=max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp > Math.floor(max*0.55) ? cut.slice(0, sp) : cut).replace(/[.,;:]+$/,'').trim();
}
function spotterFill(str, ctx){
  const raw = String(str==null ? '' : str).replace(/\{(\w+)\}/g, (_, k)=>{
    return ctx && ctx[k]!=null ? String(ctx[k]) : '';
  });
  return raw.replace(/\s{2,}/g,' ').replace(/\s+([,.;])/g,'$1').replace(/\(\s*\)/g,'').trim();
}
function spotterCatalog(){
  const C = {};
  const add = (type, rows)=>{ C[type] = rows.map((r,i)=>({id:type+':'+i, h:r[0], n:r[1]})); };
  add('GREET_FIRST_EVER', [
    ['First session{name}.', 'Log honest working sets. Suggestions start next session.'],
    ['Welcome{name}. Nothing logged yet.', 'Log honest working sets. Suggestions start next session.'],
    ['Clean slate{name}.', 'Log honest working sets. Suggestions start next session.'],
    ['Day one{name}.', 'Log honest working sets. Suggestions start next session.'],
    ['No history yet{name}.', 'Log honest working sets. Suggestions start next session.'],
    ['Start here{name}.', 'Log honest working sets. Suggestions start next session.'],
    ['Empty log{name}. Good place to start.', 'Log honest working sets. Suggestions start next session.'],
    ['Ready when you are{name}.', 'Log honest working sets. Suggestions start next session.']
  ]);
  add('GREET_MORNING', [
    ['Morning{name}. {session}, {count} lifts.', '{watch}'],
    ['Morning{name}. {session} is up.', '{watch}'],
    ['Up for {session}{name}.', '{watch}'],
    ['Morning{name}. {count} lifts on {session}.', '{watch}'],
    ['Quiet morning{name}. {session}.', '{watch}'],
    ['Morning{name}. The plan is {session}.', '{watch}'],
    ['Good morning{name}. {session} today.', '{watch}'],
    ['Morning session{name}. {session}.', '{watch}']
  ]);
  add('GREET_AFTERNOON', [
    ['Afternoon{name}. {session}, {count} lifts.', '{watch}'],
    ['Afternoon{name}. {session} is on.', '{watch}'],
    ['Midday{name}. {session}, {count} lifts.', '{watch}'],
    ['Afternoon{name}. Time for {session}.', '{watch}'],
    ['{session} this afternoon{name}.', '{watch}'],
    ['Afternoon block{name}. {session}.', '{watch}'],
    ['Good afternoon{name}. {session}.', '{watch}'],
    ['Afternoon{name}. {count} lifts, {session}.', '{watch}']
  ]);
  add('GREET_EVENING', [
    ['Evening{name}. {session}, {count} lifts.', '{watch}'],
    ['Evening{name}. {session} is on.', '{watch}'],
    ['After hours{name}. {session}.', '{watch}'],
    ['Evening{name}. {count} lifts on {session}.', '{watch}'],
    ['Good evening{name}. {session}.', '{watch}'],
    ['Night training{name}. {session}.', '{watch}'],
    ['Evening session{name}. {session}.', '{watch}'],
    ['{session} this evening{name}.', '{watch}']
  ]);
  add('GREET_LATE', [
    ['Late session{name}. Respect.', 'Keep the sets honest.'],
    ['Late one{name}. {session}.', 'Keep the sets honest.'],
    ['The gym is quiet{name}.', 'Keep the sets honest.'],
    ['Late {session}{name}.', 'Short and honest is enough.'],
    ['Still here{name}. {session}.', 'Keep the sets honest.'],
    ['After midnight{name}. Noted.', 'Keep the sets honest.'],
    ['Late start{name}. {session}.', 'No extra drama. Just the sets.'],
    ['Quiet hours{name}. {session}.', 'Keep the sets honest.']
  ]);
  add('GREET_REST_DAY', [
    ['Rest day on the plan{name}.', 'Recovery counts as training.'],
    ['Nothing scheduled{name}.', 'Rest, or take an optional session.'],
    ['Plan says rest{name}.', 'Recovery counts as training.'],
    ['Off day{name}.', 'You can rest, or train if you want.'],
    ['Rest is the session{name}.', 'An optional workout is there if you want it.'],
    ['No lifts on the plan{name}.', 'Recovery counts as training.'],
    ['Scheduled rest{name}.', 'Take it, or start something light.'],
    ['Rest day{name}.', 'The bar will be there tomorrow.']
  ]);
  add('GREET_BACK_SHORT', [
    ['Back after a few days{name}.', '{watch}'],
    ['A short break{name}. {session}.', '{watch}'],
    ['Good to see the log again{name}.', '{watch}'],
    ['A few days off{name}. {session}.', 'Pick up the same plan.'],
    ['Back on {session}{name}.', '{watch}'],
    ['Gap was short{name}.', '{watch}'],
    ['You were away a few days{name}.', 'Same weights. Honest reps.'],
    ['{session} again{name}.', '{watch}']
  ]);
  add('GREET_BACK_LONG', [
    ['Welcome back{name}.', 'The bar waited.'],
    ['It has been a while{name}.', 'Start smooth. No heroics.'],
    ['Welcome back{name}. {session}.', 'Ease in. The plan can wait a week.'],
    ['Long gap{name}. Noted, not judged.', 'Start a little lighter if you want.'],
    ['The log missed you{name}.', 'The bar waited.'],
    ['Back after a long break{name}.', 'First session back can be lighter.'],
    ['Welcome back{name}.', 'Pick a weight you can own.'],
    ['Been away{name}. {session} is here.', 'Smooth sets beat a heroic one.']
  ]);
  add('GREET_ALREADY_DONE', [
    ['Already trained today{name}.', 'Reopen it, or leave it as it stands.'],
    ['Today is in the log{name}.', 'You can add a set, or call it done.'],
    ['Session saved{name}.', 'Reopen if something is missing.'],
    ['You trained today{name}.', 'That session already counts.'],
    ['Done for today{name}.', 'The log has this one.'],
    ['Today is banked{name}.', 'Add more only if you mean it.'],
    ['Second look{name}?', 'Today’s workout is already there.'],
    ['Logged{name}.', 'Rest is allowed now.']
  ]);
  add('GREET_WEEK_COMPLETE', [
    ['Week complete{name}.', '{n} of {m} sessions done.'],
    ['That’s the week{name}.', '{n} of {m} sessions done.'],
    ['Every planned session{name}.', '{n} of {m} this week.'],
    ['Week closed{name}.', '{n} of {m} sessions done.'],
    ['Full week{name}.', 'You hit every planned day.'],
    ['The plan is done{name}.', '{n} of {m} sessions done.'],
    ['All sessions in{name}.', '{n} of {m} this week.'],
    ['Week complete{name}. Nice.', '{n} of {m} sessions done.']
  ]);
  add('PLAN_NEW_LIFT', [
    ['New lift.', 'Find a weight for {range} reps that feels Medium-Hard.'],
    ['First time on this.', 'Find a weight for {range} reps that feels Medium-Hard.'],
    ['No history yet.', 'Pick a weight for {range} you could do again.'],
    ['Find the weight.', 'Aim for {range} reps, Medium or Hard.'],
    ['Start honest.', 'A {range} rep weight you can repeat.'],
    ['Blank page.', 'Find a {range} rep weight. Medium-Hard.']
  ]);
  add('PLAN_HOLD', [
    ['Hold the weight.', '{w} today. Targets {targets}.'],
    ['Same load today.', 'Stay at {w}. Aim {targets}.'],
    ['Stay and rebuild.', '{w}. Hit {targets}.'],
    ['Keep this weight.', '{w} x {targets}.'],
    ['Not a deload yet.', 'One more session at {w}. Aim {targets}.'],
    ['Hold {w}.', 'Targets {targets}.']
  ]);
  add('PLAN_ADD_REPS', [
    ['Add a rep or two.', '{w}. Targets {targets}.'],
    ['Same weight, more reps.', '{w} x {targets}.'],
    ['Reps before weight.', 'Stay at {w}. Aim {targets}.'],
    ['Build the set.', '{w}. Next targets {targets}.'],
    ['Chase the range.', '{w} x {targets}.'],
    ['One more, if it’s there.', '{w}. Aim {targets}.']
  ]);
  add('PLAN_BUMP', [
    ['Time to add weight.', 'Next: {w} x {targets}.'],
    ['You earned the jump.', '{w} x {targets}.'],
    ['Load goes up.', 'Try {w} x {targets}.'],
    ['The reps are there.', '{w} x {targets} this session.'],
    ['Top of the range.', 'Move to {w} x {targets}.'],
    ['Ready for more weight.', '{w} x {targets}.']
  ]);
  add('PLAN_DELOAD', [
    ['A small step down.', '{w} x {targets}. Then rebuild.'],
    ['Ease the load.', '{w}. Targets {targets}.'],
    ['Too heavy, twice.', 'Drop to {w} x {targets}.'],
    ['Lighter bar today.', '{w} x {targets}.'],
    ['Back off one step.', '{w}. Aim {targets}.'],
    ['Deload, then climb.', '{w} x {targets}.']
  ]);
  add('PLAN_RESET', [
    ['Time for a small reset.', '{w} and rebuild. Not a step back.'],
    ['Back off and rebuild.', '{w} x {targets}.'],
    ['The bar is stuck.', 'Reset to {w}. Targets {targets}.'],
    ['A reset, then we climb.', '{w} x {targets}.'],
    ['Ten percent off.', '{w}. Aim {targets}.'],
    ['Lighter load, same plan.', '{w} x {targets}.']
  ]);
  add('PLAN_PLATEAU', [
    ['The bar is stubborn.', 'Try one extra rep. {w} x {targets}.'],
    ['Flat for a bit.', 'Same {w}. Targets {targets}.'],
    ['Reps have stalled.', 'Hold {w}. Aim {targets}.'],
    ['Same weight, again.', '{w} x {targets}.'],
    ['This weight is sticky.', 'One more rep at {w}. {targets}.'],
    ['Third time here.', 'Stay at {w}. Targets {targets}.']
  ]);
  add('PLAN_COMEBACK', [
    ['Welcome back.', '{comeback}'],
    ['Ease in today.', '{comeback}'],
    ['The bar waited.', '{comeback}'],
    ['Start a little smoother.', '{comeback}'],
    ['No hero set today.', '{comeback}'],
    ['Pick it back up.', '{comeback}']
  ]);
  add('SET_ON_TARGET', [
    ['Clean set.', 'Next: {nextw} x {target}{lastbit}'],
    ['Right on it.', 'Stay at {nextw}. Aim {target}{lastbit}'],
    ['That one counts.', 'Next set {nextw} x {target}{lastbit}'],
    ['In the pocket.', 'Same weight. {target} reps{lastbit}'],
    ['Solid rep.', 'Hold {nextw}. Target {target}{lastbit}'],
    ['On the number.', 'Next: {target} at {nextw}{lastbit}'],
    ['Nice and tidy.', '{nextw} again. Aim {target}{lastbit}'],
    ['Held the line.', 'Aim {target}{lastbit}']
  ]);
  add('SET_BEAT_TARGET', [
    ['Above the target.', 'Next: {nextw} x {target}{lastbit}'],
    ['Extra reps. Noted.', 'Stay at {nextw}. Aim {target}{lastbit}'],
    ['Past the top.', 'Next {nextw} x {target}{lastbit}'],
    ['More than asked.', 'Same weight. {target}{lastbit}'],
    ['You cleared it.', '{nextw} x {target} next{lastbit}'],
    ['Over the number.', 'Aim {target} at {nextw}{lastbit}']
  ]);
  add('SET_BELOW_TARGET', [
    ['Down a rep. Happens.', 'Same weight, aim {target}{lastbit}'],
    ['Short of the target.', 'Stay at {nextw}. Aim {target}{lastbit}'],
    ['Not quite.', 'Next: {nextw} x {target}{lastbit}'],
    ['A rep light.', 'Hold {nextw}. Target {target}{lastbit}'],
    ['Under the number.', 'Same {nextw}. Aim {target}{lastbit}'],
    ['Close, not there.', 'Aim {target}{lastbit}']
  ]);
  add('SET_GRIND', [
    ['Grinder. Counted.', 'Same weight, aim {target}{lastbit}'],
    ['Hard, and it counts.', 'Stay at {nextw}. Aim {target}{lastbit}'],
    ['That one fought back.', 'Next: {nextw} x {target}{lastbit}'],
    ['Ugly and honest.', 'Hold {nextw}. Target {target}{lastbit}'],
    ['Grind noted.', 'Same {nextw}. Aim {target}{lastbit}'],
    ['Heavy, but it’s in.', 'Aim {target}{lastbit}']
  ]);
  add('SET_TOO_LIGHT', [
    ['That looked light.', '{lightline}'],
    ['Room to spare there.', '{lightline}'],
    ['Easy for this range.', '{lightline}'],
    ['The bar moved too well.', '{lightline}'],
    ['Light set.', '{lightline}'],
    ['You had more in you.', '{lightline}']
  ]);
  add('SET_TOO_HEAVY', [
    ['Heavy day for {shortw}.', '{heavyline}'],
    ['Too heavy for the range.', '{heavyline}'],
    ['That weight won.', '{heavyline}'],
    ['Reps fell off.', '{heavyline}'],
    ['A step too much.', '{heavyline}'],
    ['Back it off.', '{heavyline}']
  ]);
  add('WRAP_EX_PROGRESS', [
    ['Ahead of last time.', '{wrapline}'],
    ['Moved up.', '{wrapline}'],
    ['Better than last session.', '{wrapline}'],
    ['Progress, quietly.', '{wrapline}'],
    ['That was a step up.', '{wrapline}'],
    ['You beat last time.', '{wrapline}']
  ]);
  add('WRAP_EX_SAME', [
    ['Same as last time.', '{wrapline}'],
    ['Matched last session.', '{wrapline}'],
    ['Level with last time.', '{wrapline}'],
    ['A copy of last time.', '{wrapline}'],
    ['No change today.', '{wrapline}'],
    ['Held last session.', '{wrapline}']
  ]);
  add('WRAP_EX_LIGHT', [
    ['Lighter than last time.', '{wrapline}'],
    ['Down on last session.', '{wrapline}'],
    ['A lighter day.', '{wrapline}'],
    ['Short of last time.', '{wrapline}'],
    ['Not last session’s total.', '{wrapline}'],
    ['Back a bit. Fine.', '{wrapline}']
  ]);
  add('BUMP_UNLOCKED', [
    ['Top of the range on every set.', '{bumpline}'],
    ['Every set hit the top.', '{bumpline}'],
    ['That’s the bump.', '{bumpline}'],
    ['Weight goes up next time.', '{bumpline}'],
    ['You cleared the range.', '{bumpline}'],
    ['Next time is heavier.', '{bumpline}']
  ]);
  add('PR_WEIGHT', [
    ['New PR. {pr}.', 'The bar noticed.'],
    ['Heavier than ever.', '{pr}.'],
    ['A weight PR.', '{pr}.'],
    ['Best load so far.', '{pr}.'],
    ['New top weight.', '{pr}.'],
    ['PR. {pr}.', 'That weight is yours now.']
  ]);
  add('PR_REPS', [
    ['Rep PR. {pr}.', 'Most you’ve done there.'],
    ['More reps than ever.', '{pr}.'],
    ['A rep record.', '{pr}.'],
    ['Best set at this weight.', '{pr}.'],
    ['New rep high.', '{pr}.'],
    ['PR. {pr}.', 'Same bar, more reps.']
  ]);
  add('PR_E1RM', [
    ['New estimated max.', '{pr}.'],
    ['Best set on record.', '{pr}.'],
    ['That set ranks first.', '{pr}.'],
    ['PR. {pr}.', 'Highest estimate so far.'],
    ['A new best set.', '{pr}.'],
    ['Top set. {pr}.', 'Nothing logged beats it.']
  ]);
  add('WRAP_STRONG', [
    ['Strong session.', '{summary}'],
    ['That one moved.', '{summary}'],
    ['Good work today.', '{summary}'],
    ['The session landed.', '{summary}'],
    ['Solid from the start.', '{summary}'],
    ['A strong day.', '{summary}']
  ]);
  add('WRAP_STEADY', [
    ['Steady session.', '{summary}'],
    ['A normal day.', '{summary}'],
    ['Work got done.', '{summary}'],
    ['Even and useful.', '{summary}'],
    ['Nothing flashy. It counts.', '{summary}'],
    ['Right down the middle.', '{summary}']
  ]);
  add('WRAP_LIGHT', [
    ['Lighter day, still counts.', '{summary}'],
    ['A lighter session.', '{summary}'],
    ['You trained. That counts.', '{summary}'],
    ['Less weight, still a session.', '{summary}'],
    ['A quieter day.', '{summary}'],
    ['Short of last time. Fine.', '{summary}']
  ]);
  return C;
}
const SPOTTER_COPY = spotterCatalog();

function spotterSelfTest(){
  const range = [8,12], step = 2.5, planned = 3;
  const results = [];
  const check = (name, ok, extra)=>{
    results.push({name, ok});
    console.log((ok ? 'pass' : 'FAIL') + '  ' + name + (!ok && extra ? '  ' + extra : ''));
  };
  const eqW = (a,b)=> a==null && b==null || (a!=null && b!=null && Math.abs(a-b)<0.001);
  const eqT = (a,b)=> a && b && a.length===b.length && a.every((t,i)=> t[0]===b[i][0] && t[1]===b[i][1]);
  const mk = (rows, w, date)=>{
    const sets = rows.map(r=>({reps:r[0], feel:r[1]}));
    return {W:w==null?60:w, n:sets.length, total:sets.reduce((s,r)=>s+r.reps,0), sets, date: date || null};
  };
  const planOf = (sessions, today)=> spotterStartPlan(sessions, planned, range, step, today || null);
  const expectPlan = (name, plan, message, weight, targets)=>{
    const ok = plan.message===message && eqW(plan.weight, weight) && eqT(plan.targets, targets);
    check(name, ok, JSON.stringify({message:plan.message, weight:plan.weight, targets:plan.targets}));
  };
  const t810 = [[8,10],[8,10],[8,10]];
  const t1012 = [[10,12],[10,12],[10,12]];
  expectPlan('1 bump 12/12/12', planOf([mk([[12,'med'],[12,'med'],[12,'hard']])]), 'PLAN_BUMP', 62.5, t810);
  expectPlan('2 add reps 10/9/8', planOf([mk([[10,'med'],[9,'med'],[8,'hard']])]), 'PLAN_ADD_REPS', 60, [[11,11],[10,10],[8,8]]);
  expectPlan('3 easy override', planOf([mk([[10,'easy'],[10,'easy'],[10,'easy']])]), 'PLAN_BUMP', 62.5, t810);
  expectPlan('4 overshoot', planOf([mk([[15,'easy'],[15,'easy'],[15,'easy']])]), 'PLAN_BUMP', 65, t810);
  expectPlan('5 hold', planOf([mk([[8,'hard'],[7,'hard'],[6,'hard']]), mk([[10,'med'],[10,'med'],[10,'med']])]), 'PLAN_HOLD', 60, [[8,8],[8,8],[8,8]]);
  expectPlan('6 deload', planOf([mk([[7,'hard'],[6,'hard'],[6,'hard']]), mk([[7,'hard'],[7,'med'],[8,'med']])]), 'PLAN_DELOAD', 57.5, t810);
  expectPlan('7 plateau', planOf([mk([[10,'med'],[9,'med'],[8,'hard']]), mk([[10,'med'],[9,'med'],[8,'hard']]), mk([[10,'med'],[9,'med'],[8,'hard']])]), 'PLAN_PLATEAU', 60, [[11,11],[10,10],[8,8]]);
  expectPlan('8 reset', planOf([mk([[10,'med'],[9,'med'],[8,'hard']]), mk([[10,'med'],[9,'med'],[8,'hard']]), mk([[10,'med'],[9,'med'],[8,'hard']]), mk([[10,'med'],[9,'med'],[8,'hard']])]), 'PLAN_RESET', 55, t810);
  const day = (n)=>{
    const d = new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()-n);
    const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0');
    return y+'-'+m+'-'+dd;
  };
  const today = day(0);
  expectPlan('9 comeback 25d', planOf([mk([[12,'med'],[12,'med'],[12,'hard']], 60, day(25))], today), 'PLAN_COMEBACK', 60, t1012);
  expectPlan('10 comeback 40d', planOf([mk([[12,'med'],[12,'med'],[12,'hard']], 60, day(40))], today), 'PLAN_COMEBACK', 55, t810);
  const basePlan = {kind:'ADD_REPS', weight:60, jump:2.5, targets:[[8,12],[9,9],[8,8]]};
  const live11 = spotterLive(basePlan, [{weight:60,reps:15,feel:'easy'}], {weight:60,reps:15,feel:'easy'}, null, range, {plannedSets:3});
  check('11 too light', live11.type==='SET_TOO_LIGHT' && eqW(live11.nextWeight, 62.5), live11.type+' '+live11.nextWeight);
  const live12 = spotterLive(basePlan, [{weight:60,reps:6,feel:'hard'}], {weight:60,reps:6,feel:'hard'}, null, range, {plannedSets:3});
  check('12 too heavy', live12.type==='SET_TOO_HEAVY' && eqW(live12.nextWeight, 57.5), live12.type+' '+live12.nextWeight);
  const live13 = spotterLive(basePlan, [{weight:60,reps:10,feel:'med'}], {weight:60,reps:10,feel:'med'}, null, range, {plannedSets:3});
  check('13 next target', eqT([live13.nextTarget], [[9,10]]), JSON.stringify(live13.nextTarget));
  const straight = [
    {weight:60,reps:12,difficulty:'med'},
    {weight:60,reps:12,difficulty:'med'},
    {weight:60,reps:12,difficulty:'hard'}
  ];
  const junked = straight.concat([
    {isWarmup:true, weight:100, reps:20, difficulty:'easy'},
    {isDropSegment:true, weight:20, reps:30, difficulty:'hard'},
    {isDropSet:true, difficulty:'hard', stages:[{weight:60,reps:12},{weight:30,reps:15}]}
  ]);
  const na = spotterNormalise(straight), nb = spotterNormalise(junked);
  const pa = spotterStartPlan([na], planned, range, step);
  const pb = spotterStartPlan([nb], planned, range, step);
  check('14 warmup and drops', na && nb && na.W===60 && nb.W===60 && pa.message==='PLAN_BUMP' && pb.message==='PLAN_BUMP' && eqW(pa.weight, pb.weight), JSON.stringify({a:na&&na.W, b:nb&&nb.W, pa:pa.message, pb:pb.message}));
  const prior = [{weight:70, reps:8, difficulty:'med'}];
  const junkPrior = prior.concat([
    {isWarmup:true, weight:200, reps:10, difficulty:'easy'},
    {isDropSegment:true, weight:180, reps:12, difficulty:'hard'}
  ]);
  check('14 pr ignores junk', spotterPrKind({weight:80,reps:8,difficulty:'hard'}, prior, 8)==='PR_WEIGHT'
    && spotterPrKind({weight:80,reps:8,difficulty:'hard'}, junkPrior, 8)==='PR_WEIGHT'
    && spotterPrKind({isWarmup:true, weight:90, reps:10}, prior, 8)==null);
  check('14 first set is not a pr', spotterPrKind({weight:80,reps:8}, [], 8)==null);
  check('range 8-12', eqT([spotterParseRange('8-12')], [[8,12]]));
  check('range 8–12', eqT([spotterParseRange('8–12')], [[8,12]]));
  check('range 8 to 12', eqT([spotterParseRange('8 to 12')], [[8,12]]));
  check('range single', eqT([spotterParseRange('10')], [[8,10]]));
  check('range barbell default', eqT([spotterRepRange({}, {name:'Squat', equipment:'barbell'})], [[6,10]]));
  check('range curl default', eqT([spotterRepRange({}, {name:'Curl', equipment:'dumbbell'})], [[10,15]]));
  check('range numbers win', eqT([spotterRepRange({repsMin:8, repsMax:12}, {name:'Curl', equipment:'barbell'})], [[8,12]]));
  const need = type => (type.indexOf('GREET_')===0 || type==='SET_ON_TARGET') ? 8 : 6;
  Object.keys(SPOTTER_COPY).forEach(type=>{
    const list = SPOTTER_COPY[type];
    check('copy '+type, list && list.length>=need(type), String(list && list.length));
    (list||[]).forEach(t=>{
      if(!/\{/.test(t.h)) check(t.id+' h', t.h.length<=36 && (t.h.match(/!/g)||[]).length<=1, t.h.length+' '+t.h);
      if(!/\{/.test(t.n)) check(t.id+' n', t.n.length<=64 && (t.n.match(/!/g)||[]).length<=1, t.n.length+' '+t.n);
    });
  });
  const failed = results.filter(r=> !r.ok).length;
  console.log(failed ? (failed+' failed of '+results.length) : ('all passed ('+results.length+')'));
  return failed===0;
}
window.spotterSelfTest = spotterSelfTest;
/* ===== end SPOTTER ENGINE ===== */

/* Spotter adapters. History cache, copy picker, and the view the screens render.
   Still no DOM. localStorage holds only the ephemeral line picker. */
let spotterHistCache = new Map();
function spotterForget(exerciseId){
  if(exerciseId) spotterHistCache.delete(exerciseId);
  else spotterHistCache.clear();
}
function spotterNameKey(name){
  return String(name||'').toLowerCase().replace(/[^a-z0-9]+/g,'');
}
function spotterUsesEngine(ex){
  if(!ex) return false;
  const metric = ex.metric || 'weight_reps';
  return metric==='weight_reps' || metric==='weighted_bw' || metric==='reps_only';
}
function spotterBwMode(ex){
  return !!(ex && (ex.metric==='reps_only' || ex.metric==='weighted_bw'));
}
function spotterDefaultJumps(){
  return {barbell:2.5, dumbbell:2, machine:2.5, cable:2.5, bodyweight:2.5};
}
function spotterSettings(){
  const d = (typeof defaultSpotterSettings==='function') ? defaultSpotterSettings() : {intensity:'normal', haptics:true, sound:false, jumps:spotterDefaultJumps()};
  return {intensity:d.intensity, haptics:d.haptics!==false, sound:!!d.sound, jumps:d.jumps};
}
/* Same jump the weight stepper uses: split row, then the exercise, then the equipment default. */
function spotterJumpFor(ex, row){
  return loadStepFor(ex, row);
}
function spotterGroupsFor(exerciseId){
  const ex = getExercise(exerciseId);
  const key = spotterNameKey(ex && ex.name);
  const direct = [];
  (DATA.logs||[]).forEach(log=>{
    const sets = (log.sets||[]).filter(set=> set && set.exerciseId===exerciseId);
    if(sets.length) direct.push({log, sets: sets.slice()});
  });
  if(direct.length || !key) return direct;
  const named = [];
  (DATA.logs||[]).forEach(log=>{
    const sets = [];
    (log.sets||[]).forEach(set=>{
      if(!set || set.exerciseId===exerciseId) return;
      const other = getExercise(set.exerciseId);
      if(other && spotterNameKey(other.name)===key) sets.push(set);
    });
    if(sets.length) named.push({log, sets});
  });
  return named;
}
function spotterBuildHistory(exerciseId){
  const ex = getExercise(exerciseId);
  const repsOnly = !!(ex && ex.metric==='reps_only');
  const sessions = [];
  spotterGroupsFor(exerciseId).forEach(({log, sets})=>{
    sets.sort((a,b)=> (a.ts||0)-(b.ts||0));
    const norm = spotterNormalise(sets, {date:log.date, id:log.id, startedAt:log.startedAt||0, repsOnly});
    if(norm) sessions.push(norm);
  });
  sessions.sort((a,b)=>{
    if(a.date!==b.date) return a.date<b.date ? 1 : -1;
    return (b.startedAt||0)-(a.startedAt||0);
  });
  return sessions;
}
function spotterHistory(exerciseId){
  if(!exerciseId) return [];
  if(spotterHistCache.has(exerciseId)) return spotterHistCache.get(exerciseId);
  const built = spotterBuildHistory(exerciseId);
  spotterHistCache.set(exerciseId, built);
  return built;
}
function spotterPast(exerciseId, log){
  return spotterHistory(exerciseId).filter(s => !log || s.id!==log.id);
}
function spotterPriorRaw(exerciseId, set){
  if(!set) return [];
  const rows = [];
  (DATA.logs||[]).forEach(log=>{
    (log.sets||[]).forEach(s=>{
      if(!s || s===set || s.id===set.id || s.exerciseId!==exerciseId) return;
      if((s.ts||0)>(set.ts||0)) return;
      rows.push(s);
    });
  });
  return rows;
}
const SPOTTER_STORE_KEY = 'trackagain_spotter_v1';
function spotterStoreRead(){
  try{
    const raw = localStorage.getItem(SPOTTER_STORE_KEY);
    const data = raw ? JSON.parse(raw) : null;
    if(!data || typeof data!=='object') return {used:{}, chosen:{}, sess:{}, lastFilled:''};
    data.used = data.used && typeof data.used==='object' ? data.used : {};
    data.chosen = data.chosen && typeof data.chosen==='object' ? data.chosen : {};
    data.sess = data.sess && typeof data.sess==='object' ? data.sess : {};
    if(typeof data.lastFilled!=='string') data.lastFilled = '';
    return data;
  }catch(e){ return {used:{}, chosen:{}, sess:{}, lastFilled:''}; }
}
function spotterStoreWrite(data){
  try{ localStorage.setItem(SPOTTER_STORE_KEY, JSON.stringify(data)); }catch(e){}
}
function spotterBang(text, level){
  const s = String(text||'');
  if(level>=3){
    let seen = false;
    return s.replace(/!/g, ()=>{ if(seen) return ''; seen = true; return '!'; });
  }
  return s.replace(/!/g,'');
}
function spotterChooseLine(type, ctx, store){
  const list = SPOTTER_COPY[type] || SPOTTER_COPY.SET_ON_TARGET || [];
  if(!list.length) return {id:'none', h:'', n:''};
  let used = store.used[type] ? store.used[type].slice() : [];
  const free = ()=> list.filter(t => used.indexOf(t.id)<0);
  let pool = free();
  while(!pool.length && used.length){ used.shift(); pool = free(); }
  if(!pool.length) pool = list.slice();
  let pick = pool[Math.floor(Math.random()*pool.length)];
  let filled = {h: spotterClip(spotterFill(pick.h, ctx), 36), n: spotterClip(spotterFill(pick.n, ctx), 64)};
  if(store.lastFilled && pool.length>1){
    const alt = pool.filter(t => spotterClip(spotterFill(t.h, ctx), 36)!==store.lastFilled);
    if(alt.length){
      pick = alt[Math.floor(Math.random()*alt.length)];
      filled = {h: spotterClip(spotterFill(pick.h, ctx), 36), n: spotterClip(spotterFill(pick.n, ctx), 64)};
    }
  }
  used.push(pick.id);
  while(used.length>12) used.shift();
  store.used[type] = used;
  store.lastFilled = filled.h;
  return {id:pick.id, h:filled.h, n:filled.n};
}
function spotterSess(store, logId){
  const id = logId || 'none';
  if(!store.sess[id]) store.sess[id] = {level3:{}, afterPr:{}, routine:{}};
  const keys = Object.keys(store.sess);
  while(keys.length>8) delete store.sess[keys.shift()];
  return store.sess[id];
}
function spotterTakeFlags(store, scope, type){
  const sess = spotterSess(store, scope.logId);
  const ex = scope.exerciseId || '';
  const pr = type==='PR_WEIGHT' || type==='PR_REPS' || type==='PR_E1RM';
  const flags = {
    prChip: pr && !!sess.level3[ex],
    level3Used: !!sess.level3[ex],
    afterPr: !!sess.afterPr[ex] && !pr,
    routineSlot: sess.routine[ex]||0
  };
  const level = spotterLevel(type, flags, spotterSettings().intensity);
  if(level===3 && ex) sess.level3[ex] = true;
  if(level===3 && pr && ex) sess.afterPr[ex] = true;
  else if(flags.afterPr && ex) sess.afterPr[ex] = false;
  if(type==='SET_ON_TARGET' && ex) sess.routine[ex] = flags.routineSlot+1;
  return flags;
}
function spotterLevel(type, flags, intensity){
  flags = flags || {};
  const pr = type==='PR_WEIGHT' || type==='PR_REPS' || type==='PR_E1RM';
  if(pr) return flags.prChip ? 1 : 3;
  if(intensity==='minimal') return 1;
  if(type==='GREET_WEEK_COMPLETE' || type==='BUMP_UNLOCKED') return flags.level3Used ? 2 : 3;
  if(type==='WRAP_EX_PROGRESS' && intensity==='hype') return flags.level3Used ? 2 : 3;
  if(flags.afterPr) return 1;
  if(intensity==='hype') return 2;
  if(type==='SET_ON_TARGET' && flags.routineSlot%2===1) return 1;
  return 2;
}
function spotterPresent(type, ctx, scope){
  if(!type) return null;
  scope = scope || {};
  ctx = ctx || {};
  const store = spotterStoreRead();
  const key = scope.key || '';
  let rec = key && store.chosen[key];
  if(!rec){
    const picked = spotterChooseLine(type, ctx, store);
    rec = {type, h:picked.h, n:picked.n || ctx.fallback || '', id:picked.id, flags: spotterTakeFlags(store, scope, type)};
    if(!rec.n) rec.n = ctx.fallback || 'Log the set.';
    if(key){
      store.chosen[key] = rec;
      const keys = Object.keys(store.chosen);
      while(keys.length>40) delete store.chosen[keys.shift()];
    }
    spotterStoreWrite(store);
  }
  const level = spotterLevel(rec.type || type, rec.flags||{}, spotterSettings().intensity);
  const headline = level>=2 ? spotterBang(rec.h, level) : '';
  const numbers = level>=1 ? spotterBang(rec.n, level) : '';
  return {type, level, headline, numbers, prChip: !!(rec.flags && rec.flags.prChip), templateId: rec.id};
}
function spotterMessageCtx(plan, live, extra){
  extra = extra || {};
  const range = extra.range || [8,12];
  const jump = plan && plan.jump>0 ? plan.jump : 2.5;
  const loadLabel = (kg)=> (extra.bodyweight && !(Number(kg)>0)) ? 'bodyweight' : (kg!=null && isFinite(Number(kg)) ? spotterKg(kg) : '');
  const w = plan && plan.weight!=null ? loadLabel(plan.weight) : '';
  const targets = plan ? spotterTargetText(plan.targets) : '';
  const rangeText = spotterRangeText(range[0], range[1]);
  const nextw = live && live.nextWeight!=null ? loadLabel(live.nextWeight) : w;
  const target = live && live.nextTarget ? spotterRangeText(live.nextTarget[0], live.nextTarget[1]) : targets;
  const lastbit = live && live.lastTime!=null ? ' (last time: '+live.lastTime+')' : '';
  const bwAdd = 'Add '+spotterKg(jump)+' or a harder variation.';
  const lightline = (extra.bodyweight && live && !(live.nextWeight>0)) ? bwAdd : ('Try '+(nextw||spotterKg(jump))+' next set.');
  const heavyline = 'Drop to '+(nextw||w)+', keep reps in range.';
  let comeback = w ? ('Stay at '+w+' x '+targets+'.') : ('Aim '+targets+'.');
  if(plan && plan.message==='PLAN_COMEBACK' && !plan.gentle)
    comeback = plan.weight>0 ? (spotterKg(plan.weight)+' x '+targets+'. About 10% off.') : ('Rebuild the reps. Aim '+targets+'.');
  let bumpline = 'Next session: '+(w||spotterKg(jump))+' x '+(range[0]||8)+'.';
  if(live && live.wrap){
    bumpline = live.wrap.bodyweightBump
      ? ('Next session: '+bwAdd)
      : ('Next session: '+spotterKg(live.wrap.nextWeight)+' x '+live.wrap.nextReps+'.');
  } else if(plan && plan.bodyweightBump) bumpline = bwAdd;
  let wrapline = 'Same total as last time.';
  if(live && live.wrap){
    const d = live.wrap.repsDelta;
    if(live.wrap.earnedBump) wrapline = bumpline;
    else if(live.wrap.cmp==='progress'){
      const up = live.wrap.weightDelta>0 ? ('Up '+spotterKg(live.wrap.weightDelta)+'. ') : '';
      wrapline = up + (d>0 ? ('+'+d+' reps vs last time.') : 'Ahead of last time.');
    } else if(live.wrap.cmp==='light') wrapline = d!=null && d<0 ? (Math.abs(d)+' reps under last time.') : 'Lighter than last time.';
  }
  const logged = extra.loggedWeight;
  return Object.assign({
    w, targets, range: rangeText, nextw, target, lastbit, lightline, heavyline, comeback, bumpline, wrapline,
    pr: extra.prText || '',
    shortw: (extra.bodyweight && !(Number(logged)>0)) ? 'bodyweight' : (logged!=null && isFinite(logged) ? spotterNum(logged) : (plan && plan.weight!=null ? spotterNum(plan.weight) : '')),
    fallback: w ? (w+' x '+targets) : ('Find a weight for '+rangeText+' reps.')
  }, extra.tokens||{});
}
function spotterPlanMessage(plan, ctx, scope){
  let type = plan.message || 'PLAN_HOLD';
  if(plan.bodyweightBump && type==='PLAN_BUMP') ctx = Object.assign({}, ctx, {fallback: ctx.bumpline});
  const msg = spotterPresent(type, ctx, scope);
  if(plan.bodyweightBump && (type==='PLAN_BUMP' || type==='BUMP_UNLOCKED')){
    msg.numbers = spotterClip(ctx.bumpline || msg.numbers, 64);
  }
  return msg;
}
function spotterJoinReps(sets){
  const reps = (sets||[]).map(s => s && s.reps).filter(n => n>0);
  if(reps.length<=1) return reps.length ? String(reps[0]) : '';
  if(reps.length===2) return reps[0]+' and '+reps[1];
  return reps.slice(0, -1).join(', ')+' and '+reps[reps.length-1];
}
function spotterLoadPhrase(kg, metric, bw){
  if(bw && !(Number(kg)>0)) return 'bodyweight';
  if(metric==='weighted_bw') return Number(kg)>0 ? ('bodyweight + '+spotterKg(kg)) : 'bodyweight';
  if(kg==null || !isFinite(Number(kg))) return '';
  return spotterKg(kg);
}
/* Plain explanation for the exercise card. The short catalog stays for the self-test. */
function spotterTalk(plan, live, opts){
  opts = opts || {};
  plan = plan || {};
  const range = opts.range || [8, 12];
  const rangeText = spotterRangeText(range[0], range[1]);
  const metric = opts.metric || 'weight_reps';
  const bw = !!opts.bodyweight;
  const say = kg => spotterLoadPhrase(kg, metric, bw);
  const last = opts.last;
  const lastReps = last ? spotterJoinReps(last.sets) : '';
  const lastLoad = last ? say(last.W) : '';
  const targets = plan.targets ? spotterTargetText(plan.targets) : rangeText;
  const done = opts.done||0;
  const planned = Math.max(1, opts.planned||1);
  const left = Math.max(0, planned - done);
  const setLine = left<=0
    ? 'That was the last planned set.'
    : (left===1 ? 'One working set left.' : (left+' working sets left.'));
  if(live && !live.silent){
    const nextLoad = say(live.nextWeight);
    const nextReps = live.nextTarget ? spotterRangeText(live.nextTarget[0], live.nextTarget[1]) : '';
    const did = say(opts.loggedWeight);
    const reps = opts.loggedReps;
    const feel = live.feel==='easy' ? 'Easy' : live.feel==='hard' ? 'Hard' : 'Medium';
    const nextBit = nextLoad+(nextReps ? (' × '+nextReps) : '');
    if(live.type==='BUMP_UNLOCKED'){
      const bump = live.wrap && live.wrap.bodyweightBump;
      return {
        lead: 'You earned more weight.',
        why: bump
          ? ('Every working set hit '+range[1]+'. Next time, add '+spotterKg(opts.jump||plan.jump)+' or pick a harder variation. '+setLine)
          : ('Every working set at '+did+' hit '+range[1]+'. Next session starts at '+say(live.wrap && live.wrap.nextWeight)+' × '+(live.wrap && live.wrap.nextReps)+'. '+setLine)
      };
    }
    if(live.type==='SET_TOO_LIGHT'){
      return {
        lead: 'That was too easy for this range.',
        why: reps+' easy reps is past '+rangeText+'. The next set moves up to '+nextLoad+'. Whatever you log from here is the weight for the rest of this exercise.'
      };
    }
    if(live.type==='SET_TOO_HEAVY'){
      return {
        lead: 'That was too heavy.',
        why: reps+' hard reps is under '+range[0]+'. The next set comes down to '+nextLoad+', still aiming for '+rangeText+'.'
      };
    }
    if(live.type==='SET_BELOW_TARGET'){
      const wanted = live.target ? spotterRangeText(live.target[0], live.target[1]) : rangeText;
      return {
        lead: 'Short of this set’s target.',
        why: 'The target was '+wanted+' and you got '+reps+'. Stay at '+nextLoad+' and aim for '+nextReps+'. '+setLine
      };
    }
    if(live.type==='SET_BEAT_TARGET'){
      return {
        lead: 'Ahead of this set’s target.',
        why: 'You did '+reps+', past the target. Stay at '+nextLoad+' and aim for '+nextReps+' next. The weight goes up only when every set hits '+range[1]+'.'
      };
    }
    if(live.type==='SET_GRIND'){
      return {
        lead: 'Hard set. Match it, don’t add reps.',
        why: 'Stay at '+nextLoad+' and aim for '+nextReps+'. '+setLine
      };
    }
    if(String(live.type||'').indexOf('PR_')===0){
      return {
        lead: 'New record'+(opts.prText ? ('. '+opts.prText+'.') : '.'),
        why: 'Next set stays at '+nextBit+'. '+setLine
      };
    }
    if(live.type==='WRAP_EX_PROGRESS'){
      const extra = live.wrap && live.wrap.repsDelta>0 ? (live.wrap.repsDelta+' more reps than last session. ') : 'Better than last time. ';
      return {lead: 'Ahead of last time.', why: extra+'The weight stays here until next session. '+setLine};
    }
    if(live.type==='WRAP_EX_LIGHT'){
      return {lead: 'Lighter than last time. It still counts.', why: 'Next session, stay with '+nextLoad+' and build the reps back. '+setLine};
    }
    if(live.type==='WRAP_EX_SAME'){
      return {lead: 'Same place as last time.', why: 'No extra reps yet, so the weight stays. '+setLine};
    }
    return {
      lead: 'On target.',
      why: 'That was '+reps+' at '+did+', and it felt '+feel+'. Next set: '+nextBit+'. '+setLine+' The weight stays until every set hits '+range[1]+'.'
    };
  }
  const today = say(plan.weight);
  if(plan.kind==='NEW_LIFT' || plan.weight==null){
    return {
      lead: 'First time on this exercise.',
      why: 'The range is '+rangeText+' reps. Pick a weight you could do again, around Medium. Log it, and the next session will have a real target.'
    };
  }
  if(plan.kind==='BUMP' && plan.bodyweightBump){
    return {
      lead: 'Time to add a little load.',
      why: 'Last time every set hit '+range[1]+' at bodyweight'+(lastReps ? (' ('+lastReps+')') : '')+'. Add '+spotterKg(plan.jump)+', or pick a harder variation. Today’s reps start at '+targets+'.'
    };
  }
  if(plan.kind==='BUMP'){
    return {
      lead: 'Add weight today.',
      why: 'Last time at '+lastLoad+' you hit the top of '+rangeText+(lastReps ? (' ('+lastReps+')') : '')+'. Today is '+today+', starting around '+targets+'.'
    };
  }
  if(plan.kind==='ADD_REPS'){
    return {
      lead: 'Same weight. Add a rep or two.',
      why: 'Last time was '+lastLoad+(lastReps ? (' for '+lastReps) : '')+'. Stay at '+today+' and aim for '+targets+'. The weight goes up once every set reaches '+range[1]+'.'
    };
  }
  if(plan.kind==='HOLD'){
    return {
      lead: 'Same weight. Get back into the range.',
      why: 'Last time at '+lastLoad+' finished under '+range[0]+(lastReps ? (' ('+lastReps+')') : '')+'. Stay at '+today+' and aim for '+targets+'. One off session is not a reason to drop the weight.'
    };
  }
  if(plan.kind==='DELOAD'){
    return {
      lead: 'A small step down.',
      why: 'Two sessions at '+lastLoad+' finished under '+range[0]+'. Today is '+today+', aiming for '+targets+'.'
    };
  }
  if(plan.kind==='RESET'){
    return {
      lead: 'Reset about 10%.',
      why: 'Four sessions at '+lastLoad+' did not add a rep. Today is '+today+', aiming for '+targets+'.'
    };
  }
  if(plan.kind==='PLATEAU'){
    return {
      lead: 'The reps have stalled.',
      why: 'Three sessions at '+lastLoad+' with no extra reps. Stay at '+today+' and keep chasing '+targets+'. One more flat session and the weight comes down about 10%.'
    };
  }
  if(plan.kind==='COMEBACK' && plan.gentle){
    return {
      lead: 'Welcome back. Same weight.',
      why: (plan.gapDays ? ('It has been '+plan.gapDays+' days. ') : '')+'Stay at '+today+' and work '+targets+'. A weight increase waits until you are back in the groove.'
    };
  }
  if(plan.kind==='COMEBACK'){
    return {
      lead: 'Ease back in.',
      why: (plan.gapDays ? ('It has been '+plan.gapDays+' days, so ') : '')+'today starts about 10% lighter, at '+today+', aiming for '+targets+'.'
    };
  }
  return {
    lead: today ? ('Today: '+today+'.') : 'Today’s target.',
    why: 'Aim for '+targets+' across '+planned+' sets. The range is '+rangeText+'.'
  };
}
/* Planned sets are in. No next-set line until the user asks for a bonus set. */
function spotterNextTimeLine(msg){
  const wrap = msg && msg.wrap;
  const say = kg => spotterLoadPhrase(kg, msg.metric, !!msg.bodyweight);
  if(wrap && wrap.earnedBump && wrap.bodyweightBump)
    return 'Next time, add '+spotterKg(msg.jump)+' or pick a harder variation.';
  if(wrap && wrap.earnedBump && wrap.nextWeight!=null)
    return 'Next time starts at '+say(wrap.nextWeight)+' × '+(wrap.nextReps!=null ? wrap.nextReps : '')+'.';
  if(wrap && wrap.cmp==='light')
    return 'Next time, stay at '+say(wrap.nextWeight)+' and build the reps back.';
  if(wrap && msg.bodyweight && !(Number(wrap.nextWeight)>0))
    return 'Next time, bodyweight again.';
  if(wrap && wrap.nextWeight!=null && !(msg.bodyweight && !(Number(wrap.nextWeight)>0)))
    return 'Next time, same weight, '+say(wrap.nextWeight)+'.';
  return 'Next time, the same work as today.';
}
function spotterClosedTalk(msg){
  msg = msg || {};
  const next = spotterNextTimeLine(msg);
  const coach = 'I will coach you against today.';
  const pr = msg.prChip || String(msg.type||'').indexOf('PR_')===0;
  if(pr) return {lead:'New record.', why:(msg.prText ? msg.prText+'. ' : '')+next+' '+coach};
  if(msg.wrap && msg.wrap.earnedBump && msg.wrap.bodyweightBump)
    return {lead:'Time to add a little load.', why:next+' '+coach};
  if(msg.wrap && msg.wrap.earnedBump)
    return {lead:'You earned more weight.', why:next+' '+coach};
  if(msg.wrap && msg.wrap.cmp==='progress')
    return {lead:'Ahead of last time.', why:next+' '+coach};
  if(msg.wrap && msg.wrap.cmp==='light')
    return {lead:'Lighter than last time.', why:'It still counts. '+next+' '+coach};
  return {lead:'Today is done.', why:next+' '+coach};
}
function spotterBonusTalk(msg){
  const detail = (typeof spotterUseDetail==='function') ? spotterUseDetail(msg) : '';
  return {
    lead: 'Bonus set.',
    why: detail
      ? ('Aim for '+detail+'. Logging it does not change next time.')
      : 'Log the extra work if you want it. It does not change next time.'
  };
}
function spotterCardView(planRow, log, doneSets){
  const ex = getExercise(planRow.exerciseId);
  if(!ex || !spotterUsesEngine(ex)) return null;
  const bw = spotterBwMode(ex);
  const range = spotterRepRange(planRow, ex);
  const jump = spotterJumpFor(ex, planRow);
  const planned = Math.max(1, planRow.sets||1);
  const hist = spotterPast(planRow.exerciseId, log);
  const plan = spotterStartPlan(hist, planned, range, jump, (log && log.date) || todayKey(), {bodyweight: bw});
  const working = spotterWorkingFromRaw(doneSets||[], {repsOnly: ex.metric==='reps_only'});
  const lastRaw = [...(doneSets||[])].reverse().find(s => s && !s.isWarmup) || null;
  let live = null;
  if(working.length){
    const just = working[working.length-1];
    const prior = lastRaw ? spotterPriorRaw(planRow.exerciseId, lastRaw) : [];
    const prKind = lastRaw && lastRaw.isPR ? (spotterPrKind(lastRaw, prior, range[0]) || 'PR_E1RM') : null;
    live = spotterLive(plan, working, {
      weight: just.weight, reps: just.reps, feel: just.feel,
      isPR: !!(lastRaw && lastRaw.isPR && !lastRaw.isDropSet),
      isDropSet: !!(lastRaw && lastRaw.isDropSet)
    }, hist[0]||null, range, {plannedSets: planned, jump, bodyweight: bw, prior, prKind});
  }
  const prText = lastRaw ? setValueText(lastRaw, ex.metric, ex) : '';
  const ctx = spotterMessageCtx(plan, live, {range, bodyweight: bw, loggedWeight: working.length ? working[working.length-1].weight : plan.weight, prText});
  const scopeBase = {logId: log && log.id, exerciseId: planRow.exerciseId};
  let msg;
  if(live && !live.silent){
    const sig = [live.type, working.length, working[working.length-1].reps, working[working.length-1].weight, lastRaw && lastRaw.id].join(':');
    msg = spotterPresent(live.type, ctx, Object.assign({key: 's2:'+(log&&log.id)+':'+planRow.exerciseId+':'+sig}, scopeBase));
    if((live.type==='BUMP_UNLOCKED' || live.type==='SET_TOO_LIGHT') && (plan.bodyweightBump || (bw && !(live.nextWeight>0) && live.type==='BUMP_UNLOCKED')))
      msg.numbers = spotterClip(ctx.bumpline, 64);
  } else {
    const sig = [plan.message, plan.weight, spotterTargetText(plan.targets)].join(':');
    msg = spotterPlanMessage(plan, ctx, Object.assign({key: 's2:'+(log&&log.id)+':'+planRow.exerciseId+':plan:'+sig}, scopeBase));
  }
  const showingLive = !!(live && !live.silent);
  const nextTarget = showingLive && live.nextTarget ? live.nextTarget : (plan.targets && plan.targets[Math.min(working.length, Math.max(0, (plan.targets||[]).length-1))]);
  let fillWeight = showingLive ? live.nextWeight : plan.weight;
  let fillReps = nextTarget ? nextTarget[1] : null;
  if(plan.kind==='NEW_LIFT' && !showingLive) fillWeight = null;
  if((plan.bodyweightBump && !showingLive) || (showingLive && live.wrap && live.wrap.bodyweightBump)) fillWeight = jump;
  if(showingLive && live.type==='SET_TOO_LIGHT' && bw && !(live.nextWeight>0)) fillWeight = jump;
  msg.fillWeight = fillWeight!=null && isFinite(Number(fillWeight)) ? Number(fillWeight) : null;
  msg.fillReps = fillReps!=null && isFinite(Number(fillReps)) ? Number(fillReps) : null;
  msg.metric = ex.metric;
  msg.bodyweight = bw;
  msg.talk = spotterTalk(plan, live, {
    range, metric: ex.metric, bodyweight: bw, last: hist[0]||null,
    planned, done: working.length, jump,
    loggedWeight: working.length ? working[working.length-1].weight : plan.weight,
    loggedReps: working.length ? working[working.length-1].reps : null,
    prText
  });
  msg.sessionDone = working.length >= planned;
  msg.wrap = live && live.wrap ? live.wrap : null;
  msg.jump = jump;
  msg.prText = prText;
  msg.glow = msg.level===3;
  msg.confetti = msg.level===3 && String(msg.type||'').indexOf('PR_')===0;
  msg.planKind = plan.kind;
  return msg;
}
function spotterNameBit(){
  const n = (DATA && DATA.settings && DATA.settings.userName || '').trim();
  if(!n || n.toLowerCase()==='user') return '';
  return ', '+n;
}
function spotterCountWord(n){
  const words = ['zero','one','two','three','four','five','six','seven','eight','nine','ten'];
  n = Math.round(Number(n)||0);
  return n>=0 && n<words.length ? words[n] : String(n);
}
function spotterWeekStats(){
  const now = new Date(); now.setHours(0,0,0,0);
  const sinceMon = (now.getDay()+6) % 7;
  const start = new Date(now); start.setDate(now.getDate()-sinceMon);
  const end = new Date(start); end.setDate(start.getDate()+7);
  const startKey = dateKey(start), endKey = dateKey(end), today = dateKey(now);
  const days = splitDays();
  let m = 0, n = 0;
  DAY_ORDER.forEach(dk=>{
    const day = days[dk];
    if(!day || !(day.exercises||[]).length) return;
    m++;
    const hit = (DATA.logs||[]).some(l => l && l.date>=startKey && l.date<endKey && l.dayKey===dk && (l.sets||[]).length);
    if(hit) n++;
  });
  if(!m){
    const from = new Date(now); from.setDate(now.getDate()-6);
    const fromKey = dateKey(from);
    const dates = new Set();
    (DATA.logs||[]).forEach(l=>{ if(l && l.date>=fromKey && l.date<=today && (l.sets||[]).length) dates.add(l.date); });
    return {n: dates.size, m: 0, chip: dates.size+' this week'};
  }
  return {n, m, chip: n+' of '+m+' this week'};
}
function spotterDaysSinceWorkout(today){
  let best = null;
  (DATA.logs||[]).forEach(l=>{
    if(!l || !l.date || l.date>=today || !(l.sets||[]).length) return;
    if(!best || l.date>best) best = l.date;
  });
  return best ? spotterGapDays(best, today) : null;
}
function spotterOneOff(exerciseId, hist){
  const last = hist && hist[0];
  if(!last) return null;
  let best = 0, any = false;
  hist.forEach(s=>{
    if(!spotterSameWeight(s.W, last.W)) return;
    (s.sets||[]).forEach(set=>{ if(set.reps>best){ best = set.reps; any = true; } });
  });
  if(!any) return null;
  const lastBest = (last.sets||[]).reduce((m,s)=> Math.max(m, s.reps), 0);
  return best-lastBest===1 ? {weight: last.W} : null;
}
function spotterWatchLine(rows){
  const bumps = [], near = [], adds = [];
  const todayLogId = (typeof todayLog==='function' && todayLog().id) || null;
  (rows||[]).forEach(row=>{
    const ex = getExercise(row.exerciseId);
    if(!ex || !spotterUsesEngine(ex)) return;
    const hist = spotterHistory(row.exerciseId).filter(s => s.id!==todayLogId && s.date<todayKey());
    const plan = spotterStartPlan(hist, Math.max(1, row.sets||1), spotterRepRange(row, ex), spotterJumpFor(ex, row), todayKey(), {bodyweight: spotterBwMode(ex)});
    const short = String(ex.name||'').split(' ')[0] || 'Lift';
    if(plan.kind==='BUMP'){
      bumps.push(plan.bodyweightBump ? (short+' can take a harder variation') : (short+' is one clean session from '+spotterNum(plan.weight)));
    } else {
      const off = spotterOneOff(row.exerciseId, hist);
      if(off) near.push(short+' is 1 rep off '+spotterNum(off.weight));
      else if(plan.kind==='ADD_REPS') adds.push(short+', one more rep');
    }
  });
  const items = bumps.concat(near, adds).slice(0, 2);
  if(!items.length) return 'Keep the sets honest.';
  let line = items.join('. ');
  if(!/[.!?]$/.test(line)) line += '.';
  return spotterClip(line, 64);
}
function spotterGreeting(log, planRows){
  const today = todayKey();
  const anyLog = (DATA.logs||[]).some(l => l && (l.sets||[]).length);
  const trainedToday = (DATA.logs||[]).some(l => l && l.date===today && (l.sets||[]).length);
  const session = (log && planNameForLog(log)) || 'Workout';
  const count = (planRows||[]).length;
  const week = spotterWeekStats();
  const gap = spotterDaysSinceWorkout(today);
  const hour = new Date().getHours();
  let type = 'GREET_MORNING';
  if(!anyLog) type = 'GREET_FIRST_EVER';
  else if(week.m>0 && week.n>=week.m && trainedToday) type = 'GREET_WEEK_COMPLETE';
  else if(trainedToday) type = 'GREET_ALREADY_DONE';
  else if(!count) type = 'GREET_REST_DAY';
  else if(gap!=null && gap>=14) type = 'GREET_BACK_LONG';
  else if(gap!=null && gap>=4 && gap<=7) type = 'GREET_BACK_SHORT';
  else if(hour>=5 && hour<=11) type = 'GREET_MORNING';
  else if(hour>=12 && hour<=16) type = 'GREET_AFTERNOON';
  else if(hour>=17 && hour<=21) type = 'GREET_EVENING';
  else type = 'GREET_LATE';
  const tokens = {
    name: spotterNameBit(),
    session, count: spotterCountWord(count),
    watch: type==='GREET_FIRST_EVER' ? '' : spotterWatchLine(planRows),
    n: String(week.n), m: String(week.m)
  };
  const msg = spotterPresent(type, tokens, {key: 'greet:'+today+':'+type+':'+tokens.watch, logId: log && log.id, exerciseId: 'home'});
  return {line1: msg.headline || spotterClip(spotterFill(SPOTTER_COPY[type][0].h, tokens), 36), line2: msg.numbers, chip: week.chip, level: msg.level, type};
}
function spotterWorkoutSummary(log){
  if(!log) return null;
  const seen = [];
  const have = new Set();
  (log.sets||[]).forEach(s=>{
    if(!s || s.isWarmup || have.has(s.exerciseId)) return;
    const ex = getExercise(s.exerciseId);
    if(!ex || !spotterUsesEngine(ex)) return;
    have.add(s.exerciseId);
    seen.push({ex, row: (planForLog(log)||[]).find(r => r.exerciseId===s.exerciseId) || {exerciseId:s.exerciseId, sets:3, repsMin:8, repsMax:12}});
  });
  let progressed = 0;
  const nextBits = [];
  seen.forEach(({ex, row})=>{
    const hist = spotterHistory(ex.id);
    const todayS = hist.find(s => s.id===log.id);
    const prev = hist.find(s => s.id!==log.id);
    if(todayS && prev && (todayS.W>prev.W+0.001 || (spotterSameWeight(todayS.W, prev.W) && todayS.total>prev.total))) progressed++;
    const past = hist.filter(s => s.id!==log.id);
    const plan = spotterStartPlan(past, Math.max(1, row.sets||1), spotterRepRange(row, ex), spotterJumpFor(ex, row), log.date, {bodyweight: spotterBwMode(ex)});
    const rank = {BUMP:3, ADD_REPS:2, PLATEAU:2, HOLD:1, COMEBACK:1, DELOAD:0, RESET:0, NEW_LIFT:0};
    const short = String(ex.name||'Lift').split(' ')[0];
    const label = plan.bodyweightBump ? (short+': add '+spotterKg(plan.jump))
      : plan.weight!=null ? (short+' '+spotterNum(plan.weight)+' x '+spotterTargetText(plan.targets))
      : (short+' '+spotterRangeText.apply(null, spotterRepRange(row, ex)));
    nextBits.push({rank: rank[plan.kind]||0, label});
  });
  nextBits.sort((a,b)=> b.rank-a.rank);
  const top = nextBits.slice(0,2).map(x => x.label);
  const prs = (log.sets||[]).filter(s => s.isPR).length;
  let volumeLine = '';
  const name = planNameForLog(log);
  const prevLog = (DATA.logs||[]).filter(l => l && l.id!==log.id && (l.sets||[]).length && planNameForLog(l)===name && l.date<=log.date)
    .sort((a,b)=> a.date===b.date ? ((b.startedAt||0)-(a.startedAt||0)) : (a.date<b.date?1:-1))[0];
  if(prevLog && typeof setVolumeLoad==='function'){
    const a = (log.sets||[]).reduce((sum,set)=> sum+setVolumeLoad(set), 0);
    const b = (prevLog.sets||[]).reduce((sum,set)=> sum+setVolumeLoad(set), 0);
    if(b>0){
      const pct = Math.round((a-b)/b*100);
      volumeLine = pct>=0 ? ('Volume +'+pct+'%') : 'Lighter day, still counts';
    }
  }
  const y = seen.length;
  const bits = [];
  if(y) bits.push(progressed+' of '+y+' moved up');
  if(prs) bits.push(prs+' PR'+(prs>1?'s':''));
  if(volumeLine) bits.push(volumeLine);
  const detail = [bits.join('. '), top.length ? ('Next: '+top.join('. ')) : ''].filter(Boolean).join('. ');
  let type = 'WRAP_STEADY';
  if(prs>0 || (y>0 && progressed*2>=y)) type = 'WRAP_STRONG';
  else if(volumeLine==='Lighter day, still counts' || (y>0 && progressed===0)) type = 'WRAP_LIGHT';
  const msg = spotterPresent(type, {summary: spotterClip(detail, 64), fallback: detail}, {key:'wrap:'+log.id, logId:log.id, exerciseId:'workout'});
  msg.detail = detail;
  return msg;
}
function spotterHapticFor(set){
  if(!set || set.isWarmup) return 'tap';
  try{
    const ex = getExercise(set.exerciseId);
    if(ex && spotterUsesEngine(ex)){
      const log = (DATA.logs||[]).find(l => l && (l.sets||[]).indexOf(set)>=0);
      if(log){
        const row = (planForLog(log)||[]).find(r => r.exerciseId===set.exerciseId) || {exerciseId:set.exerciseId, sets:3, repsMin:8, repsMax:12};
        const view = spotterCardView(row, log, (log.sets||[]).filter(s => s.exerciseId===set.exerciseId));
        if(view && view.level===3 && String(view.type||'').indexOf('PR_')===0) return 'pr';
        if(view && view.type==='BUMP_UNLOCKED' && view.level===3) return 'bumpUnlocked';
        if(view && (view.type==='SET_GRIND' || view.type==='SET_TOO_HEAVY')) return 'hardSet';
      }
    }
  }catch(e){}
  if(set.isPR) return 'pr';
  if(set.difficulty==='hard') return 'hardSet';
  return 'setLogged';
}

/* --- raw set maths --- */
/* Epley. A single is the max itself; reps are capped at 30 so high-rep sets
   (hypertrophy / endurance) still rank above fewer reps at the same weight. */
function estimateOneRepMax(weight, reps){
  const w = weight||0, r = Math.min(Math.max(reps||0, 0), 30);
  return r<=1 ? w : w * (1 + r/30);
}
/* Metrics whose sets carry a weight field (load, assistance or added load). */
function hasLoadField(metric){ return metric==='weight_reps' || metric==='assisted' || metric==='weighted_bw'; }
/* A drop set lowers the weight. Time, reps-only, and assistance have nothing to drop. */
function canDropWeight(ex){
  const metric = ex && (ex.metric || 'weight_reps');
  return metric==='weight_reps' || metric==='weighted_bw';
}
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
  if(set.isWarmup || holdInProgress(set)) return 0;
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
  if(typeof spotterForget==='function') spotterForget(exerciseId);
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
    if(holdInProgress(set)){ set.isPR = false; return; }
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
    if(set.exerciseId===exerciseId && !set.isDropSet && !set.isWarmup && !holdInProgress(set)) refs.push({date:log.date, set});
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
/* One point per day you logged the exercise, best set that day. Unlike PR moments,
   a lighter day stays in the list, so a progress chart can fall. Oldest first. */
function sessionSeriesForExercise(exerciseId){
  const ex = getExercise(exerciseId); if(!ex) return [];
  const metric = metricOf(ex), higher = betterIsHigher(metric);
  const byDate = new Map();
  (DATA.logs||[]).forEach(log=>{
    (log.sets||[]).forEach(set=>{
      if(set.exerciseId!==exerciseId || set.isDropSet || set.isWarmup || holdInProgress(set)) return;
      const prev = byDate.get(log.date);
      if(!prev){ byDate.set(log.date, {date:log.date, set}); return; }
      const a = setPerformanceScore(set, metric), b = setPerformanceScore(prev.set, metric);
      if(higher ? a>b : a<b) byDate.set(log.date, {date:log.date, set});
    });
  });
  return [...byDate.values()].sort((a,b)=> a.date.localeCompare(b.date));
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
function snapLoad(weight, step){
  const s = step > 0 ? step : (TRAINING.load.minIncrementKg || TRAINING.load.plateStepKg || 2.5);
  return roundTo(Math.round(Number(weight||0)/s)*s, 2);
}
/* Smallest load change: plan-row jump → exercise Weight jump → equipment → fallback. */
function loadStepFor(exercise, planRow){
  if(planRow && planRow.loadStep > 0) return planRow.loadStep;
  if(exercise && exercise.loadStep > 0) return exercise.loadStep;
  const step = (TRAINING.load.minIncrementByEquip||{})[equipOf(exercise)];
  if(step > 0) return step;
  if(TRAINING.load.minIncrementKg > 0) return TRAINING.load.minIncrementKg;
  return TRAINING.load.plateStepKg || 2.5;
}
function roundToPlate(weight, step){
  return snapLoad(weight, step > 0 ? step : TRAINING.load.plateStepKg);
}
function nextLoadFor(exercise, currentWeight, planRow){
  const pct = LOWER_BODY_MUSCLES.has(primaryOf(exercise)) ? TRAINING.load.increasePctLower : TRAINING.load.increasePctUpper;
  const step = loadStepFor(exercise, planRow);
  const cur = Number(currentWeight)||0;
  const bump = Math.max(step, cur * pct/100);
  let next = snapLoad(cur + bump, step);
  if(next < cur + step - 1e-9)
    next = roundTo(Math.ceil((cur + step)/step - 1e-9)*step, 2);
  return next;
}
/* Suggest a heavier load: at least one full step up, optionally aiming at an ideal. */
function suggestHeavierLoad(exercise, currentWeight, ideal, planRow){
  const step = loadStepFor(exercise, planRow);
  const cur = Number(currentWeight)||0;
  let up = nextLoadFor(exercise, cur, planRow);
  if(ideal!=null && Number.isFinite(ideal))
    up = Math.max(up, snapLoad(ideal, step));
  if(up < cur + step - 1e-9) up = nextLoadFor(exercise, cur, planRow);
  return up;
}
/* The load to move to after reps fell below the range. Uses the same
   one-rep-max estimate as PRs to aim for the bottom of the range, rounds down
   to the equipment step and always moves at least one step. Assisted
   exercises get more assistance instead. */
function lowerLoadFor(exercise, weight, reps, targetReps, assisted, planRow){
  const step = assisted
    ? (loadStepFor(exercise, planRow) || TRAINING.load.assistanceStepKg)
    : loadStepFor(exercise, planRow);
  if(assisted)
    return roundTo(weight + step*Math.max(1, Math.ceil((targetReps-reps)/2)), 2);
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

  /* bodyweight reps and timed holds progress by reps or time, not load */
  if(metric==='reps_only' || metric==='time'){
    const minute = metric==='time' && isMinuteHold(ex);
    const key = metric==='time' ? 'duration' : 'reps';
    const best = Math.max(...lastNormal.map(s=>s[key]||0));
    const step = minute ? (effort.mostlyEasy?60:0) : metric==='time' ? (effort.mostlyEasy?15:10) : (effort.mostlyEasy?2:1);
    const target = minute ? best+step : (effort.mostlyHard ? best : best+step);
    status.targetValue = target;
    status.headline = minute ? `Try holding for ${formatHoldAmount(target)}`
      : metric==='time' ? `Try holding for ${target}s` : `Try for ${target} reps`;
    status.note = effort.mostlyHard ? 'That was tough — match it and hold your form.'
      : effort.mostlyEasy ? (minute ? 'Felt easy — add a minute this time.' : 'Felt easy — push for more this time.')
      : (minute ? 'Good session — hold that again.' : 'Good session — add a little.');
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
        ? Math.max(0, roundTo(referenceWeight - loadStepFor(ex, planRow), 2))
        : nextLoadFor(ex, referenceWeight, planRow);
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
      status.headline = `Stay at ${loadLabel(referenceWeight, metric)} for ${formatRepRange(repsMin, repsMax)} reps`;
      status.note = `New weight — build back up to ${repsMin}+ reps before changing it.`;
      return applyTodaysLoadChoice(status, exerciseId, referenceWeight, assisted, repsMin, repsMax);
    }
    // At plain bodyweight there is nothing to take off: build reps instead.
    const canLower = !(metric==='weighted_bw' && referenceWeight<=0);
    if(canLower && bestAtRef > 0 && bestAtRef < repsMin){
      status.state = 'lower';
      status.lowerWeight = lowerLoadFor(ex, referenceWeight, bestAtRef, repsMin, assisted, planRow);
      status.headline = assisted
        ? `Add assistance: ${status.lowerWeight}${units()} assist for ${formatRepRange(repsMin, repsMax)} reps`
        : `Drop to ${loadLabel(status.lowerWeight, metric)} for ${formatRepRange(repsMin, repsMax)} reps`;
      status.note = `Last time: ${loadLabel(referenceWeight, metric)} for ${bestAtRef} reps, below your ${formatRepRange(repsMin, repsMax)}${repsMin===repsMax?'-rep target':' range'}. For ${goal.label}, pick a weight you can do at least ${repsMin} times.`;
      return applyTodaysLoadChoice(status, exerciseId, referenceWeight, assisted, repsMin, repsMax);
    }
    status.headline = `Stay at ${loadLabel(referenceWeight, metric)} for ${formatRepRange(repsMin, repsMax)} reps`;
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
    status.headline = `Today's target: ${loadLabel(plan.weight, status.metric)} × ${formatRepRange(repsMin, repsMax)} reps`;
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
   {key, tone, headlines, note, nextWeight, volume, progress}. `progress`
   is {repsTarget, setsNeeded, atTarget, trackWeight} for the toward-more-weight
   meter. `headlines` are wordings of one message; tone is good | adjust | neutral.
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
  const minute = metric==='time' && isMinuteHold(ex);
  const val = s=> metric==='time' ? (s.duration||0) : (s.reps||0);
  const amount = n=> metric==='time' ? (minute ? formatHoldAmount(Math.abs(n)) : `${n}s`) : `${n} rep${n===1?'':'s'}`;
  const clock = s=> `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  const sameLoad = (a,b)=> !loadBased || Math.abs((a.weight||0)-(b.weight||0)) < 0.01;
  const out = {key:'', tone:'good', headlines:[], note:null, nextWeight:null, volume:null, progress:null};
  const say = (key, tone, headlines, extra)=> Object.assign(out, {key, tone, headlines}, extra||{});

  if(loadBased && !assisted && history[0]){
    const sum = sets=> Math.round(sets.reduce((a,s)=>a+setVolumeLoad(s),0));
    out.volume = {today:sum(todaySets), last:sum(history[0].sets)};
  }

  if(last.isWarmup){
    const rawTarget = status.targetWeight!=null ? status.targetWeight
      : status.state==='lower' ? status.lowerWeight : status.referenceWeight;
    if(loadBased && rawTarget!=null && !working.length && !(metric==='weighted_bw' && rawTarget<=0)){
      const target = snapLoad(rawTarget, loadStepFor(ex, planRow));
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
  const step = loadStepFor(ex, planRow);
  const lastText = setValueText(last, metric);
  const prior = todaySets[todaySets.length-2];
  const restSec = prior && last.ts && prior.ts ? Math.round((last.ts-prior.ts)/1000) : null;
  const planRest = restSecondsFor(planRow);
  const shortRest = restSec!=null && planRest>0 && restSec>=10 && restSec < planRest*0.6;
  const longRest = restSec!=null && planRest>0 && restSec < 15*60 && restSec > Math.max(planRest*2, planRest+90);
  const bump = (from, times)=>{
    let x = from;
    for(let i=0;i<times;i++) x = assisted ? Math.max(0, roundTo(x-step, 2)) : nextLoadFor(ex, x, planRow);
    return x;
  };

  /* Same rep target and set count that sessionQualifiesForIncrease uses, so
     "counts toward more weight" matches what the next session decides. */
  const setsNeeded = Math.min(goalConfig().qualifyingSets, targetSets || goalConfig().qualifyingSets);
  const stampProgress = ()=>{
    if(!loadBased || status.repsTarget==null){ out.progress = null; return; }
    const trackWeight = out.nextWeight!=null ? out.nextWeight : w;
    const atTarget = working.filter(s=> sameLoad(s, {weight:trackWeight}) && (s.reps||0) >= status.repsTarget).length;
    out.progress = {repsTarget:status.repsTarget, setsNeeded, atTarget, trackWeight};
  };
  const speak = (key, tone, headlines, extra)=>{
    say(key, tone, headlines, extra);
    stampProgress();
    return out;
  };
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
      /* Meter shows the 1-of-2 count; the note stays a short next-set cue. */
      if(atTarget < setsNeeded) return `${lead} · hit ${status.repsTarget}+ again`;
    }
    if(refNext && out.nextWeight==null && sameLoad(refNext, {weight:w})) return `${lead} · beat ${amount(val(refNext))} from last time`;
    return `${lead} × ${formatRepRange(repsMin, repsMax)}`;
  };
  const doneNote = ()=>{
    const total = working.reduce((a,s)=>a+val(s),0);
    if(loadBased && status.repsTarget!=null && status.referenceWeight!=null){
      const todayRef = mostCommonWeight(working, assisted);
      const qualifies = sessionQualifiesForIncrease({sets:working}, todayRef, status.repsTarget, setsNeeded, assisted);
      if(qualifies && Math.abs(todayRef - status.referenceWeight) < 0.01){
        const have = status.qualifyingSessions + 1;
        if(have >= status.sessionsRequired){
          const next = assisted
            ? Math.max(0, roundTo(todayRef - loadStepFor(ex, planRow), 2))
            : nextLoadFor(ex, todayRef, planRow);
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
  const tail = ()=>{
    stampProgress();
    return allDone ? doneNote() : nextNote();
  };

  if(reopened==='bonus' && working.length){
    const higher = betterIsHigher(metric);
    const top = working.reduce((a,s)=>{
      const d = setPerformanceScore(s, metric) - setPerformanceScore(a, metric);
      return (higher ? d>0 : d<0) ? s : a;
    });
    return speak('reopen-bonus','good',[
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
    stampProgress();
    return out;
  }

  if(last.isDropSet){
    return speak('drop','neutral',[
      "Drop set done — that's the finisher.",
      'Drop set in. Fully cooked.',
      'Drop set logged. Nothing left in the tank.']);
  }

  const heavierThanLast = loadBased && status.referenceWeight!=null
    && (assisted ? w < status.referenceWeight-0.01 : w > status.referenceWeight+0.01);
  const grace = heavierThanLast ? TRAINING.load.newLoadRepGrace : 0;
  if(loadBased && reps>0 && reps < repsMin - grace && !(metric==='weighted_bw' && w<=0)){
    const lower = lowerLoadFor(ex, w, reps, repsMin, assisted, planRow);
    const why = shortRest
      ? `Only ${clock(restSec)} rest (plan ${clock(planRest)}) — that likely cost reps.`
      : `${lastText} is below your ${formatRepRange(repsMin, repsMax)}${repsMin===repsMax?'-rep target':' range'}.`;
    return speak('lower','adjust', assisted
      ? [`Add assistance: ${lower}${units()} for the next set.`, `${reps} reps is under ${repsMin===repsMax?'target':'range'} — go ${lower}${units()} assist.`]
      : [`Drop to ${L(lower)} for the next set.`, `Too heavy for ${formatRepRange(repsMin, repsMax)}. Go ${L(lower)} next.`, `${reps} reps is under ${repsMin===repsMax?'target':'range'} — ${L(lower)} next set.`],
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
      const ideal = (w+bw)*(1+reps/30)/(1+mid/30) - bw;
      const up = assisted ? bump(w, over>=4 ? 2 : 1) : suggestHeavierLoad(ex, w, ideal, planRow);
      return speak('feel-up','adjust',[`Too light — go ${L(up)} for set ${todaySets.length+1}.`, `${reps} reps is above ${formatRepRange(repsMin, repsMax)}. Try ${L(up)} next.`],
        {nextWeight:up, note:`Aim for a weight you can do ${formatRepRange(repsMin, repsMax)} times.`});
    }
    if(last.difficulty==='easy'){
      const up = bump(w, 1);
      return speak('feel-easy','good',[`Good start. Add a step: ${L(up)} for set ${todaySets.length+1}.`, `Easy and in range — nudge up to ${L(up)}.`],
        {nextWeight:up, note:'Still easy next set? Keep climbing.'});
    }
    if(allDone){
      say('feel-done','good',[`All ${targetSets} sets done. ${L(w)} is your working weight.`, `Done — and you found your number: ${L(w)}.`]);
      out.note = doneNote();
      stampProgress();
      return out;
    }
    if(last.difficulty==='hard'){
      say('feel-hard','good',[`Right at your edge. Stay at ${L(w)}, keep form tight.`, `Hard but in range — ${L(w)} it is.`]);
      out.note = tail();
      return out;
    }
    say('feel-found','good',[`Found it — ${L(w)} is your working weight.`, `That's the one. Stay at ${L(w)}.`, `${L(w)} fits ${formatRepRange(repsMin, repsMax)}. Lock it in.`]);
    out.note = tail();
    return out;
  }

  // Load only goes up between sessions (see sessionQualifiesForIncrease), so no mid-session bump.
  if(loadBased && reps > repsMax+2 && !(assisted && w<=0)){
    say('over','good',[
      `${reps} reps — well above ${formatRepRange(repsMin, repsMax)}. Sessions like this earn the jump.`,
      `${reps} reps at ${L(w)}. Hold it — this is how the increase gets earned.`]);
    out.note = tail();
    return out;
  }

  if(prev && sameLoad(prev, last)){
    const drop = val(prev) - val(last);
    const seq = working.slice(-3).map(val).join(' → ');
    if(metric==='time' ? (minute ? drop>=60 : drop>=10) : drop>=3){
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
    const totalText = metric==='time' ? `${minute ? formatHoldAmount(total) : total+'s'} held` : `${total} reps`;
    return speak('done','good',[`All ${targetSets} sets done — ${totalText} total.`, `Target hit: ${targetSets} sets, ${totalText}.`], {note:doneNote()});
  }
  if(targetSets && n>targetSets){
    say('bonus','good',[`Bonus set — ${lastText}. Extra credit.`, `Past the plan: ${lastText}. Extra credit.`]);
    out.note = doneNote();
    stampProgress();
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
   line comparing it with the previous set, last session and the all-time best.
   When `status` has a repsTarget, also says whether the draft would count
   toward more weight. */
function makeStepperPreview(exerciseId, planRow, todaySets, status){
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
  const weightRef = prevToday ? {set:prevToday, label:'last set'} : lastRef ? {set:lastRef, label:'last time'} : null;
  const scores = loggedSetsForExercise(exerciseId).filter(s=>!s.isWarmup && !s.isDropSet).map(s=> setPerformanceScore(s, metric));
  const best = scores.length ? (higher ? Math.max(...scores) : Math.min(...scores)) : null;
  const minute = metric==='time' && isMinuteHold(ex);
  const val = s=> metric==='time' ? (s.duration||0) : (s.reps||0);
  const amount = n=> metric==='time' ? (minute ? formatHoldAmount(Math.abs(n)) : `${n}s`) : `${n} rep${n===1?'':'s'}`;
  const setsNeeded = Math.min(goalConfig().qualifyingSets, planRow.sets || goalConfig().qualifyingSets);
  const repsTarget = status && status.repsTarget;

  return draft=>{
    if(draft.warmup) return {text:"Warm-up: won't count toward sets or PRs.", tone:'neutral'};
    const v = setValuesFrom(metric, draft);
    if(!validSetValues(v)) return {text:'', tone:'neutral'};
    const score = setPerformanceScore(v, metric);
    if(best!=null && (higher ? score > best+1e-9 : score < best-1e-9)) return {text:`${setValueText(v, metric, ex)} would be a new PR 🏆`, tone:'pr'};
    if(loadBased && repsTarget!=null && setsNeeded>0){
      const atTarget = working.filter(s=> Math.abs((s.weight||0)-(v.weight||0)) < 0.01 && (s.reps||0) >= repsTarget).length;
      if(atTarget < setsNeeded){
        if((v.reps||0) >= repsTarget){
          const after = atTarget + 1;
          return {text: after>=setsNeeded
            ? `This set would finish it (${setsNeeded} of ${setsNeeded})`
            : `This set would count (${after} of ${setsNeeded})`, tone:'good'};
        }
        const track = prevToday || (status.referenceWeight!=null ? {weight:status.referenceWeight} : null);
        if(track && Math.abs((v.weight||0)-(track.weight||0)) < 0.01)
          return {text:`Need ${repsTarget}+ to count (${atTarget} of ${setsNeeded})`, tone:'neutral'};
      }
    }
    if(!weightRef) return {text:'', tone:'neutral'};
    const parts = [];
    if(loadBased){
      const dw = roundTo((v.weight||0) - (weightRef.set.weight||0), 2);
      if(Math.abs(dw) >= 0.01) parts.push(`${dw>0?'+':'−'}${Math.abs(dw)}${units()}${assisted?' assist':''} vs ${weightRef.label}`);
    }
    const repsRef = [lastRef, prevToday].find(s=> s && (!loadBased || Math.abs((s.weight||0)-(v.weight||0)) < 0.01));
    if(repsRef){
      const label = repsRef===prevToday ? 'last set' : 'last time';
      const dv = val(v) - val(repsRef);
      parts.push(dv>0 ? `+${amount(dv)} vs ${label}` : dv===0 ? `Same as ${label}` : `beat ${amount(val(repsRef))} (${label})`);
    }
    if(loadBased && v.reps < planRow.repsMin) parts.push(`below ${formatRepRange(planRow.repsMin, planRow.repsMax)}`);
    else if(loadBased && v.reps > planRow.repsMax) parts.push(`above ${formatRepRange(planRow.repsMin, planRow.repsMax)}`);
    return {text: parts.join(' · ') || `Same as ${weightRef.label}`, tone:'neutral'};
  };
}

/* Quick actions for the live Spotter: fill the draft from last session / target. */
function spotterChipActions(planRow, todaySets, status, metric){
  const loadBased = hasLoadField(metric);
  const working = todaySets.filter(s=>!s.isWarmup && !s.isDropSet);
  const history = recentSessions(planRow.exerciseId, 1, {before:todayKey()});
  const lastSession = history[0] ? history[0].sets.filter(s=>!s.isWarmup && !s.isDropSet) : [];
  const lastRef = lastSession[working.length] || lastSession[lastSession.length-1] || null;
  const chips = [];
  if(loadBased && status && status.repsTarget!=null)
    chips.push({key:'hit', label:`Hit ${status.repsTarget}+`, apply(d){ d.reps = status.repsTarget; }});
  if(lastRef)
    chips.push({key:'beat', label:'Beat last time', apply(d){
      Object.assign(d, pickSetValues(lastRef));
      if(lastRef.reps!=null) d.reps = lastRef.reps + 1;
      else if(lastRef.duration!=null) d.duration = lastRef.duration + (isMinuteHold(getExercise(planRow.exerciseId)) ? 60 : 5);
    }});
  return chips;
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

