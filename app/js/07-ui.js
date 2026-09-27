/* ============================ §7 UI KIT ============================ */
const ICON_PATHS = {
  home:'<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-7h4v7"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/>',
  history:'<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v6l4 2"/>',
  trophy:'<path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 6H5a3 3 0 0 0 3 5"/><path d="M17 6h2a3 3 0 0 1-3 5"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  flame:'<path d="M12 3c2 4-1 6 1 9 1.5 2 4 2 4 6a5 5 0 0 1-10 0c0-4 3-6 3-10 0-2-1-3 2-5Z"/>',
  plus:'<path d="M12 5v14"/><path d="M5 12h14"/>',
  minus:'<path d="M5 12h14"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.5h.01"/>',
  x:'<path d="M18 6 6 18"/><path d="M6 6l12 12"/>',
  pencil:'<path d="M17 3.5a2.12 2.12 0 0 1 3 3L8.5 18 4 20l2-4.5Z"/>',
  reopen:'<path d="M3 12a9 9 0 1 0 2.5-6.2"/><path d="M3 4v5h5"/>',
  lightbulb:'<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12c.6.6 1 1.5 1 2.4V18h6v-1.6c0-.9.4-1.8 1-2.4A7 7 0 0 0 12 2Z"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.9 4.9 1.4 1.4"/><path d="m17.7 17.7 1.4 1.4"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m4.9 19.1 1.4-1.4"/><path d="m17.7 6.3 1.4-1.4"/>',
  moon:'<path d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5Z"/>',
  chevronLeft:'<path d="m15 18-6-6 6-6"/>',
  chevronRight:'<path d="m9 18 6-6-6-6"/>',
  chevronUp:'<path d="m6 15 6-6 6 6"/>',
  chevronDown:'<path d="m6 9 6 6 6-6"/>',
  copy:'<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  trash:'<path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6 7l1 13h10l1-13"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  link:'<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 0 1 0 10h-2"/><path d="M8 12h8"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  dumbbell:'<path d="M6.5 6.5v11"/><path d="M17.5 6.5v11"/><path d="M4 9v6"/><path d="M20 9v6"/><path d="M6.5 12h11"/>'
};
function icon(name, size){
  size = size || 20;
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]||''}</svg>`;
}
function logoMarkHtml(){
  return `<svg class="logo-mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="currentColor"/><path d="M8 19.5L16 10.5L24 19.5" stroke="#000000" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M10 22.5H22" stroke="#000000" stroke-width="2.4" stroke-linecap="round"/></svg>`;
}
function currentTheme(){ return document.documentElement.getAttribute('data-theme')==='light' ? 'light' : 'dark'; }
function setTheme(theme){
  const next = theme==='light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try{ localStorage.setItem(THEME_KEY, next); }catch(_){}
}
function el(html){ const t=document.createElement('template'); t.innerHTML=html.trim(); return t.content.firstChild; }
function q(sel, root=document){ return root.querySelector(sel); }
function qa(sel, root=document){ return [...root.querySelectorAll(sel)]; }
function escapeHtml(value){ return String(value).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

let toastTimer = null;
/* `action` is optional: {label, onClick} adds a button (e.g. Undo) and keeps the toast up longer. */
function showToast(message, isPR, action){
  const root = document.getElementById('toastRoot');
  root.innerHTML = `<div class="toast ${isPR?'pr':''}">${escapeHtml(message)}${action ? `<button type="button" class="toast-action">${escapeHtml(action.label)}</button>` : ''}</div>`;
  if(toastTimer) clearTimeout(toastTimer);
  const clear = ()=>{ root.innerHTML=''; if(toastTimer) clearTimeout(toastTimer); toastTimer = null; };
  if(action) root.querySelector('.toast-action').onclick = ()=>{ clear(); action.onClick(); };
  toastTimer = setTimeout(clear, action ? 4000 : (isPR?2600:1800));
}
function celebrateSet(set){
  if(set.isPR) showToast('🏆 New personal record! You crushed it!', true);
  else showToast(HYPE_MESSAGES[Math.floor(Math.random()*HYPE_MESSAGES.length)]);
}
function confirmAction(message, confirmLabel, onConfirm){
  const root = document.getElementById('confirmRoot');
  const box = el(`
    <div class="modal-bg" style="z-index:300;align-items:center;">
      <div class="modal" style="border-radius:16px;max-width:340px;width:88%;padding:20px;animation:none;">
        <p style="margin-bottom:16px;">${escapeHtml(message)}</p>
        <div class="row">
          <button class="btn secondary" data-no style="flex:1;">Cancel</button>
          <button class="btn" data-yes style="flex:1;background:var(--text);color:var(--bg);border-color:var(--text);">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    </div>`);
  root.innerHTML=''; root.appendChild(box);
  pushOverlayHistory();
  const close = ()=>{ root.innerHTML=''; popOverlayHistory(); };
  box.onclick = (e)=>{ if(e.target===box) close(); };
  q('[data-no]',box).onclick = close;
  q('[data-yes]',box).onclick = ()=>{ close(); onConfirm(); };
}
/* Two real choices. The exercise is already in the workout; this only
   decides whether the split template changes too. */
function chooseAction(message, primaryLabel, onPrimary, secondaryLabel, onSecondary){
  const root = document.getElementById('confirmRoot');
  const box = el(`
    <div class="modal-bg" style="z-index:300;align-items:center;">
      <div class="modal" style="border-radius:16px;max-width:340px;width:88%;padding:20px;animation:none;">
        <p style="margin-bottom:16px;">${escapeHtml(message)}</p>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <button class="btn" data-yes>${escapeHtml(primaryLabel)}</button>
          <button class="btn secondary" data-alt>${escapeHtml(secondaryLabel)}</button>
        </div>
      </div>
    </div>`);
  root.innerHTML=''; root.appendChild(box);
  pushOverlayHistory();
  const close = ()=>{ root.innerHTML=''; popOverlayHistory(); };
  const pickSecondary = ()=>{ close(); if(onSecondary) onSecondary(); };
  box.onclick = (e)=>{ if(e.target===box) pickSecondary(); };
  q('[data-alt]',box).onclick = pickSecondary;
  q('[data-yes]',box).onclick = ()=>{ close(); if(onPrimary) onPrimary(); };
}

/* One bottom sheet implementation for every modal in the app.
   opts: {root, title, zIndex, centered, onBack, onRequestClose, onClosed, build(body, sheet)} */
const SHEET_ROOT = {main:'modalRoot', picker:'pickerRoot', form:'formRoot'};
let overlayStack = 0;
let ignoreHistoryPop = false;
function overlayIsOpen(){
  const confirm = document.getElementById('confirmRoot');
  if(confirm && confirm.innerHTML.trim()) return true;
  return Object.values(SHEET_ROOT).some(id=>{
    const n = document.getElementById(id);
    return n && n.innerHTML.trim();
  });
}
function capPlugin(name){
  try{ return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[name]) || null; }
  catch(_){ return null; }
}
function capacitorAppPlugin(){ return capPlugin('App'); }
function pushOverlayHistory(){
  overlayStack++;
  if(capacitorAppPlugin()) return;
  try{ history.pushState({overlay:APP_NAME, n:overlayStack}, ''); }catch(_){}
}
function popOverlayHistory(){
  if(overlayStack<=0) return;
  overlayStack--;
  if(capacitorAppPlugin()) return;
  ignoreHistoryPop = true;
  try{ history.back(); }catch(_){}
  setTimeout(()=>{ ignoreHistoryPop = false; }, 80);
}
function closeTopOverlay(){
  const confirm = document.getElementById('confirmRoot');
  if(confirm && confirm.innerHTML.trim()){ confirm.innerHTML=''; return true; }
  const order = [SHEET_ROOT.form, SHEET_ROOT.picker, SHEET_ROOT.main];
  for(const id of order){
    const root = document.getElementById(id);
    if(!root || !root.innerHTML.trim()) continue;
    root.innerHTML='';
    return true;
  }
  return false;
}
function openSheet(opts){
  const root = document.getElementById(opts.root || SHEET_ROOT.main);
  const bgStyle = `${opts.zIndex?`z-index:${opts.zIndex};`:''}${opts.centered?'align-items:center;':''}`;
  const boxStyle = opts.centered ? 'border-radius:18px;max-width:380px;width:88%;animation:none;' : '';
  const node = el(`
    <div class="modal-bg" style="${bgStyle}">
      <div class="modal" style="${boxStyle}">
        ${opts.title!=null ? `<div class="modal-top">
            <div class="row" style="min-width:0;">
              ${opts.onBack?'<button class="back-x" data-back aria-label="Back">'+icon('chevronLeft',20)+'</button>':''}
              <h3 style="margin:0;">${escapeHtml(opts.title)}</h3>
            </div>
            <button class="close-x" data-close aria-label="Close">${icon('x',18)}</button>
          </div>` : ''}
        <div data-body></div>
      </div>
    </div>`);
  const sheet = {
    root, node, body:q('[data-body]',node),
    close(){
      root.innerHTML='';
      if(opts.onClosed) opts.onClosed();
      if(!ignoreHistoryPop) popOverlayHistory();
    }
  };
  const requestClose = ()=> opts.onRequestClose ? opts.onRequestClose(sheet) : sheet.close();
  const closeBtn = q('[data-close]',node); if(closeBtn) closeBtn.onclick = requestClose;
  const backBtn  = q('[data-back]',node);  if(backBtn)  backBtn.onclick  = ()=> opts.onBack(sheet);
  node.onclick = (e)=>{ if(e.target===node) requestClose(); };
  const replacing = !!(root.innerHTML && root.innerHTML.trim());
  root.innerHTML=''; root.appendChild(node);
  if(!replacing) pushOverlayHistory();
  if(opts.build) opts.build(sheet.body, sheet);
  return sheet;
}
function closeSheets(){
  const n = overlayStack;
  Object.values(SHEET_ROOT).forEach(id=>{ document.getElementById(id).innerHTML=''; });
  const confirm = document.getElementById('confirmRoot');
  if(confirm) confirm.innerHTML='';
  overlayStack = 0;
  if(n>0 && !capacitorAppPlugin()){
    ignoreHistoryPop = true;
    try{ history.go(-n); }catch(_){}
    setTimeout(()=>{ ignoreHistoryPop = false; }, 120);
  }
}

