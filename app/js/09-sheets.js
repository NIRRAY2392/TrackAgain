/* ============================ §9 SHEETS ============================ */

/* --- log / edit a set ------------------------------------------------ */
/* Appends one normal set to today's log. Shared by the sheet and the card's inline logger. */
function logNormalSet(exerciseId, values, effort, isWarmup, intent){
  const log = todayLog();
  persistLog(log);
  clearRunningHolds();
  const set = {id:uid(), exerciseId, difficulty:effort, intent, ts:Date.now(), isPR:false, isDropSet:false, isWarmup:!!isWarmup, ...values};
  log.sets.push(set);
  promoteStartedExercise(log, exerciseId);
  markWorkoutActivity(log);
  recomputePRs(exerciseId);
  saveData(DATA);
  return set;
}

const SET_VALUE_KEYS = ['weight','reps','duration'];
function pickSetValues(src){
  const out = {};
  SET_VALUE_KEYS.forEach(k=>{ if(src[k]!=null) out[k] = src[k]; });
  return out;
}

/* The card steppers' values in the shape a set or drop stage stores. */
function setValuesFrom(metric, d){
  if(metric==='time') return {duration:Math.round(d.duration)};
  if(metric==='reps_only') return {reps:Math.round(d.reps)};
  return {weight:d.weight, reps:Math.round(d.reps)};
}
function validSetValues(v){
  return Object.values(v).every(x=> typeof x==='number' && !isNaN(x) && x>=0)
    && !(v.reps!=null && v.reps<=0) && !(v.duration!=null && v.duration<=0);
}

/* Drops the weight on an already-logged set. A normal set becomes a drop set
   whose first stage is its original values. Returns false at the stage cap. */
function addDropStage(set, values, effort){
  if(!canDropWeight(getExercise(set.exerciseId))) return false;
  if(set.isDropSet && set.stages.length>=5) return false;
  releaseHold(set);
  if(!set.isDropSet){
    set.stages = [pickSetValues(set)];
    SET_VALUE_KEYS.forEach(k=> delete set[k]);
    Object.assign(set, {isDropSet:true, intent:null, isWarmup:false, isPR:false});
  }
  set.stages.push(values);
  set.difficulty = effort;
  recomputePRs(set.exerciseId);
  saveData(DATA);
  return true;
}

/* `stage` is null for a normal set; for a drop set it is the stage index being edited. */
function updateLoggedSet(set, stage, values, effort, isWarmup, intent){
  if(set.isDropSet && stage!=null) set.stages[stage] = values;
  else Object.assign(set, values, {isWarmup:!!isWarmup, intent});
  set.difficulty = effort;
  recomputePRs(set.exerciseId);
  saveData(DATA);
}

function snapshotSet(set){
  const log = DATA.logs.find(l=> (l.sets||[]).includes(set));
  return {log, index:log.sets.indexOf(set), copy:JSON.parse(JSON.stringify(set))};
}
function restoreSet(snap){
  const i = snap.log.sets.findIndex(s=>s.id===snap.copy.id);
  if(i>=0) snap.log.sets[i] = snap.copy;
  else snap.log.sets.splice(Math.min(snap.index, snap.log.sets.length), 0, snap.copy);
  recomputePRs(snap.copy.exerciseId);
  saveData(DATA);
  if(snap.copy.holdStartedAt) resumeHoldCountdown();
}
/* Removes a whole set (stage null) or one drop stage. A drop set left with a
   single stage turns back into a normal set. Returns a snapshot for undo. */
function removeSetOrStage(set, stage){
  const snap = snapshotSet(set);
  if(stage==null || !set.isDropSet) releaseHold(set);
  if(stage==null || !set.isDropSet){
    snap.log.sets.splice(snap.index, 1);
  } else {
    set.stages.splice(stage, 1);
    if(set.stages.length===1){
      Object.assign(set, set.stages[0], {isDropSet:false});
      delete set.stages;
    }
  }
  recomputePRs(set.exerciseId);
  saveData(DATA);
  return snap;
}

/* --- adjust today's target load -------------------------------------- */
function openLoadAdjustSheet(status){
  const planRow = (todayLog().plan||[]).find(r=>r && r.exerciseId===status.exerciseId) || null;
  const step = loadStepFor(getExercise(status.exerciseId), planRow);
  let weight = status.targetWeight != null ? status.targetWeight
    : (status.suggestedWeight != null ? status.suggestedWeight : (status.referenceWeight || 0));
  weight = snapLoad(weight, step);
  openSheet({
    root:SHEET_ROOT.picker, zIndex:150, title:"Today's weight",
    build:(body)=>{
      body.appendChild(el(`
        <div>
          <p class="faint small">Last session: ${loadLabel(status.referenceWeight||0, status.metric)}${status.suggestedWeight!=null?` · suggested ${loadLabel(status.suggestedWeight, status.metric)}`:''}</p>
          <div class="stepper">
            <button data-minus>−</button>
            <span class="v" data-value>${loadLabel(weight, status.metric)}</span>
            <button data-plus>+</button>
          </div>
          <button class="btn" data-use style="width:100%;">Use this weight today</button>
          <button class="btn secondary" data-clear style="width:100%;margin-top:10px;">Clear — decide at the rack</button>
        </div>`));
      const label = q('[data-value]',body);
      const paint = ()=> label.textContent = loadLabel(weight, status.metric);
      q('[data-minus]',body).onclick = ()=>{ weight = Math.max(0, roundTo(weight-step,2)); paint(); };
      q('[data-plus]',body).onclick  = ()=>{ weight = roundTo(weight+step,2); paint(); };
      q('[data-use]',body).onclick = ()=>{
        setLoadPlan(status.exerciseId, {weight, deferred:false});
        closeSheets(); showToast(`Target set: ${loadLabel(weight, status.metric)}`); renderApp();
      };
      q('[data-clear]',body).onclick = ()=>{
        clearLoadPlan(status.exerciseId);
        closeSheets(); renderApp();
      };
    }
  });
}

/* --- exercise picker: muscle first, then movement --------------------- */
function openExercisePicker(opts){
  const excluded = new Set(opts.exclude || []);
  let muscle = null, term = '';

  function paintList(container, sheet){
    container.innerHTML = '';
    if(!muscle && !term.trim()){
      const counts = {};
      DATA.exercises.forEach(e=>{ counts[primaryOf(e)] = (counts[primaryOf(e)]||0)+1; });
      REGION_ORDER.forEach(region=>{
        const muscles = MUSCLES.filter(m=>MUSCLE_REGION[m]===region && counts[m]);
        if(!muscles.length) return;
        container.appendChild(el(`<div class="region-label">${region}</div>`));
        const grid = el(`<div class="pick-grid"></div>`);
        muscles.forEach(m=>{
          const tile = el(`<button class="pick-tile">${escapeHtml(m)}<span class="cnt">${counts[m]} movements · ${escapeHtml(MUSCLE_HINT[m]||'')}</span></button>`);
          tile.onclick = ()=>{ muscle = m; draw(); };
          grid.appendChild(tile);
        });
        container.appendChild(grid);
      });
      return;
    }
    const pool = (muscle ? DATA.exercises.filter(e=>primaryOf(e)===muscle) : DATA.exercises).filter(e=>!excluded.has(e.id));
    const results = searchExercises(term, pool);
    if(!results.length) container.appendChild(el(`<p class="empty">Nothing matches that${muscle?` in ${escapeHtml(muscle)}`:''}.</p>`));
    results.forEach(e=>{
      const item = el(`
        <div class="pick-item">
          <div style="min-width:0;">
            <div class="nm">${escapeHtml(e.name)}</div>
            <div class="sub">${escapeHtml(exerciseSubtitle(e))}</div>
          </div>
          <span class="btn ghost" style="flex:0 0 auto;">Add +</span>
        </div>`);
      item.onclick = ()=>{ sheet.close(); opts.onPick(e.id); };
      container.appendChild(item);
    });
    const missing = el(`
      <div class="notfound">
        <p>Can't find what you're looking for?</p>
        <button class="btn secondary" data-new>＋ Add ${term.trim()?`"${escapeHtml(term.trim())}"`:'a movement'} to my library</button>
      </div>`);
    q('[data-new]',missing).onclick = ()=> openExerciseFormSheet({
      prefillName: term.trim(), prefillMuscle: muscle,
      onSaved:(id)=>{ sheet.close(); opts.onPick(id); }
    });
    container.appendChild(missing);
  }

  function draw(){
    openSheet({
      root:SHEET_ROOT.picker, zIndex:150,
      title: muscle || opts.title || 'Add exercise',
      onBack: muscle ? ()=>{ muscle=null; term=''; draw(); } : null,
      build:(body, sheet)=>{
        body.appendChild(el(`
          <div>
            ${muscle ? '' : '<p class="faint small" style="margin-bottom:12px;">Pick the muscle you\'re training, then choose the movement.</p>'}
            ${searchFieldHtml('pickSearch', muscle?`Search in ${muscle}…`:'Search all exercises…', term)}
            <div data-list></div>
          </div>`));
        const list = q('[data-list]',body);
        paintList(list, sheet);
        const search = q('#pickSearch',body);
        search.oninput = ()=>{ term = search.value; paintList(list, sheet); };
      }
    });
  }
  draw();
}

/* --- add / edit an exercise in the library ---------------------------- */
function openExerciseFormSheet(opts){
  opts = opts || {};
  const ex = opts.exercise || null;
  const isEdit = !!ex;
  const selected = new Set(ex ? secondaryOf(ex) : []);
  const metricLocked = isEdit && hasHistory(ex.id);
  const muscle0 = ex ? primaryOf(ex) : (opts.prefillMuscle || MUSCLES[0]);
  const equip0 = ex ? equipOf(ex) : 'other';
  const pattern0 = ex ? patternOf(ex) : 'other';
  const tier0 = ex ? tierOf(ex) : 'compound';
  const metric0 = ex ? metricOf(ex) : 'weight_reps';
  const patternLabel = p=> (PATTERN_LABELS[p]||p).replace(/^./,c=>c.toUpperCase());
  const tierLabel = t=> t==='isolation' ? 'Isolation (single-joint)' : 'Compound (multi-joint)';

  openSheet({
    root:SHEET_ROOT.form, zIndex:200,
    title: isEdit ? 'Edit exercise' : 'Add an exercise',
    build:(body, sheet)=>{
      body.appendChild(el(`
        <div>
          <p class="faint small" style="margin-bottom:12px;">${isEdit?'Update how this movement is tracked and matched to alternatives.':'It joins your library like any other movement — same tracking, same suggestions.'}</p>
          <div class="field"><label>Name</label><input id="exName" placeholder="e.g. Incline Cable Fly" value="${escapeHtml(ex?ex.name:(opts.prefillName||''))}"></div>
          <div class="grid2">
            <div class="field">${choiceFieldHtml({id:'exMuscle', label:'Main muscle', value:muscle0, display:muscle0})}</div>
            <div class="field">${choiceFieldHtml({id:'exEquip', label:'Equipment', value:equip0, display:EQUIPMENT_LABELS[equip0]||equip0})}</div>
          </div>
          <div class="grid2">
            <div class="field">${choiceFieldHtml({id:'exPattern', label:'Movement type', value:pattern0, display:patternLabel(pattern0)})}</div>
            <div class="field">${choiceFieldHtml({id:'exTier', label:'Effort', value:tier0, display:tierLabel(tier0)})}</div>
          </div>
          <div class="field">${choiceFieldHtml({id:'exMetric', label:'How is it measured?', value:metric0, display:METRIC_LABELS[metric0]||metric0, disabled:metricLocked})}
            ${metricLocked?'<p class="faint small" style="margin-top:6px;">Locked because this exercise already has logged sets.</p>':''}</div>
          <div class="field"><label>Weight jump (kg, optional)</label>
            <input id="exLoadStep" type="number" min="0" step="0.25" inputmode="decimal" value="${ex && ex.loadStep>0 ? ex.loadStep : ''}">
            <p class="faint small" style="margin-top:6px;">The smallest weight change your gym has for this. Leave empty to use the equipment default.</p></div>
          <div class="field"><label>Also works (optional)</label><div class="row wrap" data-secondary style="gap:6px;"></div></div>
          <div class="field"><label>Note (optional)</label><input id="exNote" placeholder="e.g. seat setting 4, wide grip" value="${escapeHtml(ex?(ex.equipmentNote||''):'')}"></div>
          <label class="row" style="gap:8px;margin:12px 0;font-size:13px;color:var(--text-dim);cursor:pointer;">
            <input type="checkbox" id="exFlag" style="width:auto;" ${ex&&ex.flagged?'checked':''}>
            <span>Flag as a common gym movement (kept as a copy-list in Settings)</span>
          </label>
          <button class="btn" data-save style="width:100%;">${isEdit?'Save changes':'Add to library'}</button>
          ${isEdit && ex.userAdded ? '<button class="btn danger" data-delete style="width:100%;margin-top:10px;">Delete this exercise</button>' : ''}
        </div>`));

      const secondaryBox = q('[data-secondary]',body);
      const paintSecondary = ()=>{
        secondaryBox.innerHTML = '';
        MUSCLES.filter(m=>m!=='Other').forEach(m=>{
          const chip = el(`<span class="chip ${selected.has(m)?'on':''}">${m}</span>`);
          chip.onclick = ()=>{ selected.has(m) ? selected.delete(m) : selected.add(m); paintSecondary(); };
          secondaryBox.appendChild(chip);
        });
      };
      paintSecondary();
      const equipBtn = q('#exEquip',body), stepInput = q('#exLoadStep',body);
      const paintStepHint = ()=>{ stepInput.placeholder = `Default ${loadStepFor({equipment:choiceFieldValue(equipBtn)})} kg`; };
      bindChoiceField(q('#exMuscle',body), {title:'Main muscle', options:()=> MUSCLES.map(m=>({value:m, label:m}))});
      bindChoiceField(equipBtn, {
        title:'Equipment',
        options:()=> Object.keys(EQUIPMENT_LABELS).map(k=>({value:k, label:EQUIPMENT_LABELS[k]})),
        onChange:()=> paintStepHint()
      });
      bindChoiceField(q('#exPattern',body), {
        title:'Movement type',
        options:()=> Object.keys(PATTERN_LABELS).map(p=>({value:p, label:patternLabel(p)}))
      });
      bindChoiceField(q('#exTier',body), {
        title:'Effort',
        options:()=> [
          {value:'compound', label:tierLabel('compound')},
          {value:'isolation', label:tierLabel('isolation')}
        ]
      });
      if(!metricLocked) bindChoiceField(q('#exMetric',body), {
        title:'How is it measured?',
        options:()=> Object.keys(METRIC_LABELS).map(k=>({value:k, label:METRIC_LABELS[k]}))
      });
      paintStepHint();

      q('[data-save]',body).onclick = ()=>{
        const name = q('#exName',body).value.trim();
        if(!name){ showToast('Give it a name'); return; }
        if(DATA.exercises.some(e=>e.name.toLowerCase()===name.toLowerCase() && (!ex || e.id!==ex.id))){
          showToast('You already have that exercise'); return;
        }
        const primary = choiceFieldValue(q('#exMuscle',body));
        const stepRaw = stepInput.value.trim();
        const loadStep = stepRaw==='' ? null : roundTo(parseFloat(stepRaw), 2);
        if(loadStep!==null && !(loadStep>0 && loadStep<=50)){ showToast('Weight jump must be between 0 and 50 kg'); return; }
        const fields = {
          name, primary, muscleGroup:primary,
          secondary:[...selected].filter(m=>m!==primary),
          pattern:choiceFieldValue(q('#exPattern',body)),
          equipment:choiceFieldValue(equipBtn),
          equipmentNote:q('#exNote',body).value.trim(),
          tier:choiceFieldValue(q('#exTier',body)),
          metric:choiceFieldValue(q('#exMetric',body)),
          loadStep,
          flagged:q('#exFlag',body).checked
        };
        let id;
        if(isEdit){ Object.assign(ex, fields); id = ex.id; showToast('Exercise updated'); }
        else {
          const created = Object.assign(makeExercise({name, primary, secondary:[], pattern:'other', equipment:'other', tier:'compound', metric:'weight_reps', popularity:55}),
            fields, {userAdded:true, popularity:55, metaVersion:2});
          DATA.exercises.push(created);
          id = created.id;
          showToast(fields.flagged ? 'Added to your library — thanks for the suggestion!' : 'Added to your library');
        }
        saveData(DATA);
        sheet.close();
        if(opts.onSaved) opts.onSaved(id); else renderApp();
      };

      const deleteBtn = q('[data-delete]',body);
      if(deleteBtn) deleteBtn.onclick = ()=> deleteExerciseFromLibrary(ex);
    }
  });
}
function deleteExerciseFromLibrary(ex){
  if(!ex) return;
  if(hasHistory(ex.id)){ showToast("Can't delete — you have sets logged for this"); return; }
  confirmAction(`Remove ${ex.name} from your library?`, 'Remove', ()=>{
    DATA.exercises = DATA.exercises.filter(e=>e.id!==ex.id);
    const strip = rows=>{
      const kept = (rows||[]).filter(r=>r.exerciseId!==ex.id);
      dissolveTinySupersets(kept);
      return kept;
    };
    const stripSplit = split=> DAY_KEYS.forEach(dk=>{
      const day = split && split.days && split.days[dk];
      if(day) day.exercises = strip(day.exercises);
    });
    Object.values(DATA.splits).forEach(stripSplit);
    (DATA.presets||[]).forEach(p=> stripSplit(p.split));
    (DATA.sessions||[]).forEach(s=>{ if(s) s.exercises = strip(s.exercises); });
    DATA.logs.forEach(log=>{
      if(Array.isArray(log.plan)) log.plan = strip(log.plan);
      if(Array.isArray(log.queued)) log.queued = strip(log.queued);
    });
    saveData(DATA);
    closeSheets();
    showToast('Removed');
    renderApp();
  });
}

/* --- alternatives / variations ---------------------------------------- */
function openAlternativesSheet(opts){
  const rows = opts.rows, index = opts.index, afterChange = opts.onChange || (()=>{});
  const row = rows[index];
  const source = getExercise(row.exerciseId);
  if(!source) return;
  const alternatives = alternativesFor(source.id, {exclude: rows.map(r=>r.exerciseId), limit:5});

  openSheet({
    root:SHEET_ROOT.picker, zIndex:150,
    title:`Alternatives for ${source.name}`,
    build:(body, sheet)=>{
      body.appendChild(el(`<p class="faint small" style="margin-bottom:14px;">${escapeHtml(primaryOf(source))} · ${escapeHtml(PATTERN_LABELS[patternOf(source)])} · ${escapeHtml(equipLabel(source))}</p>`));
      if(!alternatives.length) body.appendChild(el(`<p class="empty">No close matches in your library yet. Add one and it'll show up here.</p>`));
      alternatives.forEach(alt=>{
        const item = el(`
          <div class="alt-item">
            <div style="min-width:0;">
              <div style="font-weight:700;font-size:15px;">${escapeHtml(alt.ex.name)}</div>
              <div class="why">${escapeHtml(alternativeReason(alt))}</div>
              <div style="margin-top:7px;">${tagsHtml([primaryOf(alt.ex), equipLabel(alt.ex)])}</div>
            </div>
            <div class="row" style="margin-top:10px;">
              <button class="btn" data-replace style="flex:1;">Replace</button>
              <button class="btn secondary" data-extra style="flex:1;">Add as extra</button>
            </div>
          </div>`);
        const applyReplace = ()=>{
          replacePlanExercise(row, alt.ex.id);
          sheet.close(); showToast(`Swapped to ${alt.ex.name} 🔁`); afterChange();
        };
        q('[data-replace]',item).onclick = ()=>{
          // sets already logged today stay in history, so make the swap explicit
          if(opts.loggedSets) confirmAction(`You've already logged ${opts.loggedSets} set${opts.loggedSets>1?'s':''} of ${source.name} today. They stay in your history. Replace anyway?`, 'Replace', applyReplace);
          else applyReplace();
        };
        q('[data-extra]',item).onclick = ()=>{
          if(opts.fromSession){
            sheet.close();
            addExerciseToActiveWorkout(alt.ex.id);
            return;
          }
          rows.splice(index+1, 0, newPlanRow(alt.ex.id,{goal:DATA.settings.goal}));
          const added = rows[index+1];
          added.sets = row.sets; added.repsMin = row.repsMin; added.repsMax = row.repsMax; added.rpe = row.rpe;
          sheet.close(); showToast(`${alt.ex.name} added`); afterChange();
        };
        body.appendChild(item);
      });
      const browse = el(`
        <div class="notfound" style="margin-top:6px;">
          <p>Want something that isn't here?</p>
          <button class="btn secondary" data-browse>Browse the full library</button>
        </div>`);
      q('[data-browse]',browse).onclick = ()=>{
        sheet.close();
        openExercisePicker({
          title:'Replace exercise',
          exclude: rows.map(r=>r.exerciseId),
          onPick:(id)=>{ replacePlanExercise(row, id); showToast('Exercise swapped 🔁'); afterChange(); }
        });
      };
      body.appendChild(browse);
    }
  });
}

/* Swap today's hit list to another split day, a saved session, or empty custom. */
function todaySessionLabel(kind, dayKey){
  if(kind==='session'){
    const session = getSession(dayKey);
    return (session && session.name) || 'Session';
  }
  if(kind==='custom') return 'Custom';
  const key = kind==='scheduled' ? weekdayKey() : dayKey;
  const day = splitDayFor(key);
  return day.name || DAY_LABELS[key] || 'Workout';
}
function pickTodaySession(kind, dayKey, sheet){
  const log = todayLog();
  const label = todaySessionLabel(kind, dayKey);
  const go = ()=>{
    applyTodaySession(kind, dayKey);
    sheet.close();
    showToast(kind==='scheduled' ? `Back to ${label}` : `Today is ${label}`);
  };
  if((log.sets||[]).length){
    confirmAction(`Switch today's workout to ${label}? Sets you already logged stay in today's history.`, 'Switch', go);
    return;
  }
  go();
}
function isCurrentTodaySession(log, kind, key){
  const usual = weekdayKey();
  if(kind==='scheduled') return !log.customSession && (log.dayKey||usual)===usual;
  if(kind==='day') return !log.customSession && log.dayKey===key;
  if(kind==='session') return !!log.customSession && log.sessionId===key;
  if(kind==='custom') return !!log.customSession && !log.sessionId;
  return false;
}
function openTodaySessionSheet(){
  const log = todayLog();
  const usual = weekdayKey();
  openSheet({
    title:'Want to do something else?',
    build:(body, sheet)=>{
      const list = el(`<div class="choice-list"></div>`);
      const add = (title, sub, kind, key, opts)=>{
        opts = opts || {};
        const on = isCurrentTodaySession(log, kind, key);
        const item = el(`<div class="choice-item"></div>`);
        const row = el(`
          <button type="button" class="choice-row${on?' on':''}" role="option" aria-selected="${on}">
            <span class="choice-row-label">${escapeHtml(title)}<span class="choice-row-sub">${escapeHtml(sub)}</span></span>
            <span class="choice-row-check" aria-hidden="true">${on ? icon('check',18) : ''}</span>
          </button>`);
        row.onclick = ()=>{
          if(on){ sheet.close(); return; }
          if(opts.onPick){ opts.onPick(); return; }
          pickTodaySession(kind, key, sheet);
        };
        item.appendChild(row);
        if(opts.onGear){
          const gear = el(`<button type="button" class="choice-gear plan-gear" title="Edit" aria-label="Edit">${icon('settings',16)}</button>`);
          gear.onclick = (e)=>{ e.stopPropagation(); opts.onGear(); };
          item.appendChild(gear);
        }
        list.appendChild(item);
      };

      const daySub = (dk, extra)=>{
        const day = splitDayFor(dk);
        const n = (day.exercises||[]).length;
        const base = n
          ? `${day.name || 'Workout'} · ${n} exercise${n===1?'':'s'}`
          : `${day.name || 'Rest'}`;
        return extra ? `${base} · ${extra}` : base;
      };
      add(DAY_LABELS[usual], daySub(usual, 'today\'s usual day'), 'scheduled', usual, {
        onGear:()=> openDayEditor(usual)
      });
      DAY_ORDER.forEach(dk=>{
        if(dk===usual) return;
        add(DAY_LABELS[dk], daySub(dk), 'day', dk, {
          onGear:()=> openDayEditor(dk)
        });
      });

      list.appendChild(el(`<div class="choice-section">Sessions</div>`));
      const sessions = Array.isArray(DATA.sessions) ? DATA.sessions.slice() : [];
      sessions.forEach(session=>{
        if(!session || !session.id) return;
        const n = (session.exercises||[]).length;
        const sub = n ? `${n} exercise${n===1?'':'s'}` : 'No exercises yet';
        add(session.name || 'Session', sub, 'session', session.id, {
          onGear:()=> openSessionEditor(session.id)
        });
      });
      add('+ New session', 'Name it and save a list you can pick later', 'new', null, {
        onPick:()=> openSessionEditor(null)
      });
      add('Start empty', 'Add exercises as you go', 'custom', null);

      body.appendChild(list);
    }
  });
}

