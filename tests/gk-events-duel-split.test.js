/* The goalkeeper event pack, the two split events, and own goal.

   Designed in docs/gk-events-and-duel-split-design.md.

   The one that matters most here is the SPLIT. `ground duel success` became three ways of
   saying a ground duel was won, and `save` became three ways of saying one was made — but
   no row tagged under the old names says which of the new kinds it was. That question was
   never asked while those matches were being tagged, so nothing can answer it now, and
   any rule that decided for them would be inventing data that looks measured.

   So the old names stay, and the totals they fed become FAMILY totals: every member adds
   to them. A match from before the split totals what it always totalled; a match from
   after totals the same way and carries the breakdown as well. The tests below are mostly
   about that one property holding in all three directions — old only, new only, mixed —
   and about the breakdown reading "—" rather than 0 where it cannot be known.

   As everywhere else in this repo: no build step and no jsdom, so what cannot be run is
   asserted against the shape of the real source. */
const {makeApp,grabConst,grabFunction,SRC,SHARED,CLOUD,EVENTS,readSrc}=require('./harness');
const {test,eq,deepEq,ok,notOk}=require('./tiny-test');
const vm=require('vm');

const STATSVIEW=readSrc('Stats/stats-view.js');

/* ---- shared.js's stat engine, run for real ----
   Evaluated once in a context of its own, so these tests exercise the code the Stats page
   and the client site actually load rather than a copy of it.

   The epilogue is not decoration: shared.js is a classic script, so its FUNCTION
   declarations land on the global object but its top-level `const`s live only in the
   global lexical scope, where nothing outside can reach them. Naming them into globalThis
   is how tests/player-data.test.js reads the same file, for the same reason. */
const S=(()=>{
  const ctx={console,window:{},document:{createElement:()=>({}),getElementById:()=>null}};
  ctx.window=ctx; vm.createContext(ctx);
  vm.runInContext(SHARED+'\n;Object.assign(globalThis,{EVENT_INC,PLAYER_CATS,GK_COLS,'
    +'TEAM_SECTIONS,STAT_GROUPS,STAT_HEADERS,evKey,pct,BODY_PARTS});',ctx,{filename:'shared.js'});
  return ctx;
})();

/* ---- and the tagging app's own copy of it ----
   index.html carries a second stat engine (it does not load shared.js), and the whole
   point of T16 is that the two agree. The harness sandbox lifts the entry and gate
   machinery but not the stats, so the pieces this file compares are lifted here. Same
   scanning approach, and the same reason: what cannot be run is read out of the real
   source rather than restated. */
const T=(()=>{
  const ctx={console}; vm.createContext(ctx);
  const names=['EVENT_INC','STAT_GROUPS','STAT_HEADERS','DEFAULT_KEYS','GOAL_SPORTS'];
  vm.runInContext([
    ...names.map(n=>grabConst(n,SRC,'index.html')),
    grabFunction('newStat',SRC,'index.html'),
    grabFunction('statRow',SRC,'index.html'),
    grabFunction('curEvents',SRC,'index.html'),
    grabFunction('curMacros',SRC,'index.html'),
    grabFunction('nextFreeKey',SRC,'index.html'),
    grabFunction('computeScore',SRC,'index.html'),
    'const pct=(n,d)=> (d? (Math.round(n/d*1000)/10).toFixed(1):"0.0")+"%";',
    'var state={sport:"football",rows:[],events:{football:[]},macros:{football:[]}};',
    ';Object.assign(globalThis,{'+names.join(',')
      +',newStat,statRow,nextFreeKey,computeScore,state});'
  ].join('\n'),ctx,{filename:'index.html-stats.js'});
  return ctx;
})();

let uid=0;
const row=(team,no,event,t)=>({id:'r'+(++uid),t:t||100,team,playerFrom:no,playerTo:'',event});
const many=(team,event,n,no)=>Array.from({length:n},(_,i)=>row(team,no||'5',event,100+i*60));
// one side's whole-team tally, which is what every table above player level reads
const sum=rows=>S.sumTeam(rows,'home');

/* the tagging app carries its own copy of the same engine — lifted the same way the
   other index.html tests lift it, so the two can be compared rather than trusted */
const APP=makeApp({state:{sport:'football',team:'home',rows:[],pendingDots:[],macros:{football:[]},
  lineups:{home:{xi:[],subs:[],roster:[]},away:{xi:[],subs:[],roster:[]},history:[]},
  duration:{enabled:false,h2Start:0},teamIds:{}}});

