/* Shirt-number gate: what the Enter event box is allowed to store.

   Designed in docs/entry-number-gate-design.md. The rule in one line: a tagged number has
   to be a number the side actually has on its board AT THAT MOMENT — and the board is not
   one list, it is the submitted XI plus every snapshot a substitution or a red card left
   behind, i.e. a step function of match time (effectiveLU).

   Two tiers:
     tier 1  the side HAS this number   (XI(t) ∪ bench(t))     — no exceptions
     tier 2  and he is ON THE PITCH     (XI(t))                — substitutions and cards
                                                                 are exempt, they are
                                                                 about men off the pitch
   And one precondition: a side whose line-up was never submitted is not tagged at all.

   The fixture is the match in the report: Kidsgrove XI 1..10 + 19, bench 11/14/16/21.
   The away side carries 17 and 20, which Kidsgrove does not have anywhere — that pair is
   what the side-isolation tests are built on.
*/
const {makeApp,submit,grabFunction,SRC}=require('./harness');
const {test,eq,deepEq,ok,notOk}=require('./tiny-test');

/* ---------------- fixture ---------------- */
const HOME_XI=[['1',92,50,'GK'],['2',75,72,'LB'],['3',75,28,'RB'],['4',75,45,'CB'],
               ['5',60,60,'CM'],['6',55,50,'CM'],['7',45,25,'RW'],['8',45,72,'LW'],
               ['9',20,50,'CF'],['10',30,62,'CF'],['19',60,35,'CM']];
const HOME_BENCH=['11','14','16','21'];
// 17 and 20 exist ONLY here — Kidsgrove has neither, on the pitch or on the bench
const AWAY_XI=[['1',92,50,'GK'],['2',75,72,'LB'],['4',75,45,'CB'],['6',55,50,'CM'],
               ['8',45,72,'LW'],['9',20,50,'CF'],['10',30,62,'CF'],['12',60,35,'CM'],
               ['13',75,28,'RB'],['17',45,25,'RW'],['20',60,60,'CM']];
const AWAY_BENCH=['22','23'];
const roster=(xi,bench)=>[...xi.map(x=>x[0]),...bench].map(no=>({no,name:'P'+no}));

function fixture(over){
  const side=(xi,bench,dir)=>({
    xi:xi.map(([no,x,y,pos])=>({no,x,y,pos})),
    subs:bench.slice(), dir, roster:roster(xi,bench),
  });
  return Object.assign({
    sport:'football',team:'home',rows:[],pendingDots:[],macros:{football:[]},
    editingId:null,editingGroup:null,activeEvent:null,
    teamIds:{home:null,away:null,matchId:'m1',code:'m1'},
    duration:{enabled:false,halfLen:45,h1Start:0,h1End:0,h2Start:0,h2End:0},
    lineups:{home:side(HOME_XI,HOME_BENCH,'lr'),away:side(AWAY_XI,AWAY_BENCH,'rl'),history:[]},
  },over||{});
}
function app(now,over){
  return makeApp({state:fixture(over),now:now==null?3000:now,
                  homeName:'Kidsgrove Athletic FC',awayName:'Hanley Town FC'});
}
// n dots, all at time t — one per ball touch, the way the pitch overlay places them
const d=(n,t)=>Array.from({length:n},(_,i)=>({x:20+i*9,y:30+i*7,t:t==null?3000:t}));
const xiOf=(a,t,team)=>a.effectiveLU(team||a.state.team,t).xi.map(x=>String(x.no));
const firstAlert=a=>a.log.alerts[0]||'';

/* ================= 1. the refusal itself ================= */

test('T1 · a number the side does not have is refused — nothing is written anywhere', () => {
  const a=app(3000);
  submit(a,'71s2',d(2,3000));
  eq(a.state.rows.length,0,'no event row');
  eq(a.log.upserts.length,0,'nothing reached the cloud');
  eq(a.log.alerts.length,1,'exactly one alert');
  ok(/No\.71 is not in Kidsgrove Athletic FC’s formation\./.test(firstAlert(a)),firstAlert(a));
  ok(/On the pitch at /.test(firstAlert(a)),'the board is printed so the typo is obvious');
  ok(/Nothing was recorded/.test(firstAlert(a)),'and it says so');
});

test('T2 · the entry, its dots and edit mode all survive the refusal', () => {
  const a=app(3000);
  a.state.editingId='row-under-edit';
  a.$('playerInput').value='71s2';
  a.state.pendingDots=d(2,3000);
  a.submitEntry();
  eq(a.$('playerInput').value,'71s2','the text is left to be corrected, not cleared');
  eq(a.state.pendingDots.length,2,'the dots are still placed — the number was wrong, not them');
  eq(a.state.editingId,'row-under-edit','a refusal does not kick you out of edit mode');
});

