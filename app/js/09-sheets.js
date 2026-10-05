/* ============================ §9 SHEETS ============================ */

/* --- log / edit a set ------------------------------------------------ */
function metricFieldId(prefix, name){ return (prefix||'')+name; }
function metricFieldsHtml(metric, existingSet, prefillWeight, idPrefix){
  const weight = existingSet ? existingSet.weight : (prefillWeight!=null ? prefillWeight : '');
  const reps   = existingSet ? existingSet.reps : '';
  const secs   = existingSet ? existingSet.duration : '';
  const weightId = metricFieldId(idPrefix,'fldWeight');
  const repsId = metricFieldId(idPrefix,'fldReps');
  const secsId = metricFieldId(idPrefix,'fldSecs');
  if(metric==='weight_reps' || metric==='assisted'){
    const label = metric==='assisted' ? 'Assistance (kg)' : 'Weight (kg)';
    return `<div class="grid2">
        <div class="field"><label>${label}</label><input id="${weightId}" type="number" step="0.5" min="0" inputmode="decimal" value="${weight}" placeholder="e.g. 60"></div>
        <div class="field"><label>Reps</label><input id="${repsId}" type="number" min="1" inputmode="numeric" value="${reps}" placeholder="e.g. 8"></div>
      </div>
      ${metric==='assisted'?'<p class="faint small" style="margin:-4px 0 10px;">Lower assistance = stronger 💪</p>':''}`;
  }
  if(metric==='reps_only') return `<div class="field"><label>Reps</label><input id="${repsId}" type="number" min="1" inputmode="numeric" value="${reps}" placeholder="e.g. 12"></div>`;
  if(metric==='time')      return `<div class="field"><label>Duration (seconds)</label><input id="${secsId}" type="number" min="1" inputmode="numeric" value="${secs}" placeholder="e.g. 45"></div>`;
  return '';
}
function readMetricFields(metric, root, idPrefix){
  if(metric==='weight_reps' || metric==='assisted'){
    const weightEl = q('#'+metricFieldId(idPrefix,'fldWeight'),root);
    const repsEl = q('#'+metricFieldId(idPrefix,'fldReps'),root);
    if(!weightEl || !repsEl) return null;
    const weight = parseFloat(weightEl.value), reps = parseInt(repsEl.value,10);
    if(isNaN(weight)||isNaN(reps)||weight<0||reps<=0) return null;
    return {weight, reps};
  }
  if(metric==='reps_only'){
    const repsEl = q('#'+metricFieldId(idPrefix,'fldReps'),root);
    if(!repsEl) return null;
    const reps = parseInt(repsEl.value,10);
    return (isNaN(reps)||reps<=0) ? null : {reps};
  }
  if(metric==='time'){
    const secsEl = q('#'+metricFieldId(idPrefix,'fldSecs'),root);
    if(!secsEl) return null;
    const duration = parseInt(secsEl.value,10);
    return (isNaN(duration)||duration<=0) ? null : {duration};
  }
  return {};
}

/* Appends one normal set to today's log. Shared by the sheet and the card's inline logger. */
function logNormalSet(exerciseId, values, effort, isWarmup, intent){
  const log = todayLog();
  persistLog(log);
  const set = {id:uid(), exerciseId, difficulty:effort, intent, ts:Date.now(), isPR:false, isDropSet:false, isWarmup:!!isWarmup, ...values};
  log.sets.push(set);
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
  if(set.isDropSet && set.stages.length>=5) return false;
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
}
/* Removes a whole set (stage null) or one drop stage. A drop set left with a
   single stage turns back into a normal set. Returns a snapshot for undo. */