/* ------------------------------ Split ------------------------------ */
function renderSplitScreen(){
  const wrap = el(`<div></div>`);
  const today = weekdayKey();
  const using = currentPreset();
  const usingName = using ? using.name : (activeSplit().label || 'Split');
  wrap.appendChild(el(`
    <div style="margin-bottom:14px;">
      <h3 style="margin-bottom:6px;">${escapeHtml(usingName)}</h3>
      ${using && using.subtitle ? `<p class="faint small" style="margin:0 0 6px;">${escapeHtml(using.subtitle)}</p>` : ''}
      <p class="faint small">This is the preset Home follows. Saving a day updates it. Edit any day for its list, order, supersets and warm-ups.</p>
    </div>`));

  DAY_ORDER.forEach(dk=>{
    const day = splitDays()[dk];
    const names = day.exercises.map(r=>{
      const nm = (getExercise(r.exerciseId)||{}).name;
      return nm ? (r.oftenDoneAsDropSet ? `${nm} 🔻` : nm) : null;
    }).filter(Boolean);
    const muscles = [...new Set(day.exercises.map(r=>primaryOf(getExercise(r.exerciseId))).filter(m=>m&&m!=='Other'))];
    const supersetCount = new Set(day.exercises.filter(r=>r.supersetId).map(r=>r.supersetId)).size;
    const wuCount = Array.isArray(day.warmups) ? day.warmups.length : 0;
    const card = el(`
      <div class="day-card ${dk===today?'today':''}" data-open-day role="button" tabindex="0">
        <div class="row between">
          <div style="min-width:0;">
            <div class="dayname">${DAY_LABELS[dk]} ${dk===today?'<span class="tag" style="border-color:var(--accent);color:var(--accent);">Today</span>':''}</div>
            <div class="faint small" style="margin-top:3px;">${escapeHtml(day.name)} · ${day.exercises.length ? day.exercises.length+' exercises' : 'rest day'}${wuCount?` · ${wuCount} warm-up${wuCount>1?'s':''}`:''}${supersetCount?` · 🔗 ${supersetCount} superset${supersetCount>1?'s':''}`:''}</div>
          </div>
          <button class="btn ghost" data-edit>Edit →</button>
        </div>
        ${names.length ? `<div class="exline">${names.map(escapeHtml).join(' · ')}</div>` : ''}
        ${muscles.length ? `<div style="margin-top:8px;">${tagsHtml(muscles)}</div>` : ''}
      </div>`);
    const openDay = ()=> openDayEditor(dk);
    card.onclick = (e)=>{ if(e.target.closest('[data-edit]')) return; openDay(); };
    card.onkeydown = (e)=>{
      if(e.target!==card || (e.key!=='Enter' && e.key!==' ')) return;
      e.preventDefault(); openDay();
    };
    q('[data-edit]',card).onclick = (e)=>{ e.stopPropagation(); openDay(); };
    wrap.appendChild(card);
  });

  const actionCard = el(`
    <div class="card flat">
      <button class="btn" data-new style="width:100%;">${icon('plus',16)} New preset</button>
      <button class="btn secondary" data-copy style="width:100%;margin-top:8px;">${icon('copy',16)} Save a copy</button>
      <button class="btn secondary" data-update style="width:100%;margin-top:8px;">Update another preset</button>
    </div>`);
  q('[data-new]',actionCard).onclick = openNewPresetSheet;
  q('[data-copy]',actionCard).onclick = openSavePresetCopySheet;
  q('[data-update]',actionCard).onclick = openUpdatePresetSheet;
  wrap.appendChild(actionCard);

  wrap.appendChild(el(`<div class="section-title">Presets</div>`));
  const activeId = DATA.activePresetId;
  const presets = (DATA.presets||[]).slice().sort((a,b)=> (a.id===activeId?-1:0) - (b.id===activeId?-1:0));
  const onlyPreset = presets.length<=1;
  if(!presets.length){
    wrap.appendChild(el(`<p class="faint small" style="text-align:center;margin:0 0 8px;">No presets yet. Create one to start a week.</p>`));
  } else {
    const list = el(`<div class="card flat" style="padding:6px 14px;"></div>`);
    presets.forEach(preset=>{
      const days = trainedDayCount(preset.split);
      const inUse = preset.id===activeId;
      const row = el(`
        <div class="hist-day">
          <div class="row between" style="align-items:flex-start;gap:8px;">
            <div style="min-width:0;flex:1;${inUse?'':'cursor:pointer;'}" data-load>
              <strong>${escapeHtml(preset.name)}</strong>
              ${inUse?' <span class="tag" style="border-color:var(--accent);color:var(--accent);">In use</span>':''}
              ${preset.subtitle?`<div class="faint small">${escapeHtml(preset.subtitle)}</div>`:''}
              <div class="faint small">${days} training day${days===1?'':'s'}</div>
            </div>
            <div class="rowbtns">
              <button class="iconbtn" data-edit title="Rename" aria-label="Rename">${icon('pencil',16)}</button>
              ${onlyPreset?'':`<button class="iconbtn danger" data-del title="Delete">✕</button>`}
            </div>
          </div>
        </div>`);
      if(!inUse){
        q('[data-load]',row).onclick = ()=> confirmAction('Use “'+preset.name+'”? The week Home follows changes. History, stats, and weight logs stay.', 'Use', ()=>{
          switchToPreset(preset.id);
          showToast('Using “'+preset.name+'”');
          renderApp();
        });
      }
      q('[data-edit]',row).onclick = (e)=>{ e.stopPropagation(); openEditPresetSheet(preset.id); };
      const del = q('[data-del]',row);
      if(del) del.onclick = (e)=>{
        e.stopPropagation();
        const next = (DATA.presets||[]).find(p=>p.id!==preset.id);
        const wasActive = preset.id===DATA.activePresetId;
        const msg = wasActive
          ? 'Delete “'+preset.name+'”? You’re using it. You’ll switch to “'+next.name+'”.'
          : 'Delete the preset “'+preset.name+'”? This cannot be undone.';
        confirmAction(msg, 'Delete', ()=>{
          if(wasActive && next){
            usePreset(next);
            syncActiveWorkoutFromSplit({replaceAll:true});
          }
          DATA.presets = DATA.presets.filter(p=>p.id!==preset.id);
          dismissBuiltinPreset(preset);
          saveData(DATA);
          showToast(wasActive ? 'Now using “'+next.name+'”' : 'Preset deleted');
          renderApp();
        });
      };
      list.appendChild(row);
    });
    wrap.appendChild(list);
  }

  return wrap;
}

/* Every movement: library details plus sets and time. Opened from Settings. */
function renderEditExercisesScreen(){
  const wrap = el(`<div class="edit-ex"></div>`);
  const onCount = DATA.exercises.filter(ex=>exerciseOnActiveSplit(ex.id)).length;
  const offCount = DATA.exercises.length - onCount;
  const pin = el(`
    <div class="edit-ex-pin" data-pin-head>
      <div class="edit-ex-nav">
        <button type="button" class="edit-ex-back" data-back aria-label="Back to settings">${icon('chevronLeft',22)}<span>Settings</span></button>
        <h3>Edit exercises</h3>
        <button type="button" class="iconbtn edit-ex-add" data-add aria-label="Add an exercise">${icon('plus',20)}</button>
      </div>
      ${searchFieldHtml('editExerciseSearch','Search movements…', editExerciseSearch)}
      <div class="seg two edit-ex-seg" role="tablist" aria-label="Which exercises">
        <button type="button" role="tab" data-filter="on" aria-selected="${editExerciseFilter==='on'}" class="${editExerciseFilter==='on'?'on':''}">On split <span class="n">${onCount}</span></button>
        <button type="button" role="tab" data-filter="off" aria-selected="${editExerciseFilter==='off'}" class="${editExerciseFilter==='off'?'on':''}">Not on split <span class="n">${offCount}</span></button>
      </div>
    </div>`);
  q('[data-back]',pin).onclick = backToSettings;
  q('[data-add]',pin).onclick = ()=> openExerciseFormSheet({
    onSaved:(id)=>{
      editExerciseFilter = 'off';
      openEditMuscleGroup = primaryOf(getExercise(id));
      renderApp();
      openExercisePlanSheet(id);
    }
  });
  qa('[data-filter]',pin).forEach(btn=> btn.onclick = ()=>{
    editExerciseFilter = btn.dataset.filter;
    window.scrollTo(0,0);
    renderApp();
  });
  wrap.appendChild(pin);
  const results = el(`<div class="edit-ex-results" data-edit-results></div>`);
  wrap.appendChild(results);
  const redraw = ()=> paintEditExercises(results, redraw);
  const input = q('#editExerciseSearch', pin);
  input.oninput = ()=>{ editExerciseSearch = input.value; redraw(); };
  redraw();
  return wrap;
}
function editExerciseRow(ex){
  const hits = splitOccurrencesForExercise(ex.id);
  const preview = previewPlanForExercise(ex.id);
  const summary = planRowSummary(preview, metricOf(ex), ex);
  const dayBits = hits.length
    ? [...new Set(hits.map(h=>DAY_LABELS[h.dayKey]))].join(' · ')
    : 'Not on this split';
  const item = el(`
    <div class="edit-ex-row" role="button" tabindex="0">
      <div class="copy">
        <div class="nm">${escapeHtml(ex.name)}</div>
        <div class="meta">${escapeHtml(dayBits)} · ${escapeHtml(summary)}</div>
      </div>
      <span class="edit-ex-go" aria-hidden="true">${icon('chevronRight',18)}</span>
    </div>`);
  const open = ()=> openExercisePlanSheet(ex.id);
  item.onclick = open;
  item.onkeydown = (e)=>{
    if(e.key!=='Enter' && e.key!==' ') return;
    e.preventDefault(); open();
  };
  return item;
}
function appendLibraryMuscleGroups(container, list, opts){
  REGION_ORDER.forEach(region=>{
    const regionMuscles = MUSCLES.filter(m=>MUSCLE_REGION[m]===region && list.some(item=>opts.muscleOf(item)===m));
    if(!regionMuscles.length) return;
    const block = el(`<div class="edit-ex-region-block"></div>`);
    const stack = el(`<div class="edit-ex-card edit-ex-drop-stack"></div>`);
    stack.appendChild(el(`<div class="edit-ex-region in-card">${escapeHtml(region)}</div>`));
    regionMuscles.forEach(muscle=>{
      const group = list.filter(item=>opts.muscleOf(item)===muscle);
      const isOpen = opts.openKey===muscle;
      const drop = el(`<div class="edit-ex-drop${isOpen?' open':''}"></div>`);
      const head = el(`
        <button type="button" class="edit-ex-drop-head" aria-expanded="${isOpen}">
          <span class="nm">${escapeHtml(muscle)}</span>
          <span class="edit-ex-drop-meta">
            <span class="count-pill">${group.length}</span>
            <span class="edit-ex-chev" aria-hidden="true">${icon('chevronDown',16)}</span>
          </span>
        </button>`);
      head.onclick = ()=> opts.onToggle(isOpen ? null : muscle);
      drop.appendChild(head);
      if(isOpen){
        const body = el(`<div class="edit-ex-drop-body"></div>`);
        group.forEach(item=> body.appendChild(opts.rowFor(item)));
        drop.appendChild(body);
      }
      stack.appendChild(drop);
    });
    block.appendChild(stack);
    container.appendChild(block);
  });
}
function paintEditExercises(container, redraw){
  container.innerHTML = '';
  const term = editExerciseSearch.trim();
  const onSplit = [];
  const offSplit = [];
  DATA.exercises.forEach(ex=>{
    if(exerciseOnActiveSplit(ex.id)) onSplit.push(ex);
    else offSplit.push(ex);
  });
  const source = editExerciseFilter==='on' ? onSplit : offSplit;
  const list = term ? searchExercises(term, source) : source.slice().sort(compareExercises);
  const empty = editExerciseFilter==='on'
    ? (term ? 'No match on this split.' : 'No exercises on the week yet.')
    : (term ? 'No match off the split.' : 'Every exercise is already on the week.');

  if(!list.length){
    container.appendChild(el(`<p class="edit-ex-empty">${escapeHtml(empty)}</p>`));
    if(term) container.appendChild(addMissingBox(term, `Add “${term}”?`, redraw));
    return;
  }

  if(term){
    const card = el(`<div class="edit-ex-card"></div>`);
    list.forEach(ex=> card.appendChild(editExerciseRow(ex)));
    container.appendChild(card);
    container.appendChild(addMissingBox(term, 'Not the one you meant?', redraw));
    return;
  }

  appendLibraryMuscleGroups(container, list, {
    muscleOf: primaryOf,
    rowFor: editExerciseRow,
    openKey: openEditMuscleGroup,
    onToggle:(muscle)=>{ openEditMuscleGroup = muscle; redraw(); }
  });
}

function readUniquePresetName(raw, exceptId){
  const name = (raw||'').trim();
  if(!name){ showToast('Give the preset a name'); return null; }
  if(presetNameTaken(name, exceptId, DATA.presets)){ showToast('You already have a preset with that name'); return null; }
  return name;
}
function openNewPresetSheet(){
  const presets = DATA.presets || [];
  openSheet({
    title:'New preset',
    build:(body, sheet)=>{
      const options = ['<option value="">Empty week</option>'].concat(presets.map(p=>
        `<option value="${escapeHtml(p.id)}"${p.id===DATA.activePresetId?' selected':''}>Copy of ${escapeHtml(p.name)}</option>`
      )).join('');
      body.appendChild(el(`
        <div>
          <p class="faint small" style="margin-bottom:12px;">Name it first. The week switches to this preset. The one you were using stays in the list.</p>
          <div class="field"><label>Preset name</label><input id="presetName" placeholder="e.g. Cut"></div>
          <div class="field"><label>Description (optional)</label><input id="presetSub" placeholder="e.g. 4-day upper lower"></div>
          <div class="field"><label>Start from</label><select id="presetFrom">${options}</select></div>
          <button class="btn" data-save style="width:100%;">Create preset</button>
        </div>`));
      const nameInput = q('#presetName',body);
      setTimeout(()=> nameInput && nameInput.focus(), 50);
      q('[data-save]',body).onclick = ()=>{
        const name = readUniquePresetName(q('#presetName',body).value, null);
        if(!name) return;
        const subtitle = (q('#presetSub',body).value||'').trim();
        const fromId = q('#presetFrom',body).value;
        const source = fromId ? presets.find(p=>p.id===fromId) : null;
        const split = source && source.split ? cloneSplit(source.split) : blankSplit(name);
        const go = ()=>{
          storePreset(name, subtitle, split, true);
          sheet.close();
          showToast('Using “'+name+'”');
          renderApp();
        };
        if(activeWorkoutLog()){
          confirmAction('Use “'+name+'”? The week Home follows changes. History, stats, and weight logs stay.', 'Use', go);
        } else go();
      };
    }
  });
}
function openSavePresetCopySheet(){
  const current = currentPreset();
  const currentName = current ? current.name : (activeSplit().label || 'Split');
  const suggested = availablePresetName(DATA.presets, 'Copy of '+currentName);
  openSheet({
    title:'Save a copy',
    build:(body, sheet)=>{
      body.appendChild(el(`
        <div>
          <p class="faint small" style="margin-bottom:12px;">Stores a frozen copy of this week. You stay on ${escapeHtml(currentName)}.</p>
          <div class="field"><label>Preset name</label><input id="presetName" placeholder="e.g. Cut" value="${escapeHtml(suggested)}"></div>
          <div class="field"><label>Description (optional)</label><input id="presetSub" placeholder="e.g. before I changed Friday" value="${escapeHtml(current && current.subtitle || '')}"></div>
          <button class="btn" data-save style="width:100%;">Save copy</button>
        </div>`));
      const nameInput = q('#presetName',body);
      setTimeout(()=> nameInput && nameInput.focus(), 50);
      q('[data-save]',body).onclick = ()=>{
        const name = readUniquePresetName(q('#presetName',body).value, null);
        if(!name) return;
        const subtitle = (q('#presetSub',body).value||'').trim();
        storePreset(name, subtitle, activeSplit(), false);
        sheet.close();
        showToast('Saved “'+name+'”');
        renderApp();
      };
    }
  });
}
function openUpdatePresetSheet(){
  const others = (DATA.presets||[]).filter(p=>p.id!==DATA.activePresetId);
  openSheet({
    title:'Update another preset',
    build:(body, sheet)=>{
      if(!others.length){
        body.appendChild(el(`<p class="faint small">You don’t have another preset yet. Create one, or save a copy.</p>`));
        return;
      }
      body.appendChild(el(`<p class="faint small" style="margin-bottom:12px;">Copies this week onto that preset. Its name and description stay.</p>`));
      others.forEach(preset=>{
        const days = trainedDayCount(preset.split);
        const item = el(`
          <div class="pick-item">
            <div>
              <div class="nm">${escapeHtml(preset.name)}</div>
              <div class="sub">${preset.subtitle?escapeHtml(preset.subtitle)+' · ':''}${days} training day${days===1?'':'s'}</div>
            </div>
            <span class="btn ghost">Update</span>
          </div>`);
        item.onclick = ()=> confirmAction('Replace the days in “'+preset.name+'” with this week? Its name stays.', 'Update', ()=>{
          overwritePresetFromActive(preset.id);
          sheet.close();
          showToast('Updated “'+preset.name+'”');
          renderApp();
        });
        body.appendChild(item);
      });
    }
  });
}
function openEditPresetSheet(presetId){
  const preset = (DATA.presets||[]).find(p=>p.id===presetId);
  if(!preset) return;
  const builtin = builtinPresetDef(preset);
  openSheet({
    title:'Edit preset',
    build:(body, sheet)=>{
      body.appendChild(el(`
        <div>
          <div class="field"><label>Preset name</label><input id="presetName" value="${escapeHtml(preset.name)}"></div>
          <div class="field"><label>Description (optional)</label><input id="presetSub" value="${escapeHtml(preset.subtitle||'')}" placeholder="e.g. PPL + UL"></div>
          <button class="btn" data-save style="width:100%;">Save</button>
          ${builtin && preset.customized ? `<button class="btn secondary" data-reset style="width:100%;margin-top:8px;">Reset to original</button>` : ''}
        </div>`));
      q('[data-save]',body).onclick = ()=>{
        const name = readUniquePresetName(q('#presetName',body).value, preset.id);
        if(!name) return;
        preset.name = name;
        preset.subtitle = (q('#presetSub',body).value||'').trim();
        if(preset.split) preset.split.label = preset.name;
        if(builtin) preset.customized = true;
        saveData(DATA);
        sheet.close();
        showToast('Preset updated');
        renderApp();
      };
      const resetBtn = q('[data-reset]',body);
      if(resetBtn) resetBtn.onclick = ()=> confirmAction('Put “'+builtin.name+'” back to the original week? Edits to this preset are replaced.', 'Reset', ()=>{
        resetBuiltinPreset(preset);
        sheet.close();
        showToast('Preset reset');
        renderApp();
      });
    }
  });
}

/* Shared draft editor for a split day or a saved session.
   Nothing is written until Save. cfg: title, draft, nameLabel,
   namePlaceholder, liveNote, showCopy, onCopy, saveLabel, emptyText,
   addTitle, newRow, editRow, onSave, onDelete?, discardKind, focusExerciseId. */
function openPlanListEditor(cfg){
  let draft = cfg.draft;
  if(!Array.isArray(draft.exercises)) draft.exercises = [];
  if(!Array.isArray(draft.warmups)) draft.warmups = [];
  let dirty = false;
  let selected = new Set();
  let openIdx = -1;
  if(cfg.focusExerciseId){
    const at = draft.exercises.findIndex(r=>r.exerciseId===cfg.focusExerciseId);
    if(at>=0) openIdx = at;
  }
  let openWuIdx = -1;
  let editorScroll = 0;
  const discardKind = cfg.discardKind || 'this day';
  const saveLabel = cfg.saveLabel || 'Save day';

  const discard = ()=>{ closeSheets(); renderApp(); };
  const guard = ()=> dirty ? confirmAction(`Discard unsaved changes to ${discardKind}?`, 'Discard', discard) : discard();
  const remapSelected = (mapper)=>{
    selected = new Set([...selected].map(mapper).filter(i=>i>=0 && i<draft.exercises.length));
    if(openIdx>=0){
      const next = mapper(openIdx);
      openIdx = (next>=0 && next<draft.exercises.length) ? next : -1;
    }
  };

  function draw(){
    openSheet({
      title: cfg.title,
      startFull: true,
      onRequestClose: guard,
      build:(body, sheet)=>{
        const wuMins = warmupsMinutes(draft.warmups);
        const liveNote = typeof cfg.liveNote==='function' ? cfg.liveNote() : cfg.liveNote;
        body.appendChild(el(`
          <div class="day-editor">
            <div class="field day-name"><label>${escapeHtml(cfg.nameLabel||'Day name')}</label><input id="dayName" value="${escapeHtml(draft.name||'')}" placeholder="${escapeHtml(cfg.namePlaceholder||'')}"></div>
            ${liveNote ? `<p class="day-live">${liveNote}</p>` : ''}
            <div class="day-editor-bar">
              <span class="day-count">Exercises <span class="count-pill">${draft.exercises.length}</span></span>
              ${cfg.showCopy ? `<button class="btn ghost day-copy" data-copy>${icon('copy',16)} Copy day</button>` : ''}
            </div>
            <p class="day-hint">Tick 2–4 boxes to group a superset. Tap a row to replace it or move it. The gear opens sets and time for that movement.</p>
            <div data-group-bar></div>
            <div class="day-rows" data-rows></div>
            <div class="day-action-row" style="margin:10px 0 18px;">
              <button class="btn secondary day-add" data-add>${icon('plus',16)} Add exercise</button>
            </div>
            <div class="day-editor-bar">
              <span class="day-count">Warm-ups <span class="count-pill">${draft.warmups.length}</span>${wuMins?`<span class="day-count-meta">· ~${wuMins} min</span>`:''}</span>
              <button type="button" class="iconbtn day-wu-reset" data-suggest-wu title="Reset to everyday basics" aria-label="Reset to everyday basics">${icon('reopen',18)}</button>
            </div>
            <p class="day-hint">Everyday basics are bodyweight only. Add more from the Warm-up library, or tap reset to restore the short basics list.</p>
            <div class="day-rows" data-wu-rows></div>
            <div class="day-action-row" style="margin:10px 0 4px;">
              <button class="btn secondary day-add" data-add-wu>${icon('plus',16)} Add warm-up</button>
            </div>
            <div class="day-editor-actions">
              <div class="day-action-row">
                <button class="btn day-save" data-save>${icon('check',16)} ${escapeHtml(saveLabel)}</button>
              </div>
              ${cfg.onDelete ? `<div class="day-action-row" style="margin-top:8px;"><button class="btn danger" data-delete style="width:100%;">Delete session</button></div>` : ''}
              <p class="day-foot">Nothing is saved until you tap ${escapeHtml(saveLabel)}.</p>
            </div>
          </div>`));
        q('#dayName',body).oninput = (e)=>{ draft.name = e.target.value; dirty = true; };

        const groupBar = q('[data-group-bar]',body);
        if(selected.size>=2 && selected.size<=4){
          const btn = el(`<button class="btn secondary">${icon('link',16)} Group ${selected.size} exercises into a superset</button>`);
          btn.onclick = ()=>{
            const groupId = uid();
            draft.exercises.forEach((r,i)=>{ if(selected.has(i)) r.supersetId = groupId; });
            dissolveTinySupersets(draft.exercises);
            selected = new Set();
            dirty = true; draw();
          };
          groupBar.appendChild(btn);
        } else if(selected.size>4){
          groupBar.appendChild(el(`<p class="group-note warn">Supersets can have at most 4 exercises — deselect one to continue.</p>`));
        } else if(selected.size===1){
          groupBar.appendChild(el(`<p class="group-note">Select one more exercise (2-4 total) to group into a superset.</p>`));
        }

        const rowsBox = q('[data-rows]',body);
        if(!draft.exercises.length) rowsBox.appendChild(el(`<p class="empty">${escapeHtml(cfg.emptyText||'No exercises yet. Add one below, or leave it empty.')}</p>`));
        const redraw = ()=>{ dirty = true; draw(); };
        const ctx = {
          redraw,
          markDirty:()=>{ dirty = true; },
          selected,
          remapSelected,
          isOpen:(idx)=> idx===openIdx,
          toggleOpen:(idx)=>{ openIdx = openIdx===idx ? -1 : idx; openWuIdx = -1; draw(); },
          toggleSelect:(idx)=>{ selected.has(idx) ? selected.delete(idx) : selected.add(idx); draw(); },
          ungroup:(groupId)=>{ draft.exercises.forEach(r=>{ if(r.supersetId===groupId) r.supersetId=null; }); dirty=true; draw(); },
          removeFromGroup:(idx)=>{
            const gid = draft.exercises[idx].supersetId;
            draft.exercises[idx].supersetId = null;
            const remaining = draft.exercises.filter(r=>r.supersetId===gid);
            if(remaining.length<2) remaining.forEach(r=>r.supersetId=null);
            dirty = true; draw();
          },
          editRow:(row)=> cfg.editRow(row, redraw)
        };
        groupPlanRows(draft.exercises).forEach(g=>{
          if(g.type==='single'){
            rowsBox.appendChild(planRowEditor(g.row, g.idx, draft, ctx));
          } else {
            const box = el(`
              <div class="superset-wrap">
                <div class="ss-label"><span class="badge-ss">${icon('link',12)} Superset</span><button class="btn ghost" data-ungroup>Ungroup</button></div>
                <div data-members></div>
              </div>`);
            q('[data-ungroup]',box).onclick = ()=> ctx.ungroup(g.supersetId);
            const membersBox = q('[data-members]',box);
            g.members.forEach(m=> membersBox.appendChild(planRowEditor(m.row, m.idx, draft, ctx, {inGroup:true})));
            rowsBox.appendChild(box);
          }
        });

        const wuBox = q('[data-wu-rows]',body);
        if(!draft.warmups.length) wuBox.appendChild(el(`<p class="empty">No warm-ups yet. Add from the library, or tap reset for everyday bodyweight basics.</p>`));
        const wuCtx = {
          redraw:()=>{ dirty = true; draw(); },
          markDirty:()=>{ dirty = true; },
          isOpen:(idx)=> idx===openWuIdx,
          toggleOpen:(idx)=>{ openWuIdx = openWuIdx===idx ? -1 : idx; openIdx = -1; draw(); }
        };
        draft.warmups.forEach((row, idx)=> wuBox.appendChild(warmupRowEditor(row, idx, draft, wuCtx)));

        q('[data-add]',body).onclick = ()=> openExercisePicker({
          title: cfg.addTitle || 'Add exercise',
          exclude: draft.exercises.map(r=>r.exerciseId),
          onPick:(id)=>{
            draft.exercises.push(cfg.newRow(id));
            openIdx = draft.exercises.length-1;
            dirty = true; draw();
          }
        });
        q('[data-add-wu]',body).onclick = ()=> openWarmupPicker({
          title:'Add warm-up',
          excludeTitles: draft.warmups.map(w=>(w.title||'').toLowerCase()),
          onPick:(libItem)=>{
            draft.warmups.push(newWarmupRowFromLibrary(libItem));
            openWuIdx = draft.warmups.length-1;
            dirty = true; draw();
          }
        });
        q('[data-suggest-wu]',body).onclick = ()=>{
          const apply = ()=>{
            draft.warmups = basicWarmupsForDay();
            openWuIdx = -1;
            dirty = true; draw();
            showToast('Warm-ups reset to basics');
          };
          if(draft.warmups.length)
            confirmAction('Reset warm-ups to everyday bodyweight basics? Your current list will be replaced.', 'Reset', apply);
          else apply();
        };
        const copyBtn = q('[data-copy]',body);
        if(copyBtn && cfg.onCopy) copyBtn.onclick = ()=> cfg.onCopy(draft, draw);
        q('[data-save]',body).onclick = ()=>{
          draft.warmups = (draft.warmups||[]).map(normalizeWarmupRow).filter(Boolean);
          cfg.onSave(draft);
        };
        const delBtn = q('[data-delete]',body);
        if(delBtn && cfg.onDelete) delBtn.onclick = ()=> cfg.onDelete(draft);
        const modal = q('.modal', sheet.node);
        if(modal){
          modal.classList.add('day-sheet');
          modal.scrollTop = editorScroll;
          modal.onscroll = ()=>{ editorScroll = modal.scrollTop; };
        };
      }
    });
  }
  draw();
}
/* Draft-based editor: nothing is written to DATA until "Save day". */
function openDayEditor(dayKey, focusExerciseId){
  const splitKey = DATA.activeSplit;
  const draft = clone(splitDays()[dayKey]);
  openPlanListEditor({
    title: DAY_LABELS[dayKey],
    draft,
    nameLabel:'Day name',
    namePlaceholder:'e.g. Push, Pull, Rest',
    discardKind:'this day',
    focusExerciseId,
    liveNote:()=>{
      const liveWorkout = activeWorkoutLog();
      if(!(liveWorkout && !liveWorkout.customSession && liveWorkout.dayKey===dayKey)) return '';
      const presetLabel = (currentPreset()||{}).name || 'this preset';
      return `This workout is already going. Saving updates ${escapeHtml(presetLabel)} and today’s workout.`;
    },
    showCopy:true,
    onCopy:(d, draw)=> openCopyDaySheet(dayKey, d, draw),
    saveLabel:'Save day',
    emptyText:'Rest day — no exercises yet. Add one below, or leave it empty.',
    addTitle:`Add to ${DAY_LABELS[dayKey]}`,
    newRow:(id)=> planRowForNewExercise(id,{goal:DATA.settings.goal, dayKey}),
    editRow:(row, redraw)=>{
      openExercisePlanSheet(row.exerciseId, {
        /* The gear sheet takes the editor's place; closing it brings the unsaved day back. */
        onClosed: redraw,
        onSaved:()=>{
          const liveRows = (splitDays()[dayKey]||{}).exercises || [];
          draft.exercises.forEach((r,i)=>{
            if(!r || r.exerciseId!==row.exerciseId) return;
            const src = (liveRows[i] && liveRows[i].exerciseId===r.exerciseId)
              ? liveRows[i]
              : liveRows.find(x=>x && x.exerciseId===r.exerciseId);
            if(src) applyPlanFieldsToRow(r, planFieldsSnapshot(src));
          });
          renderApp();
          redraw();
        }
      });
    },
    onSave:(d)=>{
      DATA.splits[splitKey].days[dayKey] = d;
      touchActivePreset();
      const refreshed = splitKey===DATA.activeSplit && syncActiveWorkoutFromSplit({dayKey, fromSave:true});
      saveData(DATA);
      closeSheets();
      const live = refreshed && activeWorkoutLog();
      showToast(live ? 'Saved. Today’s workout updated.' : refreshed ? 'Saved. Today’s hit list updated.' : 'Day saved');
      renderApp();
    }
  });
}
/* Sets and time for one row on a saved session (not the split or library default). */
function openSessionRowSheet(row, onSaved){
  const ex = getExercise(row.exerciseId);
  if(!ex) return;
  openSheet({
    root:SHEET_ROOT.picker, zIndex:150,
    title: ex.name,
    build:(body, sheet)=>{
      body.appendChild(el(`
        <div class="session-plan">
          <p class="faint small" style="margin-top:0;">Only this session. Your split and the library default stay as they are.${isTreadmill(ex)?' Walk as long as you like — there is no planned time.':''}</p>
          <div data-fields></div>
          <button class="btn" data-save style="width:100%;margin-top:14px;">Save</button>
        </div>`));
      const fields = q('[data-fields]', body);
      fields.innerHTML = planEditorFieldsHtml(row, ex, {prefix:'ses'});
      bindPlanEditorEquipment(fields, {prefix:'ses'});
      q('[data-save]', body).onclick = ()=>{
        applyPlanFieldsToRow(row, readPlanEditorFields(fields, ex, {prefix:'ses'}));
        if(typeof spotterForget==='function') spotterForget(row.exerciseId);
        sheet.close();
        if(onSaved) onSaved();
        else showToast('Saved');
      };
    }
  });
}
function openSessionEditor(sessionId){
  const existing = sessionId ? getSession(sessionId) : null;
  const isNew = !existing;
  const draft = existing
    ? {name:existing.name||'Session', exercises:clone(existing.exercises||[]), warmups:Array.isArray(existing.warmups) ? clone(existing.warmups) : warmupsForSession(existing)}
    : {name:'New session', exercises:[], warmups:[]};
  const liveNote = ()=>{
    const log = todayLog();
    if(!(log.customSession && log.sessionId && existing && log.sessionId===existing.id)) return '';
    return 'This is today’s workout. Saving updates it too.';
  };
  openPlanListEditor({
    title: existing ? (existing.name || 'Session') : 'New session',
    draft,
    nameLabel:'Session name',
    namePlaceholder:'e.g. Full Body, Quick Upper',
    discardKind:'this session',
    liveNote,
    showCopy:false,
    saveLabel:'Save session',
    emptyText:'No exercises yet. Add one below, or leave it empty.',
    addTitle:'Add to session',
    newRow:(id)=> planRowForNewExercise(id,{goal:DATA.settings.goal}),
    editRow:(row, redraw)=> openSessionRowSheet(row, redraw),
    onSave:(d)=>{
      const name = (d.name||'').trim() || 'Session';
      d.name = name;
      d.warmups = (d.warmups||[]).map(normalizeWarmupRow).filter(Boolean);
      d.exercises = (d.exercises||[]).filter(r=>r && r.exerciseId);
      if(isNew){
        const saved = {id:uid(), name, exercises:d.exercises, warmups:d.warmups};
        DATA.sessions = Array.isArray(DATA.sessions) ? DATA.sessions : [];
        DATA.sessions.push(saved);
        saveData(DATA);
        closeSheets();
        showToast('Session saved');
        renderApp();
        return;
      }
      existing.name = name;
      existing.exercises = d.exercises;
      existing.warmups = d.warmups;
      const refreshed = syncTodayFromSession(existing.id);
      saveData(DATA);
      closeSheets();
      showToast(refreshed ? 'Saved. Today’s workout updated.' : 'Session saved');
      renderApp();
    },
    onDelete: isNew ? null : ()=>{
      const name = (existing.name||'this session');
      confirmAction(`Delete ${name}? It leaves Something else?. Today’s list stays if you already picked it.`, 'Delete', ()=>{
        dismissBuiltinSession(existing);
        DATA.sessions = (DATA.sessions||[]).filter(s=>s && s.id!==existing.id);
        saveData(DATA);
        closeSheets();
        showToast('Session deleted');
        renderApp();
      });
    }
  });
}