/* small shared HTML builders */
function statGridHtml(items){
  return `<div class="stat-grid">${items.map(i=>`<div class="stat-box"><div class="val">${i.value}</div><div class="lbl">${escapeHtml(i.label)}</div></div>`).join('')}</div>`;
}
function searchFieldHtml(id, placeholder, value){
  return `<div class="search-wrap"><span class="mag">${icon('search',16)}</span><input id="${id}" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(value||'')}"></div>`;
}
function tagsHtml(list){ return list.map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join(''); }

/* Renders the logged sets of one exercise. Used by the workout screen
   (editable) and by history (read-only). */
function setRowsInto(container, sets, metric, handlers){
  handlers = handlers || {};
  const target = handlers.targetSets || 0;
  let workingI = 0;
  sets.forEach((set,i)=>{
    if(!set.isWarmup) workingI++;
    const bonus = target && !set.isWarmup && workingI > target;
    const row = el(`
      <div class="set-row set-row-in ${set.isDropSet?'dropset-row':''}">
        <span class="set-badge${bonus?' bonus':''}">${i+1}</span>
        ${set.isDropSet ? '<span class="badge-drop">🔻 Drop set</span>' : ''}
        ${bonus ? '<span class="badge-bonus">Bonus</span>' : ''}
        ${set.isWarmup ? '<span class="tag">WU</span>' : ''}
        <span>${setValueText(set, metric)}</span>
        ${set.isPR ? '<span class="trophy">🏆</span>' : ''}
        ${set.intent==='strength' ? '<span class="tag strength">Strength</span>' : ''}
        <span class="diff-tag ${effortClass(set.difficulty)}">${effortLabel(set.difficulty)}</span>
        ${handlers.onEdit ? '<button class="btn ghost" style="padding:8px;margin-left:auto;min-width:44px;" data-edit aria-label="Edit set">'+icon('pencil',16)+'</button>' : ''}
        ${handlers.onDelete ? '<button class="btn danger" style="padding:8px;min-width:44px;" data-delete aria-label="Delete set">'+icon('x',16)+'</button>' : ''}
      </div>`);
    if(handlers.onEdit)  q('[data-edit]',row).onclick  = ()=> handlers.onEdit(set);
    if(handlers.onDelete) q('[data-delete]',row).onclick = ()=> handlers.onDelete(set);
    container.appendChild(row);
  });
}

