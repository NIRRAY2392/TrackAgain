/* ============================ §6 FORMAT ============================ */
function setValueText(set, metric){
  if(set.isDropSet) return dropSetSummaryText(set, metric);
  if(metric==='weight_reps') return `${set.weight}${units()} × ${set.reps}`;
  if(metric==='reps_only')   return `${set.reps} reps`;
  if(metric==='time')        return `${set.duration}s`;
  if(metric==='assisted')    return `${set.weight}${units()} assist × ${set.reps}`;
  return '';
}
function formatPrValue(set, metric){
  if(metric==='weight_reps') return `${set.weight} kg × ${set.reps}`;
  if(metric==='reps_only')   return `${set.reps} reps`;
  if(metric==='time')        return `${set.duration} s`;
  if(metric==='assisted')    return `${set.weight} kg`;
  return setValueText(set, metric);
}
function formatPrMomentLine(moment, metric){
  return `${formatLogDate(moment.date)}: ${formatPrValue(moment.set, metric)} PR`;
}
function stageValueText(stage, metric){
  if(metric==='weight_reps') return `${stage.weight}${units()}×${stage.reps}`;
  if(metric==='reps_only')   return `${stage.reps} reps`;
  if(metric==='time')        return `${stage.duration}s`;
  if(metric==='assisted')    return `${stage.weight}${units()} assist×${stage.reps}`;
  return '';
}
function dropSetSummaryText(set, metric){
  return (set.stages||[]).map(st=>stageValueText(st, metric)).join(' → ');
}
function defaultDropStages(metric, prefillWeight){
  const base = ()=>{
    if(metric==='weight_reps' || metric==='assisted') return {weight: prefillWeight!=null?prefillWeight:'', reps:''};
    if(metric==='reps_only') return {reps:''};
    if(metric==='time') return {duration:''};
    return {};
  };
  return [base(), base()];
}
function stageFieldsHtml(metric, stage, idx){
  if(metric==='weight_reps' || metric==='assisted'){
    const label = metric==='assisted' ? 'Assist' : 'Weight';
    return `<input type="number" step="0.5" min="0" inputmode="decimal" placeholder="${label}" value="${stage.weight!=null?stage.weight:''}" data-stage-weight="${idx}" style="flex:1;min-width:0;">
            <input type="number" min="0" inputmode="numeric" placeholder="Reps" value="${stage.reps!=null?stage.reps:''}" data-stage-reps="${idx}" style="flex:1;min-width:0;">`;
  }
  if(metric==='reps_only') return `<input type="number" min="0" inputmode="numeric" placeholder="Reps" value="${stage.reps!=null?stage.reps:''}" data-stage-reps="${idx}" style="flex:1;min-width:0;">`;
  if(metric==='time') return `<input type="number" min="0" inputmode="numeric" placeholder="Seconds" value="${stage.duration!=null?stage.duration:''}" data-stage-secs="${idx}" style="flex:1;min-width:0;">`;
  return '';
}
function readStageFields(metric, root, idx){
  if(metric==='weight_reps' || metric==='assisted'){
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

