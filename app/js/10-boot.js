/* ============================== §10 APP ============================== */
/* Create the rest channel early. Android ignores later edits to an
   existing channel, so a new id is required to pick up the default sound. */
ensureRestNotifyChannel();
try{ purgeDemoData(); }
catch(err){ console.error(APP_NAME+': demo cleanup failed', err); }
try{ upgradePrFlags(); }
catch(err){ console.error(APP_NAME+': PR re-rank failed', err); }
renderApp();

document.addEventListener('visibilitychange', ()=>{
  if(document.hidden) pauseWorkoutForBackground();
  else if(closeStaleWorkout() || maybeTrimAwayTime()) renderApp();
  else syncWorkoutTimer();
});
window.addEventListener('pagehide', pauseWorkoutForBackground);

const capApp = capacitorAppPlugin();
if(capApp && capApp.addListener){
  capApp.addListener('appStateChange', (state)=>{
    if(state && state.isActive===false) pauseWorkoutForBackground();
    else if(closeStaleWorkout() || maybeTrimAwayTime()) renderApp();
    else syncWorkoutTimer();
  });
  capApp.addListener('backButton', ()=>{
    if(closeTopOverlay()) return;
    if(VIEW==='today' && homeScreen==='workout'){ backToLanding(); return; }
    if(capApp.exitApp) capApp.exitApp();
  });
} else {
  window.addEventListener('popstate', ()=>{
    if(ignoreHistoryPop) return;
    if(!overlayIsOpen()) return;
    closeTopOverlay();
  });
}

