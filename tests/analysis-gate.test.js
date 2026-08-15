/* Analysis gate: what a match has to be before ⇪ Submit Analysis will publish it.

   Designed in docs/submit-analysis-gate-design.md. Seven rules, scored against the
   PAYLOAD — what buildReport() read back out of the database and what the club will
   actually see — never against whatever this tab happens to be holding:

     1  aerial duels        same number on both sides
     2  aerial duels        home won = away lost, home lost = away won
     3  ground duels        same number on both sides
     4  ground duels        home won = away lost, home lost = away won
     5  take-ons            home won = away concerns, home concerns = away won
     6  shot on target      carries the spot the ball crossed the line at
     7  shirt numbers       every number was one that side HAD, at that moment

   1 and 3 are implied by 2 and 4 (a side's total is its wins plus its losses) and are
   still scored and still shown — the total is the line read first, the mirror is the
   line that says where to look.

   The two that can point at a moment do: they name the half and the clock, read off the
   payload's own duration mapping, so the minute quoted is the minute the events table
   shows. tests/submit-analysis.test.js covers the border this rides on (what gets
   frozen, how it travels); this file covers the rules. */
const {makeApp,grabFunction,SRC,CLOUD}=require('./harness');
const {test,eq,deepEq,ok,notOk}=require('./tiny-test');

/* ---------------- fixture ----------------
   45-minute halves, the 2nd kicking off at video second 3000, so a t is easy to read:
   t=740 -> H1 12:20, t=3400 -> H2 51:40. */
const DUR={enabled:true,halfLen:45,h1Start:0,h1End:2700,h2Start:3000,h2End:5700};
const HOME_XI=['1','2','3','4','5','6','7','8','9','10','11'];
const HOME_BENCH=['14','21'];
const AWAY_XI=['1','2','3','4','5','6','7','8','9','10','12'];
const AWAY_BENCH=['15','23'];
const side=(xi,bench,dir)=>({xi:xi.map(no=>({no,x:50,y:50})),subs:bench.slice(),dir,
  roster:[...xi,...bench].map(no=>({no,name:'P'+no}))});
const lineups=over=>Object.assign({home:side(HOME_XI,HOME_BENCH,'lr'),
  away:side(AWAY_XI,AWAY_BENCH,'rl'),history:[]},over||{});
// the snapshot applySubGroup writes: `on` is the XI in force from t, `bench` what is left
const subSnap=(team,on,bench,t)=>({t,team,label:'Substitution: 7▼ 21▲',
  xi:on.map(no=>({no,x:50,y:50})),subs:bench.slice()});
// …and the one applyRedCard writes: the man is gone from the XI and NOT on the bench
const redSnap=(team,on,bench,t,off)=>({t,team,label:'Red card: '+off+'🟥',
  xi:on.map(no=>({no,x:50,y:50})),subs:bench.slice(),off:String(off),offSpot:{x:50,y:50}});

let uid=0;
const ev=(team,no,event,t,o)=>Object.assign({id:'r'+(++uid),t,team,playerFrom:no,playerTo:'',
  event,gXY:null,grp:null,ord:0,pXY:{x:50,y:50},rXY:null},o||{});
const payload=over=>Object.assign({schema:1,meta:{home:'Kidsgrove',away:'Hanley'},
  lineups:lineups(),dur:DUR,rows:[]},over||{});

// the gate is pure, so the sandbox is only a place to hold it — no state is consulted
const G=(()=>{const a=makeApp({state:{sport:'football',team:'home',rows:[],pendingDots:[],
  macros:{football:[]},editingId:null,editingGroup:null,activeEvent:null,
  teamIds:{home:null,away:null,matchId:'m1',code:'m1'},duration:DUR,lineups:lineups()}});
  return a;})();
const run=p=>G.checkAnalysis(p);
const byId=(v,id)=>v.checks.find(c=>c.id===id);
const text=c=>c.lines.concat(c.spots).join('\n');
// n duel rows of one kind for one side, spaced a minute apart from t0
const duels=(team,event,n,t0)=>Array.from({length:n},(_,i)=>ev(team,'5',event,(t0||100)+i*60));

