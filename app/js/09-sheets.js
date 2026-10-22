/* ============================ §9 SHEETS ============================ */

/* --- log / edit a set ------------------------------------------------ */
function metricFieldId(prefix, name){ return (prefix||'')+name; }
function metricFieldsHtml(metric, existingSet, prefillWeight, idPrefix, ex){
  const weight = existingSet ? existingSet.weight : (prefillWeight!=null ? prefillWeight : '');
  const reps   = existingSet ? existingSet.reps : '';
  const secs   = existingSet ? existingSet.duration : '';
  const weightId = metricFieldId(idPrefix,'fldWeight');
  const repsId = metricFieldId(idPrefix,'fldReps');
  const secsId = metricFieldId(idPrefix,'fldSecs');
  if(hasLoadField(metric)){
    const label = metric==='assisted' ? 'Assistance (kg)' : metric==='weighted_bw' ? 'Added weight (kg, 0 = bodyweight)' : 'Weight (kg)';
    return `<div class="grid2">
        <div class="field"><label>${label}</label><input id="${weightId}" type="number" step="0.5" min="0" inputmode="decimal" value="${weight}" placeholder="e.g. 60"></div>
        <div class="field"><label>Reps</label><input id="${repsId}" type="number" min="1" inputmode="numeric" value="${reps}" placeholder="e.g. 8"></div>
      </div>
      ${metric==='assisted'?'<p class="faint small" style="margin:-4px 0 10px;">Lower assistance = stronger 💪</p>':''}`;
  }
  if(metric==='reps_only') return `<div class="field"><label>Reps</label><input id="${repsId}" type="number" min="1" inputmode="numeric" value="${reps}" placeholder="e.g. 12"></div>`;
  if(metric==='time' && isMinuteHold(ex)){
    const minId = metricFieldId(idPrefix,'fldMins');
    const filled = secs!=='' && secs!=null;
    return `<div class="field"><label>Duration</label>${holdFieldsHtml(filled ? secs : null, {minId, secId:secsId, blank:!filled})}</div>`;
  }
  if(metric==='time')      return `<div class="field"><label>Duration (seconds)</label><input id="${secsId}" type="number" min="1" inputmode="numeric" value="${secs}" placeholder="e.g. 45"></div>`;
  return '';
}
function readMetricFields(metric, root, idPrefix, ex){
  if(hasLoadField(metric)){
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
    if(isMinuteHold(ex)){
      return readHoldFields(q('#'+metricFieldId(idPrefix,'fldMins'),root), q('#'+metricFieldId(idPrefix,'fldSecs'),root));
    }
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

function deleteLoggedSet(set){
  confirmAction('Delete this set? This cannot be undone.', 'Delete', ()=>{
    const log = DATA.logs.find(l=> (l.sets||[]).includes(set));
    if(log){
      releaseHold(set);
      log.sets = log.sets.filter(s=>s.id!==set.id);
    }
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
      const holdFinished = typeof existingSet.holdStartedAt==='number' && holdRemainingMs(existingSet)<=0;
      syncHoldToDuration(existingSet);
      closeSheets();
      if(!holdFinished) showToast('Set updated');
      renderApp();
    } else {
      const set = logNormalSet(exerciseId, values, effort, isWarmup, intent);
      closeSheets();
      const holding = startHoldIfMinute([set]);
      if(holding) hapticTick(false);
      else celebrateSet(set);
      renderApp();
    }
  }
  function saveDropSet(finalStages){
    if(isEdit){
      releaseHold(existingSet);
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
      promoteStartedExercise(log, exerciseId);
      markWorkoutActivity(log);
      saveData(DATA);
      closeSheets();
      hapticTick(false);
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
            ${planRow && isMinuteHold(ex) ? `<p class="faint small">Target: ${formatHoldRange(planRow.repsMin, planRow.repsMax)}</p>` : ''}
            ${planRow && metric!=='time' ? `<p class="faint small">Target: ${formatRepRange(planRow.repsMin, planRow.repsMax)} reps${planRow.rpe?` · RPE ${planRow.rpe}`:''}</p>` : ''}
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
          fieldsBox.appendChild(el(`<div>${metricFieldsHtml(metric, normalExisting, plannedLoad, '', ex)}<div data-warn></div></div>`));
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
                <div class="fields" style="display:flex;gap:8px;flex:1;">${stageFieldsHtml(metric, stage, i, ex)}</div>
              </div>`));
          });
          const captureStages = ()=>{ stages = stages.map((s,i)=> readStageFields(metric, wrap, i, ex) || s); };
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
            const values = readMetricFields(metric, wrap, '', ex);
            if(!values){ showToast('Enter valid numbers'); return; }
            const intent = !isWarmup && hasLoadField(metric) && strengthIntent && values.reps < TRAINING.lowRepWarningBelow ? 'strength' : null;
            saveNormalSet(values, intent);
          } else {
            const finalStages = [];
            for(let i=0;i<stages.length;i++){
              const v = readStageFields(metric, wrap, i, ex);
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
  if(hasLoadField(metric)){
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
        const target = isMinuteHold(block.ex)
          ? formatHoldRange(block.row.repsMin, block.row.repsMax)
          : block.metric!=='time'
          ? `${formatRepRange(block.row.repsMin, block.row.repsMax)} reps${block.row.rpe?` · RPE ${block.row.rpe}`:''}`
          : `${block.row.sets} holds`;
        const blockEl = el(`
          <div class="ss-block" data-block="${block.prefix}">
            <div class="name">${escapeHtml(block.ex.name)}</div>
            <p class="faint small" style="margin-bottom:8px;">${escapeHtml(target)}</p>
            ${metricFieldsHtml(block.metric, supersetSeed(block.row), null, block.prefix, block.ex)}
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
          const values = readMetricFields(block.metric, wrap, block.prefix, block.ex);
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
        clearRunningHolds();
        const saved = pending.map(({block, values})=>{
          const intent = !warmup && hasLoadField(block.metric) && block.strengthIntent && values.reps < TRAINING.lowRepWarningBelow ? 'strength' : null;
          const set = {id:uid(), exerciseId:block.row.exerciseId, difficulty:block.effort, intent, ts:Date.now(), isPR:false, isDropSet:false, isWarmup:warmup, ...values};
          log.sets.push(set);
          recomputePRs(block.row.exerciseId);
          return set;
        });
        saved.forEach(s=> promoteStartedExercise(log, s.exerciseId));
        markWorkoutActivity(log);
        saveData(DATA);
        closeSheets();
        const holding = startHoldIfMinute(saved);
        if(holding) hapticTick(false);
        const ready = holding ? saved.filter(s=> typeof s.holdStartedAt!=='number') : saved;
        if(ready.length) celebrateSets(ready);
        renderApp();
      };
    }
  });
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
      if(deleteBtn) deleteBtn.onclick = ()=>{
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
          DATA.logs.forEach(log=>{
            if(Array.isArray(log.plan)) log.plan = strip(log.plan);
            if(Array.isArray(log.queued)) log.queued = strip(log.queued);
          });
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

/* Swap today's hit list to another split day, or an empty custom session. */
function todaySessionLabel(kind, dayKey){
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
function openTodaySessionSheet(){
  const log = todayLog();
  const usual = weekdayKey();
  const onCustom = !!log.customSession;
  const overridden = onCustom || (!!log.dayKey && log.dayKey!==usual);
  openSheet({
    title:'Want to do something else?',
    build:(body, sheet)=>{
      const list = el(`<div class="choice-list"></div>`);
      const add = (title, sub, kind, dayKey)=>{
        const row = el(`
          <button type="button" class="choice-row">
            <span class="choice-row-label">${escapeHtml(title)}<span class="choice-row-sub">${escapeHtml(sub)}</span></span>
          </button>`);
        row.onclick = ()=> pickTodaySession(kind, dayKey, sheet);
        list.appendChild(row);
      };
      if(overridden){
        const day = splitDayFor(usual);
        const n = (day.exercises||[]).length;
        const sub = n
          ? `${day.name || 'Workout'} · ${n} exercise${n===1?'':'s'} · today's usual day`
          : `${day.name || 'Rest'} · today's usual day`;
        add(DAY_LABELS[usual], sub, 'scheduled', usual);
      }
      DAY_ORDER.forEach(dk=>{
        if(dk===usual) return;
        if(!onCustom && dk===(log.dayKey||usual)) return;
        const day = splitDayFor(dk);
        const n = (day.exercises||[]).length;
        add(DAY_LABELS[dk], n ? `${day.name || 'Workout'} · ${n} exercise${n===1?'':'s'}` : 'Rest', 'day', dk);
      });
      if(!onCustom) add('Custom', 'Start empty and add exercises', 'custom', null);
      body.appendChild(list);
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
    const wuCount = Array.isArray(day.warmups) ? day.warmups.length : 0;
    const card = el(`
      <div class="day-card ${dk===today?'today':''}">
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
  if(!Array.isArray(draft.exercises)) draft.exercises = [];
  if(!Array.isArray(draft.warmups)) draft.warmups = [];
  let dirty = false;
  let selected = new Set(); // indices picked for "group into superset" — editor-only, not persisted
  let openIdx = -1;         // the one expanded exercise row — editor-only
  let openWuIdx = -1;       // the one expanded warm-up row — editor-only
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
      startFull: true,
      onRequestClose: guard,
      build:(body, sheet)=>{
        const liveWorkout = activeWorkoutLog();
        const editingLiveDay = !!(liveWorkout && liveWorkout.dayKey===dayKey);
        const wuMins = warmupsMinutes(draft.warmups);
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
        if(!draft.exercises.length) rowsBox.appendChild(el(`<p class="empty">Rest day — no exercises yet. Add one below, or leave it empty.</p>`));
        const ctx = {
          redraw:()=>{ dirty = true; draw(); },
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
          title:`Add to ${DAY_LABELS[dayKey]}`,
          exclude: draft.exercises.map(r=>r.exerciseId),
          onPick:(id)=>{
            draft.exercises.push(newPlanRow(id,{goal:DATA.settings.goal}));
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
        q('[data-copy]',body).onclick = ()=> openCopyDaySheet(dayKey, draft, draw);
        q('[data-save]',body).onclick = ()=>{
          draft.warmups = (draft.warmups||[]).map(normalizeWarmupRow).filter(Boolean);
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

/* "3 × 8–12 · RPE 8 · 1:30 rest" — the collapsed row's one-line summary. */
function planRowSummary(row, metric, ex){
  const range = isMinuteHold(ex)
    ? formatHoldRange(row.repsMin, row.repsMax)
    : formatRepRange(row.repsMin, row.repsMax) + (metric==='time'?'s':'');
  const bits = [`${row.sets} × ${range}`];
  if(row.rpe!=null) bits.push(`RPE ${row.rpe}`);
  const rest = restSecondsFor(row);
  const m = Math.floor(rest/60), s = rest%60;
  bits.push(rest===0 ? 'no rest' : rest<60 ? `${rest}s rest` : s ? `${m}:${String(s).padStart(2,'0')} rest` : `${m} min rest`);
  if(hasLoadField(metric) && row.loadStep > 0) bits.push(`${row.loadStep} kg jumps`);
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
          <div class="plan-summary" data-summary>${escapeHtml(planRowSummary(row, metric, ex))}</div>
        </div>
        <span class="plan-chev" aria-hidden="true">${icon('chevronDown',18)}</span>
      </div>
      <div class="plan-body">
      ${ex ? `<div class="plan-sub">${escapeHtml(exerciseSubtitle(ex))}</div>` : ''}
      <div class="plan-metrics${isMinuteHold(ex)?' hold':''}">
        <div><label>Sets</label><input type="number" min="1" inputmode="numeric" value="${row.sets}" data-field="sets"></div>
        ${isMinuteHold(ex) ? `
        <div class="plan-hold"><label>Min hold</label>${holdFieldsHtml(row.repsMin, {minAttr:'data-hold-field="repsMin" data-hold-part="min"', secAttr:'data-hold-field="repsMin" data-hold-part="sec"'})}</div>
        <div class="plan-hold"><label>Max hold</label>${holdFieldsHtml(row.repsMax, {minAttr:'data-hold-field="repsMax" data-hold-part="min"', secAttr:'data-hold-field="repsMax" data-hold-part="sec"'})}</div>`
        : `<div><label>${metric==='time'?'Min sec':'Min reps'}</label><input type="number" min="1" inputmode="numeric" value="${row.repsMin}" data-field="repsMin"></div>
        <div><label>${metric==='time'?'Max sec':'Max reps'}</label><input type="number" min="1" inputmode="numeric" value="${row.repsMax}" data-field="repsMax"></div>`}
        <div><label>RPE</label><input type="number" min="5" max="10" step="0.5" inputmode="decimal" value="${row.rpe!=null?row.rpe:''}" data-field="rpe" placeholder="—"></div>
      </div>
      <div class="plan-extra${hasLoadField(metric)?' load':''}">
        <div class="field" style="margin:0;"><label>Note</label><input value="${escapeHtml(row.notes||'')}" data-field="notes" placeholder="e.g. slow negatives"></div>
        <div class="field" style="margin:0;"><label>Rest (sec)</label><input type="number" min="0" inputmode="numeric" value="${row.restSeconds!=null?row.restSeconds:''}" data-field="restSeconds" placeholder="${defaultRestSeconds()}"></div>
        ${hasLoadField(metric) ? `<div class="field" style="margin:0;"><label>Weight jump (kg)</label><input type="number" min="0.5" max="50" step="0.5" inputmode="decimal" value="${row.loadStep!=null?row.loadStep:''}" data-field="loadStep" placeholder="${loadStepFor(ex)}"></div>` : ''}
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
  const refreshSummary = ()=>{ summary.textContent = planRowSummary(row, metric, ex); };
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
    if(field==='loadStep'){
      const raw = input.value.trim();
      if(raw===''){ row.loadStep = null; markDirty(); refreshSummary(); return; }
      const value = parseFloat(raw);
      row.loadStep = (!isNaN(value) && value > 0) ? Math.min(50, roundTo(value, 2)) : null;
      markDirty(); refreshSummary(); return;
    }
    const value = parseInt(input.value,10);
    if(isNaN(value) || value<1) return;
    row[field] = value; markDirty(); refreshSummary();
  });
  qa('input[data-hold-field]',node).forEach(input=> input.oninput = ()=>{
    const field = input.dataset.holdField;
    const minEl = q(`input[data-hold-field="${field}"][data-hold-part="min"]`,node);
    const secEl = q(`input[data-hold-field="${field}"][data-hold-part="sec"]`,node);
    const read = readHoldFields(minEl, secEl);
    if(!read) return;
    row[field] = read.duration; markDirty(); refreshSummary();
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

/* ------------------------------ Warm-up library ------------------------------ */
let openWarmupMuscle = null;
let warmupLibrarySearch = '';
function openWarmupLibrarySheet(){
  openSheet({
    title:'Warm-up library',
    build:(body)=>{
      const header = el(`
        <div class="row between" style="margin-bottom:12px;">
          <p class="faint small" style="margin:0;">${(DATA.warmupLibrary||[]).length} bodyweight warm-ups. Built-in ones can be edited; only ones you added can be deleted.</p>
          <button class="btn ghost" data-add>＋ Add</button>
        </div>`);
      body.appendChild(header);
      body.appendChild(el(searchFieldHtml('warmupLibrarySearch','Search warm-ups or muscles…', warmupLibrarySearch)));
      const results = el(`<div></div>`);
      body.appendChild(results);
      const redraw = ()=> paintWarmupLibrary(results, redraw);
      q('[data-add]',header).onclick = ()=> openWarmupFormSheet({onSaved:()=>{ openWarmupMuscle = null; redraw(); }});
      redraw();
      const input = q('#warmupLibrarySearch',body);
      input.oninput = ()=>{ warmupLibrarySearch = input.value; redraw(); };
    },
    onClosed:()=>{ warmupLibrarySearch=''; openWarmupMuscle=null; renderApp(); }
  });
}
function warmupLibraryRow(item, redraw){
  const row = el(`
    <div class="ex-list-item">
      <div style="min-width:0;">
        <div>${escapeHtml(item.title)}</div>
        <div class="meta">${escapeHtml(warmupSubtitle(item))}</div>
      </div>
      <button class="btn ghost" data-view>View →</button>
    </div>`);
  q('[data-view]',row).onclick = ()=> openWarmupDetailSheet(item.id, {root:SHEET_ROOT.picker, zIndex:150, onClosed:redraw});
  return row;
}
function paintWarmupLibrary(container, redraw){
  container.innerHTML = '';
  const term = warmupLibrarySearch.trim();
  const lib = DATA.warmupLibrary || [];
  if(term){
    const hits = searchWarmups(term, lib);
    if(hits.length){
      const card = el(`<div class="card flat" style="padding:6px 14px;"></div>`);
      hits.forEach(w=> card.appendChild(warmupLibraryRow(w, redraw)));
      container.appendChild(card);
    } else {
      const box = el(`
        <div class="notfound">
          <p>No match for "${escapeHtml(term)}".</p>
          <button class="btn secondary" data-add>＋ Add "${escapeHtml(term)}" to warm-ups</button>
        </div>`);
      q('[data-add]',box).onclick = ()=> openWarmupFormSheet({
        prefillTitle:term,
        onSaved:()=>{ warmupLibrarySearch=''; redraw(); }
      });
      container.appendChild(box);
    }
    return;
  }
  REGION_ORDER.forEach(region=>{
    const muscles = MUSCLES.filter(m=>MUSCLE_REGION[m]===region && lib.some(w=>(w.primary||'Other')===m));
    if(!muscles.length) return;
    container.appendChild(el(`<div class="region-label">${region}</div>`));
    muscles.forEach(muscle=>{
      const list = warmupsForMuscle(muscle);
      const isOpen = openWarmupMuscle===muscle;
      const head = el(`
        <div class="accordion-head" style="margin-bottom:${isOpen?'0':'10px'}">
          <span style="font-weight:700;">${escapeHtml(muscle)}</span>
          <span class="faint small">${list.length} ${isOpen?'▲':'▼'}</span>
        </div>`);
      head.onclick = ()=>{ openWarmupMuscle = isOpen ? null : muscle; redraw(); };
      container.appendChild(head);
      if(isOpen){
        const body = el(`<div class="accordion-body" style="margin-bottom:10px;"></div>`);
        list.forEach(w=> body.appendChild(warmupLibraryRow(w, redraw)));
        container.appendChild(body);
      }
    });
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
          sheet.close();
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
        new Chart(canvas.getContext('2d'), {
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
  const trained = exercisesWithPrs(muscle);
  const summary = trained.length
    ? `${trained.length} exercise${trained.length>1?'s':''} with PRs · tap one for its history`
    : 'No PRs yet';
  const head = el(`
    <div class="rec-head">
      <button type="button" class="close-x" data-back aria-label="Back to all muscles">${icon('chevronLeft',20)}</button>
      <div class="rec-head-text">
        <div class="rec-kicker">Records</div>
        <h3>${escapeHtml(muscle)}</h3>
        <div class="rec-sub">${escapeHtml(summary)}</div>
      </div>
    </div>`);
  q('[data-back]',head).onclick = ()=>{ recordsMuscle = null; renderApp(); };
  wrap.appendChild(head);

  const card = el(`<div class="card flat rec-list"></div>`);
  if(!trained.length){
    card.appendChild(el(`<p class="empty">No records yet for ${escapeHtml(muscle)}. Start training to see your PRs here.</p>`));
  } else {
    trained.forEach(ex=>{
      const moments = prMomentsForExercise(ex.id);
      const current = moments[moments.length-1];
      const meta = `${prDayLabel(current.date)} · ${moments.length} PR${moments.length>1?'s':''}`;
      const row = el(`
        <div class="ex-list-item rec-row" role="button" tabindex="0">
          <div class="rec-row-main">
            <div class="rec-row-name">${escapeHtml(ex.name)}</div>
            <div class="meta">${escapeHtml(meta)}</div>
          </div>
          <span class="chip rec-chip">${escapeHtml(formatPrValue(current.set, metricOf(ex)))}</span>
          <span class="rec-go" aria-hidden="true">${icon('chevronRight',18)}</span>
        </div>`);
      row.onclick = ()=> openRecordsPrSheet(ex.id);
      row.onkeydown = e=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); openRecordsPrSheet(ex.id); } };
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
          <div class="faint small">${moment===newest?'<span class="trophy">🏆</span> Current · ':''}${escapeHtml(prDeltaText(moments[idx+1], moment, metric, ex))}</div>
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
function historyRangeOptions(months){
  return [
    {value:'all', label:'All Time'},
    {value:'this', label:'This Month'},
    {value:'last', label:'Last Month'},
    ...months.map(ym=>({value:ym, label:monthTitle(ym)}))
  ];
}
function historyRangeLabel(value, months){
  const hit = historyRangeOptions(months).find(o=>o.value===value);
  return hit ? hit.label : 'All Time';
}
function historyRangeSelectHtml(months){
  const cur = historyFilter || 'all';
  return choiceFieldHtml({id:'historyRange', label:null, value:cur, display:historyRangeLabel(cur, months)});
}
function renderHistorySummaryCard(logs, filter){
  const insight = historyInsights(logs, filter);
  const range = historyRangeKpis(logs, filter);
  const freq = historyFrequency(logs, filter);
  const card = el(`
    <div class="card">
      <p class="section-title" style="margin-top:0;">Workout summary</p>
      <div class="field" style="margin:0 0 12px;">${historyRangeSelectHtml(historyMonthOptions(loggedWorkouts()))}</div>
      ${statGridHtml([
        {value:range.score==null ? '—' : `${range.score}<span class="stat-of">/100</span>`, label:'Score', infoHtml:`<button type="button" class="stat-info" data-score-info aria-label="How the score is measured">${icon('info',13)}</button>`},
        {value:escapeHtml(range.vs.text), label:'Vs previous', infoHtml:`<button type="button" class="stat-info" data-gain-info aria-label="Weight change by exercise">${icon('info',13)}</button>`},
        {value:String(insight.prs), label:'Records'},
        {value:String(insight.streak), label:'Streak'}
      ], 'cols-2')}
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
  const scoreInfo = q('[data-score-info]', card);
  if(scoreInfo) scoreInfo.onclick = (e)=>{ e.stopPropagation(); openScoreInfoSheet(); };
  const gainInfo = q('[data-gain-info]', card);
  if(gainInfo) gainInfo.onclick = (e)=>{ e.stopPropagation(); openWeightGainSheet(logs, filter); };
  bindChoiceField(q('#historyRange', card), {
    title:'Workout summary range',
    options:()=> historyRangeOptions(historyMonthOptions(loggedWorkouts())),
    onChange:(value)=>{
      historyFilter = normalizeHistoryFilter(value);
      historyTreeOpen = {year:null, month:null, week:null};
      pastWorkoutsOpen = false;
      renderApp();
    }
  });
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
      <div class="faint small">${workingSetCount(log.sets)} sets · ≈ ${roundTo(totalEffectiveSets(log.sets))} effective${dur>0?` · ${formatDuration(dur)}`:''}</div>
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
        <div class="faint small">${escapeHtml(when)} · ${workingSetCount(log.sets)} sets · ≈ ${roundTo(totalEffectiveSets(log.sets))} effective${dur>0?` · ${escapeHtml(formatDuration(dur))}`:''}</div>
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
        <li>Cable or machine: ${eq.cable} kg · Weighted bodyweight: ${eq.bodyweight} kg</li>
      </ul>
      <p>The result is rounded to that step, so a 20 kg dumbbell curl goes to ${nextLoadFor({equipment:'dumbbell', primary:'Biceps'}, 20)} kg (dumbbell weights are per hand). If your gym's jumps are different, set Weight jump on the exercise in Split (or in the library). Spotter suggestions always move at least one full jump.</p>`},
    {key:'lower', title:'When does it tell me to lower the weight?', body:`
      <p>When your reps fall below the bottom of the exercise's range, the weight is too heavy for your goal. For example, 82.5 kg × 4 when the range is 6–10.</p>
      <ul>
        <li><b>During the workout</b> the box suggests a lighter weight for your next set straight away. Tap <b>Use</b> and the steppers jump to it.</li>
        <li><b>Next session</b>, if every set last time was below the range, the box opens with "Drop to …".</li>
      </ul>
      <p>Right after a weight increase, falling up to ${L.newLoadRepGrace} reps short of the range is expected, so the app tells you to stay and build the reps back instead.</p>
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
        <li><b>PRs</b> use an estimated one-rep max, so 80 kg × 10 can beat 85 kg × 6, and an extra rep at the same weight is a PR. Your first set of an exercise is the baseline; beating it earns the first trophy.</li>
      </ul>`},
    {key:'bodyweight', title:'Bodyweight and timed exercises', body:`
      <p>There's no weight to add, so the app asks for more reps (+1, or +2 if it felt easy) or a longer hold. Plank and treadmill add a minute when the last one felt easy, and otherwise ask you to match it. Other holds add 10 seconds, or 15 if it felt easy. If it felt hard, just match last time.</p>`},
  ];
}

function openTrainingGuideSheet(openKey){
  openSheet({
    title:"FAQ's",
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
  const date = /^\d{4}-\d{2}-\d{2}$/.test(info.date||'')
    ? parseDateKey(info.date).toLocaleDateString(undefined,{day:'numeric', month:'long', year:'numeric'}) : '';
  const highlights = Array.isArray(info.highlights) ? info.highlights.filter(h=>typeof h==='string' && h.trim()) : [];
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
          ${android
            ? `<a class="btn update-cta" href="${escapeHtml(notesUrl)}" target="_blank" rel="noopener noreferrer">${icon('download',18)} Download update</a>
               <p class="faint small" style="margin:8px 2px 0;">Opens the download page. Installing over this version keeps all your workouts.</p>`
            : `<button class="btn update-cta" data-reload>${icon('reopen',18)} Update now</button>`}
          <a class="btn secondary update-cta" href="${escapeHtml(notesUrl)}" target="_blank" rel="noopener noreferrer" style="margin-top:10px;">Full release notes</a>
        </div>`));
      const reload = q('[data-reload]',body);
      if(reload) reload.onclick = ()=> location.reload();
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

  /* Training: goal preset + the two overload dials that drive §5 progressionFor */
  const goal = goalConfig();
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
      <div class="grid2">
        <div class="field"><label>Reps before more weight</label><input id="repsToEarn" type="number" min="3" max="30" inputmode="numeric" value="${goal.repsToEarnIncrease}"></div>
        <div class="field"><label>Clean sessions needed</label><input id="sessionsNeeded" type="number" min="1" max="5" inputmode="numeric" value="${goal.sessionsRequired}"></div>
      </div>
      <p class="faint small">You earn a load increase after ${goal.sessionsRequired} session${goal.sessionsRequired>1?'s':''} where ${goal.qualifyingSets} sets hit ${goal.repsToEarnIncrease} reps (or the top of that exercise's programmed rep range, if lower), including one Hard set. Increments follow equipment (barbell ${TRAINING.load.minIncrementByEquip.barbell}${units()}, dumbbell ${TRAINING.load.minIncrementByEquip.dumbbell}${units()} each, cable/machine ${TRAINING.load.minIncrementByEquip.cable}${units()}) unless you set Weight jump on the Split day or in the library.</p>
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

  wrap.appendChild(el(`<div class="section-title">FAQ's</div>`));
  const guideCard = el(`
    <div class="card guide-card">
      <p class="small muted">How the app decides when to add or lower weight, what a qualifying session is, and what each goal means.</p>
      <button class="btn secondary" data-guide style="width:100%;margin-top:10px;">${icon('info',16)} Open FAQ's</button>
    </div>`);
  q('[data-guide]',guideCard).onclick = ()=> openTrainingGuideSheet();
  wrap.appendChild(guideCard);

  wrap.appendChild(el(`<div class="section-title">Rest timer</div>`));
  const restMins0 = DATA.settings.restDefaultMinutes;
  const restCard = el(`
    <div class="card">
      <div class="field">${choiceFieldHtml({id:'restDefault', label:'Default rest between sets', value:String(restMins0), display:formatMinSec(Math.round(restMins0*60))})}</div>
      <p class="faint small" style="margin-bottom:10px;">Any exercise can override this with its own rest time in the Split day editor.</p>
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
      if(!ok) showToast('Notifications are blocked for '+APP_NAME+' in your phone settings');
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

  wrap.appendChild(el(`<div class="section-title">Exercise Library</div>`));
  const libCard = el(`
    <div class="card">
      <p class="small muted">View or edit any exercise. Only movements you added yourself can be deleted. Adding a new one is quicker from the Split tab while building a day.</p>
      <button class="btn secondary" data-manage style="width:100%;margin-top:10px;">📚 Manage exercises (${DATA.exercises.length})</button>
    </div>`);
  q('[data-manage]',libCard).onclick = openLibrarySheet;
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