/* ================= T1-T3 · the split, in all three directions ================= */

test('T1 · a match tagged only in the old names totals exactly what it always did', () => {
  const t=sum([...many('home','ground duel success',4),...many('home','ground duel fail',3),
               ...many('home','save',5)]);
  eq(t.groundDuels,7,'the family total is what the legacy names alone say');
  eq(t.groundDuelsWon,4);
  eq(t.saves,5);
  // …and the breakdown claims nothing about a match that was never asked
  eq(t.physicalDuels,0); eq(t.looseBallDuels,0); eq(t.catches,0); eq(t.parries,0);
  eq(t.duelDetail,0,'the flag is what turns those zeroes into "—" at the column');
  eq(t.saveDetail,0);
});

test('T2 · a match tagged only in the new names reaches the same totals', () => {
  const t=sum([...many('home','physical duel success',3),...many('home','physical duel fail',1),
               ...many('home','loose ball duel success',1),...many('home','loose ball duel fail',2),
               ...many('home','catch',3),...many('home','parry',2)]);
  eq(t.groundDuels,7,'physical + loose ball is the ground duel total');
  eq(t.groundDuelsWon,4);
  eq(t.physicalDuels,4); eq(t.physicalDuelsWon,3);
  eq(t.looseBallDuels,3); eq(t.looseBallDuelsWon,1);
  eq(t.saves,5,'catch + parry is the save total');
  eq(t.catches,3); eq(t.parries,2);
  ok(t.duelDetail>0,'and this match CAN answer the breakdown'); ok(t.saveDetail>0);
});

test('T3 · a match tagged across the change adds up as one match', () => {
  const t=sum([...many('home','ground duel success',2),...many('home','physical duel success',1),
               ...many('home','loose ball duel fail',1),
               ...many('home','save',1),...many('home','catch',1)]);
  eq(t.groundDuels,4,'every member of the family feeds the total');
  eq(t.groundDuelsWon,3);
  eq(t.physicalDuels,1); eq(t.looseBallDuels,1);
  eq(t.saves,2); eq(t.catches,1);
});

test('T3b · the flags add up, so a season answers match by match', () => {
  // 2 matches' worth of rows in one tally: one old, one new. The season knows the
  // breakdown of the half it can, and does not pretend the other half was empty.
  const t=sum([...many('home','ground duel success',9),...many('home','physical duel success',2)]);
  eq(t.groundDuels,11); eq(t.physicalDuels,2);
  ok(t.duelDetail>0,'some of this campaign can be broken down, so the column shows it');
});

/* ================= T4-T5 · the two ways a lookup can silently miss ================= */

test('T4 · every EVENT_INC key is lower case, and every shipped name reaches one', () => {
  [['shared.js',S.EVENT_INC],['index.html',T.EVENT_INC]].forEach(([where,INC])=>{
    Object.keys(INC).forEach(k=>eq(k,k.toLowerCase(),where+': "'+k+'" would never be matched'));
  });
  /* evKey() lower-cases the name being looked up, so a key written 'saveStanding' could
     not be reached from any tagged row. Walk the shipped dictionary rather than a list
     typed here: a name added to the dictionary and forgotten in EVENT_INC counts zero
     everywhere and says nothing about it.

     The exceptions are events that deliberately book no player stat. Cards go through
     classifyCards(), a substitution moves the formation board, pause is a marker, and a
     body part is a modifier on the shot beside it — BODY_PARTS reads those, which is why
     they are checked against it rather than simply waived. */
  const counted=new Set(Object.keys(S.EVENT_INC));
  const noStat=new Set(['yellow card','red card','substitution','pause',
                        'gain possesion','gain possession',
                        // no stat and no meaning anywhere in the code: added through the
                        // modal, never wired up. Left alone rather than guessed at.
                        'hit']);
  EVENTS.football.forEach(e=>{
    const k=S.evKey(e.name);
    if(S.BODY_PARTS&&S.BODY_PARTS[k]){ok(true);return;}      // a modifier, not an action
    ok(counted.has(k)||noStat.has(e.name),
       '"'+e.name+'" is in the dictionary but books no stat');
  });
});

