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
var DOM={};                                          /* id -> element stub */
function resetDOM(){ DOM={weekSel:{value:"8"},daySel:{value:"meso02Wed"},clock:{textContent:"0:00"},note:{value:""}}; }
resetDOM();
var document={
  addEventListener:function(){},
  getElementById:function(id){ return DOM[id]||null; }
};

/* App globals the extracted regions read. Tests set these directly. */
var pxiSet={maxHr:185,restingHr:46,target:105,model:"auto"};
var live={zoneSecs:[0,0,0,0,0,0],pxi:0,lastBpm:null,secs:0,tick:null};
var sessionDraft=null, freeformNames=[[],[],[]], curRPE=0, sessAcc=0;
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
function setRPE(){}
function captureSessionDraft(){}
function elapsedSec(){return 2460;}                  /* 41:00 */
function fmt(s){return Math.floor(s/60)+":"+String(s%60);}
function draftKey(){return "8|"+DAY;}
function resetState(){
  LS={}; LOGS=[]; TOASTS=[]; sessionDraft=null; freeformNames=[[],[],[]]; resetDOM();
  live={zoneSecs:[0,0,0,0,0,0],pxi:0,lastBpm:null,secs:0,tick:null};
  sessAcc=0; TODAY="2026-09-20"; DAY="meso02Wed";
  if(typeof resetCurDraft==="function") resetCurDraft();
  if(typeof draftHold!=="undefined") draftHold=false;
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
  region("const DRAFT_PREFIX=","function setView(v){")              /* durable drafts        */
);
/* The PR grid lives inside renderHistory(); wrap the tile-building slice as a function. */
loadRegions("function prGrid(logs){\n"+region("  const prs={};","  const totals=weeklyTotals(logs);")+"\n  return h;\n}");
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
eq(prGrid([]),"","no sessions -> nothing (the no-sessions line covers it)");

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
curDraft=resumedDraft();                    /* Finish tapped a second time for the same draft */
saveEntry();
eq(LOGS.length,1,"a second Finish for the same draft does not append a duplicate");
ok(/Already saved/.test(TOASTS[TOASTS.length-1]),"...and the refusal is explained");
resetCurDraft(); LOGS=[];
saveEntry();
eq(LOGS[0].draftId,null,"a fresh session carries no draftId");
ok(LOGS[0].date!=="2026-09-09T18:30:00.000Z","...and is stamped now, unchanged from before");

section("Durable drafts — empty drafts are not left behind");
resetState();
sessionDraft={key:draftKey(),day:DAY,fields:{},rpe:0,strain:"",note:"",activity:null};
persistDraft();
eq(Object.keys(LS).length,0,"nothing logged and no live time -> no husk record written");

/* ---------------------------------------------------------------- result */
print("\n"+(FAILED?"FAILED — "+FAILED+" of "+CHECKS+" checks":"OK — all "+CHECKS+" checks passed"));
print(FAILED?"RESULT:FAIL":"RESULT:OK");
quit(FAILED?1:0);