/* ================= 1-4. the duels ================= */

test('C1/C2 · a duel with both halves tagged balances', () => {
  const v=run(payload({rows:[...duels('home','aerial duel success',3),
                             ...duels('away','aerial duel fail',3)]}));
  ok(byId(v,'aerial-total').ok,'the totals agree');
  ok(byId(v,'aerial-mirror').ok,'and so do the two mirrored halves');
});

test('C1/C2 · a duel tagged on one side only fails both, and names the short side', () => {
  const v=run(payload({rows:[...duels('home','aerial duel success',3),
                             ...duels('away','aerial duel fail',2)]}));
  notOk(byId(v,'aerial-total').ok,'the totals disagree');
  notOk(byId(v,'aerial-mirror').ok,'and the mirror says which half');
  ok(/Away is short 1/.test(text(byId(v,'aerial-total'))),text(byId(v,'aerial-total')));
  ok(/See check 2/.test(text(byId(v,'aerial-total'))),'the total points at the mirror');
});

test('C1/C2 · the case the total hides: equal totals, mirrored halves wrong', () => {
  // Home 2 won / 1 lost, Away 2 won / 1 lost — 3 each, and every duel is impossible
  const v=run(payload({rows:[...duels('home','aerial duel success',2),
                             ...duels('home','aerial duel fail',1,500),
                             ...duels('away','aerial duel success',2,900),
                             ...duels('away','aerial duel fail',1,1300)]}));
  ok(byId(v,'aerial-total').ok,'the totals agree — which is exactly the trap');
  notOk(byId(v,'aerial-mirror').ok,'the mirror catches it');
});

test('C2 · both identities are printed, the passing one included', () => {
  const c=byId(run(payload({rows:[...duels('home','aerial duel success',3),
                                  ...duels('away','aerial duel fail',2)]})),'aerial-mirror');
  eq(c.lines.length,2,'one line per identity');
  ok(/Home won 3  ≠  Away lost 2/.test(c.lines[0]),c.lines[0]);
  ok(/Home lost 0  =  Away won 0/.test(c.lines[1]),c.lines[1]);
});

test('C3/C4 · ground duels are the same rule on their own events', () => {
  const v=run(payload({rows:[...duels('home','ground duel success',4),
                             ...duels('away','ground duel fail',4)]}));
  ok(byId(v,'ground-total').ok); ok(byId(v,'ground-mirror').ok);
  const bad=run(payload({rows:[...duels('home','ground duel success',4),
                               ...duels('away','ground duel fail',1)]}));
  notOk(byId(bad,'ground-total').ok); notOk(byId(bad,'ground-mirror').ok);
  ok(byId(bad,'aerial-total').ok,'and the aerial checks are untouched by it');
});

test('C5 · a take-on won is answered by the concern it caused', () => {
  const v=run(payload({rows:[...duels('home','take-on succes',2),
                             ...duels('away','take-on concern',2)]}));
  ok(byId(v,'takeon-mirror').ok);
  const bad=run(payload({rows:[...duels('home','take-on succes',2),
                               ...duels('away','take-on concern',1)]}));
  notOk(byId(bad,'takeon-mirror').ok);
});

test('C5 · the corrected spelling counts as the shipped misspelling', () => {
  // the event list ships 'take-on succes'; a tagger who fixes the typo must not be told
  // their match is unbalanced
  const v=run(payload({rows:[...duels('home','take-on success',2),
                             ...duels('away','take-on concern',2)]}));
  ok(byId(v,'takeon-mirror').ok,'both spellings are the same event here');
});

test('C5 · take-on fail has no mirror — a match full of them still passes all seven', () => {
  // a beaten take-on is answered by whatever the defender did, or by nothing at all;
  // an identity for it would refuse matches that are tagged correctly
  const v=run(payload({rows:duels('home','take-on fail',5)}));
  ok(v.ok,'all seven pass: '+v.checks.filter(c=>!c.ok).map(c=>c.label).join(', '));
});

