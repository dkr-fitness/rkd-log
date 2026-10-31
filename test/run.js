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
var sessionDraft=null, freeformNames=[], curRPE=0, sessAcc=0, sessInt=null, sessStart=null;
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
    strain=null, zoneMins=null, pxi=103, model="strength", medal="GOLD", plan=null;
function todayStr(){return TODAY;}
function curDay(){return DAY;}
function loadLogs(){return LOGS;}
function saveLogs(l){LOGS=l;}
function toast(m){TOASTS.push(m);}
function render(){}
/* The live plan chip's DOM update. onSetInput() calls it; the counting it shows is planScore(),
   which is loaded from source and tested on its own. */
function updatePlanChip(){}
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
                 meso02:["meso02Mon","meso02Wed","meso02Fri"],
                 meso03:["meso03Mon","meso03Wed","meso03Fri","meso03Sat"]};
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
  if(typeof painEvents!=="undefined") painEvents={};
  if(typeof exNotes!=="undefined") exNotes={};
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
  region("function hrText(day,w){","// Shared pre-activation cue"),    /* HR target box text    */
  region("const PTS=","const LIFT_DAYS="),                          /* curves, medals, zones */
  region("const LIFT_DAYS=","/* The only templates that still read"), /* medal-eligible days */
  region("function curModel(){","/* ================= STATE"),      /* curve per day         */
  region("function weeklyTotals(logs){","function renderHistory(m){"),
  region("const e1rm=","const DAY_LABEL="),                         /* PR_KEYS + PR_LABEL    */
  region("const setKey=(bi,ei)=>","/* ================= HEP"),           /* extra-set keying */
  region("function blockHtml(s,bi){","/* ---- Extra sets ---- */"),      /* set rows + controls */
  region("/* ---- Extra sets ---- */","/* ---- Freeform (strengthFree)"),/* add/remove sets   */
  region("const IVT_DEFAULTS=","function ivtToggleMute(){"),            /* timer presets */
  region("function captureSessionDraft(){","function restoreSessionDraft(){"),
  region("function restoreSessionDraft(){","/* ================= DURABLE SESSION DRAFTS"),
  region("const DRAFT_PREFIX=","function setView(v){"),             /* durable drafts        */
  region("function focusStepsFor(blocks,extraOf){","let focusIdx=null;"), /* set-mode walk order */
  region("const PASTE_WORKOUT_EXERCISES=","/* ================= INIT"),   /* Paste Workout import */
  /* HEP tracker + detail tab, skipping the todayStr/todayLabel lines between them — todayStr is
     stubbed above to pin the date, and the real one would overwrite the stub. */
  region("const HEP_LABELS=","let hepMem={};"),
  "var hepMem={};",
  region("const hepKey=","/* ---- shared stopwatch")
);
/* The real day templates, loaded under another name: getSession itself stays stubbed above for
   the PR grid, which is testing grouping, not programming. RIGHT_LAT_CUE/nSets/q15 come along
   because the legacy templates in the same function reference them. */
loadRegions(region("const RIGHT_LAT_CUE=","// ================= FORM REFERENCE"),
  region("function getSession(w,day){","const interval=").replace("function getSession(w,day){","function realSession(w,day){"));
/* Meso 03's templates read the wall clock (meso03Week), so pin it for the duration of fn. */
function onDate(y,m,d,fn){
  var Real=Date, at=new Real(y,m-1,d,9,0,0).getTime();
  Date=function(){ if(!arguments.length) return new Real(at);
    return new (Function.prototype.bind.apply(Real,[null].concat([].slice.call(arguments))))(); };
  Date.prototype=Real.prototype; Date.now=function(){return at;};
  try{ return fn(); } finally{ Date=Real; }
}
/* Every exercise of a day as {key,n,rx,sets}, flattened. */
function exList(day){ var out=[]; realSession(8,day).blocks.forEach(function(b){ b.ex.forEach(function(e){ out.push(e); }); }); return out; }
function exOf(day,key){ return exList(day).filter(function(e){return e.key===key;})[0]||{}; }

/* The PR grid lives inside renderHistory(); wrap the tile-building slice as a function. */
loadRegions("function prGrid(logs){\n"+region("  const prs={};","  const totals=weeklyTotals(logs);")+"\n  return h;\n}");
/* The weekly-RKD block that follows it: bar scaling and the current-block/earlier split. */
loadRegions("function weeklyBlock(logs){\n  let h=\"\";\n"+region("  const totals=weeklyTotals(logs);","  if(!logs.length)h+=")+"\n  return h;\n}");
/* The entry-collection half of saveSession(), now its own function so the live plan chip counts
   the same entries Finish saves: how many set rows get read, and how an extra set beyond the
   prescription is recorded. */
loadRegions(region("function sessionEntries(s){","function saveSession(){"));
var collectEntries=sessionEntries;
/* Likewise the stamping/dedupe half of saveSession(), which is what the no-duplicates and
   correct-block guarantees actually live in. */
loadRegions("function saveEntry(){\n"+region("  /* A resumed session keeps the timestamp","\n  live.zoneSecs=[0,0,0,0,0,0];")+"\n}");

/* Copy summary — the text block that carries the medal and the plan line out of the app. */
loadRegions(region("function priorBestValue(logs,uptoIdx,key){","function copySummary(idx){"));

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
eq(blockFor(D(2026,10,19)).id,"meso03","Oct 19 -> Meso 3 starts, no gap after Meso 2");
eq(blockFor(D(2026,10,19)).week,1,"Oct 19 -> Meso 3 wk 1");
eq(blockFor(D(2026,12,13)).id,"meso03","Dec 13 -> still Meso 3 (last day)");
eq(blockFor(D(2026,12,13)).week,8,"Dec 13 -> Meso 3 wk 8");
eq(blockFor(D(2026,12,14)).id,"open","Dec 14 -> off-block");
eq(blockFor(D(2026,12,14)).week,1,"first off-block week is 1");
eq(blockFor(D(2026,12,21)).week,2,"off-block keeps counting (never re-freezes)");
eq(blockTag(blockFor(D(2026,9,5))),"M1·W3·V","blockTag is the compact form, with the phase's initial for a meso block");
eq(blockText(blockFor(D(2026,9,5))),"Meso 1 · Wk 3 · Volume Phase","blockText is the verbose form, with the phase spelled out");

section("phaseForWeek — generic 2/2/2 default, per-block override");
eq(phaseForWeek(1),"Baseline","week 1 -> Baseline");
eq(phaseForWeek(2),"Baseline","week 2 -> Baseline");
eq(phaseForWeek(3),"Volume","week 3 -> Volume");
eq(phaseForWeek(4),"Volume","week 4 -> Volume");
eq(phaseForWeek(5),"Performance","week 5 -> Performance by default");
eq(phaseForWeek(6),"Performance","week 6 -> Performance by default");
eq(phaseForWeek(9),"Performance","a block that overruns clamps to its last phase rather than erroring");
eq(phaseForWeek(0),"Baseline","week 0 clamps to the first phase");
eq(phaseForWeek(5,"meso04"),"Performance","a block with no override uses the default plan");
eq(phaseForWeek(5,"meso02"),"Volume","Meso 2 week 5 is a second Volume phase, not Performance");
eq(phaseForWeek(6,"meso02"),"Volume","...and so is week 6");
eq(phaseForWeek(2,"meso02"),"Baseline","...its weeks 1–2 are still Baseline");
eq(blockText(blockFor(D(2026,10,5))),"Meso 2 · Wk 5 · Volume Phase","the label follows the per-block plan");
eq(blockTag(blockFor(D(2026,10,12))),"M2·W6·V","...in the compact form too");
eq(blockTag(blockFor(D(2026,7,6))),"B1·W1","non-meso blocks (Block 1) carry no phase suffix");
eq(blockText(blockFor(D(2026,12,14))),"Off-block · Wk 1","off-block carries no phase suffix either");

section("Meso 3 — 8-week plan ending in a Deload week");
["Baseline","Baseline","Volume","Volume","Volume","Performance","Performance","Deload"].forEach(function(p,i){
  eq(phaseForWeek(i+1,"meso03"),p,"Meso 3 week "+(i+1)+" -> "+p);
});
eq(phaseForWeek(9,"meso03"),"Deload","past week 8 clamps to Deload rather than erroring");
/* Monday of each week, so a week boundary slip shows up as the wrong phase. */
eq(blockText(blockFor(D(2026,11,2))),"Meso 3 · Wk 3 · Volume Phase","Nov 2 -> wk 3, Volume");
eq(blockText(blockFor(D(2026,11,23))),"Meso 3 · Wk 6 · Performance Phase","Nov 23 -> wk 6, Performance");
eq(blockText(blockFor(D(2026,12,7))),"Meso 3 · Wk 8 · Deload Phase","Dec 7 -> wk 8, Deload, spelled out");
eq(blockTag(blockFor(D(2026,12,13))),"M3·W8·D","...and as D in the compact tag");
eq(blockTag(blockFor(D(2026,10,25))),"M3·W1·B","Oct 25 (Sun) is still week 1");
/* The fall-back clock change lands in week 2 (Sun Nov 1); a 25-hour day must not shift a week. */
eq(blockFor(D(2026,11,1)).week,2,"Nov 1 (DST ends) -> wk 2");
eq(blockFor(D(2026,11,2)).week,3,"Nov 2 -> wk 3, not held back by the extra hour");
eq(blockOf({date:"2026-12-10T18:00:00Z"}).id,"meso03","an unstamped log from the Deload week re-derives to Meso 3");

