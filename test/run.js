/* RKD Log — logic tests
 *
 *   ./test/run.sh            (use this — it sets a real exit code)
 *   jsc test/run.js          (works, but jsc's quit() ignores its argument and always exits 0,
 *                             so a bare run reports failures on stdout without failing)
 *
 * There is no build step and no test runner, and the app is one self-contained index.html by
 * design. So this harness reads index.html, cuts out the pure-logic regions by source anchor,
 * and runs them against stub globals. It never copies logic — if a region drifts, the anchor
 * fails loudly rather than testing a stale duplicate.
 *
 * Covered: block/week identity, the scoring curves and medal tiers, weekly totals grouping,
 * the durable-draft lifecycle, and the PR grid. Anything DOM-, Bluetooth- or timing-shaped is
 * out of scope — that still needs a real device.
 *
 * Adding a test: find or add a region() below, then a section() with assertions.
 */

/* ---------------------------------------------------------------- source */
var SRC=null, TRIED=["index.html","../index.html"];
for(var i=0;i<TRIED.length&&SRC===null;i++){ try{SRC=readFile(TRIED[i]);}catch(e){} }
if(SRC===null){ print("FATAL: index.html not found. Run from the repo root: jsc test/run.js"); quit(1); }

var FAILED=0, CHECKS=0;
/* RESULT: is the sentinel run.sh gates on, since quit()'s argument is ignored here. */
function fatal(m){ print("\nFATAL: "+m); print("RESULT:FAIL"); quit(1); }

/* Slice [startAnchor, endAnchor) out of index.html. Missing anchors are a hard failure: it means
   the code moved and this test is no longer pointed at the thing it claims to test. */
function region(startAnchor,endAnchor){
  var a=SRC.indexOf(startAnchor);
  if(a<0) fatal("anchor not found in index.html: "+JSON.stringify(startAnchor));
  var b=SRC.indexOf(endAnchor,a+startAnchor.length);
  if(b<0) fatal("end anchor not found in index.html: "+JSON.stringify(endAnchor));
  return SRC.slice(a,b);
}
/* Indirect eval keeps top-level `var`/function declarations global, but `const`/`let` would stay
   trapped in the eval's own scope. Column-0 declarations are top-level by construction here, so
   rewriting just those to `var` exposes them. Indented ones are function-local and left alone. */
function globalize(code){ return code.replace(/^(const|let)\s+/gm,"var "); }
function loadRegions(){
  var code=Array.prototype.slice.call(arguments).join("\n");
  (0,eval)(globalize(code));
}

/* ---------------------------------------------------------------- stubs */
var LS={};
var localStorage={
  get length(){return Object.keys(LS).length;},
  key:function(i){return Object.keys(LS)[i];},
  getItem:function(k){return k in LS?LS[k]:null;},
  setItem:function(k,v){LS[k]=String(v);},
  removeItem:function(k){delete LS[k];}
};
var storageOK=true;
var clearTimeout=function(){};                      /* jsc has setTimeout but not clearTimeout */
var window={addEventListener:function(){}};
var DOM={};                                          /* id -> element stub; elements carry their own id */
function resetDOM(){ DOM={weekSel:{id:"weekSel",value:"8"},daySel:{id:"daySel",value:"meso02Wed"},
                          clock:{id:"clock",textContent:"0:00"},note:{id:"note",value:""}}; }
resetDOM();
var document={
  addEventListener:function(){},
  getElementById:function(id){ return DOM[id]||null; },
  /* captureSessionDraft() is the only caller, always with the w_/r_ session-input selector.
     Matching on the id prefix is enough to model it — "weekSel" is not caught, the underscore
     is part of the pattern. */
  querySelectorAll:function(sel){
    return Object.keys(DOM).filter(function(id){ return /^[wr]_/.test(id); })
                           .map(function(id){ return DOM[id]; });
  }
};
/* Put a session's typed values into the form the way the app would have them sitting there. */
function fillForm(fields,extra){
  Object.keys(fields).forEach(function(id){ DOM[id]={id:id,value:fields[id]}; });
  extra=extra||{};
  DOM.strain={id:"strain",value:extra.strain||""};
  DOM.note={id:"note",value:extra.note||""};
  if(extra.activity!=null) DOM.z2act={id:"z2act",value:extra.activity};
}
/* What the form looks like after render() rebuilds it: the day's inputs are all present, all
   empty. Not the same as having no inputs at all — restoreSessionDraft() only writes into
   elements that exist, so the distinction decides whether a draft can repopulate the form. */
function emptyForm(ids){
  var f={}; ids.forEach(function(id){ f[id]=""; });
  fillForm(f); curRPE=0;
}

/* App globals the extracted regions read. Tests set these directly. */
var pxiSet={maxHr:185,restingHr:46,target:105,model:"auto"};
var live={zoneSecs:[0,0,0,0,0,0],pxi:0,lastBpm:null,secs:0,tick:null};
var sessionDraft=null, freeformNames=[], curRPE=0, sessAcc=0;
/* Mirrors the real one-liner in source (not extracted — it lives outside the durable-drafts
   region resumeDraft() is sliced from) so that region's normalizeFreeform() call resolves. */
function normalizeFreeform(f){ return !Array.isArray(f)?[]:Array.isArray(f[0])?[].concat.apply([],f):f; }
/* extraSets/setKey/extraFor are loaded from source below, NOT stubbed — setKey is what scopes an
   extra set to its day, and a stub here would have quietly tested itself instead of it. Nor is
   blockHtml: which function the "− Set" button is wired to is only visible in the markup, so
   asserting on the handlers alone would let a one-tap regression through. */
var extraSets={};
function interval(b){return 90;}                     /* blockHtml only prints this */
function lastFor(key){return null;}                  /* no previous-session placeholders */
var LOGS=[], TODAY="2026-09-20", DAY="meso02Wed", TOASTS=[];
/* saveSession() locals the extracted save-path slice closes over. Its own `const w=..., day=...`
   line sits above the slice, so they're supplied here instead. */