/* Sets and time for one movement — on the split (per day) or a saved default. */
function planEditorFieldsHtml(row, ex, opts){
  opts = opts || {};
  const metric = metricOf(ex);
  const walk = isTreadmill(ex);
  const minute = isMinuteHold(ex) && !walk;
  const prefix = opts.prefix || '';
  const f = name=> prefix ? `${prefix}-${name}` : name;
  return `
    <div class="plan-metrics${minute?' hold':walk?' walk':''}">
      <div><label>Sets</label><input type="number" min="1" inputmode="numeric" value="${row.sets}" data-field="${f('sets')}"></div>
      ${minute ? `
      <div class="plan-hold"><label>Min hold</label>${holdFieldsHtml(row.repsMin, {minAttr:`data-hold-field="${f('repsMin')}" data-hold-part="min"`, secAttr:`data-hold-field="${f('repsMin')}" data-hold-part="sec"`})}</div>
      <div class="plan-hold"><label>Max hold</label>${holdFieldsHtml(row.repsMax, {minAttr:`data-hold-field="${f('repsMax')}" data-hold-part="min"`, secAttr:`data-hold-field="${f('repsMax')}" data-hold-part="sec"`})}</div>`
      : walk ? ''
      : `<div><label>${metric==='time'?'Min sec':'Min reps'}</label><input type="number" min="1" inputmode="numeric" value="${row.repsMin}" data-field="${f('repsMin')}"></div>
      <div><label>${metric==='time'?'Max sec':'Max reps'}</label><input type="number" min="1" inputmode="numeric" value="${row.repsMax}" data-field="${f('repsMax')}"></div>`}
      <div><label>RPE</label><input type="number" min="5" max="10" step="0.5" inputmode="decimal" value="${row.rpe!=null?row.rpe:''}" data-field="${f('rpe')}" placeholder="—"></div>
    </div>
    <div class="plan-extra${hasLoadField(metric)?' load':''}" style="margin-top:10px;">
      <div class="field" style="margin:0;"><label>Note</label><input value="${escapeHtml(row.notes||'')}" data-field="${f('notes')}" placeholder="${walk?'e.g. until time is left':'e.g. slow negatives'}"></div>
      <div class="field" style="margin:0;"><label>Rest (sec)</label><input type="number" min="0" inputmode="numeric" value="${row.restSeconds!=null?row.restSeconds:''}" data-field="${f('restSeconds')}" placeholder="${defaultRestSeconds()}"></div>
      ${hasLoadField(metric) ? `<div class="field" style="margin:0;"><label>Weight jump (kg)</label><input type="number" min="0.5" max="50" step="0.5" inputmode="decimal" value="${row.loadStep!=null?row.loadStep:''}" data-field="${f('loadStep')}" placeholder="${loadStepFor(ex)}"></div>` : ''}
    </div>
    <div class="field" data-equip-wrap style="margin:10px 0 0;">
      ${choiceFieldHtml({id:f('equip'), label:'Equipment', value:row.equipment||'', display:(row.equipment && EQUIPMENT_LABELS[row.equipment]) || 'Use the library'})}
    </div>
    ${canDropWeight(ex) ? `<label class="plan-drop" style="margin-top:10px;">
      <span>Often done as a drop set <span class="hint">· hint only</span></span>
      <input type="checkbox" class="switch" data-field="${f('oftenDoneAsDropSet')}" ${row.oftenDoneAsDropSet?'checked':''}>
    </label>` : ''}`;
}
function readPlanEditorFields(scope, ex, opts){
  opts = opts || {};
  const walk = isTreadmill(ex);
  const minute = isMinuteHold(ex) && !walk;
  const prefix = opts.prefix || '';
  const f = name=> prefix ? `${prefix}-${name}` : name;
  const fields = planFieldsSnapshot({
    sets:1, repsMin:1, repsMax:1, rpe:null, notes:'', restSeconds:null, loadStep:null, equipment:null, oftenDoneAsDropSet:false
  });
  const sets = parseInt(q(`[data-field="${f('sets')}"]`, scope).value, 10);
  if(!isNaN(sets) && sets>=1) fields.sets = sets;
  if(minute){
    ['repsMin','repsMax'].forEach(field=>{
      const minEl = q(`input[data-hold-field="${f(field)}"][data-hold-part="min"]`, scope);
      const secEl = q(`input[data-hold-field="${f(field)}"][data-hold-part="sec"]`, scope);
      const got = readHoldFields(minEl, secEl);
      if(got) fields[field] = got.duration;
    });
  } else if(!walk){
    ['repsMin','repsMax'].forEach(field=>{
      const n = parseInt(q(`[data-field="${f(field)}"]`, scope).value, 10);
      if(!isNaN(n) && n>=1) fields[field] = n;
    });
  } else {
    fields.repsMin = 600;
    fields.repsMax = 600;
  }
  if(!walk && fields.repsMin>fields.repsMax){
    const swap = fields.repsMin;
    fields.repsMin = fields.repsMax;
    fields.repsMax = swap;
  }
  const rpeEl = q(`[data-field="${f('rpe')}"]`, scope);
  if(rpeEl){
    const raw = (rpeEl.value||'').trim();
    if(raw==='') fields.rpe = null;
    else {
      const n = parseFloat(raw);
      fields.rpe = isNaN(n) ? null : Math.min(10, Math.max(5, n));
    }
  }
  const restEl = q(`[data-field="${f('restSeconds')}"]`, scope);
  if(restEl){
    const restRaw = (restEl.value||'').trim();
    fields.restSeconds = restRaw==='' ? null : Math.max(0, parseInt(restRaw, 10)||0);
  }
  const notesEl = q(`[data-field="${f('notes')}"]`, scope);
  if(notesEl) fields.notes = notesEl.value;
  const stepEl = q(`[data-field="${f('loadStep')}"]`, scope);
  if(stepEl){
    const raw = (stepEl.value||'').trim();
    if(raw==='') fields.loadStep = null;
    else {
      const n = parseFloat(raw);
      fields.loadStep = (!isNaN(n) && n>0) ? Math.min(50, roundTo(n, 2)) : null;
    }
  }
  const equipBtn = q(`#${f('equip')}`, scope) || q('[data-equip-wrap] .choice-field', scope);
  if(equipBtn){
    const value = choiceFieldValue(equipBtn);
    fields.equipment = value && EQUIPMENT_LABELS[value] ? value : null;
  }
  const dropEl = q(`[data-field="${f('oftenDoneAsDropSet')}"]`, scope);
  fields.oftenDoneAsDropSet = !!(dropEl && dropEl.checked && canDropWeight(ex));
  return fields;
}
function bindPlanEditorEquipment(scope, opts){
  opts = opts || {};
  const prefix = opts.prefix || '';
  const id = prefix ? `${prefix}-equip` : 'equip';
  const btn = q(`#${id}`, scope) || q('[data-equip-wrap] .choice-field', scope);
  if(!btn) return;
  bindChoiceField(btn, {
    title:'Equipment',
    options:()=> [{value:'', label:'Use the library'}].concat(Object.keys(EQUIPMENT_LABELS).map(value=>({value, label:EQUIPMENT_LABELS[value]})))
  });
}
function patternChoiceLabel(p){ return (PATTERN_LABELS[p]||p).replace(/^./,c=>c.toUpperCase()); }
function tierChoiceLabel(t){ return t==='isolation' ? 'Isolation (single-joint)' : 'Compound (multi-joint)'; }
function bindExerciseMetaFields(scope, ex){
  const selected = new Set(secondaryOf(ex));
  const metricLocked = hasHistory(ex.id);
  const secondaryBox = q('[data-secondary]', scope);
  const paintSecondary = ()=>{
    if(!secondaryBox) return;
    secondaryBox.innerHTML = '';
    MUSCLES.filter(m=>m!=='Other').forEach(m=>{
      const chip = el(`<span class="chip ${selected.has(m)?'on':''}">${m}</span>`);
      chip.onclick = ()=>{ selected.has(m) ? selected.delete(m) : selected.add(m); paintSecondary(); };
      secondaryBox.appendChild(chip);
    });
  };
  paintSecondary();
  const equipBtn = q('#exEquip', scope), stepInput = q('#exLoadStep', scope);
  const paintStepHint = ()=>{ if(stepInput) stepInput.placeholder = `Default ${loadStepFor({equipment:choiceFieldValue(equipBtn)})} kg`; };
  bindChoiceField(q('#exMuscle', scope), {title:'Main muscle', options:()=> MUSCLES.map(m=>({value:m, label:m}))});
  if(equipBtn) bindChoiceField(equipBtn, {
    title:'Equipment',
    options:()=> Object.keys(EQUIPMENT_LABELS).map(k=>({value:k, label:EQUIPMENT_LABELS[k]})),
    onChange:()=> paintStepHint()
  });
  bindChoiceField(q('#exPattern', scope), {
    title:'Movement type',
    options:()=> Object.keys(PATTERN_LABELS).map(p=>({value:p, label:patternChoiceLabel(p)}))
  });
  bindChoiceField(q('#exTier', scope), {
    title:'Effort',
    options:()=> [
      {value:'compound', label:tierChoiceLabel('compound')},
      {value:'isolation', label:tierChoiceLabel('isolation')}
    ]
  });
  if(!metricLocked) bindChoiceField(q('#exMetric', scope), {
    title:'How is it measured?',
    options:()=> Object.keys(METRIC_LABELS).map(k=>({value:k, label:METRIC_LABELS[k]}))
  });
  paintStepHint();
  return {selected, metricLocked};
}
function readExerciseMetaFields(scope, ex, selected){
  const name = (q('#exName', scope).value||'').trim();
  if(!name){ showToast('Give it a name'); return null; }
  if(DATA.exercises.some(e=>e.name.toLowerCase()===name.toLowerCase() && e.id!==ex.id)){
    showToast('You already have that exercise'); return null;
  }
  const primary = choiceFieldValue(q('#exMuscle', scope));
  const stepInput = q('#exLoadStep', scope);
  const stepRaw = stepInput ? stepInput.value.trim() : '';
  const loadStep = stepRaw==='' ? null : roundTo(parseFloat(stepRaw), 2);
  if(loadStep!==null && !(loadStep>0 && loadStep<=50)){ showToast('Weight jump must be between 0 and 50 kg'); return null; }
  const metricLocked = hasHistory(ex.id);
  return {
    name, primary, muscleGroup:primary,
    secondary:[...selected].filter(m=>m!==primary),
    pattern:choiceFieldValue(q('#exPattern', scope)),
    equipment:choiceFieldValue(q('#exEquip', scope)),
    equipmentNote:(q('#exNote', scope).value||'').trim(),
    tier:choiceFieldValue(q('#exTier', scope)),
    metric: metricLocked ? metricOf(ex) : choiceFieldValue(q('#exMetric', scope)),
    loadStep,
    flagged:!!(q('#exFlag', scope) && q('#exFlag', scope).checked)
  };
}
function exerciseMetaFieldsHtml(ex){
  const muscle0 = primaryOf(ex);
  const equip0 = equipOf(ex);
  const pattern0 = patternOf(ex);
  const tier0 = tierOf(ex);
  const metric0 = metricOf(ex);
  const metricLocked = hasHistory(ex.id);
  return `
    <div class="field"><label>Name</label><input id="exName" placeholder="e.g. Incline Cable Fly" value="${escapeHtml(ex.name||'')}"></div>
    <div class="grid2">
      <div class="field">${choiceFieldHtml({id:'exMuscle', label:'Main muscle', value:muscle0, display:muscle0})}</div>
      <div class="field">${choiceFieldHtml({id:'exEquip', label:'Equipment', value:equip0, display:EQUIPMENT_LABELS[equip0]||equip0})}</div>
    </div>
    <div class="grid2">
      <div class="field">${choiceFieldHtml({id:'exPattern', label:'Movement type', value:pattern0, display:patternChoiceLabel(pattern0)})}</div>
      <div class="field">${choiceFieldHtml({id:'exTier', label:'Effort', value:tier0, display:tierChoiceLabel(tier0)})}</div>
    </div>
    <div class="field">${choiceFieldHtml({id:'exMetric', label:'How is it measured?', value:metric0, display:METRIC_LABELS[metric0]||metric0, disabled:metricLocked})}
      ${metricLocked?'<p class="faint small" style="margin-top:6px;">Locked because this exercise already has logged sets.</p>':''}</div>
    <div class="field"><label>Weight jump (kg, optional)</label>
      <input id="exLoadStep" type="number" min="0" step="0.25" inputmode="decimal" value="${ex.loadStep>0 ? ex.loadStep : ''}">
      <p class="faint small" style="margin-top:6px;">The smallest weight change your gym has for this. Leave empty to use the equipment default.</p></div>
    <div class="field"><label>Also works (optional)</label><div class="row wrap" data-secondary style="gap:6px;"></div></div>
    <div class="field"><label>Note (optional)</label><input id="exNote" placeholder="e.g. seat setting 4, wide grip" value="${escapeHtml(ex.equipmentNote||'')}"></div>
    <label class="row" style="gap:8px;margin:12px 0;font-size:13px;color:var(--text-dim);cursor:pointer;">
      <input type="checkbox" id="exFlag" style="width:auto;" ${ex.flagged?'checked':''}>
      <span>Flag as a common gym movement (kept as a copy-list in Settings)</span>
    </label>`;
}
function openExercisePlanSheet(exerciseId, opts){
  opts = opts || {};
  const ex = getExercise(exerciseId);
  if(!ex) return;
  const occurrences = splitOccurrencesForExercise(exerciseId).map(hit=>({
    dayKey: hit.dayKey,
    draft: clone(hit.row)
  }));
  const onSplit = occurrences.length>0;
  const defaultDraft = onSplit ? null : Object.assign({exerciseId, supersetId:null}, planFieldsSnapshot(previewPlanForExercise(exerciseId)));

  openSheet({
    title: ex.name,
    onClosed: opts.onClosed,
    build:(body, sheet)=>{
      const wrap = el(`<div class="exercise-plan-editor"></div>`);
      wrap.appendChild(el(`<div class="section-title" style="margin-top:0;">Details</div>`));
      wrap.appendChild(el(`<div data-meta>${exerciseMetaFieldsHtml(ex)}</div>`));
      const metaState = bindExerciseMetaFields(q('[data-meta]', wrap), ex);

      wrap.appendChild(el(`<div class="section-title">Sets and time</div>`));
      if(onSplit){
        wrap.appendChild(el(`<p class="faint small" style="margin-top:0;">On this preset. Saving updates each day below${activeWorkoutLog()?' and today’s workout if it uses that day':''}.</p>`));
        occurrences.forEach((occ, i)=>{
          const day = splitDays()[occ.dayKey] || {};
          const block = el(`
            <div class="card flat" data-day-block="${escapeHtml(occ.dayKey)}" style="padding:12px;margin-bottom:12px;">
              <div style="font-weight:800;margin-bottom:8px;">${DAY_LABELS[occ.dayKey]} · ${escapeHtml(day.name||'Workout')}</div>
              ${planEditorFieldsHtml(occ.draft, ex, {prefix:`d${i}`})}
            </div>`);
          bindPlanEditorEquipment(block, {prefix:`d${i}`});
          wrap.appendChild(block);
        });
      } else {
        wrap.appendChild(el(`<p class="faint small" style="margin-top:0;">Not on this week’s split. Saving keeps these numbers for the next time you add it.${isTreadmill(ex)?' Walk as long as you like — there is no planned time.':''}</p>`));
        const block = el(`
          <div class="card flat" data-default-block style="padding:12px;margin-bottom:12px;">
            ${planEditorFieldsHtml(defaultDraft, ex, {prefix:'def'})}
          </div>`);
        bindPlanEditorEquipment(block, {prefix:'def'});
        wrap.appendChild(block);
      }
      wrap.appendChild(el(`<button class="btn" data-save style="width:100%;margin-top:4px;">Save</button>`));
      wrap.appendChild(el(`<button class="btn secondary" data-today style="width:100%;margin-top:8px;">＋ Add to today</button>`));
      if(!onSplit) wrap.appendChild(el(`<button class="btn secondary" data-add-day style="width:100%;margin-top:8px;">Add to a day</button>`));
      if(ex.userAdded) wrap.appendChild(el(`<button class="btn danger" data-delete style="width:100%;margin-top:10px;">Delete this exercise</button>`));
      body.appendChild(wrap);

      const readAll = ()=>{
        if(onSplit){
          return occurrences.map((occ, i)=>{
            const block = q(`[data-day-block="${occ.dayKey}"]`, wrap);
            return {dayKey:occ.dayKey, fields:readPlanEditorFields(block, ex, {prefix:`d${i}`})};
          });
        }
        const block = q('[data-default-block]', wrap);
        return readPlanEditorFields(block, ex, {prefix:'def'});
      };
      const saveMeta = ()=> {
        const meta = readExerciseMetaFields(q('[data-meta]', wrap), ex, metaState.selected);
        if(!meta) return false;
        Object.assign(ex, meta);
        return true;
      };
      const finishSave = (msg)=>{
        sheet.close();
        showToast(msg);
        if(opts.onSaved) opts.onSaved();
        else renderApp();
      };

      q('[data-save]', wrap).onclick = ()=>{
        if(!saveMeta()) return;
        if(onSplit){
          const updates = readAll();
          const touched = new Set();
          updates.forEach(({dayKey, fields})=>{
            const day = splitDays()[dayKey];
            if(!day || !Array.isArray(day.exercises)) return;
            day.exercises.forEach(row=>{
              if(row.exerciseId!==exerciseId) return;
              applyPlanFieldsToRow(row, fields);
              touched.add(dayKey);
            });
          });
          let refreshed = false;
          touched.forEach(dk=>{
            if(syncActiveWorkoutFromSplit({dayKey:dk, fromSave:true})) refreshed = true;
          });
          if(touched.size) touchActivePreset();
          if(typeof spotterForget==='function') spotterForget(exerciseId);
          saveData(DATA);
          finishSave(refreshed ? 'Saved. Today’s workout updated.' : 'Saved');
          return;
        }
        const fields = readAll();
        ex.defaultPlan = normalizeDefaultPlan(fields);
        const live = activeWorkoutLog() || todayLog();
        if(live && Array.isArray(live.plan)){
          live.plan.forEach(row=>{
            if(row && row.exerciseId===exerciseId) applyPlanFieldsToRow(row, fields);
          });
        }
        if(typeof spotterForget==='function') spotterForget(exerciseId);
        saveData(DATA);
        finishSave('Saved');
      };

      q('[data-today]', wrap).onclick = ()=>{
        if(!saveMeta()) return;
        if(!onSplit) ex.defaultPlan = normalizeDefaultPlan(readAll());
        saveData(DATA);
        const jumpingIn = todayLog().active;
        sheet.close();
        if(jumpingIn) closeSheets();
        queueExerciseForToday(exerciseId);
      };

      const addDay = q('[data-add-day]', wrap);
      if(addDay) addDay.onclick = ()=>{
        if(!saveMeta()) return;
        const fields = readAll();
        openSheet({
          root:SHEET_ROOT.picker, zIndex:150, title:'Add to a day',
          build:(pickBody, pickSheet)=>{
            pickBody.appendChild(el(`<p class="faint small" style="margin-bottom:12px;">Copies these sets and time onto that day of this preset.</p>`));
            DAY_ORDER.forEach(dk=>{
              const day = splitDays()[dk];
              const already = (day.exercises||[]).some(r=>r.exerciseId===exerciseId);
              const item = el(`
                <div class="pick-item${already?' muted':''}">
                  <div>
                    <div class="nm">${DAY_LABELS[dk]}</div>
                    <div class="sub">${escapeHtml(day.name||'Workout')} · ${already?'Already on this day':((day.exercises||[]).length?`${day.exercises.length} exercises`:'rest')}</div>
                  </div>
                  <span class="btn ghost">${already?'Open':'Add'}</span>
                </div>`);
              item.onclick = ()=>{
                if(already){
                  pickSheet.close();
                  sheet.close();
                  openDayEditor(dk, exerciseId);
                  return;
                }
                const row = Object.assign({exerciseId, supersetId:null}, planFieldsFromDefault(fields));
                applyPlanFieldsToRow(row, fields);
                day.exercises = day.exercises || [];
                day.exercises.push(row);
                ex.defaultPlan = normalizeDefaultPlan(fields);
                touchActivePreset();
                syncActiveWorkoutFromSplit({dayKey:dk, fromSave:true});
                if(typeof spotterForget==='function') spotterForget(exerciseId);
                saveData(DATA);
                pickSheet.close();
                sheet.close();
                showToast(`Added to ${DAY_LABELS[dk]}`);
                renderApp();
              };
              pickBody.appendChild(item);
            });
          }
        });
      };
      const del = q('[data-delete]', wrap);
      if(del) del.onclick = ()=> deleteExerciseFromLibrary(ex);
    }
  });
}

function warmupRowSummary(row){
  const bits = [];
  if(row.detail) bits.push(row.detail);
  if(row.minutes) bits.push(`~${row.minutes} min`);
  return bits.join(' · ') || 'Tap to edit';
}

function warmupRowEditor(row, idx, draft, ctx){
  const isOpen = ctx.isOpen(idx);
  if(!row.howTo) row.howTo = resolveWarmupHowTo(row);
  const node = el(`
    <div class="plan-row wu-howto-scope ${isOpen?'open':''}">
      <div class="plan-head" data-toggle role="button" tabindex="0" aria-expanded="${isOpen}">
        <span class="plan-idx">${idx+1}</span>
        <div class="plan-copy">
          <div class="nm">${escapeHtml(row.title||'Warm-up')}</div>
          <div class="plan-summary" data-summary>${escapeHtml(warmupRowSummary(row))}</div>
        </div>
        <span class="plan-chev" aria-hidden="true">${icon('chevronDown',18)}</span>
        ${row.howTo ? warmupHowToButtonHtml() : ''}
      </div>
      ${warmupHowToBodyHtml(row.howTo)}
      <div class="plan-body">
        <div class="plan-metrics wu">
          <div class="wu-name"><label>Name</label><input data-field="title" value="${escapeHtml(row.title||'')}" placeholder="e.g. Glute bridges"></div>
          <div><label>Dose</label><input data-field="detail" value="${escapeHtml(row.detail||'')}" placeholder="2×15"></div>
          <div><label>Min</label><input type="number" min="1" max="15" inputmode="numeric" data-field="minutes" value="${row.minutes||2}"></div>
        </div>
        <div class="field" style="margin:0 0 10px;"><label>How to</label>
          <textarea data-field="howTo" rows="3" placeholder="Short description of how to do this warm-up">${escapeHtml(row.howTo||'')}</textarea>
        </div>
        <div class="plan-tools">
          <button class="iconbtn" data-up ${idx===0?'disabled':''} title="Move up" aria-label="Move up">${icon('chevronUp',16)}</button>
          <button class="iconbtn" data-down ${idx===draft.warmups.length-1?'disabled':''} title="Move down" aria-label="Move down">${icon('chevronDown',16)}</button>
          <button class="iconbtn" data-duplicate title="Duplicate" aria-label="Duplicate">${icon('copy',16)}</button>
          <button class="iconbtn danger" data-remove title="Remove" aria-label="Remove">${icon('trash',16)} <span>Remove</span></button>
        </div>
      </div>
    </div>`);
  const head = q('[data-toggle]',node);
  head.onclick = (e)=>{
    if(e.target.closest('[data-howto-toggle]')) return;
    ctx.toggleOpen(idx);
  };
  head.onkeydown = (e)=>{
    if(e.target!==head || (e.key!=='Enter' && e.key!==' ')) return;
    e.preventDefault(); ctx.toggleOpen(idx);
  };
  const titleEl = q('.nm',node);
  const summaryEl = q('[data-summary]',node);
  const refreshHead = ()=>{
    titleEl.textContent = row.title || 'Warm-up';
    summaryEl.textContent = warmupRowSummary(row);
  };
  qa('input[data-field], textarea[data-field]',node).forEach(input=> input.oninput = ()=>{
    const field = input.dataset.field;
    if(field==='title' || field==='detail' || field==='howTo'){ row[field] = input.value; ctx.markDirty(); refreshHead(); return; }
    if(field==='minutes'){
      const n = parseInt(input.value,10);
      row.minutes = Number.isFinite(n) ? Math.min(15, Math.max(1, n)) : 2;
      ctx.markDirty();
      refreshHead();
    }
  });
  const swap = (a,b)=>{
    const tmp = draft.warmups[a]; draft.warmups[a] = draft.warmups[b]; draft.warmups[b] = tmp;
    ctx.redraw();
  };
  q('[data-up]',node).onclick = ()=> idx>0 && swap(idx, idx-1);
  q('[data-down]',node).onclick = ()=> idx<draft.warmups.length-1 && swap(idx, idx+1);
  q('[data-duplicate]',node).onclick = ()=>{
    draft.warmups.splice(idx+1, 0, newWarmupRow({ title:row.title, detail:row.detail, minutes:row.minutes, howTo:row.howTo }));
    ctx.redraw();
  };
  q('[data-remove]',node).onclick = ()=>{
    draft.warmups.splice(idx,1);
    ctx.redraw();
  };
  bindWarmupHowTo(node);
  return node;
}