section("Meso 3 templates — against Meso03_Plan.xlsx");
var M3DAYS=["meso03Mon","meso03Wed","meso03Fri","meso03Sat"];
/* One date per phase: wk 1 Baseline, wk 3 Volume, wk 6 Performance, wk 8 Deload (all Mondays). */
var PHASE_DATES={Baseline:[2026,10,19],Volume:[2026,11,2],Performance:[2026,11,23],Deload:[2026,12,7]};
var EXCLUDED=/back[ -]squat|goblet|overhead press|shoulder press|military|\bOHP\b|push press|rower|row erg|ski ?erg/i;
Object.keys(PHASE_DATES).forEach(function(ph){
  var d=PHASE_DATES[ph];
  onDate(d[0],d[1],d[2],function(){
    M3DAYS.forEach(function(day){
      var s=realSession(8,day), txt=[s.name].concat(exList(day).map(function(e){return e.n+" "+(e.rx||"")+" "+(e.note||"");})).join(" | ");
      /* "no overhead" is the pushdown rule itself, so only pressing/excluded patterns count. */
      ok(!EXCLUDED.test(txt.replace(/no overhead/g,"")),ph+" "+day+": no back squat, goblet, overhead pressing or rower/SkiErg");
    });
  });
});
onDate(2026,10,19,function(){
  eq(exOf("meso03Mon","Rack Pull").sets,4,"Baseline main lift: 4 sets");
  ok(/^4 × 6 @ RPE 6–7/.test(exOf("meso03Mon","Rack Pull").rx),"...4 × 6 @ RPE 6–7");
  ok(/double overhand/.test(exOf("meso03Mon","Rack Pull").rx),"Rack Pull cue: double overhand");
  ok(/^3 × 8–10\/leg/.test(exOf("meso03Mon","Bulgarian SS").rx),"Baseline accessory: 3 × 8–10/leg");
  ok(/arms straight/.test(exOf("meso03Mon","Bulgarian SS").rx),"BSS cue: arms straight");
  ok(/pause at top/.test(exOf("meso03Mon","Hip Thrust").rx),"Hip Thrust cue: pause at top");
  ok(/neutral grip, static hold/.test(exOf("meso03Mon","Pallof").rx),"Pallof cue: neutral grip, static hold");
  ok(/log load per side/.test(exOf("meso03Mon","Suitcase Carry").rx),"carry cue: log load per side");
  ok(/pushdown only/.test(exOf("meso03Wed","Rope Triceps Pressdown").rx),"safety cue: triceps pushdown only");
  ok(/arms nearly straight/.test(exOf("meso03Wed","Cable Pullover").rx),"safety cue: pullover arms nearly straight");
  ok(/90° stop/.test(exOf("meso03Wed","SA Chest Press").rx),"safety cue: chest press 90° stop");
  ok(/stop at first sign of pain/.test(exOf("meso03Fri","Neutral-Grip Row").rx),"safety cue: row stops at first sign of pain");
  ok(/barbell/i.test(exOf("meso03Fri","Romanian Deadlift (DB)").n+exOf("meso03Fri","Romanian Deadlift (DB)").rx),"RDL is barbell, on the existing key");
  ok(/arms straight/.test(exOf("meso03Fri","Step-Up").rx),"Step-Up cue: arms straight");
  ok(/ribs down, slow/.test(exOf("meso03Fri","Bird Dog").rx),"core cue: ribs down, slow");
  ok(/3 s lowering/.test(exOf("meso03Sat","Leg Press").rx),"Sat Baseline tempo: 3 s lowering");
  ok(!/3 s lowering|pause at the bottom|normal tempo/.test(exOf("meso03Sat","Face Pull").rx),"Face Pull: no tempo cue");
  eq(realSession(8,"meso03Mon").retest,null,"no retest banner outside week 8");
  ok(!/retest/.test(exOf("meso03Wed","SA Chest Press").rx),"...and no retest tag either");
});
onDate(2026,11,2,function(){
  ok(/^5 × 6–8 @ RPE 7–8/.test(exOf("meso03Wed","Safety Bar Squat").rx),"Volume main lift: 5 × 6–8 @ RPE 7–8");
  ok(/^3 × 10–12/.test(exOf("meso03Wed","Cable Pullover").rx),"Volume accessory: 3 × 10–12");
  ok(/1 s pause at the bottom/.test(exOf("meso03Sat","SL RDL").rx),"Sat Volume tempo: 1 s pause");
});
onDate(2026,11,23,function(){
  ok(/^4 × 4–5 @ RPE 8/.test(exOf("meso03Fri","Romanian Deadlift (DB)").rx),"Performance main lift: 4 × 4–5 @ RPE 8");
  ok(/^3 × 8\/side · heavier/.test(exOf("meso03Fri","Neutral-Grip Row").rx),"Performance accessory: 3 × 8, heavier");
  ok(/slightly heavier/.test(exOf("meso03Sat","Leg Press").rx),"Sat Performance: Leg Press slightly heavier");
  ok(!/heavier/.test(exOf("meso03Sat","SL RDL").rx+exOf("meso03Sat","Backward Walking Lunges").rx),"...and only Leg Press");
});
onDate(2026,12,7,function(){
  ok(/^3 × 5 @ RPE 6/.test(exOf("meso03Mon","Rack Pull").rx),"Deload main lift: 3 × 5 @ RPE 6");
  ok(/^2 × 8/.test(exOf("meso03Mon","Hip Thrust").rx),"Deload accessory: 2 × 8");
  eq(exOf("meso03Mon","Suitcase Carry").sets,1,"Deload carry: 1 round");
  eq(exOf("meso03Sat","Sled Push").sets,2,"Deload Sled Push: 2 rounds");
  ok(/^2 × 50 s work \/ 60 s rest/.test(exOf("meso03Sat","Sled Push").rx),"...of 50 s work / 60 s rest");
  eq(exOf("meso03Sat","Leg Press").rx,"2 × 10 · full depth · log plates only, same machine weekly · tailbone stays on pad","Deload Saturday: 2 sets, no tempo text");
  ["meso03Mon","meso03Wed","meso03Fri"].forEach(function(d){
    ok(/Retest: repeat Baseline loads for carries and single-arm lifts; log both sides\. Pinch hold retests in the HEP\./.test(realSession(8,d).retest||""),"week 8 retest banner on "+d);
  });
  eq(realSession(8,"meso03Sat").retest,undefined,"...not on Saturday");
  ["Suitcase Carry"].forEach(function(k){ ok(/retest/.test(exOf("meso03Fri",k).rx),"retest tag on Fri "+k); });
  ["SA Chest Press","Rope Triceps Pressdown"].forEach(function(k){ ok(/retest/.test(exOf("meso03Wed",k).rx),"retest tag on single-arm "+k); });
  ok(/retest/.test(exOf("meso03Fri","Neutral-Grip Row").rx),"retest tag on single-arm Neutral-Grip Row");
  ok(!/retest/.test(exOf("meso03Fri","Romanian Deadlift (DB)").rx),"...not on the main lift");
});

section("Meso 3 cues — 2026-10-26 revision");
/* Every key unchanged, so history and PRs carry over; only names, rx and cues moved. */
Object.keys(PHASE_DATES).forEach(function(ph){
  var d=PHASE_DATES[ph];
  onDate(d[0],d[1],d[2],function(){
    eq(exList("meso03Sat").map(function(e){return e.key||"";}).sort().join(),",Backward Walking Lunges,Face Pull,Leg Press,SL RDL,Scapular Wall Slide,Sled Push","Sat "+ph+": keys unchanged");
    ok(!exList("meso03Wed").some(function(e){return e.key==="Plate Pinch Hold";}),"Wed "+ph+": no Plate Pinch Hold (it's in the HEP)");
    var sb=realSession(8,"meso03Sat").blocks.filter(function(b){return b.t==="Sled";})[0];
    eq(sb.ivl,110,"Sat "+ph+": sled bell every 1:50 (50 s work / 60 s rest)");
    eq(sb.bells,ph==="Deload"?2:5,"...× "+(ph==="Deload"?2:5));
    ["SA Chest Press","Rope Triceps Pressdown"].forEach(function(k){
      ok(/optional extra set, right arm only/.test(exOf("meso03Wed",k).rx),ph+" "+k+": optional right-arm extra set");
    });
    ok(/optional extra set, right arm only/.test(exOf("meso03Fri","Neutral-Grip Row").rx),ph+" Neutral-Grip Row: optional right-arm extra set");
    eq(exOf("meso03Wed","SA Chest Press").sets,ph==="Deload"?2:3,"...prescribed sets unchanged");
  });
});
onDate(2026,10,19,function(){
  eq(exOf("meso03Sat","Sled Push").n,"Sled Push (or treadmill push)","sled display name");
  ok(/0\.8 mph/.test(exOf("meso03Sat","Sled Push").rx)&&/safety clip on/.test(exOf("meso03Sat","Sled Push").rx)&&/~50 s ≈ 20 yd/.test(exOf("meso03Sat","Sled Push").rx),"treadmill option cue");
  eq(exOf("meso03Sat","Sled Push").rUnit,"yd","...still logs yards");
  eq(exOf("meso03Sat","Face Pull").n,"Face Pull (cable rope)","face pull display name");
  ok(/rope at eye level/.test(exOf("meso03Sat","Face Pull").rx)&&/1 s pause, no long hold/.test(exOf("meso03Sat","Face Pull").rx),"face pull cue");
  ok(/log plates only, same machine weekly · tailbone stays on pad/.test(exOf("meso03Sat","Leg Press").rx),"leg press cue");
  ok(/DB in the hand opposite the working leg/.test(exOf("meso03Sat","SL RDL").rx),"SL RDL cue");
  ok(/two DBs at sides/.test(exOf("meso03Fri","Step-Up").rx)&&/trailing foot toe-taps only/.test(exOf("meso03Fri","Step-Up").rx),"step-up cue");
  ok(/sit tall ~90°, no rocking · quick squeeze, no long hold at the end/.test(exOf("meso03Fri","Neutral-Grip Row").rx),"row cue");
  eq(PASTE_WORKOUT_KEYS["Face Pull (cable rope)"]+","+PASTE_WORKOUT_KEYS["Sled Push (or treadmill push)"],"Face Pull,Sled Push","paste import knows the new display names");
});
/* Wednesday's plan total: 2 activation + 4 squat + 3 × 3 accessories, no pinch. */
onDate(2026,10,19,function(){
  var rows=exList("meso03Wed").filter(function(e){return e.sets>0;}).map(function(e){var r=[];for(var i=0;i<e.sets;i++)r.push({w:"",r:""});return {key:e.key,sets:r};});
  eq(planScore(rows,function(){return null;}).total,15,"Wed plan total = 15 sets, pinch hold no longer counted");
});
onDate(2026,10,22,function(){ ok(thuRuleText().indexOf(MESO03_THU_RECOVERY)===0,"Meso 3 Thursday: WHOOP recovery check leads the rule"); });
onDate(2026,10,8,function(){ ok(thuRuleText().indexOf("WHOOP")<0,"Meso 2 Thursday: no recovery check"); });
onDate(2026,12,17,function(){ ok(thuRuleText().indexOf("WHOOP")<0,"after Meso 3: no recovery check"); });
eq(MESO03_THU_RECOVERY,"Check WHOOP recovery first: green → Zone 2, 25–35 min · yellow/red → easy walk or mobility 20–30 min instead.","recovery check wording");

section("Meso 3 shorter sessions — rounds, supersets, time estimate");
/* The real interval() under another name: the global one is stubbed to 90 for blockHtml. */
loadRegions(region("const interval=","/* ================= RKD ENGINE").replace(/\binterval\b/g,"realInterval"));
function blockWith(day,key){ return realSession(8,day).blocks.filter(function(b){ return b.ex.some(function(e){return e.key===key;}); })[0]; }
var SUPERSETS=[["meso03Mon","Hip Thrust","Pallof"],["meso03Wed","SA Chest Press","Cable Pullover"],
               ["meso03Fri","Neutral-Grip Row","Bird Dog"],["meso03Sat","SL RDL","Face Pull"]];
var STANDALONE=[["meso03Mon","Rack Pull"],["meso03Mon","Bulgarian SS"],["meso03Mon","Suitcase Carry"],
  ["meso03Wed","Safety Bar Squat"],["meso03Wed","Rope Triceps Pressdown"],["meso03Fri","Romanian Deadlift (DB)"],
  ["meso03Fri","Step-Up"],["meso03Fri","Suitcase Carry"],["meso03Sat","Leg Press"],["meso03Sat","Backward Walking Lunges"],["meso03Sat","Sled Push"]];
var RL_STANDALONE=[["meso03Mon","Bulgarian SS"],["meso03Mon","Suitcase Carry"],["meso03Wed","Rope Triceps Pressdown"],
  ["meso03Fri","Step-Up"],["meso03Fri","Suitcase Carry"]];
var RL_IN_SUPERSET=[["meso03Mon","Pallof"],["meso03Wed","SA Chest Press"],["meso03Fri","Neutral-Grip Row"],["meso03Sat","SL RDL"]];
/* Plan totals per phase — the restructure moves blocks, never sets. Wed lost the pinch in d232f93. */
var TOTALS={Baseline:{meso03Mon:17,meso03Wed:15,meso03Fri:17,meso03Sat:19},Volume:{meso03Mon:18,meso03Wed:16,meso03Fri:18,meso03Sat:19},
            Performance:{meso03Mon:17,meso03Wed:15,meso03Fri:17,meso03Sat:19},Deload:{meso03Mon:12,meso03Wed:11,meso03Fri:12,meso03Sat:12}};
var EST={Baseline:{meso03Mon:58,meso03Wed:52,meso03Fri:59,meso03Sat:57},Volume:{meso03Mon:58,meso03Wed:52,meso03Fri:59,meso03Sat:57},
         Performance:{meso03Mon:58,meso03Wed:52,meso03Fri:59,meso03Sat:57},Deload:{meso03Mon:49,meso03Wed:46,meso03Fri:50,meso03Sat:44}};