var day="meso02Wed", w=8, s={name:"WEDNESDAY — Upper Push",type:"lift"}, entries=[],
    strain=null, zoneMins=null, pxi=103, model="strength", medal="GOLD";
function todayStr(){return TODAY;}
function curDay(){return DAY;}
function loadLogs(){return LOGS;}
function saveLogs(l){LOGS=l;}
function toast(m){TOASTS.push(m);}
function render(){}
function setView(){}
/* Real enough to matter: the source setRPE() ends in onSetInput(), which clears draftHold. That
   side effect is load-bearing — it is how restoreSessionDraft() could undo the post-Finish hold. */
function setRPE(v){ curRPE=v; onSetInput(); }
/* captureSessionDraft() and restoreSessionDraft() are NOT stubbed — they are loaded from source
   below. Stubbing captureSessionDraft() to a no-op is precisely what hid the post-Finish draft
   resurrection from a fully green suite: it is the function that scrapes the live form, so with
   it stubbed no test could ever observe the form being scraped after a save. */
function renderIvt(){}
var view="pxi";
/* The PR grid now groups by what the active block programmes, which it reads off the day
   templates. BLOCK_LIFTS is copied from source (it is data, not logic); getSession is stubbed,
   since what's under test is the grouping, not the 1,500 lines of program templates. */
var BLOCK_LIFTS={legacy:["upper","lower","mixed"],
                 meso01:["fullBodyA","fullBodyB","fullBodyC"],
                 meso02:["meso02Mon","meso02Wed","meso02Fri"]};