test('T3 · the formation is not touched by a refusal', () => {
  const a=app(3000);
  submit(a,'7sub21');                       // one real snapshot to have something to lose
  const before=JSON.stringify(a.state.lineups);
  const saves=a.log.lineupSaves, modals=a.log.fmModal;
  submit(a,'99s9',d(2,3100));
  eq(JSON.stringify(a.state.lineups),before,'not one byte of state.lineups moved');
  eq(a.log.lineupSaves,saves,'saveLineups() was not called');
  eq(a.log.fmModal,modals,'and the formation modal did not open');
});

test('T4 · a valid entry goes through exactly as before', () => {
  const a=app(3000);
  submit(a,'1s2',d(2,3000));
  eq(a.state.rows.length,1);
  eq(a.log.alerts.length,0);
  eq(a.state.rows[0].playerFrom,'1'); eq(a.state.rows[0].playerTo,'2');
  eq(a.state.rows[0].event,'pass success');
});

/* ================= 2. a side that was never submitted ================= */

test('T5a · match open, no line-up submitted: the entry is refused', () => {
  const a=app(3000); a.state.lineups.home.xi=[]; a.state.lineups.home.subs=[];
  submit(a,'1s2',d(2,3000));
  eq(a.state.rows.length,0,'nothing recorded');
  eq(a.log.upserts.length,0);
  eq(a.log.alerts.length,1);
  ok(/has no line-up in the tagging tab yet/.test(firstAlert(a)),firstAlert(a));
  ok(/⇪ Submit home/.test(firstAlert(a)),'it names the button to press');
  ok(/Kidsgrove Athletic FC/.test(firstAlert(a)),'and the side it is missing for');
});

test('T5b · no match open: the gate stays out of the way', () => {
  // ⇪ Submit does not exist without a match — Player lists disables it and refuses to
  // write a draft — so demanding one here would lock the app with no way out.
  const a=app(3000,{teamIds:{}});
  a.state.lineups.home.xi=[]; a.state.lineups.home.subs=[];
  submit(a,'1s2',d(2,3000));
  eq(a.state.rows.length,1,'the entry is stored, as it always was');
  eq(a.log.alerts.length,0);
});

test('T5c · one side submitted, the other not: they are judged apart', () => {
  const a=app(3000); a.state.lineups.away.xi=[]; a.state.lineups.away.subs=[];
  submit(a,'1s2',d(2,3000));
  eq(a.state.rows.length,1,'home tags normally');
  a.state.team='away';
  submit(a,'1s2',d(2,3000));
  eq(a.state.rows.length,1,'away wrote nothing');
  ok(/Hanley Town FC has no line-up/.test(firstAlert(a)),firstAlert(a));
  ok(/⇪ Submit away/.test(firstAlert(a)),'and it names away’s own button');
});

/* ================= 3. the board is a step function of time ================= */

test('T6 · a substitute is refused before he comes on and accepted after', () => {
  const a=app(3000);
  submit(a,'21s9',d(2,3000));                 // 21 is still on the bench
  eq(a.state.rows.length,0,'nothing recorded');
  ok(/No\.21 is on the bench at /.test(firstAlert(a)),firstAlert(a));
  ok(/tag the substitution first \(e\.g\. 7sub21\)/.test(firstAlert(a)),'it says how to fix it');

  submit(a,'7sub21');                         // now he comes on, at 3000
  eq(a.state.rows.length,1,'the substitution is recorded');
  submit(a,'21s9',d(2,3100));                 // the SAME entry, one moment later
  eq(a.state.rows.length,2,'and now his pass is too');
  eq(a.log.alerts.length,1,'no second complaint');
});

test('T7 · a player taken off is refused after the swap and accepted before it', () => {
  const a=app(3000);
  submit(a,'7sub21');
  submit(a,'7s9',d(2,3100));                  // 7 is on the bench by then
  eq(a.state.rows.length,1,'nothing added');
  ok(/No\.7 is on the bench at /.test(firstAlert(a)),firstAlert(a));

  submit(a,'7s9',d(2,2900));                  // rewound to before the swap
  eq(a.state.rows.length,2,'the past is still taggable');
  eq(a.log.alerts.length,1);
});

test('T8 · a sent-off player leaves the board — no action, and no further card', () => {
  const a=app(3600);
  submit(a,'5rc',d(1,3600));
  eq(a.state.rows.length,1);
  eq(a.state.lineups.history.length,1,'the sending-off made its own period');
  eq(xiOf(a,3700).length,10,'ten men');

  submit(a,'5qq',d(1,3700));
  eq(a.state.rows.length,1,'no recovery for a man who is off');
  ok(/No\.5 was sent off at /.test(firstAlert(a)),firstAlert(a));

  a.log.alerts.length=0;
  submit(a,'5yc',d(1,3700));
  eq(a.state.rows.length,1,'and no second card either — tier 1 exempts nobody');
  ok(/No\.5 was sent off at /.test(firstAlert(a)),firstAlert(a));
});