Object.keys(PHASE_DATES).forEach(function(ph){
  var d=PHASE_DATES[ph];
  onDate(d[0],d[1],d[2],function(){
    SUPERSETS.forEach(function(x){
      var b=blockWith(x[0],x[1]);
      eq(b.ex.map(function(e){return e.key;}).join(),x[1]+","+x[2],ph+" "+x[0]+": "+x[1]+" + "+x[2]+" superset, in that order");
      eq(b.bells,b.ex[0].sets,"...one bell per round");
      ok(/superset: .+ → .+ → rest/.test(b.ex[0].rx)&&/superset: .+ → .+ → rest/.test(b.ex[1].rx),"...both carry the A1 → A2 → rest cue");
    });
    STANDALONE.forEach(function(x){ eq(blockWith(x[0],x[1]).ex.length,1,ph+" "+x[1]+" stays standalone"); });
    RL_STANDALONE.forEach(function(x){ ok(/right → left → rest/.test(exOf(x[0],x[1]).rx),ph+" "+x[1]+": right → left → rest"); });
    RL_IN_SUPERSET.forEach(function(x){ ok(/right → left/.test(exOf(x[0],x[1]).rx),ph+" "+x[1]+": right → left inside the superset"); });
    ok(!/right side first/.test(M3DAYS.map(function(day){return exList(day).map(function(e){return e.rx;}).join();}).join()),ph+": right → left replaces \"right side first\"");
    M3DAYS.forEach(function(day){
      var s=realSession(8,day);
      s.blocks.forEach(function(b){
        if(b.t==="Activation"||b.ramp||!b.ex.some(function(e){return e.sets>0;})) return;
        /* Each accessory round: some work, then ~60–90 s rest — never under 60 s more than the work. */
        ok(b.ivl>=110&&b.ivl<=240,ph+" "+day+" "+b.t+": bell interval "+b.ivl+" s set to the round");
        eq(b.mins,Math.round(b.bells*b.ivl/60),"...and the block's minutes follow from it");
      });
      var rows=exList(day).filter(function(e){return e.sets>0;}).map(function(e){var r=[];for(var i=0;i<e.sets;i++)r.push({w:"",r:""});return {key:e.key,sets:r};});
      eq(planScore(rows,function(){return null;}).total,TOTALS[ph][day],ph+" "+day+": plan total unchanged");
      eq(estSessionMins(s),EST[ph][day],ph+" "+day+": estimated ~"+EST[ph][day]+" min");
      ok(!estText(s).over,"...under the 65 min flag");
    });
    var sat=realSession(8,"meso03Sat"), cool=sat.blocks[sat.blocks.length-1];
    eq(cool.t+" · "+cool.mins+" min","Cooldown (optional) · 5 min",ph+" Sat ends on an optional 5-min cooldown");
    ok(!/Cardio Ramp/.test(sat.blocks.map(function(b){return b.t;}).join()),"...not the 8–10 min Cardio Ramp");
  });
});
onDate(2026,10,19,function(){
  var steps=focusStepsFor(realSession(8,"meso03Mon").blocks,function(){return 0;}), s=realSession(8,"meso03Mon");
  var names=steps.map(function(st){return s.blocks[st.bi].ex[st.ei].key+" "+(st.i+1);}).slice(9,15).join(", ");
  eq(names,"Hip Thrust 1, Pallof 1, Hip Thrust 2, Pallof 2, Hip Thrust 3, Pallof 3","set mode walks the superset A1, A2, A1, …");
  eq(realInterval(blockWith("meso03Mon","Rack Pull")),180,"main lift keeps its own bells (Baseline 4 × 3:00)");
  eq(blockWith("meso03Mon","Rack Pull").ramp,180,"...plus 3 min of ramp sets in the estimate");
});
/* The flag: strictly over 65 min, with 15 min of HEP + activation counted in. */
eq(estSessionMins({blocks:[{t:"Activation",bells:2,ivl:600}]}),15,"activation sits inside the 15 min warm-up budget");
eq(estText({blocks:[{t:"X",bells:1,ivl:2940}]}).over,false,"65 min exactly: no flag");
ok(estText({blocks:[{t:"X",bells:1,ivl:3000}]}).over&&/over the 65 min target/.test(estText({blocks:[{t:"X",bells:1,ivl:3000}]}).text),"66 min: flagged amber");
eq(estText(realSession(8,"meso03Wed")).text.indexOf("including 15 min of HEP + activation")>0,true,"estimate says what it includes");
ok(SRC.indexOf('<b>Estimated time:</b> ${est.text}')>=0,"...and is shown on lift days");

/* Form Reference isn't in a loaded region; guard the Face Pull wording at the source. */
ok(SRC.indexOf("Cable with a rope attachment, pulley set at eye level.")>=0&&SRC.indexOf("thumbs pointing back")>=0,"Face Pull Form Reference: cable rope at eye level, neutral grip, thumbs back");
ok(SRC.indexOf("Band anchored at roughly face height")<0,"...not the old band setup");

section("Meso 3 loading guidance — on screen mid-session");
var MAINS=[["meso03Mon","Rack Pull"],["meso03Wed","Safety Bar Squat"],["meso03Fri","Romanian Deadlift (DB)"]];
var STARTS=[["meso03Mon","Rack Pull","Start ~185 lb"],["meso03Wed","Safety Bar Squat","Start ~135–145 lb"],
  ["meso03Fri","Romanian Deadlift (DB)","Start ~135 lb"],["meso03Wed","SA Chest Press","Start ~40–45 lb"],
  ["meso03Fri","Neutral-Grip Row","Start ~40–45 lb"],["meso03Wed","Rope Triceps Pressdown","Start ~12.5–15 lb"],
  ["meso03Wed","Cable Pullover","Start ~12.5–15 lb"],["meso03Mon","Bulgarian SS","Start ~25 lb each hand"],
  ["meso03Mon","Suitcase Carry","Start ~45 lb/side"],["meso03Fri","Suitcase Carry","Start ~45 lb/side"],
  ["meso03Sat","Leg Press","Start ~180–200 lb"],["meso03Fri","Step-Up","Start ~20 lb each hand"],
  ["meso03Sat","SL RDL","Start ~35 lb"],["meso03Sat","Backward Walking Lunges","Start ~15 lb each hand, arms straight"],
  ["meso03Mon","Hip Thrust","Start light — find it"]];
Object.keys(PHASE_DATES).forEach(function(ph){
  var d=PHASE_DATES[ph];
  onDate(d[0],d[1],d[2],function(){
    MAINS.forEach(function(m){
      ok(/1–2 ramp sets, not logged · then all working sets at one weight/.test(exOf(m[0],m[1]).rx),ph+" "+m[1]+": ramp sets + one working weight");
    });
  });
});
/* Ramp sets are cues, not set rows — the plan score's set total is working sets only. */
onDate(2026,10,19,function(){
  MAINS.forEach(function(m){
    var e=exOf(m[0],m[1]), rows=[]; for(var i=0;i<e.sets;i++) rows.push({w:"",r:""});
    eq(planScore([{key:e.key,sets:rows}],function(){return null;}).total,4,
       m[1]+": plan total = 4 working sets, ramps not counted");
  });
});
[[2026,10,19,"wk 1"],[2026,10,26,"wk 2"]].forEach(function(d){
  onDate(d[0],d[1],d[2],function(){
    STARTS.forEach(function(x){ ok(exOf(x[0],x[1]).rx.indexOf(x[2])>=0,"Baseline "+d[3]+": "+x[1]+" shows "+x[2]); });
    ok(/First working set RPE 8\+ → drop 10%\. RPE 5 → add 5–10 lb\./.test(mesoPhase3().rpe),"Baseline "+d[3]+": calibration line in the phase cue");
  });
});
[[2026,11,2,"Volume wk 3"],[2026,12,7,"Deload wk 8"]].forEach(function(d){
  onDate(d[0],d[1],d[2],function(){
    var txt=M3DAYS.map(function(day){ return exList(day).map(function(e){return e.rx||"";}).join(" | "); }).join(" | ");
    ok(txt.indexOf("Start ")<0,d[3]+": no Start hints — Last time takes over");
    ok(!/First working set/.test(mesoPhase3().rpe),d[3]+": no calibration line");
  });
});
onDate(2026,10,19,function(){
  ok(!/Start/.test(exOf("meso03Mon","Pallof").rx+exOf("meso03Sat","Face Pull").rx+exOf("meso03Mon","Band Pull-Aparts").rx),"no Start hint where none was given");
});
[[2026,10,19,"wk 1"],[2026,10,26,"wk 2"]].forEach(function(d){ onDate(d[0],d[1],d[2],function(){
  ok(hrText("meso03Sat",8).indexOf("First working set above 7/10 → drop 10%.")>=0,"Baseline "+d[3]+": Saturday's calibration line, fitted to the cap");
  ok(!/RPE 8\+/.test(hrText("meso03Sat",8)),"...and not the weekday RPE 8+ line");
  ok(hrText("meso03Mon",8).indexOf("First working set RPE 8+ → drop 10%.")>=0,"...while Monday's HR box carries the weekday line");
});});
[[2026,11,2,"Volume wk 3"],[2026,12,7,"Deload wk 8"]].forEach(function(d){ onDate(d[0],d[1],d[2],function(){
  ok(!/First working set/.test(hrText("meso03Sat",8)+hrText("meso03Wed",8)),d[3]+": no calibration line on Saturday or weekdays");
});});
eq(MESO03_LOADING_RULE,"Main lifts: all sets at RPE 7 or easier → add 5 lb next week (Rack Pull 10 lb). Accessories: stay at one weight until every set hits the top of the rep range, then go up. Single-arm: right side sets the load; left matches.","progression rule text");
ok(SRC.indexOf("<b>Loading:</b> ${meso03LoadingText()}")>=0,"...shown in the Scoring box on plan days");
onDate(2026,10,26,function(){ eq(meso03LoadingText(),MESO03_LOADING_RULE,"wk 2: the Scoring box shows the RPE rule"); });
onDate(2026,11,9,function(){ eq(meso03LoadingText(),MESO03_LOADING_RULE,"wk 4: ...and again after week 3"); });
onDate(2026,11,2,function(){
  var t=meso03LoadingText();
  ok(t.indexOf("Hit all sets at top of range → add load next week; if not, hold.")>=0,"wk 3: the Scoring box shows the week-3 rule");
  ok(!/RPE 7 or easier/.test(t),"...instead of the RPE rule, so the main lifts don't show two");
  ok(/Single-arm: right side sets the load; left matches\./.test(t),"...keeping the single-arm sentence");
});

section("Meso 3 week 3 — load targets and the progression line");
var WK3={meso03Mon:{"Rack Pull":"185 lb (hold)","Bulgarian SS":"25 lb (drop to 20 if set 1 <8)","Hip Thrust":"80 lb all sets",
                    "Pallof":"7.5–10 lb","Suitcase Carry":"45 lb/side"},
         meso03Wed:{"Safety Bar Squat":"150 lb","SA Chest Press":"45 lb","Cable Pullover":"15 lb","Rope Triceps Pressdown":"17.5 lb"},
         meso03Fri:{"Romanian Deadlift (DB)":"135 lb","Neutral-Grip Row":"40 lb","Step-Up":"20 lb","Suitcase Carry":"45 lb/side","Prone Y-Raises":"2.5 lb"},
         meso03Sat:{"Leg Press":"190 lb","Face Pull":"20 lb","SL RDL":"35 lb","Backward Walking Lunges":"15 lb","Sled Push":"0.8 mph (hold)"}};
var WK3_LINE="Hit all sets at top of range → add load next week; if not, hold.",
    WK3_REC="Hold last week's load if recovery is red or sleep <5.5 h.";
[[2026,11,2],[2026,11,8]].forEach(function(d){ onDate(d[0],d[1],d[2],function(){
  Object.keys(WK3).forEach(function(day){
    Object.keys(WK3[day]).forEach(function(k){
      var e=exOf(day,k);
      ok((e.rx||"").indexOf(" · Week 3: "+WK3[day][k])>=0,"wk 3 "+day+" "+k+": target "+WK3[day][k]);
      ok((e.note||"").indexOf(WK3_LINE)===0,"...and the progression line");
    });
  });
  ["Band Pull-Aparts","Scapular Wall Slide","Bird Dog"].forEach(function(k){
    var day=k==="Bird Dog"?"meso03Fri":k==="Band Pull-Aparts"?"meso03Mon":"meso03Wed", e=exOf(day,k);
    ok(!/Week 3/.test(e.rx)&&!e.note,"wk 3: no target or line on "+k+", which has no load");
  });
  ok(exOf("meso03Wed","Safety Bar Squat").note.indexOf(WK3_REC)>0,"Wed squat: recovery/sleep hold line");
  ok(exOf("meso03Sat","Leg Press").note.indexOf(WK3_REC)>0,"Sat leg press: recovery/sleep hold line");
  ok(exOf("meso03Mon","Rack Pull").note.indexOf(WK3_REC)<0,"...and only those two");
  var W3={meso03Mon:{"Rack Pull":185,"Bulgarian SS":25,"Hip Thrust":80,"Pallof":7.5,"Suitcase Carry":45},
          meso03Wed:{"Safety Bar Squat":150,"SA Chest Press":45,"Cable Pullover":15,"Rope Triceps Pressdown":17.5},
          meso03Fri:{"Romanian Deadlift (DB)":135,"Neutral-Grip Row":40,"Step-Up":20,"Suitcase Carry":45,"Prone Y-Raises":2.5},
          meso03Sat:{"Leg Press":190,"Face Pull":20,"SL RDL":35,"Backward Walking Lunges":15}};
  Object.keys(W3).forEach(function(day){ Object.keys(W3[day]).forEach(function(k){
    eq(exOf(day,k).w3,W3[day][k],"wk 3 "+day+" "+k+": set 1 hint target "+W3[day][k]);
  });});
  eq(exOf("meso03Sat","Sled Push").w3,undefined,"Sled Push: 0.8 mph is a speed, not a load — no weight hint");
  eq(exList("meso03Mon").map(function(e){return e.sets;}).join(),"2,5,3,3,3,2","wk 3 Monday set counts unchanged");
});});
[[2026,10,26,"wk 2"],[2026,11,9,"wk 4"]].forEach(function(d){ onDate(d[0],d[1],d[2],function(){
  var all=["meso03Mon","meso03Wed","meso03Fri","meso03Sat"].map(exList).reduce(function(a,b){return a.concat(b);},[]);
  ok(all.every(function(e){return !/Week 3/.test(e.rx||"")&&!e.note&&e.w3===undefined;}),d[3]+": no week-3 targets, lines or hint loads");
});});