function replacePlanExercise(row, id){
  const prev = row.exerciseId;
  row.exerciseId = id;
  row.equipment = null;
  if(typeof spotterForget==='function'){
    if(prev) spotterForget(prev);
    spotterForget(id);
  }
}
/* "3 × 8–12 · RPE 8 · 1:30 rest" — the collapsed row's one-line summary. */
function planRowSummary(row, metric, ex){
  const bits = isTreadmill(ex)
    ? [`${row.sets} set${row.sets===1?'':'s'}`, 'by feel']
    : [`${row.sets} × ${isMinuteHold(ex)
      ? formatHoldRange(row.repsMin, row.repsMax)
      : formatRepRange(row.repsMin, row.repsMax) + (metric==='time'?'s':'')}`];
  if(row.rpe!=null) bits.push(`RPE ${row.rpe}`);
  const rest = restSecondsFor(row);
  const m = Math.floor(rest/60), s = rest%60;
  bits.push(rest===0 ? 'no rest' : rest<60 ? `${rest}s rest` : s ? `${m}:${String(s).padStart(2,'0')} rest` : `${m} min rest`);
  if(hasLoadField(metric) && row.loadStep > 0) bits.push(`${row.loadStep} kg jumps`);
  if(row.equipment && EQUIPMENT_LABELS[row.equipment]) bits.push(EQUIPMENT_LABELS[row.equipment]);
  if(row.oftenDoneAsDropSet && canDropWeight(ex)) bits.push('drop set');
  return bits.join(' · ');
}

/* One editable row inside the day editor. opts.inGroup adds a "remove from
   superset" icon; the checkbox is used to pick rows for grouping.
   Sets and time are edited in Settings → Edit exercises. */
function planRowEditor(row, idx, draft, ctx, opts){
  opts = opts || {};
  const redraw = ctx.redraw;
  const ex = getExercise(row.exerciseId);
  const metric = metricOf(ex);
  const isSelected = ctx.selected.has(idx);
  const isOpen = ctx.isOpen(idx);
  const node = el(`
    <div class="plan-row ${isSelected?'selected':''} ${isOpen?'open':''}">
      <div class="plan-head">
        <div class="plan-toggle" data-toggle role="button" tabindex="0" aria-expanded="${isOpen}">
          <label class="plan-check">
            <input type="checkbox" class="row-select" data-select ${isSelected?'checked':''} title="Select for superset" aria-label="Select for superset">
          </label>
          <span class="plan-idx">${idx+1}</span>
          <div class="plan-copy">
            <div class="nm">${escapeHtml(ex ? ex.name : 'Unknown exercise')}</div>
            <div class="plan-summary" data-summary>${escapeHtml(planRowSummary(row, metric, ex))}</div>
          </div>
        </div>
        <div class="plan-acts">
          <button type="button" class="plan-gear" data-edit-plan title="Edit" aria-label="Edit">${icon('settings',16)}</button>
          <button type="button" class="plan-chev" data-chev aria-label="${isOpen?'Hide details':'Show details'}" aria-expanded="${isOpen}">${icon('chevronDown',16)}</button>
        </div>
      </div>
      <div class="plan-body">
      ${ex ? `<div class="plan-sub">${escapeHtml(exerciseSubtitle(ex))}</div>` : ''}
      <div class="plan-links">
        <button class="btn secondary" data-alternatives>${icon('lightbulb',16)} Alternatives</button>
        <button class="btn secondary" data-swap>${icon('reopen',16)} Replace</button>
      </div>
      <div class="plan-tools">
        ${opts.inGroup?'<button class="iconbtn" data-ungroup-one title="Remove from superset" aria-label="Remove from superset">'+icon('link',16)+'</button>':''}
        <button class="iconbtn" data-up ${idx===0?'disabled':''} title="Move up" aria-label="Move up">${icon('chevronUp',16)}</button>
        <button class="iconbtn" data-down ${idx===draft.exercises.length-1?'disabled':''} title="Move down" aria-label="Move down">${icon('chevronDown',16)}</button>
        <button class="iconbtn" data-duplicate title="Duplicate" aria-label="Duplicate">${icon('copy',16)}</button>
        <button class="iconbtn danger" data-remove title="Remove" aria-label="Remove">${icon('trash',16)} <span>Remove</span></button>
      </div>
      </div>
    </div>`);

  const toggle = ()=> ctx.toggleOpen(idx);
  const head = q('[data-toggle]',node);
  head.onclick = (e)=>{ if(!e.target.closest('.plan-check')) toggle(); };
  head.onkeydown = (e)=>{
    if(e.target!==head || (e.key!=='Enter' && e.key!==' ')) return;
    e.preventDefault(); toggle();
  };
  q('[data-chev]',node).onclick = (e)=>{ e.stopPropagation(); toggle(); };
  q('[data-select]',node).onchange = ()=> ctx.toggleSelect(idx);
  const ungroupOneBtn = q('[data-ungroup-one]',node);
  if(ungroupOneBtn) ungroupOneBtn.onclick = ()=> ctx.removeFromGroup(idx);
  q('[data-edit-plan]',node).onclick = (e)=>{
    e.stopPropagation();
    if(typeof ctx.editRow==='function') ctx.editRow(row);
  };

  const swapRows = (a,b)=>{
    const tmp = draft.exercises[a]; draft.exercises[a] = draft.exercises[b]; draft.exercises[b] = tmp;
    if(ctx.remapSelected) ctx.remapSelected(i=> i===a ? b : i===b ? a : i);
    redraw();
  };
  q('[data-up]',node).onclick = ()=> idx>0 && swapRows(idx, idx-1);
  q('[data-down]',node).onclick = ()=> idx<draft.exercises.length-1 && swapRows(idx, idx+1);
  q('[data-duplicate]',node).onclick = ()=>{
    const copy = clone(row);
    copy.supersetId = null; // duplicating doesn't grow the original superset
    draft.exercises.splice(idx+1, 0, copy);
    if(ctx.remapSelected) ctx.remapSelected(i=> i>idx ? i+1 : i);
    redraw();
  };
  q('[data-remove]',node).onclick = ()=>{
    const gid = row.supersetId;
    draft.exercises.splice(idx,1);
    if(gid){
      const remaining = draft.exercises.filter(r=>r.supersetId===gid);
      if(remaining.length<2) remaining.forEach(r=>r.supersetId=null);
    }
    if(ctx.remapSelected) ctx.remapSelected(i=> i===idx ? -1 : i>idx ? i-1 : i);
    redraw();
  };
  q('[data-alternatives]',node).onclick = ()=> openAlternativesSheet({rows:draft.exercises, index:idx, onChange:redraw});
  q('[data-swap]',node).onclick = ()=> openExercisePicker({
    title:'Replace exercise',
    exclude: draft.exercises.map(r=>r.exerciseId),
    onPick:(id)=>{ replacePlanExercise(row, id); redraw(); }
  });
  return node;
}

function openCopyDaySheet(sourceKey, draft, onDone){
  openSheet({
    root:SHEET_ROOT.picker, zIndex:150, title:`Copy ${DAY_LABELS[sourceKey]}`,
    build:(body, sheet)=>{
      body.appendChild(el(`<p class="faint small" style="margin-bottom:12px;">Copies what's on screen right now (name, exercises, warm-ups, sets, reps, RPE and notes) onto another day. That day is saved immediately.</p>`));
      DAY_ORDER.filter(dk=>dk!==sourceKey).forEach(dk=>{
        const target = splitDays()[dk];
        const item = el(`
          <div class="pick-item">
            <div>
              <div class="nm">${DAY_LABELS[dk]}</div>
              <div class="sub">Currently: ${escapeHtml(target.name)} · ${target.exercises.length ? target.exercises.length+' exercises' : 'rest'}</div>
            </div>
            <span class="btn ghost">Copy here</span>
          </div>`);
        const live = activeWorkoutLog();
        const msg = (live && live.dayKey===dk)
          ? `Replace ${DAY_LABELS[dk]}? Today’s workout will use this copy.`
          : `Replace ${DAY_LABELS[dk]} with a copy of this day?`;
        item.onclick = ()=> confirmAction(msg, 'Copy', ()=>{
          DATA.splits[DATA.activeSplit].days[dk] = clone(draft);
          touchActivePreset();
          syncActiveWorkoutFromSplit({dayKey:dk, fromSave:true});
          saveData(DATA);
          sheet.close();
          showToast(`Copied to ${DAY_LABELS[dk]}`);
          if(onDone) onDone();
        });
        body.appendChild(item);
      });
    }
  });
}

/* ------------------------------ Library ------------------------------ */
function addMissingBox(term, label, redraw){
  const box = el(`
    <div class="notfound">
      <p>${escapeHtml(label)}</p>
      <button class="btn secondary" data-add>＋ Add "${escapeHtml(term)}" to my library</button>
    </div>`);
  q('[data-add]',box).onclick = ()=> openExerciseFormSheet({
    prefillName:term,
    onSaved:(id)=>{
      editExerciseSearch = '';
      editExerciseFilter = 'off';
      openEditMuscleGroup = primaryOf(getExercise(id));
      renderApp();
      openExercisePlanSheet(id);
    }
  });
  return box;
}

/* ------------------------------ Warm-up library ------------------------------ */
function openWarmupLibrarySheet(){ openWarmupLibraryScreen(); }
function renderWarmupLibraryScreen(){
  const wrap = el(`<div class="edit-ex"></div>`);
  const lib = DATA.warmupLibrary || [];
  const onCount = lib.filter(warmupOnActiveSplit).length;
  const offCount = lib.length - onCount;
  const pin = el(`
    <div class="edit-ex-pin" data-pin-head>
      <div class="edit-ex-nav">
        <button type="button" class="edit-ex-back" data-back aria-label="Back to settings">${icon('chevronLeft',22)}<span>Settings</span></button>
        <h3>Warm-up library</h3>
        <button type="button" class="iconbtn edit-ex-add" data-add aria-label="Add a warm-up">${icon('plus',20)}</button>
      </div>
      ${searchFieldHtml('warmupLibrarySearch','Search warm-ups…', warmupLibrarySearch)}
      <div class="seg two edit-ex-seg" role="tablist" aria-label="Which warm-ups">
        <button type="button" role="tab" data-filter="on" aria-selected="${warmupLibraryFilter==='on'}" class="${warmupLibraryFilter==='on'?'on':''}">On split <span class="n">${onCount}</span></button>
        <button type="button" role="tab" data-filter="off" aria-selected="${warmupLibraryFilter==='off'}" class="${warmupLibraryFilter==='off'?'on':''}">Not on split <span class="n">${offCount}</span></button>
      </div>
    </div>`);
  q('[data-back]',pin).onclick = backToSettings;
  q('[data-add]',pin).onclick = ()=> openWarmupFormSheet({
    onSaved:(id)=>{
      warmupLibraryFilter = 'off';
      const saved = getWarmupLibraryItem(id);
      openWarmupMuscle = saved ? (saved.primary||'Other') : null;
      renderApp();
      openWarmupDetailSheet(id);
    }
  });
  qa('[data-filter]',pin).forEach(btn=> btn.onclick = ()=>{
    warmupLibraryFilter = btn.dataset.filter;
    window.scrollTo(0,0);
    renderApp();
  });
  wrap.appendChild(pin);
  const results = el(`<div class="edit-ex-results"></div>`);
  wrap.appendChild(results);
  const redraw = ()=> paintWarmupLibrary(results, redraw);
  const input = q('#warmupLibrarySearch', pin);
  input.oninput = ()=>{ warmupLibrarySearch = input.value; redraw(); };
  redraw();
  return wrap;
}
function warmupLibraryRow(item, showMuscle){
  const hits = warmupSplitHits(item);
  const trained = DAY_ORDER.filter(dk=>((splitDays()[dk]||{}).exercises||[]).length);
  const dayBits = !hits.length
    ? 'Not on this split'
    : (trained.length && trained.every(dk=>hits.includes(dk)) ? 'This week' : hits.map(dk=>DAY_LABELS[dk]).join(' · '));
  const sub = showMuscle ? warmupSubtitle(item) : [item.detail, item.minutes ? `~${item.minutes} min` : ''].filter(Boolean).join(' · ');
  const meta = sub ? `${dayBits} · ${sub}` : dayBits;
  const row = el(`
    <div class="edit-ex-row" role="button" tabindex="0">
      <div class="copy">
        <div class="nm">${escapeHtml(item.title)}</div>
        <div class="meta">${escapeHtml(meta)}</div>
      </div>
      <span class="edit-ex-go" aria-hidden="true">${icon('chevronRight',18)}</span>
    </div>`);
  const open = ()=> openWarmupDetailSheet(item.id);
  row.onclick = open;
  row.onkeydown = (e)=>{
    if(e.key!=='Enter' && e.key!==' ') return;
    e.preventDefault(); open();
  };
  return row;
}
function addMissingWarmupBox(term, label, redraw){
  const box = el(`
    <div class="notfound">
      <p>${escapeHtml(label)}</p>
      <button class="btn secondary" data-add>＋ Add "${escapeHtml(term)}" to warm-ups</button>
    </div>`);
  q('[data-add]',box).onclick = ()=> openWarmupFormSheet({
    prefillTitle:term,
    onSaved:(id)=>{
      warmupLibrarySearch = '';
      warmupLibraryFilter = 'off';
      const saved = getWarmupLibraryItem(id);
      openWarmupMuscle = saved ? (saved.primary||'Other') : null;
      renderApp();
    }
  });
  return box;
}
function paintWarmupLibrary(container, redraw){
  container.innerHTML = '';
  const term = warmupLibrarySearch.trim();
  const lib = DATA.warmupLibrary || [];
  const onSplit = [];
  const offSplit = [];
  lib.forEach(w=>{
    if(warmupOnActiveSplit(w)) onSplit.push(w);
    else offSplit.push(w);
  });
  const source = warmupLibraryFilter==='on' ? onSplit : offSplit;
  const list = term ? searchWarmups(term, source) : source.slice().sort((a,b)=> a.title.localeCompare(b.title));
  const empty = warmupLibraryFilter==='on'
    ? (term ? 'No match on this split.' : 'No warm-ups on the week yet.')
    : (term ? 'No match off the split.' : 'Every warm-up is already on the week.');

  if(!list.length){
    container.appendChild(el(`<p class="edit-ex-empty">${escapeHtml(empty)}</p>`));
    if(term) container.appendChild(addMissingWarmupBox(term, `Add “${term}”?`, redraw));
    return;
  }

  if(term){
    const card = el(`<div class="edit-ex-card"></div>`);
    list.forEach(w=> card.appendChild(warmupLibraryRow(w, true)));
    container.appendChild(card);
    container.appendChild(addMissingWarmupBox(term, 'Not the one you meant?', redraw));
    return;
  }

  appendLibraryMuscleGroups(container, list, {
    muscleOf: w=> w.primary||'Other',
    rowFor: w=> warmupLibraryRow(w),
    openKey: openWarmupMuscle,
    onToggle:(muscle)=>{ openWarmupMuscle = muscle; redraw(); }
  });
}
function openWarmupDetailSheet(warmupId, opts){
  opts = opts || {};
  const item = getWarmupLibraryItem(warmupId);
  if(!item) return;
  openSheet({
    root: opts.root, zIndex: opts.zIndex, onClosed: opts.onClosed,
    title: item.title,
    build:(body, sheet)=>{
      body.appendChild(el(`
        <div class="wu-howto-scope">
          <div class="wu-detail-top">
            <div style="min-width:0;">${tagsHtml([item.primary||'Other', item.detail||'', item.minutes?`~${item.minutes} min`:''].filter(Boolean))}</div>
            ${item.howTo ? warmupHowToButtonHtml() : ''}
          </div>
          ${warmupHowToBodyHtml(item.howTo)}
          <p class="faint small" style="margin:10px 0 14px;">Bodyweight warm-up. Add it to a day’s warm-up list from the Split day editor.</p>
          <div class="row" style="gap:8px;">
            <button class="btn secondary" data-edit style="flex:1;">${icon('pencil',18)} Edit</button>
            ${item.userAdded ? '<button class="btn danger" data-delete style="flex:1;">Delete</button>' : ''}
          </div>
        </div>`));
      bindWarmupHowTo(body);
      q('[data-edit]',body).onclick = ()=> openWarmupFormSheet({
        item,
        onSaved:()=>{ openWarmupDetailSheet(warmupId, opts); renderApp(); }
      });
      const del = q('[data-delete]',body);
      if(del) del.onclick = ()=>{
        confirmAction('Delete this warm-up from your library?', 'Delete', ()=>{
          DATA.warmupLibrary = (DATA.warmupLibrary||[]).filter(w=>w.id!==item.id);
          saveData(DATA);
          sheet.close();
          if(opts.onClosed) opts.onClosed();
          showToast('Warm-up deleted');
          renderApp();
        });
      };
    }
  });
}
function openWarmupFormSheet(opts){
  opts = opts || {};
  const item = opts.item || null;
  const isEdit = !!item;
  const primary0 = item ? (item.primary||'Other') : (opts.prefillMuscle || 'Other');
  openSheet({
    root:SHEET_ROOT.form, zIndex:200,
    title: isEdit ? 'Edit warm-up' : 'Add a warm-up',
    build:(body, sheet)=>{
      body.appendChild(el(`
        <div>
          <p class="faint small" style="margin-bottom:12px;">Keep it bodyweight — no bands or machines. It joins your Warm-up library for any day.</p>
          <div class="field"><label>Name</label><input id="wuName" placeholder="e.g. Glute bridges" value="${escapeHtml(item?item.title:(opts.prefillTitle||''))}"></div>
          <div class="grid2">
            <div class="field"><label>Dose</label><input id="wuDetail" placeholder="2×12" value="${escapeHtml(item?(item.detail||''):'')}"></div>
            <div class="field"><label>Minutes</label><input id="wuMinutes" type="number" min="1" max="15" inputmode="numeric" value="${item?item.minutes:2}"></div>
          </div>
          <div class="field">${choiceFieldHtml({id:'wuPrimary', label:'Main muscle', value:primary0, display:primary0})}</div>
          <div class="field"><label>How to</label>
            <textarea id="wuHowTo" rows="4" placeholder="Describe how to do this warm-up">${escapeHtml(item?(item.howTo||''):'')}</textarea>
          </div>
          <button class="btn" data-save style="width:100%;">${isEdit?'Save changes':'Add to library'}</button>
          ${isEdit && item.userAdded ? '<button class="btn danger" data-delete style="width:100%;margin-top:10px;">Delete this warm-up</button>' : ''}
        </div>`));
      bindChoiceField(q('#wuPrimary',body), {
        title:'Main muscle',
        options:()=> MUSCLES.map(m=>({value:m, label:m})),
        root:SHEET_ROOT.picker, zIndex:220
      });
      q('[data-save]',body).onclick = ()=>{
        const title = q('#wuName',body).value.trim();
        if(!title){ showToast('Give it a name'); return; }
        const detail = q('#wuDetail',body).value.trim();
        const howTo = q('#wuHowTo',body).value.trim();
        const minutes = Math.min(15, Math.max(1, parseInt(q('#wuMinutes',body).value,10)||2));
        const primary = choiceFieldValue(q('#wuPrimary',body)) || 'Other';
        const dup = (DATA.warmupLibrary||[]).some(w=>
          w.title.toLowerCase()===title.toLowerCase() && (!isEdit || w.id!==item.id));
        if(dup){ showToast('You already have that warm-up'); return; }
        let savedId;
        if(isEdit){
          Object.assign(item, {title, detail, minutes, primary, howTo});
          savedId = item.id;
          showToast('Warm-up updated');
        } else {
          const created = makeWarmupLibraryItem({title, detail, minutes, primary, howTo}, {id:uid(), userAdded:true});
          DATA.warmupLibrary.push(created);
          savedId = created.id;
          showToast('Added to Warm-up library');
        }
        saveData(DATA);
        sheet.close();
        if(opts.onSaved) opts.onSaved(savedId);
        renderApp();
      };
      const del = q('[data-delete]',body);
      if(del) del.onclick = ()=>{
        confirmAction('Delete this warm-up from your library?', 'Delete', ()=>{
          DATA.warmupLibrary = (DATA.warmupLibrary||[]).filter(w=>w.id!==item.id);
          saveData(DATA);
          closeSheets();
          showToast('Warm-up deleted');
          renderApp();
        });
      };
    }
  });
}
function openWarmupPicker(opts){
  opts = opts || {};
  const excluded = new Set(opts.excludeTitles || []);
  let muscle = null, term = '';

  function paintList(container, sheet){
    container.innerHTML = '';
    const lib = DATA.warmupLibrary || [];
    if(!muscle && !term.trim()){
      const counts = {};
      lib.forEach(w=>{ const m=w.primary||'Other'; counts[m]=(counts[m]||0)+1; });
      REGION_ORDER.forEach(region=>{
        const muscles = MUSCLES.filter(m=>MUSCLE_REGION[m]===region && counts[m]);
        if(!muscles.length) return;
        container.appendChild(el(`<div class="region-label">${region}</div>`));
        const grid = el(`<div class="pick-grid"></div>`);
        muscles.forEach(m=>{
          const tile = el(`<button class="pick-tile">${escapeHtml(m)}<span class="cnt">${counts[m]} warm-ups · ${escapeHtml(MUSCLE_HINT[m]||'')}</span></button>`);
          tile.onclick = ()=>{ muscle = m; draw(); };
          grid.appendChild(tile);
        });
        container.appendChild(grid);
      });
      const missing = el(`
        <div class="notfound" style="margin-top:14px;">
          <p>Want something custom?</p>
          <button class="btn secondary" data-new>＋ Add a warm-up to the library</button>
        </div>`);
      q('[data-new]',missing).onclick = ()=> openWarmupFormSheet({
        onSaved:(id)=>{
          const w = getWarmupLibraryItem(id);
          if(w){ sheet.close(); opts.onPick(w); }
        }
      });
      container.appendChild(missing);
      return;
    }
    const pool = (muscle ? lib.filter(w=>(w.primary||'Other')===muscle) : lib)
      .filter(w=> !excluded.has((w.title||'').toLowerCase()));
    const results = searchWarmups(term, pool);
    if(!results.length) container.appendChild(el(`<p class="empty">Nothing matches that${muscle?` in ${escapeHtml(muscle)}`:''}.</p>`));
    results.forEach(w=>{
      const row = el(`
        <div class="pick-item">
          <div style="min-width:0;">
            <div class="nm">${escapeHtml(w.title)}</div>
            <div class="sub">${escapeHtml(warmupSubtitle(w))}</div>
          </div>
          <span class="btn ghost" style="flex:0 0 auto;">Add +</span>
        </div>`);
      row.onclick = ()=>{ sheet.close(); opts.onPick(w); };
      container.appendChild(row);
    });
    const missing = el(`
      <div class="notfound">
        <p>Can't find what you're looking for?</p>
        <button class="btn secondary" data-new>＋ Add ${term.trim()?`"${escapeHtml(term.trim())}"`:'a warm-up'} to the library</button>
      </div>`);
    q('[data-new]',missing).onclick = ()=> openWarmupFormSheet({
      prefillTitle: term.trim(), prefillMuscle: muscle||'Other',
      onSaved:(id)=>{
        const w = getWarmupLibraryItem(id);
        if(w){ sheet.close(); opts.onPick(w); }
      }
    });
    container.appendChild(missing);
  }

  function draw(){
    openSheet({
      root:SHEET_ROOT.picker, zIndex:150,
      title: muscle || opts.title || 'Add warm-up',
      onBack: muscle ? ()=>{ muscle=null; term=''; draw(); } : null,
      build:(body, sheet)=>{
        body.appendChild(el(`
          <div>
            ${muscle ? '' : '<p class="faint small" style="margin-bottom:12px;">Pick a muscle, then choose a bodyweight warm-up.</p>'}
            ${searchFieldHtml('wuPickSearch', muscle?`Search in ${muscle}…`:'Search all warm-ups…', term)}
            <div data-list></div>
          </div>`));
        const list = q('[data-list]',body);
        paintList(list, sheet);
        const search = q('#wuPickSearch',body);
        search.oninput = ()=>{ term = search.value; paintList(list, sheet); };
      }
    });
  }
  draw();
}

function sessionBestValue(sets, metric){
  const higher = betterIsHigher(metric);
  const normal = sets.filter(s=>!s.isDropSet);
  if(!normal.length) return null;
  const best = normal.reduce((b,s)=>{
    const a = setPerformanceScore(s,metric), c = setPerformanceScore(b,metric);
    return (higher ? a>c : a<c) ? s : b;
  }, normal[0]);
  if(metric==='weight_reps' || metric==='weighted_bw') return roundTo(setPerformanceScore(best, metric));
  if(metric==='reps_only')   return best.reps;
  if(metric==='time')        return best.duration;
  return best.weight; // assisted
}
function sessionChipText(sets, metric, ex){
  const value = sessionBestValue(sets, metric);
  if(value==null) return '🔻 Drop set';
  if(metric==='weight_reps' || metric==='weighted_bw') return `e1RM ${value}${units()}`;
  if(metric==='reps_only')   return `${value} reps`;
  if(metric==='time')        return isMinuteHold(ex) ? formatHoldAmount(value) : `${value}s`;
  return `${value}${units()} assist`;
}