test('T8b · a card BEFORE the sending-off is still taggable', () => {
  const a=app(3600);
  submit(a,'5rc',d(1,3600));
  submit(a,'5f',d(1,3500));
  eq(a.state.rows.length,2,'the foul at 3500 predates the card at 3600');
});

/* ================= 4. who is exempt from tier 2 ================= */

test('T9 · a card may be shown to a man on the bench', () => {
  const a=app(3000);
  submit(a,'21yc',d(1,3000));                 // 21 has not come on
  eq(a.state.rows.length,1,'recorded — a bench player can be booked');
  eq(a.log.alerts.length,0);
});

test('T10 · a substitution cannot bring on somebody the side does not have', () => {
  const a=app(3000);
  submit(a,'7sub99');
  eq(a.state.rows.length,0,'nothing recorded');
  eq(a.state.lineups.history.length,0,'no formation period');
  notOk(a.state.lineups.home.subHistory&&a.state.lineups.home.subHistory.length,'no minutes');
  ok(/No\.99 is not in Kidsgrove Athletic FC’s formation/.test(firstAlert(a)),firstAlert(a));
});

test('T11 · a real substitution is untouched, and planSubGroup still rules on the pairing', () => {
  const a=app(3000);
  submit(a,'7sub21');
  eq(a.state.rows.length,1);
  eq(a.state.lineups.history.length,1);
  ok(xiOf(a,3100).includes('21')&&!xiOf(a,3100).includes('7'),'the swap happened');
  // and a pair the planner rejects is still the planner's call, not the gate's
  a.log.alerts.length=0;
  submit(a,'14sub16');                        // both are on the bench
  eq(a.state.rows.length,1,'rejected');
  ok(/was not on the pitch/.test(firstAlert(a)),firstAlert(a));
});

/* ================= 5. an entry being re-edited is judged without its own footprint ==== */

test('T12 · a substitution edited into an ordinary event is accepted', () => {
  const a=app(3000);
  submit(a,'7sub21');
  a.startEdit(0);
  submit(a,'7s9',d(2,3000));   // 7 only looks benched because of the row being replaced
  eq(a.log.alerts.length,0,'not refused');
  eq(a.state.lineups.history.length,0,'the period is gone');
  eq(a.state.rows[0].event,'pass success');
  ok(xiOf(a,3500).includes('7'),'7 is playing again');
});

test('T13 · a red card edited into an ordinary event is accepted', () => {
  const a=app(3600);
  submit(a,'5rc',d(1,3600));
  a.startEdit(0);
  submit(a,'5qq',d(1,3600));   // 5 only looks sent off because of the row being replaced
  eq(a.log.alerts.length,0,'not refused');
  eq(a.state.lineups.history.length,0,'the sending-off snapshot is gone');
  eq(a.state.rows[0].event,'recovery');
  eq(xiOf(a,3700).length,11);
});

/* ================= 6. the two sides are judged apart ================= */

test('T14 · a number only the OTHER side has is refused, in the same words as a typo', () => {
  const a=app(3000);
  submit(a,'17f',d(1,3000));                  // 17 is Hanley's, not Kidsgrove's
  eq(a.state.rows.length,0,'refused');
  ok(/No\.17 is not in Kidsgrove Athletic FC’s formation\./.test(firstAlert(a)),firstAlert(a));
  notOk(/Hanley/.test(firstAlert(a)),'the other side is never mentioned');
  notOk(/Tab/.test(firstAlert(a)),'and no shortcut to it is offered');
});

test('T14b · the same number on the other side is stored without complaint', () => {
  const a=app(3000);
  a.state.team='away';
  submit(a,'17f',d(1,3000));
  eq(a.state.rows.length,1,'Hanley has 17, so Hanley may tag it');
  eq(a.log.alerts.length,0);
});