section("Meso 3 Saturday — scored like a lift day");
/* Rule text on the RKD tab isn't in a loaded region, so guard its wording at the source. */
ok(SRC.indexOf("Sat is reference only")<0&&SRC.indexOf("cardio Sat<")<0,"RKD tab no longer says every Saturday is unscored cardio");
ok(SRC.indexOf("The Sat Conditioning Sub is reference only, no medal.")>=0,"...it names the Conditioning Sub as the unscored one");
ok(LIFT_DAYS.indexOf("meso03Sat")>=0,"meso03Sat is medal-eligible");
ok(LIFT_DAYS.indexOf("sat")<0,"...the shared Sat Conditioning Sub still is not");
DAY="meso03Sat"; eq(curModel(),"strength","meso03Sat scores on the strength curve");
DAY="sat";       eq(curModel(),"cardio","...while the shared Sat keeps the cardio ramp");
DAY="meso02Wed";
["meso03Mon","meso03Wed","meso03Fri"].forEach(function(d){ ok(LIFT_DAYS.indexOf(d)>=0,d+" is medal-eligible"); });

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

section("Meso 3 lift days — medal on plan completion");
/* A Finish-shaped entry: rx prescribed sets, the first `done` of them with reps, then any extras.
   top is the [load,reps] every done set carries. */
function PE(key,rx,done,top,opts){
  opts=opts||{}; var sets=[], n=rx+(opts.extra||0);
  for(var i=0;i<n;i++) sets.push(i<done?{w:String(top[0]),r:String(top[1])}:{w:"",r:""});
  var e={key:key,sets:sets};
  if(opts.extra){ e.extra=opts.extra; e.programmed=rx; }
  if(opts.sym) e.symptoms=opts.sym;
  return e;
}
var NOLAST=function(){return null;};
function lastAt(map){ return function(k){ return map[k]?[{w:String(map[k][0]),r:String(map[k][1])}]:null; }; }
var sym=function(resolved,kind){ return {set:2,kind:kind||"tingling",side:"Right",resolved:resolved,at:"2026-10-19T18:00:00Z"}; };
ok(PLAN_DAYS.join()==="meso03Mon,meso03Wed,meso03Fri,meso03Sat","plan-scored days are exactly Meso 3's four lift templates");

/* Tiers at the boundaries — one 100-set exercise, so done is the percentage. */
var pct=function(d,prog){ return planMedalFor({done:d,total:100,prog:prog||0},false).t; };
eq(pct(79),"Partial","79% -> Partial, not OFF TARGET");
eq(pct(80),"BRONZE","80% -> Bronze");
eq(pct(99,3),"BRONZE","99% -> Bronze, even with progressions");
eq(pct(100),"SILVER","100% with no progression -> Silver");
eq(pct(100,1),"GOLD","100% + 1 progression -> Gold");
eq(planMedalFor({done:15,total:19,prog:0},false).t,"Partial","15/19 = 78.9% -> Partial (no rounding up to 80)");
eq(planMedalFor({done:16,total:20,prog:0},false).t,"BRONZE","16/20 -> Bronze");
eq(planMedalFor({done:0,total:0,prog:0},false),null,"nothing prescribed -> no medal");
eq(planText({done:12,total:18,prog:1}),"Sets 12/18 · 1 progression","chip text, singular");
eq(planText({done:18,total:18,prog:2}),"Sets 18/18 · 2 progressions","...and plural");

/* Counting */
var c=planScore([PE("Rack Pull",4,4,[225,6]),PE("Hip Thrust",3,1,[135,10])],NOLAST);
eq(c.done+"/"+c.total,"5/7","done = sets with reps, across every exercise");
c=planScore([{key:"Rack Pull",sets:[{w:"225",r:""},{w:"225",r:"0"},{w:"",r:"6"}]}],NOLAST);
eq(c.done,1,"a load with no reps, or 0 reps, is not a done set");
c=planScore([PE("Rack Pull",4,6,[225,6],{extra:2}),PE("Hip Thrust",3,0,[0,0])],NOLAST);
eq(c.done+"/"+c.total,"4/7","extra sets are capped at the prescription — they can't cover a skipped exercise");
c=planScore([PE("Band Pull-Aparts",2,2,[0,15]),PE("Plate Pinch Hold",2,2,[25,30])],NOLAST);
eq(c.done+"/"+c.total,"4/4","activation (bodyweight) and seconds-box holds count like any set");

/* Pain rule: anything not marked "went away" credits the whole prescription. */
c=planScore([PE("Neutral-Grip Row",3,1,[40,10],{sym:[sym(false)]})],NOLAST);
eq(c.done+"/"+c.total,"3/3","stopped for pain (\"Still there\") -> remaining sets count as done");
c=planScore([PE("Neutral-Grip Row",3,1,[40,10],{sym:[sym(null)]})],NOLAST);
eq(c.done+"/"+c.total,"3/3","unchecked (\"Check later\") -> also full credit, no second tap needed");
c=planScore([PE("Neutral-Grip Row",3,0,[0,0],{sym:[sym(false)]})],NOLAST);
eq(c.done+"/"+c.total,"3/3","...even if it stopped before a set was typed");
c=planScore([PE("Neutral-Grip Row",3,1,[40,10],{sym:[sym(true,"ache")]})],NOLAST);
eq(c.done+"/"+c.total,"1/3","marked \"went away\" -> no credit, the sets still have to be done");
c=planScore([PE("Neutral-Grip Row",3,1,[40,10],{sym:[sym(true),sym(false)]})],NOLAST);
eq(c.done,3,"one unresolved entry among several is enough");

/* Progression */
var L=lastAt({"Rack Pull":[225,6]});
eq(planScore([PE("Rack Pull",4,4,[235,5])],L).prog,1,"heavier top set -> progression, even on fewer reps");
eq(planScore([PE("Rack Pull",4,4,[225,7])],L).prog,1,"same load, more reps -> progression");
eq(planScore([PE("Rack Pull",4,4,[225,6])],L).prog,0,"matching last time -> not a progression");
eq(planScore([PE("Rack Pull",4,4,[215,10])],L).prog,0,"more reps at a lighter load -> not a progression");
eq(planScore([PE("Rack Pull",4,4,[235,5])],NOLAST).prog,0,"no Last time -> nothing to beat");
eq(planScore([{key:"Rack Pull",sets:[{w:"185",r:"8"},{w:"235",r:"4"},{w:"225",r:"6"}]}],L).prog,1,"the top set is the heaviest, not the last");
eq(planScore([{key:"Rack Pull",sets:[{w:"245",r:""},{w:"225",r:"6"}]}],L).prog,0,"a load with no reps can't be the top set");
eq(planScore([PE("Rack Pull",4,4,[235,5],{sym:[sym(true,"ache")]})],L).prog,0,"progression voided by a pain entry — even one that went away");
eq(planScore([PE("Rack Pull",4,4,[235,5],{sym:[sym(false)]})],L).done,4,"...though the sets still count");
eq(planScore([PE("Suitcase Carry",2,2,[105,40])],lastAt({"Suitcase Carry":[105,30]})).prog,1,"carry: same load, more yards -> progression");

/* Saturday and the Deload week: Gold at 100%, no progression asked for. */
var FULL=[PE("Leg Press",3,3,[180,10])];
eq(planCapped("meso03Sat"),true,"Saturday is capped");
onDate(2026,11,2,function(){
  eq(planCapped("meso03Mon"),false,"a Volume-week Monday is not");
  eq(finishMedal("meso03Mon","lift",FULL,null,null,NOLAST).medal,"SILVER","...so 100% with no progression is Silver");
  eq(finishMedal("meso03Sat","lift",FULL,null,null,NOLAST).medal,"GOLD","Saturday: 100% with no progression is Gold");
  eq(finishMedal("meso03Sat","lift",[PE("Leg Press",5,4,[180,10])],null,null,NOLAST).medal,"BRONZE","Saturday at 80% -> Bronze (no Silver there)");
});
onDate(2026,12,7,function(){
  eq(planCapped("meso03Mon"),true,"week 8 Deload is capped");
  eq(finishMedal("meso03Fri","lift",FULL,null,null,NOLAST).medal,"GOLD","Deload: 100% with no progression is Gold");
  eq(finishMedal("meso03Wed","lift",[PE("Cable Pullover",2,1,[30,8])],null,null,NOLAST).medal,"Partial","Deload: 50% -> Partial");
});

/* finishMedal — the stamp Finish writes */
onDate(2026,10,21,function(){
  var fm=finishMedal("meso03Wed","lift",FULL,140,[0,5,20,10,0,0],lastAt({"Leg Press":[170,10]}));
  eq(fm.medal,"GOLD","a plan day medals on the plan, whatever RKD came to (140 vs target 105)");
  eq(fm.plan&&planText(fm.plan),"Sets 3/3 · 1 progression","...and returns the count to stamp");
  eq(finishMedal("meso03Wed","lift",FULL,null,null,NOLAST).medal,"SILVER","no strap -> still a medal");
  eq(finishMedal("meso03Wed","lift",[PE("Leg Press",3,0,[0,0])],103,null,NOLAST).medal,null,"nothing done -> no medal, even with RKD");
});
eq(finishMedal("meso02Mon","lift",FULL,103,null,NOLAST).medal,"GOLD","Meso 2 lift days still medal on RKD vs target");
eq(finishMedal("meso02Mon","lift",FULL,80,null,NOLAST).medal,"OFF TARGET","...including OFF TARGET");
eq(finishMedal("meso02Mon","lift",FULL,103,null,NOLAST).plan,undefined,"...and stamp no plan");
eq(finishMedal("tue","zone2",[],50,[0,0,30,0,0,0]).medal,"GOLD","Zone 2 unchanged: all time in Z2 -> Gold");
eq(finishMedal("thu","zone2",[],50,[0,2,28,0,0,0]).medal,"SILVER","...93% in Z2 -> Silver");
eq(finishMedal("tue","zone2",[],50,[0,10,20,0,0,0]).medal,"OFF TARGET","...67% -> OFF TARGET");
eq(finishMedal("tue","zone2",[],50,[0,0,30,0,0,0]).plan,undefined,"...with no plan count");
eq(finishMedal("sun","recovery",[],null,null).medal,"Done ✓","Sunday is still Done ✓");
eq(finishMedal("sat","class",[],60,null).medal,null,"the shared Sat Conditioning Sub still has no medal");

/* The chip and Finish read the same entries off the form. */
resetState();
var CSESS={blocks:[{ex:[{key:"Rack Pull",n:"Rack Pull",rx:"4 × 6",sets:2},{key:"Suitcase Carry",n:"Suitcase Carry",rx:"2 × 40 yd",sets:2,rUnit:"yd"}]}]};
fillForm({"w_0_0_0":"225","r_0_0_0":"6","w_0_0_1":"225","r_0_0_1":"6","w_0_1_0":"105","r_0_1_0":"40","w_0_1_1":"105","r_0_1_1":""});
eq(planText(planScore(collectEntries(CSESS),NOLAST)),"Sets 3/4 · 0 progressions","counted straight off the session form");
["meso03Mon","meso03Fri"].forEach(function(d){ eq(exOf(d,"Suitcase Carry").rUnit,"yd","Suitcase Carry's second box reads yd on "+d); });

/* Stamped, never re-graded */
resetState(); DAY="meso03Mon"; day="meso03Mon"; medal="SILVER"; plan={done:18,total:18,prog:0};
saveEntry();
eq(LOGS[0].medal,"SILVER","Finish stamps the plan medal");
eq(LOGS[0].plan&&planText(LOGS[0].plan),"Sets 18/18 · 0 progressions","...and the count");
eq(LOGS[0].target,null,"...with no RKD target, since RKD didn't set it");
resetState(); day="meso02Wed"; medal="GOLD"; plan=null;
saveEntry();
eq(LOGS[0].plan,undefined,"a non-plan day stamps no plan");
eq(LOGS[0].target,105,"...and keeps its RKD target");
var OLD={date:"2026-09-28T18:00:00Z",block:"meso02",blockLabel:"Meso 2",blockWeek:4,day:"meso02Mon",name:"MONDAY",
  entries:[],pxi:80,medal:"OFF TARGET",target:105,zoneMins:null,strain:null,note:""};
var NEW={date:"2026-10-19T18:00:00Z",block:"meso03",blockLabel:"Meso 3",blockWeek:1,day:"meso03Mon",name:"MONDAY",
  entries:[],pxi:131,medal:"GOLD",plan:{done:18,total:18,prog:2},target:null,zoneMins:null,strain:null,note:""};