let exerciseDetailChart = null;
function openExerciseDetailSheet(exerciseId, opts){
  opts = opts || {};
  const ex = getExercise(exerciseId);
  if(!ex) return;
  const metric = metricOf(ex);
  const sessions = recentSessions(exerciseId, 6);
  const alternatives = alternativesFor(exerciseId, {limit:4});

  openSheet({
    root: opts.root, zIndex: opts.zIndex, onClosed: opts.onClosed,
    title: ex.name,
    build:(body, sheet)=>{
      body.appendChild(el(`
        <div>
          <div style="margin-bottom:12px;">${tagsHtml([
            primaryOf(ex), equipLabel(ex),
            ...(patternOf(ex)!=='other'?[PATTERN_LABELS[patternOf(ex)]]:[]),
            METRIC_LABELS[metric]
          ])}</div>
          ${secondaryOf(ex).length?`<p class="faint small">Also works: ${secondaryOf(ex).map(escapeHtml).join(', ')}</p>`:''}
          ${ex.equipmentNote?`<p class="faint small">📝 ${escapeHtml(ex.equipmentNote)}</p>`:''}
          <div class="row" style="margin-top:12px;">
            <button class="btn secondary" data-today style="flex:1;">＋ Add to today</button>
            <button class="btn secondary" data-edit style="flex:1;">${icon('pencil',18)} Edit details</button>
          </div>
          <div style="margin-top:16px;">${sessions.length?'<canvas data-chart height="160"></canvas>':'<p class="muted small">No sets logged yet for this exercise.</p>'}</div>
          <div class="section-title">Alternatives & variations</div>
          <div data-alts></div>
          <div class="section-title">Recent sessions</div>
          <div data-history></div>
        </div>`));

      q('[data-edit]',body).onclick = ()=> openExerciseFormSheet({exercise:ex, onSaved:()=>{ openExerciseDetailSheet(exerciseId, opts); renderApp(); }});
      q('[data-today]',body).onclick = ()=>{
        const jumpingIn = todayLog().active;
        sheet.close();
        if(jumpingIn) closeSheets();
        queueExerciseForToday(exerciseId);
      };

      const altBox = q('[data-alts]',body);
      if(!alternatives.length) altBox.appendChild(el(`<p class="faint small">No close matches in your library yet.</p>`));
      alternatives.forEach(alt=>{
        const item = el(`
          <div class="alt-item">
            <div class="row between">
              <div style="min-width:0;">
                <div style="font-weight:700;">${escapeHtml(alt.ex.name)}</div>
                <div class="why">${escapeHtml(alternativeReason(alt))}</div>
              </div>
              <button class="btn ghost" style="flex:0 0 auto;">View →</button>
            </div>
          </div>`);
        item.onclick = ()=> openExerciseDetailSheet(alt.ex.id, opts);
        altBox.appendChild(item);
      });

      const historyBox = q('[data-history]',body);
      if(!sessions.length) historyBox.appendChild(el(`<p class="faint small">—</p>`));
      sessions.forEach(session=>{
        historyBox.appendChild(el(`
          <div class="hist-day">
            <div class="row between">
              <div>
                <strong>${formatLogDate(session.date)}</strong> ${session.sets.some(s=>s.isPR)?prMarkHtml(14):''}
                <div class="faint small">${session.sets.map(s=>setValueText(s,metric)).join(', ')}</div>
              </div>
              <span class="chip">${sessionChipText(session.sets, metric, ex)}</span>
            </div>
          </div>`));
      });

      const canvas = q('[data-chart]',body);
      if(canvas && window.Chart){
        const ordered = [...sessions].reverse();
        const styles = getComputedStyle(document.documentElement);
        const minute = isMinuteHold(ex);
        const axisLabel = metric==='weight_reps' ? `Estimated 1RM (${units()})`
          : metric==='weighted_bw' ? `Estimated 1RM incl. bodyweight (${units()})`
          : metric==='reps_only' ? 'Best reps' : metric==='time' ? (minute ? 'Best hold (min)' : 'Best hold (s)') : `Assistance used (${units()})`;
        const chartValue = v=> (minute && metric==='time' && v!=null) ? roundTo(v/60, 2) : v;
        if(exerciseDetailChart) exerciseDetailChart.destroy();
        exerciseDetailChart = new Chart(canvas.getContext('2d'), {
          type:'line',
          data:{ labels: ordered.map(s=>s.date.slice(5)),
                 datasets:[{label:axisLabel, data: ordered.map(s=>chartValue(sessionBestValue(s.sets, metric))),
                   borderColor: styles.getPropertyValue('--primary').trim()||'#e1ff00', backgroundColor:'transparent', tension:.3, pointRadius:4}] },
          options:{ responsive:true,
            plugins:{legend:{labels:{color:styles.getPropertyValue('--text-dim').trim()}}},
            scales:{ x:{ticks:{color:styles.getPropertyValue('--text-faint').trim()},grid:{color:styles.getPropertyValue('--border').trim()}},
                     y:{ticks:{color:styles.getPropertyValue('--text-faint').trim()},grid:{color:styles.getPropertyValue('--border').trim()}} } }
        });
      }
    }
  });
}

/* ------------------------------ Stats (was Records) ------------------------------ */
let recordsMuscle = null;       // display label when a muscle is selected
let recordsMuscleList = null;   // muscles to union for PR list (slug groups)
let recordsMuscleSlug = null;   // map slug for .sel / toggle
function clearStatsMuscle(){
  recordsMuscle = null;
  recordsMuscleList = null;
  recordsMuscleSlug = null;
}
function syncStatsMapSel(){
  const mapCard = q('.stats-map-card');
  if(!mapCard) return;
  qa('.bm-m[data-slug]', mapCard).forEach(path=>{
    const on = !!(recordsMuscleSlug && path.getAttribute('data-slug')===recordsMuscleSlug);
    path.classList.toggle('sel', on);
    if(path.hasAttribute('aria-pressed')) path.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}
function bindStatsDetail(detail){
  if(!detail) return;
  const clearBtn = q('[data-clear-muscle]', detail);
  if(clearBtn) clearBtn.onclick = ()=>{ clearStatsMuscle(); refreshStatsDetail(); };
  const focusBtn = q('[data-focus]', detail);
  if(focusBtn){
    const focus = statsFocusNext();
    focusBtn.onclick = ()=>{
      if(focus.action && focus.action.exerciseId) openRecordsPrSheet(focus.action.exerciseId);
      else if(focus.action && focus.action.slug) openStatsMuscle(focus.action.slug);
      else if(focus.slug) openStatsMuscle(focus.slug);
    };
  }
  qa('[data-pr-ex]', detail).forEach(row=>{
    const id = row.getAttribute('data-pr-ex');
    row.onclick = ()=> openRecordsPrSheet(id);
    row.onkeydown = e=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); openRecordsPrSheet(id); } };
  });
}
function buildStatsDetailNode(){
  const detail = el(recordsMuscle
    ? statsMuscleDetailHtml(recordsMuscle, recordsMuscleList)
    : statsOverviewDetailHtml());
  bindStatsDetail(detail);
  return detail;
}
function refreshStatsDetail(){
  const old = q('.stats-screen .stats-detail');
  if(!old || !old.parentNode){ renderApp(); return; }
  syncStatsMapSel();
  const next = buildStatsDetailNode();
  swapDetailCard(old, next);
}
function openStatsMuscle(slugOrMuscle){
  const slug = SLUG_MUSCLES[slugOrMuscle] ? slugOrMuscle : slugForMuscle(slugOrMuscle);
  if(slug && recordsMuscleSlug === slug){
    clearStatsMuscle();
    refreshStatsDetail();
    return;
  }
  if(slug && SLUG_MUSCLES[slug]){
    recordsMuscleSlug = slug;
    recordsMuscleList = musclesForSlug(slug);
    recordsMuscle = labelForSlug(slug);
  } else {
    recordsMuscleSlug = null;
    recordsMuscle = slugOrMuscle;
    recordsMuscleList = [slugOrMuscle];
  }
  refreshStatsDetail();
}
function openStatsBadgeSheet(){
  ensureBadgesSeenSeeded();
  const totals = badgeTotals();
  const unlocks = unseenBadgeUnlocks();
  const celebrate = unlocks.length > 0;
  openSheet({
    title: 'Badge shelf',
    onClosed: ()=>{ if(celebrate && VIEW==='stats') renderApp(); },
    build:(body)=>{
      const root = el(`
        <div class="badge-shelf">
          <p class="badge-shelf-sum">${totals.earned} of ${totals.total} badges</p>
          <div data-ladders></div>
        </div>`);
      const laddersBox = q('[data-ladders]', root);
      BADGE_LADDERS.forEach((ladder, li)=>{
        const st = badgeLadderState(ladder);
        const row = el(`
          <div class="badge-ladder" data-ladder="${escapeHtml(ladder.id)}">
            <div class="badge-ladder-head">
              <span class="badge-ladder-title">${escapeHtml(ladder.title)}</span>
              <span class="badge-ladder-count faint small">${
                ladder.id==='tonnes'
                  ? (Math.round(st.count*10)/10)+' t'
                  : Math.floor(st.count)+' / '+(st.next ? st.next.need : ladder.steps[ladder.steps.length-1].need)
              }</span>
            </div>
            <div class="badge-medal-row" data-row></div>
            <p class="badge-ladder-detail faint small" data-detail hidden></p>
          </div>`);
        const medalRow = q('[data-row]', row);
        const detail = q('[data-detail]', row);
        ladder.steps.forEach((step, i)=>{
          const earned = i <= st.earnedIdx;
          const isNext = st.next && step===st.next;
          const state = earned ? 'earned' : (isNext ? 'next' : 'locked');
          const pct = earned ? 1 : (isNext ? st.pct : 0);
          const isNew = celebrate && earned && i > (DATA.settings.badgesSeen[ladder.id] ?? -1);
          const btn = el(`
            <button type="button" class="badge-medal-btn${isNew?' is-new':''}${isNext?' is-focus':''}" data-step="${i}" aria-label="${escapeHtml(step.name)}">
              ${badgeMedalHtml(step, ladder, {state, pct, stepIdx:i, size:52})}
            </button>`);
          if(earned){
            const medal = q('.badge-medal', btn);
            if(medal) medal.style.animationDelay = (li*40 + i*30)+'ms';
          }
          btn.onclick = ()=>{
            const line = earned
              ? `${step.name} · ${step.hint} · Earned`
              : isNext
                ? `${step.name} · ${badgeRemainingText(ladder, st)}`
                : `${step.name} · ${step.hint} · Locked`;
            detail.hidden = false;
            detail.dataset.full = line;
            detail.textContent = line;
            if(typeof typeInto==='function') typeInto(detail, line);
            qa('.badge-medal-btn', row).forEach(b=> b.classList.toggle('is-picked', b===btn));
          };
          medalRow.appendChild(btn);
        });
        laddersBox.appendChild(row);
        const scrollToFocus = ()=>{
          const earnedBtns = qa('.badge-medal-btn', row).filter((_,i)=> i <= st.earnedIdx);
          const target = q('.badge-medal-btn.is-new', row)
            || q('.badge-medal-btn.is-focus', row)
            || earnedBtns[earnedBtns.length-1]
            || q('.badge-medal-btn', row);
          if(target && medalRow){
            const left = target.offsetLeft - (medalRow.clientWidth/2) + (target.offsetWidth/2);
            medalRow.scrollLeft = Math.max(0, left);
          }
        };
        requestAnimationFrame(()=> requestAnimationFrame(scrollToFocus));
      });
      body.appendChild(root);
      if(celebrate){
        if(typeof showPrConfetti==='function') showPrConfetti();
        markBadgesSeen();
      }
    }
  });
}
function statsFocusBlockHtml(focus){
  if(!focus) return '';
  const bar = focus.progress
    ? `<div class="focus-bar" aria-hidden="true"><span style="width:${focus.progress.target>0 ? Math.min(100, Math.round((focus.progress.value/focus.progress.target)*100)) : 0}%"></span></div>`
    : '';
  const also = focus.also
    ? `<p class="faint small focus-also">Also: ${escapeHtml(focus.also.line)}</p>`
    : '';
  const btn = focus.action
    ? `<button type="button" class="btn secondary" data-focus style="width:100%;margin-top:10px;">${escapeHtml(focus.action.label)}</button>`
    : '';
  return `
    <div class="focus-card">
      <div class="rec-kicker">Focus next</div>
      <h3 class="stats-detail-title" data-type-title>${escapeHtml(focus.title)}</h3>
      <p class="stats-kpi-line">${escapeHtml(focus.line)}</p>
      ${bar}
      ${also}
      ${btn}
    </div>`;
}
function statsOverviewDetailHtml(){
  const prs = totalPrMomentCount();
  const volKg = lifetimeVolumeKg();
  const tonnes = volKg / 1000;
  const tonnesText = !(volKg>0) ? '0'
    : tonnes >= 10 ? String(Math.round(tonnes))
    : (Math.round(tonnes*10)/10).toFixed(1).replace(/\.0$/,'');
  const streak = currentStreakDays();
  const climb = strengthClimbCount();
  const focus = statsFocusNext();
  const deload = statsDeloadInfo();
  const hasHistory = prs>0 || volKg>0 || streak>0;
  if(!hasHistory){
    return `<div class="card flat stats-detail">
      <p class="empty" style="padding:24px 10px;">Log a set on Home — your PRs, streak, and volume land here. Tap a muscle anytime.</p>
    </div>`;
  }
  return `<div class="card flat stats-detail">
    <p class="section-title" style="margin-top:0;" data-type-title>Overview</p>
    ${statGridHtml([
      {value:String(prs), label:prs===1?'PR':'PRs'},
      {value:tonnesText, label:tonnesText==='1'?'Tonne':'Tonnes'},
      {value:String(streak), label:'Day streak'},
      {value:String(climb), label:climb===1?'Lift climbing':'Lifts climbing'}
    ], 'cols-2')}
    ${statsFocusBlockHtml(focus)}
    <p class="stats-kpi-line faint" style="margin-top:12px;">${escapeHtml(deload.line)}</p>
  </div>`;
}
function statsMuscleDetailHtml(muscle, muscleList){
  const list = muscleList && muscleList.length ? muscleList : [muscle];
  const trained = exercisesWithPrsForMuscles(list);
  const summary = trained.length
    ? `${trained.length} exercise${trained.length>1?'s':''} with PRs · tap one for its history`
    : 'No PRs yet for this muscle';
  let rows = '';
  if(!trained.length){
    rows = `<p class="empty" style="padding:20px 8px;">No records yet for ${escapeHtml(muscle)}. Train it and PRs show up here.</p>`;
  } else {
    rows = trained.map(ex=>{
      const moments = prMomentsForExercise(ex.id);
      const current = moments[moments.length-1];
      const meta = `${prDayLabel(current.date)} · ${moments.length} PR${moments.length>1?'s':''}`;
      return `<div class="ex-list-item rec-row" role="button" tabindex="0" data-pr-ex="${escapeHtml(ex.id)}">
        <div class="rec-row-main">
          <div class="rec-row-name">${escapeHtml(ex.name)}</div>
          <div class="meta">${escapeHtml(meta)}</div>
        </div>
        <span class="chip rec-chip">${escapeHtml(formatPrValue(current.set, metricOf(ex)))}</span>
        <span class="rec-go" aria-hidden="true">${icon('chevronRight',18)}</span>
      </div>`;
    }).join('');
  }
  return `<div class="card flat stats-detail">
    <div class="stats-detail-head">
      <div>
        <div class="rec-kicker">Muscle</div>
        <h3 class="stats-detail-title" data-type-title>${escapeHtml(muscle)}</h3>
        <div class="rec-sub">${escapeHtml(summary)}</div>
      </div>
      <button type="button" class="btn ghost" data-clear-muscle aria-label="Clear muscle">Clear</button>
    </div>
    <div class="rec-list stats-detail-list">${rows}</div>
  </div>`;
}
function renderStatsScreen(){
  const wrap = el(`<div class="stats-screen"></div>`);
  wrap.appendChild(el(`<h3 class="stats-title">Stats</h3>`));

  const featured = featuredBadge();
  const medalState = featured.earned && !featured.state.next ? 'earned'
    : featured.state.next ? 'next' : (featured.earned ? 'earned' : 'locked');
  const medalPct = featured.state.next ? featured.pct : (featured.earned ? 1 : 0);
  const badgeChip = el(`
    <button type="button" class="stats-badge-chip${featured.earned?' earned':''}${featured.isNew?' is-new':''}" data-badge>
      ${featured.isNew ? '<span class="stats-badge-new" aria-hidden="true">New</span>' : ''}
      <span class="stats-badge-medal">
        ${badgeMedalHtml(featured.step, featured.ladder, {
          state: medalState,
          pct: medalPct,
          stepIdx: Math.max(0, featured.state.earnedIdx),
          tier: featured.tier,
          size: 52
        })}
      </span>
      <span class="stats-badge-copy">
        <span class="stats-badge-chip-kicker">${escapeHtml(featured.kicker)}</span>
        <span class="stats-badge-chip-name">${escapeHtml(featured.name)}</span>
        <span class="stats-badge-progress" aria-hidden="true"><span style="width:${Math.round(medalPct*100)}%"></span></span>
        <span class="stats-badge-chip-meta">${escapeHtml(featured.progressLabel)}</span>
      </span>
    </button>`);
  badgeChip.onclick = ()=> openStatsBadgeSheet();
  wrap.appendChild(badgeChip);

  const todaySlugs = todayPlanSlugs();
  const mapCard = el(`<div class="card flat stats-map-card">
    <p class="stats-map-hint faint small">Tap a muscle · spark = today</p>
    ${bodyMapHtml(null, todaySlugs, recordsMuscleSlug)}
  </div>`);
  bindBodyMapClicks(mapCard, slug=> openStatsMuscle(slug));
  wrap.appendChild(mapCard);

  wrap.appendChild(buildStatsDetailNode());

  const volKg = lifetimeVolumeKg();
  const story = volumeStoryFact(volKg);
  wrap.appendChild(el(`<div class="card flat stats-fact">
    <p class="section-title" style="margin-top:0;">Fun Fact</p>
    <p class="stats-fact-line">${escapeHtml(story.line)}</p>
  </div>`));

  return wrap;
}
let prTreeOpen = {year:null, month:null, week:null};
function prDayLabel(dateStr){
  const d = parseDateKey(dateStr);
  return `${d.getDate()} ${d.toLocaleDateString(undefined,{month:'short'})}, ${d.toLocaleDateString(undefined,{weekday:'short'})}`;
}
function prSignedText(n, suffix){
  const v = roundTo(Math.abs(n));
  return `${n>0?'+':'−'}${v}${suffix}`;
}
function prDeltaText(prev, cur, metric, ex){
  if(!prev) return 'First PR';
  const a = prev.set, b = cur.set, parts = [];
  const reps = (n)=> prSignedText(n, Math.abs(n)===1 ? ' rep' : ' reps');
  if(hasLoadField(metric)){
    const dw = (b.weight||0)-(a.weight||0), dr = (b.reps||0)-(a.reps||0);
    if(dw) parts.push(prSignedText(dw, ` ${units()}${metric==='assisted'?' assist':metric==='weighted_bw'?' added':''}`));
    if(dr) parts.push(reps(dr));
  } else if(metric==='reps_only'){
    const dr = (b.reps||0)-(a.reps||0);
    if(dr) parts.push(reps(dr));
  } else {
    const dd = (b.duration||0)-(a.duration||0);
    if(dd) parts.push(isMinuteHold(ex) ? formatHoldDelta(dd) : prSignedText(dd, 's'));
  }
  return parts.length ? parts.join(' · ') : 'Matched';
}
function prChartPoint(moment, metric){
  const set = moment.set;
  if(metric==='weight_reps' || metric==='weighted_bw') return roundTo(setPerformanceScore(set, metric));
  if(metric==='reps_only') return set.reps;
  if(metric==='time') return set.duration;
  return set.weight;
}
function prOverallGain(moments, metric, ex){
  if(moments.length<2) return {value:'—', label:'Progress'};
  const first = prChartPoint(moments[0], metric), last = prChartPoint(moments[moments.length-1], metric);
  if(metric==='weight_reps' || metric==='weighted_bw') return {value:prSignedText(last-first, ` ${units()}`), label:'Est. 1RM gain'};
  if(metric==='reps_only')   return {value:prSignedText(last-first, ''), label:'Reps gained'};
  if(metric==='time') return {value: isMinuteHold(ex) ? formatHoldDelta(last-first) : prSignedText(last-first, 's'), label:'Hold gained'};
  return {value:prSignedText(last-first, ` ${units()}`), label:'Assist change'};
}
function renderPrLogTree(moments, metric, rerender, ex){
  const shared = {open:prTreeOpen, unit:'PR', rerender};
  const newest = moments[0];
  const days = (parent, rows)=> rows.forEach(moment=>{
    const idx = moments.indexOf(moment);
    parent.appendChild(el(`
      <div class="hist-day pr-row${moment===newest?' current':''}">
        <div class="pr-when">
          <strong>${escapeHtml(prDayLabel(moment.date))}</strong>
          <div class="faint small">${moment===newest?prMarkHtml(14)+' Current · ':''}${escapeHtml(prDeltaText(moments[idx+1], moment, metric, ex))}</div>
        </div>
        <span class="pr-val">${escapeHtml(formatPrValue(moment.set, metric))}</span>
      </div>`));
  });
  const weeks = (parent, rows)=> renderHistoryGroups(parent, rows, {...shared,
    level:'week', keyOf:m=>weekStartKey(m.date), title:g=>weekTitle(g.key), below:days
  });
  const months = titled=> (parent, rows)=> renderHistoryGroups(parent, rows, {...shared,
    level:'month', keyOf:m=>m.date.slice(0,7),
    title:g=> titled ? monthNameOnly(g.key) : monthTitle(g.key),
    below:weeks, clear:['week']
  });
  const box = el(`<div class="card flat hist-tree"></div>`);
  renderHistoryGroups(box, moments, {...shared,
    level:'year', keyOf:m=>m.date.slice(0,4), title:g=>g.key,
    below:months(true), skipBelow:months(false), clear:['month','week']
  });
  return box;
}
function openRecordsPrSheet(exerciseId){
  const ex = getExercise(exerciseId);
  if(!ex) return;
  const metric = metricOf(ex);
  const moments = prMomentsForExercise(exerciseId);
  const current = moments[moments.length-1];
  openSheet({
    title: ex.name,
    onClosed: renderApp,
    build:(body)=>{
      if(!current){
        body.appendChild(el(`<p class="empty">No PRs yet for this movement.</p>`));
        return;
      }
      const gain = prOverallGain(moments, metric, ex);
      const sinceDays = daysInclusive(current.date, todayKey()) - 1;
      const series = sessionSeriesForExercise(exerciseId);
      const minute = isMinuteHold(ex);
      const axisLabel = metric==='weight_reps' ? `Heaviest weight (${units()})`
        : metric==='weighted_bw' ? `Heaviest added weight (${units()})`
        : metric==='reps_only' ? 'Best reps' : metric==='time' ? (minute ? 'Longest hold (min)' : 'Longest hold (s)') : `Assistance (${units()}) · lower is better`;
      const oneRm = (metric==='weight_reps' || metric==='weighted_bw') ? ` · ≈ ${prChartPoint(current, metric)} ${units()} est. 1RM` : '';
      body.appendChild(el(`
        <div>
          <div class="hero-card pr-hero">
            <div class="hero-eyebrow">Current PR</div>
            <div class="records-pr">${escapeHtml(formatPrValue(current.set, metric))}</div>
            <p class="pr-hero-sub">${escapeHtml(prDayLabel(current.date))}${escapeHtml(oneRm)}</p>
            ${statGridHtml([
              {value:String(moments.length), label:moments.length===1?'PR set':'PRs set'},
              {value:escapeHtml(gain.value), label:gain.label},
              {value:String(sinceDays), label:sinceDays===1?'Day since PR':'Days since PR'}
            ])}
          </div>
          ${series.length>1 ? `
          <div class="card flat">
            <p class="section-title" style="margin-top:0;">Progress</p>
            <p class="small muted" style="margin-bottom:4px;">${escapeHtml(axisLabel)} · each day you logged it. A lighter day pulls the line down.</p>
            <div class="chart-box"><canvas data-chart></canvas></div>
          </div>` : ''}
          <div class="section-title">PR log</div>
          <div data-prs></div>
        </div>`));
      prTreeOpen = {year:current.date.slice(0,4), month:current.date.slice(0,7), week:weekStartKey(current.date)};
      const list = q('[data-prs]',body);
      const drawLog = ()=>{
        list.innerHTML = '';
        list.appendChild(renderPrLogTree(moments.slice().reverse(), metric, drawLog, ex));
      };
      drawLog();
      const canvas = q('[data-chart]',body);
      if(canvas){
        const plotted = [];
        series.forEach(m=>{
          let value;
          if(metric==='weight_reps' || metric==='weighted_bw' || metric==='assisted') value = m.set.weight;
          else if(metric==='reps_only') value = m.set.reps;
          else value = minute ? roundTo((m.set.duration||0)/60, 2) : (m.set.duration||0);
          if(typeof value==='number' && isFinite(value)){
            const d = parseDateKey(m.date);
            plotted.push({label:`${d.getDate()} ${d.toLocaleDateString(undefined,{month:'short'})}`, value});
          }
        });
        if(plotted.length>1){
          const nums = plotted.map(p=>p.value);
          const lo = Math.min.apply(null, nums), hi = Math.max.apply(null, nums);
          const pad = (hi-lo)*0.25 || Math.abs(hi)*0.1 || 1;
          try{
            paintHistoryChart(canvas, {
              type:'line',
              labels: plotted.map(p=>p.label),
              data: nums,
              yMin: Math.max(0, Math.floor(lo-pad)), yMax: Math.ceil(hi+pad),
              unit: metric==='time' ? (minute ? 'min' : 's') : metric==='reps_only' ? 'reps' : units()
            });
            bindHistoryChart(canvas);
          }catch(err){ console.error(APP_NAME+': PR chart failed', err); }
        }
      }
    }
  });
}