test('the duels are counted whatever case the event was renamed to', () => {
  const v=run(payload({rows:[ev('home','5','Aerial Duel Success',100),
                             ev('away','5','  AERIAL DUEL FAIL  ',105)]}));
  ok(byId(v,'aerial-mirror').ok,'capitals and stray spaces are not a different event');
});

test('a row on neither side is ignored rather than invented into a third column', () => {
  const v=run(payload({rows:[ev('home','5','aerial duel success',100),
                             ev('away','5','aerial duel fail',105),
                             ev('spectators','5','aerial duel success',110)]}));
  ok(byId(v,'aerial-mirror').ok);
});

/* ================= 5. shot on target carries its spot ================= */

test('C6 · a shot with a spot passes, one without does not', () => {
  ok(byId(run(payload({rows:[ev('home','9','shot on target',740,{gXY:{x:50,y:40}})]})),
          'shot-spot').ok);
  notOk(byId(run(payload({rows:[ev('home','9','shot on target',740)]})),'shot-spot').ok);
});

test('C6 · the failing shot is dated on the match clock, half and all', () => {
  const c=byId(run(payload({rows:[ev('home','9','shot on target',740)]})),'shot-spot');
  ok(/H1 12:20/.test(c.spots[0]),c.spots[0]);
  ok(/Kidsgrove/.test(c.spots[0]),'and says which side');
  ok(/No\.9/.test(c.spots[0]),'and who took it');
  ok(/no spot was placed/.test(c.spots[0]),'and what is wrong with it');
});

test('C6 · a 2nd-half shot is dated in the 2nd half', () => {
  const c=byId(run(payload({rows:[ev('away','11','shot on target',3400)]})),'shot-spot');
  ok(/H2 51:40/.test(c.spots[0]),c.spots[0]);
});

test('C6 · a goal needs a spot too — it is on target by definition', () => {
  notOk(byId(run(payload({rows:[ev('home','9','goal',740)]})),'shot-spot').ok);
});

test('C6 · a spot outside the frame is refused, and says so differently', () => {
  const c=byId(run(payload({rows:[ev('home','9','shot on target',740,{gXY:{x:140,y:50}})]})),
               'shot-spot');
  notOk(c.ok);
  ok(/outside the goal frame/.test(c.spots[0]),c.spots[0]);
});

test('C6 · a renamed shot event is still caught — the entry gate misses this one', () => {
  // GOAL_SPOT_EVENTS.has() is case-sensitive, so "Shot On Target" never opens the goal
  // mouth and lands with gXY null. This is the backstop for exactly that.
  const c=byId(run(payload({rows:[ev('home','9','Shot On Target',740)]})),'shot-spot');
  notOk(c.ok,'the capitals do not get it past');
});

test('C6 · shots that are not on target are not asked for a spot', () => {
  const v=run(payload({rows:[ev('home','9','shot off target',740),
                             ev('home','9','blocked shot',760),
                             ev('home','9','miss shot',780)]}));
  ok(byId(v,'shot-spot').ok,'the rule is not widened past the goal mouth');
});

/* ================= 6. the shirt numbers ================= */

test('C7 · numbers that were on the pitch pass', () => {
  ok(byId(run(payload({rows:[ev('home','9','recovery',740),
                             ev('away','7','clearance',900)]})),'shirt-numbers').ok);
});

test('C7 · a number the side does not have is refused, with its minute', () => {
  const c=byId(run(payload({rows:[ev('home','99','foul',720)]})),'shirt-numbers');
  notOk(c.ok);
  ok(/H1 12:00/.test(c.spots[0]),c.spots[0]);
  ok(/not in Kidsgrove’s formation/.test(c.spots[0]),c.spots[0]);
});

test('C7 · a substitute who has not come on yet is on the bench, not on the pitch', () => {
  const c=byId(run(payload({rows:[ev('home','21','recovery',740)]})),'shirt-numbers');
  notOk(c.ok);
  ok(/on the bench at 12:20/.test(c.spots[0]),c.spots[0]);
});