function removeSetOrStage(set, stage){
  const snap = snapshotSet(set);
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

function deleteLoggedSet(set){
  confirmAction('Delete this set? This cannot be undone.', 'Delete', ()=>{
    const log = DATA.logs.find(l=> (l.sets||[]).includes(set));
    if(log) log.sets = log.sets.filter(s=>s.id!==set.id);
    recomputePRs(set.exerciseId);
    saveData(DATA);
    closeSheets();
    renderApp();
  });
}

function openLogSetSheet(opts){
  const {exerciseId, planRow, existingSet} = opts;
  const ex = getExercise(exerciseId);
  const metric = metricOf(ex);
  const isEdit = !!existingSet;
  const plannedLoad = !isEdit && loadPlanFor(exerciseId) ? loadPlanFor(exerciseId).weight : null;
  const normalExisting = (existingSet && !existingSet.isDropSet) ? existingSet : null;
  let effort = existingSet ? existingSet.difficulty : 'med';
  let strengthIntent = normalExisting ? normalExisting.intent==='strength' : false;
  let mode = (existingSet && existingSet.isDropSet) ? 'drop' : (!existingSet && opts.startMode==='drop' ? 'drop' : 'normal');
  let stages = (existingSet && existingSet.isDropSet) ? existingSet.stages.map(s=>({...s})) : defaultDropStages(metric, plannedLoad);
  let isWarmup = existingSet ? !!existingSet.isWarmup : false;

  function saveNormalSet(values, intent){
    if(isEdit){
      Object.assign(existingSet, values, {difficulty:effort, intent, isDropSet:false, isWarmup});
      delete existingSet.stages;
      recomputePRs(exerciseId);
      saveData(DATA);
      closeSheets();
      showToast('Set updated');
      renderApp();
    } else {
      const set = logNormalSet(exerciseId, values, effort, isWarmup, intent);
      closeSheets();
      celebrateSet(set);
      renderApp();
    }
  }
  function saveDropSet(finalStages){
    if(isEdit){
      Object.assign(existingSet, {difficulty:effort, intent:null, isDropSet:true, stages:finalStages, isPR:false, isWarmup:false});
      delete existingSet.weight; delete existingSet.reps; delete existingSet.duration;
      recomputePRs(exerciseId);
      saveData(DATA);
      closeSheets();
      showToast('Drop set updated');
      renderApp();
    } else {
      const log = todayLog();
      persistLog(log);
      const set = {id:uid(), exerciseId, difficulty:effort, intent:null, ts:Date.now(), isPR:false, isDropSet:true, stages:finalStages};
      log.sets.push(set);
      markWorkoutActivity(log);
      saveData(DATA);
      closeSheets();
      showToast('Drop set logged 🔻');
      renderApp();
    }
  }

  openSheet({
    title:`${isEdit?'Edit set':'Log a set'} · ${ex.name}`,
    build:(body)=>{
      function renderBody(){
        body.innerHTML = '';
        let refreshLowRepWarning = ()=>{};
        let holdSaveForLowRepWarning = ()=> false;
        const wrap = el(`
          <div>
            <div class="row" style="margin-bottom:14px;">
              <div class="chip ${mode==='normal'?'on':''}" data-mode="normal" style="flex:1;text-align:center;justify-content:center;">Normal set</div>
              <div class="chip ${mode==='drop'?'on':''}" data-mode="drop" style="flex:1;text-align:center;justify-content:center;">🔻 Drop set</div>
            </div>
            <div data-fields></div>
            <div class="field">
              <label>How hard did it feel${mode==='drop'?' overall':''}?</label>
              <div class="row" data-effort>
                <div class="diffchip" data-effort-key="easy">Easy</div>
                <div class="diffchip" data-effort-key="med">Medium</div>
                <div class="diffchip" data-effort-key="hard">Hard</div>
              </div>
            </div>
            ${planRow && metric!=='time' ? `<p class="faint small">Target: ${planRow.repsMin}-${planRow.repsMax} reps${planRow.rpe?` · RPE ${planRow.rpe}`:''}</p>` : ''}
            ${mode==='normal' ? `<label class="row" style="gap:8px;margin:12px 0 0;font-size:13px;color:var(--text-dim);cursor:pointer;">
              <input type="checkbox" data-warmup style="width:auto;" ${isWarmup?'checked':''}>
              <span>Warm-up set (skipped for PRs, overload, and auto-finish)</span>
            </label>` : ''}
            <button class="btn" data-save style="width:100%;margin-top:10px;">${isEdit?'Save changes':(mode==='drop'?'Save drop set':'Save set')}</button>
            ${isEdit ? '<button class="btn danger" data-delete-set style="width:100%;margin-top:8px;">Delete set</button>' : ''}
          </div>`);
        body.appendChild(wrap);
        const delBtn = q('[data-delete-set]',wrap);
        if(delBtn) delBtn.onclick = ()=> deleteLoggedSet(existingSet);

        qa('[data-mode]',wrap).forEach(chip=> chip.onclick = ()=>{
          if(chip.dataset.mode===mode) return;
          mode = chip.dataset.mode;
          if(mode==='drop' && stages.length<2) stages = defaultDropStages(metric, plannedLoad);
          renderBody();
        });

        const fieldsBox = q('[data-fields]',wrap);
        if(mode==='normal'){
          fieldsBox.appendChild(el(`<div>${metricFieldsHtml(metric, normalExisting, plannedLoad)}<div data-warn></div></div>`));
          const warnBox = q('[data-warn]',fieldsBox);
          const repsInput = q('#fldReps',fieldsBox);
          // A saved rep count is already committed. Digits still being typed are not.
          let repsCommitted = !!(normalExisting && normalExisting.reps);
          let blurTimer = 0;
          function refreshWarning(){
            const reps = parseInt(repsInput ? repsInput.value : '', 10);
            const show = repsCommitted && isLowRepSet({reps, isWarmup}, metric);
            if(!show){ warnBox.innerHTML=''; return; }
            if(q('[data-intent]',warnBox)) return; // already shown, keep checkbox state
            warnBox.innerHTML = '';
            const node = el(`
              <div class="warn-box">
                ⚠️ Very low rep set (under ${TRAINING.lowRepWarningBelow}). That's strength territory — drop the weight if you're chasing size.
                <label class="pick"><input type="checkbox" data-intent ${strengthIntent?'checked':''}> Count this as a strength set</label>
              </div>`);
            q('[data-intent]',node).onchange = (e)=>{ strengthIntent = e.target.checked; };
            warnBox.appendChild(node);
          }
          refreshLowRepWarning = refreshWarning;
          // First Save on a low working set reveals the warning so the strength checkbox can be used.
          holdSaveForLowRepWarning = ()=>{
            clearTimeout(blurTimer);
            if(!repsInput) return false;
            repsCommitted = String(repsInput.value).trim() !== '';
            const reps = parseInt(repsInput.value, 10);
            const show = isLowRepSet({reps, isWarmup}, metric);
            const already = !!q('[data-intent]', warnBox);
            refreshWarning();
            return show && !already;
          };
          if(repsInput){
            repsInput.addEventListener('input', ()=>{
              repsCommitted = false;
              clearTimeout(blurTimer);
              warnBox.innerHTML = '';
            });
            repsInput.addEventListener('blur', ()=>{
              repsCommitted = String(repsInput.value).trim() !== '';
              clearTimeout(blurTimer);
              // After the click handler, so Save can show the warning itself.
              blurTimer = setTimeout(refreshWarning, 0);
            });
            repsInput.addEventListener('keydown', (e)=>{
              if(e.key !== 'Enter') return;
              repsCommitted = String(repsInput.value).trim() !== '';
              clearTimeout(blurTimer);
              refreshWarning();
            });
            if(repsCommitted) refreshWarning();
          }
        } else {
          const dropWrap = el(`
            <div>
              <p class="faint small" style="margin-bottom:8px;">Log each stage as the weight drops (2-5 stages).</p>
              <div data-stages></div>
              <div class="row" style="margin-bottom:12px;">
                <button class="btn ghost" data-add-stage ${stages.length>=5?'disabled':''}>＋ Add stage</button>
                <button class="btn ghost" data-remove-stage ${stages.length<=2?'disabled':''}>－ Remove stage</button>
              </div>
            </div>`);
          fieldsBox.appendChild(dropWrap);
          const stagesBox = q('[data-stages]',dropWrap);
          stages.forEach((stage,i)=>{
            stagesBox.appendChild(el(`
              <div class="stage-row">
                <span class="stage-num">${i+1}</span>
                <div class="fields" style="display:flex;gap:8px;flex:1;">${stageFieldsHtml(metric, stage, i)}</div>
              </div>`));
          });
          const captureStages = ()=>{ stages = stages.map((s,i)=> readStageFields(metric, wrap, i) || s); };
          q('[data-add-stage]',dropWrap).onclick = ()=>{
            if(stages.length>=5) return;
            captureStages();
            stages.push(defaultDropStages(metric,null)[0]);
            renderBody();
          };
          q('[data-remove-stage]',dropWrap).onclick = ()=>{
            if(stages.length<=2) return;
            captureStages();
            stages.pop();
            renderBody();
          };
        }

        const paintEffort = ()=> qa('.diffchip',wrap).forEach(chip=>{
          chip.className = chip.dataset.effortKey===effort ? 'diffchip on-'+effort : 'diffchip';
        });
        paintEffort();
        qa('.diffchip',wrap).forEach(chip=> chip.onclick = ()=>{ effort = chip.dataset.effortKey; paintEffort(); });
        const wu = q('[data-warmup]',wrap);
        if(wu) wu.onchange = (e)=>{ isWarmup = e.target.checked; refreshLowRepWarning(); };

        q('[data-save]',wrap).onclick = ()=>{
          if(mode==='normal'){
            if(holdSaveForLowRepWarning()) return;
            const values = readMetricFields(metric, wrap);
            if(!values){ showToast('Enter valid numbers'); return; }
            const intent = !isWarmup && (metric==='weight_reps'||metric==='assisted') && strengthIntent && values.reps < TRAINING.lowRepWarningBelow ? 'strength' : null;
            saveNormalSet(values, intent);
          } else {
            const finalStages = [];
            for(let i=0;i<stages.length;i++){
              const v = readStageFields(metric, wrap, i);
              if(!v){ showToast(`Enter valid numbers for stage ${i+1}`); return; }
              finalStages.push(v);
            }
            if(finalStages.length<2){ showToast('Add at least 2 stages'); return; }
            saveDropSet(finalStages);
          }
        };
      }
      renderBody();
    }
  });
}

/* One sheet for a whole superset round: every exercise, then one rest. */
function supersetSeed(planRow){
  const metric = metricOf(getExercise(planRow.exerciseId));
  const done = setsInLogFor(todayLog(), planRow.exerciseId).filter(s=>!s.isDropSet);
  const lastToday = done.slice(-1)[0];
  const lastBits = lastLoggedBits(planRow.exerciseId);
  const sample = lastToday || (lastBits && lastBits.set);
  const planned = loadPlanFor(planRow.exerciseId);
  const seed = {weight:'', reps:'', duration:''};
  if(metric==='weight_reps' || metric==='assisted'){
    const weight = planned && planned.weight!=null ? planned.weight : (sample && sample.weight!=null ? sample.weight : '');
    seed.weight = weight;
    seed.reps = sample && sample.reps!=null ? sample.reps : '';
  } else if(metric==='reps_only'){
    seed.reps = sample && sample.reps!=null ? sample.reps : '';
  } else if(metric==='time'){
    seed.duration = sample && sample.duration!=null ? sample.duration : '';
  }
  return seed;
}
function openSupersetLogSheet(members){
  const blocks = members.map((m,i)=>{
    const ex = getExercise(m.row.exerciseId);
    if(!ex) return null;
    return {row:m.row, ex, metric:metricOf(ex), prefix:'r'+i, effort:'med', strengthIntent:false, warned:false};
  }).filter(Boolean);
  if(blocks.length<2) return;
  let warmup = false;

  openSheet({
    title:'Log superset round',
    build:(body)=>{
      function paintEffort(blockEl, effort){
        qa('.diffchip', blockEl).forEach(chip=>{
          chip.className = chip.dataset.effortKey===effort ? 'diffchip on-'+effort : 'diffchip';
        });
      }
      function showLowRep(block, blockEl){
        const warnBox = q('[data-warn]', blockEl);
        warnBox.innerHTML = '';
        const node = el(`
          <div class="warn-box">
            ⚠️ Very low rep set (under ${TRAINING.lowRepWarningBelow}). That's strength territory — drop the weight if you're chasing size.
            <label class="pick"><input type="checkbox" data-intent ${block.strengthIntent?'checked':''}> Count this as a strength set</label>
          </div>`);
        q('[data-intent]', node).onchange = (e)=>{ block.strengthIntent = e.target.checked; };
        warnBox.appendChild(node);
      }
      const wrap = el(`
        <div>
          <p class="faint small" style="margin-bottom:12px;">Log every exercise in this round here. Rest once after you save.</p>
          <div data-blocks></div>
          <label class="row" style="gap:8px;margin:4px 0 0;font-size:13px;color:var(--text-dim);cursor:pointer;">
            <input type="checkbox" data-warmup style="width:auto;">
            <span>Warm-up round (skipped for PRs, overload, and auto-finish)</span>
          </label>
          <button class="btn" data-save style="width:100%;margin-top:12px;">Save round</button>
        </div>`);
      body.appendChild(wrap);
      const list = q('[data-blocks]', wrap);
      blocks.forEach(block=>{
        const target = block.metric!=='time'
          ? `${block.row.repsMin}–${block.row.repsMax} reps${block.row.rpe?` · RPE ${block.row.rpe}`:''}`
          : `${block.row.sets} holds`;
        const blockEl = el(`
          <div class="ss-block" data-block="${block.prefix}">
            <div class="name">${escapeHtml(block.ex.name)}</div>
            <p class="faint small" style="margin-bottom:8px;">${escapeHtml(target)}</p>
            ${metricFieldsHtml(block.metric, supersetSeed(block.row), null, block.prefix)}
            <div data-warn></div>
            <div class="field" style="margin-bottom:0;">
              <label>How hard?</label>
              <div class="row">
                <div class="diffchip" data-effort-key="easy">Easy</div>
                <div class="diffchip" data-effort-key="med">Medium</div>
                <div class="diffchip" data-effort-key="hard">Hard</div>
              </div>
            </div>
          </div>`);
        paintEffort(blockEl, block.effort);
        qa('.diffchip', blockEl).forEach(chip=> chip.onclick = ()=>{
          block.effort = chip.dataset.effortKey;
          paintEffort(blockEl, block.effort);
        });
        const repsInput = q('#'+metricFieldId(block.prefix,'fldReps'), blockEl);
        if(repsInput) repsInput.addEventListener('input', ()=>{
          block.warned = false;
          block.strengthIntent = false;
          q('[data-warn]', blockEl).innerHTML = '';
        });
        list.appendChild(blockEl);
      });
      q('[data-warmup]', wrap).onchange = (e)=>{
        warmup = e.target.checked;
        if(warmup) blocks.forEach(block=>{
          block.warned = false;
          block.strengthIntent = false;
          const blockEl = q(`[data-block="${block.prefix}"]`, wrap);
          if(blockEl) q('[data-warn]', blockEl).innerHTML = '';
        });
      };
      q('[data-save]', wrap).onclick = ()=>{
        const pending = [];
        for(const block of blocks){
          const values = readMetricFields(block.metric, wrap, block.prefix);
          if(!values){ showToast('Enter valid numbers for '+block.ex.name); return; }
          pending.push({block, values});
        }
        let held = false;
        pending.forEach(({block, values})=>{
          const low = isLowRepSet({reps:values.reps, isWarmup:warmup}, block.metric);
          if(!low){ block.warned = false; block.strengthIntent = false; return; }
          if(block.warned) return;
          block.warned = true;
          held = true;
          showLowRep(block, q(`[data-block="${block.prefix}"]`, wrap));
        });
        if(held) return;
        const log = todayLog();
        persistLog(log);
        const saved = pending.map(({block, values})=>{
          const intent = !warmup && (block.metric==='weight_reps'||block.metric==='assisted') && block.strengthIntent && values.reps < TRAINING.lowRepWarningBelow ? 'strength' : null;
          const set = {id:uid(), exerciseId:block.row.exerciseId, difficulty:block.effort, intent, ts:Date.now(), isPR:false, isDropSet:false, isWarmup:warmup, ...values};
          log.sets.push(set);
          recomputePRs(block.row.exerciseId);
          return set;
        });
        markWorkoutActivity(log);
        saveData(DATA);
        closeSheets();
        if(saved.some(s=>s.isPR)) showToast('🏆 New personal record! You crushed it!', true);
        else showToast('Superset round logged');
        renderApp();
      };
    }
  });
}

/* --- adjust today's target load -------------------------------------- */
function openLoadAdjustSheet(status){
  const step = status.metric==='assisted' ? TRAINING.load.assistanceStepKg : loadStepFor(getExercise(status.exerciseId));
  let weight = status.targetWeight != null ? status.targetWeight
    : (status.suggestedWeight != null ? status.suggestedWeight : (status.referenceWeight || 0));
  openSheet({
    root:SHEET_ROOT.picker, zIndex:150, title:"Today's weight",
    build:(body)=>{
      body.appendChild(el(`
        <div>
          <p class="faint small">Last session: ${status.referenceWeight}${units()}${status.suggestedWeight!=null?` · suggested ${status.suggestedWeight}${units()}`:''}</p>
          <div class="stepper">
            <button data-minus>−</button>
            <span class="v" data-value>${weight}${units()}</span>
            <button data-plus>+</button>
          </div>
          <button class="btn" data-use style="width:100%;">Use this weight today</button>
          <button class="btn secondary" data-clear style="width:100%;margin-top:10px;">Clear — decide at the rack</button>
        </div>`));
      const label = q('[data-value]',body);
      const paint = ()=> label.textContent = `${weight}${units()}`;
      q('[data-minus]',body).onclick = ()=>{ weight = Math.max(0, roundTo(weight-step,2)); paint(); };
      q('[data-plus]',body).onclick  = ()=>{ weight = roundTo(weight+step,2); paint(); };
      q('[data-use]',body).onclick = ()=>{
        setLoadPlan(status.exerciseId, {weight, deferred:false});
        closeSheets(); showToast(`Target set: ${weight}${units()}`); renderApp();
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
  const option = (value, label, on)=> `<option value="${value}" ${on?'selected':''}>${escapeHtml(label)}</option>`;

  openSheet({
    root:SHEET_ROOT.form, zIndex:200,
    title: isEdit ? 'Edit exercise' : 'Add an exercise',
    build:(body, sheet)=>{
      body.appendChild(el(`
        <div>
          <p class="faint small" style="margin-bottom:12px;">${isEdit?'Update how this movement is tracked and matched to alternatives.':'It joins your library like any other movement — same tracking, same suggestions.'}</p>
          <div class="field"><label>Name</label><input id="exName" placeholder="e.g. Incline Cable Fly" value="${escapeHtml(ex?ex.name:(opts.prefillName||''))}"></div>
          <div class="grid2">
            <div class="field"><label>Main muscle</label><select id="exMuscle">
              ${MUSCLES.map(m=>option(m,m,(ex?primaryOf(ex):opts.prefillMuscle)===m)).join('')}</select></div>
            <div class="field"><label>Equipment</label><select id="exEquip">
              ${Object.keys(EQUIPMENT_LABELS).map(k=>option(k,EQUIPMENT_LABELS[k],(ex?equipOf(ex):'other')===k)).join('')}</select></div>
          </div>
          <div class="grid2">
            <div class="field"><label>Movement type</label><select id="exPattern">
              ${Object.keys(PATTERN_LABELS).map(p=>option(p,PATTERN_LABELS[p].replace(/^./,c=>c.toUpperCase()),(ex?patternOf(ex):'other')===p)).join('')}</select></div>
            <div class="field"><label>Effort</label><select id="exTier">
              ${option('compound','Compound (multi-joint)',(ex?tierOf(ex):'compound')==='compound')}
              ${option('isolation','Isolation (single-joint)',(ex?tierOf(ex):'compound')==='isolation')}</select></div>
          </div>
          <div class="field"><label>How is it measured?</label><select id="exMetric" ${metricLocked?'disabled':''}>
            ${Object.keys(METRIC_LABELS).map(k=>option(k,METRIC_LABELS[k],(ex?metricOf(ex):'weight_reps')===k)).join('')}</select>
            ${metricLocked?'<p class="faint small" style="margin-top:6px;">Locked because this exercise already has logged sets.</p>':''}</div>
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

      q('[data-save]',body).onclick = ()=>{
        const name = q('#exName',body).value.trim();
        if(!name){ showToast('Give it a name'); return; }
        if(DATA.exercises.some(e=>e.name.toLowerCase()===name.toLowerCase() && (!ex || e.id!==ex.id))){
          showToast('You already have that exercise'); return;
        }
        const primary = q('#exMuscle',body).value;
        const fields = {
          name, primary, muscleGroup:primary,
          secondary:[...selected].filter(m=>m!==primary),
          pattern:q('#exPattern',body).value,
          equipment:q('#exEquip',body).value,
          equipmentNote:q('#exNote',body).value.trim(),
          tier:q('#exTier',body).value,
          metric:q('#exMetric',body).value,
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
      if(deleteBtn) deleteBtn.onclick = ()=>{
        if(hasHistory(ex.id)){ showToast("Can't delete — you have sets logged for this"); return; }
        confirmAction(`Remove ${ex.name} from your library?`, 'Remove', ()=>{
          DATA.exercises = DATA.exercises.filter(e=>e.id!==ex.id);
          Object.values(DATA.splits).forEach(split=> DAY_KEYS.forEach(dk=>{
            split.days[dk].exercises = split.days[dk].exercises.filter(r=>r.exerciseId!==ex.id);
          }));
          DATA.logs.forEach(log=>{ if(Array.isArray(log.plan)) log.plan = log.plan.filter(r=>r.exerciseId!==ex.id); });
          saveData(DATA);
          closeSheets();
          showToast('Removed');
          renderApp();
        });
      };
    }
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
          row.exerciseId = alt.ex.id;
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
          onPick:(id)=>{ row.exerciseId = id; showToast('Exercise swapped 🔁'); afterChange(); }
        });
      };
      body.appendChild(browse);
    }
  });
}

/* ------------------------------ Split ------------------------------ */
function renderSplitScreen(){
  const wrap = el(`<div></div>`);
  const today = weekdayKey();
  wrap.appendChild(el(`
    <div style="margin-bottom:14px;">
      <h3 style="margin-bottom:6px;">Weekly split · ${escapeHtml(activeSplit().label)}</h3>
      <p class="faint small">Edit any day below, or load a preset to replace the whole week. Home and a workout already in progress follow it.</p>
    </div>`));

  DAY_ORDER.forEach(dk=>{
    const day = splitDays()[dk];
    const names = day.exercises.map(r=>{
      const nm = (getExercise(r.exerciseId)||{}).name;
      return nm ? (r.oftenDoneAsDropSet ? `${nm} 🔻` : nm) : null;
    }).filter(Boolean);
    const muscles = [...new Set(day.exercises.map(r=>primaryOf(getExercise(r.exerciseId))).filter(m=>m&&m!=='Other'))];
    const supersetCount = new Set(day.exercises.filter(r=>r.supersetId).map(r=>r.supersetId)).size;
    const card = el(`
      <div class="day-card ${dk===today?'today':''}">
        <div class="row between">
          <div style="min-width:0;">
            <div class="dayname">${DAY_LABELS[dk]} ${dk===today?'<span class="tag" style="border-color:var(--accent);color:var(--accent);">Today</span>':''}</div>
            <div class="faint small" style="margin-top:3px;">${escapeHtml(day.name)} · ${day.exercises.length ? day.exercises.length+' exercises' : 'rest day'}${supersetCount?` · 🔗 ${supersetCount} superset${supersetCount>1?'s':''}`:''}</div>
          </div>
          <button class="btn ghost" data-edit>Edit →</button>
        </div>
        ${names.length ? `<div class="exline">${names.map(escapeHtml).join(' · ')}</div>` : ''}
        ${muscles.length ? `<div style="margin-top:8px;">${tagsHtml(muscles)}</div>` : ''}
      </div>`);
    q('[data-edit]',card).onclick = ()=> openDayEditor(dk);
    wrap.appendChild(card);
  });

  wrap.appendChild(el(`<div class="section-title">Split presets</div>`));
  const saveCard = el(`
    <div class="card flat" style="text-align:center;">
      <button class="btn secondary" data-save style="width:100%;">💾 Save as preset</button>
      <p class="faint small" style="margin-top:8px;">Saves the ${escapeHtml(activeSplit().label)} layout you’re editing now.</p>
    </div>`);
  q('[data-save]',saveCard).onclick = openSavePresetSheet;
  wrap.appendChild(saveCard);

  const presets = DATA.presets || [];
  if(!presets.length){
    wrap.appendChild(el(`<p class="faint small" style="text-align:center;margin:0 0 8px;">No presets yet. Save one to reload this split later.</p>`));
  } else {
    const list = el(`<div class="card flat" style="padding:6px 14px;"></div>`);
    presets.forEach(preset=>{
      const days = trainedDayCount(preset.split);
      const row = el(`
        <div class="hist-day">
          <div class="row between" style="align-items:flex-start;gap:8px;">
            <div style="min-width:0;flex:1;cursor:pointer;" data-load>
              <strong>${escapeHtml(preset.name)}</strong>
              ${preset.subtitle?`<div class="faint small">${escapeHtml(preset.subtitle)}</div>`:''}
              <div class="faint small">${days} training day${days===1?'':'s'}</div>
            </div>
            <div class="rowbtns">
              <button class="iconbtn" data-edit title="Rename" aria-label="Rename">${icon('pencil',16)}</button>
              <button class="iconbtn danger" data-del title="Delete">✕</button>
            </div>
          </div>
        </div>`);
      q('[data-load]',row).onclick = ()=> confirmAction('Load this preset? This will replace your current split layout. Workout history, records and weight logs stay as they are.', 'Load', ()=> loadSplitPreset(preset.id));
      q('[data-edit]',row).onclick = (e)=>{ e.stopPropagation(); openEditPresetSheet(preset.id); };
      q('[data-del]',row).onclick = (e)=>{
        e.stopPropagation();
        confirmAction('Delete the preset “'+preset.name+'”? This cannot be undone.', 'Delete', ()=>{
          DATA.presets = DATA.presets.filter(p=>p.id!==preset.id);
          dismissBuiltinPreset(preset);
          saveData(DATA);
          showToast('Preset deleted');
          renderApp();
        });
      };
      list.appendChild(row);
    });
    wrap.appendChild(list);
  }

  return wrap;
}

function openSavePresetSheet(){
  const current = activeSplit();
  openSheet({
    title:'Save as preset',
    build:(body, sheet)=>{
      body.appendChild(el(`
        <div>
          <p class="faint small" style="margin-bottom:12px;">This saves your current split layout so you can reload it later. History and records are not included.</p>
          <div class="field"><label>Preset name</label><input id="presetName" placeholder="e.g. Best Workout" value="${escapeHtml(current.label+' split')}"></div>
          <div class="field"><label>Split description (optional)</label><input id="presetSub" placeholder="e.g. PPL + UL, 5-day bro split" value="${escapeHtml(current.label)}"></div>
          <button class="btn" data-save style="width:100%;">Save preset</button>
        </div>`));
      const nameInput = q('#presetName',body);
      setTimeout(()=> nameInput && nameInput.focus(), 50);
      q('[data-save]',body).onclick = ()=>{
        const name = (q('#presetName',body).value||'').trim();
        if(!name){ showToast('Give the preset a name'); return; }
        const subtitle = (q('#presetSub',body).value||'').trim();
        DATA.presets = DATA.presets || [];
        DATA.presets.unshift({
          id:uid(), name, subtitle,
          split:cloneSplit(current), savedAt:Date.now()
        });
        saveData(DATA);
        sheet.close();
        showToast('Preset saved');
        renderApp();
      };
    }
  });
}
function openEditPresetSheet(presetId){
  const preset = (DATA.presets||[]).find(p=>p.id===presetId);
  if(!preset) return;
  openSheet({
    title:'Edit preset',
    build:(body, sheet)=>{
      body.appendChild(el(`
        <div>
          <div class="field"><label>Preset name</label><input id="presetName" value="${escapeHtml(preset.name)}"></div>
          <div class="field"><label>Split description (optional)</label><input id="presetSub" value="${escapeHtml(preset.subtitle||'')}" placeholder="e.g. PPL + UL"></div>
          <button class="btn" data-save style="width:100%;">Save</button>
        </div>`));
      q('[data-save]',body).onclick = ()=>{
        const name = (q('#presetName',body).value||'').trim();
        if(!name){ showToast('Give the preset a name'); return; }
        preset.name = name;
        preset.subtitle = (q('#presetSub',body).value||'').trim();
        saveData(DATA);
        sheet.close();
        showToast('Preset updated');
        renderApp();
      };
    }
  });
}
function loadSplitPreset(presetId){
  const preset = (DATA.presets||[]).find(p=>p.id===presetId);
  if(!preset || !preset.split) return;
  DATA.splits[DATA.activeSplit] = Object.assign(cloneSplit(preset.split), {label:preset.name});
  syncActiveWorkoutFromSplit({replaceAll:true});
  saveData(DATA);
  showToast(activeWorkoutLog() ? 'Loaded “'+preset.name+'”. Today’s workout updated.' : 'Loaded “'+preset.name+'”');
  renderApp();
}

/* Draft-based editor: nothing is written to DATA until "Save day". */
function openDayEditor(dayKey){
  const splitKey = DATA.activeSplit;
  let draft = clone(splitDays()[dayKey]);
  let dirty = false;
  let selected = new Set(); // indices picked for "group into superset" — editor-only, not persisted
  let openIdx = -1;         // the one expanded row — editor-only, not persisted
  let editorScroll = 0;

  const discard = ()=>{ closeSheets(); renderApp(); };
  const guard = ()=> dirty ? confirmAction('Discard unsaved changes to this day?', 'Discard', discard) : discard();
  const remapSelected = (mapper)=>{
    selected = new Set([...selected].map(mapper).filter(i=>i>=0 && i<draft.exercises.length));
    if(openIdx>=0){
      const next = mapper(openIdx);
      openIdx = (next>=0 && next<draft.exercises.length) ? next : -1;
    }
  };

  function draw(){
    openSheet({
      title: DAY_LABELS[dayKey],
      onRequestClose: guard,
      build:(body, sheet)=>{
        const liveWorkout = activeWorkoutLog();
        const editingLiveDay = !!(liveWorkout && liveWorkout.dayKey===dayKey);
        body.appendChild(el(`
          <div class="day-editor">
            <div class="field day-name"><label>Day name</label><input id="dayName" value="${escapeHtml(draft.name)}" placeholder="e.g. Push, Pull, Rest"></div>
            ${editingLiveDay ? '<p class="day-live">This workout is already going. Saving updates the current split and today’s workout.</p>' : ''}
            <div class="day-editor-bar">
              <span class="day-count">Exercises <span class="count-pill">${draft.exercises.length}</span></span>
              <button class="btn ghost day-copy" data-copy>${icon('copy',16)} Copy day</button>
            </div>
            <p class="day-hint">Tap an exercise to edit it. Tick 2–4 boxes to group a superset.</p>
            <div data-group-bar></div>
            <div class="day-rows" data-rows></div>
            <div class="day-editor-actions">
              <div class="day-action-row">
                <button class="btn secondary day-add" data-add>${icon('plus',16)} Add exercise</button>
                <button class="btn day-save" data-save>${icon('check',16)} Save day</button>
              </div>
              <p class="day-foot">Nothing is saved until you tap Save day.</p>
            </div>
          </div>`));
        q('#dayName',body).oninput = (e)=>{ draft.name = e.target.value; dirty = true; };

        const groupBar = q('[data-group-bar]',body);
        if(selected.size>=2 && selected.size<=4){
          const btn = el(`<button class="btn secondary">${icon('link',16)} Group ${selected.size} exercises into a superset</button>`);
          btn.onclick = ()=>{
            const groupId = uid();
            draft.exercises.forEach((r,i)=>{ if(selected.has(i)) r.supersetId = groupId; });
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
        if(!draft.exercises.length) rowsBox.appendChild(el(`<p class="empty">Rest day — no exercises yet. Add one below, or leave it empty.</p>`));
        const ctx = {
          redraw:()=>{ dirty = true; draw(); },
          markDirty:()=>{ dirty = true; },
          selected,
          remapSelected,
          isOpen:(idx)=> idx===openIdx,
          toggleOpen:(idx)=>{ openIdx = openIdx===idx ? -1 : idx; draw(); },
          toggleSelect:(idx)=>{ selected.has(idx) ? selected.delete(idx) : selected.add(idx); draw(); },
          ungroup:(groupId)=>{ draft.exercises.forEach(r=>{ if(r.supersetId===groupId) r.supersetId=null; }); dirty=true; draw(); },
          removeFromGroup:(idx)=>{
            const gid = draft.exercises[idx].supersetId;
            draft.exercises[idx].supersetId = null;
            const remaining = draft.exercises.filter(r=>r.supersetId===gid);
            if(remaining.length<2) remaining.forEach(r=>r.supersetId=null);
            dirty = true; draw();
          }
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

        q('[data-add]',body).onclick = ()=> openExercisePicker({
          title:`Add to ${DAY_LABELS[dayKey]}`,
          exclude: draft.exercises.map(r=>r.exerciseId),
          onPick:(id)=>{
            draft.exercises.push(newPlanRow(id,{goal:DATA.settings.goal}));
            openIdx = draft.exercises.length-1;
            dirty = true; draw();
          }
        });
        q('[data-copy]',body).onclick = ()=> openCopyDaySheet(dayKey, draft, draw);
        q('[data-save]',body).onclick = ()=>{
          DATA.splits[splitKey].days[dayKey] = draft;
          const refreshed = splitKey===DATA.activeSplit && syncActiveWorkoutFromSplit({dayKey, fromSave:true});
          saveData(DATA);
          closeSheets();
          const live = refreshed && activeWorkoutLog();
          showToast(live ? 'Saved. Today’s workout updated.' : refreshed ? 'Saved. Today’s hit list updated.' : 'Day saved');
          renderApp();
        };
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

/* "3 × 8–12 · RPE 8 · 1:30 rest" — the collapsed row's one-line summary. */
function planRowSummary(row, metric){
  const range = row.repsMin===row.repsMax ? `${row.repsMin}` : `${row.repsMin}–${row.repsMax}`;
  const bits = [`${row.sets} × ${range}${metric==='time'?'s':''}`];
  if(row.rpe!=null) bits.push(`RPE ${row.rpe}`);
  const rest = restSecondsFor(row);
  const m = Math.floor(rest/60), s = rest%60;
  bits.push(rest===0 ? 'no rest' : rest<60 ? `${rest}s rest` : s ? `${m}:${String(s).padStart(2,'0')} rest` : `${m} min rest`);
  if(row.oftenDoneAsDropSet) bits.push('drop set');
  return bits.join(' · ');
}

/* One editable row inside the day editor. opts.inGroup adds a "remove from
   superset" icon; the checkbox is used to pick rows for grouping. */
function planRowEditor(row, idx, draft, ctx, opts){
  opts = opts || {};
  const redraw = ctx.redraw, markDirty = ctx.markDirty;
  const ex = getExercise(row.exerciseId);
  const metric = metricOf(ex);
  const isSelected = ctx.selected.has(idx);
  const isOpen = ctx.isOpen(idx);
  const node = el(`
    <div class="plan-row ${isSelected?'selected':''} ${isOpen?'open':''}">
      <div class="plan-head" data-toggle role="button" tabindex="0" aria-expanded="${isOpen}">
        <label class="plan-check">
          <input type="checkbox" class="row-select" data-select ${isSelected?'checked':''} title="Select for superset" aria-label="Select for superset">
        </label>
        <span class="plan-idx">${idx+1}</span>
        <div class="plan-copy">
          <div class="nm">${escapeHtml(ex ? ex.name : 'Unknown exercise')}</div>
          <div class="plan-summary" data-summary>${escapeHtml(planRowSummary(row, metric))}</div>
        </div>
        <span class="plan-chev" aria-hidden="true">${icon('chevronDown',18)}</span>
      </div>
      <div class="plan-body">
      ${ex ? `<div class="plan-sub">${escapeHtml(exerciseSubtitle(ex))}</div>` : ''}
      <div class="plan-metrics">
        <div><label>Sets</label><input type="number" min="1" inputmode="numeric" value="${row.sets}" data-field="sets"></div>
        <div><label>${metric==='time'?'Min sec':'Min reps'}</label><input type="number" min="1" inputmode="numeric" value="${row.repsMin}" data-field="repsMin"></div>
        <div><label>${metric==='time'?'Max sec':'Max reps'}</label><input type="number" min="1" inputmode="numeric" value="${row.repsMax}" data-field="repsMax"></div>
        <div><label>RPE</label><input type="number" min="5" max="10" step="0.5" inputmode="decimal" value="${row.rpe!=null?row.rpe:''}" data-field="rpe" placeholder="—"></div>
      </div>
      <div class="plan-extra">
        <div class="field" style="margin:0;"><label>Note</label><input value="${escapeHtml(row.notes||'')}" data-field="notes" placeholder="e.g. slow negatives"></div>
        <div class="field" style="margin:0;"><label>Rest (sec)</label><input type="number" min="0" inputmode="numeric" value="${row.restSeconds!=null?row.restSeconds:''}" data-field="restSeconds" placeholder="${defaultRestSeconds()}"></div>
      </div>
      <label class="plan-drop">
        <span>Often done as a drop set <span class="hint">· hint only</span></span>
        <input type="checkbox" class="switch" data-often-drop ${row.oftenDoneAsDropSet?'checked':''}>
      </label>
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

  const summary = q('[data-summary]',node);
  const refreshSummary = ()=>{ summary.textContent = planRowSummary(row, metric); };
  const head = q('[data-toggle]',node);
  head.onclick = (e)=>{ if(!e.target.closest('.plan-check')) ctx.toggleOpen(idx); };
  head.onkeydown = (e)=>{
    if(e.target!==head || (e.key!=='Enter' && e.key!==' ')) return;
    e.preventDefault(); ctx.toggleOpen(idx);
  };
  q('[data-select]',node).onchange = ()=> ctx.toggleSelect(idx);
  q('[data-often-drop]',node).onchange = (e)=>{ row.oftenDoneAsDropSet = e.target.checked; markDirty(); refreshSummary(); };
  const ungroupOneBtn = q('[data-ungroup-one]',node);
  if(ungroupOneBtn) ungroupOneBtn.onclick = ()=> ctx.removeFromGroup(idx);

  qa('input[data-field]',node).forEach(input=> input.oninput = ()=>{
    const field = input.dataset.field;
    if(field==='notes'){ row.notes = input.value; markDirty(); return; }
    if(field==='rpe'){
      const value = parseFloat(input.value);
      row.rpe = isNaN(value) ? null : Math.min(10, Math.max(5, value));
      markDirty(); refreshSummary(); return;
    }
    if(field==='restSeconds'){
      const raw = input.value.trim();
      row.restSeconds = raw==='' ? null : Math.max(0, parseInt(raw,10)||0);
      markDirty(); refreshSummary(); return;
    }
    const value = parseInt(input.value,10);
    if(isNaN(value) || value<1) return;
    row[field] = value; markDirty(); refreshSummary();
  });
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
    onPick:(id)=>{ row.exerciseId = id; redraw(); }
  });
  return node;
}

function openCopyDaySheet(sourceKey, draft, onDone){
  openSheet({
    root:SHEET_ROOT.picker, zIndex:150, title:`Copy ${DAY_LABELS[sourceKey]}`,
    build:(body, sheet)=>{
      body.appendChild(el(`<p class="faint small" style="margin-bottom:12px;">Copies what's on screen right now (name, exercises, sets, reps, RPE and notes) onto another day. That day is saved immediately.</p>`));
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
/* Exercise library: no longer a bottom-nav tab (the Split tab's exercise
   picker already covers browsing/searching/adding). This is now a sheet
   reached from Settings → Manage exercises, kept for the one thing the
   picker can't do: view, edit or delete an exercise you already own,
   including ones with no logged history and nothing in any split. */
let openMuscleGroup = null;
let librarySearch = '';
function openLibrarySheet(){
  openSheet({
    title:'Exercise library',
    build:(body)=>{
      const header = el(`
        <div class="row between" style="margin-bottom:12px;">
          <p class="faint small" style="margin:0;">${DATA.exercises.length} movements. Built-in ones can be edited; only exercises you added can be deleted.</p>
          <button class="btn ghost" data-add>＋ Add</button>
        </div>`);
      body.appendChild(header);
      body.appendChild(el(searchFieldHtml('librarySearch','Search exercises, muscles or equipment…', librarySearch)));
      const results = el(`<div></div>`);
      body.appendChild(results);
      const redraw = ()=> paintLibrary(results, redraw);
      q('[data-add]',header).onclick = ()=> openExerciseFormSheet({onSaved:(id)=>{ openMuscleGroup = primaryOf(getExercise(id)); redraw(); }});
      redraw();
      const input = q('#librarySearch',body);
      input.oninput = ()=>{ librarySearch = input.value; redraw(); };
    },
    onClosed:()=>{ librarySearch=''; renderApp(); }
  });
}
function libraryRow(ex, redraw){
  const item = el(`
    <div class="ex-list-item">
      <div style="min-width:0;">
        <div>${escapeHtml(ex.name)}</div>
        <div class="meta">${escapeHtml(exerciseSubtitle(ex))}${ex.equipmentNote?' · '+escapeHtml(ex.equipmentNote):''}</div>
      </div>
      <button class="btn ghost" data-view>View →</button>
    </div>`);
  q('[data-view]',item).onclick = ()=> openExerciseDetailSheet(ex.id, {root:SHEET_ROOT.picker, zIndex:150, onClosed:redraw});
  return item;
}
function addMissingBox(term, label, redraw){
  const box = el(`
    <div class="notfound">
      <p>${escapeHtml(label)}</p>
      <button class="btn secondary" data-add>＋ Add "${escapeHtml(term)}" to my library</button>
    </div>`);
  q('[data-add]',box).onclick = ()=> openExerciseFormSheet({
    prefillName:term,
    onSaved:(id)=>{ librarySearch=''; openMuscleGroup = primaryOf(getExercise(id)); redraw(); }
  });
  return box;
}
function paintLibrary(container, redraw){
  container.innerHTML = '';
  const term = librarySearch.trim();
  if(term){
    const hits = searchExercises(term);
    if(hits.length){
      const card = el(`<div class="card flat" style="padding:6px 14px;"></div>`);
      hits.forEach(ex=> card.appendChild(libraryRow(ex, redraw)));
      container.appendChild(card);
      container.appendChild(addMissingBox(term, 'Not the one you meant?', redraw));
    } else {
      container.appendChild(addMissingBox(term, `No match for "${term}".`, redraw));
    }
    return;
  }
  REGION_ORDER.forEach(region=>{
    const muscles = MUSCLES.filter(m=>MUSCLE_REGION[m]===region && DATA.exercises.some(e=>primaryOf(e)===m));
    if(!muscles.length) return;
    container.appendChild(el(`<div class="region-label">${region}</div>`));
    muscles.forEach(muscle=>{
      const list = exercisesForMuscle(muscle);
      const isOpen = openMuscleGroup===muscle;
      const head = el(`
        <div class="accordion-head" style="margin-bottom:${isOpen?'0':'10px'}">
          <span style="font-weight:700;">${escapeHtml(muscle)}</span>
          <span class="faint small">${list.length} ${isOpen?'▲':'▼'}</span>
        </div>`);
      head.onclick = ()=>{ openMuscleGroup = isOpen ? null : muscle; redraw(); };
      container.appendChild(head);
      if(isOpen){
        const body = el(`<div class="accordion-body" style="margin-bottom:10px;"></div>`);
        list.forEach(ex=> body.appendChild(libraryRow(ex, redraw)));
        container.appendChild(body);
      }
    });
  });
}

function sessionBestValue(sets, metric){
  const higher = betterIsHigher(metric);
  const normal = sets.filter(s=>!s.isDropSet);
  if(!normal.length) return null;
  const best = normal.reduce((b,s)=>{
    const a = setPerformanceScore(s,metric), c = setPerformanceScore(b,metric);
    return (higher ? a>c : a<c) ? s : b;
  }, normal[0]);
  if(metric==='weight_reps') return roundTo(estimateOneRepMax(best.weight,best.reps));
  if(metric==='reps_only')   return best.reps;
  if(metric==='time')        return best.duration;
  return best.weight; // assisted
}
function sessionChipText(sets, metric){
  const value = sessionBestValue(sets, metric);
  if(value==null) return '🔻 Drop set';
  if(metric==='weight_reps') return `e1RM ${value}${units()}`;
  if(metric==='reps_only')   return `${value} reps`;
  if(metric==='time')        return `${value}s`;
  return `${value}${units()} assist`;
}

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
                <strong>${formatLogDate(session.date)}</strong> ${session.sets.some(s=>s.isPR)?'<span class="trophy">🏆</span>':''}
                <div class="faint small">${session.sets.map(s=>setValueText(s,metric)).join(', ')}</div>
              </div>
              <span class="chip">${sessionChipText(session.sets, metric)}</span>
            </div>
          </div>`));
      });

      const canvas = q('[data-chart]',body);
      if(canvas && window.Chart){
        const ordered = [...sessions].reverse();
        const styles = getComputedStyle(document.documentElement);
        const axisLabel = metric==='weight_reps' ? `Estimated 1RM (${units()})`
          : metric==='reps_only' ? 'Best reps' : metric==='time' ? 'Best hold (s)' : `Assistance used (${units()})`;
        new Chart(canvas.getContext('2d'), {
          type:'line',
          data:{ labels: ordered.map(s=>s.date.slice(5)),
                 datasets:[{label:axisLabel, data: ordered.map(s=>sessionBestValue(s.sets, metric)),
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

/* ------------------------------ Records ------------------------------ */
let recordsMuscle = null;
function renderRecordsScreen(){
  if(recordsMuscle) return renderRecordsMuscleScreen(recordsMuscle);
  const wrap = el(`<div></div>`);
  wrap.appendChild(el(`<h3 style="margin-bottom:14px;">Your records</h3>`));
  if(!appHasAnyPrs()){
    wrap.appendChild(el(`<div class="card"><p class="empty">No PRs yet — log a set on Home and your best lifts will land here.</p></div>`));
    return wrap;
  }
  const list = el(`<div></div>`);
  MUSCLES.forEach(muscle=>{
    const trained = exercisesWithPrs(muscle);
    const highlight = trained[0];
    const moments = highlight ? prMomentsForExercise(highlight.id) : [];
    const current = moments.length ? moments[moments.length-1] : null;
    const countText = trained.length
      ? `${trained.length} exercise${trained.length>1?'s':''} with PRs`
      : 'No PRs yet';
    const bestLine = current
      ? `Best: ${highlight.name} – ${formatPrValue(current.set, metricOf(highlight))}`
      : '';
    const row = el(`
      <div class="day-card">
        <div class="dayname">${escapeHtml(muscle)}</div>
        <div class="faint small" style="margin-top:4px;">${escapeHtml(countText)}</div>
        ${bestLine?`<div class="exline">${escapeHtml(bestLine)}</div>`:''}
      </div>`);
    row.style.cursor = 'pointer';
    row.onclick = ()=>{ recordsMuscle = muscle; renderApp(); };
    list.appendChild(row);
  });
  wrap.appendChild(list);
  return wrap;
}
function renderRecordsMuscleScreen(muscle){
  const wrap = el(`<div></div>`);
  const head = el(`
    <div class="row between" style="margin-bottom:14px;align-items:flex-start;">
      <div>
        <button class="btn ghost" data-back style="padding:0 0 8px;margin-left:-4px;">← Muscles</button>
        <h3>${escapeHtml(muscle)}</h3>
      </div>
    </div>`);
  q('[data-back]',head).onclick = ()=>{ recordsMuscle = null; renderApp(); };
  wrap.appendChild(head);

  const trained = exercisesWithPrs(muscle);
  const card = el(`<div class="card flat" style="padding:6px 14px;"></div>`);
  if(!trained.length){
    card.appendChild(el(`<p class="empty">No records yet for ${escapeHtml(muscle)}. Start training to see your PRs here.</p>`));
  } else {
    trained.forEach(ex=>{
      const moments = prMomentsForExercise(ex.id);
      const current = moments[moments.length-1];
      const row = el(`
        <div class="ex-list-item">
          <div>${escapeHtml(ex.name)}</div>
          <span class="chip">${escapeHtml(formatPrValue(current.set, metricOf(ex)))}</span>
        </div>`);
      row.onclick = ()=> openRecordsPrSheet(ex.id);
      card.appendChild(row);
    });
  }
  wrap.appendChild(card);
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
function prDeltaText(prev, cur, metric){
  if(!prev) return 'First PR';
  const a = prev.set, b = cur.set, parts = [];
  const reps = (n)=> prSignedText(n, Math.abs(n)===1 ? ' rep' : ' reps');
  if(metric==='weight_reps' || metric==='assisted'){
    const dw = (b.weight||0)-(a.weight||0), dr = (b.reps||0)-(a.reps||0);
    if(dw) parts.push(prSignedText(dw, ` ${units()}${metric==='assisted'?' assist':''}`));
    if(dr) parts.push(reps(dr));
  } else if(metric==='reps_only'){
    const dr = (b.reps||0)-(a.reps||0);
    if(dr) parts.push(reps(dr));
  } else {
    const dd = (b.duration||0)-(a.duration||0);
    if(dd) parts.push(prSignedText(dd, 's'));
  }
  return parts.length ? parts.join(' · ') : 'Matched';
}
function prChartPoint(moment, metric){
  const set = moment.set;
  if(metric==='weight_reps') return roundTo(estimateOneRepMax(set.weight, set.reps));
  if(metric==='reps_only') return set.reps;
  if(metric==='time') return set.duration;
  return set.weight;
}
function prOverallGain(moments, metric){
  if(moments.length<2) return {value:'—', label:'Progress'};
  const first = prChartPoint(moments[0], metric), last = prChartPoint(moments[moments.length-1], metric);
  if(metric==='weight_reps') return {value:prSignedText(last-first, ` ${units()}`), label:'Est. 1RM gain'};
  if(metric==='reps_only')   return {value:prSignedText(last-first, ''), label:'Reps gained'};
  if(metric==='time')        return {value:prSignedText(last-first, 's'), label:'Hold gained'};
  return {value:prSignedText(last-first, ` ${units()}`), label:'Assist change'};
}
function renderPrLogTree(moments, metric, rerender){
  const shared = {open:prTreeOpen, unit:'PR', rerender};
  const newest = moments[0];
  const days = (parent, rows)=> rows.forEach(moment=>{
    const idx = moments.indexOf(moment);
    parent.appendChild(el(`
      <div class="hist-day pr-row${moment===newest?' current':''}">
        <div class="pr-when">
          <strong>${escapeHtml(prDayLabel(moment.date))}</strong>
          <div class="faint small">${moment===newest?'<span class="trophy">🏆</span> Current · ':''}${escapeHtml(prDeltaText(moments[idx+1], moment, metric))}</div>
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
      const gain = prOverallGain(moments, metric);
      const sinceDays = daysInclusive(current.date, todayKey()) - 1;
      const oneRm = metric==='weight_reps' ? ` · ≈ ${prChartPoint(current, metric)} ${units()} est. 1RM` : '';
      const axisLabel = metric==='weight_reps' ? `Estimated 1RM (${units()})`
        : metric==='reps_only' ? 'Best reps' : metric==='time' ? 'Longest hold (s)' : `Assistance (${units()}) · lower is better`;
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
          ${moments.length>1 ? `
          <div class="card flat">
            <p class="section-title" style="margin-top:0;">Progress</p>
            <p class="small muted" style="margin-bottom:4px;">${escapeHtml(axisLabel)}</p>
            <div class="chart-box"><canvas data-chart></canvas></div>
          </div>` : ''}
          <div class="section-title">PR log</div>
          <div data-prs></div>
        </div>`));
      prTreeOpen = {year:current.date.slice(0,4), month:current.date.slice(0,7), week:weekStartKey(current.date)};
      const list = q('[data-prs]',body);
      const drawLog = ()=>{
        list.innerHTML = '';
        list.appendChild(renderPrLogTree(moments.slice().reverse(), metric, drawLog));
      };
      drawLog();
      const canvas = q('[data-chart]',body);
      if(canvas){
        const points = moments.map(m=> prChartPoint(m, metric));
        const lo = Math.min(...points), hi = Math.max(...points);
        const pad = (hi-lo)*0.25 || hi*0.1 || 1;
        try{
          paintHistoryChart(canvas, {
            type:'line',
            labels: moments.map(m=>{ const d = parseDateKey(m.date); return `${d.getDate()} ${d.toLocaleDateString(undefined,{month:'short'})}`; }),
            data: points,
            yMin: Math.max(0, Math.floor(lo-pad)), yMax: Math.ceil(hi+pad),
            unit: metric==='time' ? 's' : metric==='reps_only' ? 'reps' : units()
          });
          bindHistoryChart(canvas);
        }catch(err){ console.error(APP_NAME+': PR chart failed', err); }
      }
    }
  });
}

/* ------------------------------ History ------------------------------ */
/* In-memory only. Workout rows still come from DATA.logs on every render. */
let historyFilter = 'all';
let historyCharts = [];
let afterHistoryRender = [];
let historyTreeOpen = {year:null, month:null, week:null};
let weightLogOpen = false;
let pastWorkoutsOpen = false;
let weightTreeOpen = {year:null, month:null, week:null};

function destroyHistoryCharts(){
  historyCharts.forEach(chart=>{ try{ chart.destroy(); }catch(e){} });
  historyCharts = [];
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
function monthTickLabel(ym){
  return ymDate(ym).toLocaleDateString(undefined, {month:'short', year:'2-digit'});
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
  return /^\d{4}-\d{2}$/.test(filter||'') ? filter : 'all';
}
function historyMonthOptions(logs){
  const months = new Set(logs.map(l=>l.date.slice(0,7)));
  if(/^\d{4}-\d{2}$/.test(historyFilter)) months.add(historyFilter);
  return [...months].sort((a,b)=> b.localeCompare(a));
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
function daysInclusive(from, to){
  return Math.max(1, Math.round((parseDateKey(to)-parseDateKey(from))/86400000)+1);
}
function logsVolumeLoad(logs){
  return logs.reduce((sum,log)=> sum + (log.sets||[]).reduce((s,set)=> s+setVolumeLoad(set), 0), 0);
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
function historyInsights(logs, filter){
  const window = historyWindow(filter, logs);
  const days = daysInclusive(window.start, window.end);
  const weeks = Math.max(days/7, 1);
  const volume = logsVolumeLoad(logs);
  const prevEnd = shiftDateKey(window.start, -1);
  const prevStart = shiftDateKey(window.start, -days);
  const prevVolume = logsVolumeLoad(loggedWorkouts().filter(l=>l.date>=prevStart && l.date<=prevEnd));
  const sets = logs.flatMap(l=>l.sets||[]);
  const muscleTarget = TRAINING.weeklyEffectiveSetTarget * weeks;
  const muscles = muscleWorkForSets(sets).filter(r=>r.effectiveSets>=0.2).slice(0,8);
  const under = muscles.filter(r=>r.effectiveSets < muscleTarget*0.5).slice(0,2).map(r=>r.muscle);
  return {
    streak: currentStreakDays(),
    sessionsPerWeek: logs.length/weeks,
    volumeDeltaPct: prevVolume>0 ? ((volume-prevVolume)/prevVolume)*100 : null,
    prs: sets.filter(s=>s.isPR).length,
    muscles,
    muscleTarget,
    underNote: under.length
      ? under.join(' and ')+(under.length===1?' is':' are')+' well under the weekly target.'
      : ''
  };
}
function historyFrequency(logs, filter){
  const range = historyRangeKey(filter);
  if(!range){
    if(!logs.length) return {labels:[], data:[]};
    const keys = logs.map(l=>l.date.slice(0,7)).sort();
    if(keys[0]===keys[keys.length-1]) return dailyFrequency(logs, keys[0]);
    const labels = [], data = [];
    let cursor = keys[0], guard = 0;
    while(cursor<=keys[keys.length-1] && guard<240){
      labels.push(monthTickLabel(cursor));
      data.push(logs.filter(l=>l.date.slice(0,7)===cursor).length);
      cursor = shiftMonthKey(cursor, 1);
      guard++;
    }
    return {labels, data};
  }
  return dailyFrequency(logs, range);
}
function dailyFrequency(logs, ym){
  let lastDay = daysInMonth(ym);
  const today = todayKey();
  if(ym===today.slice(0,7)) lastDay = Math.min(lastDay, parseInt(today.slice(8),10));
  const labels = [], data = [];
  for(let day=1; day<=lastDay; day++){
    const ds = ym+'-'+String(day).padStart(2,'0');
    labels.push(String(day));
    data.push(logs.filter(l=>l.date===ds).length);
  }
  return {labels, data};
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
function formatVolumeDelta(pct){
  if(pct==null || !isFinite(pct)) return '—';
  const n = Math.round(pct);
  return (n>0?'+':'')+n+'%';
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
function historyRangeSelectHtml(months){
  return `<select id="historyRange" aria-label="Workout summary range">
    <option value="all" ${historyFilter==='all'?'selected':''}>All Time</option>
    <option value="this" ${historyFilter==='this'?'selected':''}>This Month</option>
    <option value="last" ${historyFilter==='last'?'selected':''}>Last Month</option>
    ${months.map(ym=>`<option value="${ym}" ${historyFilter===ym?'selected':''}>${escapeHtml(monthTitle(ym))}</option>`).join('')}
  </select>`;
}
function renderHistorySummaryCard(logs, filter){
  const insight = historyInsights(logs, filter);
  const freq = historyFrequency(logs, filter);
  const card = el(`
    <div class="card">
      <p class="section-title" style="margin-top:0;">Workout summary</p>
      <div class="field" style="margin:0 0 12px;">${historyRangeSelectHtml(historyMonthOptions(loggedWorkouts()))}</div>
      ${statGridHtml([
        {value:String(insight.streak), label:'Streak'},
        {value:String(roundTo(insight.sessionsPerWeek,1)), label:'Per week'},
        {value:formatVolumeDelta(insight.volumeDeltaPct), label:'vs last'},
        {value:String(insight.prs), label:'PRs'}
      ])}
      <div style="margin-top:16px;">
        <p class="small muted" style="margin-bottom:4px;">Days in the gym</p>
        <div class="chart-box"><canvas data-chart="freq"></canvas></div>
      </div>
      <div style="margin-top:14px;">
        <p class="small muted" style="margin-bottom:4px;">Muscle targeting</p>
        ${historyMuscleRowsHtml(insight.muscles, insight.muscleTarget)}
        ${insight.underNote?`<p class="faint small" style="margin-top:8px;">${escapeHtml(insight.underNote)}</p>`:''}
      </div>
    </div>`);
  q('#historyRange', card).onchange = (e)=>{
    historyFilter = normalizeHistoryFilter(e.target.value);
    historyTreeOpen = {year:null, month:null, week:null};
    pastWorkoutsOpen = false;
    renderApp();
  };
  afterHistoryRender.push(()=>{
    const canvas = q('[data-chart="freq"]', card);
    if(!canvas) return;
    try{ paintHistoryChart(canvas, {type:'bar', labels:freq.labels, data:freq.data, unit:'workouts'}); bindHistoryChart(canvas); }
    catch(err){ console.error(APP_NAME+': history chart failed', err); }
  });
  return card;
}
function historyWorkoutRow(log){
  const d = parseDateKey(log.date);
  const when = `${d.getDate()} ${d.toLocaleDateString(undefined,{month:'short'})}, ${d.toLocaleDateString(undefined,{weekday:'short'})}`;
  const dayName = log.planName || (splitDays()[log.dayKey||weekdayKey(d)]||{}).name || '';
  const dur = sessionDurationMs(log);
  const row = el(`
    <div class="hist-day" style="cursor:pointer;">
      <strong>${escapeHtml(when)}</strong>${dayName?` · ${escapeHtml(dayName)}`:''} ${log.sets.some(s=>s.isPR)?'<span class="trophy">🏆</span>':''}
      <div class="faint small">${log.sets.length} sets · ≈ ${roundTo(totalEffectiveSets(log.sets))} effective${dur>0?` · ${formatDuration(dur)}`:''}</div>
    </div>`);
  row.onclick = ()=> openHistoryDaySheet(log.date);
  return row;
}
function recentWorkoutRow(log, isLatest){
  const d = parseDateKey(log.date);
  const dayName = log.planName || (splitDays()[log.dayKey||weekdayKey(d)]||{}).name || 'Workout';
  const dur = sessionDurationMs(log);
  const ago = daysInclusive(log.date, todayKey()) - 1;
  const when = ago===0 ? 'Today' : ago===1 ? 'Yesterday' : d.toLocaleDateString(undefined,{weekday:'long'});
  const row = el(`
    <div class="recent-row">
      <div class="date-tile${isLatest?' latest':''}">
        <span class="dd">${d.getDate()}</span>
        <span class="mm">${escapeHtml(d.toLocaleDateString(undefined,{month:'short'}))}</span>
      </div>
      <div class="recent-main">
        <div class="nm">${escapeHtml(dayName)}</div>
        <div class="faint small">${escapeHtml(when)} · ${log.sets.length} sets · ≈ ${roundTo(totalEffectiveSets(log.sets))} effective${dur>0?` · ${escapeHtml(formatDuration(dur))}`:''}</div>
      </div>
      ${log.sets.some(s=>s.isPR)?'<span class="trophy">🏆</span>':''}
      <span class="recent-go">${icon('chevronRight',18)}</span>
    </div>`);
  row.onclick = ()=> openHistoryDaySheet(log.date);
  return row;
}
function appendHistoryDays(parent, logs){
  logs.forEach(log=> parent.appendChild(historyWorkoutRow(log)));
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
function renderHistoryWeekLevel(parent, logs){
  renderHistoryGroups(parent, logs, {
    level:'week', keyOf:l=>weekStartKey(l.date), title:g=>weekTitle(g.key), below:appendHistoryDays
  });
}
function renderHistoryMonthLevel(parent, logs, titled){
  renderHistoryGroups(parent, logs, {
    level:'month', keyOf:l=>l.date.slice(0,7),
    title:g=> titled ? monthNameOnly(g.key) : monthTitle(g.key),
    below:renderHistoryWeekLevel, clear:['week']
  });
}
function renderHistoryWorkoutTree(logs){
  const box = el(`<div class="card hist-tree"></div>`);
  renderHistoryGroups(box, logs, {
    level:'year', keyOf:l=>l.date.slice(0,4), title:g=>g.key,
    below:(p, rows)=> renderHistoryMonthLevel(p, rows, true),
    skipBelow:(p, rows)=> renderHistoryMonthLevel(p, rows, false),
    clear:['month','week']
  });
  return box;
}
function renderHistoryScreen(){
  historyFilter = normalizeHistoryFilter(historyFilter);
  const wrap = el(`<div></div>`);
  const allLogs = loggedWorkouts();
  wrap.appendChild(el(`<h3 style="margin-bottom:14px;">History</h3>`));
  wrap.appendChild(renderBodyWeightCard());

  const logs = allLogs.filter(l=>workoutInHistoryFilter(l, historyFilter));
  if(!allLogs.length){
    wrap.appendChild(el(`<div class="section-title">Recent workouts</div>`));
    wrap.appendChild(el(`<div class="card"><p class="empty">No workouts logged yet. Head to Home and start your first session.</p></div>`));
    return wrap;
  }

  wrap.appendChild(renderHistorySummaryCard(logs, historyFilter));
  wrap.appendChild(el(`<div class="section-title">Recent workouts</div>`));
  if(!logs.length){
    wrap.appendChild(el(`<div class="card"><p class="empty">No workouts recorded for this month.</p></div>`));
    return wrap;
  }
  const recent = logs.slice(0,3), past = logs.slice(3);
  const recentCard = el(`<div class="card recent-card"></div>`);
  recent.forEach((log,i)=> recentCard.appendChild(recentWorkoutRow(log, i===0)));
  wrap.appendChild(recentCard);
  if(past.length){
    const toggle = el(`
      <button class="btn secondary past-toggle">
        <span>${pastWorkoutsOpen ? 'Hide past workouts' : `Past workouts (${past.length})`}</span>
        ${icon(pastWorkoutsOpen ? 'chevronUp' : 'chevronDown', 18)}
      </button>`);
    toggle.onclick = ()=>{ pastWorkoutsOpen = !pastWorkoutsOpen; renderApp(); };
    wrap.appendChild(toggle);
    if(pastWorkoutsOpen) wrap.appendChild(renderHistoryWorkoutTree(past));
  }
  return wrap;
}
function bodyWeightRow(entry){
  const row = el(`
    <div class="hist-day" style="cursor:pointer;">
      <div class="row between">
        <div>
          <strong>${escapeHtml(formatBodyWeightLine(entry))}</strong>
          ${entry.note?`<div class="faint small">${escapeHtml(entry.note)}</div>`:''}
        </div>
        <button class="btn danger" data-del title="Delete">✕</button>
      </div>
    </div>`);
  row.onclick = ()=> openLogWeightSheet(entry);
  q('[data-del]',row).onclick = (event)=>{
    event.stopPropagation();
    confirmAction('Delete this weigh-in?', 'Delete', ()=>{
      deleteBodyWeightEntry(entry.id);
      renderApp();
    });
  };
  return row;
}
function appendBodyWeightDays(parent, entries){
  entries.forEach(entry=> parent.appendChild(bodyWeightRow(entry)));
}
function renderWeightWeekLevel(parent, entries){
  renderHistoryGroups(parent, entries, {
    level:'week', keyOf:e=>weekStartKey(e.date), title:g=>weekTitle(g.key),
    below:appendBodyWeightDays, open:weightTreeOpen, unit:'weigh-in'
  });
}
function renderWeightMonthLevel(parent, entries, titled){
  renderHistoryGroups(parent, entries, {
    level:'month', keyOf:e=>e.date.slice(0,7),
    title:g=> titled ? monthNameOnly(g.key) : monthTitle(g.key),
    below:renderWeightWeekLevel, clear:['week'], open:weightTreeOpen, unit:'weigh-in'
  });
}
function renderBodyWeightTree(entries){
  const box = el(`<div class="hist-tree" style="margin-top:8px;padding-left:0;padding-right:0;"></div>`);
  renderHistoryGroups(box, entries, {
    level:'year', keyOf:e=>e.date.slice(0,4), title:g=>g.key,
    below:(p, rows)=> renderWeightMonthLevel(p, rows, true),
    skipBelow:(p, rows)=> renderWeightMonthLevel(p, rows, false),
    clear:['month','week'], open:weightTreeOpen, unit:'weigh-in'
  });
  return box;
}
function renderBodyWeightCard(){
  const entries = sortedBodyWeight();
  const latest = entries[0] || null;
  const past = entries.slice(1);
  const card = el(`
    <div class="card">
      <div class="row between" style="margin-bottom:10px;">
        <p class="section-title" style="margin:0;">Body weight</p>
        <button class="btn" data-log style="padding:8px 12px;font-size:13px;">Log weight</button>
      </div>
      ${latest
        ? `<div class="weight-current">Current: ${escapeHtml(formatBodyWeightKg(latest.weight))} <span class="unit">kg</span></div>
           <p class="faint small" style="margin:4px 0 0;">${escapeHtml(formatBodyWeightDate(latest.date))}${latest.note?` · ${escapeHtml(latest.note)}`:''}</p>`
        : `<p class="muted small" style="margin:0;">No weigh-ins yet. Log once a week on your weigh-in day.</p>`}
      <div data-past></div>
    </div>`);
  q('[data-log]',card).onclick = ()=> openLogWeightSheet();
  if(past.length){
    const pastBox = q('[data-past]',card);
    const toggle = el(`<button class="btn secondary" style="width:100%;margin-top:12px;">${weightLogOpen?'Hide past weigh-ins':'Past weigh-ins'}</button>`);
    toggle.onclick = ()=>{ weightLogOpen = !weightLogOpen; renderApp(); };
    pastBox.appendChild(toggle);
    if(weightLogOpen) pastBox.appendChild(renderBodyWeightTree(past));
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
function openHistoryDaySheet(date){
  const log = DATA.logs.find(l=>l.date===date);
  let openEx = null;
  openSheet({
    title: formatLogDate(date),
    build:(body)=>{
      function draw(){
        body.innerHTML = '';
        const byExercise = {};
        log.sets.forEach(set=>{ (byExercise[set.exerciseId] ||= []).push(set); });
        Object.entries(byExercise).forEach(([exerciseId, sets])=>{
          const ex = getExercise(exerciseId);
          const isOpen = openEx === exerciseId;
          const head = el(`
            <div class="accordion-head" style="margin-bottom:${isOpen?'0':'10px'}">
              <span style="font-weight:700;">${escapeHtml(ex?ex.name:'Unknown exercise')}</span>
              <span class="faint small">${sets.length} set${sets.length===1?'':'s'} ${isOpen?'▲':'▼'}</span>
            </div>`);
          head.onclick = ()=>{ openEx = isOpen ? null : exerciseId; draw(); };
          body.appendChild(head);
          if(isOpen){
            const box = el(`<div class="accordion-body" style="margin-bottom:10px;"></div>`);
            setRowsInto(box, sets, metricOf(ex), {});
            body.appendChild(box);
          }
        });
        const work = muscleWorkCard(log.sets, 'Muscle work');
        if(work) body.appendChild(work);
      }
      draw();
    }
  });
}

/* ------------------------------ Settings ------------------------------ */
/* Plain-language explanation of §5 training rules. Numbers are read from
   TRAINING and the active goal so the text stays true when settings change. */
function trainingGuideSections(){
  const goal = goalConfig();
  const L = TRAINING.load, E = TRAINING.effortFactor, eq = L.minIncrementByEquip;
  const n = goal.sessionsRequired;
  const goalBlurb = {
    hypertrophy:'Building muscle size. Moderate weights, taken close to failure.',
    strength:'Lifting the heaviest weight you can. Heavy weights with longer rest.',
    endurance:'Muscles that keep going for longer. Lighter weights, more reps.',
  };
  return [
    {key:'overload', title:'How progressive overload works', body:`
      <p>Muscles grow and get stronger when you slowly ask them to do a bit more. ${escapeHtml(APP_NAME)} does it in two steps, one at a time:</p>
      <ol>
        <li><b>Add reps.</b> Keep the same weight and work up to your target reps: ${goal.repsToEarnIncrease}, or the top of the exercise's rep range if that's lower (for example 10 reps in a 6–10 range).</li>
        <li><b>Then add weight.</b> Once you've done that in ${n} session${n>1?'s':''} in a row, the app suggests a little more weight. You can <b>Use</b> it, choose <b>Not today</b>, or <b>Adjust</b> it.</li>
      </ol>
      <p>After the weight goes up your reps drop a little, and you build them back up again. That loop is the whole system.</p>`},
    {key:'qualifying', title:'What is a qualifying session?', body:`
      <p>A past workout for an exercise counts as a qualifying session when:</p>
      <ul>
        <li>at least ${goal.qualifyingSets} working sets (or all your planned sets, if you planned fewer) reached your <b>target reps</b>: ${goal.repsToEarnIncrease} ("Reps before more weight" in Settings → Training), capped at the top of the exercise's rep range,</li>
        <li>at your usual weight or heavier (for assisted exercises: the same assistance or less),</li>
        <li>and on average they felt no harder than Medium. Two Medium sets and one Hard still count; all Hard means the weight is still at your limit.</li>
      </ul>
      <p>Warm-ups and drop sets are ignored. The sessions must be in a row, so one that doesn't qualify resets the count. Today's workout starts counting from tomorrow.</p>
      <p class="guide-eg">Example, 6–10 reps: 80 kg × 10, 10, 10 felt Medium, Medium, Hard qualifies. 80 kg × 10, 9, 8 doesn't yet, so keep adding reps.</p>`},
    {key:'progress', title:'What does "Overload progress 0/2" mean?', body:`
      <p>The first number is how many qualifying sessions you have in a row. The second is how many you need before more weight is suggested.</p>
      <p>Your goal (${escapeHtml(goal.label)}) needs <b>${n}</b>. You can change it in Settings → Training → "Clean sessions needed".</p>
      <p>When the bar fills up, the box changes to "Ready to add load" with a Use button.</p>`},
    {key:'increase', title:'How much weight gets added?', body:`
      <p>Upper-body exercises go up about ${L.increasePctUpper}% and lower-body exercises about ${L.increasePctLower}%, but never less than the smallest jump for the equipment:</p>
      <ul>
        <li>Barbell or Smith machine: ${eq.barbell} kg</li>
        <li>Dumbbell: ${eq.dumbbell} kg · Kettlebell: ${eq.kettlebell} kg</li>
        <li>Cable or machine: ${eq.cable} kg</li>
      </ul>
      <p>The result is rounded to that equipment step, so a 20 kg dumbbell goes to 21 kg. Assisted exercises lower the assistance by ${L.assistanceStepKg} kg instead.</p>`},
    {key:'lower', title:'When does it tell me to lower the weight?', body:`
      <p>When your reps fall below the bottom of the exercise's range, the weight is too heavy for your goal. For example, 82.5 kg × 4 when the range is 6–10.</p>
      <ul>
        <li><b>During the workout</b> the box suggests a lighter weight for your next set straight away. Tap <b>Use</b> and the steppers jump to it.</li>
        <li><b>Next session</b>, if every set last time was below the range, the box opens with "Drop to …".</li>
      </ul>
      <p>The new weight is estimated from your set (using the same estimated one-rep max as PRs), aiming for the bottom of the range, and rounded down to the equipment step. Staying in range matters more than the number on the bar.</p>`},
    {key:'goals', title:'Hypertrophy, Strength and Endurance', body:`
      ${Object.entries(TRAINING.goals).map(([key,g])=>`
        <div class="guide-goal${key===goal.key?' on':''}">
          <b>${escapeHtml(g.label)}</b>${key===goal.key?' <span class="guide-you">Your goal</span>':''}
          <p>${goalBlurb[key]||''} Usually about ${g.repsMin}–${g.repsMax} reps. More weight after ${g.sessionsRequired} clean session${g.sessionsRequired>1?'s':''}.</p>
        </div>`).join('')}
      <p>Your goal also changes how much each set counts toward effective sets. A 4-rep set counts ${TRAINING.repRanges[0].credit.hypertrophy} for Hypertrophy but ${TRAINING.repRanges[0].credit.strength} for Strength. Each exercise's rep range comes from your split, so set it to match your goal.</p>`},
    {key:'effort', title:'Easy, Medium and Hard', body:`
      <ul>
        <li><b>Easy</b>: you could have done 4 or more extra reps. Counts as ${E.easy} of a set.</li>
        <li><b>Medium</b>: about 2–3 reps left. Counts as ${E.med}.</li>
        <li><b>Hard</b>: 0–1 reps left, close to failure. Counts as ${E.hard}.</li>
      </ul>
      <p>Be honest with it. It decides when you're ready for more weight and how much work your muscles really got.</p>`},
    {key:'effective', title:'Effective sets and the muscle bars', body:`
      <p>Not every set is equal. An effective set is one set's worth of real stimulus: the credit for its rep range (for your goal) multiplied by how hard it felt. A 10-rep Hard set counts 1.0; an Easy one about half.</p>
      <p>Secondary muscles get ${Math.round(TRAINING.secondaryMuscleShare*100)}%, so bench press counts fully for chest and half for triceps. The bars compare your week with ${TRAINING.weeklyEffectiveSetTarget} effective sets per muscle.</p>`},
    {key:'special', title:'Warm-ups, drop sets and PRs', body:`
      <ul>
        <li><b>Warm-ups</b> don't count for PRs, overload or effective sets. Use the Warm-up switch so they don't drag your numbers down.</li>
        <li><b>Drop sets</b> count toward effective sets (by their first stage) but not PRs or overload.</li>
        <li><b>PRs</b> use an estimated one-rep max, so 80 kg × 10 can beat 85 kg × 6.</li>
      </ul>`},
    {key:'bodyweight', title:'Bodyweight and timed exercises', body:`
      <p>There's no weight to add, so the app asks for more reps (+1, or +2 if it felt easy) or a longer hold (+10 s, or +15 s if easy). If it felt hard, just match last time.</p>`},
  ];
}

function openTrainingGuideSheet(openKey){
  openSheet({
    title:'Training guide',
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

function renderSettingsScreen(){
  const wrap = el(`<div></div>`);
  wrap.appendChild(el(`<h3 style="margin-bottom:14px;">Settings</h3>`));
  wrap.appendChild(el(`<div class="card"><p class="small muted">Weights are tracked in <strong>kilograms (kg)</strong>.</p></div>`));

  const themeCard = el(`
    <div class="card">
      <p class="small muted" style="margin-bottom:10px;">Appearance</p>
      <div class="row">
        <div class="chip ${currentTheme()==='dark'?'on':''}" data-th="dark" style="flex:1;justify-content:center;">${icon('moon',16)} Dark</div>
        <div class="chip ${currentTheme()==='light'?'on':''}" data-th="light" style="flex:1;justify-content:center;">${icon('sun',16)} Light</div>
      </div>
    </div>`);
  qa('[data-th]',themeCard).forEach(chip=> chip.onclick = ()=>{ setTheme(chip.dataset.th); renderApp(); });
  wrap.appendChild(themeCard);

  const nameCard = el(`
    <div class="card">
      <div class="field" style="margin:0;"><label>Your name</label><input id="userName" value="${escapeHtml(DATA.settings.userName||DEFAULT_USER_NAME)}" placeholder="Your name"></div>
    </div>`);
  q('#userName',nameCard).onchange = (e)=>{
    DATA.settings.userName = e.target.value.trim() || DEFAULT_USER_NAME;
    saveData(DATA);
  };
  wrap.appendChild(nameCard);

  wrap.appendChild(el(`<div class="section-title">Body weight</div>`));
  const weighCard = el(`
    <div class="card">
      <div class="field" style="margin:0;"><label>Weekly weigh-in day</label>
        <select id="weighInDay">
          ${DAY_ORDER.map(dk=>`<option value="${dk}" ${DATA.settings.weighInDay===dk?'selected':''}>${DAY_LABELS[dk]}</option>`).join('')}
        </select>
      </div>
      <p class="faint small" style="margin-top:10px;">Home shows a reminder on this day until you log or tap Later. Logging lives in History.</p>
    </div>`);
  q('#weighInDay',weighCard).onchange = (e)=>{
    DATA.settings.weighInDay = e.target.value;
    saveData(DATA);
    showToast('Weigh-in day set to '+DAY_LABELS[e.target.value]);
    renderApp();
  };
  wrap.appendChild(weighCard);

  /* Training: goal preset + the two overload dials that drive §5 progressionFor */
  const goal = goalConfig();
  wrap.appendChild(el(`<div class="section-title">Training</div>`));
  const trainingCard = el(`
    <div class="card">
      <div class="field"><label>Goal</label>
        <select id="goalSelect">
          ${Object.entries(TRAINING.goals).map(([key,g])=>`<option value="${key}" ${DATA.settings.goal===key?'selected':''}>${g.label}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Sets for new exercises</label>
        <select id="defaultPlanSets">
          ${[1,2,3,4,5,6,7,8].map(n=>`<option value="${n}" ${defaultPlanSets()===n?'selected':''}>${n}</option>`).join('')}
        </select>
        <p class="faint small" style="margin-top:6px;">Used when you add an exercise to a split.</p>
      </div>
      <div class="grid2">
        <div class="field"><label>Reps before more weight</label><input id="repsToEarn" type="number" min="3" max="30" inputmode="numeric" value="${goal.repsToEarnIncrease}"></div>
        <div class="field"><label>Clean sessions needed</label><input id="sessionsNeeded" type="number" min="1" max="5" inputmode="numeric" value="${goal.sessionsRequired}"></div>
      </div>
      <p class="faint small">You earn a load increase after ${goal.sessionsRequired} session${goal.sessionsRequired>1?'s':''} where ${goal.qualifyingSets} sets hit ${goal.repsToEarnIncrease} reps (or the top of that exercise's programmed rep range, if lower), including one Hard set. Increments follow equipment (barbell ${TRAINING.load.minIncrementByEquip.barbell}${units()}, dumbbell ${TRAINING.load.minIncrementByEquip.dumbbell}${units()}, cable/machine ${TRAINING.load.minIncrementByEquip.cable}${units()}).</p>
    </div>`);
  q('#defaultPlanSets',trainingCard).onchange = (e)=>{
    const before = defaultPlanSets();
    const next = parseInt(e.target.value, 10);
    DATA.settings.defaultPlanSets = next;
    saveData(DATA);
    const split = activeSplit();
    const rows = Object.values(split.days || {}).flatMap(day=> (day && day.exercises) || []).filter(row=> row.sets === before);
    if(!rows.length || before === next) return;
    chooseAction(
      `Also change the ${rows.length} exercise${rows.length>1?'s':''} in your ${split.label} split that ${rows.length>1?'have':'has'} ${before} set${before>1?'s':''} to ${next}?`,
      'Update split', ()=>{
        rows.forEach(row=>{ row.sets = next; });
        saveData(DATA);
        showToast(`${rows.length} exercise${rows.length>1?'s':''} now ${next} set${next>1?'s':''}`);
        renderApp();
      },
      'Keep split as is');
  };
  q('#goalSelect',trainingCard).onchange = (e)=>{
    const preset = TRAINING.goals[e.target.value];
    DATA.settings.goal = e.target.value;
    DATA.settings.overload = {repsToEarnIncrease:preset.repsToEarnIncrease, sessionsRequired:preset.sessionsRequired};
    saveData(DATA);
    showToast(`Goal set to ${preset.label}`);
    renderApp();
  };
  q('#repsToEarn',trainingCard).onchange = (e)=>{
    const value = parseInt(e.target.value,10);
    if(isNaN(value)||value<3) return;
    DATA.settings.overload.repsToEarnIncrease = value; saveData(DATA); renderApp();
  };
  q('#sessionsNeeded',trainingCard).onchange = (e)=>{
    const value = parseInt(e.target.value,10);
    if(isNaN(value)||value<1) return;
    DATA.settings.overload.sessionsRequired = value; saveData(DATA); renderApp();
  };
  wrap.appendChild(trainingCard);

  wrap.appendChild(el(`<div class="section-title">Training guide</div>`));
  const guideCard = el(`
    <div class="card guide-card">
      <p class="small muted">How the app decides when to add or lower weight, what a qualifying session is, and what each goal means.</p>
      <button class="btn secondary" data-guide style="width:100%;margin-top:10px;">${icon('info',16)} Open training guide</button>
    </div>`);
  q('[data-guide]',guideCard).onclick = ()=> openTrainingGuideSheet();
  wrap.appendChild(guideCard);

  wrap.appendChild(el(`<div class="section-title">Rest timer</div>`));
  const restCard = el(`
    <div class="card">
      <div class="field"><label>Default rest between sets</label>
        <select id="restDefault">
          ${[1,1.5,2,2.5,3,3.5,4,5].map(m=>`<option value="${m}" ${DATA.settings.restDefaultMinutes===m?'selected':''}>${formatMinSec(Math.round(m*60))}</option>`).join('')}
        </select>
      </div>
      <p class="faint small" style="margin-bottom:10px;">Any exercise can override this with its own rest time in the Split day editor.</p>
      <label class="row" style="gap:8px;margin:10px 0;font-size:13px;color:var(--text-dim);cursor:pointer;">
        <input type="checkbox" id="restNotify" style="width:auto;" ${DATA.settings.restNotify?'checked':''}>
        <span>System notification when rest ends (over other apps)</span>
      </label>
      <label class="row" style="gap:8px;margin:10px 0 0;font-size:13px;color:var(--text-dim);cursor:pointer;">
        <input type="checkbox" id="restVibrate" style="width:auto;" ${DATA.settings.restVibrate?'checked':''}>
        <span>Vibrate when rest ends</span>
      </label>
      <p class="faint small" style="margin-top:10px;">Rest complete uses your phone's default notification sound.</p>
      ${isAndroidApp() ? `<p class="faint small" style="margin-top:8px;">If the alert is late or missing with the screen off: Settings → Apps → ${escapeHtml(APP_NAME)} → Battery → Unrestricted. Also allow Alarms &amp; reminders if Android shows it.</p>
      <button class="btn secondary" data-allow-rest style="width:100%;margin-top:10px;">Allow rest alerts</button>` : ''}
    </div>`);
  q('#restDefault',restCard).onchange = (e)=>{
    DATA.settings.restDefaultMinutes = parseFloat(e.target.value); saveData(DATA); renderApp();
  };
  q('#restNotify',restCard).onchange = async (e)=>{
    DATA.settings.restNotify = e.target.checked; saveData(DATA);
    if(e.target.checked){
      DATA.settings.restSetupAsked = true;
      saveData(DATA);
      const ok = await ensureRestNotifyPermission();
      if(!ok) showToast('Notifications are blocked for '+APP_NAME+' in your phone settings');
      else if(isAndroidApp()) await runRestAlertSetup();
    }
  };
  const allowRest = q('[data-allow-rest]', restCard);
  if(allowRest) allowRest.onclick = async ()=>{
    DATA.settings.restNotify = true;
    DATA.settings.restSetupAsked = true;
    saveData(DATA);
    await runRestAlertSetup();
    renderApp();
  };
  q('#restVibrate',restCard).onchange = (e)=>{ DATA.settings.restVibrate = e.target.checked; saveData(DATA); };
  wrap.appendChild(restCard);

  wrap.appendChild(el(`<div class="section-title">Exercise Library</div>`));
  const libCard = el(`
    <div class="card">
      <p class="small muted">View or edit any exercise. Only movements you added yourself can be deleted. Adding a new one is quicker from the Split tab while building a day.</p>
      <button class="btn secondary" data-manage style="width:100%;margin-top:10px;">📚 Manage exercises (${DATA.exercises.length})</button>
    </div>`);
  q('[data-manage]',libCard).onclick = openLibrarySheet;
  wrap.appendChild(libCard);

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

  wrap.appendChild(el(`
    <footer class="settings-footer">
      ${logoMarkHtml()}
      <div class="brand-kicker">${escapeHtml(APP_NAME)}</div>
      <div class="credit-line">Workout tracking, simplified by Nirbhay Raut.</div>
      <div class="copy">©2026 <a class="credit-mail" href="mailto:trackagainsupport@gmail.com">trackagainsupport@gmail.com</a></div>
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
  {key:'history',  label:'Workout history', hint:'All logged sessions and sets. Also clears Records, which are built from this.'},
  {key:'records',  label:'PR trophies on sets', hint:'Clears 🏆 flags. The Records tab still lists best lifts unless you also clear Workout history.'},
  {key:'split',    label:'Split layout', hint:"Your weekly days and exercises go back to God's Plan. Presets are kept unless you select them too."},
  {key:'weight',   label:'Weight logs', hint:'Body-weight entries in History.'},
  {key:'presets',  label:'Saved split presets', hint:'Named layouts on the Split tab.'},
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
function applyDataReset(picked){
  if(picked.has('history')){
    DATA.logs = [];
    DATA.progress = {};
  }
  if(picked.has('records')){
    (DATA.logs||[]).forEach(log=> (log.sets||[]).forEach(set=>{ set.isPR = false; }));
  }
  if(picked.has('split')){
    DATA.splits = defaultSplits(DATA.exercises);
    DATA.activeSplit = 'main';
  }
  if(picked.has('weight')) DATA.bodyWeight = [];
  if(picked.has('presets')) DATA.presets = [];
  if(picked.has('settings')) DATA.settings = defaultSettings();
  recordsMuscle = null;
  saveData(DATA);
}

