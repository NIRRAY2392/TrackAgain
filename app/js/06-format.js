/* ============================ §6 FORMAT ============================ */
/* One load in words: "60kg", "12.5kg assist", "BW + 10kg", "bodyweight". */
function loadLabel(weight, metric){
  if(metric==='assisted') return `${weight}${units()} assist`;
  if(metric==='weighted_bw') return weight>0 ? `BW + ${weight}${units()}` : 'bodyweight';
  return `${weight}${units()}`;
}
/* Plank, side plank and treadmill are logged as minutes. Stored duration stays seconds. */
function isMinuteHold(ex){
  const name = ((ex && ex.name) || '').toLowerCase();
  return name.includes('plank') || name.includes('treadmill');
}
function resolveExercise(set, ex){
  if(ex) return ex;
  if(set && set.exerciseId) return getExercise(set.exerciseId);
  return null;
}
/* Whole minutes read as "20 min". Anything else stays "0:45" or "1:30". */
function formatHoldAmount(seconds){
  const n = Math.max(0, Math.round(Number(seconds)||0));
  if(n%60===0) return `${n/60} min`;
  const m = Math.floor(n/60), s = n%60;
  return `${m}:${String(s).padStart(2,'0')}`;
}
function formatHoldRange(minSec, maxSec){
  const a = Math.max(0, Math.round(Number(minSec)||0));
  const b = Math.max(0, Math.round(Number(maxSec)||0));
  const lo = Math.min(a,b), hi = Math.max(a,b);
  if(lo===hi) return formatHoldAmount(lo);
  if(lo%60===0 && hi%60===0) return `${lo/60}–${hi/60} min`;
  const clock = n=> `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;
  return `${clock(lo)}–${clock(hi)}`;
}
/* "8–12" normally; just "15" when min and max are the same (no "15–15"). */
function formatRepRange(min, max){
  const a = Math.round(Number(min)||0);
  const b = max==null || max==='' ? a : Math.round(Number(max)||0);
  const lo = Math.min(a,b), hi = Math.max(a,b);
  return lo===hi ? String(lo) : `${lo}–${hi}`;
}
function formatHoldDelta(seconds){
  const n = Math.round(Number(seconds)||0);
  if(n===0) return '0';
  const sign = n>0 ? '+' : '−';
  return sign + formatHoldAmount(Math.abs(n));
}
/* Split a hold into whole minutes and leftover seconds for the min/sec steppers. */
function holdParts(seconds){
  const n = Math.max(0, Math.round(Number(seconds)||0));
  return {min: Math.floor(n/60), sec: n%60};
}
/* Build seconds from min + sec. Seconds ≥ 60 fold into minutes. */
function holdTotalSeconds(min, sec){
  const m = Math.max(0, Math.round(Number(min)||0));
  let s = Math.round(Number(sec)||0);
  if(isNaN(m) || isNaN(s) || s<0) return null;
  if(s>=60){ return m*60 + s; }
  return m*60 + s;
}
function holdFieldsHtml(seconds, opts){
  opts = opts || {};
  const blank = opts.blank || seconds==null || seconds==='';
  const parts = blank ? {min:'', sec:''} : holdParts(seconds);
  const minId = opts.minId || '';
  const secId = opts.secId || '';
  const minAttr = opts.minAttr || '';
  const secAttr = opts.secAttr || '';
  const minName = minId ? ` id="${minId}"` : '';
  const secName = secId ? ` id="${secId}"` : '';
  return `<div class="hold-fields">
      <div class="field hold-part"><label>Min</label><input type="number" min="0" inputmode="numeric" value="${parts.min}" placeholder="0"${minName} ${minAttr}></div>
      <div class="field hold-part"><label>Sec</label><input type="number" min="0" max="59" inputmode="numeric" value="${parts.sec}" placeholder="0"${secName} ${secAttr}></div>
    </div>`;
}
function readHoldFields(minEl, secEl){
  if(!minEl || !secEl) return null;
  const total = holdTotalSeconds(minEl.value, secEl.value);
  return (total==null || total<=0) ? null : {duration:total};
}
function formatTimedValue(seconds, ex, spaced){
  if(isMinuteHold(ex)) return formatHoldAmount(seconds);
  return spaced ? `${seconds} s` : `${seconds}s`;
}
function setValueText(set, metric, ex){
  const exercise = resolveExercise(set, ex);
  if(set.isDropSet) return dropSetSummaryText(set, metric);
  if(metric==='weight_reps') return `${set.weight}${units()} × ${set.reps}`;
  if(metric==='weighted_bw') return (set.weight>0 ? `BW+${set.weight}${units()}` : 'BW')+` × ${set.reps}`;
  if(metric==='reps_only')   return `${set.reps} reps`;
  if(metric==='time')        return formatTimedValue(set.duration, exercise, false);
  if(metric==='assisted')    return `${set.weight}${units()} assist × ${set.reps}`;
  return '';
}
function formatPrValue(set, metric, ex){
  const exercise = resolveExercise(set, ex);
  if(metric==='weight_reps') return `${set.weight} kg × ${set.reps}`;
  if(metric==='weighted_bw') return set.weight>0 ? `BW + ${set.weight} kg × ${set.reps}` : `${set.reps} reps`;
  if(metric==='reps_only')   return `${set.reps} reps`;
  if(metric==='time')        return formatTimedValue(set.duration, exercise, true);
  if(metric==='assisted')    return `${set.weight} kg`;
  return setValueText(set, metric, exercise);
}
function formatPrMomentLine(moment, metric){
  return `${formatLogDate(moment.date)}: ${formatPrValue(moment.set, metric)} PR`;
}
function stageValueText(stage, metric, ex){
  if(metric==='weight_reps') return `${stage.weight}${units()}×${stage.reps}`;
  if(metric==='weighted_bw') return (stage.weight>0 ? `BW+${stage.weight}${units()}` : 'BW')+`×${stage.reps}`;
  if(metric==='reps_only')   return `${stage.reps} reps`;
  if(metric==='time')        return formatTimedValue(stage.duration, ex, false);
  if(metric==='assisted')    return `${stage.weight}${units()} assist×${stage.reps}`;
  return '';
}
function dropSetSummaryText(set, metric){
  const ex = resolveExercise(set);
  return (set.stages||[]).map(st=>stageValueText(st, metric, ex)).join(' → ');
}
function defaultDropStages(metric, prefillWeight){
  const base = ()=>{
    if(hasLoadField(metric)) return {weight: prefillWeight!=null?prefillWeight:'', reps:''};
    if(metric==='reps_only') return {reps:''};
    if(metric==='time') return {duration:''};
    return {};
  };
  return [base(), base()];
}
function stageFieldsHtml(metric, stage, idx, ex){
  if(hasLoadField(metric)){
    const label = metric==='assisted' ? 'Assist' : metric==='weighted_bw' ? 'Added kg' : 'Weight';
    return `<input type="number" step="0.5" min="0" inputmode="decimal" placeholder="${label}" value="${stage.weight!=null?stage.weight:''}" data-stage-weight="${idx}" style="flex:1;min-width:0;">
            <input type="number" min="0" inputmode="numeric" placeholder="Reps" value="${stage.reps!=null?stage.reps:''}" data-stage-reps="${idx}" style="flex:1;min-width:0;">`;
  }
  if(metric==='reps_only') return `<input type="number" min="0" inputmode="numeric" placeholder="Reps" value="${stage.reps!=null?stage.reps:''}" data-stage-reps="${idx}" style="flex:1;min-width:0;">`;
  if(metric==='time' && isMinuteHold(ex)){
    const parts = holdParts(stage.duration!=null && stage.duration!=='' ? stage.duration : 0);
    return `<input type="number" min="0" inputmode="numeric" placeholder="Min" value="${stage.duration!=null&&stage.duration!==''?parts.min:''}" data-stage-min="${idx}" style="flex:1;min-width:0;">
            <input type="number" min="0" max="59" inputmode="numeric" placeholder="Sec" value="${stage.duration!=null&&stage.duration!==''?parts.sec:''}" data-stage-secs="${idx}" style="flex:1;min-width:0;">`;
  }
  if(metric==='time') return `<input type="number" min="0" inputmode="numeric" placeholder="Seconds" value="${stage.duration!=null?stage.duration:''}" data-stage-secs="${idx}" style="flex:1;min-width:0;">`;
  return '';
}
function readStageFields(metric, root, idx, ex){
  if(hasLoadField(metric)){
    const w = q(`[data-stage-weight="${idx}"]`,root), r = q(`[data-stage-reps="${idx}"]`,root);
    const weight = parseFloat(w.value), reps = parseInt(r.value,10);
    if(isNaN(weight)||isNaN(reps)||weight<0||reps<=0) return null;
    return {weight, reps};
  }
  if(metric==='reps_only'){
    const r = q(`[data-stage-reps="${idx}"]`,root);
    const reps = parseInt(r.value,10);
    return (isNaN(reps)||reps<=0) ? null : {reps};
  }
  if(metric==='time'){
    if(isMinuteHold(ex)){
      return readHoldFields(q(`[data-stage-min="${idx}"]`,root), q(`[data-stage-secs="${idx}"]`,root));
    }
    const s = q(`[data-stage-secs="${idx}"]`,root);
    const duration = parseInt(s.value,10);
    return (isNaN(duration)||duration<=0) ? null : {duration};
  }
  return {};
}
function effortLabel(key){ return EFFORT_LABELS[key] || key; }
function effortClass(key){ return key==='easy' ? 'diff-easy' : (key==='hard' ? 'diff-hard' : 'diff-mid'); }
function formatDuration(ms){
  if(!ms || ms<0) return '—';
  const minutes = Math.round(ms/60000), h = Math.floor(minutes/60), m = minutes%60;
  return h>0 ? `${h}h ${m}m` : `${m} min`;
}
function formatWorkoutClock(ms){
  const total = Math.max(0, Math.floor((ms||0)/1000));
  const h = Math.floor(total/3600);
  const m = Math.floor((total%3600)/60);
  const s = total%60;
  const ss = String(s).padStart(2,'0');
  return h>0 ? `${h}:${String(m).padStart(2,'0')}:${ss}` : `${m}:${ss}`;
}
function formatLogDate(dateStr){
  const d = parseDateKey(dateStr);
  return `${d.getDate()} ${d.toLocaleDateString(undefined,{month:'short'})} ${d.toLocaleDateString(undefined,{weekday:'short'})}`;
}
const BODY_WEIGHT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sept','Oct','Nov','Dec'];
function formatBodyWeightDate(dateStr){
  const d = parseDateKey(dateStr);
  return `${d.getDate()} ${BODY_WEIGHT_MONTHS[d.getMonth()]} ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]}`;
}
function formatBodyWeightKg(weight){
  const n = Number(weight);
  if(!Number.isFinite(n)) return '—';
  return Number.isInteger(n) ? String(n) : String(roundTo(n,1));
}
function formatBodyWeightLine(entry){
  return `${formatBodyWeightDate(entry.date)}: ${formatBodyWeightKg(entry.weight)} kg`;
}
function relativeDay(dateStr){
  const days = Math.round((parseDateKey(todayKey()) - parseDateKey(dateStr))/86400000);
  if(days===0) return 'Today';
  if(days===1) return 'Yesterday';
  if(days<7) return `${days} days ago`;
  return formatLogDate(dateStr);
}
function roundTo(value, dp=1){ const f=Math.pow(10,dp); return Math.round(value*f)/f; }
function quoteOfTheDay(){
  let hash = 0; const key = todayKey();
  for(let i=0;i<key.length;i++) hash = (hash*31 + key.charCodeAt(i))>>>0;
  return MOTIVATIONAL_QUOTES[hash % MOTIVATIONAL_QUOTES.length];
}
function greetingText(name){
  const h = new Date().getHours();
  if(h<5)  return `Still up, ${name}?`;
  if(h<12) return `Good morning, ${name}`;
  if(h<17) return `Good afternoon, ${name}`;
  if(h<21) return `Good evening, ${name}`;
  return `Late one, ${name}?`;
}
function appreciationLine(totalSets, prCount){
  const name = DATA.settings.userName || 'there';
  if(prCount>0)      return `🏆 ${prCount} new PR${prCount>1?'s':''} today — great session, ${name}!`;
  if(totalSets>=15)  return `Huge effort — you crushed ${totalSets} sets today!`;
  if(totalSets>=8)   return `Great session! You crushed ${totalSets} sets today.`;
  if(totalSets>0)    return `Nice work getting ${totalSets} set${totalSets>1?'s':''} in today.`;
  return `Session logged — every bit of movement counts.`;
}