test('T5 · a save is counted once — the outcome books it, the technique does not', () => {
  const outcome=sum(many('home','catch',1)), technique=sum(many('home','save diving',1));
  eq(outcome.saves,1,'catch and parry are saves');
  eq(technique.saves,0,'standing/diving/collapse/overhead/kneeling are HOW, not another save');
  /* "1ca*vd" is one save described twice, and it is the shape the entry syntax invites.
     If the technique booked a save too, Save Rate and On Target Faced would both be wrong
     by the number of saves that were fully tagged. */
  const both=sum([row('home','1','catch',100),row('home','1','save diving',100)]);
  eq(both.saves,1,'both halves of one save still only make one save');
  eq(both.catches,1); eq(both.saveDiving,1);
});

test('T5b · the five techniques each land in their own counter', () => {
  const t=sum([...many('home','save standing',1),...many('home','save diving',2),
               ...many('home','save collapse',3),...many('home','save overhead',4),
               ...many('home','save kneeling',5)]);
  deepEq([t.saveStanding,t.saveDiving,t.saveCollapse,t.saveOverhead,t.saveKneeling],[1,2,3,4,5]);
  eq(t.saves,0,'and none of them is a save on its own');
  ok(t.gkTechDetail>0);
});

test('T5c · the keeper-s control events count won and total the usual way', () => {
  const t=sum([...many('home','defensive line support success',3),
               ...many('home','defensive line support fail',1),
               ...many('home','aerial control success',2),
               ...many('home','aerial control fail',2)]);
  eq(t.defLineSupports,4); eq(t.defLineSupportsWon,3);
  eq(t.aerialControls,4); eq(t.aerialControlsWon,2);
  ok(t.gkCtrlDetail>0);
});

/* ================= T6 · "—" is not 0 ================= */

test('T6 · a column with nothing to say says so, and never reports a zero', () => {
  const cols={}; S.PLAYER_CATS.defensive.forEach(c=>cols[c[0]]=c[1]);
  const before=S.newStat();                       // a match tagged before the split
  ['Physical Duels','Physical Won','Loose Ball Duels','Loose Ball Won'].forEach(l=>
    eq(cols[l](before),'—',l+' must not claim the match had none'));
  const after=sum(many('home','physical duel fail',2));
  eq(cols['Physical Duels'](after),2,'a match that CAN answer prints the number');
  eq(cols['Physical Won'](after),0,'including a real zero, which is a different statement');
});

test('T6b · the keeper-s own columns do the same, and read the match as well as the man', () => {
  const gk={}; S.GK_COLS.forEach(c=>gk[c[0]]=c[1]);
  const g={conceded:0,clean:1,known:1};
  const before=S.newStat();
  ['Catches','Parries','Standing','Diving','Collapse','Overhead','Kneeling',
   'Def. Line Support','Aerial Control','Conceded (tagged)'].forEach(l=>
    eq(gk[l](before,g),'—',l));
  const after=sum([...many('home','catch',2),...many('home','aerial control success',1),
                   ...many('home','aerial control fail',1),...many('home','goal conceded',3)]);
  eq(gk['Catches'](after,g),2);
  eq(gk['Parries'](after,g),0,'a real zero beside a real two');
  eq(gk['Aerial Control'](after,g),'1/2');
  eq(gk['Conceded (tagged)'](after,g),3);
});

test('T6c · Conceded (tagged) stands beside the derived Conceded, never instead of it', () => {
  const gk={}; S.GK_COLS.forEach(c=>gk[c[0]]=c[1]);
  const s=sum(many('home','goal conceded',1));
  // the board says 2 went in; the tagger typed 1. Both are reported, and the derived
  // figure — which cannot be forgotten — is untouched by the one that can.
  eq(gk['Conceded'](s,{conceded:2,clean:0,known:1}),2);
  eq(gk['Conceded (tagged)'](s,{conceded:2,clean:0,known:1}),1);
  eq(gk['Conceded'](s,{conceded:0,clean:0,known:0}),'—','and it still says "—" with no board');
});

/* ================= T7-T11 · the gate ================= */

