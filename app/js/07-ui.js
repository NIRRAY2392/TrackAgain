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
  timer:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M10 2h4"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  dumbbell:'<path d="M6.5 6.5v11"/><path d="M17.5 6.5v11"/><path d="M4 9v6"/><path d="M20 9v6"/><path d="M6.5 12h11"/>',
  download:'<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/>'
};
function icon(name, size){
  size = size || 20;
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]||''}</svg>`;
}
function logoMarkHtml(){
  return `<svg class="logo-mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="currentColor"/><path d="M8 19.5L16 10.5L24 19.5" stroke="#000000" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M10 22.5H22" stroke="#000000" stroke-width="2.4" stroke-linecap="round"/></svg>`;
}
function currentTheme(){ return document.documentElement.getAttribute('data-theme')==='dark' ? 'dark' : 'light'; }
function setTheme(theme){
  const next = theme==='dark' ? 'dark' : 'light';
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
/* Light tick on every log; a double pulse for PRs and finishing the target sets. */
function hapticTick(strong){
  const H = capPlugin('Haptics');
  if(H){
    H.impact({style: strong ? 'HEAVY' : 'LIGHT'}).catch(()=>{});
    if(strong) setTimeout(()=> H.impact({style:'HEAVY'}).catch(()=>{}), 140);
  } else if(navigator.vibrate) navigator.vibrate(strong ? [35,90,35] : 12);
}
/* The exercise card's coach line gives the feedback; only PRs earn a toast. */
function celebrateSets(sets, milestone){
  const pr = sets.some(s=>s.isPR);
  if(pr) showToast('🏆 New personal record! You crushed it!', true);
  hapticTick(pr || !!milestone);
}
function celebrateSet(set, milestone){ celebrateSets([set], milestone); }
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
   opts: {root, title, zIndex, centered, drag, startFull, onBack, onRequestClose, onClosed, build(body, sheet)} */
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
/* The page behind an open sheet or dialog must not scroll. */
function syncOverlayLock(){
  document.documentElement.classList.toggle('overlay-open', overlayIsOpen());
}
(function watchOverlayRoots(){
  const observer = new MutationObserver(syncOverlayLock);
  [...Object.values(SHEET_ROOT), 'confirmRoot'].forEach(id=>{
    const n = document.getElementById(id);
    if(n) observer.observe(n, {childList:true});
  });
})();
function capPlugin(name){
  try{ return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[name]) || null; }
  catch(_){ return null; }
}
function capacitorAppPlugin(){ return capPlugin('App'); }
/* Screen stays on while a workout is open (Settings → Keep screen on). */
let screenKeptAwake = false;
function setScreenAwake(on){
  const want = !!on && !!(DATA && DATA.settings && DATA.settings.keepScreenOn);
  if(want===screenKeptAwake) return;
  const plugin = capPlugin('KeepAwake');
  if(!plugin) return;
  screenKeptAwake = want;
  const call = want ? plugin.keepAwake : plugin.allowSleep;
  if(typeof call==='function') Promise.resolve(call.call(plugin)).catch(()=>{ screenKeptAwake = !want; });
}
/* Android app only: hide the status and navigation bars (Settings → Full screen). */
function setFullscreen(on){
  const plugin = capPlugin('Fullscreen');
  if(!plugin || typeof plugin.set!=='function') return;
  Promise.resolve(plugin.set({enabled:!!on})).catch(()=>{});
}
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
/* Back button / browser back. The history entry (web) is already gone, so the
   overlay count is adjusted here instead of by sheet.close. Sheets go through
   their own close request, so discard guards and onClosed still run. */