var sOld=buildSummary([OLD],0), sNew=buildSummary([OLD,NEW],1);
ok(sOld.indexOf("RKD: 80 (OFF TARGET)")>=0,"an old log's summary keeps the medal it was stamped with");
ok(sOld.indexOf("Plan:")<0,"...and grows no Plan line");
ok(sNew.indexOf("RKD: 131\n")>=0,"a plan log shows RKD on its own…");
ok(sNew.indexOf("Plan: Sets 18/18 · 2 progressions (GOLD)\n")>=0,"…and the medal on the Plan line");
resetState(); day="meso02Wed"; medal="GOLD"; plan=null;

/* Rule text that states the scoring isn't in a loaded region, so guard the wording at the source. */
ok(SRC.indexOf("scored and medalled like a lift day (target RKD")<0,"meso03Sat's HR text no longer promises an RKD-target medal");
ok(SRC.indexOf("medal on plan completion (Gold = every set done, no progression needed)")>=0,"...it states the plan rule");
ok(SRC.indexOf("vs. Target RKD on lift days (incl. Meso 3's Full Range Sat)")<0,"RKD tab no longer says Meso 3 Sat medals on Target RKD");
ok(SRC.indexOf("Meso 3 lift days (incl. its Full Range Sat) medal on plan completion, not RKD")>=0,"...it states the plan rule");
ok(SRC.indexOf("Target RKD (lift days before Meso 3)")>=0,"the target setting says which days it grades");

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
var t3=weeklyTotals([{date:"2026-10-19T18:00:00Z",day:"meso03Mon",pxi:100},
                     {date:"2026-10-24T18:00:00Z",day:"meso03Sat",pxi:90},
                     {date:"2026-10-24T18:00:00Z",day:"sat",pxi:500},
                     {date:"2026-10-12T18:00:00Z",day:"meso02Mon",pxi:7}]);
eq(t3["meso03|1"].sum,190,"Meso 3's scored Saturday counts toward its week; the shared Sat does not");
eq(t3["meso03|1"].label,"Meso 3 · Wk 1 · Baseline Phase","...under Meso 3's own label");
eq(t3["meso02|6"].sum,7,"...and Meso 2's last week stays its own bucket");
ok(!t["meso02|1"].label.match(/Meso 1/),"labels name the right block");
ok(t["legacy"]===undefined&&!("meso01|3" in t),"no phantom buckets");
ok(Object.keys(t).every(function(k){return k.indexOf("sat")<0;}),"Sat still excluded");
eq(t["meso01|2"].ord,1,"ord present for cross-block sorting");

section("Weekly RKD — compact bars");
ok(/Sat counts from Meso 3/.test(weeklyBlock([{date:"2026-10-24T18:00:00Z",day:"meso03Sat",pxi:90}])),
   "the label says which Saturdays count, not that Sat is always excluded");
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
var hh=prGrid([{entries:[{key:"Plate Pinch Hold",sets:[{w:"20",r:"25"},{w:"20",r:"31"},{w:"25",r:"18"}]},
                         {key:"Safety Bar Squat",sets:[{w:"185",r:"6"}]}]}]);
ok(/Plate Pinch Hold<\/div><div class="v">31s</.test(hh),"pinch hold PR is the longest hold, in seconds, from the reps box");
ok(/Safety Bar Squat · e1RM/.test(hh),"Safety Bar Squat is PR-tracked as an e1RM lift");
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

section("Set mode — walk order");
var fb=[{ex:[{n:"Prep",sets:0}]},                                   /* nothing to log -> skipped */
        {ex:[{n:"Row",sets:2},{n:"Squat",sets:2}]},                 /* superset */
        {ex:[{n:"Carry",sets:1}]}];
var fs=focusStepsFor(fb,function(){return 0;});
eq(fs.map(function(s){return s.bi+"."+s.ei+"."+s.i;}).join(" "),"1.0.0 1.1.0 1.0.1 1.1.1 2.0.0",
   "a superset alternates exercises set by set; zero-set exercises are skipped");
eq(fs[0].total,2,"each step knows its exercise's set count");
var fx=focusStepsFor(fb,function(bi,ei){return bi===1&&ei===0?1:0;});
eq(fx.map(function(s){return s.bi+"."+s.ei+"."+s.i;}).join(" "),"1.0.0 1.1.0 1.0.1 1.1.1 1.0.2 2.0.0",
   "an extra set extends only the exercise it was added to");
eq(fx[4].total,3,"...and its total counts the extra");
eq(focusStepsFor([],function(){return 0;}).length,0,"no blocks -> no steps");

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

section("Pain check — symptoms are session data");
resetState();
/* A session stopped by pain before anything was typed still has to survive a killed tab. */
sessionDraft={key:draftKey(),day:DAY,fields:{},rpe:0,strain:"",note:"",activity:null};
painEvents[setKey(1,0)]=[{set:2,kind:"tingling",side:"Right",resolved:false,at:"2026-09-20T18:00:00Z"}];
persistDraft();
var PKEY="dtp-draft_2026-09-20_meso02Wed";
ok(!!LS[PKEY],"a logged symptom alone is enough to write a draft");
eq(((parseLS(PKEY).pain||{})["meso02Wed|1_0"]||[]).length,1,"...and the symptom is persisted");
DAY="meso02Mon";
eq(painFor(1,0).length,0,"a symptom does not leak to the same position on another day");
sessionDraft={key:draftKey(),day:DAY,fields:{},rpe:0,strain:"",note:"",activity:null};
persistDraft();
ok(!LS["dtp-draft_2026-09-20_meso02Mon"],"...nor make another day's empty slot look occupied");
DAY="meso02Wed";
painEvents={};
resumeDraft(PKEY);
eq(painFor(1,0).length,1,"resume restores the symptom");
eq(painFor(1,0)[0].resolved,false,"...with its outcome");
ok(painStopped(1,0),"an unresolved-to-persistent symptom marks the exercise stopped");
/* Finish carries it onto the exercise's log entry, where History and copy-summary read it. */
resetState();
var PSESS={blocks:[{ex:[{key:"Rack Pull",n:"Rack Pull",rx:"4 × 5",sets:2}]}]};
fillForm({"w_0_0_0":"225","r_0_0_0":"5","w_0_0_1":"","r_0_0_1":""});
eq(collectEntries(PSESS)[0].symptoms,undefined,"no symptoms -> nothing stamped");
painEvents[setKey(0,0)]=[{set:2,kind:"ache",side:"",resolved:true,at:"2026-09-20T18:00:00Z"}];
var pe=collectEntries(PSESS)[0];
eq((pe.symptoms||[]).length,1,"a logged symptom is saved on its exercise");
eq(pe.symptoms&&pe.symptoms[0].kind,"ache","...with its kind");
painEvents[setKey(0,0)][0].resolved=false;
eq(pe.symptoms[0].resolved,true,"...as a copy, so a later edit can't rewrite a saved entry");
eq(painText({set:3,kind:"tingling",side:"Right",resolved:false}),"Tingling / numb (Right) · set 3 · stayed, stopped","painText reads as one line");
eq(painText({set:1,kind:"ache",side:"",resolved:null}),"Ache / fatigue · set 1 · not checked","...and names an unchecked one");

section("Exercise notes — one per exercise, through draft and Finish");
resetState();
/* Typed in set mode on Wednesday's second block; nothing else entered yet. */
sessionDraft={key:draftKey(),day:DAY,fields:{},rpe:0,strain:"",note:"",activity:null};
setExNote(1,0,"L 75, R elbow fine");
persistDraft();
var NKEY="dtp-draft_2026-09-20_meso02Wed";
ok(!!LS[NKEY],"a note alone is enough to write a draft");
eq((parseLS(NKEY).exNotes||{})["meso02Wed|1_0"],"L 75, R elbow fine","...and the note is persisted under its exercise");
DAY="meso02Mon";
eq(exNoteFor(1,0),"","a note does not leak to the same position on another day");
sessionDraft={key:draftKey(),day:DAY,fields:{},rpe:0,strain:"",note:"",activity:null};
persistDraft();
ok(!LS["dtp-draft_2026-09-20_meso02Mon"],"...nor make another day's empty slot look occupied");
DAY="meso02Wed";
/* The tab is killed: in-memory state is gone, only the durable draft remains. */
exNotes={};
resumeDraft(NKEY);
eq(exNoteFor(1,0),"L 75, R elbow fine","resume restores the note");
setExNote(1,0,"   ");
eq(exNoteFor(1,0),"","clearing the field (whitespace only) removes the note");
setExNote(1,0,"L 75, R elbow fine");
/* Finish stamps it on the exercise's entry, trimmed, and leaves exercises without one alone. */
resetState();
var NSESS={blocks:[{ex:[{key:"Rack Pull",n:"Rack Pull",rx:"4 × 5",sets:1},{key:"Pallof",n:"Pallof Press",rx:"3 × 10",sets:1}]}]};
fillForm({"w_0_0_0":"225","r_0_0_0":"5","w_0_1_0":"20","r_0_1_0":"10"});
eq(collectEntries(NSESS)[0].note,undefined,"no note -> nothing stamped");
setExNote(0,0,"  grip fine, bar slipped set 3 ");
var ne=collectEntries(NSESS);
eq(ne[0].note,"grip fine, bar slipped set 3","a note is saved on its exercise, trimmed");
eq(ne[1].note,undefined,"...and only on that exercise");
/* Through the save path itself, from a resumed draft. */
resetState();
sessionDraft={key:draftKey(),day:DAY,fields:{"w_0_0_0":"225","r_0_0_0":"5"},rpe:0,strain:"",note:"",activity:null};
setExNote(0,0,"felt strong");
persistDraft(); exNotes={};
resumeDraft(NKEY);
entries=collectEntries(NSESS); saveEntry();
eq(LOGS.length,1,"the resumed session finishes");
eq(LOGS[0].entries[0].note,"felt strong","...with the note restored from the draft on its entry");
ok(!LS[NKEY],"...and the draft is cleared");
eq(LOGS[0].note,"","the session-level note is separate and unchanged");
entries=[];
/* Next time: the note shows under "Last time". */
resetState();
LOGS=[{entries:[{key:"Rack Pull",sets:[{w:"225",r:"5"}],note:"old note"}]},
      {entries:[{key:"Rack Pull",sets:[{w:"235",r:"5"}],note:"L 75, R elbow fine"}]}];
eq(lastNoteFor("Rack Pull"),"L 75, R elbow fine","the last session's note comes back");
LOGS.push({entries:[{key:"Rack Pull",sets:[{w:"245",r:"5"}]}]});
eq(lastNoteFor("Rack Pull"),"","...but not past a later session that left none");
eq(lastNoteFor("Pallof"),"","an exercise never noted has none");
eq(lastLineText("70","10","L 75, R elbow fine"),"Last time: 70 × 10 · note: L 75, R elbow fine","last-time line carries the note");
eq(lastLineText("70","10",""),"Last time: 70 × 10","...and reads as before without one");
eq(lastLineText("","","bar slipped"),"Last time: note: bar slipped","a note shows even with no numbers for this set");
eq(lastLineText("","",""),"No previous numbers for this set","...and nothing at all reads as before");

section("Reload — today's draft opens, whichever day it is on");
/* The Sat 10/10 report: a pasted Freeform, sets logged, then Bluefy reloaded the page. It opened
   the weekday's default ("sat"), the Freeform draft looked gone, and the strap wrote the rest of
   the session into a second "sat" draft. */