/* Per-muscle effective sets + volume for a group of sets. */
function muscleWorkCard(sets, title){
  const rows = muscleWorkForSets(sets).filter(r=>r.effectiveSets>=0.2).slice(0,6);
  if(!rows.length) return null;
  const peak = Math.max(...rows.map(r=>r.effectiveSets), 1);
  const card = el(`
    <div class="card">
      <p class="section-title" style="margin-top:0;">${escapeHtml(title)}</p>
      <p class="faint small" style="margin-bottom:8px;">≈ ${roundTo(totalEffectiveSets(sets))} effective sets · weighted by rep range and how hard each set felt</p>
      <div data-rows></div>
    </div>`);
  const box = q('[data-rows]',card);
  rows.forEach(r=>{
    box.appendChild(el(`
      <div class="mw-row">
        <span class="nm">${escapeHtml(r.muscle)}</span>
        <span class="mw-bar"><span style="width:${Math.round(r.effectiveSets/peak*100)}%"></span></span>
        <span class="mw-val">${roundTo(r.effectiveSets)} sets</span>
      </div>`));
  });
  return card;
}

function lastLoggedBits(exerciseId){
  const sessions = recentSessions(exerciseId, 1, {before:todayKey()});
  if(!sessions.length) return null;
  const last = sessions[0];
  const ex = getExercise(exerciseId);
  const metric = metricOf(ex);
  const normal = last.sets.filter(s=>!s.isDropSet && !s.isWarmup);
  const pick = (normal.length ? normal : last.sets);
  const set = pick[pick.length-1];
  return {date:last.date, text:setValueText(set, metric), difficulty:set.difficulty, set};
}
function setDotsHtml(done, target){
  const n = Math.max(target, done, 0);
  if(!n) return '';
  const extra = Math.max(done - target, 0);
  const label = extra
    ? done+' of '+target+' sets, '+extra+' bonus'
    : done+' of '+target+' sets';
  let html = '<div class="set-dots" role="img" aria-label="'+label+'">';
  for(let i=0;i<n;i++){
    const cls = i<done ? (i<target ? 'on' : 'bonus') : '';
    html += `<span class="set-dot ${cls}"></span>`;
  }
  return html+'</div>';
}
/* --- rest timer -------------------------------------------------------
   Countdown UI is in-memory (restTimers). The PRIMARY rest-end alert is a
   native system notification scheduled when rest STARTS, so Android can
   still show a heads-up banner if you leave for Instagram or lock the
   phone. JS toasts/haptics are secondary and only run if this WebView
   is still alive.

   Limitations (web / Capacitor):
   - Heads-up banners need @capacitor/local-notifications, a HIGH
     importance channel, POST_NOTIFICATIONS (Android 13+), and the user
     tapping Allow. A plain browser tab cannot overlay other apps.
   - Do not set channel sound to a raw filename. Android 8+ treats a
     missing file as "App provided" and plays nothing. Omit sound so the
     channel keeps the system default notification sound.
   - Android will not update an existing channel. REST_NOTIFY_CHANNEL is
     versioned; the previous silent channel is deleted on launch.
   - On-time delivery needs exact alarms (Alarms & reminders). Some phones
     also delay alarms until Battery is Unrestricted. The app asks when it
     can; the manual steps live in Settings, plus one dismissible sheet. */