let closingFromBack = false;
function closeTopOverlay(){
  closingFromBack = true;
  try{
    const confirm = document.getElementById('confirmRoot');
    if(confirm && confirm.innerHTML.trim()){
      confirm.innerHTML='';
      overlayStack = Math.max(0, overlayStack-1);
      return true;
    }
    const order = [SHEET_ROOT.form, SHEET_ROOT.picker, SHEET_ROOT.main];
    for(const id of order){
      const root = document.getElementById(id);
      if(!root || !root.innerHTML.trim()) continue;
      const node = root.firstElementChild;
      overlayStack = Math.max(0, overlayStack-1);
      if(typeof root._requestClose==='function') root._requestClose();
      else root.innerHTML='';
      if(node && root.contains(node)){
        // Close was refused (e.g. "discard changes?"): the sheet keeps its history entry.
        overlayStack++;
        if(!capacitorAppPlugin()){ try{ history.pushState({overlay:APP_NAME, n:overlayStack}, ''); }catch(_){} }
      }
      return true;
    }
    return false;
  } finally {
    closingFromBack = false;
  }
}
function openSheet(opts){
  const root = document.getElementById(opts.root || SHEET_ROOT.main);
  const bgStyle = `${opts.zIndex?`z-index:${opts.zIndex};`:''}${opts.centered?'align-items:center;':''}`;
  const boxStyle = opts.centered ? 'border-radius:18px;max-width:380px;width:88%;animation:none;' : '';
  const draggable = !opts.centered && opts.drag!==false;
  const node = el(`
    <div class="modal-bg" style="${bgStyle}">
      <div class="modal" style="${boxStyle}">
        ${draggable ? '<div class="sheet-grab" aria-hidden="true"></div>' : ''}
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
      if(!ignoreHistoryPop && !closingFromBack) popOverlayHistory();
    }
  };
  const requestClose = ()=> opts.onRequestClose ? opts.onRequestClose(sheet) : sheet.close();
  const closeBtn = q('[data-close]',node); if(closeBtn) closeBtn.onclick = requestClose;
  const backBtn  = q('[data-back]',node);  if(backBtn)  backBtn.onclick  = ()=> opts.onBack(sheet);
  node.onclick = (e)=>{ if(e.target===node) requestClose(); };
  const replacing = !!(root.innerHTML && root.innerHTML.trim());
  const prevState = replacing ? root._sheetState : null;
  root.innerHTML=''; root.appendChild(node);
  root._requestClose = ()=>{ if(root.contains(node)) requestClose(); };
  if(!replacing) pushOverlayHistory();
  if(opts.build) opts.build(sheet.body, sheet);
  if(draggable) attachSheetDrag(root, node, q('.modal',node), requestClose, opts, prevState);
  return sheet;
}

/* Bottom sheets taller than the "peek" height (60% of the screen) open at peek
   so the page behind stays visible. Swiping or scrolling up raises them to full
   height; pulling down from the top of the content lowers them back to peek,
   and pulling below the resting height closes them. The state is kept on the
   root so a sheet redrawn in place (pickers, editors) doesn't drop back down. */
const SHEET_PEEK = 0.6, SHEET_MIN_PEEK = 48, SHEET_SNAP_MS = 280;
function attachSheetDrag(root, node, modal, requestClose, opts, prevState){
  let state = prevState || (opts.startFull ? 'full' : null);
  let H = 0, peek = 0, offset = 0, drag = null, closing = false;
  let lastScrollAt = 0, lastWheelAt = 0;
  node.classList.add('sheet-drag');

  const measure = ()=>{
    H = modal.offsetHeight;
    const extra = H - Math.round(window.innerHeight*SHEET_PEEK);
    peek = extra >= SHEET_MIN_PEEK ? extra : 0;
    if(!peek) state = 'full';
    else if(!state) state = 'peek';
  };
  const rest = ()=> state==='peek' ? peek : 0;
  const paint = (y, animate)=>{
    offset = y;
    node.classList.toggle('snapping', !!animate);
    modal.style.transform = y ? `translateY(${y}px)` : '';
    const fade = y<=peek ? 1 : Math.max(0, 1-(y-peek)/Math.max(1, H-peek));
    node.style.setProperty('--sheet-fade', fade.toFixed(3));
    root._sheetState = state;
  };
  const setState = (s, animate)=>{ state = (s==='peek' && peek) ? 'peek' : 'full'; paint(rest(), animate); };
  const dismiss = ()=>{
    closing = true;
    paint(H, true);
    setTimeout(()=>{
      closing = false;
      if(!root.contains(node)) return;
      requestClose();
      if(root.contains(node)) paint(rest(), true);
    }, SHEET_SNAP_MS);
  };
  const release = (v)=>{
    const projected = offset + (Math.abs(v) > 0.5 ? v*150 : 0);
    if(projected > peek + Math.min(160, Math.max(80, (H-peek)/3))) return dismiss();
    if(Math.abs(v) > 0.5) setState(v<0 ? 'full' : 'peek', true);
    else setState(peek && offset > peek/2 ? 'peek' : 'full', true);
  };

  /* drag gestures (touch anywhere on the sheet, mouse on the header) */
  const isHandle = (t)=> !!t.closest('.sheet-grab,.modal-top');
  const start = (x, y, target)=>{
    if(closing || target.closest('input[type=range],canvas,select,[data-no-drag]')){ drag = null; return; }
    drag = {x0:x, y0:y, handle:isHandle(target), on:false, y, t:performance.now(), v:0};
  };
  const move = (x, y, e)=>{
    if(!drag) return;
    const dx = x-drag.x0, dy = y-drag.y0;
    if(!drag.on){
      if(!dy && state!=='peek') return;
      const canDrag = state==='peek' || (dy>0 && (modal.scrollTop<=0 || drag.handle));
      if(!canDrag){ drag = null; return; }
      if(e.cancelable) e.preventDefault();
      if(Math.abs(dx)<6 && Math.abs(dy)<6) return;
      if(Math.abs(dx) > Math.abs(dy)){ drag = null; return; }
      drag.on = true; drag.base = offset; drag.y0 = y;
      drag.y = y; drag.t = performance.now(); drag.v = 0;
      node.classList.add('dragging');
    }
    if(e.cancelable) e.preventDefault();
    const now = performance.now(), dt = now-drag.t;
    if(dt>=4){
      drag.v = 0.8*((y-drag.y)/dt) + 0.2*drag.v;
      drag.t = now; drag.y = y;
    }
    paint(Math.max(0, drag.base + (y-drag.y0)), false);
  };
  const end = ()=>{
    if(drag && drag.on){
      node.classList.remove('dragging');
      release(performance.now()-drag.t > 80 ? 0 : drag.v);
    }
    drag = null;
  };
  modal.addEventListener('touchstart', (e)=>{
    if(e.touches.length!==1){ drag = null; return; }
    start(e.touches[0].clientX, e.touches[0].clientY, e.target);
  }, {passive:true});
  modal.addEventListener('touchmove', (e)=>{
    if(drag) move(e.touches[0].clientX, e.touches[0].clientY, e);
  }, {passive:false});
  modal.addEventListener('touchend', end);
  modal.addEventListener('touchcancel', end);
  modal.addEventListener('mousedown', (e)=>{
    if(e.button!==0 || !isHandle(e.target) || e.target.closest('button')) return;
    start(e.clientX, e.clientY, e.target);
    const mm = (ev)=> move(ev.clientX, ev.clientY, ev);
    const mu = ()=>{ window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu); end(); };
    window.addEventListener('mousemove', mm);
    window.addEventListener('mouseup', mu);
  });

  /* mouse wheel / trackpad: a fresh scroll-up gesture at the top collapses,
     momentum carried over from scrolling the content does not */
  modal.addEventListener('scroll', ()=>{
    lastScrollAt = performance.now();
    if(state==='peek' && modal.scrollTop>0 && !drag && !closing) setState('full', true);
  }, {passive:true});
  modal.addEventListener('wheel', (e)=>{
    const now = performance.now(), gap = now-lastWheelAt;
    lastWheelAt = now;
    if(drag || closing || !peek) return;
    if(state==='peek' && e.deltaY>0){ e.preventDefault(); setState('full', true); }
    else if(state==='full' && e.deltaY<0 && modal.scrollTop<=0 && gap>250 && now-lastScrollAt>250){
      e.preventDefault(); setState('peek', true);
    }
  }, {passive:false});

  /* typing needs the whole sheet above the keyboard */
  const TYPING = 'textarea,input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit])';
  modal.addEventListener('focusin', (e)=>{
    if(state==='peek' && e.target.matches(TYPING)) setState('full', true);
  });

  /* content or viewport size changes (search results, rotation, keyboard) */
  const refit = ()=>{
    if(!root.contains(node)){
      if(ro) ro.disconnect();
      window.removeEventListener('resize', refit);
      return;
    }
    const oldH = H, oldPeek = peek;
    measure();
    if((H!==oldH || peek!==oldPeek) && !closing && !(drag && drag.on)) paint(rest(), false);
  };
  const ro = window.ResizeObserver ? new ResizeObserver(refit) : null;
  if(ro) ro.observe(modal);
  window.addEventListener('resize', refit);

  measure();
  if(state==='peek' && document.activeElement && modal.contains(document.activeElement)
     && document.activeElement.matches(TYPING)) state = 'full';
  if(prevState){ paint(rest(), false); return; }
  paint(H, false);
  void modal.offsetHeight;
  paint(rest(), true);
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

/* Slot-machine clock: each digit is a reel that rolls to its new value.
   The reel holds 0-9 twice. Counting up rests on the first copy and rolls
   forward into the second on 9→0; counting down (down=true) rests on the
   second copy and rolls back into the first on 0→9. After a wrap the reel
   snaps to its resting copy, which shows the same digit, so it is unseen. */
const SLOT_REEL = '01234567890123456789';
function slotBase(d, down){ return down ? 10+d : d; }
function slotShape(text){ return [...text].map(c=>/\d/.test(c)?'d':c).join(''); }
function slotClockHtml(text, down){
  return [...text].map(ch=> /\d/.test(ch)
    ? `<span class="slot" data-d="${ch}"><span class="slot-reel" style="transform:translateY(${-slotBase(+ch,down)}em)">${[...SLOT_REEL].map(x=>`<span>${x}</span>`).join('')}</span></span>`
    : `<span class="slot-sep">${ch}</span>`).join('');
}
function snapSlot(slot, down){
  if(!slot.dataset.wrapped) return;
  const reel = slot.firstElementChild;
  reel.style.transition = 'none';
  reel.style.transform = `translateY(${-slotBase(+slot.dataset.d,down)}em)`;
  void reel.offsetHeight;
  reel.style.transition = '';
  delete slot.dataset.wrapped;
}
function paintSlotClock(node, text, down){
  node.setAttribute('aria-label', text);
  const shape = slotShape(text);
  if(node.dataset.shape !== shape){
    node.dataset.shape = shape;
    node.innerHTML = slotClockHtml(text, down);
    return;
  }
  [...text].forEach((ch,i)=>{
    const slot = node.children[i];
    if(!/\d/.test(ch) || slot.dataset.d===ch) return;
    snapSlot(slot, down);
    const prev = +slot.dataset.d, next = +ch;
    const reel = slot.firstElementChild;
    slot.dataset.d = ch;
    if(down ? next<prev : next>prev){ reel.style.transform = `translateY(${-slotBase(next,down)}em)`; return; }
    slot.dataset.wrapped = '1';
    reel.style.transform = `translateY(${-(down ? next : 10+next)}em)`;
    reel.addEventListener('transitionend', ()=> snapSlot(slot, down), {once:true});
  });
}

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
function setDotsHtml(done, target, freshIndex){
  const n = Math.max(target, done, 0);
  if(!n) return '';
  const extra = Math.max(done - target, 0);
  const label = extra
    ? done+' of '+target+' sets, '+extra+' bonus'
    : done+' of '+target+' sets';
  let html = '<div class="set-dots" role="img" aria-label="'+label+'">';
  for(let i=0;i<n;i++){
    const cls = i<done ? (i<target ? 'on' : 'bonus') : '';
    html += `<span class="set-dot ${cls}${i===freshIndex?' fresh':''}"></span>`;
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
const restTimers = {}; // WORKOUT_REST_ID -> {end, seconds, name, token}
let restSeq = 0;
/* Scheduling is async; a timer stopped meanwhile must not leave a notification behind. */
function restTimerLive(exerciseId, token){
  const t = restTimers[exerciseId];
  return !!t && t.token===token;
}
let restTicker = null;

function restNotificationsAvailable(){ return !!capPlugin('LocalNotifications'); }
function hapticsAvailable(){ return !!capPlugin('Haptics'); }
function restNotificationId(exerciseId){
  let h = 0; for(let i=0;i<exerciseId.length;i++) h = (h*31 + exerciseId.charCodeAt(i)) | 0;
  return Math.abs(h) % 2000000000;
}
function restNotifyCopy(){
  return {title:'Rest complete', body:restUpNextText()};
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
    scheduleRestNotification(id, Math.max(1, Math.round((t.end-Date.now())/1000)), t.name, t.token);
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
async function scheduleRestNotification(exerciseId, seconds, exerciseName, token){
  if(!DATA.settings.restNotify || !restTimerLive(exerciseId, token)) return;
  const {title, body} = restNotifyCopy();
  const waitMs = Math.max(1000, Math.round(seconds*1000));
  if(restNotificationsAvailable()){
    const LocalNotifications = capPlugin('LocalNotifications');
    const id = restNotificationId(exerciseId);
    const at = new Date(Date.now()+waitMs);
    const exact = await exactAlarmStatus();
    if(!restTimerLive(exerciseId, token)) return;
    /* Denied exact alarms must not be requested again here: LocalNotifications
       opens Alarms & reminders on every exact schedule until the user allows it. */
    const schedule = {at, allowWhileIdle:true, isExactNotification: exact!=='denied'};
    LocalNotifications.cancel({notifications:[{id}]}).catch(()=>{}).finally(()=>{
      if(!restTimerLive(exerciseId, token)) return;
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
      if(!restTimerLive(exerciseId, token)) return;
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
/* After a workout ends: also drop any pending rest alert that slipped past its timer. */
function cancelAllRestNotifications(){
  cancelRestNotification(WORKOUT_REST_ID);
  if(!restNotificationsAvailable()) return;
  const LN = capPlugin('LocalNotifications');
  if(typeof LN.getPending!=='function') return;
  LN.getPending().then(res=>{
    const rest = ((res && res.notifications) || []).filter(n=> n && n.extra && n.extra.type==='rest');
    if(rest.length) return LN.cancel({notifications:rest.map(n=>({id:n.id}))});
  }).catch(()=>{});
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
  showToast(restUpNextText());
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
  if(!seconds || seconds<=0 || !activeWorkoutLog()) return;
  if(restTimers[exerciseId]) cancelRestNotification(exerciseId);
  const token = ++restSeq;
  restTimers[exerciseId] = {end: Date.now()+seconds*1000, seconds, name: exerciseName, token};
  if(!restTicker) restTicker = setInterval(tickRestTimers, 250);
  refreshTimerBar();
  if(DATA.settings.restNotify){
    const ok = await ensureRestNotifyPermission();
    if(!restTimerLive(exerciseId, token)) return;
    if(ok) await scheduleRestNotification(exerciseId, seconds, exerciseName, token);
    else showToast('Allow notifications for '+APP_NAME+' in phone settings so rest can alert you in other apps');
    if(ok) ensureRestAlertsReady();
  }
}
function extendRestTimer(exerciseId, extraSeconds){
  const t = restTimers[exerciseId]; if(!t) return;
  t.end += extraSeconds*1000; t.seconds += extraSeconds;
  if(DATA.settings.restNotify) scheduleRestNotification(exerciseId, Math.max(1, Math.round((t.end-Date.now())/1000)), t.name, t.token);
  refreshTimerBar();
}
function stopRestTimer(exerciseId){ cancelRestNotification(exerciseId); delete restTimers[exerciseId]; refreshTimerBar(); }
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
      if(node) paintSlotClock(node, restRemainingText(id), true);
      if(fill) fill.style.width = `${restProgressPct(id)}%`;
    }
  });
  if(!Object.keys(restTimers).length){ clearInterval(restTicker); restTicker = null; }
  if(expired){
    if(!document.hidden) alertRestEndedSecondary();
    refreshTimerBar();
  }
}

/* Rest buttons for the workout timer bar. Resting: +30s and Skip.
   Idle: "Rest" at planRow's rest (or the Settings default) plus quick alternates. */
function restControlsEl(exerciseId, planRow, exerciseName){
  const row = el(`<div class="tb-rest"></div>`);
  if(restTimers[exerciseId]){
    const extend = el(`<button class="btn secondary">+30s</button>`);
    const skip = el(`<button class="btn">Skip rest</button>`);
    extend.onclick = ()=> extendRestTimer(exerciseId, 30);
    skip.onclick = ()=> stopRestTimer(exerciseId);
    row.append(extend, skip);
    return row;
  }
  const seconds = restSecondsFor(planRow);
  const name = exerciseName || '';
  if(seconds>0){
    const main = el(`<button class="btn tb-main">${icon('timer',15)} Rest ${formatMinSec(seconds)}</button>`);
    main.onclick = ()=> startRestTimer(exerciseId, seconds, name);
    row.appendChild(main);
  }
  [60,90,120].filter(s=>s!==seconds).forEach(s=>{
    const b = el(`<button class="btn secondary">${formatMinSec(s)}</button>`);
    b.onclick = ()=> startRestTimer(exerciseId, s, name);
    row.appendChild(b);
  });
  return row;
}