test('T7 · the two new duels are mirrored on their own events', () => {
  const G=p=>APP.checkAnalysis(p), by=(v,id)=>v.checks.find(c=>c.id===id);
  const P=rows=>({schema:1,meta:{},lineups:null,dur:{enabled:false},rows});
  const good=G(P([...many('home','physical duel success',4),...many('away','physical duel fail',4),
                  ...many('home','loose ball duel fail',2),...many('away','loose ball duel success',2)]));
  ok(by(good,'physical-total').ok); ok(by(good,'physical-mirror').ok);
  ok(by(good,'loose-total').ok);    ok(by(good,'loose-mirror').ok);
  const bad=G(P([...many('home','physical duel success',4),...many('away','physical duel fail',1)]));
  notOk(by(bad,'physical-total').ok); notOk(by(bad,'physical-mirror').ok);
  ok(by(bad,'loose-total').ok,'and the loose ball checks are untouched by it');
  ok(by(bad,'ground-total').ok,'as are the legacy ones');
});

test('T8 · no kind of match passes a check that was never looking', () => {
  const G=p=>APP.checkAnalysis(p), by=(v,id)=>v.checks.find(c=>c.id===id);
  const P=rows=>({schema:1,meta:{},lineups:null,dur:{enabled:false},rows});
  /* A match tagged entirely in the new names leaves the legacy pair at 0 = 0. That pair
     passing is fine — what must not happen is the new pair ALSO sitting at 0 while the
     match is unbalanced, which is what folding all six names into one check would do. */
  const newOnly=G(P([...many('home','physical duel success',3),...many('away','physical duel fail',1)]));
  ok(by(newOnly,'ground-mirror').ok,'the legacy pair has nothing to say here');
  notOk(by(newOnly,'physical-mirror').ok,'and the pair that does say it');
  const oldOnly=G(P([...many('home','ground duel success',3),...many('away','ground duel fail',1)]));
  notOk(by(oldOnly,'ground-mirror').ok);
  ok(by(oldOnly,'physical-mirror').ok,'the reverse, for a match tagged the old way');
});

test('T9 · one duel tagged in two different families fails both mirrors', () => {
  // the one mistake the rename invites: home calls it a ground duel, away calls it a
  // physical duel. Neither side is short on its own count, so only the pair of failures
  // together says what happened.
  const G=p=>APP.checkAnalysis(p), by=(v,id)=>v.checks.find(c=>c.id===id);
  const v=G({schema:1,meta:{},lineups:null,dur:{enabled:false},
             rows:[...many('home','ground duel success',2),...many('away','physical duel fail',2)]});
  notOk(by(v,'ground-mirror').ok,'home won 2, away lost 0 under the legacy name');
  notOk(by(v,'physical-mirror').ok,'home won 0, away lost 2 under the new one');
});

test('T10 · the gate is eleven checks, and each total points at its own mirror', () => {
  const {AN_ORDER,DUEL_TOTALS}=APP.k;
  eq(AN_ORDER.length,11);
  DUEL_TOTALS.forEach(d=>eq(AN_ORDER[d.n-1],d.from,
    d.id+' prints "See check '+d.n+'", which must be '+d.from));
  deepEq(AN_ORDER.slice(0,8),
    ['aerial-total','aerial-mirror','ground-total','ground-mirror',
     'physical-total','physical-mirror','loose-total','loose-mirror'],
    'every total is followed by the mirror that explains it');
});

test('T11 · the dialog counts the checks rather than being told a number', () => {
  /* "the seven analysis checks" was written out in four places, and stayed seven while
     the gate grew to eleven. Reading AN_ORDER.length is what stops that happening twice. */
  notOk(/\bseven\b/.test(SRC),'no prose left claiming a fixed number');
  ok(/of the '\+AN_ORDER\.length\+' analysis checks/.test(SRC),'the refusal counts');
  ok(/all '\+AN_ORDER\.length\+' passed/.test(SRC),'and so does the all-clear');
});

/* ================= T12-T14 · the dictionary and what reads it ================= */