resetState();
TODAY="2026-10-10"; DAY="sat"; DOM.daySel.value="sat";
DOM.daySel.options=["sat","strengthFree","tue"]; /* values the selector can actually take */
Object.defineProperty(DOM.daySel,"value",{get:function(){return this._v;},set:function(v){ this._v=this.options.indexOf(v)>=0?v:""; },configurable:true});
DOM.daySel.value="sat";
DOM.pasteWorkoutInput={id:"pasteWorkoutInput",value:"RKD-WORKOUT\nDATE: 2026-10-10\nGoblet Squat | 3x10 |\nHip Thrust | 3x10 |\nEND-WORKOUT"};
DOM.pasteWorkoutOut={id:"pasteWorkoutOut",innerHTML:""};
importPastedWorkout(); confirmPastedWorkout();
DAY=DOM.daySel.value;                                   /* curDay() reads the selector in the app */
eq(DAY,"strengthFree","paste for today opens the Freeform session");
eq(freeformNames.length,2,"...with the pasted exercises");
fillForm({"w_0_0_0":"50","r_0_0_0":"10","w_0_1_0":"95","r_0_1_0":"10"});
onSetInput(); live.secs=840; live.zoneSecs=[0,60,600,180,0,0]; live.pxi=40; flushDraft();
var FKEY="dtp-draft_2026-10-10_strengthFree";
eq(Object.keys(parseLS(FKEY).fields||{}).length,4,"sets are autosaved to the Freeform draft");
/* Reload: memory is gone, the selector is back on the weekday default. */
freeformNames=[]; extraSets={}; painEvents={}; exNotes={}; sessionDraft=null; resetCurDraft();
live={zoneSecs:[0,0,0,0,0,0],pxi:0,lastBpm:null,secs:0,tick:null}; sessAcc=0;
DOM.daySel.value="sat"; DAY="sat"; emptyForm([]);
eq(adoptTodayDraft(),FKEY,"reload adopts today's Freeform draft, not the default day");
DAY=DOM.daySel.value;
eq(DAY,"strengthFree","...and opens the session on it");
eq(freeformNames.length,2,"...with its pasted exercises, so its set rows render");
eq(live.secs,840,"...and its tracked time");
eq(live.zoneSecs[2],600,"...and its zone time");
emptyForm(["w_0_0_0","r_0_0_0","w_0_1_0","r_0_1_0"]);  /* what render() builds for 2 exercises */
restoreSessionDraft();
eq(DOM.w_0_0_0.value,"50","...and the typed sets come back into the form");
/* The strap keeps ticking after the reload: the time lands in the same draft, not a new one. */
live.secs=1200; live.zoneSecs[2]=900; flushDraft();
eq(Object.keys(LS).filter(function(k){return k.indexOf("dtp-draft_2026-10-10_")===0;}).join(","),FKEY,"post-reload time stays in ONE draft — no second \"sat\" draft");
eq(parseLS(FKEY).secs,1200,"...which keeps accruing");
eq(Object.keys(parseLS(FKEY).fields||{}).length,4,"...without losing the sets");
eq(pendingDrafts().length,0,"the open draft is not also offered in the banner");

section("Reload — several drafts today: newest opens, the rest are offered");
resetState(); TODAY="2026-10-10";
DOM.daySel.options=["sat","strengthFree","tue"];
Object.defineProperty(DOM.daySel,"value",{get:function(){return this._v;},set:function(v){ this._v=this.options.indexOf(v)>=0?v:""; },configurable:true});
DOM.daySel.value="sat"; DAY="sat";
LS["dtp-draft_2026-10-10_sat"]=JSON.stringify({draftId:"dSat",date:"2026-10-10",day:"sat",savedAt:"2026-10-10T09:10:00.000Z",fields:{},secs:300,zoneSecs:[0,0,300,0,0,0]});
LS["dtp-draft_2026-10-10_strengthFree"]=JSON.stringify({draftId:"dFree",date:"2026-10-10",day:"strengthFree",savedAt:"2026-10-10T09:40:00.000Z",
  fields:{"w_0_0_0":"50"},freeform:[{n:"Goblet Squat",key:"Goblet Squat",sets:3,rx:"3 × 10"}],secs:840,zoneSecs:[0,0,600,0,0,0]});
LS["dtp-draft_2026-10-09_tue"]=JSON.stringify({draftId:"dTue",date:"2026-10-09",day:"tue",savedAt:"2026-10-09T18:00:00.000Z",fields:{"w_0_0_0":"1"}});
eq(adoptTodayDraft(),"dtp-draft_2026-10-10_strengthFree","the most recently edited of today's drafts opens");
DAY=DOM.daySel.value;
var pend=pendingDrafts().map(function(d){return d._key.slice(10);}).sort().join(",");
eq(pend,"2026-10-09_tue,2026-10-10_sat","the banner offers today's other draft alongside yesterday's");
eq(curDraft.resumed,false,"adopted, not resumed");
/* Resume the other one from the banner: the open session is saved first, then swapped. */
live.secs=900; resumeDraft("dtp-draft_2026-10-10_sat"); DAY=DOM.daySel.value;
eq(parseLS("dtp-draft_2026-10-10_strengthFree").secs,900,"resuming another draft saves the open one first");
eq(DAY,"sat","...then opens the resumed one");
eq(live.secs,300,"...with its own tracked time");
eq(pendingDrafts().map(function(d){return d._key.slice(10);}).sort().join(","),"2026-10-09_tue,2026-10-10_strengthFree","...and the Freeform moves to the banner");
/* A draft whose day the selector can't take (a template since removed) is skipped, not forced. */
resetState(); TODAY="2026-10-10";
DOM.daySel.options=["sat"];
Object.defineProperty(DOM.daySel,"value",{get:function(){return this._v;},set:function(v){ this._v=this.options.indexOf(v)>=0?v:""; },configurable:true});
DOM.daySel.value="sat";
LS["dtp-draft_2026-10-10_gone"]=JSON.stringify({draftId:"x",date:"2026-10-10",day:"gone",savedAt:"2026-10-10T09:00:00.000Z",fields:{}});
eq(adoptTodayDraft(),null,"a draft for a day the selector lacks is not adopted");
eq(DOM.daySel.value,"sat","...and the default day is left selected");

section("Day switch — full adoption, never a half one");
/* The known gap: switching to a day with a same-day draft restored the typed fields only. For a
   pasted Freeform that meant no set rows, and the first edit wiped the draft. */
resetState(); TODAY="2026-10-10"; DAY="sat";
LS[FKEY]=JSON.stringify({draftId:"dFree",date:"2026-10-10",day:"strengthFree",savedAt:"2026-10-10T09:40:00.000Z",
  fields:{"w_0_0_0":"50","r_0_0_0":"10"},freeform:[{n:"Goblet Squat",key:"Goblet Squat",sets:3,rx:"3 × 10"},{n:"Hip Thrust",key:"Hip Thrust",sets:3,rx:"3 × 10"}],
  secs:840,zoneSecs:[0,0,600,0,0,0],pxi:40,duration:840,exNotes:{"strengthFree|0_0":"DB"}});
live.secs=300; live.zoneSecs=[0,0,300,0,0,0];
sessionDraft={key:draftKey(),day:"sat",fields:{},rpe:0,strain:"",note:"",activity:null};
DAY="strengthFree"; emptyForm(["w_0_0_0","r_0_0_0","w_0_1_0","r_0_1_0"]);
restoreSessionDraft();
eq(freeformNames.length,2,"switching to the Freeform day restores its exercise list");
eq(live.zoneSecs[2],600,"...its zone time");
eq(exNoteFor(0,0),"DB","...and its exercise notes");
eq(DOM.w_0_0_0.value,"50","...and its sets");
onSetInput(); flushDraft();
eq((parseLS(FKEY).freeform||[]).length,2,"one edit after the switch keeps the exercise list in the draft");
eq(Object.keys(parseLS(FKEY).fields||{}).length,2,"...and its sets");
eq(parseLS(FKEY).secs,840,"...and its tracked time, not the other day's");
/* A plain re-render of the same day must not roll live time back to the last save. */
live.secs=870; sessionDraft=null; restoreSessionDraft();
eq(live.secs,870,"re-rendering the draft already in hand doesn't reset its live time");

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

section("Meso 3 set pre-fill — grey weight hints follow set 1");
/* Last time: a pyramid, with a heavier set that wasn't done (no reps) — top working weight is 145. */
var PYR=[{w:"135",r:"8"},{w:"145",r:"6"},{w:"155",r:""}];
eq(weightHint("meso03Mon",PYR,0,""),"145","set 1 hints last time's top working weight, not set 1's");
eq(weightHint("meso03Mon",PYR,1,""),"","...and sets 2+ hint no weight before set 1 has one");
eq(weightHint("meso03Mon",PYR,2,"150"),"150","once set 1 has a weight, later sets hint it, not last time's pyramid");
eq(weightHint("meso03Mon",PYR,5," 150 "),"150","...extra sets too");
eq(weightHint("meso03Mon",null,0,""),"","no Last time: no hint");
eq(weightHint("meso03Sat",[{w:"",r:"10"}],0,""),"","bodyweight last time: no weight hint");
eq(weightHint("meso02Wed",PYR,1,"150"),"145","other days keep last time's set-for-set numbers");
eq(weightHint("meso02Wed",PYR,2,""),"155","...even an undone set's");
/* Set 1's reps come from the same top set, so Same as last fills a real pair. */
var PYR2=[{w:"175",r:"6"},{w:"185",r:"6"},{w:"195",r:"5"},{w:"205",r:""}];
eq(weightHint("meso03Mon",PYR2,0,"")+" × "+repsHint("meso03Mon",PYR2,0),"195 × 5","set 1 hints the top set as a pair: 195 × 5, not 195 × 6");
eq(repsHint("meso03Mon",PYR2,1),"6","sets 2+ keep last time's reps for that set");
eq(repsHint("meso03Sat",[{w:"",r:"10"},{w:"",r:"12"}],0),"12","bodyweight: set 1 hints the best set's reps");
eq(repsHint("meso03Mon",[{w:"20",r:""}],0),"","no done set last time: no reps hint");
eq(repsHint("meso02Wed",PYR2,0),"6","other days: set 1's reps are last time's set 1");
/* Week 3: a set load (w3) is set 1's hint, over last time's top set; later sets still follow set 1. */
eq(weightHint("meso03Wed",PYR,0,"",150),"150","wk 3 target: set 1 hints the target, not last time's 145");
eq(weightHint("meso03Wed",null,0,"",150),"150","...even with no Last time");
eq(weightHint("meso03Wed",PYR,1,"",150),"","...sets 2+ still wait for set 1");
eq(weightHint("meso03Wed",PYR,1,"155",150),"155","...then hint set 1's typed weight");
eq(weightHint("meso03Wed",PYR,0,"",undefined),"145","no target: last time's top set, as before");
eq(weightHint("meso02Wed",PYR,0,"",150),"135","non-plan days ignore a target");