test('C7 · a card may be shown to a man on the bench', () => {
  ok(byId(run(payload({rows:[ev('home','21','yellow card',740)]})),'shirt-numbers').ok);
});

test('C7 · the receiver of a pass is checked as well as the passer', () => {
  const c=byId(run(payload({rows:[ev('home','9','pass success',740,{playerTo:'99'})]})),
               'shirt-numbers');
  notOk(c.ok,'a pass to nobody is the same error as a pass by nobody');
  ok(/No\.99/.test(c.spots[0]),c.spots[0]);
});

test('C7 · the reason this check exists: a row made illegal after it was typed', () => {
  /* 7 off, 21 on at 60:00; 21 recovers at 70:00 — legal when it was typed. Then the
     substitution is corrected to 75:00 and nothing re-runs the entry gate for it.
     (video 3900 = H2 60:00, 4500 = 70:00, 4800 = 75:00 against DUR above) */
  const on=HOME_XI.filter(n=>n!=='7').concat('21');
  const at=t=>lineups({history:[subSnap('home',on,['14','7'],t)]});
  const rows=[ev('home','21','recovery',4500)];
  ok(byId(run(payload({lineups:at(3900),rows})),'shirt-numbers').ok,'legal as tagged');
  const c=byId(run(payload({lineups:at(4800),rows})),'shirt-numbers');
  notOk(c.ok,'and illegal once the substitution is moved later');
  ok(/H2 70:00/.test(c.spots[0])&&/on the bench at 70:00/.test(c.spots[0]),c.spots[0]);
});

test('C7 · a red card does NOT refuse itself', () => {
  /* applyRedCard puts a snapshot at exactly the card's own t which takes the man off the
     board entirely, so a gate that asked effectiveLU at that t would refuse every red
     card in every match — and say "sent off at 67:05 and not on the pitch at 67:05". */
  const t=4025, left=HOME_XI.filter(n=>n!=='6');
  const v=run(payload({lineups:lineups({history:[redSnap('home',left,HOME_BENCH,t,'6')]}),
                       rows:[ev('home','6','red card',t)]}));
  ok(byId(v,'shirt-numbers').ok,'the card that caused it is not evidence against itself');
});

test('C7 · but the sent-off man cannot act afterwards, and the card time is quoted', () => {
  const t=4025, left=HOME_XI.filter(n=>n!=='6');
  const c=byId(run(payload({lineups:lineups({history:[redSnap('home',left,HOME_BENCH,t,'6')]}),
                            rows:[ev('home','6','red card',t),
                                  ev('home','6','pass success',4500,{playerTo:'9'})]})),
               'shirt-numbers');
  notOk(c.ok);
  eq(c.spots.length,1,'only the later row is refused');
  ok(/sent off at 62:05/.test(c.spots[0]),c.spots[0]);
});

test('C7 · a substitution is judged on the board before it, so it does not refuse itself', () => {
  const t=3900, on=HOME_XI.filter(n=>n!=='7').concat('21');
  const v=run(payload({lineups:lineups({history:[subSnap('home',on,['14','7'],t)]}),
                       rows:[ev('home','7','substitution',t,{playerTo:'21'})]}));
  ok(byId(v,'shirt-numbers').ok);
});

test('C7 · one side is never judged against the other side-s board', () => {
  // 12 is Away's and Away's only; tagged for Home it is simply a number Home lacks,
  // and the message may not mention Away at all
  const c=byId(run(payload({rows:[ev('home','12','recovery',740)]})),'shirt-numbers');
  notOk(c.ok);
  ok(/not in Kidsgrove’s formation/.test(c.spots[0]),c.spots[0]);
  notOk(/Hanley/.test(c.spots[0]),'the other side is not named: '+c.spots[0]);
});

test('C7 · shirt numbers are matched with the whitespace trimmed off', () => {
  ok(byId(run(payload({rows:[ev('home',' 9 ','recovery',740)]})),'shirt-numbers').ok);
});