const REST_NOTIFY_CHANNEL = 'rest-heads-up-v2';
const REST_NOTIFY_CHANNEL_OLD = 'rest-heads-up-v1';
const WORKOUT_REST_ID = 'workout';
const restTimers = {}; // WORKOUT_REST_ID -> {end, seconds, name}
let restTicker = null;

function restNotificationsAvailable(){ return !!capPlugin('LocalNotifications'); }
function hapticsAvailable(){ return !!capPlugin('Haptics'); }
function restNotificationId(exerciseId){
  let h = 0; for(let i=0;i<exerciseId.length;i++) h = (h*31 + exerciseId.charCodeAt(i)) | 0;
  return Math.abs(h) % 2000000000;
}
function restNotifyCopy(exerciseName){
  const title = 'Rest complete';
  const body = exerciseName
    ? `Rest complete – ready for your next set of ${exerciseName}`
    : 'Rest complete – ready for your next set';
  return {title, body};
}
function isAndroidApp(){
  try{ return !!(window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform()==='android'); }
  catch(_){ return false; }
}
function batteryOptimizationPlugin(){ return capPlugin('BatteryOptimization'); }
async function ensureRestNotifyChannel(){
  if(!restNotificationsAvailable()) return;
  const LN = capPlugin('LocalNotifications');
  try{ if(LN.deleteChannel) await LN.deleteChannel({id: REST_NOTIFY_CHANNEL_OLD}); }catch(_){}
  try{
    /* No sound field: NotificationChannel then uses the system default. */
    await LN.createChannel({
      id: REST_NOTIFY_CHANNEL,
      name: 'Rest complete',
      description: 'Alert when rest ends, including over other apps',
      importance: 5,
      visibility: 1,
      vibration: true,
      lights: true
    });
  }catch(err){ console.error(APP_NAME+': could not create notification channel', err); }
}
async function exactAlarmStatus(){
  if(!restNotificationsAvailable()) return 'unknown';
  const LN = capPlugin('LocalNotifications');
  if(!LN.checkExactNotificationSetting) return 'unknown';
  try{
    const status = await LN.checkExactNotificationSetting();
    if(!status || !status.exact_alarm) return 'unknown';
    return status.exact_alarm==='granted' ? 'granted' : 'denied';
  }catch(_){ return 'unknown'; }
}
async function requestExactAlarm(){
  const LN = restNotificationsAvailable() && capPlugin('LocalNotifications');
  if(!LN || !LN.changeExactNotificationSetting) return exactAlarmStatus();
  try{
    const status = await LN.changeExactNotificationSetting();
    if(status && status.exact_alarm) return status.exact_alarm==='granted' ? 'granted' : 'denied';
  }catch(_){}
  return exactAlarmStatus();
}
async function batteryOptimizationState(){
  const plugin = batteryOptimizationPlugin();
  if(!plugin || typeof plugin.isBatteryOptimizationEnabled!=='function') return 'unavailable';
  try{
    const res = await plugin.isBatteryOptimizationEnabled();
    return res && res.enabled ? 'restricted' : 'unrestricted';
  }catch(_){ return 'unavailable'; }
}
async function requestBatteryUnrestricted(){
  const plugin = batteryOptimizationPlugin();
  if(!plugin || typeof plugin.requestIgnoreBatteryOptimization!=='function') return batteryOptimizationState();
  try{ await plugin.requestIgnoreBatteryOptimization(); }catch(_){}
  return batteryOptimizationState();
}
function rescheduleActiveRestNotifications(){
  Object.keys(restTimers).forEach(id=>{
    const t = restTimers[id];
    if(!t) return;
    scheduleRestNotification(id, Math.max(1, Math.round((t.end-Date.now())/1000)), t.name);
  });
}
let restSetupRunning = false;
async function runRestAlertSetup(opts){
  if(restSetupRunning) return null;
  restSetupRunning = true;
  const quiet = !!(opts && opts.quiet);
  try{
    const ok = await ensureRestNotifyPermission();
    if(!ok){
      if(!quiet) showToast('Notifications are blocked for '+APP_NAME+' in your phone settings');
      return {ok:false};
    }
    let exact = await exactAlarmStatus();
    if(exact==='denied') exact = await requestExactAlarm();
    let battery = await batteryOptimizationState();
    if(battery==='restricted') battery = await requestBatteryUnrestricted();
    if(exact!=='denied') rescheduleActiveRestNotifications();
    if(!quiet){
      if(exact==='denied') showToast('Turn on Alarms & reminders for '+APP_NAME+' so rest fires on time');
      else if(battery==='restricted') showToast('Set Battery to Unrestricted for '+APP_NAME);
      else if(isAndroidApp() && battery==='unavailable') showToast('If rest is late with the screen off, set Battery to Unrestricted');
      else showToast('Rest alerts are allowed');
    }
    return {ok:true, exact, battery};
  }finally{ restSetupRunning = false; }
}
function dismissRestBatteryHint(){
  if(DATA.settings.restBatteryHintDismissed) return;
  DATA.settings.restBatteryHintDismissed = true;
  saveData(DATA);
}
function openRestBatteryHint(){
  openSheet({
    title:'Rest alerts',
    onRequestClose(sheet){ dismissRestBatteryHint(); sheet.close(); },
    build(body, sheet){
      body.appendChild(el(`
        <p>Android can delay or silence the rest timer when the screen is off. Allow the prompts for notifications, Alarms &amp; reminders, and unrestricted battery.</p>
        <p class="faint small" style="margin-top:10px;">If no prompt appears, set it once: Settings → Apps → ${escapeHtml(APP_NAME)} → Battery → Unrestricted. Also turn on Alarms &amp; reminders if you see it.</p>
        <button class="btn" data-allow style="width:100%;margin-top:16px;">Allow now</button>
        <button class="btn secondary" data-later style="width:100%;margin-top:8px;">Not now</button>`));
      q('[data-allow]', body).onclick = async ()=>{
        DATA.settings.restSetupAsked = true;
        saveData(DATA);
        await runRestAlertSetup();
        const battery = await batteryOptimizationState();
        if(battery==='unrestricted'){
          dismissRestBatteryHint();
          sheet.close();
        }
      };
      q('[data-later]', body).onclick = ()=>{ dismissRestBatteryHint(); sheet.close(); };
    }
  });
}
function ensureRestAlertsReady(){
  if(!isAndroidApp() || !DATA.settings.restNotify) return;
  const first = !DATA.settings.restSetupAsked;
  if(first){
    DATA.settings.restSetupAsked = true;
    saveData(DATA);
  }
  (async ()=>{
    if(first) await runRestAlertSetup({quiet:true});
    if(DATA.settings.restBatteryHintDismissed) return;
    const battery = await batteryOptimizationState();
    if(battery==='unrestricted') return;
    if(overlayIsOpen()) return;
    openRestBatteryHint();
  })();
}
async function ensureRestNotifyPermission(){
  if(!restNotificationsAvailable()){
    if(!('Notification' in window)) return false;
    try{
      if(Notification.permission==='granted') return true;
      if(Notification.permission==='denied') return false;
      return (await Notification.requestPermission())==='granted';
    }catch(_){ return false; }
  }
  try{
    const LocalNotifications = capPlugin('LocalNotifications');
    const status = await LocalNotifications.checkPermissions();
    let granted = status.display === 'granted';
    if(!granted){
      const req = await LocalNotifications.requestPermissions();
      granted = req.display === 'granted';
    }
    if(granted) await ensureRestNotifyChannel();
    return granted;
  }catch(err){
    console.error(APP_NAME+': notification permission check failed', err);
    return false;
  }
}
async function scheduleRestNotification(exerciseId, seconds, exerciseName){
  if(!DATA.settings.restNotify) return;
  const {title, body} = restNotifyCopy(exerciseName);
  const waitMs = Math.max(1000, Math.round(seconds*1000));
  if(restNotificationsAvailable()){
    const LocalNotifications = capPlugin('LocalNotifications');
    const id = restNotificationId(exerciseId);
    const at = new Date(Date.now()+waitMs);
    const exact = await exactAlarmStatus();
    /* Denied exact alarms must not be requested again here: Capacitor 8.3
       opens Alarms & reminders on every exact schedule until the user allows it. */
    const schedule = {at, allowWhileIdle:true, isExactNotification: exact!=='denied'};
    LocalNotifications.cancel({notifications:[{id}]}).catch(()=>{}).finally(()=>{
      LocalNotifications.schedule({notifications:[{
        id,
        title,
        body,
        largeBody: body,
        channelId: REST_NOTIFY_CHANNEL,
        autoCancel: true,
        schedule,
        extra:{ type:'rest', exerciseId }
      }]}).catch(err=> console.error(APP_NAME+': schedule notification failed', err));
    });
    return;
  }
  const t = restTimers[exerciseId];
  if(t && t.webNoteTimer){ clearTimeout(t.webNoteTimer); t.webNoteTimer = null; }
  if(t && 'Notification' in window && Notification.permission==='granted'){
    t.webNoteTimer = setTimeout(()=>{
      try{
        const n = new Notification(title, {body, tag:'trackagain-rest', requireInteraction:true, silent:false, vibrate:[400,120,400]});
        n.onclick = ()=>{ try{ window.focus(); n.close(); }catch(_){ } };
      }catch(_){}
    }, waitMs);
  }
}
function cancelRestNotification(exerciseId){
  const t = restTimers[exerciseId];
  if(t && t.webNoteTimer){ clearTimeout(t.webNoteTimer); t.webNoteTimer = null; }
  if(!restNotificationsAvailable()) return;
  capPlugin('LocalNotifications').cancel({notifications:[{id:restNotificationId(exerciseId)}]}).catch(()=>{});
}
function vibrateRestEnd(){
  if(!DATA.settings.restVibrate) return;
  if(hapticsAvailable()){
    const H = capPlugin('Haptics');
    H.vibrate({duration:400}).catch(()=>{});
    setTimeout(()=> H.vibrate({duration:400}).catch(()=>{}), 220);
  } else if(navigator.vibrate) navigator.vibrate([300,120,300,120,400]);
}
function alertRestEndedSecondary(){
  vibrateRestEnd();
  showToast('Rest complete – ready for your next set');
}
function formatMinSec(seconds){
  const m = Math.floor(seconds/60), s = seconds%60;
  return s ? `${m}:${String(s).padStart(2,'0')}` : `${m}m`;
}
function defaultRestSeconds(){ return Math.max(15, Math.round((DATA.settings.restDefaultMinutes||3)*60)); }
function restSecondsFor(planRow){
  if(planRow && planRow.restSeconds===0) return 0;
  return (planRow && typeof planRow.restSeconds==='number') ? planRow.restSeconds : defaultRestSeconds();
}
function restRemainingText(exerciseId){
  const t = restTimers[exerciseId]; if(!t) return '0:00';
  const remain = t.end - Date.now();
  return remain<=0 ? '0:00' : `${Math.floor(remain/60000)}:${String(Math.floor((remain%60000)/1000)).padStart(2,'0')}`;
}
function restProgressPct(exerciseId){
  const t = restTimers[exerciseId]; if(!t) return 0;
  const remain = Math.max(0, t.end - Date.now());
  return Math.max(0, Math.min(100, Math.round((1 - remain/(t.seconds*1000)) * 100)));
}
async function startRestTimer(exerciseId, seconds, exerciseName){
  if(!seconds || seconds<=0) return;
  if(restTimers[exerciseId]) cancelRestNotification(exerciseId);
  restTimers[exerciseId] = {end: Date.now()+seconds*1000, seconds, name: exerciseName};
  if(!restTicker) restTicker = setInterval(tickRestTimers, 250);
  renderApp();
  if(DATA.settings.restNotify){
    const ok = await ensureRestNotifyPermission();
    if(ok) await scheduleRestNotification(exerciseId, seconds, exerciseName);
    else showToast('Allow notifications for '+APP_NAME+' in phone settings so rest can alert you in other apps');
    if(ok) ensureRestAlertsReady();
  }
}
function extendRestTimer(exerciseId, extraSeconds){
  const t = restTimers[exerciseId]; if(!t) return;
  t.end += extraSeconds*1000; t.seconds += extraSeconds;
  if(DATA.settings.restNotify) scheduleRestNotification(exerciseId, Math.max(1, Math.round((t.end-Date.now())/1000)), t.name);
  renderApp();
}
function stopRestTimer(exerciseId){ cancelRestNotification(exerciseId); delete restTimers[exerciseId]; renderApp(); }
function tickRestTimers(){
  const now = Date.now();
  let expired = false;
  Object.keys(restTimers).forEach(id=>{
    const remain = restTimers[id].end - now;
    const node = document.querySelector(`[data-restcountdown="${id}"]`);
    const fill = document.querySelector(`[data-restfill="${id}"]`);
    if(remain<=0){
      const t = restTimers[id];
      if(t && t.webNoteTimer){ clearTimeout(t.webNoteTimer); t.webNoteTimer = null; }
      delete restTimers[id];
      expired = true;
    } else {
      if(node) node.textContent = restRemainingText(id);
      if(fill) fill.style.width = `${restProgressPct(id)}%`;
    }
  });
  if(!Object.keys(restTimers).length){ clearInterval(restTicker); restTicker = null; }
  if(expired){
    if(!document.hidden) alertRestEndedSecondary();
    if(VIEW==='today') renderApp();
  }
}