var SESSIONS={};                                     /* day -> [exercise key, ...] */
function getSession(w,day){
  return {blocks:[{ex:(SESSIONS[day]||[]).map(function(k){return {key:k,n:k};})}]};
}
/* Display-only escape helper the preset list uses; not the logic under test here. */
var escAttr=function(s){return String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");};
/* Put the four config inputs on screen the way the idle timer panel renders them. */
function ivtFields(prep,work,rest,rounds){
  DOM.ivtPrep={id:"ivtPrep",value:String(prep)}; DOM.ivtWork={id:"ivtWork",value:String(work)};
  DOM.ivtRest={id:"ivtRest",value:String(rest)}; DOM.ivtRounds={id:"ivtRounds",value:String(rounds)};
}
function ivtNameField(v){ DOM.ivtPresetName={id:"ivtPresetName",value:v}; }
function elapsedSec(){return 2460;}                  /* 41:00 */
function fmt(s){return Math.floor(s/60)+":"+String(s%60);}
function draftKey(){return "8|"+DAY;}
function resetState(){
  LS={}; LOGS=[]; TOASTS=[]; sessionDraft=null; freeformNames=[]; resetDOM(); SESSIONS={};
  extraSets={};
  live={zoneSecs:[0,0,0,0,0,0],pxi:0,lastBpm:null,secs:0,tick:null};
  sessAcc=0; curRPE=0; TODAY="2026-09-20"; DAY="meso02Wed";
  if(typeof resetCurDraft==="function") resetCurDraft();
  if(typeof draftHold!=="undefined") draftHold=false;
  if(typeof draftTimer!=="undefined") draftTimer=null;
}

/* ---------------------------------------------------------------- assertions */
var CUR="";
function section(name){ CUR=name; print("\n"+name); }
function ok(cond,msg){
  CHECKS++;
  if(cond) print("  pass  "+msg);
  else { FAILED++; print("  FAIL  "+msg); }
}
function eq(actual,expected,msg){
  ok(actual===expected, msg+"   [got "+JSON.stringify(actual)+", want "+JSON.stringify(expected)+"]");
}

/* ---------------------------------------------------------------- load logic under test */
loadRegions(
  region("const MESO01_START=","function hrText(day,w){"),          /* block/week identity   */
  region("const PTS=","const LIFT_DAYS="),                          /* curves, medals, zones */
  region("function weeklyTotals(logs){","function renderHistory(m){"),
  region("const e1rm=","const DAY_LABEL="),                         /* PR_KEYS + PR_LABEL    */
  region("const setKey=(bi,ei)=>","/* ================= HEP"),           /* extra-set keying */
  region("function blockHtml(s,bi){","/* ---- Extra sets ---- */"),      /* set rows + controls */
  region("/* ---- Extra sets ---- */","/* ---- Freeform (strengthFree)"),/* add/remove sets   */
  region("const IVT_DEFAULTS=","function ivtToggleMute(){"),            /* timer presets */
  region("function captureSessionDraft(){","function restoreSessionDraft(){"),
  region("function restoreSessionDraft(){","/* ================= DURABLE SESSION DRAFTS"),
  region("const DRAFT_PREFIX=","function setView(v){")              /* durable drafts        */
);
/* The PR grid lives inside renderHistory(); wrap the tile-building slice as a function. */
loadRegions("function prGrid(logs){\n"+region("  const prs={};","  const totals=weeklyTotals(logs);")+"\n  return h;\n}");
/* The weekly-RKD block that follows it: bar scaling and the current-block/earlier split. */
loadRegions("function weeklyBlock(logs){\n  let h=\"\";\n"+region("  const totals=weeklyTotals(logs);","  if(!logs.length)h+=")+"\n  return h;\n}");
/* The entry-collection half of saveSession(): how many set rows get read, and how an extra set
   beyond the prescription is recorded. */
loadRegions("function collectEntries(s){\n  const entries=[];\n"+region("  s.blocks.forEach((b,bi)=>b.ex.forEach((ex,ei)=>{","  /* RKD: live wins; else attached manual entry */")+"\n  return entries;\n}");
/* Likewise the stamping/dedupe half of saveSession(), which is what the no-duplicates and
   correct-block guarantees actually live in. */
loadRegions("function saveEntry(){\n"+region("  /* A resumed session keeps the timestamp","\n  live.zoneSecs=[0,0,0,0,0,0];")+"\n}");

var D=function(y,m,d){return new Date(y,m-1,d,12,0,0);};

/* ================================================================ tests */

section("Block / week identity");
eq(blockFor(D(2026,7,5)).id,"pre","before Block 1 -> pre-block");
eq(blockFor(D(2026,7,6)).id,"legacy","Jul 6 -> Block 1 starts");
eq(blockFor(D(2026,7,6)).week,1,"Jul 6 -> week 1");
eq(blockFor(D(2026,8,16)).week,6,"Aug 16 -> Block 1 week 6 (last day)");
eq(blockFor(D(2026,8,17)).id,"meso01","Aug 17 -> Meso 1 starts, no gap after Block 1");
eq(blockFor(D(2026,8,24)).week,2,"Aug 24 -> Meso 1 wk 2 (the date weekSel froze on)");
eq(blockFor(D(2026,9,6)).week,3,"Sep 6 -> Meso 1 wk 3 (last day)");
eq(blockFor(D(2026,9,7)).id,"meso02","Sep 7 -> Meso 2 starts, no gap after Meso 1");
eq(blockFor(D(2026,9,7)).week,1,"Sep 7 -> Meso 2 wk 1");
eq(blockFor(D(2026,10,18)).week,6,"Oct 18 -> Meso 2 wk 6 (last day)");
eq(blockFor(D(2026,10,19)).id,"open","Oct 19 -> off-block");
eq(blockFor(D(2026,10,19)).week,1,"first off-block week is 1");
eq(blockFor(D(2026,10,26)).week,2,"off-block keeps counting (never re-freezes)");
eq(blockTag(blockFor(D(2026,9,5))),"M1·W3","blockTag is the compact form");
eq(blockText(blockFor(D(2026,9,5))),"Meso 1 · Wk 3","blockText is the verbose form");

section("blockOf — stamped identity vs re-derivation");
eq(blockOf({block:"meso02",blockLabel:"Meso 2",blockWeek:4,date:"2026-07-08T18:00:00Z"}).week,4,
   "a stamped log trusts its stamp over its date");
eq(blockOf({date:"2026-08-26T18:00:00Z"}).id,"meso01",
   "a pre-fix log with no stamp re-derives from its date");
eq(blockOf({date:"2026-08-26T18:00:00Z"}).week,2,
   "...and lands in the right week, not the frozen week 8");

section("Scoring curves");
eq(PTS.strength.join(),"1,2,4,3,1.5,0.8","strength curve is the inverted-U");
eq(PTS.cardio.join(),"0,1,2,3,4,5","cardio curve is the straight ramp");
ok(PTS.summit[4]>PTS.cardio[4],"summit boosts Z4 above cardio");
ok(PTS.strength[2]===Math.max.apply(null,PTS.strength),"strength peaks at Z2");
ok(PTS.strength[5]<PTS.strength[1],"strength penalises Z5 below Z1");
eq(scoreZones([0,0,30,0,0,0],"strength"),120,"30 min all-Z2 on strength = 120");
eq(scoreZones([0,0,30,0,0,0],"cardio"),60,"...and only 60 on the cardio ramp");

section("Medal tiers");
eq(medalFor(105,105).t,"GOLD","exactly on target -> gold");
eq(medalFor(100,105).t,"GOLD","4.8% under -> still gold");
eq(medalFor(99,105).t,"SILVER","5.7% under -> silver");
eq(medalFor(95,105).t,"SILVER","9.5% under -> silver");
eq(medalFor(93,105).t,"BRONZE","11.4% under -> bronze");
eq(medalFor(80,105).t,"OFF TARGET","far off -> OFF TARGET, not null");
eq(medalFor(105,0),null,"no target -> no medal");

section("Tue/Thu zone-2 medal (%-time-in-Z2 vs a 100 target)");
eq(pctZ2([0,0,30,0,0,0]),100,"all time in Z2 -> 100%");
eq(pctZ2([0,2,28,0,0,0]),93,"28 of 30 min in Z2 -> 93%");
eq(pctZ2([0,0,0,0,0,0]),0,"no time logged -> 0, no divide-by-zero");
eq(zone2MedalFor([0,0,30,0,0,0]).t,"GOLD","fully compliant session -> gold");
eq(zone2MedalFor([0,2,28,0,0,0]).t,"SILVER","93% in Z2 -> silver");
eq(zone2MedalFor([0,10,20,0,0,0]).t,"OFF TARGET","67% in Z2 -> off target");

section("Karvonen zone boundaries (RHR 46 / max 185)");
eq(zoneOfBpm(129),1,"129 bpm is still Z1");
eq(zoneOfBpm(130),2,"130 bpm enters Z2");
eq(zoneOfBpm(143),2,"143 bpm is the top of Z2");
eq(zoneOfBpm(144),3,"144 bpm enters Z3");

section("weeklyTotals — unrelated blocks never share a bucket");
resetState();
/* Every one of these carried week:8 from the frozen weekSel. */
var logs=[
 {date:"2026-08-19T18:00:00Z",week:7,day:"fullBodyA",pxi:104},
 {date:"2026-08-26T18:00:00Z",week:8,day:"fullBodyB",pxi:101},
 {date:"2026-08-28T18:00:00Z",week:8,day:"fullBodyC",pxi:99},
 {date:"2026-09-09T18:00:00Z",week:8,day:"meso02Wed",pxi:103},
 {date:"2026-09-12T18:00:00Z",week:8,day:"sat",      pxi:120},
 {date:"2026-09-10T18:00:00Z",week:8,day:"thu",      pxi:null}
];
var t=weeklyTotals(logs);
eq(Object.keys(t).length,3,"3 buckets, not 1 — Meso 1 wk1/wk2 and Meso 2 wk1");
eq(t["meso01|2"].sum,200,"two sessions in the same real week do merge (101+99)");
eq(t["meso01|1"].sum,104,"Meso 1 wk 1 kept separate");
eq(t["meso02|1"].sum,103,"Meso 2 stays out of Meso 1's buckets");
ok(!t["meso02|1"].label.match(/Meso 1/),"labels name the right block");
ok(t["legacy"]===undefined&&!("meso01|3" in t),"no phantom buckets");
ok(Object.keys(t).every(function(k){return k.indexOf("sat")<0;}),"Sat still excluded");
eq(t["meso01|2"].ord,1,"ord present for cross-block sorting");

section("Weekly RKD — compact bars");
resetState();
/* Two blocks so there is something to fold. blockFor() decides which is "current" from the wall
   clock, so assert on the split's shape rather than on which block lands where. */
var wl=[{date:"2026-08-19T18:00:00Z",day:"fullBodyA",pxi:100},   /* Meso 1 wk 1 */
        {date:"2026-08-26T18:00:00Z",day:"fullBodyB",pxi:200},   /* Meso 1 wk 2 — the peak */
        {date:"2026-09-09T18:00:00Z",day:"meso02Wed",pxi:50}];   /* Meso 2 wk 1 */
var wk=weeklyBlock(wl);
eq((wk.match(/class="wk-row"/g)||[]).length,3,"one row per week, all weeks present");
ok(/width:100%/.test(wk),"the best week fills the bar");
ok(/width:25%/.test(wk),"...and the others scale against it, not against their own group");
ok(/width:50%/.test(wk),"...proportionally");
ok(/wk-rest collapsed/.test(wk),"earlier blocks are folded, closed by default");
ok(/Earlier blocks · \d+ week/.test(wk),"...with the count named");
/* A single-block history has nothing to fold. */
var wk1=weeklyBlock([{date:"2026-09-09T18:00:00Z",day:"meso02Wed",pxi:103}]);
eq((wk1.match(/class="wk-row"/g)||[]).length,1,"one week -> one row");
/* Negative weeks: no bar to draw, and the number goes red. */
var wkNeg=weeklyBlock([{date:"2026-09-09T18:00:00Z",day:"meso02Wed",pxi:-20}]);
ok(/width:0%/.test(wkNeg),"a negative week draws no bar rather than a backwards one");
ok(/var\(--red\)/.test(wkNeg),"...and reads red");
eq(weeklyBlock([]),"","no sessions -> no weekly block at all");
/* Sat is still excluded and pxi:null still ignored — the move must not change what's counted. */
var wkSat=weeklyBlock([{date:"2026-09-12T18:00:00Z",day:"sat",pxi:120},
                       {date:"2026-09-10T18:00:00Z",day:"thu",pxi:null}]);
eq(wkSat,"","Sat and unscored days still contribute nothing");

section("PR grid");
resetState();
var h=prGrid([{entries:[
  {key:"Rack Pull",sets:[{w:"225",r:"5"},{w:"245",r:"5"}]},
  {key:"Wall Push-Up Progression",sets:[{w:"",r:"12"}]}
]}]);
["Back Squat","Weighted Pull-Up","Bench Press","OHP","BB Row","Dead Hang","Hip Thrust"].forEach(function(k){
  ok(h.indexOf(">"+k)<0,"orphan tile hidden: "+k);
});
ok(/Floor Push-Ups/.test(h),"stale key renders under its current label");
ok(!/Wall Push-Up Progression/.test(h),"stale label itself never shown");
ok(!/resets meaning per stage/.test(h),"retired wall-ladder suffix gone");
ok(/245×5/.test(h),"best set shown for a tracked lift");
ok(/12 reps/.test(h),"rep-based PR carries its unit");
eq((h.match(/class="pr"/g)||[]).length,2,"only logged movements get a tile");
ok(/No PRs yet/.test(prGrid([{entries:[]}])),"sessions but no PRs -> explanatory line");
/* Export/Import moved to the top of the page, so it is the one thing this slice always emits —
   including on a device with nothing logged yet, which is exactly when you reach for Import. */
ok(/exportLogs\(\)/.test(prGrid([])),"export/import renders even with no sessions");
ok(!/class="pr"/.test(prGrid([])),"...and no sessions still means no tiles");

section("PR grid — current block leads, the rest folds away");
resetState();
/* "tue" is shared by every block, so this pins the grouping without the wall clock deciding
   which mesocycle is current on the day the suite happens to run. */
SESSIONS.tue=["Rack Pull"];
var g=prGrid([{entries:[
  {key:"Rack Pull",     sets:[{w:"225",r:"5"}]},   /* programmed now  */
  {key:"Goblet Squat",  sets:[{w:"70",r:"8"}]}     /* not programmed  */
]}]);
ok(g.indexOf("current block")>=0,"the active block gets its own heading");
ok(g.indexOf("Everything else · 1")>=0,"...and the untrained movement folds into a counted group");
ok(/id="prRestPanel"/.test(g),"the fold has a panel to toggle");
ok(/notecard collapsed pr-rest/.test(g),"...closed by default");
eq((g.match(/class="pr"/g)||[]).length,2,"every movement with a best still has a tile somewhere");
/* Order matters: current block must come before the fold. */
ok(g.indexOf("current block")<g.indexOf("Everything else"),"current block is rendered first");
/* Nothing programmed -> no current-block heading at all, rather than an empty one. */
resetState();
var g2=prGrid([{entries:[{key:"Goblet Squat",sets:[{w:"70",r:"8"}]}]}]);
ok(g2.indexOf("current block")<0,"no heading when the block programmes none of them");
ok(/Everything else · 1/.test(g2),"...everything just folds");

section("Durable drafts — autosave");
resetState();
sessionDraft={key:draftKey(),day:DAY,fields:{"w_1_0_0":"135","r_1_0_0":"5"},rpe:7,strain:"",note:"",activity:null};
live.secs=2460; live.zoneSecs=[0,120,1800,540,0,0]; live.pxi=104;
persistDraft();
var KEY="dtp-draft_2026-09-20_meso02Wed";
ok(!!LS[KEY],"a draft is written on edit, not only on FINISH");
var rec=JSON.parse(LS[KEY]);
eq(rec.pxi,104,"live RKD accrual persisted");
eq(rec.zoneSecs[2],1800,"zone seconds persisted");
eq(rec.duration,2460,"session duration persisted");
var id1=rec.draftId, at1=rec.startedAt;
persistDraft(); persistDraft();
eq(JSON.parse(LS[KEY]).draftId,id1,"draftId stable across repeated writes");
eq(JSON.parse(LS[KEY]).startedAt,at1,"startedAt not bumped on every write");
eq(Object.keys(LS).length,1,"repeated writes reuse one record");

section("Durable drafts — surfacing");
eq(pendingDrafts().length,0,"today's draft does not nag");
TODAY="2026-09-23";
eq(pendingDrafts().length,1,"a previous-day draft surfaces on reopen");
eq(draftExerciseCount(pendingDrafts()[0]),1,"exercise count derived from field ids");
eq(Math.round(pendingDrafts()[0].duration/60),41,"banner can report duration in minutes");
/* Regression: the banner must not be suppressed just because this is the draft in hand. curDraft
   still points at it after the autosaves above, and a tab left open past midnight would
   otherwise hide the very session you forgot to finish. */
eq(curDraft.key,KEY,"curDraft still holds this draft (tab was never reloaded)");
eq(curDraft.resumed,false,"...but it was never resumed");
eq(pendingDrafts().length,1,"held-but-not-resumed draft still surfaces (midnight rollover)");

section("Durable drafts — resume");
resumeDraft(KEY);
eq(curDraft.resumed,true,"resume marks the draft as in hand");
eq(curDraft.startedAt,at1,"resume preserves startedAt — the block/week it was trained in");
eq(pendingDrafts().length,0,"actively resumed draft is hidden while you work on it");
eq(live.pxi,104,"resume restores the live RKD score");
eq(live.zoneSecs[2],1800,"resume restores accrued zone time");
eq(sessAcc,2460*1000,"resume restores the session clock");
eq(DOM.daySel.value,"meso02Wed","resume sets the day before rendering (field ids are positional)");

section("Durable drafts — rest-day conflict");
curDraft.resumed=false;                    /* step back off the resumed draft so it surfaces again */
LOGS.push({type:"rest",day:"meso02Wed",date:"2026-09-20T18:00:00Z"});
ok(restLoggedFor(pendingDrafts()[0]),"conflict detected: rest day logged for the same slot");
/* Reproduce what logRest() actually leaves behind: sessionDraft nulled and the hold set. Without
   the hold, the next flush sees an empty buffer, concludes there is nothing worth keeping, and
   deletes the draft — the silent loss this guard exists to prevent. */
sessionDraft=null; live.secs=0; draftHold=true;
persistDraft();
ok(!!LS[KEY],"draftHold: a rest day never silently deletes the draft");
eq(pendingDrafts().length,1,"both are surfaced, neither wins automatically");
draftHold=false;

section("Durable drafts — discard is explicit");
discardDraft(KEY);
ok(!LS[KEY],"discard removes the record");
eq(pendingDrafts().length,0,"and clears the banner");

section("Finish — stamping and the duplicate guard");
resetState();
var DKEY="dtp-draft_2026-09-09_meso02Wed";
function resumedDraft(){ return {id:"dABC",startedAt:"2026-09-09T18:30:00.000Z",date:"2026-09-09",
  day:"meso02Wed",key:DKEY,resumed:true}; }
/* Trained Wed 9/9 (Meso 2 wk 1); finished later, in wk 2. */
LS[DKEY]="{}"; curDraft=resumedDraft();
saveEntry();
eq(LOGS.length,1,"the session is saved");
eq(LOGS[0].date,"2026-09-09T18:30:00.000Z","a resumed entry keeps the timestamp it was trained at");
eq(LOGS[0].block,"meso02","...so it files under the block it happened in");
eq(LOGS[0].blockWeek,1,"...and the week it happened in, not the week it was finished");
eq(blockFor(D(2026,9,20)).week,2,"(finishing in wk 2 would have misfiled it — the bug avoided)");
eq(LOGS[0].draftId,"dABC","the entry carries its draftId");
ok(!LS[DKEY],"the draft is cleared only after saveLogs() succeeded");
eq(draftHold,true,"a completed Finish leaves the hold set");
/* Drop the hold so this still exercises the draftId path specifically — the hold would refuse
   the second Finish one guard earlier, which is tested on its own further down. */
curDraft=resumedDraft(); draftHold=false;   /* Finish tapped a second time for the same draft */
saveEntry();
eq(LOGS.length,1,"a second Finish for the same draft does not append a duplicate");
ok(/Already saved/.test(TOASTS[TOASTS.length-1]),"...and the refusal is explained");
resetCurDraft(); LOGS=[]; draftHold=false;
saveEntry();
eq(LOGS[0].draftId,null,"a fresh session carries no draftId");
ok(LOGS[0].date!=="2026-09-09T18:30:00.000Z","...and is stamped now, unchanged from before");

/* A fresh session has no draftId, so the guard above cannot catch a double-tap on it. This is
   the case that actually reached the log: the form stayed populated after Finish, so a second
   tap re-saved the same work as a brand-new entry. */
section("Finish — double-tap on a fresh (never-resumed) session");
resetState();
fillForm({"w_1_0_0":"135","r_1_0_0":"5"});
curRPE=7; onSetInput();                      /* a real edit: writes a draft, clears any hold */
eq(draftHold,false,"editing clears the hold");
saveEntry();
eq(LOGS.length,1,"the session is saved");
eq(LOGS[0].draftId,null,"...with no draftId to dedupe on");
saveEntry();                                 /* Finish tapped again, nothing edited in between */
eq(LOGS.length,1,"a second Finish on a fresh session does not append a duplicate either");
ok(/Already saved/.test(TOASTS[TOASTS.length-1]),"...and says so rather than saving silently");
/* The hold is not a permanent lock — a genuinely new session must still be finishable. */
fillForm({"w_1_0_0":"145","r_1_0_0":"5"});
onSetInput();
eq(draftHold,false,"a real edit lifts the hold");
saveEntry();
eq(LOGS.length,2,"...so a genuinely new session still saves");

section("Durable drafts — empty drafts are not left behind");
resetState();
sessionDraft={key:draftKey(),day:DAY,fields:{},rpe:0,strain:"",note:"",activity:null};
persistDraft();
eq(Object.keys(LS).length,0,"nothing logged and no live time -> no husk record written");

/* THE REGRESSION. saveSession() deletes the draft correctly, but it does not clear the form, so
   every typed set is still sitting in the DOM afterwards. setView() runs captureSessionDraft()
   on the way to any other tab — going to History to read the session you just saved is the most
   natural next tap there is — and that scrape used to rebuild the whole draft under today's key.
   It stayed silent that day (pendingDrafts() only surfaces dates before today) and then nagged
   every morning after, one fresh record per finished session, forever. */
section("Finish — the form must not resurrect the draft it just saved");
resetState();
fillForm({"w_1_0_0":"135","r_1_0_0":"5"},{strain:"14.2",note:"felt strong"});
curRPE=8; onSetInput(); flushDraft();
var LKEY="dtp-draft_2026-09-20_meso02Wed";
ok(!!LS[LKEY],"precondition: the in-progress session has a draft");
saveEntry();
ok(!LS[LKEY],"Finish clears the draft");
/* Tab switch. The form is still full — saveSession()'s render() has not run in this harness,
   which is the harsher case and exactly the state setView() captured from. */
captureSessionDraft(); flushDraft();
eq(Object.keys(LS).length,0,"a tab switch after Finish does not write the session back as a draft");
eq(pendingDrafts().length,0,"...so nothing is queued to nag tomorrow");
TODAY="2026-09-21";
eq(pendingDrafts().length,0,"...not the next morning either — this is the banner that kept firing");

/* Second resurrection path, independent of any tab switch: the HR strap keeps streaming after
   Finish (live.tick is not cleared there), so liveSecond() ticks live.secs and schedules a save. */
section("Finish — a still-connected strap does not resurrect it either");
resetState();
fillForm({"w_1_0_0":"135","r_1_0_0":"5"});
onSetInput(); flushDraft();
saveEntry();
live.secs=600;                               /* strap still on, ticking after the save */
flushDraft();
eq(Object.keys(LS).length,0,"post-Finish HR accrual alone does not write a draft");

section("Durable drafts — bare tracked time is not content");
resetState();
sessionDraft={key:draftKey(),day:DAY,fields:{},rpe:0,strain:"",note:"",activity:null};
live.secs=30;                                /* strap connected while browsing days */
persistDraft();
eq(Object.keys(LS).length,0,"a briefly-connected strap with nothing logged writes no draft");
live.secs=DRAFT_MIN_SECS;
persistDraft();
eq(Object.keys(LS).length,1,"a real pure-HR session (Z2, nothing typed) is still autosaved");
eq(JSON.parse(LS["dtp-draft_2026-09-20_meso02Wed"]).secs,DRAFT_MIN_SECS,"...with its tracked time");
/* Regression: adoptTodayDraft() restores live.secs on boot, which used to pin has=true forever
   and made an emptied draft impossible to clear. */
live.secs=30;
persistDraft();
eq(Object.keys(LS).length,0,"an emptied draft can still be cleared once live.secs is restored");

/* restoreSessionDraft()'s fallback adopts today's durable draft for the selected day. It restores
   fields but NOT zoneSecs/pxi/secs/duration/freeform, so adopting right after a save would let
   the next edit persist a zeroed live block over another session's accrued zone time and RKD.
   It also calls setRPE() -> onSetInput(), which would clear the hold the fix depends on. */
section("Finish — the render that follows does not adopt a same-day draft");
resetState();
var OTHER="dtp-draft_2026-09-20_meso02Wed";
LS[OTHER]=JSON.stringify({draftId:"dOTHER",startedAt:"2026-09-20T09:00:00.000Z",date:"2026-09-20",
  day:DAY,fields:{"w_1_0_0":"225"},rpe:9,strain:"",note:"other session",activity:null,
  freeform:[],zoneSecs:[0,0,1200,0,0,0],pxi:88,secs:1200,duration:1200});
/* the state saveSession() leaves behind: form redrawn empty, buffer nulled, hold set */
emptyForm(["w_1_0_0","r_1_0_0"]); sessionDraft=null; draftHold=true;
restoreSessionDraft();
eq(sessionDraft,null,"the post-Finish render does not adopt an unrelated same-day draft");
eq(DOM.w_1_0_0.value,"","...so the form stays empty");
eq(draftHold,true,"...and the hold survives (setRPE would have cleared it)");
eq(JSON.parse(LS[OTHER]).pxi,88,"...leaving that draft's accrued RKD intact");
/* The fallback still does its real job once editing resumes — this is the day-switch bugfix it
   was added for, and the fix must not have cost it. */
draftHold=false;
restoreSessionDraft();
eq(DOM.w_1_0_0.value,"225","the day-switch fallback still restores a draft when not held");
eq(curRPE,9,"...including its session RPE");

section("Extra sets — beyond the prescription");
resetState();
/* An added set is content in its own right: tapping "+ Set" before typing anything must not be
   swept away by the husk cleanup. */
sessionDraft={key:draftKey(),day:DAY,fields:{},rpe:0,strain:"",note:"",activity:null};
extraSets[setKey(1,0)]=1;
persistDraft();
var XKEY="dtp-draft_2026-09-20_meso02Wed";
ok(!!LS[XKEY],"an added set alone is enough to write a draft");
/* Parsed defensively so a regression that writes no draft at all fails this check cleanly
   instead of throwing and taking the rest of the run down with it. */
function parseLS(k){ try{ return JSON.parse(LS[k]||"null")||{}; }catch(e){ return {}; } }
eq((parseLS(XKEY).extra||{})["meso02Wed|1_0"],1,"...and the count is persisted");
/* Scoped per day: the key carries the day, so Monday's extra set can't attach itself to
   Wednesday's exercise 0 — the w_/r_ ids are positional and would otherwise collide. */
DAY="meso02Mon";
eq(extraFor(1,0),0,"an extra set does not leak to the same position on another day");
sessionDraft={key:draftKey(),day:DAY,fields:{},rpe:0,strain:"",note:"",activity:null};
persistDraft();
ok(!LS["dtp-draft_2026-09-20_meso02Mon"],"...and does not make another day's empty slot look occupied");
DAY="meso02Wed";
eq(extraFor(1,0),1,"...but is still there on the day it was added");
/* Round-trip through resume: the count has to come back or the extra rows never render and the
   values captured against them are orphaned. */
extraSets={};
resumeDraft(XKEY);
eq(extraFor(1,0),1,"resume restores the extra-set count");
/* Finish records it structurally rather than leaving it to the notes. */
resetState();
var SESS={blocks:[{ex:[{key:"Rack Pull",n:"Rack Pull",rx:"3 × 5",sets:3}]}]};
fillForm({"w_0_0_0":"225","r_0_0_0":"5","w_0_0_1":"225","r_0_0_1":"5","w_0_0_2":"235","r_0_0_2":"5"});
var e0=collectEntries(SESS)[0];
eq(e0.sets.length,3,"no extras -> the programmed set count is read");
eq(e0.extra,undefined,"...and nothing is stamped about extras");
eq(e0.programmed,undefined,"...at all");
/* Add a fourth. */
extraSets[setKey(0,0)]=1;
DOM.w_0_0_3={id:"w_0_0_3",value:"245"}; DOM.r_0_0_3={id:"r_0_0_3",value:"3"};
var e1=collectEntries(SESS)[0];
eq(e1.sets.length,4,"an extra set is collected alongside the programmed ones");
eq(e1.sets[3].w+"x"+e1.sets[3].r,"245x3","...with its own weight and reps");
eq(e1.extra,1,"the entry records how many were extra");
eq(e1.programmed,3,"...and what was programmed");
eq(e1.rx,"3 × 5","...leaving the prescription string untouched");
/* A row the DOM hasn't rendered yet must read as empty, not throw — this loop used to assume
   every id existed. */
extraSets[setKey(0,0)]=2;
var e2=collectEntries(SESS)[0];
eq(e2.sets.length,5,"a count ahead of the DOM still collects");
eq(e2.sets[4].w,"","...with the missing row empty rather than throwing");

section("Extra sets — two-tap removal");
resetState();
emptyForm(["w_0_0_0","r_0_0_0","w_0_0_1","r_0_0_1","w_0_0_2","r_0_0_2"]);
addSet(0,0);
eq(extraFor(0,0),1,"a set is added");
eq(setArmDel,null,"...unarmed");
/* First tap arms, it does not remove — same convention as armDiscard and the preset delete. */
armRemoveSet(0,0);
eq(setArmDel,"meso02Wed|0_0","the first tap arms this exercise");
eq(extraFor(0,0),1,"...and removes nothing yet");
cancelRemoveSet();
eq(setArmDel,null,"Keep disarms");
eq(extraFor(0,0),1,"...still nothing removed");
armRemoveSet(0,0); removeSet(0,0,3);
eq(extraFor(0,0),0,"the confirming tap removes the set");
eq(setArmDel,null,"...and clears the arm");
/* Adding elsewhere while armed disarms — the armed row was pointing at a set number that just
   moved underneath it. */
addSet(0,0); armRemoveSet(0,0); addSet(0,0);
eq(setArmDel,null,"adding a set clears an armed removal");
eq(extraFor(0,0),2,"...and still adds");
/* The removed row's typed values go with it, so re-adding comes back blank rather than
   resurrecting numbers from a set that was deliberately deleted. */
DOM.w_0_0_4={id:"w_0_0_4",value:"999"}; DOM.r_0_0_4={id:"r_0_0_4",value:"9"};
captureSessionDraft();
eq(sessionDraft.fields.w_0_0_4,"999","precondition: the extra row's value is captured");
removeSet(0,0,3);
eq(sessionDraft.fields.w_0_0_4,undefined,"removing a set drops its weight from the draft");
eq(sessionDraft.fields.r_0_0_4,undefined,"...and its reps");
/* Removing with nothing to remove is a no-op, not a negative count. */
resetState();
removeSet(0,0,3);
eq(extraFor(0,0),0,"removing with no extras leaves the count at zero");

section("Extra sets — the rendered controls");
resetState();
var BLK={blocks:[{letter:"A",t:"Main",mins:12,bells:4,
  ex:[{key:"Rack Pull",n:"Rack Pull",rx:"3 × 5",sets:3}]}]};
var bh=blockHtml(BLK,0);
eq((bh.match(/class="set /g)||[]).length+(bh.match(/class="set"/g)||[]).length,3,"programmed sets render");
ok(/addSet\(0,0\)/.test(bh),"every exercise offers + Set");
ok(!/armRemoveSet/.test(bh),"...and no removal control until there is an extra");
extraSets[setKey(0,0)]=1;
bh=blockHtml(BLK,0);
eq((bh.match(/class="set extra"/g)||[]).length,1,"the added row is marked as extra");
ok(/\+1 over 3/.test(bh),"...and the count over the prescription is stated");
/* The wiring itself: − Set must arm, never remove outright. */
ok(/armRemoveSet\(0,0\)/.test(bh),"− Set arms rather than removing");
ok(!/removeSet\(0,0/.test(bh),"...so an unarmed exercise has no one-tap remove in its markup");
setArmDel=setKey(0,0);
var armed=blockHtml(BLK,0);
ok(/removeSet\(0,0,3\)/.test(armed)&&/cancelRemoveSet\(\)/.test(armed),"the armed row offers Remove and Keep");
ok(/Remove set 4\?/.test(armed),"...naming which set goes");
ok(!/addSet\(0,0\)/.test(armed),"...and + Set steps aside so the confirming tap can't mis-hit");
setArmDel=null;

section("Interval timer — built-in presets");
resetState(); ivtPresetMem=[];
eq(IVT_BUILTINS.length,3,"three built-ins ship");
eq(IVT_BUILTINS.map(function(p){return p.name;}).join("|"),"Tabata|EMOM|30/30 HIIT","named as specified");
eq(IVT_BUILTINS[0].work+"/"+IVT_BUILTINS[0].rest+"x"+IVT_BUILTINS[0].rounds,"20/10x8","Tabata 20/10 x8");
eq(IVT_BUILTINS[1].work+"/"+IVT_BUILTINS[1].rest+"x"+IVT_BUILTINS[1].rounds,"60/0x10","EMOM 60/0 x10");
eq(IVT_BUILTINS[2].work+"/"+IVT_BUILTINS[2].rest+"x"+IVT_BUILTINS[2].rounds,"30/30x10","30/30 HIIT 30/30 x10");
ok(IVT_BUILTINS.every(function(p){return p.prep===IVT_DEFAULTS.prep;}),"all three take the timer's default prep, not a literal");
/* Loading writes the fields and the last-used config, and must not start anything. */
ivt=null; ivtCfg={prep:1,work:1,rest:1,rounds:1,muted:false};
ivtLoadBuiltin(0);
eq(ivtCfg.work+"/"+ivtCfg.rest+"x"+ivtCfg.rounds+"p"+ivtCfg.prep,"20/10x8p15","loading a built-in populates the four fields");
eq(ivt,null,"...and does not start the timer");
eq(JSON.parse(LS["dtp-ivt"]).work,20,"...and persists as the last-used config");
ok(!LS["dtp-ivt-presets"],"loading a built-in writes nothing to the custom-preset key");

section("Interval timer — custom presets");
resetState(); ivtPresetMem=[]; ivtCfg=Object.assign({},IVT_DEFAULTS);
ivtFields(10,45,15,6); ivtNameField("Pool set");
ivtSavePreset();
var P=function(){ return JSON.parse(LS["dtp-ivt-presets"]||"[]"); };
eq(P().length,1,"a custom preset is saved");
eq(P()[0].name,"Pool set","...under its given name");
eq(P()[0].work+"/"+P()[0].rest+"x"+P()[0].rounds+"p"+P()[0].prep,"45/15x6p10","...storing the full config incl. prep");
ok(!!LS["dtp-ivt"],"the last-used config key still exists alongside it");
ok(!("name" in JSON.parse(LS["dtp-ivt"])),"...and is not where presets got written");
/* Overwrite by name, no prompt, case-insensitive, in place rather than appended. */
ivtFields(20,30,30,12); ivtNameField("pool set");
ivtSavePreset();
eq(P().length,1,"re-saving a name that exists overwrites rather than appending");
eq(P()[0].work+"/"+P()[0].rest+"x"+P()[0].rounds,"30/30x12","...with the new numbers");
eq(P()[0].name,"pool set","...taking the name exactly as typed");
ok(/Updated/.test(TOASTS[TOASTS.length-1]),"...and says it updated, not saved");
ivtNameField("  Sprints  ");
ivtSavePreset();
eq(P().length,2,"a genuinely new name appends");
eq(P()[1].name,"Sprints","...trimmed");
ivtNameField("   ");
ivtSavePreset();
eq(P().length,2,"a blank name saves nothing");
ok(/Name the preset/.test(TOASTS[TOASTS.length-1]),"...and asks for one");
/* Load + delete. */
ivtCfg={prep:0,work:0,rest:0,rounds:0,muted:false};
ivtLoadCustom(1);
eq(ivtCfg.work+"/"+ivtCfg.rest+"x"+ivtCfg.rounds+"p"+ivtCfg.prep,"30/30x12p20","a custom preset loads into the fields");
/* Two-tap delete, same convention as the draft banner's armDiscard. */
ivtArmDelete(0);
eq(ivtArmDel,0,"the first tap arms the row rather than deleting");
eq(P().length,2,"...and nothing is removed yet");
ivtCancelDelete();
eq(ivtArmDel,null,"Keep disarms it");
eq(P().length,2,"...still nothing removed");
ivtArmDelete(0); ivtDeleteCustom(0);
eq(P().length,1,"the confirming tap removes one");
eq(P()[0].name,"Sprints","...and only the one named");
eq(ivtArmDel,null,"...and clears the arm");
ivtArmDelete(0);
ivtNameField("   "); ivtSavePreset();
eq(ivtArmDel,0,"a refused save leaves the arm alone — nothing shifted");
ivtNameField("Ladder"); ivtSavePreset();
eq(ivtArmDel,null,"a real save clears any armed row — the list is about to shift under it");
eq(P().length,2,"...and the new preset is there");
ivtDeleteCustom(9);
eq(P().length,2,"deleting a missing index is a no-op");
/* Survives a reload: the list is read back from storage, not held in a variable. */
eq(loadIvtPresets()[0].name,"Sprints","presets are re-read from localStorage");
LS["dtp-ivt-presets"]="{not an array}";
eq(loadIvtPresets().length,0,"a corrupt preset record degrades to empty rather than throwing");

section("Interval timer — preset list rendering");
resetState(); ivtPresetMem=[]; LS={};
ivtFields(15,30,15,8); ivtNameField("Mine"); ivtSavePreset();
var HTML=ivtPresetsHtml();
eq((HTML.match(/ivt-p-del/g)||[]).length,1,"only the custom preset gets a delete control");
eq((HTML.match(/class="tag"/g)||[]).length,3,"all three built-ins are tagged as such");
ok(HTML.indexOf("Tabata")>=0&&HTML.indexOf("Mine")>=0,"built-ins and custom saves share one list");
ok(HTML.indexOf("20s/10s ×8")>=0,"each row summarises its own work/rest/rounds");
ok(HTML.indexOf("ivtArmDelete(0)")>=0,"the ✕ arms rather than calling delete straight off");
ok(HTML.indexOf("ivtDeleteCustom(")<0,"...so an unarmed list has no one-tap delete anywhere in it");
ivtArmDelete(0);
var ARMED=ivtPresetsHtml();
ok(ARMED.indexOf("ivtDeleteCustom(0)")>=0&&ARMED.indexOf("ivtCancelDelete()")>=0,"the armed row offers Delete and Keep");
ok(ARMED.indexOf("Delete “Mine”?")>=0,"...naming what is about to go");
eq((ARMED.match(/ivt-p-load/g)||[]).length,3,"...and drops that row's Load, so the armed tap can't be a mis-hit");
ivtCancelDelete();

/* ---------------------------------------------------------------- result */
print("\n"+(FAILED?"FAILED — "+FAILED+" of "+CHECKS+" checks":"OK — all "+CHECKS+" checks passed"));
print(FAILED?"RESULT:FAIL":"RESULT:OK");
quit(FAILED?1:0);