test('C7 · a row with no shirt number at all is not invented into an error', () => {
  ok(byId(run(payload({rows:[ev('home','','pause',740)]})),'shirt-numbers').ok);
});

test('C7 · no line-up saved is a refusal, not a warning', () => {
  const c=byId(run(payload({lineups:null,rows:[ev('home','9','recovery',740)]})),
               'shirt-numbers');
  notOk(c.ok,'a match whose numbers cannot be vouched for does not go out');
  ok(/no line-up saved/.test(text(c)),text(c));
  ok(/⇪ Submit home and ⇪ Submit away/.test(text(c)),'and it says what to press');
});

test('C7 · a side with an empty board says which side, at which minute', () => {
  const empty=lineups(); empty.away={xi:[],subs:[],dir:'rl',roster:[]};
  const c=byId(run(payload({lineups:empty,rows:[ev('away','7','pass success',740)]})),
               'shirt-numbers');
  notOk(c.ok);
  ok(/H1 12:20/.test(c.spots[0])&&/Hanley has no line-up/.test(c.spots[0]),c.spots[0]);
});

/* ================= 7. the verdict as a whole ================= */

test('all seven are scored, in the order they were asked for', () => {
  const v=run(payload());
  deepEq(v.checks.map(c=>c.id),
    ['aerial-total','aerial-mirror','ground-total','ground-mirror','takeon-mirror',
     'shot-spot','shirt-numbers']);
  deepEq(v.checks.map(c=>c.n),[1,2,3,4,5,6,7],'and numbered the way the dialog prints them');
});

test('nothing short-circuits: a match that breaks everything says so about everything', () => {
  const v=run(payload({lineups:null,rows:[
    ...duels('home','aerial duel success',2), ...duels('home','ground duel success',2,400),
    ...duels('home','take-on succes',2,800),  ev('home','9','shot on target',740),
    ev('home','99','foul',900)]}));
  eq(v.checks.length,7);
  eq(v.checks.filter(c=>c.ok).length,0,'all seven report, none is skipped');
  notOk(v.ok);
});

test('an empty match passes — the gate states rules, it does not demand tagging', () => {
  const v=run(payload());
  ok(v.ok,v.checks.filter(c=>!c.ok).map(c=>c.label).join(', '));
});

test('the clock comes from the payload, not from this tab', () => {
  /* The sandbox's state.duration kicks the 2nd half off at 3000, so video 2000 is H1
     33:20 by this tab's reckoning. The payload says the half started at 1500, which
     makes the same instant H2 53:20 — the club's clock, and the one to quote. */
  const early=Object.assign({},DUR,{h2Start:1500});
  const c=byId(run(payload({dur:early,rows:[ev('home','9','shot on target',2000)]})),'shot-spot');
  ok(/H2 53:20/.test(c.spots[0]),c.spots[0]);
  notOk(/H1 33:20/.test(c.spots[0]),'not the mapping this tab happens to hold');
  eq(G.state.duration.h2Start,3000,'and the tab-s own mapping is left alone');
});

test('stoppage time is quoted the way the toolbar quotes it', () => {
  const c=byId(run(payload({rows:[ev('home','9','shot on target',2760)]})),'shot-spot');
  ok(/H1 45:00 \+01:00\.00/.test(c.spots[0]),c.spots[0]);
});

test('a duration that is switched off still dates every finding', () => {
  const off={enabled:false,halfLen:45,h1Start:0,h1End:0,h2Start:0,h2End:0};
  const c=byId(run(payload({dur:off,rows:[ev('home','9','shot on target',740)]})),'shot-spot');
  ok(/H1 12:20/.test(c.spots[0]),c.spots[0]);
});

test('the refusal names the checks that failed, so it reads on its own', () => {
  const v=run(payload({rows:[...duels('home','aerial duel success',3),
                             ev('home','9','shot on target',740)]}));
  const msg=G.analysisRefusal(v);
  ok(/Nothing was published/.test(msg),msg);
  ok(/aerial duels/.test(msg)&&/shot on target/.test(msg),msg);
  eq(G.analysisRefusal(run(payload())),null,'and a clean match has nothing to refuse');
});