function restCardEl(exerciseId){
  const pct = restProgressPct(exerciseId);
  const card = el(`
    <div class="rest-card is-running">
      <div class="rest-top">
        <span class="rest-label">Resting</span>
        <span class="rest-time" data-restcountdown="${exerciseId}">${restRemainingText(exerciseId)}</span>
      </div>
      <div class="rest-track"><div class="rest-fill" data-restfill="${exerciseId}" style="width:${pct}%"></div></div>
      <div class="rest-actions">
        <button class="btn secondary" data-extend>+30s</button>
        <button class="btn" data-skip>Skip rest</button>
      </div>
    </div>`);
  q('[data-extend]',card).onclick = ()=> extendRestTimer(exerciseId, 30);
  q('[data-skip]',card).onclick = ()=> stopRestTimer(exerciseId);
  return card;
}
/* Idle state: one "Start rest" button for the whole workout, sized to the
   Settings default (or a plan-row override when one is passed), plus quick alternates. */
function restStartRowEl(planRow, exerciseName){
  const seconds = restSecondsFor(planRow);
  if(seconds===0) return el(`<p class="faint small">No rest programmed — go when ready.</p>`);
  const wrap = el(`<div class="rest-idle"></div>`);
  const main = el(`<button class="btn rest-start">Start rest · ${formatMinSec(seconds)}</button>`);
  main.onclick = ()=> startRestTimer(planRow.exerciseId, seconds, exerciseName);
  wrap.appendChild(main);
  const alts = el(`<div class="rest-alts"></div>`);
  [60,90,120].filter(s=>s!==seconds).forEach(s=>{
    const b = el(`<button class="btn secondary">${formatMinSec(s)}</button>`);
    b.onclick = ()=> startRestTimer(planRow.exerciseId, s, exerciseName);
    alts.appendChild(b);
  });
  wrap.appendChild(alts);
  return wrap;
}