test('T12 · the split duels get their own colour, and the parents keep theirs', () => {
  const cls=n=>APP.k.evtClass(n).trim();
  eq(cls('physical duel success'),'duel-physical'); eq(cls('physical duel fail'),'duel-physical');
  eq(cls('loose ball duel success'),'duel-loose');  eq(cls('loose ball duel fail'),'duel-loose');
  eq(cls('ground duel success'),'duel-ground');     eq(cls('aerial duel fail'),'duel-aerial');
  ok(/\.evt\.duel-physical\{color:#[0-9a-f]{6}\}/i.test(SRC),'and the rule exists in the stylesheet');
  ok(/\.evt\.duel-loose\{color:#[0-9a-f]{6}\}/i.test(SRC));
});

test('T13 · every new name is filed under a heading, not in the leftovers bucket', () => {
  const ctx={};
  vm.createContext(ctx);
  vm.runInContext([grabConst('FILM_EV_GROUPS',STATSVIEW,'Stats/stats-view.js'),
    'const EV_ALIAS={};',
    'const evKey=e=>String(e==null?"":e).trim().toLowerCase();',
    grabConst('FILM_EV_REST',STATSVIEW,'Stats/stats-view.js'),
    grabConst('FILM_EV_ORDER',STATSVIEW,'Stats/stats-view.js'),
    grabConst('filmEvGroup',STATSVIEW,'Stats/stats-view.js'),
    ';Object.assign(globalThis,{g:filmEvGroup,REST:FILM_EV_REST});'
    ].join('\n'),ctx,{filename:'film-groups.js'});
  const g=ctx.g;
  eq(g('own goal'),'Shooting');
  ['physical duel success','physical duel fail','loose ball duel success','loose ball duel fail']
    .forEach(n=>eq(g(n),'Defensive',n));
  ['catch','parry','save','save standing','save diving','save collapse','save overhead',
   'save kneeling','defensive line support success','defensive line support fail',
   'aerial control success','aerial control fail','goal conceded']
    .forEach(n=>eq(g(n),'Goalkeeping',n));
  eq(g('whatever nobody tagged'),ctx.REST,'and an unknown name still has a home');
});

test('T14 · no hotkey collides with another event, or with a macro', () => {
  const keys=EVENTS.football.map(e=>e.key).filter(Boolean);
  const dup=keys.filter((k,i)=>keys.indexOf(k)!==i);
  deepEq(dup,[],'two events sharing a code: the second one could never be typed');
  const names=EVENTS.football.map(e=>e.name);
  deepEq(names.filter((n,i)=>names.indexOf(n)!==i),[],'and no name is in the list twice');
  /* An event hotkey beats a macro of the same code (expandKey), so a code taken from a
     macro kills it silently at the moment of tagging. The 40 macros in restore_macros.js
     are the ones this account really has. */
  const MACROS=JSON.parse(/var MACROS = (\{[\s\S]*?\});/.exec(readSrc('restore_macros.js'))[1]);
  const macKeys=new Set((MACROS.football||[]).map(m=>m.key));
  keys.forEach(k=>notOk(macKeys.has(k),'event code "'+k+'" would stop a macro firing'));
});

/* ================= T15 · the macro table ================= */

test('T15 · every event the shipped macros point at is still in the dictionary', () => {
  /* This is the whole of R12 in one assertion. renderMacros() looks an event up by NAME,
     with an exact === comparison, and paints the chip "miss" when it finds nothing — so
     a rename or a deletion breaks a macro silently until somebody opens the modal.

     Nothing here renames or deletes: `ground duel success`, `ground duel fail` and `save`
     stay in the list precisely because macros (and months of tagged rows) point at them. */
  const MACROS=JSON.parse(/var MACROS = (\{[\s\S]*?\});/.exec(readSrc('restore_macros.js'))[1]);
  const dict=new Set(EVENTS.football.map(e=>e.name));
  /* No allowlist any more. It used to need one, because five of the names these macros
     point at — goal kick, throw-Ins and three body parts — existed only in the live
     database and not in this repo, so the test could not see them. The dictionary was
     synced to the live project on 2026-08-28, and every name is now checkable. */
  const used=new Set();
  (MACROS.football||[]).forEach(m=>m.events.forEach(n=>used.add(n)));
  [...used].forEach(n=>
    ok(dict.has(n),'macro event "'+n+'" is no longer in the dictionary — that macro is dead'));
  ok(dict.has('throw-Ins'),'including the capital I, which macros "t" and "tt" match exactly');
  ok(dict.has('ground duel success')&&dict.has('ground duel fail'),
     'the split kept its parents, which is what macro "xa"/"xxaa" depend on');
  ok(dict.has('save'),'and the save it split');
});

test('T15b · a free code is one nothing answers to, macros included', () => {
  /* nextFreeKey() used to ask the events alone, so on the shipped keyboard the first
     ＋ Add handed out "g" — the macro for goal kick + pass success. */
  // DEFAULT_KEYS starts at 'a'. Give that code to a macro and nothing else, and the
  // answer has to move on to 's' — under the old rule it handed back 'a' and the macro
  // stopped firing the moment the event was created.
  T.state.events.football=[]; T.state.macros.football=[{key:'a',events:['recovery']}];
  eq(T.nextFreeKey(),'s','a code a macro owns is not free');
  T.state.macros.football=[];
  eq(T.nextFreeKey(),'a','and with nothing in the way the first code is still the first');
  T.state.events.football=[]; T.state.macros.football=[];
});

/* ================= T16-T17 · the two copies of the engine ================= */

test('T16 · shared.js and index.html count the same events into the same fields', () => {
  const A=S.EVENT_INC, B=T.EVENT_INC;
  deepEq(Object.keys(A).sort(),Object.keys(B).sort(),
    'one copy knows an event the other does not — the Stats tab and the Stats page '+
    'would then report different numbers for the same match');
  Object.keys(A).forEach(k=>deepEq(A[k].slice().sort(),B[k].slice().sort(),k));
});

test('T16b · and they start from the same zero row', () => {
  deepEq(Object.keys(S.newStat()).sort(),Object.keys(T.newStat()).sort());
});

test('T16c · the team comparison has the same rows on both sides of the app', () => {
  const labels=src=>{const out=[],re=/\['([^']+)',\(s,o\)/g,body=grabConst('TEAM_SECTIONS',src,'x');
    let m; while((m=re.exec(body)))out.push(m[1]); return out;};
  deepEq(labels(SRC),labels(SHARED),
    'Take-on Concerns was in one and not the other for as long as both have existed');
});

test('T17 · the export sheet is as wide as its column groups claim', () => {
  [['shared.js',S.STAT_GROUPS,S.STAT_HEADERS,S.statRow,S.newStat],
   ['index.html',T.STAT_GROUPS,T.STAT_HEADERS,T.statRow,T.newStat]]
    .forEach(([where,groups,headers,statRow,newStat])=>{
      const span=groups.reduce((n,g)=>n+g[1],0);
      eq(headers.length,span,where+': the group header row and the column row disagree');
      eq(statRow('9',newStat()).length,headers.length,where+': a row is not as wide as its header');
    });
});

/* ================= T18-T20 · own goal ================= */

test('T18 · an own goal is a goal for the other side, on both scoreboards', () => {
  /* computeScore() in the tagging app and teamGoals() on the Stats page answer the same
     question and have to answer it identically — this asserts the rule in the tagger and
     that the Stats page still carries the same one, character for character. */
  T.state.rows=[row('home','9','goal'),row('home','4','own goal'),row('away','7','own goal')];
  deepEq(T.computeScore(),{home:2,away:1},
    'home: its own goal plus away-s own goal. away: home-s own goal.');
  ok(/r\.team===opp&&\(r\.event==='own goal'\|\|r\.event==='own-goal'\)/.test(STATSVIEW),
     'and teamGoals() on the Stats page still reads it the same way');
  T.state.rows=[];
});

test('T19 · an own goal books none of a goal-s metrics, and both goal rows follow it', () => {
  const t=sum([...many('home','own goal',2)]);
  eq(t.ownGoals,2);
  eq(t.goals,0,'crediting goals here would award the goal to the wrong side');
  eq(t.totalShots,0); eq(t.shotsOn,0);
  // the two rows in the team comparison, which take (this side, other side)
  const rows={}; S.TEAM_SECTIONS.forEach(sec=>sec[1].forEach(r=>rows[r[0]]=r[1]));
  const home=sum([row('home','9','goal')]), away=sum([row('home','4','own goal')]);
  // read as: home scored 1, away's tally holds 1 own goal -> home 2, away 0
  eq(rows['Goals'](home,away),1+1,'a team-s goals are its own plus the opposition-s own goals');
  eq(rows['Goals Conceded'](away,home),1+1,'and the mirror of that is what it conceded');
});

test('T19b · an own goal carries a spot, and the gate asks for the same events the UI does', () => {
  ok(APP.k.GOAL_SPOT_EVENTS.has('own goal'),'the entry gate holds it back for a spot');
  ok(APP.k.SPOT_REQUIRED.has('own goal'),'and the analysis gate refuses one without');
  deepEq([...APP.k.SPOT_REQUIRED].sort(),[...APP.k.GOAL_SPOT_EVENTS].sort(),
    'a gate looser than the capture backing it up is not a gate');
});

test('T20 · the join-a-match preview scores own goals the way the scoreboard does', () => {
  const fn=/async function findMatchByCode[\s\S]*?\n  \}/.exec(CLOUD)[0];
  ok(/\.in\('event_name', \['goal', 'own goal', 'own-goal'\]\)/.test(fn),
     'it asks for own goals as well as goals');
  ok(/const own = g\.event_name !== 'goal'/.test(fn),'and flips the side for them');
  notOk(/\.eq\('event_name', 'goal'\)/.test(fn),'the goals-only query is gone');
});

/* ================= the dictionary itself ================= */

test('the shipped dictionary and DEFAULT_EVENTS are the same list', () => {
  const D=grabConst('DEFAULT_EVENTS',SRC,'index.html');
  const ctx={}; vm.createContext(ctx); vm.runInContext(D+';globalThis.D=DEFAULT_EVENTS;',ctx);
  deepEq(ctx.D.football.map(e=>({name:e.name,key:e.key})),
         EVENTS.football.map(e=>({name:e.name,key:e.key})),
    'pitchtagger_events.json is the same list index.html falls back to');
});

test('the new events are all in it, spelt the way EVENT_INC keys them', () => {
  const dict=new Set(EVENTS.football.map(e=>e.name));
  ['own goal','physical duel success','physical duel fail','loose ball duel success',
   'loose ball duel fail','catch','parry','save standing','save diving','save collapse',
   'save overhead','save kneeling','defensive line support success',
   'defensive line support fail','aerial control success','aerial control fail',
   'goal conceded'].forEach(n=>{
     ok(dict.has(n),'the dictionary is missing "'+n+'"');
     ok(S.EVENT_INC[S.evKey(n)],'"'+n+'" is in the dictionary but books no stat');
   });
});

test('the list reads in the order the Film filter groups it', () => {
  /* One order for the modal and the filter, so an event cannot be listed under one
     heading in the tagger and sorted into another in Film. */
  const at=n=>EVENTS.football.findIndex(e=>e.name===n);
  ok(at('own goal')===at('goal')+1,'own goal sits with the goal it answers');
  ok(at('physical duel success')>at('ground duel fail'),'the split kinds follow their parent');
  ok(at('loose ball duel fail')<at('take-on concern'),'and stay inside Defensive');
  ok(at('catch')<at('save')&&at('save')<at('save standing'),
     'the keeper reads outcome, then the save, then how it was made');
  ok(at('goal conceded')<at('corner-kick'),'goalkeeping comes before the set pieces');
});

/* ================= the Event types dialog ================= */
/* Sixty-five events in one 520px column is a list nobody reads to the end of. The dialog
   now prints five headings and lays each out as a grid. What matters is that it is only a
   LAYOUT change: the same rows, the same order, the same handlers, and nothing new that
   the macro table below it can trip over. */

// the contiguous slice the dialog is built from, run against a DOM that only knows how to
// become HTML — so these assertions are about the markup renderEvents() really produces
function renderDialog(dict,active){
  const src=SRC.replace(/\r\n/g,'\n');
  const from=src.indexOf('const EV_GROUPS=[');
  const rf=src.indexOf('function renderEvents(',from);
  let d=0,end=-1;
  for(let k=src.indexOf('{',rf);k<src.length;k++){
    if(src[k]==='{')d++; else if(src[k]==='}'){d--; if(!d){end=k+1;break;}}}
  const mk=tag=>({tag,className:'',textContent:'',value:undefined,children:[],style:{},
    handlers:{},
    set onclick(f){this.handlers.click=f;}, set onkeydown(f){this.handlers.keydown=f;},
    set onchange(f){this.handlers.change=f;}, set onblur(f){this.handlers.blur=f;},
    set maxLength(v){}, set placeholder(v){}, set title(v){},
    appendChild(c){this.children.push(c);return c;},
    find(cls){const out=[]; (function walk(n){ if((n.className||'').split(' ').includes(cls))out.push(n);
      n.children.forEach(walk);})(this); return out;}});
  const list=mk('div');
  Object.defineProperty(list,'innerHTML',{set(v){if(v==='')this.children=[];},get(){return '';}});
  const ctx={document:{createElement:mk},console};
  vm.createContext(ctx);
  vm.runInContext([src.slice(from,end),
    'var state={activeEvent:'+JSON.stringify(active||null)+'};',
    'var LIST=null; function $(){return LIST;}',
    'function curEvents(){return DICT;}',
    'var log={active:[],keys:[]};',
    'function setActive(n){log.active.push(n);} function setKey(e,v){log.keys.push([e.name,v]);}',
    ';globalThis.go=function(l,dic){LIST=l;globalThis.DICT=dic;renderEvents();return {list:l,log:log};};'
  ].join('\n'),ctx);
  return ctx.go(list,dict);
}

test('the dialog prints the five headings, in the order they were asked for', () => {
  const {list}=renderDialog(EVENTS.football);
  deepEq(list.find('ev-grp').map(h=>h.textContent),
    ['Attacking','Distribution','Defensive','Goalkeeping','Other']);
});

test('every event is in exactly one of them, and none is lost', () => {
  const {list}=renderDialog(EVENTS.football);
  const shown=list.find('ev-name').map(n=>n.textContent);
  eq(shown.length,EVENTS.football.length,'one cell per event');
  deepEq([...new Set(shown)].length,shown.length,'and none printed twice');
  deepEq(shown.slice().sort(),EVENTS.football.map(e=>e.name).sort());
});

test('order inside a heading is the dictionary-s own, not a second one kept here', () => {
  /* ord is public.event_types.ord — shared by the whole site, and the only thing that
     decides where a row appears. EV_GROUPS says which heading, never which position. */
  const dict=EVENTS.football, {list}=renderDialog(dict);
  const shown=list.find('ev-name').map(n=>n.textContent);
  const pos={}; dict.forEach((e,i)=>pos[e.name]=i);
  list.find('ev-grid').forEach(g=>{
    const names=g.children.map(c=>c.children[0].textContent);
    const ords=names.map(n=>pos[n]);
    deepEq(ords.slice().sort((a,b)=>a-b),ords,'a heading re-sorted its own rows: '+names.join(', '));
  });
  // and the dictionary is already grouped, so the whole list comes out in ord order
  deepEq(shown.map(n=>pos[n]),dict.map((_,i)=>i),'the five headings do not interleave');
});

test('a name the group table has never heard of still appears, under Other', () => {
  const {list}=renderDialog(EVENTS.football.concat([{name:'zzz custom',key:'zc'}]));
  const last=list.find('ev-grid').pop();
  eq(last.children.pop().children[0].textContent,'zzz custom',
     'a freshly created event is never invisible');
});

test('the row still does the two things it did before, and nothing else', () => {
  const {list,log}=renderDialog(EVENTS.football,'goal');
  const item=list.find('ev-item')[0];
  eq(item.children.length,2,'a name and a code box — no third control');
  eq(item.children[0].className,'ev-name'); eq(item.children[1].className,'ev-key');
  ok(item.className.includes('sel'),'the active event is still marked');
  eq(list.find('ev-item').filter(i=>i.className.includes('sel')).length,1,'and only it');
  item.children[0].handlers.click();                       // clicking the name selects
  deepEq(log.active,['goal']);
  const box=item.children[1];
  box.value='qz'; box.handlers.change();                   // typing a code rebinds
  deepEq(log.keys,[['goal','qz']]);
  ok(box.handlers.click,'the box still swallows the click that would select the row');
  ok(box.handlers.keydown&&box.handlers.blur);
});

test('an empty dictionary still says so rather than drawing five empty headings', () => {
  const {list}=renderDialog([]);
  eq(list.find('ev-grp').length,0);
  eq(list.children.length,1,'one message, and no grid');
});

test('the dialog is the only one widened, and the macro table is untouched by any of it', () => {
  /* THE guard for this change. The two tables share a modal and nothing else: every rule
     added is under .ev-*, so a macro row cannot inherit a column count or a heading. */
  ok(/\.ev-modal\{max-width:min\(96vw,880px\)\}/.test(SRC),'the width is scoped to this dialog');
  ok(/<div class="modal ev-modal">/.test(SRC),'and only this dialog carries the class');
  eq((SRC.match(/class="modal ev-modal"/g)||[]).length,1);
  ['ev-grp','ev-grid'].forEach(c=>{
    ok(new RegExp('\.'+c+'\{').test(SRC),'.'+c+' is defined');
    notOk(new RegExp('\.mac-[a-z]+[^{]*\.'+c).test(SRC),'.'+c+' never reaches a macro row');
  });
  const mac=grabFunction('renderMacros',SRC,'index.html');
  notOk(/ev-grid|ev-grp|EV_GROUPS/.test(mac),'renderMacros knows nothing about the grouping');
  ok(/mac-item/.test(mac)&&/mac-key/.test(mac),'and still builds the rows it always built');
});