/* ================= 8. the hint, which never blocks ================= */

test('the hint points at the duels with nothing near them on the other side', () => {
  const v=run(payload({rows:[ev('home','5','aerial duel success',100),
                             ev('away','4','aerial duel fail',102),   // pairs with it
                             ev('home','5','aerial duel success',900)]}));  // this one is loose
  const h=v.hints.find(x=>/nothing on Hanley nearby/.test(x.label));
  ok(h,'a hint was produced: '+JSON.stringify(v.hints.map(x=>x.label)));
  eq(h.spots.length,1,'only the unpaired one');
  ok(/H1 15:00/.test(h.spots[0]),h.spots[0]);
});

test('a hint can never turn a passing match into a failing one', () => {
  // both halves tagged, but eleven seconds apart — well outside the pairing window.
  // The identities hold, so the match passes and the hint is only a hint.
  const v=run(payload({rows:[ev('home','5','aerial duel success',100),
                             ev('away','4','aerial duel fail',111)]}));
  ok(v.ok,'the counts are what decide');
  ok(v.hints.length>0,'…and the guess is still offered');
});

/* ================= 9. how it is wired in ================= */

test('the gate is pure — it reads no state, no DOM, no video', () => {
  ['checkAnalysis','duelTally','checkShotSpots','checkShirtNumbers','histWithoutRow',
   'duelHints','analysisRefusal'].forEach(name=>{
    const body=grabFunction(name);
    notOk(/\bstate\./.test(body),name+' reads no app state');
    notOk(/\$\(|document\.|video\./.test(body),name+' touches no DOM and no video');
  });
});

test('it is scored on the payload the report is built from, never on this tab-s rows', () => {
  const wire=/\/\* ---- Submit Analysis[\s\S]*?\n\}\)\(\);/.exec(SRC)[0];
  ok(/checkAnalysis\(built\.payload\)/.test(wire),'the dialog scores the built payload');
  notOk(/checkAnalysis\(state\.rows|checkAnalysis\(PT\(\)/.test(wire),'never the tab');
});

test('a failing check holds the Publish button down, beside the sync check', () => {
  const wire=/\/\* ---- Submit Analysis[\s\S]*?\n\}\)\(\);/.exec(SRC)[0];
  ok(/const blocked=short\|\|!verdict\.ok/.test(wire),'either one is enough to block');
  ok(/\$\('submitGo'\)\.disabled=blocked/.test(wire));
});

test('the real gate runs inside publishReport, against the build it is about to write', () => {
  // the dialog's verdict was scored against an EARLIER build; between the two a row can
  // arrive from another tab, and only the check next to the RPC closes that
  const fn=/async function publishReport\(clubId, gate\)[\s\S]*?\n  \}/.exec(CLOUD)[0];
  ok(/const built = await buildReport\(\);[\s\S]*?if \(gate\)[\s\S]*?sb\.rpc/.test(fn),
     'build, then gate, then the RPC — in that order');
  ok(/const stop = gate\(built\.payload\); if \(stop\) throw new Error\(stop\)/.test(fn),
     'a string from the gate is a refusal');
  const wire=/\/\* ---- Submit Analysis[\s\S]*?\n\}\)\(\);/.exec(SRC)[0];
  ok(/Cloud\.publishReport\(id,payload=>/.test(wire),'and the dialog hands one down');
});

test('a refused publish leaves the button down; a network error leaves it live', () => {
  const wire=/\/\* ---- Submit Analysis[\s\S]*?\n\}\)\(\);/.exec(SRC)[0];
  ok(/refused=true/.test(wire),'a gate refusal is remembered');
  ok(/\$\('submitGo'\)\.disabled=refused/.test(wire),'and only it keeps the button down');
});