/* ------------------------------ History ------------------------------ */
/* In-memory only. Workout rows still come from DATA.logs on every render. */
let historyFilter = 'all';
let historyDay = null;          // YYYY-MM-DD when a gym square is selected
let historyMonth = null;        // YYYY-MM when a month name is selected
let historyDaySetsOpen = false; // day summary shows sets instead of KPIs
let afterHistoryRender = [];
let gymYearObserver = null;
let historyTreeOpen = {year:null, month:null, week:null};
let weightLogOpen = false;
let weightLogMonths = new Set();
function resetHistoryState(){
  historyFilter = 'all';
  historyDay = null;
  historyMonth = null;
  historyDaySetsOpen = false;
  historyTreeOpen = {year:null, month:null, week:null};
  weightLogOpen = false;
  weightLogMonths = new Set();
}
function resetTabState(tab){
  if(tab==='stats') clearStatsMuscle();
  if(tab==='history') resetHistoryState();
}
function thisMonthKey(){ return todayKey().slice(0,7); }
function shiftMonthKey(ym, delta){
  const [y,m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return dateKey(d).slice(0,7);
}
function ymDate(ym, day=1){
  const [y,m] = ym.split('-').map(Number);
  return new Date(y, m-1, day);
}
function monthTitle(ym){
  return ymDate(ym).toLocaleDateString(undefined, {month:'long', year:'numeric'});
}
function daysInMonth(ym){
  const [y,m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
function loggedWorkouts(){
  return (DATA.logs||[]).filter(l=>l.sets && l.sets.length).sort((a,b)=> b.date.localeCompare(a.date));
}
function historyRangeKey(filter){
  if(filter==='this') return thisMonthKey();
  if(filter==='last') return shiftMonthKey(thisMonthKey(), -1);
  if(filter==='all') return null;
  return filter;
}
function workoutInHistoryFilter(log, filter){
  const range = historyRangeKey(filter);
  return !range || log.date.slice(0,7)===range;
}
function normalizeHistoryFilter(filter){
  if(filter==='all' || filter==='this' || filter==='last') return filter;
  if(!/^\d{4}-\d{2}$/.test(filter||'')) return 'all';
  if(filter===thisMonthKey()) return 'this';
  if(filter===shiftMonthKey(thisMonthKey(), -1)) return 'last';
  return filter;
}
function groupLogsBy(logs, keyFn){
  const groups = [], map = {};
  logs.forEach(log=>{
    const key = keyFn(log);
    if(!map[key]){ map[key] = {key, logs:[]}; groups.push(map[key]); }
    map[key].logs.push(log);
  });
  return groups;
}
function weekStartKey(dateStr){
  const d = parseDateKey(dateStr);
  d.setDate(d.getDate() - ((d.getDay()+6)%7));
  return dateKey(d);
}
function weekTitle(startKey){
  const start = parseDateKey(startKey);
  const end = new Date(start);
  end.setDate(start.getDate()+6);
  const mon = start.toLocaleDateString(undefined,{month:'short'});
  if(start.getMonth()===end.getMonth()) return 'Week of '+start.getDate()+'–'+end.getDate()+' '+mon;
  return 'Week of '+start.toLocaleDateString(undefined,{month:'short', day:'numeric'})+'–'+end.toLocaleDateString(undefined,{month:'short', day:'numeric'});
}
function monthNameOnly(ym){
  return ymDate(ym).toLocaleDateString(undefined, {month:'long'});
}
function historyFold(level, title, count, open, onToggle, unit){
  unit = unit || 'workout';
  const head = el(`
    <div class="hist-fold ${level}">
      <span class="nm">${escapeHtml(title)}</span>
      <span class="meta">${count} ${unit}${count===1?'':'s'} ${open?'▲':'▼'}</span>
    </div>`);
  head.onclick = onToggle;
  return head;
}
function shiftDateKey(key, days){
  const d = parseDateKey(key);
  d.setDate(d.getDate()+days);
  return dateKey(d);
}
function historyWindow(filter, logs){
  const range = historyRangeKey(filter);
  const today = todayKey();
  if(range){
    const start = range+'-01';
    const end = range===thisMonthKey() ? today : range+'-'+String(daysInMonth(range)).padStart(2,'0');
    return {start, end: end<start ? start : end};
  }
  if(!logs.length) return {start:today, end:today};
  const dates = logs.map(l=>l.date).sort();
  return {start:dates[0], end:dates[dates.length-1]<today ? dates[dates.length-1] : today};
}
/* All time and this month keep the live streak. A past month is that month's longest run. */
function historyStreak(filter){
  const range = historyRangeKey(filter);
  if(!range || range===thisMonthKey()) return currentStreakDays();
  return gymMonthStats(range, gymTrainedDates()).streak;
}
function historyInsights(logs, filter){
  const window = historyWindow(filter, logs);
  const days = daysInclusive(window.start, window.end);
  const weeks = Math.max(days/7, 1);
  const sets = logs.flatMap(l=>l.sets||[]);
  const weeklyTarget = TRAINING.weeklyEffectiveSetTarget;
  const muscles = muscleWorkForSets(sets).filter(r=>r.effectiveSets>=0.2).slice(0,8);
  const under = muscles.filter(r=> (r.effectiveSets/weeks) < weeklyTarget*0.5).slice(0,2).map(r=>r.muscle);
  const peak = muscles.length ? Math.max(...muscles.map(r=>r.effectiveSets), 1) : 1;
  return {
    streak: historyStreak(filter),
    prs: sets.filter(s=>s.isPR).length,
    muscles,
    musclePeak: peak,
    underNote: under.length
      ? under.join(' and ')+(under.length===1?' is':' are')+' well under the weekly target.'
      : ''
  };
}
/* From the earliest logged month through the month after this December,
   so a picked month from another year is on the strip. Last month, this
   month, and next month are always included. Each day sits in its own month.
   A week still starts on Monday, so the block steps in where the month
   starts and out where it ends. */
function gymYearBounds(){
  const year = todayKey().slice(0,4);
  let first = shiftMonthKey(year+'-01', -1);
  let last = shiftMonthKey(year+'-12', 1);
  const logs = loggedWorkouts();
  if(logs.length){
    const earliest = logs[logs.length-1].date.slice(0,7);
    if(earliest<first) first = earliest;
  }
  const range = historyRangeKey(historyFilter);
  if(range){
    if(range<first) first = range;
    if(range>last) last = range;
  }
  return {first, last};
}
function gymYearMonths(){
  const {first, last} = gymYearBounds();
  const start = weekStartKey(first+'-01');
  const endMonday = weekStartKey(last+'-'+String(daysInMonth(last)).padStart(2,'0'));
  const months = [];
  let month = null;
  for(let monday=start; monday<=endMonday; monday=shiftDateKey(monday, 7)){
    const days = [0,1,2,3,4,5,6].map(d=> shiftDateKey(monday, d));
    const slices = new Map();
    days.forEach((key, i)=>{
      const ym = key.slice(0,7);
      if(ym<first || ym>last) return;
      if(!slices.has(ym)) slices.set(ym, [null,null,null,null,null,null,null]);
      slices.get(ym)[i] = key;
    });
    [...slices.keys()].sort().forEach(ym=>{
      if(!month || month.ym!==ym){
        month = {ym, cols:[]};
        months.push(month);
      }
      month.cols.push(slices.get(ym));
    });
  }
  return months;
}
function gymTrainedDates(){
  const trained = new Set();
  loggedWorkouts().forEach(log=> trained.add(log.date));
  return trained;
}
/* Green squares in one calendar month, and the longest run of those days in a row.
   A rest day or a missed day breaks the run. It does not cross into another month. */
function gymMonthStats(ym, trained){
  const days = daysInMonth(ym);
  let count = 0, run = 0, streak = 0;
  for(let day=1; day<=days; day++){
    const key = ym+'-'+String(day).padStart(2,'0');
    if(trained.has(key)){
      count++;
      run++;
      if(run>streak) streak = run;
    } else run = 0;
  }
  return {count, days, streak};
}
function gymDayPhrase(n, signed){
  const abs = Math.abs(n);
  const word = abs===1 ? 'day' : 'days';
  if(!signed) return abs+' '+word;
  if(n>0) return '+'+abs+' '+word;
  if(n<0) return '−'+abs+' '+word;
  return '0 days';
}
function gymRateText(count, days){
  const rate = days ? Math.round((count/days)*1000)/10 : 0;
  return rate.toLocaleString(undefined, {minimumFractionDigits:1, maximumFractionDigits:1})+'%';
}
function gymMonthKpis(ym){
  const trained = gymTrainedDates();
  const now = gymMonthStats(ym, trained);
  const prev = shiftMonthKey(ym, -1);
  const before = gymMonthStats(prev, trained);
  const delta = now.count - before.count;
  return {
    count: now.count,
    days: now.days,
    rate: gymRateText(now.count, now.days),
    prevName: monthNameOnly(prev),
    deltaText: gymDayPhrase(delta, true),
    streak: now.streak
  };
}
function gymYearCell(key, trained, minutes, today){
  if(!key) return el(`<div class="gym-year-slot"></div>`);
  const went = trained.has(key);
  const rest = !went && !isTrainingDate(key);
  const future = key > today;
  const cls = ['gym-year-cell'];
  if(went) cls.push('on');
  else if(rest) cls.push('rest');
  if(key===today) cls.push('today');
  if(historyDay===key) cls.push('sel');
  let title = formatLogDate(key);
  if(went && minutes[key]) title += ' · '+formatDuration(minutes[key]*60000);
  else if(rest) title += ' · Rest';
  else if(!went && !future) title += ' · No workout';
  if(future){
    return el(`<div class="${cls.join(' ')}" data-date="${key}" title="${escapeHtml(title)}"></div>`);
  }
  const cell = el(`<button type="button" class="${cls.join(' ')}" data-date="${key}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}" aria-pressed="${historyDay===key?'true':'false'}"></button>`);
  cell.onclick = ()=> selectHistoryDay(key);
  return cell;
}
function syncHistoryDaySel(){
  qa('.gym-year-cell[data-date]').forEach(cell=>{
    const on = cell.getAttribute('data-date')===historyDay;
    cell.classList.toggle('sel', on);
    if(cell.hasAttribute('aria-pressed')) cell.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}
const HISTORY_GUILT_MISSED = [
  'Nothing happened. The dumbbells waited all day.',
  '0 sets. Your muscles filed a missing person report.',
  'The squat rack asked about you.',
  'An empty gym day. The plates are disappointed.',
  'You ghosted your muscles. They noticed.',
  'Zero work. Tomorrow gets a second chance.',
  'The bench sat unused. Dramatic sighs all around.',
  'No sets logged. Even the mirror looked away.'
];
function historyGuiltHash(date){
  let h = 0;
  for(let i=0;i<(date||'').length;i++) h = (h*31 + date.charCodeAt(i)) >>> 0;
  return h;
}
function historyGuiltLine(date){
  const today = todayKey();
  if(date===today) return 'Still time. The gym is open.';
  if(!isTrainingDate(date)) return 'Rest day. You earned it… probably.';
  return HISTORY_GUILT_MISSED[historyGuiltHash(date) % HISTORY_GUILT_MISSED.length];
}
function historyDayLog(date){
  return (DATA.logs||[]).find(l=>l.date===date && l.sets && l.sets.length) || null;
}
function bindHistorySummaryCard(card, logs, filter){
  if(!card) return;
  const clearDay = q('[data-clear-day]', card);
  if(clearDay) clearDay.onclick = ()=>{
    historyDay = null;
    syncHistoryDaySel();
    refreshHistorySummary();
  };
  const clearMonth = q('[data-clear-month]', card);
  if(clearMonth) clearMonth.onclick = ()=>{
    historyMonth = null;
    syncHistoryMonthSel();
    refreshHistorySummary();
  };
  const seeSets = q('[data-see-sets]', card);
  if(seeSets){
    seeSets.onclick = ()=>{
      historyDaySetsOpen = !historyDaySetsOpen;
      refreshHistorySummary();
    };
  }
  const scoreInfo = q('[data-score-info]', card);
  if(scoreInfo) scoreInfo.onclick = (e)=>{ e.stopPropagation(); openScoreInfoSheet(); };
  const gainInfo = q('[data-gain-info]', card);
  if(gainInfo) gainInfo.onclick = (e)=>{ e.stopPropagation(); openWeightGainSheet(logs, filter); };
}
function historyWhenLabel(date){
  const ago = daysInclusive(date, todayKey()) - 1;
  if(ago===0) return 'Today';
  if(ago===1) return 'Yesterday';
  return parseDateKey(date).toLocaleDateString(undefined,{weekday:'long'});
}
function historyDayName(date, log){
  const d = parseDateKey(date);
  if(log && log.planName) return log.planName;
  return (splitDays()[(log && log.dayKey) || weekdayKey(d)]||{}).name || '';
}
function historyDateTileHtml(date, isLatest){
  const d = parseDateKey(date);
  const cls = ['date-tile'];
  if(isLatest) cls.push('latest');
  if(historyDay===date) cls.push('sel');
  return `<div class="${cls.join(' ')}"><span class="dd">${d.getDate()}</span><span class="mm">${escapeHtml(d.toLocaleDateString(undefined,{month:'short'}))}</span></div>`;
}
function historyLatestDate(){
  const logs = loggedWorkouts().filter(l=>workoutInHistoryFilter(l, historyFilter));
  return logs.length ? logs[0].date : '';
}
function historyDayMeta(date, log){
  const when = historyWhenLabel(date);
  if(!log) return when;
  const sets = log.sets||[];
  const dur = sessionDurationMs(log);
  return `${when} · ${workingSetCount(sets)}\u00a0sets · ≈\u00a0${roundTo(totalEffectiveSets(sets))}\u00a0effective${dur>0?` · ${formatDuration(dur)}`:''}`;
}
function historyDaySetsBody(log){
  const byExercise = {};
  (log.sets||[]).forEach(set=>{ (byExercise[set.exerciseId] ||= []).push(set); });
  const groups = Object.entries(byExercise);
  const cols = groups.length < 2 ? 1 : 2;
  const rows = Math.ceil(groups.length / cols) || 1;
  const wrap = el(`<div class="history-day-sets"></div>`);
  wrap.style.gridTemplateColumns = cols===1 ? '1fr' : '1fr 1fr';
  wrap.style.gridTemplateRows = `repeat(${rows}, auto)`;
  groups.forEach(([exerciseId, sets])=>{
    const ex = getExercise(exerciseId);
    const group = el(`
      <div class="history-ex-group">
        <div class="history-ex-name">${escapeHtml(ex?ex.name:'Unknown exercise')}</div>
        <div class="history-set-grid" data-sets></div>
      </div>`);
    setRowsInto(q('[data-sets]', group), sets, metricOf(ex), {});
    wrap.appendChild(group);
  });
  return wrap;
}
function historyDaySummaryCard(date){
  const log = historyDayLog(date);
  const sets = log ? (log.sets||[]) : [];
  const dayName = historyDayName(date, log) || (log ? 'Workout' : 'No workout');
  const showSets = !!(log && historyDaySetsOpen);
  const actions = `<div class="history-day-actions">
      ${log ? `<button type="button" class="btn ghost" data-see-sets>${showSets ? 'Summary' : 'See sets'}</button>` : ''}
      <button type="button" class="btn ghost history-day-clear" data-clear-day aria-label="Clear day">${icon('x',16)}</button>
    </div>`;
  const trophy = log && sets.some(s=>s.isPR) ? prMarkHtml(20) : '';
  const head = `
    <div class="history-day-head">
      <div class="history-day-top">
        ${historyDateTileHtml(date, historyLatestDate()===date)}
        <div class="history-day-name-row">
          <div class="history-day-name">${escapeHtml(dayName)}</div>
          ${trophy}
        </div>
        ${actions}
      </div>
      <div class="history-day-meta faint small">${escapeHtml(historyDayMeta(date, log))}</div>
    </div>`;
  const card = el(`<div class="history-summary" data-history-summary>${head}<div class="history-day-body" data-day-body></div></div>`);
  const body = q('[data-day-body]', card);
  if(showSets){
    body.appendChild(historyDaySetsBody(log));
    return card;
  }
  if(log){
    const workSets = workingSetCount(sets);
    const dur = sessionDurationMs(log);
    const prs = sets.filter(s=>s.isPR).length;
    const muscles = muscleWorkForSets(sets).filter(r=>r.effectiveSets>=0.2).slice(0,8);
    const peak = Math.max(...muscles.map(r=>r.effectiveSets), 1);
    body.appendChild(el(`
      <div>
        ${statGridHtml([
          {value:String(workSets), label:workSets===1?'Set':'Sets'},
          {value:String(roundTo(totalEffectiveSets(sets))), label:'Effective'},
          {value:escapeHtml(dur>0 ? formatDuration(dur) : '—'), label:'Time'},
          {value:String(prs), label:prs===1?'Record':'Records'}
        ], 'cols-2')}
        <div class="history-muscles">
          <p class="small muted">Muscle targeting</p>
          ${historyMuscleRowsHtml(muscles, peak)}
        </div>
      </div>`));
    return card;
  }
  const guilt = historyGuiltLine(date);
  body.appendChild(el(`
    <div>
      ${statGridHtml([
        {value:'0', label:'Sets'},
        {value:'0', label:'Effective'},
        {value:'—', label:'Time'},
        {value:'0', label:'Records'}
      ], 'cols-2')}
      <div class="history-muscles">
        <p class="small muted">Muscle targeting</p>
        <p class="faint small" data-empty-pulse>No muscle work.</p>
        <p class="stats-kpi-line" data-type-title data-guilt>${escapeHtml(guilt)}</p>
      </div>
    </div>`));
  return card;
}
function selectHistoryDay(date){
  if(!date) return;
  historyDay = historyDay===date ? null : date;
  if(historyDay) historyMonth = null;
  syncHistoryDaySel();
  syncHistoryMonthSel();
  refreshHistorySummary();
  revealHistorySummary();
}
function openHistoryDaySets(date){
  if(!date) return;
  historyDay = date;
  historyMonth = null;
  historyDaySetsOpen = true;
  goToTab('history');
  revealHistorySummary();
}
function syncHistoryMonthSel(){
  qa('.gym-year-label[data-ym]').forEach(btn=>{
    const on = btn.getAttribute('data-ym')===historyMonth;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}
function selectHistoryMonth(ym){
  if(!ym) return;
  historyMonth = historyMonth===ym ? null : ym;
  if(historyMonth){
    historyDay = null;
    historyDaySetsOpen = false;
  }
  syncHistoryDaySel();
  syncHistoryMonthSel();
  refreshHistorySummary();
  revealHistorySummary();
}
function revealHistorySummary(){
  const node = q('[data-summary-host]');
  if(!node) return;
  const head = q('.app-head');
  const bar = document.getElementById('tabbar');
  const topLimit = (head ? head.getBoundingClientRect().bottom : 0) + 8;
  const bottomLimit = window.innerHeight - (bar ? bar.offsetHeight : 0) - 8;
  const rect = node.getBoundingClientRect();
  if(rect.top >= topLimit && rect.top < bottomLimit) return;
  const delta = rect.top < topLimit ? rect.top - topLimit : rect.top - bottomLimit;
  window.scrollBy({top:delta, behavior:prefersReducedMotion() ? 'auto' : 'smooth'});
}
function refreshHistorySummary(){
  const old = q('[data-history-summary]');
  if(!old || !old.parentNode){ renderApp(); return; }
  const allLogs = loggedWorkouts();
  const logs = allLogs.filter(l=>workoutInHistoryFilter(l, historyFilter));
  const next = renderHistorySummaryCard(logs, historyFilter);
  swapDetailCard(old, next);
}
function gymYearActivity(){
  const minutes = {};
  const trained = new Set();
  loggedWorkouts().forEach(log=>{
    trained.add(log.date);
    const ms = sessionDurationMs(log);
    if(ms>0) minutes[log.date] = (minutes[log.date]||0) + Math.round(ms/60000);
  });
  const today = todayKey();
  const wrap = el(`<div class="gym-year"></div>`);
  const dow = el(`<div class="gym-year-dow" aria-hidden="true">${
    ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(name=>`<span>${name}</span>`).join('')
  }</div>`);
  const scroll = el(`<div class="gym-year-scroll"></div>`);
  const track = el(`<div class="gym-year-track"></div>`);
  gymYearMonths().forEach(month=>{
    const label = parseDateKey(month.ym+'-01').toLocaleDateString(undefined,{month:'short'});
    const block = el(`<div class="gym-year-month" data-ym="${month.ym}"></div>`);
    const name = el(`<button type="button" class="gym-year-label" data-ym="${month.ym}" aria-pressed="${historyMonth===month.ym?'true':'false'}" aria-label="${escapeHtml(monthTitle(month.ym)+' overview')}">${escapeHtml(label)}</button>`);
    name.onclick = ()=> selectHistoryMonth(month.ym);
    block.appendChild(name);
    const cols = el(`<div class="gym-year-cols"></div>`);
    month.cols.forEach((days, i)=>{
      const col = el(`<div class="gym-year-col${i===0?' snap':''}" data-ym="${month.ym}"></div>`);
      days.forEach(key=> col.appendChild(gymYearCell(key, trained, minutes, today)));
      cols.appendChild(col);
    });
    block.appendChild(cols);
    track.appendChild(block);
  });
  scroll.appendChild(track);
  wrap.appendChild(dow);
  wrap.appendChild(scroll);
  return wrap;
}
/* Size the squares so last month, this month, and next month fill the card,
   then scroll that window into view. The gap between months is one square wide.
   A wider card caps the squares and centers them. */
function layoutGymYear(root, keepScroll){
  if(!root || root._gymLock) return;
  const scroll = q('.gym-year-scroll', root);
  const cols = qa('.gym-year-col', root);
  const blocks = qa('.gym-year-month', root);
  if(!scroll || !cols.length) return;
  root._gymLock = true;
  try{
    const gap = 3;
    const current = todayKey().slice(0,7);
    const prev = shiftMonthKey(current, -1);
    const next = shiftMonthKey(current, 1);
    const windowYms = new Set([prev, current, next]);
    let anchor = prev;
    const range = historyRangeKey(historyFilter);
    if(range && range!==current) anchor = range;
    if(keepScroll){
      const edge = scroll.getBoundingClientRect().left + 1;
      const hit = cols.find(col=> col.getBoundingClientRect().right > edge);
      if(hit) anchor = hit.dataset.ym;
    }
    const windowBlocks = blocks.filter(block=> windowYms.has(block.dataset.ym));
    const useBlocks = windowBlocks.length ? windowBlocks : blocks;
    let n = 0;
    let innerGaps = 0;
    useBlocks.forEach(block=>{
      const count = qa('.gym-year-col', block).length;
      n += count;
      if(count>1) innerGaps += count-1;
    });
    if(!n) n = cols.length;
    const breaks = Math.max(0, useBlocks.length-1);
    const dow = q('.gym-year-dow', root);
    const rootGap = parseFloat(getComputedStyle(root).columnGap) || 0;
    const viewport = root.clientWidth - (dow ? dow.offsetWidth : 0) - rootGap;
    if(viewport>=20){
      const raw = (viewport - gap*innerGaps) / (n + breaks);
      const cell = Math.max(10, Math.min(22, Math.floor(raw*100)/100));
      const monthGap = cell;
      const capped = raw>22;
      const flex = capped ? '0 0 auto' : '1 1 auto';
      const width = capped ? (n*cell + gap*innerGaps + monthGap*breaks)+'px' : 'auto';
      const same = root.style.getPropertyValue('--gym-cell')===cell+'px'
        && scroll.style.flex===flex && scroll.style.width===width;
      if(!same){
        root.style.setProperty('--gym-cell', cell+'px');
        root.style.setProperty('--gym-gap', gap+'px');
        root.style.setProperty('--gym-month-gap', monthGap+'px');
        scroll.style.flex = flex;
        scroll.style.width = width;
      }
      if(!same || !keepScroll){
        const target = cols.find(col=> col.dataset.ym===anchor) || cols[0];
        const left = target.getBoundingClientRect().left - scroll.getBoundingClientRect().left + scroll.scrollLeft;
        scroll.scrollLeft = Math.max(0, left);
      }
    }
  }finally{
    root._gymLock = false;
  }
  if(!gymYearObserver){
    gymYearObserver = new ResizeObserver(entries=>{
      entries.forEach(entry=>{
        const node = entry.target;
        if(!node.isConnected || node._gymLock) return;
        layoutGymYear(node, true);
      });
    });
  }
  if(gymYearObserver._root!==root){
    gymYearObserver.disconnect();
    gymYearObserver.observe(root);
    gymYearObserver._root = root;
  }
}
function historyGymSummaryCard(logs, filter){
  const card = el(`
    <div class="card history-gym-card">
      <p class="section-title" style="margin-top:0;">Days in the gym</p>
      <div data-gym></div>
      <div data-summary-host></div>
    </div>`);
  q('[data-gym]', card).appendChild(gymYearActivity());
  q('[data-summary-host]', card).appendChild(renderHistorySummaryCard(logs, filter));
  afterHistoryRender.push(()=> layoutGymYear(q('.gym-year', card)));
  return card;
}
function historyMuscleRowsHtml(muscles, target){
  if(!muscles.length) return '<p class="faint small" style="margin-top:8px;">No muscle work in this range.</p>';
  return muscles.map(r=>{
    const pct = target>0 ? Math.min(100, Math.round(r.effectiveSets/target*100)) : 0;
    return `<div class="mw-row">
      <span class="nm">${escapeHtml(r.muscle)}</span>
      <span class="mw-bar"><span style="width:${pct}%"></span></span>
      <span class="mw-val">${roundTo(r.effectiveSets)} sets</span>
    </div>`;
  }).join('');
}
function historyRangeKpis(logs, filter){
  return {score:historyAttendanceScore(filter), vs:historyWeightGain(logs, filter)};
}
/* Dates with at least one working set, oldest first. Warm-ups alone do not count. */
function workedDateList(){
  const dates = new Set();
  loggedWorkouts().forEach(log=>{
    if(workingSetCount(log.sets)>0) dates.add(log.date);
  });
  return [...dates].sort();
}
/* A split day with exercises is a day the month expects you. Rest days are not absences. */
function isTrainingDate(date){
  const day = splitDays()[weekdayKey(parseDateKey(date))];
  return !!(day && day.exercises && day.exercises.length);
}
/* Attendance for one month, out of 100. Days before the first working set are ignored.
   Today is not a miss until you have trained or the day has passed.
   Extra gym days raise the score, and it stops at 100. */
function monthAttendance(ym, worked){
  const dates = worked || workedDateList();
  const first = dates[0];
  if(!first) return null;
  const today = todayKey();
  const start = ym+'-01';
  const last = ym+'-'+String(daysInMonth(ym)).padStart(2,'0');
  const end = ym===thisMonthKey() ? today : last;
  if(end<first) return null;
  const went = new Set(dates.filter(d=>d>=start && d<=end));
  let scheduled = 0, attended = 0;
  for(let date=start; date<=end; date=shiftDateKey(date, 1)){
    if(date<first) continue;
    const did = went.has(date);
    const closed = ym!==thisMonthKey() || date<today;
    if(!closed && !did) continue;
    if(isTrainingDate(date)) scheduled++;
    if(did) attended++;
  }
  if(!scheduled) return attended ? 100 : null;
  return Math.round(Math.min(100, (attended/scheduled)*100));
}
/* This month and last month are that month. All time is the average of those monthly scores. */
function historyAttendanceScore(filter){
  const worked = workedDateList();
  if(!worked.length) return null;
  const range = historyRangeKey(filter);
  if(range) return monthAttendance(range, worked);
  let ym = worked[0].slice(0,7);
  const scores = [];
  let guard = 0;
  while(ym<=thisMonthKey() && guard<240){
    const score = monthAttendance(ym, worked);
    if(score!=null) scores.push(score);
    ym = shiftMonthKey(ym, 1);
    guard++;
  }
  if(!scores.length) return null;
  return Math.round(scores.reduce((sum,s)=>sum+s,0)/scores.length);
}
/* Heaviest bar weight on a working set. Drop sets use the heaviest stage. */
function setBarWeight(set){
  if(!set || set.isWarmup) return null;
  if(set.isDropSet){
    const weights = (set.stages||[]).map(s=>s.weight).filter(w=>typeof w==='number' && !isNaN(w));
    return weights.length ? Math.max.apply(null, weights) : null;
  }
  return typeof set.weight==='number' && !isNaN(set.weight) ? set.weight : null;
}
function barLoadExercise(ex){
  if(!ex) return false;
  const metric = metricOf(ex);
  return metric==='weight_reps' || metric==='weighted_bw';
}
function historyWeightSamples(){
  const out = [];
  loggedWorkouts().forEach(log=>{
    (log.sets||[]).forEach(set=>{
      const ex = getExercise(set.exerciseId);
      if(!barLoadExercise(ex)) return;
      const weight = setBarWeight(set);
      if(weight==null) return;
      out.push({exerciseId:set.exerciseId, date:log.date, ts:set.ts||0, weight});
    });
  });
  return out;
}
/* Per-lift bar weight in the range. All time is the first logged weight against the
   best since. Any other range is the best weight before it against the best inside it.
   A first time in the range is listed, and it does not change the total. */
function historyWeightRows(logs, filter){
  const samples = historyWeightSamples();
  const ids = new Set();
  logs.forEach(log=>{
    (log.sets||[]).forEach(set=>{
      if(!barLoadExercise(getExercise(set.exerciseId))) return;
      if(setBarWeight(set)==null) return;
      ids.add(set.exerciseId);
    });
  });
  const span = historyWindow(filter, logs);
  const allTime = !historyRangeKey(filter);
  const rows = [];
  ids.forEach(id=>{
    const mine = samples.filter(s=>s.exerciseId===id);
    const inRange = mine.filter(s=>s.date>=span.start && s.date<=span.end);
    if(!inRange.length) return;
    const ex = getExercise(id);
    const now = Math.max.apply(null, inRange.map(s=>s.weight));
    let before = null;
    if(allTime){
      const first = mine.slice().sort((a,b)=> a.date===b.date ? a.ts-b.ts : a.date.localeCompare(b.date))[0];
      before = first.weight;
    } else {
      const prior = mine.filter(s=>s.date<span.start);
      if(prior.length) before = Math.max.apply(null, prior.map(s=>s.weight));
    }
    rows.push({
      name: ex ? ex.name : 'Exercise',
      before,
      now,
      delta: before==null ? null : roundTo(now-before, 2)
    });
  });
  rows.sort((a,b)=> (b.delta==null?-Infinity:b.delta) - (a.delta==null?-Infinity:a.delta) || a.name.localeCompare(b.name));
  return {rows, allTime};
}
function historyWeightGain(logs, filter){
  const rows = historyWeightRows(logs, filter).rows;
  if(!rows.length) return {text:'—', tone:''};
  const counted = rows.filter(r=>r.delta!=null);
  if(!counted.length) return formatSignedKg(0);
  return formatSignedKg(roundTo(counted.reduce((sum,r)=>sum+r.delta,0), 2));
}
function formatSignedKg(n){
  const abs = Math.abs(n);
  const text = Number.isInteger(abs) ? abs.toLocaleString() : abs.toLocaleString(undefined, {maximumFractionDigits:2});
  if(n>0) return {text:`+${text} ${units()}`, tone:'up'};
  if(n<0) return {text:`−${text} ${units()}`, tone:'down'};
  return {text:`0 ${units()}`, tone:''};
}
function formatPlainKg(n){
  const v = roundTo(n, 2);
  const text = Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, {maximumFractionDigits:2});
  return `${text} ${units()}`;
}
function openWeightGainSheet(logs, filter){
  const detail = historyWeightRows(logs, filter);
  const beforeLabel = detail.allTime ? 'First time' : 'Before';
  const intro = detail.allTime
    ? 'The first weight you logged for each lift, and the heaviest you have done since.'
    : 'The heaviest weight before this range, and the heaviest inside it. A first time in this range does not change the total.';
  openSheet({
    title:'Vs previous',
    build:(body)=>{
      if(!detail.rows.length){
        body.appendChild(el(`<p class="empty">No weighted lifts in this range.</p>`));
        return;
      }
      body.appendChild(el(`
        <div class="pr-gain">
          <p>${escapeHtml(intro)}</p>
          ${detail.rows.map(r=>{
            const delta = r.delta==null ? null : formatSignedKg(r.delta);
            const from = r.before==null
              ? '<span class="k">First time</span>'
              : `<span class="k">${beforeLabel}</span> ${escapeHtml(formatPlainKg(r.before))}`;
            return `<div class="pr-gain-row">
              <div class="nm">${escapeHtml(r.name)}</div>
              <div class="delta">${delta ? escapeHtml(delta.text) : '—'}</div>
              <div class="pair">${from} <span class="to">→</span> <span class="k">Now</span> ${escapeHtml(formatPlainKg(r.now))}</div>
            </div>`;
          }).join('')}
        </div>`));
    }
  });
}
function openScoreInfoSheet(){
  openSheet({
    title:'How the score works',
    build:(body)=>{
      body.appendChild(el(`
        <div class="score-info">
          <p>The score is your attendance for the month, out of 100. It is not a grade for a single workout.</p>
          <h3>How it moves</h3>
          <ul>
            <li>Each training day on your split that has already passed is a day the month expected you.</li>
            <li>Rest days are not absences. Skipping one does not lower the score.</li>
            <li>Miss a training day and the score eases down, the way attendance does.</li>
            <li>Go again, even on a rest day, and the score climbs. It can always come back.</li>
            <li>It stops at 100. More sessions keep it there. They do not ask you to pile on extra days.</li>
          </ul>
          <h3>What you are looking at</h3>
          <ul>
            <li><b>This month</b> counts up to today. Today is not a miss until the day is over.</li>
            <li><b>All time</b> is the average of those monthly scores, starting from your first workout.</li>
            <li>Days before that first workout are left out.</li>
          </ul>
        </div>`));
    }
  });
}
function historyChartPalette(){
  const styles = getComputedStyle(document.documentElement);
  return {
    primary: styles.getPropertyValue('--primary').trim() || '#e1ff00',
    faint: styles.getPropertyValue('--text-faint').trim() || '#8F8A80',
    dim: styles.getPropertyValue('--text-dim').trim() || '#cac4b8',
    border: styles.getPropertyValue('--border').trim() || 'rgba(202,196,184,.28)'
  };
}
function fillRoundRect(ctx, x, y, w, h, r){
  if(w<=0 || h<=0) return;
  const radius = Math.min(r, w/2, h/2);
  ctx.beginPath();
  if(ctx.roundRect) ctx.roundRect(x, y, w, Math.max(h, 0), [radius, radius, 0, 0]);
  else ctx.rect(x, y, w, h);
  ctx.fill();
}
/* Drawn on the canvas in this page. History does not wait on the CDN chart script. */
function paintHistoryChart(canvas, spec){
  const box = canvas.parentElement;
  const cssW = Math.max(260, box.clientWidth || 320);
  const cssH = box.clientHeight || 168;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = cssW+'px';
  canvas.style.height = cssH+'px';
  const ctx = canvas.getContext('2d');
  if(!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  const theme = historyChartPalette();
  const series = document.documentElement.getAttribute('data-theme')==='light'
    ? (getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#000000')
    : theme.primary;
  const labels = spec.labels || [];
  const data = spec.data || [];
  const n = data.length;
  if(!n) return;
  const padL = spec.decimals ? 44 : 34, padR = 8, padT = 16, padB = 26;
  const plotW = cssW - padL - padR;
  const plotH = cssH - padT - padB;
  const yMin = spec.yMin!=null ? spec.yMin : 0;
  const yMax = spec.yMax!=null ? spec.yMax : Math.max(yMin+1, ...data);
  const spanY = (yMax-yMin) || 1;
  const yOf = (v)=> padT + plotH - ((v-yMin)/spanY)*plotH;
  const tickText = (v)=> spec.decimals ? formatBodyWeightKg(roundTo(v,1)) : String(Math.round(v));
  const font = `11px ${getComputedStyle(document.body).fontFamily || 'sans-serif'}`;
  ctx.font = font;
  ctx.lineWidth = 1;
  ctx.strokeStyle = theme.border;
  ctx.fillStyle = theme.faint;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for(let t=0; t<=3; t++){
    const v = yMin + spanY * (t/3);
    const y = yOf(v);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(cssW-padR, y);
    ctx.stroke();
    if(t>0 || spec.decimals) ctx.fillText(tickText(v), padL-4, y);
  }
  const slot = plotW / n;
  const xCenter = (i)=> spec.type==='bar' ? padL + slot*i + slot/2 : (n===1 ? padL + plotW/2 : padL + (i/(n-1))*plotW);
  if(spec.type==='bar'){
    const bw = Math.min(22, slot*0.62);
    ctx.fillStyle = series;
    data.forEach((v,i)=>{
      const h = yOf(yMin) - yOf(v);
      fillRoundRect(ctx, xCenter(i)-bw/2, yOf(v), bw, h, 3);
    });
  } else {
    ctx.beginPath();
    ctx.strokeStyle = series;
    ctx.lineWidth = 2;
    data.forEach((v,i)=>{
      const x = xCenter(i), y = yOf(v);
      if(i===0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = series;
    data.forEach((v,i)=>{
      ctx.beginPath();
      ctx.arc(xCenter(i), yOf(v), 3.5, 0, Math.PI*2);
      ctx.fill();
    });
  }
  ctx.fillStyle = theme.faint;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const step = Math.max(1, Math.ceil(n/6));
  labels.forEach((label,i)=>{
    if(i%step && i!==n-1) return;
    if(spec.type!=='bar' && i!==n-1 && xCenter(n-1)-xCenter(i) < 56) return;
    ctx.textAlign = spec.type==='bar' || n===1 ? 'center' : i===0 ? 'left' : i===n-1 ? 'right' : 'center';
    ctx.fillText(String(label), xCenter(i), padT+plotH+6);
  });
  canvas._hits = data.map((v,i)=>({x:xCenter(i), label:labels[i], value:v}));
  canvas._unit = spec.unit || '';
}
function bindHistoryChart(canvas){
  if(canvas._bound) return;
  canvas._bound = true;
  const tip = el(`<div class="chart-tip" hidden></div>`);
  canvas.parentElement.appendChild(tip);
  const pointAt = (event)=>{
    const hits = canvas._hits || [];
    if(!hits.length){ tip.hidden = true; return; }
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    let best = hits[0], bestD = Infinity;
    hits.forEach(hit=>{
      const d = Math.abs(hit.x - x);
      if(d<bestD){ bestD = d; best = hit; }
    });
    tip.hidden = false;
    tip.textContent = `${best.label}: ${best.value}${canvas._unit ? ' '+canvas._unit : ''}`;
    const left = Math.min(Math.max(best.x, 36), rect.width-36);
    tip.style.left = left+'px';
  };
  canvas.onpointerdown = pointAt;
  canvas.onpointermove = pointAt;
  canvas.onpointerleave = ()=>{ tip.hidden = true; };
}
/* Sets logged in one calendar month, and who is behind the weekly target.
   This month only counts days that have already arrived, so the first week
   is not marked behind. A future month has not started. */
function historyMonthWork(ym, logs){
  const monthLogs = (logs||[]).filter(l=> l.date && l.date.slice(0,7)===ym);
  const sets = monthLogs.flatMap(l=> l.sets||[]);
  const muscles = muscleWorkForSets(sets).filter(r=> r.effectiveSets>=0.2).slice(0,8);
  const peak = muscles.length ? Math.max(...muscles.map(r=> r.effectiveSets), 1) : 1;
  const today = todayKey();
  const start = ym+'-01';
  const last = ym+'-'+String(daysInMonth(ym)).padStart(2,'0');
  const end = ym>thisMonthKey() ? '' : ym===thisMonthKey() ? today : last;
  let underNote = '';
  if(end && end>=start && muscles.length){
    const weeks = daysInclusive(start, end)/7;
    if(weeks>=1){
      const weeklyTarget = TRAINING.weeklyEffectiveSetTarget;
      const under = muscles.filter(r=> (r.effectiveSets/weeks) < weeklyTarget*0.5).slice(0,2).map(r=> r.muscle);
      if(under.length) underNote = under.join(' and ')+(under.length===1?' is':' are')+' well under the weekly target.';
    }
  }
  const rows = muscles.length
    ? historyMuscleRowsHtml(muscles, peak)
    : '<p class="faint small" data-empty-pulse>No muscle work.</p>';
  return {rows, underNote};
}
function historyMonthSummaryCard(ym, logs){
  const kpi = gymMonthKpis(ym);
  const work = historyMonthWork(ym, logs);
  return el(`
    <div class="history-summary" data-history-summary>
      <div class="history-day-head">
        <div class="history-day-top">
          <div class="recent-main">
            <div class="nm">${escapeHtml(monthTitle(ym))}</div>
          </div>
          <div class="history-day-actions">
            <button type="button" class="btn ghost history-day-clear" data-clear-month aria-label="Clear month">${icon('x',16)}</button>
          </div>
        </div>
      </div>
      <div class="history-day-body">
        ${statGridHtml([
          {value:`${kpi.count}<span class="stat-of">/${kpi.days}</span>`, label:'Workout days'},
          {value:escapeHtml(kpi.rate), label:'Consistency'},
          {value:escapeHtml(kpi.deltaText), label:'vs '+kpi.prevName},
          {value:String(kpi.streak), label:'Longest streak'}
        ], 'cols-2')}
        <div class="history-muscles">
          <p class="small muted">Muscle targeting</p>
          ${work.rows}
          ${work.underNote?`<p class="faint small">${escapeHtml(work.underNote)}</p>`:''}
        </div>
      </div>
    </div>`);
}
function renderHistorySummaryCard(logs, filter){
  if(historyDay){
    const card = historyDaySummaryCard(historyDay);
    bindHistorySummaryCard(card, logs, filter);
    return card;
  }
  if(historyMonth){
    const card = historyMonthSummaryCard(historyMonth, logs);
    bindHistorySummaryCard(card, logs, filter);
    return card;
  }
  const insight = historyInsights(logs, filter);
  const range = historyRangeKpis(logs, filter);
  const card = el(`
    <div class="history-summary" data-history-summary>
      ${statGridHtml([
        {value:range.score==null ? '—' : `${range.score}<span class="stat-of">/100</span>`, label:'Score', infoHtml:`<button type="button" class="stat-info" data-score-info aria-label="How the score is measured">${icon('info',13)}</button>`},
        {value:escapeHtml(range.vs.text), label:'Vs previous', infoHtml:`<button type="button" class="stat-info" data-gain-info aria-label="Weight change by exercise">${icon('info',13)}</button>`},
        {value:String(insight.prs), label:'Records'},
        {value:String(insight.streak), label:'Streak'}
      ], 'cols-2')}
      <div class="history-muscles">
        <p class="small muted">Muscle targeting</p>
        ${historyMuscleRowsHtml(insight.muscles, insight.musclePeak)}
        ${insight.underNote?`<p class="faint small">${escapeHtml(insight.underNote)}</p>`:''}
      </div>
    </div>`);
  bindHistorySummaryCard(card, logs, filter);
  return card;
}
function renderHistoryGroups(parent, logs, spec){
  const openState = spec.open || historyTreeOpen;
  const groups = groupLogsBy(logs, spec.keyOf);
  if(groups.length<2){ (spec.skipBelow||spec.below)(parent, logs); return; }
  groups.forEach(g=>{
    const open = openState[spec.level]===g.key;
    parent.appendChild(historyFold(spec.level, spec.title(g), g.logs.length, open, ()=>{
      openState[spec.level] = open ? '' : g.key;
      (spec.clear||[]).forEach(k=> openState[k] = '');
      (spec.rerender||renderApp)();
    }, spec.unit));
    if(open){
      const body = el(`<div class="hist-kids"></div>`);
      spec.below(body, g.logs);
      parent.appendChild(body);
    }
  });
}
function renderHistoryScreen(){
  historyFilter = normalizeHistoryFilter(historyFilter);
  const wrap = el(`<div></div>`);
  const logs = loggedWorkouts().filter(l=>workoutInHistoryFilter(l, historyFilter));
  wrap.appendChild(renderBodyWeightCard());
  wrap.appendChild(historyGymSummaryCard(logs, historyFilter));
  return wrap;
}
function bodyWeightTileHtml(date){
  const d = parseDateKey(date);
  return `<div class="date-tile"><span class="dd">${d.getDate()}</span><span class="mm">${escapeHtml(d.toLocaleDateString(undefined,{month:'short'}))}</span></div>`;
}
function bodyWeightDeltaText(newer, older){
  if(!older) return '';
  const delta = roundTo(newer.weight - older.weight, 1);
  if(delta===0) return '0 kg';
  return `${delta>0?'+':'-'}${formatBodyWeightKg(Math.abs(delta))} kg`;
}
function bodyWeightLogRow(entry, older){
  const delta = bodyWeightDeltaText(entry, older);
  const row = el(`<div class="bw-log-row"></div>`);
  const open = el(`
    <button type="button" class="bw-log-open">
      ${bodyWeightTileHtml(entry.date)}
      <div class="bw-log-main">
        <div class="bw-log-val">${escapeHtml(formatBodyWeightKg(entry.weight))}<span class="unit">kg</span></div>
        ${entry.note?`<div class="bw-log-note">${escapeHtml(entry.note)}</div>`:''}
      </div>
      ${delta?`<div class="bw-log-delta">${escapeHtml(delta)}</div>`:''}
    </button>`);
  open.onclick = ()=> openLogWeightSheet(entry);
  const del = el(`<button type="button" class="btn ghost bw-log-del" aria-label="Delete weigh-in">${icon('trash',16)}</button>`);
  del.onclick = (event)=>{
    event.stopPropagation();
    confirmAction('Delete this weigh-in?', 'Delete', ()=>{
      deleteBodyWeightEntry(entry.id);
      renderApp();
    });
  };
  row.appendChild(open);
  row.appendChild(del);
  return row;
}
function renderBodyWeightLog(past){
  const list = el(`<div class="bw-log"></div>`);
  const groups = [];
  const byMonth = new Map();
  past.forEach((entry, i)=>{
    const ym = entry.date.slice(0,7);
    let group = byMonth.get(ym);
    if(!group){
      group = {ym, rows:[]};
      byMonth.set(ym, group);
      groups.push(group);
    }
    group.rows.push({entry, older:past[i+1] || null});
  });
  groups.forEach(group=>{
    const open = weightLogMonths.has(group.ym);
    const head = el(`
      <button type="button" class="bw-log-month" aria-expanded="${open?'true':'false'}">
        <span>${escapeHtml(monthTitle(group.ym))}</span>
        <span class="meta">${group.rows.length} ${icon(open?'chevronUp':'chevronDown',16)}</span>
      </button>`);
    head.onclick = ()=>{
      if(weightLogMonths.has(group.ym)) weightLogMonths.delete(group.ym);
      else weightLogMonths.add(group.ym);
      renderApp();
    };
    list.appendChild(head);
    if(!open) return;
    const rows = el(`<div class="bw-log-rows"></div>`);
    group.rows.forEach(item=> rows.appendChild(bodyWeightLogRow(item.entry, item.older)));
    list.appendChild(rows);
  });
  return list;
}
function renderBodyWeightCard(){
  const entries = sortedBodyWeight();
  const latest = entries[0] || null;
  const past = entries.slice(1);
  const prev = past[0] || null;
  let deltaHtml = '';
  if(latest && prev){
    const delta = roundTo(latest.weight - prev.weight, 1);
    const pd = parseDateKey(prev.date);
    const text = delta===0 ? 'No change' : `${delta>0?'+':'-'}${formatBodyWeightKg(Math.abs(delta))} kg`;
    deltaHtml = `<div class="bw-change">
        <span class="bw-delta">${escapeHtml(text)}</span>
        <span class="bw-since">since ${pd.getDate()} ${BODY_WEIGHT_MONTHS[pd.getMonth()]}</span>
      </div>`;
  }
  const card = el(`
    <div class="card">
      <div class="row between" style="margin-bottom:6px;">
        <p class="section-title" style="margin:0;">Body weight</p>
        <button class="btn" data-log style="padding:6px 12px;font-size:13px;min-height:36px;">${icon('plus',15)} Log weight</button>
      </div>
      ${latest
        ? `<div class="bw-hero">
             <div class="bw-main">
               <div class="bw-label">Current</div>
               <div class="bw-value">${escapeHtml(formatBodyWeightKg(latest.weight))}<span class="unit">kg</span></div>
             </div>
             ${deltaHtml}
           </div>
           <p class="faint small" style="margin:6px 0 0;">${escapeHtml(formatBodyWeightDate(latest.date))}${latest.note?` · ${escapeHtml(latest.note)}`:''}</p>`
        : `<p class="muted small" style="margin:0;">No weigh-ins yet. Log once a week on your weigh-in day.</p>`}
      <div data-past></div>
    </div>`);
  q('[data-log]',card).onclick = ()=> openLogWeightSheet();
  if(past.length){
    const pastBox = q('[data-past]',card);
    const toggle = el(`
      <button type="button" class="bw-log-toggle" aria-expanded="${weightLogOpen?'true':'false'}">
        <span>Past weigh-ins</span>
        <span class="meta">${past.length} ${icon(weightLogOpen?'chevronUp':'chevronDown',16)}</span>
      </button>`);
    toggle.onclick = ()=>{
      weightLogOpen = !weightLogOpen;
      if(weightLogOpen && !weightLogMonths.size) weightLogMonths.add(past[0].date.slice(0,7));
      renderApp();
    };
    pastBox.appendChild(toggle);
    if(weightLogOpen) pastBox.appendChild(renderBodyWeightLog(past));
  }
  return card;
}
function openLogWeightSheet(existing){
  const editing = existing || bodyWeightOn(todayKey());
  const date = (existing && existing.date) || todayKey();
  const latest = existing || latestBodyWeight();
  openSheet({
    title: editing ? (date===todayKey() ? 'Update today’s weight' : 'Update weigh-in') : 'Log weight',
    build:(body, sheet)=>{
      body.appendChild(el(`
        <div>
          <div class="field"><label>Weight (kg)</label>
            <input id="bwWeight" type="number" step="0.1" min="1" max="400" inputmode="decimal"
              value="${editing ? escapeHtml(String(editing.weight)) : (latest ? escapeHtml(String(latest.weight)) : '')}"
              placeholder="e.g. 77">
          </div>
          <div class="field"><label>Note (optional)</label>
            <input id="bwNote" placeholder="e.g. morning, after cardio" value="${escapeHtml(editing?editing.note:'')}">
          </div>
          <p class="faint small" style="margin-bottom:14px;">Saved as ${escapeHtml(formatBodyWeightDate(date))} — one entry per day.</p>
          <button class="btn" data-save style="width:100%;">Save</button>
        </div>`));
      const weightInput = q('#bwWeight',body);
      setTimeout(()=> weightInput && weightInput.focus(), 50);
      q('[data-save]',body).onclick = ()=>{
        const weight = parseFloat(q('#bwWeight',body).value);
        if(isNaN(weight) || weight<=0 || weight>400){ showToast('Enter a weight in kg'); return; }
        const note = (q('#bwNote',body).value||'').trim();
        saveBodyWeightEntry(roundTo(weight,1), note, date);
        sheet.close();
        showToast('Weight logged');
        renderApp();
      };
    }
  });
}

/* ------------------------------ Settings ------------------------------ */
/* Plain-language explanation of §5 training rules. Numbers are read from
   TRAINING and the active goal so the text stays true when settings change. */
function trainingGuideSections(){
  const goal = goalConfig();
  const E = TRAINING.effortFactor;
  const stepOf = equip => (TRAINING.load.minIncrementByEquip||{})[equip] || TRAINING.load.minIncrementKg || 2.5;
  const goalBlurb = {
    hypertrophy:'Building muscle size. Moderate weights, taken close to failure.',
    strength:'Lifting the heaviest weight you can. Heavy weights with longer rest.',
    endurance:'Muscles that keep going for longer. Lighter weights, more reps.',
  };
  return [
    {key:'overload', title:'How progressive overload works', body:`
      <p>Muscles grow and get stronger when you slowly ask them to do a bit more. Spotter does it in two steps:</p>
      <ol>
        <li><b>Add reps.</b> Stay on the same weight and climb inside the range on that exercise, such as 8–12.</li>
        <li><b>Then add weight.</b> When every working set at that weight hits the top of the range, the next session goes up by one jump. If every set felt Easy and you were 3 or more reps past the top, it can go up two jumps.</li>
      </ol>
      <p>Today's weight stays put for the rest of the exercise. The new weight shows up next time you do it.</p>`},
    {key:'qualifying', title:'When does the weight go up?', body:`
      <p>The weight goes up next session when every working set at today's weight reached the top of the range.</p>
      <ul>
        <li>Easy asks for two more reps next time, Medium for one, and Hard to match what you just did. Nothing is asked past the top of the range.</li>
        <li>All Easy, already at the middle of the range or above, can earn the weight a session early.</li>
        <li>Warm-ups are ignored. On a drop set, only the first stage counts. Later drops are just volume.</li>
      </ul>
      <p class="guide-eg">Example, 8–12: 60 kg × 12, 12, 12 means next time is one jump heavier. 60 kg × 10, 9, 8 stays at 60 kg and aims a rep or two higher.</p>`},
    {key:'progress', title:'What is the line under Spotter?', body:`
      <p>That line is the plan for the next set: the weight and the reps.</p>
      <p>Use puts those numbers in the steppers. You can still change them before you log.</p>
      <p>Spotter reads the last time you did the exercise and how this set felt. It does not keep a session counter.</p>`},
    {key:'increase', title:'How much weight gets added?', body:`
      <p>A Weight jump on the split row wins. Then a jump saved on the library exercise. Otherwise it is the usual jump for that equipment, in kilograms:</p>
      <ul>
        <li>Barbell and Smith machine: ${stepOf('barbell')} kg</li>
        <li>Dumbbell: ${stepOf('dumbbell')} kg</li>
        <li>Kettlebell: ${stepOf('kettlebell')} kg</li>
        <li>Machine and cable: ${stepOf('machine')} kg</li>
        <li>Band: ${stepOf('band')} kg</li>
        <li>Bodyweight: ${stepOf('bodyweight')} kg, or a harder variation when you are not adding weight yet</li>
      </ul>
      <p>The + and − on the weight stepper move by that same jump. Set a Weight jump on the exercise if your gym's plates are different.</p>`},
    {key:'lower', title:'When does it tell me to lower the weight?', body:`
      <p>One session under the bottom of the range holds the weight and asks you to climb back.</p>
      <p>If the session before that, at the same weight, was also under the range, the next one comes off by about 5 percent, and at least one jump.</p>
      <p>Three sessions in a row at the same weight with no extra reps is a plateau: stay there and keep chasing reps. A fourth flat session takes off about 10 percent.</p>
      <p>Away for 15 to 28 days, a weight increase waits. Away for more than 28 days, the next session starts about 10 percent lighter.</p>
      <p>On the first set of the day, far too easy and the next set goes up a jump. Far too hard and it comes down a jump. Sets after that stay on the weight you just logged.</p>`},
    {key:'goals', title:'Hypertrophy, Strength and Endurance', body:`
      ${Object.entries(TRAINING.goals).map(([key,g])=>`
        <div class="guide-goal${key===goal.key?' on':''}">
          <b>${escapeHtml(g.label)}</b>${key===goal.key?' <span class="guide-you">Your goal</span>':''}
          <p>${goalBlurb[key]||''} Usually about ${g.repsMin}–${g.repsMax} reps. That range is what Spotter builds toward on a new exercise.</p>
        </div>`).join('')}
      <p>Your goal also changes how much each set counts toward effective sets. A 4-rep set counts ${TRAINING.repRanges[0].credit.hypertrophy} for Hypertrophy but ${TRAINING.repRanges[0].credit.strength} for Strength. Each exercise's rep range comes from your split, so set it to match your goal.</p>`},
    {key:'effort', title:'Easy, Medium and Hard', body:`
      <ul>
        <li><b>Easy</b>: 3 or more reps left. Counts as ${E.easy} of a set.</li>
        <li><b>Medium</b>: 1–2 reps left. Counts as ${E.med}.</li>
        <li><b>Hard</b>: 0–1 reps left, close to failure. Counts as ${E.hard}.</li>
      </ul>
      <p>Be honest with it. Easy can move the weight up sooner. Hard holds the reps where they are. It also changes how much the set counts.</p>`},
    {key:'effective', title:'Effective sets and the muscle bars', body:`
      <p>Not every set is equal. An effective set is one set's worth of real stimulus: the credit for its rep range (for your goal) multiplied by how hard it felt. A 10-rep Hard set counts 1.0; an Easy one about half.</p>
      <p>Secondary muscles get ${Math.round(TRAINING.secondaryMuscleShare*100)}%, so bench press counts fully for chest and half for triceps. The bars compare your week with ${TRAINING.weeklyEffectiveSetTarget} effective sets per muscle.</p>`},
    {key:'special', title:'Warm-ups, drop sets and PRs', body:`
      <ul>
        <li><b>Warm-ups</b> don't count for PRs, Spotter or effective sets. Use the Warm-up switch so they don't drag your numbers down.</li>
        <li><b>Drop sets</b> count toward effective sets and Spotter by their first stage. Later drops are volume only. The whole drop set is never a Record.</li>
        <li><b>PRs</b> use an estimated one-rep max, so 80 kg × 10 can beat 85 kg × 6, and an extra rep at the same weight is a PR. Your first set of an exercise is the baseline; beating it earns the first trophy.</li>
      </ul>`},
    {key:'bodyweight', title:'Bodyweight and timed exercises', body:`
      <p>Reps-only and added-weight moves use the same loop: more reps, then more load. With nothing on the bar yet, the line says to add a little weight or pick a harder variation.</p>
      <p>Timed holds are separate. Plank and treadmill add a minute when the last one felt easy, and otherwise ask you to match it. Other holds add 10 seconds, or 15 if it felt easy. If it felt hard, just match last time.</p>`},
  ];
}

function openTrainingGuideSheet(openKey){
  openSheet({
    title:'FAQs',
    build:(body)=>{
      const wrap = el(`
        <div class="guide">
          ${trainingGuideSections().map(s=>`
            <details class="guide-item" data-key="${s.key}" ${s.key===openKey?'open':''}>
              <summary><span>${escapeHtml(s.title)}</span>${icon('chevronDown',18)}</summary>
              <div class="guide-body">${s.body}</div>
            </details>`).join('')}
        </div>`);
      body.appendChild(wrap);
    }
  });
}

/* Settings → Check for updates. The website's version.json describes the
   latest release; builds are compared, not version strings. */
let updateCheckRunning = false;
async function checkForUpdates(btn){
  if(updateCheckRunning) return;
  updateCheckRunning = true;
  const label = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = 'Checking…';
  try{
    const res = await fetch(`${UPDATE_URL}?t=${Date.now()}`, {cache:'no-store'});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const info = await res.json();
    if(!info || typeof info.build!=='number' || !info.version) throw new Error('bad version.json');
    if(info.build > APP_BUILD) openUpdateSheet(info);
    else showToast(`You're on the latest version (v${APP_VERSION})`);
  }catch(_){
    showToast("Couldn't check for updates. Check your connection.");
  }finally{
    updateCheckRunning = false;
    if(btn.isConnected){ btn.disabled = false; btn.innerHTML = label; }
  }
}
function openUpdateSheet(info){
  const notesUrl = SITE_URL + (info.notes || 'downloads/');
  const android = isAndroidApp();
  const updater = android ? capPlugin('AppUpdater') : null;
  const apkUrl = info.apk ? SITE_URL + info.apk : '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(info.date||'')
    ? parseDateKey(info.date).toLocaleDateString(undefined,{day:'numeric', month:'long', year:'numeric'}) : '';
  const highlights = Array.isArray(info.highlights) ? info.highlights.filter(h=>typeof h==='string' && h.trim()) : [];
  let ctaHtml;
  if(updater && apkUrl){
    ctaHtml = `<button class="btn update-cta" data-install>${icon('download',18)} Update now</button>
      <div class="update-progress" hidden><div class="update-progress-bar" data-bar></div></div>
      <p class="faint small" data-hint style="margin:8px 2px 0;">Downloads in the background, then Android asks you to install. Your workouts stay.</p>`;
  } else if(android){
    ctaHtml = `<a class="btn update-cta" href="${escapeHtml(notesUrl)}" target="_blank" rel="noopener noreferrer">${icon('download',18)} Download update</a>
      <p class="faint small" style="margin:8px 2px 0;">Opens the download page. Installing over this version keeps all your workouts.</p>`;
  } else {
    ctaHtml = `<button class="btn update-cta" data-reload>${icon('reopen',18)} Update now</button>`;
  }
  let stopUpdate = null;
  openSheet({
    title:'Update available',
    build:(body)=>{
      body.appendChild(el(`
        <div>
          <div class="update-head">
            <div class="update-ver">v${escapeHtml(info.version)}</div>
            <div class="faint small">${date ? `${escapeHtml(date)} · ` : ''}you have v${escapeHtml(APP_VERSION)}</div>
          </div>
          ${highlights.length ? `<p class="small muted" style="margin:14px 0 6px;">What's new</p>
            <ul class="update-list">${highlights.map(h=>`<li>${escapeHtml(h)}</li>`).join('')}</ul>` : ''}
          ${ctaHtml}
          <a class="btn secondary update-cta" href="${escapeHtml(notesUrl)}" target="_blank" rel="noopener noreferrer" style="margin-top:10px;">Full release notes</a>
        </div>`));
      const reload = q('[data-reload]',body);
      if(reload) reload.onclick = ()=> location.reload();
      const installBtn = q('[data-install]',body);
      if(installBtn && updater) stopUpdate = bindInAppUpdate(installBtn, body, updater, info, apkUrl);
    },
    onClosed: ()=>{ if(stopUpdate) stopUpdate(); }
  });
}

/* Android in-app APK update: permission → download with progress → PackageInstaller.
   Returns a cleanup fn so the resume listener is dropped when the sheet closes. */
function bindInAppUpdate(btn, body, updater, info, apkUrl){
  const progress = q('.update-progress', body);
  const bar = q('[data-bar]', body);
  const hint = q('[data-hint]', body);
  const idleLabel = btn.innerHTML;
  let busy = false;
  let waitingForPermission = false;
  let progressHandle = null;
  let resumeHandle = null;
  let alive = true;

  function setProgress(pct){
    if(!progress || !bar) return;
    progress.hidden = false;
    bar.style.width = Math.max(0, Math.min(100, pct)) + '%';
  }
  function resetUi(label){
    busy = false;
    btn.disabled = false;
    btn.innerHTML = label || idleLabel;
    if(progress) progress.hidden = true;
    if(bar) bar.style.width = '0%';
  }
  async function dropProgress(){
    if(progressHandle && progressHandle.remove){
      try{ await progressHandle.remove(); }catch(_){}
    }
    progressHandle = null;
  }
  async function ensurePermission(){
    const can = await updater.canInstall();
    if(can && can.value) return true;
    if(hint) hint.textContent = "Android needs your OK to let TrackA'gain install its own updates.";
    waitingForPermission = true;
    await updater.openInstallSettings();
    return false;
  }
  async function runUpdate(){
    if(!alive || busy) return;
    busy = true;
    btn.disabled = true;
    try{
      if(!(await ensurePermission())){
        busy = false;
        btn.disabled = false;
        return;
      }
      if(!alive) return;
      if(hint) hint.textContent = 'Downloads in the background, then Android asks you to install. Your workouts stay.';
      btn.textContent = 'Downloading…';
      setProgress(0);
      await dropProgress();
      progressHandle = await updater.addListener('progress', (ev)=>{
        if(!alive) return;
        const total = Number(ev && ev.total) || 0;
        const loaded = Number(ev && ev.loaded) || 0;
        const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
        btn.textContent = total > 0 ? `Downloading… ${pct}%` : 'Downloading…';
        setProgress(pct);
      });
      const size = typeof info.apkSize === 'number' ? info.apkSize : undefined;
      const sha256 = typeof info.sha256 === 'string' ? info.sha256 : undefined;
      await updater.download({url:apkUrl, size, sha256});
      await dropProgress();
      if(!alive) return;
      btn.textContent = 'Installing…';
      setProgress(100);
      await updater.install();
      if(alive){
        showToast('Update started');
        resetUi();
      }
    }catch(err){
      await dropProgress();
      if(!alive) return;
      const code = err && (err.code || err.errorCode);
      if(code === 'NEED_PERMISSION'){
        if(hint) hint.textContent = "Android needs your OK to let TrackA'gain install its own updates.";
        waitingForPermission = true;
        try{ await updater.openInstallSettings(); }catch(_){}
        resetUi(idleLabel);
        return;
      }
      if(code === 'CANCELLED'){
        showToast('Update cancelled');
        resetUi(idleLabel);
        return;
      }
      showToast("Couldn't update. Check your connection and try again.");
      resetUi(`${icon('download',18)} Try again`);
    }
  }

  btn.onclick = ()=> runUpdate();

  const capApp = capacitorAppPlugin();
  if(capApp && capApp.addListener){
    Promise.resolve(capApp.addListener('appStateChange', (state)=>{
      if(!alive || !waitingForPermission || !state || state.isActive!==true) return;
      waitingForPermission = false;
      updater.canInstall().then((can)=>{
        if(!alive) return;
        if(can && can.value) runUpdate();
        else if(hint) hint.textContent = "Android needs your OK to let TrackA'gain install its own updates. Tap Update now when you're back.";
      }).catch(()=>{});
    })).then((h)=>{ resumeHandle = h; }).catch(()=>{});
  }

  return ()=>{
    alive = false;
    waitingForPermission = false;
    dropProgress();
    if(resumeHandle && resumeHandle.remove){
      try{ resumeHandle.remove(); }catch(_){}
      resumeHandle = null;
    }
  };
}

function renderSettingsScreen(){
  const wrap = el(`<div></div>`);
  wrap.appendChild(el(`<h3 style="margin-bottom:14px;">Settings</h3>`));
  wrap.appendChild(el(`<div class="card"><p class="small muted">Weights are tracked in <strong>kilograms (kg)</strong>.</p></div>`));

  const themeCard = el(`
    <div class="card">
      <label>Appearance</label>
      <div class="row">
        <div class="chip ${currentTheme()==='dark'?'on':''}" data-th="dark" style="flex:1;justify-content:center;">${icon('moon',16)} Dark</div>
        <div class="chip ${currentTheme()==='light'?'on':''}" data-th="light" style="flex:1;justify-content:center;">${icon('sun',16)} Light</div>
      </div>
    </div>`);
  qa('[data-th]',themeCard).forEach(chip=> chip.onclick = ()=>{ setTheme(chip.dataset.th); renderApp(); });
  wrap.appendChild(themeCard);

  const genderOpts = [['unspecified','Prefer not to say'],['male','Male'],['female','Female']];
  const gender0 = DATA.settings.gender || 'unspecified';
  const genderHit = genderOpts.find(([v])=>v===gender0);
  const genderLabel = genderHit ? genderHit[1] : 'Prefer not to say';
  const nameCard = el(`
    <div class="card">
      <div class="field"><label>Your name</label><input id="userName" value="${escapeHtml(DATA.settings.userName||DEFAULT_USER_NAME)}" placeholder="Your name"></div>
      <div class="field" style="margin:0;">${choiceFieldHtml({id:'userGender', label:'Gender', value:gender0, display:genderLabel})}</div>
    </div>`);
  q('#userName',nameCard).onchange = (e)=>{
    DATA.settings.userName = e.target.value.trim() || DEFAULT_USER_NAME;
    saveData(DATA);
  };
  bindChoiceField(q('#userGender',nameCard), {
    title:'Gender',
    options:()=> genderOpts.map(([value,label])=>({value, label})),
    onChange:(value)=>{
      DATA.settings.gender = GENDERS.includes(value) ? value : 'unspecified';
      saveData(DATA);
    }
  });
  wrap.appendChild(nameCard);

  wrap.appendChild(el(`<div class="section-title">Body weight</div>`));
  const weighDay0 = DATA.settings.weighInDay || DAY_ORDER[0];
  const weighCard = el(`
    <div class="card">
      <div class="field" style="margin:0;">${choiceFieldHtml({id:'weighInDay', label:'Weekly weigh-in day', value:weighDay0, display:DAY_LABELS[weighDay0]})}</div>
      <p class="faint small" style="margin-top:10px;">Home shows a reminder on this day until you log or tap Later. Logging lives in History.</p>
    </div>`);
  bindChoiceField(q('#weighInDay',weighCard), {
    title:'Weekly weigh-in day',
    options:()=> DAY_ORDER.map(dk=>({value:dk, label:DAY_LABELS[dk]})),
    onChange:(value)=>{
      DATA.settings.weighInDay = value;
      saveData(DATA);
      showToast('Weigh-in day set to '+DAY_LABELS[value]);
      renderApp();
    }
  });
  wrap.appendChild(weighCard);

  const goalKey0 = DATA.settings.goal;
  const goalLabel0 = (TRAINING.goals[goalKey0]||{}).label || goalKey0;
  const sets0 = defaultPlanSets();
  wrap.appendChild(el(`<div class="section-title">Training</div>`));
  const trainingCard = el(`
    <div class="card">
      <div class="field">${choiceFieldHtml({id:'goalSelect', label:'Goal', value:goalKey0, display:goalLabel0})}</div>
      <div class="field">${choiceFieldHtml({id:'defaultPlanSets', label:'Sets for new exercises', value:String(sets0), display:String(sets0)})}
        <p class="faint small" style="margin-top:6px;">Used when you add an exercise to a split.</p>
      </div>
      <p class="faint small">Spotter adds reps inside the range, then adds weight by the usual jump for that equipment. The + and − on a set use that same jump.</p>
    </div>`);
  bindChoiceField(q('#defaultPlanSets',trainingCard), {
    title:'Sets for new exercises',
    options:()=> [1,2,3,4,5,6,7,8].map(n=>({value:String(n), label:String(n)})),
    onChange:(value)=>{
      const before = defaultPlanSets();
      const next = parseInt(value, 10);
      DATA.settings.defaultPlanSets = next;
      saveData(DATA);
      const split = activeSplit();
      const rows = Object.values(split.days || {}).flatMap(day=> (day && day.exercises) || []).filter(row=> row.sets === before);
      if(!rows.length || before === next) return;
      chooseAction(
        `Also change the ${rows.length} exercise${rows.length>1?'s':''} in your ${split.label} split that ${rows.length>1?'have':'has'} ${before} set${before>1?'s':''} to ${next}?`,
        'Update split', ()=>{
          rows.forEach(row=>{ row.sets = next; });
          touchActivePreset();
          syncActiveWorkoutFromSplit({fromSave:true});
          saveData(DATA);
          showToast(`${rows.length} exercise${rows.length>1?'s':''} now ${next} set${next>1?'s':''}`);
          renderApp();
        },
        'Keep split as is');
    }
  });
  bindChoiceField(q('#goalSelect',trainingCard), {
    title:'Goal',
    options:()=> Object.entries(TRAINING.goals).map(([value,g])=>({value, label:g.label})),
    onChange:(value)=>{
      const preset = TRAINING.goals[value];
      DATA.settings.goal = value;
      DATA.settings.overload = {repsToEarnIncrease:preset.repsToEarnIncrease, sessionsRequired:preset.sessionsRequired};
      saveData(DATA);
      showToast(`Goal set to ${preset.label}`);
      renderApp();
    }
  });
  wrap.appendChild(trainingCard);

  wrap.appendChild(el(`<div class="section-title">FAQs</div>`));
  const guideCard = el(`
    <div class="card guide-card">
      <p class="small muted">How Spotter picks the next weight and reps, and what each goal means.</p>
      <button class="btn secondary" data-guide style="width:100%;margin-top:10px;">${icon('info',16)} Open FAQs</button>
    </div>`);
  q('[data-guide]',guideCard).onclick = ()=> openTrainingGuideSheet();
  wrap.appendChild(guideCard);

  wrap.appendChild(el(`<div class="section-title">Rest timer</div>`));
  const restMins0 = DATA.settings.restDefaultMinutes;
  const restCard = el(`
    <div class="card">
      <div class="field">${choiceFieldHtml({id:'restDefault', label:'Default rest between sets', value:String(restMins0), display:formatMinSec(Math.round(restMins0*60))})}</div>
      <p class="faint small" style="margin-bottom:10px;">Any exercise can override this with its own rest time in Settings → Edit exercises.</p>
      <label class="row" style="gap:8px;margin:10px 0;font-size:13px;color:var(--text-dim);cursor:pointer;">
        <input type="checkbox" id="restAutoStart" style="width:auto;" ${DATA.settings.restAutoStart?'checked':''}>
        <span>Start rest automatically after each set</span>
      </label>
      <label class="row" style="gap:8px;margin:10px 0;font-size:13px;color:var(--text-dim);cursor:pointer;">
        <input type="checkbox" id="keepScreenOn" style="width:auto;" ${DATA.settings.keepScreenOn?'checked':''}>
        <span>Keep screen on during a workout</span>
      </label>
      <label class="row" style="gap:8px;margin:10px 0;font-size:13px;color:var(--text-dim);cursor:pointer;">
        <input type="checkbox" id="restNotify" style="width:auto;" ${DATA.settings.restNotify?'checked':''}>
        <span>System notification when rest ends (over other apps)</span>
      </label>
      <div class="field" style="margin:10px 0 0;">${choiceFieldHtml({id:'restSound', label:'Rest alert sound', value:restSoundChoice(), display:restSoundChoice()==='whistle'?'Whistle':'Phone default'})}</div>
      <label class="row" style="gap:8px;margin:10px 0 0;font-size:13px;color:var(--text-dim);cursor:pointer;">
        <input type="checkbox" id="restVibrate" style="width:auto;" ${DATA.settings.restVibrate?'checked':''}>
        <span>Vibrate when rest ends</span>
      </label>
      <p class="faint small" style="margin-top:10px;">Phone default uses your system notification sound. Whistle plays the app whistle when rest (or a hold) ends.</p>
      ${isAndroidApp() ? `<p class="faint small" style="margin-top:8px;">If the alert is late or missing with the screen off: Settings → Apps → ${escapeHtml(APP_NAME)} → Battery → Unrestricted. Also allow Alarms &amp; reminders if Android shows it.</p>
      <button class="btn secondary" data-allow-rest style="width:100%;margin-top:10px;">Allow rest alerts</button>` : ''}
    </div>`);
  bindChoiceField(q('#restDefault',restCard), {
    title:'Default rest between sets',
    options:()=> [1,1.5,2,2.5,3,3.5,4,5].map(m=>({value:String(m), label:formatMinSec(Math.round(m*60))})),
    onChange:(value)=>{
      DATA.settings.restDefaultMinutes = parseFloat(value); saveData(DATA); renderApp();
    }
  });
  q('#restNotify',restCard).onchange = async (e)=>{
    DATA.settings.restNotify = e.target.checked; saveData(DATA);
    if(e.target.checked){
      DATA.settings.restSetupAsked = true;
      saveData(DATA);
      const ok = await ensureRestNotifyPermission();
      if(!ok){
        DATA.settings.restNotify = false;
        saveData(DATA);
        e.target.checked = false;
        showToast('Notifications are blocked for '+APP_NAME+' in your phone settings');
      }
      else if(isAndroidApp()) await runRestAlertSetup();
    }
  };
  bindChoiceField(q('#restSound',restCard), {
    title:'Rest alert sound',
    options:()=> [
      {value:'default', label:'Phone default'},
      {value:'whistle', label:'Whistle'}
    ],
    onChange: async (value)=>{
      DATA.settings.restSound = value==='whistle' ? 'whistle' : 'default';
      saveData(DATA);
      previewRestSound(DATA.settings.restSound);
      if(DATA.settings.restNotify){
        await ensureRestNotifyPermission();
        rescheduleActiveRestNotifications();
      }
      showToast(DATA.settings.restSound==='whistle' ? 'Rest alerts will use the whistle' : 'Rest alerts will use the phone default sound');
    }
  });
  const allowRest = q('[data-allow-rest]', restCard);
  if(allowRest) allowRest.onclick = async ()=>{
    DATA.settings.restNotify = true;
    DATA.settings.restSetupAsked = true;
    saveData(DATA);
    await runRestAlertSetup();
    renderApp();
  };
  q('#restVibrate',restCard).onchange = (e)=>{ DATA.settings.restVibrate = e.target.checked; saveData(DATA); };
  q('#restAutoStart',restCard).onchange = (e)=>{ DATA.settings.restAutoStart = e.target.checked; saveData(DATA); };
  q('#keepScreenOn',restCard).onchange = (e)=>{
    DATA.settings.keepScreenOn = e.target.checked;
    saveData(DATA);
    setScreenAwake(!!activeWorkoutLog() && !document.hidden);
  };
  wrap.appendChild(restCard);

  wrap.appendChild(el(`<div class="section-title">Exercises</div>`));
  const libCard = el(`
    <div class="card">
      <p class="small muted">Name, muscle, sets and time for every movement, including ones not on this week. Only movements you added yourself can be deleted. Split Edit is the day’s list and order.</p>
      <button class="btn secondary" data-manage style="width:100%;margin-top:10px;">Edit exercises (${DATA.exercises.length})</button>
    </div>`);
  q('[data-manage]',libCard).onclick = openEditExercisesScreen;
  wrap.appendChild(libCard);

  wrap.appendChild(el(`<div class="section-title">Warm-up library</div>`));
  const wuLibCard = el(`
    <div class="card">
      <p class="small muted">Bodyweight warm-ups only — no bands or machines. Everyday basics land on each training day; pick extras here when you edit a Split day.</p>
      <button class="btn secondary" data-manage-wu style="width:100%;margin-top:10px;">Manage warm-ups (${(DATA.warmupLibrary||[]).length})</button>
    </div>`);
  q('[data-manage-wu]',wuLibCard).onclick = openWarmupLibrarySheet;
  wrap.appendChild(wuLibCard);

  wrap.appendChild(el(`<div class="section-title">Reset data</div>`));
  const resetCard = el(`
    <div class="card">
      <p class="small muted">Clear only what you choose. Nothing is deleted until you confirm twice.</p>
      <button class="btn secondary" data-reset style="width:100%;margin-top:10px;color:var(--red);">Reset data…</button>
    </div>`);
  q('[data-reset]',resetCard).onclick = openResetDataSheet;
  wrap.appendChild(resetCard);

  const flagged = DATA.exercises.filter(e=>e.flagged);
  if(flagged.length){
    wrap.appendChild(el(`<div class="section-title">Movements you suggested</div>`));
    const card = el(`
      <div class="card">
        <p class="muted small">You marked these as common gym movements that should be built in.</p>
        <div data-list style="margin-top:10px;"></div>
        <button class="btn secondary" data-copy style="margin-top:12px;">Copy list</button>
      </div>`);
    const list = q('[data-list]',card);
    flagged.forEach(ex=> list.appendChild(el(`<div class="ex-list-item"><div>${escapeHtml(ex.name)}<div class="meta">${escapeHtml(exerciseSubtitle(ex))}</div></div></div>`)));
    q('[data-copy]',card).onclick = ()=>{
      const text = flagged.map(ex=>`${ex.name} — ${exerciseSubtitle(ex)}`).join('\n');
      if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(()=>showToast('Copied'), ()=>showToast('Could not copy'));
      else showToast('Copy not supported here');
    };
    wrap.appendChild(card);
  }

  wrap.appendChild(el(`<div class="section-title">App</div>`));
  const appCard = el(`
    <div class="card">
      <div class="row between">
        <div>
          <div class="app-ver">Version ${escapeHtml(APP_VERSION)}</div>
          <div class="faint small">Build ${APP_BUILD}</div>
        </div>
        <a class="btn ghost" href="${escapeHtml(SITE_URL)}downloads/" target="_blank" rel="noopener noreferrer" style="padding:8px 4px;">What's new</a>
      </div>
      <button class="btn secondary" data-update style="width:100%;margin-top:10px;">${icon('reopen',16)} Check for updates</button>
    </div>`);
  q('[data-update]',appCard).onclick = (e)=> checkForUpdates(e.currentTarget);
  wrap.appendChild(appCard);

  wrap.appendChild(el(`
    <footer class="settings-footer">
      ${logoMarkHtml()}
      <div class="brand-kicker">${escapeHtml(APP_NAME)}</div>
      <div class="credit-line">Workout tracking, simplified by Nirbhay Raut.</div>
      <div class="copy">v${escapeHtml(APP_VERSION)} · ©2026 <a class="credit-mail" href="mailto:trackagainsupport@gmail.com">trackagainsupport@gmail.com</a></div>
    </footer>`));
  wrap.appendChild(el(`
    <div class="chai-support">
      <a class="chai-btn" href="https://nirray2392.github.io/TrackAgain/chai/" target="_blank" rel="noopener noreferrer">
        <svg viewBox="0 0 48 48" width="26" height="26" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9 18h26l-3 20a4 4 0 0 1-4 3.5H16a4 4 0 0 1-4-3.5z"/>
          <path d="M35 22h3a5 5 0 0 1 0 10h-4"/>
          <path d="M17 6c-2 2.5 2 4.5 0 7M23 6c-2 2.5 2 4.5 0 7M29 6c-2 2.5 2 4.5 0 7"/>
        </svg>
        Chai me up ₹
      </a>
      <div class="chai-hint">Pay with any UPI app</div>
    </div>`));
  return wrap;
}

const RESET_CATEGORIES = [
  {key:'history',  label:'Workout history', hint:'All logged sessions and sets. Also clears Stats PRs, which are built from this.'},
  {key:'records',  label:'PR trophies on sets', hint:'Clears the PR mark on sets. The Stats tab still lists best lifts unless you also clear Workout history.'},
  {key:'split',    label:'Split layout', hint:"Switches the week to a fresh God’s Plan. Other presets stay unless you clear those too."},
  {key:'weight',   label:'Weight logs', hint:'Body-weight entries in History.'},
  {key:'presets',  label:'Saved split presets', hint:'Clears your presets and puts God’s Plan, PPL, and PPL + UL back. The week switches to God’s Plan.'},
  {key:'settings', label:'Settings', hint:'Name, weigh-in day, training goal, rest timer preferences.'}
];
function openResetDataSheet(){
  const picked = new Set();
  function draw(){
    openSheet({
      title:'Reset data',
      build:(body, sheet)=>{
        body.appendChild(el(`<p class="warn-box" style="margin-bottom:14px;">This will permanently delete selected data. This cannot be undone.</p>`));
        RESET_CATEGORIES.forEach(cat=>{
          const row = el(`
            <label class="row" style="align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer;">
              <input type="checkbox" style="width:auto;margin-top:3px;" ${picked.has(cat.key)?'checked':''}>
              <span style="min-width:0;">
                <span style="font-weight:700;font-size:14px;display:block;">${escapeHtml(cat.label)}</span>
                <span class="faint small">${escapeHtml(cat.hint)}</span>
              </span>
            </label>`);
          q('input',row).onchange = (e)=>{ e.target.checked ? picked.add(cat.key) : picked.delete(cat.key); draw(); };
          body.appendChild(row);
        });
        const canClear = picked.size>0;
        if(!canClear) body.appendChild(el(`<p class="faint small" style="margin:12px 0 0;">Select at least one item to clear.</p>`));
        const btn = el(`<button class="btn" ${canClear?'':'disabled'} style="width:100%;margin-top:16px;background:var(--text);color:var(--bg);border-color:var(--text);">Clear selected</button>`);
        btn.onclick = ()=>{
          if(!canClear) return;
          const labels = RESET_CATEGORIES.filter(c=>picked.has(c.key)).map(c=>c.label);
          confirmAction('You are about to delete: '+labels.join(', ')+'. This cannot be undone. Continue?', 'Delete', ()=>{
            applyDataReset(picked);
            sheet.close();
            showToast('Selected data cleared');
            renderApp();
          });
        };
        body.appendChild(btn);
      }
    });
  }
  draw();
}
function restoreGodsPlanPreset(){
  const s = DATA.settings = DATA.settings || {};
  const def = BUILTIN_PRESETS.find(b=>b.id==='builtin-gods-plan');
  if(!def) return;
  s.dismissedPresets = (Array.isArray(s.dismissedPresets) ? s.dismissedPresets : []).filter(id=>id!==def.id);
  DATA.presets = DATA.presets || [];
  let gods = DATA.presets.find(p=>p.id===def.id);
  if(!gods){
    gods = {id:def.id, name:def.name, subtitle:def.subtitle, split:def.build(DATA.exercises), savedAt:Date.now(), customized:false};
    DATA.presets.push(gods);
  }
  gods.name = def.name;
  gods.subtitle = def.subtitle;
  gods.customized = false;
  gods.split = def.build(DATA.exercises);
  gods.savedAt = Date.now();
  usePreset(gods);
  syncActiveWorkoutFromSplit({replaceAll:true});
}
function applyDataReset(picked){
  if(picked.has('history')){
    DATA.logs = [];
    DATA.progress = {};
    spotterForget();
  }
  if(picked.has('records')){
    (DATA.logs||[]).forEach(log=> (log.sets||[]).forEach(set=>{ set.isPR = false; }));
  }
  if(picked.has('weight')) DATA.bodyWeight = [];
  if(picked.has('settings')){
    /* Bookkeeping, not preferences: keep the user past onboarding, deleted presets
       deleted, and one-time upgrades from running again. */
    const keep = ['onboarded','dismissedPresets','dismissedSessions','presetsVersion','prRulesVersion',
      'badgesSeen','badgesSeenSeeded','weightedBwMigrated','muscleTagsV2','gearWarmupsSwept','restSetupAsked'];
    const prev = DATA.settings;
    DATA.settings = defaultSettings();
    keep.forEach(k=>{ if(k in prev) DATA.settings[k] = prev[k]; });
  }
  if(picked.has('presets')){
    DATA.presets = [];
    DATA.settings.dismissedPresets = [];
    DATA.settings.presetsVersion = 0;
    ensureBuiltinPresets(DATA);
    const gods = (DATA.presets||[]).find(p=>p.id==='builtin-gods-plan');
    if(gods){
      usePreset(gods);
      syncActiveWorkoutFromSplit({replaceAll:true});
    }
  } else if(picked.has('split')){
    restoreGodsPlanPreset();
  }
  clearStatsMuscle();
  saveData(DATA);
}