resetState(); DAY="meso03Mon";
var realLastFor=lastFor; lastFor=function(){ return PYR; };
var PB={blocks:[{letter:"B",t:"Hinge",mins:12,bells:3,ex:[{key:"Rack Pull",n:"Rack Pull",rx:"",sets:3}]}]};
var ph=blockHtml(PB,0), wph=ph.match(/placeholder="[^"]*" id="w_0_0_\d"/g).map(function(x){return x.split('"')[1];});
var rph=ph.match(/placeholder="[^"]*" id="r_0_0_\d"/g).map(function(x){return x.split('"')[1];});
eq(wph.join(),"145,wt,wt","rendered rows: set 1 hints 145, sets 2–3 wait for set 1");
eq(rph.join(),"6,6,reps","...set 1's reps hint comes from that same top set (145 × 6); sets 2+ keep last time's reps");
DAY="meso02Wed"; ph=blockHtml(PB,0);
eq(ph.match(/placeholder="[^"]*" id="w_0_0_\d"/g).map(function(x){return x.split('"')[1];}).join(),"135,145,155","non-Meso 3 day: the pyramid, unchanged");
lastFor=realLastFor;

/* Live: typing set 1 re-points the hints; a typed value is never touched. */
resetState(); DAY="meso03Mon"; extraSets[setKey(0,0)]=1;
DOM.w_0_0_0={id:"w_0_0_0",value:"150",placeholder:"145"};
DOM.w_0_0_1={id:"w_0_0_1",value:"",placeholder:"wt"};
DOM.w_0_0_2={id:"w_0_0_2",value:"140",placeholder:"wt"};
DOM.w_0_0_3={id:"w_0_0_3",value:"",placeholder:"wt"};
refreshWeightHints(PB.blocks);
eq([1,2,3].map(function(i){return DOM["w_0_0_"+i].placeholder;}).join(),"150,150,150","set 1 = 150 → sets 2, 3 and the extra hint 150");
eq(DOM.w_0_0_2.value,"140","...a typed set keeps its own value");
eq(DOM.w_0_0_0.placeholder+"|"+DOM.w_0_0_0.value,"145|150","...and set 1 itself is left alone");
DOM.w_0_0_0.value="";
refreshWeightHints(PB.blocks);
eq(DOM.w_0_0_1.placeholder,"wt","clearing set 1 takes the hint away again");
DAY="meso02Wed"; DOM.w_0_0_0.value="150"; refreshWeightHints(PB.blocks);
eq(DOM.w_0_0_1.placeholder,"wt","other days: no live re-pointing");
resetState();
/* The wiring lives outside loaded regions; guard it at the source. */
ok(SRC.indexOf("function onSetInput(){ draftHold=false; captureSessionDraft(); scheduleDraftSave(); updatePlanChip(); refreshWeightHints(); syncWeekStepper(); }")>=0,"every set edit re-points the hints (and re-syncs the week stepper)");
ok(SRC.indexOf("restoreSessionDraft(); updatePlanChip(); refreshWeightHints();")>=0,"...and so does a render, after the draft is restored");
ok(SRC.indexOf('placeholder="${escAttr(hr)}"')>=0&&SRC.indexOf("hr=repsHint(curDay(),last,st.i)")>=0,"set mode's reps hint uses the same top set on set 1");
ok(SRC.indexOf('placeholder="${escAttr(hw)}"')>=0&&SRC.indexOf("hw=weightHint(curDay(),last,st.i,s1?s1.value:\"\",ex.w3)")>=0,"set mode's weight hint follows set 1 too (so Same as last and ±5 use it), and takes the week-3 target");
ok(SRC.indexOf('const pw=weightHint(curDay(),last,i,"",ex.w3)')>=0,"session rows pass the week-3 target to set 1's hint");
ok(SRC.indexOf("lastLineText(lw,lr,")>=0,"...while its Last time line still shows last time's real numbers");

section("HEP — rebuilt, keys unchanged");
resetState();
/* Every key the July plan logged under, so old hepDetail_* history still has a home. */
var JULY_KEYS=["b1_levator","b1_scapwallslides","b1_pillowcase","b1_pronechest","b1_wallball","b1_elbowdist",
  "b1_wristdev","b1_plankscap","b1_isometricIR","b1_subscap","b1_wristflex","b1_toothbrush","b1_pushups","b1_bicep",
  "float_arom","float_finkelstein","float_cupping","float_doorway","float_lat","float_calf","float_kt",
  "float_diagonal","float_nightsplint"];
var ALL_KEYS=[]; HEP_BLOCKS.forEach(function(b){ b.ex.forEach(function(e){ ALL_KEYS.push(e.key); }); });
JULY_KEYS.forEach(function(k){ ok(ALL_KEYS.indexOf(k)>=0,"July key survives: "+k); });
eq(ALL_KEYS.length,JULY_KEYS.length+4,"...plus exactly four new items");
eq(ALL_KEYS.filter(function(k,i){ return ALL_KEYS.indexOf(k)!==i; }).length,0,"no key appears twice");
var B1=HEP_BLOCKS[0], LIB=HEP_BLOCKS[2];
eq(B1.hepIdx,0,"B1 keeps hepIdx 0");
eq(B1.ex.map(function(e){return e.key;}).join(","),
   "b1_scapwallslides,b1_pillowcase,b1_levator,b1_fingerspreads,b1_platepinch,b1_ulnarslider,b1_radialglide","B1 runs in the new order");
eq(HEP_BLOCKS[1].ex.map(function(e){return e.key;}).join(","),"float_nightsplint","Float is night elbow position only");
ok(LIB.library&&LIB.hepIdx==null,"Library is read-only and has no daily target");
eq(LIB.ex.filter(function(e){return e.retire;}).map(function(e){return e.key;}).sort().join(","),
   "b1_elbowdist,b1_wristdev,float_arom","exactly the three July items are marked retire-pending");
eq(hepTargetIdx().join(","),"0","only B1 counts toward the daily score");
/* Auto-complete: Library logs never tick B1, and B1 needs all seven of its own items. */
var det={}; LIB.ex.forEach(function(e){ det[e.key]=[1]; });
autoCheckHepBlocks(det); eq(loadHep()[0],false,"logging every Library item does not complete B1");
B1.ex.slice(0,6).forEach(function(e){ det[e.key]=[1]; });
autoCheckHepBlocks(det); eq(loadHep()[0],false,"six of seven B1 items does not complete it");
det.b1_radialglide=[8];
autoCheckHepBlocks(det); eq(loadHep()[0],true,"the seventh completes B1");

section("HEP — prescribed set boxes, logged as typed");
/* The real renderHepTab(), with its title line and date label stubbed. */
loadRegions("var todayLabel=function(){return \"Sun, Sep 20\";};\n"+region("function renderHepTab(m){","function toggleHepBlockCollapse(bi){"));
var HEP_SETS={b1_scapwallslides:2,b1_pillowcase:1,b1_levator:2,b1_fingerspreads:2,b1_platepinch:2,
              b1_ulnarslider:2,b1_radialglide:2,float_nightsplint:1};
var HEP_SIDES=["b1_levator","b1_fingerspreads","b1_platepinch","b1_ulnarslider","b1_radialglide"];
HEP_BLOCKS.slice(0,2).forEach(function(b){ b.ex.forEach(function(e){
  eq(e.sets,HEP_SETS[e.key],e.key+": "+HEP_SETS[e.key]+" prescribed sets");
  eq(!!e.sides,HEP_SIDES.indexOf(e.key)>=0,"...per side: "+(HEP_SIDES.indexOf(e.key)>=0));
}); });
function hepRender(){ DOM.title={id:"title",textContent:""}; var m={innerHTML:""}; renderHepTab(m); return m.innerHTML; }
function hepBoxes(h,key){ return (h.match(new RegExp('id="hepIn_'+key+'_\\d+"','g'))||[]).length; }
resetState();
var H=hepRender();
Object.keys(HEP_SETS).forEach(function(k){ var n=HEP_SETS[k]*(HEP_SIDES.indexOf(k)>=0?2:1); eq(hepBoxes(H,k),n,k+": renders exactly its prescribed boxes ("+n+")"); });
/* Per-side: each set row holds its R box then its L box, side by side. */
ok(/<span class="n">1<\/span><input inputmode="decimal" placeholder="R sec" id="hepIn_b1_levator_0"[^>]*><input inputmode="decimal" placeholder="L sec" id="hepIn_b1_levator_1"[^>]*><\/div>/.test(H),"per-side set 1: R and L boxes on one row, right first");
ok(/<span class="n">2<\/span><input inputmode="decimal" placeholder="R reps" id="hepIn_b1_ulnarslider_2"/.test(H),"...set 2 starts with R again (box 3)");
eq((H.match(/<span class="n">\d+<\/span>/g)||[]).length,2+1+2+2+2+2+2+1,"one numbered row per set, not per box");
ok(!/logHepEntry|>Log</.test(H),"no Log button");
ok((H.match(/id="hepIn_[^"]*"/g)||[]).every(function(x){ return /_\d+"$/.test(x); }),"no free-entry input left — every input is a numbered set box");
ok(/id="hepIn_b1_levator_0" value="" oninput="hepBoxInput\('b1_levator',4\)"/.test(H),"each box saves on input, no second tap");
ok(/placeholder="R sec" id="hepIn_b1_levator_0"/.test(H)&&/placeholder="reps" id="hepIn_b1_scapwallslides_0"/.test(H)&&/placeholder="done" id="hepIn_float_nightsplint_0"/.test(H),"placeholders: R/L sec, reps, done");
ok(!/hepIn_b1_pronechest/.test(H),"Library stays read-only");
/* Typing in a box logs it straight away. */
function hepType(key,i,v){ var id="hepIn_"+key+"_"+i; DOM[id]={id:id,value:v}; }
hepType("b1_levator",0,"30"); hepType("b1_levator",1,""); hepBoxInput("b1_levator",4);
eq(JSON.stringify(loadHepDetail().b1_levator),"[30]","typing box 1 logs it at once");
hepType("b1_levator",1,"25"); hepBoxInput("b1_levator",4);
eq(JSON.stringify(loadHepDetail().b1_levator),"[30,25]","...box 2 too");
hepType("b1_levator",0,"35"); hepBoxInput("b1_levator",4);
eq(JSON.stringify(loadHepDetail().b1_levator),"[35,25]","editing a box replaces its value instead of adding one");
hepType("b1_levator",0,"0"); hepType("b1_levator",1,"abc"); hepBoxInput("b1_levator",4);
ok(!("b1_levator" in loadHepDetail()),"clearing to nothing valid removes the item");
H=hepRender(); hepType("b1_scapwallslides",0,"10"); hepBoxInput("b1_scapwallslides",2);
ok(/id="hepIn_b1_scapwallslides_0" value="10"/.test(hepRender()),"a logged value is shown in its box on re-render");
/* A day logged under the old 3-entry cap keeps all three. */
saveHepDetail({b1_scapwallslides:[10,10,8]});
eq(hepBoxes(hepRender(),"b1_scapwallslides"),3,"an old 3-entry day keeps a box per logged value");
/* Logging the seventh B1 item through its boxes completes B1, as before. */
resetState(); saveHepDetail({});
HEP_BLOCKS[0].ex.forEach(function(e){ hepType(e.key,0,"5"); hepBoxInput(e.key,e.sets*(e.sides?2:1)); });
eq(loadHep()[0],true,"filling one box on every B1 item completes B1");

section("Export this cycle so far");
/* The real export code; only shareJson (the share sheet / download) is swapped for a recorder. */
loadRegions(region("function collectHep(){","function importLogs(){"));
var SHARED=[]; shareJson=function(payload,filename){ SHARED.push({data:JSON.parse(payload),filename:filename}); };
function exportFixture(){
  resetState(); SHARED=[];
  LOGS=[{date:"2026-10-18T16:00:00.000Z",n:"meso2 last day"},          /* Sun Oct 18 local */
        {date:new Date(2026,9,19,6,30).toISOString(),n:"meso3 day 1, early"},
        {date:new Date(2026,9,26,21,0).toISOString(),n:"evening session — next day in UTC"},
        {date:"2026-10-31",n:"paste-imported, bare date"}];
  LS["hep_2026-10-18"]="[true,false,false,false,false]"; LS["hep_2026-10-19"]="[true,false,false,false,false]";
  LS["hepDetail_2026-10-18"]='{"b1_levator":[30]}';    LS["hepDetail_2026-10-31"]='{"b1_levator":[30,30]}';
  LS["dtp-pxi"]="{}";
}
onDate(2026,10,31,function(){
  exportFixture(); TODAY="2026-10-31";
  var c=currentCycle(); eq(c.id+" "+c.start.getDate()+"/"+(c.start.getMonth()+1),"meso03 19/10","current cycle is Meso 3 from Oct 19");
  exportCycle();
  var d=SHARED[0].data;
  eq(Object.keys(d).sort().join(),"cycleEnd,cycleStart,hep,hepDetail,logs,partial","the full export's shape plus partial/cycleStart/cycleEnd");
  eq(d.partial+" "+d.cycleStart+" "+d.cycleEnd,"true 2026-10-19 2026-10-31","...marked partial, Oct 19 to today");
  eq(d.logs.map(function(l){return l.n;}).join("|"),"meso3 day 1, early|evening session — next day in UTC|paste-imported, bare date","logs: Oct 19 through today, by local day");
  eq(Object.keys(d.hep).join(),"2026-10-19","hep: from Oct 19 only");
  eq(Object.keys(d.hepDetail).join(),"2026-10-31","hepDetail: from Oct 19 only");
  eq(JSON.stringify(d.hepDetail["2026-10-31"]),'{"b1_levator":[30,30]}',"...entries copied as stored");
  eq(SHARED[0].filename,"block-log-meso03-2026-10-19-to-2026-10-31.json","filename names the cycle and range");
  SHARED=[]; exportLogs();
  eq(Object.keys(SHARED[0].data).sort().join(),"hep,hepDetail,logs","full export: no new fields");
  eq(SHARED[0].data.logs.length,4,"full export: still every log");
  eq(Object.keys(SHARED[0].data.hep).length+Object.keys(SHARED[0].data.hepDetail).length,4,"...and every HEP day");
  eq(SHARED[0].filename,"block-log-"+new Date().toISOString().slice(0,10)+".json","...under the same filename as before");
});
onDate(2026,10,18,function(){
  exportFixture(); TODAY="2026-10-18";
  eq(currentCycle().id,"meso02","on Meso 2's last day the cycle is Meso 2");
  exportCycle(); eq(SHARED[0].data.logs.map(function(l){return l.n;}).join("|"),"meso2 last day","...and a later block's entries are left out");
});
onDate(2026,12,20,function(){
  var c=currentCycle(); eq(c.id+" "+(c.start.getMonth()+1)+"/"+c.start.getDate(),"open 12/14","after Meso 3: Off-block, from Dec 14");
});
onDate(2026,7,1,function(){
  resetState(); SHARED=[]; TOASTS=[]; eq(currentCycle(),null,"before Block 1: no cycle");
  exportCycle(); eq(SHARED.length,0,"...so nothing is exported");
});