/* …and the same thing proved by running it, not by reading it: publishReport lifted out
   of cloud-sync.js over a stub database. A refusal must leave the events table, the
   report table and the match row exactly as they were — the RPC is the only write, and
   it is the one thing that must not happen.

   publishReport is async and tiny-test runs its cases synchronously, so the three
   scenarios are STARTED here at module load and asserted on below. Every await in the
   chain is on an already-resolved value, so all three settle as microtasks — and Node
   drains the microtask queue before the setImmediate that tiny-test schedules its run
   on. Each case still asserts `settled` first, so if that ever stops holding the tests
   fail loudly instead of passing on assertions that never ran. */
function startPublish(gate){
  const vm=require('vm');
  const out={settled:false,calls:{rpc:0,built:0},seen:null,r:null,err:null};
  const ctx={console,connected:true,matchId:'m1',
    buildReport:async()=>{out.calls.built++;return {payload:{rows:[],meta:{home:'H'}},eventCount:7};},
    sb:{rpc:async()=>{out.calls.rpc++;return {data:{version:3},error:null};}}};
  vm.createContext(ctx);
  vm.runInContext(grabFunction('publishReport',CLOUD,'cloud-sync.js')
    +'\n;globalThis.go=g=>publishReport("club-1",g);',ctx);
  ctx.go(gate==null?gate:p=>{out.seen=p;return gate(p);})
    .then(r=>{out.settled=true;out.r=r;},e=>{out.settled=true;out.err=e.message;});
  return out;
}
const REFUSED=startPublish(()=>'Nothing was published — 2 of the seven analysis checks are still failing.');
const PASSED=startPublish(()=>null);
const NO_GATE=startPublish(null);

test('a refused publish never reaches the database', () => {
  ok(REFUSED.settled,'the scenario ran to completion');
  eq(REFUSED.calls.built,1,'the payload is built once');
  eq(REFUSED.calls.rpc,0,'and the RPC is never called — no version, no channel move');
  ok(/2 of the seven/.test(REFUSED.err||''),'the refusal is what surfaces: '+REFUSED.err);
});

test('a clean match goes through, and the gate saw the very payload that was written', () => {
  ok(PASSED.settled,'the scenario ran to completion');
  eq(PASSED.err,null); eq(PASSED.calls.rpc,1,'one write'); eq(PASSED.calls.built,1,'off one build');
  eq(PASSED.r.version,3);
  ok(PASSED.seen&&Array.isArray(PASSED.seen.rows),'the gate was handed that build-s payload');
});

test('no gate at all still publishes — the parameter is additive', () => {
  ok(NO_GATE.settled,'the scenario ran to completion');
  eq(NO_GATE.err,null); eq(NO_GATE.calls.rpc,1);
});

test('cloud-sync knows nothing about football — the rules stay in the tagging app', () => {
  notOk(/aerial|ground duel|take-on|goal_x is|shirt/i.test(
    /async function publishReport\(clubId, gate\)[\s\S]*?\n  \}/.exec(CLOUD)[0]),
    'the transport carries a veto, it does not own one');
});

test('every passing check is drawn too, not only the failures', () => {
  const wire=/\/\* ---- Submit Analysis[\s\S]*?\n\}\)\(\);/.exec(SRC)[0];
  ok(/v\.checks\.forEach/.test(wire),'the whole list is walked');
  ok(/c\.ok\?'✓':'✗'/.test(wire),'each one marked either way');
  ok(/all seven passed/.test(wire),'and a clean match is told so');
});

test('a long list of findings is cut, and says how many were cut', () => {
  const wire=/\/\* ---- Submit Analysis[\s\S]*?\n\}\)\(\);/.exec(SRC)[0];
  ok(/slice\(0,AN_SPOT_MAX\)/.test(wire));
  ok(/…and '\+\(c\.spots\.length-AN_SPOT_MAX\)\+' more/.test(wire));
});

test('the hints are drawn apart from the verdict, and labelled a guess', () => {
  const wire=/\/\* ---- Submit Analysis[\s\S]*?\n\}\)\(\);/.exec(SRC)[0];
  ok(/Where to look \(a guess\)/.test(wire),'never presented as a finding');
});