test('T14c · nothing in the gate can reach across to the other side', () => {
  /* The rule is only as strong as the code. Naming a side is the only way to reach the
     one you were not handed — `team==='home'?'away':'home'` and friends all need the
     literal — so a gate function that contains neither literal cannot cross over.
     (`h.team===team` is fine and expected: that is filtering the shared history down to
     the side it WAS given.) Nor may it index state.lineups itself: the one road to a
     board is effectiveLU(team,…), which can only return the side it is asked for. */
  /* squadIn is where squadAt's body went when the analysis gate needed a pure twin of
     it; scanning only the wrapper would leave the rule guarding an empty room. */
  ['squadIn','squadAt','checkEntryNumbers','numberGateMessage'].forEach(name=>{
    const body=grabFunction(name);
    notOk(/'home'|"home"|'away'|"away"/.test(body),name+' names no side');
    notOk(/state\.lineups\[/.test(body),name+' reads no board directly');
  });
  // sideName is the one place a side is turned into a label, and it is handed the side
  ok(/^const sideName=t=>/m.test(SRC),'sideName is given the side, it never chooses one');
});

/* ================= 7. what the message says ================= */

test('T15 · the sending-off message carries the minute the card was shown', () => {
  const a=app(3600);
  submit(a,'5rc',d(1,3600));
  submit(a,'5qq',d(1,3700));
  ok(/was sent off at 60:00\.00 and is not on the pitch at 61:40\.00/.test(firstAlert(a)),
     firstAlert(a));
});

test('T16 · the board printed is the board at THAT moment, not the starting one', () => {
  const a=app(3000);
  submit(a,'7sub21');
  submit(a,'99s9',d(2,3100));
  const msg=firstAlert(a), pitch=msg.split('\n').find(l=>/^On the pitch/.test(l));
  const bench=msg.split('\n').find(l=>/^On the bench/.test(l));
  ok(/ 21(\s|$)/.test(pitch),'21 came on, so he is listed on the pitch: '+pitch);
  notOk(/ 7(\s|$)/.test(pitch),'and 7 is not: '+pitch);
  ok(/ 7(\s|$)/.test(bench),'7 is on the bench instead: '+bench);
  notOk(/ 21(\s|$)/.test(bench),'and 21 is not: '+bench);
});

test('T17 · the offender is pinpointed by its position in the entry', () => {
  const a=app(3000);
  const chain=a.parseChain('1s2s99s4');
  const bad=a.checkEntryNumbers('home',chain.evs,d(4,3000),null);
  ok(bad,'refused');
  eq(bad.no,'99');
  eq(bad.idx,2,'the third run of digits — what selectEntryNumber highlights');
});

test('T18 · a number repeated across one touch is reported once', () => {
  const a=app(3000);
  submit(a,'99xx*aa',d(1,3000));     // 99 does two things on the same touch
  eq(a.state.rows.length,0);
  eq(a.log.alerts.length,1,'one number, one complaint');
});

test('T19 · the active-event path is held to the same rule', () => {
  const a=app(3000,{activeEvent:'goal'});
  submit(a,'99',d(1,3000));          // no hotkey typed — the clicked event is used
  eq(a.state.rows.length,0,'refused just the same');
  ok(/No\.99 is not in/.test(firstAlert(a)),firstAlert(a));
});

test('T20 · a valid number with a missing dot still raises only the dot complaint', () => {
  const a=app(3600);
  submit(a,'5rc');                   // a card has to be placed on the pitch
  eq(a.state.rows.length,0);
  eq(a.log.alerts.length,1,'the gate did not add a second alert');
  ok(/Check the dots/.test(firstAlert(a)),firstAlert(a));
});

/* ================= 8. the gate cannot be moved out of position ================= */

test('T21 · nothing is written before the gate has spoken', () => {
  const src=grabFunction('submitEntry');
  const gate=src.indexOf('checkEntryNumbers(');
  ok(gate>0,'the gate is called from submitEntry');
  ['state.rows.push(','onLocalUpsert(','applySubGroup(','applyRedCard(',
   'planSubGroup(','openGoalCapture('].forEach(what=>{
    const at=src.indexOf(what);
    ok(at<0||at>gate,what+' happens only after the gate (gate@'+gate+', '+what+'@'+at+')');
  });
});

test('T22 · a side with no line-up gets no board drawn at all', () => {
  const src=grabFunction('renderFormationMain');
  const guard=src.indexOf('has no line-up yet');
  const dots=src.indexOf('t.xi.forEach');
  ok(guard>0,'the panel says what is missing');
  ok(dots>guard,'and says it before any dot could be drawn');
  const after=src.slice(guard,dots);
  ok(/\breturn;/.test(after),'the branch returns — an empty pitch is not a formation');
});

test('T23 · the panel and the entry box never disagree', () => {
  // Both ask squadAt(team).on.length. Walk the four states and check they answer together.
  [['home',true],['home',false],['away',true],['away',false]].forEach(([team,submitted])=>{
    const a=app(3000);
    a.state.team=team;
    if(!submitted){a.state.lineups[team].xi=[];a.state.lineups[team].subs=[];}
    const panelSaysMissing=!a.squadAt(team,Number.MAX_SAFE_INTEGER).on.length;
    const chain=a.parseChain('1s2');
    const bad=a.checkEntryNumbers(team,chain.evs,d(2,3000),null);
    const boxSaysMissing=!!(bad&&bad.kind==='no-lineup');
    eq(boxSaysMissing,panelSaysMissing,team+(submitted?' submitted':' not submitted'));
  });
});