section("Import guard — a cycle file asks before replacing sessions");
/* The real import path from the parsed file on; only the file picker / FileReader is skipped. */
loadRegions(region("let pendingImport=null;","/* ================= PASTE WORKOUT IMPORT"));
var OLD_LOGS=[{date:"2026-09-01T15:00:00.000Z",n:"meso2"},{date:"2026-10-20T15:00:00.000Z",n:"meso3"}];
function importFixture(){
  resetState(); LOGS=OLD_LOGS.slice(); LS["hepDetail_2026-09-01"]='{"b1_levator":[30]}';
  DOM.impConfirm={id:"impConfirm",hidden:true,innerHTML:""};
  DOM.impCancel={id:"impCancel",focus:function(){ FOCUSED="impCancel"; }}; FOCUSED=null;
}
var FOCUSED=null;
var CYCLE_FILE={partial:true,cycleStart:"2026-10-19",cycleEnd:"2026-10-31",
                logs:[{date:"2026-10-20T15:00:00.000Z",n:"meso3"}],hep:{},hepDetail:{"2026-10-20":{b1_levator:[25]}}};
function snapshot(){ return JSON.stringify(LOGS)+"|"+JSON.stringify(LS); }
/* A cycle file opens the confirm and changes nothing yet. */
importFixture(); var before=snapshot();
importData(JSON.parse(JSON.stringify(CYCLE_FILE)));
eq(DOM.impConfirm.hidden,false,"cycle file: the confirm opens");
ok(DOM.impConfirm.innerHTML.replace(/<[^>]+>/g,"").indexOf("This file only covers 2026-10-19 to 2026-10-31. Importing will replace all your other sessions. Continue?")>=0,"...with the exact message and dates");
ok(/<button class="imp-cancel" id="impCancel"[^>]*>Cancel<\/button><button class="imp-go"[^>]*>Continue<\/button>/.test(DOM.impConfirm.innerHTML),"...Cancel first, then Continue");
eq(FOCUSED,"impCancel","...and Cancel has focus, so it's the default");
eq(snapshot(),before,"...nothing is touched while it's open");
/* Cancel leaves everything as it was. */
cancelImport();
eq(snapshot(),before,"cancel: sessions and HEP data unchanged");
eq(LOGS.length,2,"...both sessions still there");
eq(DOM.impConfirm.hidden,true,"...and the dialog closes");
confirmImport(); eq(snapshot(),before,"...a stray Continue after Cancel does nothing");
/* Continue proceeds exactly as the import always has. */
importFixture(); importData(JSON.parse(JSON.stringify(CYCLE_FILE))); confirmImport();
eq(LOGS.map(function(l){return l.n;}).join(),"meso3","continue: logs replaced, as before");
eq(LS["hepDetail_2026-10-20"],'{"b1_levator":[25]}',"...HEP day merged in");
eq(LS["hepDetail_2026-09-01"],'{"b1_levator":[30]}',"...earlier HEP days kept");
eq(DOM.impConfirm.hidden,true,"...and the dialog closes");
/* Full and legacy files: no prompt, straight through. */
importFixture(); importData({logs:[{n:"full"}],hep:{},hepDetail:{}});
eq(DOM.impConfirm.hidden,true,"full export: no prompt");
eq(LOGS.map(function(l){return l.n;}).join(),"full","...imported straight away");
importFixture(); importData([{n:"legacy array"}]);
eq(DOM.impConfirm.hidden+" "+LOGS[0].n,"true legacy array","legacy bare-array file: no prompt, imported");
importFixture(); importData({partial:"true",logs:[{n:"string flag"}]});
eq(DOM.impConfirm.hidden+" "+LOGS[0].n,"true string flag","only partial === true prompts");
/* Round trip: what exportCycle writes is what trips the guard. */
onDate(2026,10,31,function(){
  importFixture(); TODAY="2026-10-31"; SHARED=[]; exportCycle(); importData(SHARED[0].data);
  eq(DOM.impConfirm.hidden,false,"a real cycle export trips the guard");
  cancelImport(); eq(LOGS.length,2,"...and cancelling it keeps every session");
  SHARED=[]; exportLogs(); importData(SHARED[0].data); eq(DOM.impConfirm.hidden,true,"a real full export does not");
});

section("Week preview — stepper, lock and read-only guards");
/* stepWeek() closes set mode and stops a block timer on the way; neither exists in this harness. */
var closeFocus=function(){}, stopBlock=function(){};
/* The real logRest() and saveSession(), for their preview guards. */
loadRegions(region("function logRest(){","function toast(t){"),
            region("function saveSession(){","function logRest(){").replace("function saveSession(){","function realSaveSession(){"));
function pvReset(){ resetState(); viewWeeks=0; TODAY="2026-10-31"; DAY="meso03Sat"; view="session";
  DOM.wkStep={id:"wkStep",hidden:false}; DOM.wkLbl={id:"wkLbl",textContent:"",className:""};
  DOM.wkPrev={id:"wkPrev",disabled:false}; DOM.wkNext={id:"wkNext",disabled:false}; }
var PV_DRAFT=DRAFT_PREFIX+"2026-10-31_meso03Sat";
onDate(2026,10,31,function(){
  /* Programming follows planDate(); the real calendar doesn't. */
  pvReset();
  eq(meso03Week(),2,"Oct 31 is Meso 3 week 2");
  viewWeeks=1;
  eq(meso03Week()+" "+blockFor().week,"3 2","preview +1: programming reads week 3, blockFor() still week 2");
  ok(exOf("meso03Wed","Safety Bar Squat").rx.indexOf("Week 3: 150 lb")>=0,"...so week 3's targets show");
  viewWeeks=2;
  ok(!/Week 3/.test(exOf("meso03Wed","Safety Bar Squat").rx)&&meso03LoadingText()===MESO03_LOADING_RULE,"preview +2 (week 4): no week-3 targets, the RPE Loading rule");
  viewWeeks=6;
  eq(phaseForWeek(meso03Week(),"meso03"),"Deload","preview +6: week 8, Deload");
  ok(/Retest/.test(realSession(8,"meso03Mon").retest||"")&&exOf("meso03Sat","Leg Press").sets===2,"...with the retest banner and 2-set Saturday");
  ok(planCapped("meso03Mon"),"...and the Deload medal rule");
  viewWeeks=0;
  eq(meso03Week(),2,"back at 0: week 2 again");
  /* Range comes from BLOCKS: Meso 3 runs weeks 1–8, so from week 2 it's -1 … +6. */
  eq(JSON.stringify(previewRange()),'{"min":-1,"max":6}',"range from BLOCKS: back 1, forward 6");
  pvReset(); stepWeek(-1); stepWeek(-1);
  eq(viewWeeks,-1,"stepping past the block's first week does nothing");
  syncWeekStepper();
  eq(DOM.wkPrev.disabled+" "+DOM.wkNext.disabled,"true false","...the ‹ arrow greys out at the start");
  eq(DOM.wkLbl.textContent+" "+DOM.wkLbl.className,"M3·W1·B pv","...label shows the previewed week, marked as preview");
  for(var i=0;i<10;i++) stepWeek(1);
  eq(viewWeeks,6,"stepping past the block's last week does nothing");
  syncWeekStepper(); eq(DOM.wkPrev.disabled+" "+DOM.wkNext.disabled,"false true","...the › arrow greys out at the end");
  backToThisWeek(); eq(viewWeeks,0,"Back to this week returns to 0");
  syncWeekStepper(); eq(DOM.wkLbl.textContent+" "+DOM.wkLbl.className,"M3·W2·B ","...label is this week, unmarked");
  view="history"; syncWeekStepper(); eq(DOM.wkStep.hidden,true,"stepper hidden off the Session tab");
  /* Locked while this week's session has anything in it. */
  var LOCKS=[["a draft in progress",function(){ writeDraft(PV_DRAFT,{draftId:"d1",day:"meso03Sat",fields:{"w_1_0_0":"190"}}); }],
             ["a typed set",function(){ sessionDraft={key:"x",day:"meso03Sat",fields:{"w_1_0_0":"190"},rpe:0,note:"",strain:""}; }],
             ["session RPE",function(){ sessionDraft={key:"x",day:"meso03Sat",fields:{},rpe:7,note:"",strain:""}; }],
             ["an added set",function(){ extraSets["meso03Sat|1_0"]=1; }],
             ["a symptom",function(){ painEvents["meso03Sat|1_0"]=[{set:1,kind:"ache"}]; }],
             ["an exercise note",function(){ exNotes["meso03Sat|1_0"]="left knee"; }],
             ["WHOOP time accruing",function(){ live.secs=5; }]];
  LOCKS.forEach(function(L){
    pvReset(); L[1](); stepWeek(1); stepWeek(-1);
    eq(viewWeeks,0,"locked with "+L[0]+": stepping does nothing");
    syncWeekStepper(); eq(DOM.wkPrev.disabled+" "+DOM.wkNext.disabled,"true true","...both arrows greyed");
  });
  /* The arrows grey the moment something is typed, not on the next render. */
  /* A non-plan day, so onSetInput()'s weight-hint refresh (set-mode territory) stays out of it. */
  pvReset(); DAY="meso02Wed"; syncWeekStepper(); eq(DOM.wkNext.disabled,false,"fresh session: › is live");
  fillForm({"w_1_0_0":"190"}); onSetInput();
  eq(DOM.wkPrev.disabled+" "+DOM.wkNext.disabled,"true true","typing a set greys both arrows straight away");
  ok(SRC.indexOf("if(live.secs===1) syncWeekStepper();")>=0,"...and so does WHOOP time starting");
  pvReset(); sessionDraft={key:"x",day:"meso03Fri",fields:{"w_1_0_0":"40"},rpe:0,note:"",strain:""};
  stepWeek(1); eq(viewWeeks,1,"another day's typed buffer doesn't lock this day");
  pvReset(); stepWeek(1); eq(viewWeeks,1,"nothing in progress: stepping works");
  /* Second layer: in preview nothing saves, scrapes or restores, even if called directly. */
  pvReset(); writeDraft(PV_DRAFT,{draftId:"d1",day:"meso03Sat",fields:{"w_1_0_0":"190"},rpe:0});
  var keep=LS[PV_DRAFT]; viewWeeks=1;
  sessionDraft={key:"x",day:"meso03Sat",fields:{},rpe:0,note:"",strain:""};
  persistDraft(); eq(LS[PV_DRAFT],keep,"preview: persistDraft() leaves today's draft untouched");
  fillForm({"w_1_0_0":"999"}); var before=sessionDraft;
  captureSessionDraft(); ok(sessionDraft===before,"preview: captureSessionDraft() doesn't scrape the preview form");
  sessionDraft=null; emptyForm(["w_1_0_0"]); restoreSessionDraft();
  eq(DOM["w_1_0_0"].value,"","preview: restoreSessionDraft() doesn't pour today's draft in");
  var nLogs=LOGS.length; logRest(); eq(LOGS.length,nLogs,"preview: logRest() logs nothing");
  try{ realSaveSession(); }catch(e){}
  eq(LOGS.length,nLogs,"preview: saveSession() (Finish) logs nothing");
  eq(LS[PV_DRAFT],keep,"...and today's draft is still intact");
  backToThisWeek(); sessionDraft=null; resetCurDraft(); emptyForm(["w_1_0_0"]); restoreSessionDraft();
  eq(DOM["w_1_0_0"].value,"190","back to this week: the draft restores as usual");
  viewWeeks=0; logRest(); eq(LOGS.length,nLogs+1,"...and logRest() works again at week 0");
});
onDate(2026,10,19,function(){ pvReset(); stepWeek(-1); eq(viewWeeks,0,"Meso 3 week 1: can't step back before Oct 19"); });
onDate(2026,12,13,function(){ pvReset(); stepWeek(1); eq(viewWeeks,0,"Meso 3's last day: can't step past Dec 13"); });
onDate(2026,12,20,function(){ pvReset(); eq(JSON.stringify(previewRange()),'{"min":0,"max":0}',"Off-block: nowhere to step");
  stepWeek(1); stepWeek(-1); eq(viewWeeks,0,"...stepping does nothing"); });
/* Wiring outside the loaded regions, guarded at the source. */
ok(SRC.indexOf('if(viewWeeks){ backToThisWeek(); toast("Back to this week — WHOOP is tracking"); }')>=0,"WHOOP accruing during a preview drops back to this week");
ok(SRC.indexOf("flushDraft(); viewWeeks=0; }")>=0,"leaving the Session tab ends a preview");
ok(SRC.indexOf("if(viewWeeks) return \"\"; /* RPE, strain, notes and Finish")>=0,"preview: no RPE/strain/notes/Finish card");
ok(SRC.indexOf("if(!viewWeeks){\n    h+=staleDraftBannerHtml();")>=0,"preview: no draft banner or HEP panel");
eq((SRC.match(/restoreSessionDraft\(\);[^\n]*lockPreviewForm\(m\);/g)||[]).length,5,"every Session render path locks the preview form");
ok(SRC.indexOf("blockTag(blockFor(planDate()))")>=0,"the title shows the previewed week");

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
