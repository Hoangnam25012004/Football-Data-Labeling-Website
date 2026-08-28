/* Player Data: the Data view's third section — one player, the whole campaign.

   The same reports Overview and Team Data add up, cut by the man rather than by
   the match. Three things are being pinned down here.

   The first is that there is no second implementation of anything: the columns
   are shared.js's own PLAYER_CATS and GK_COLS, the minutes, the cards and the
   stat totals all go back through shared.js. A figure on a player's page and the
   same figure on the match page cannot disagree, because one function makes both.

   The second is who a player IS. Not a shirt number: a call-up renumbers a
   squad, so the same man is 14 one window and 9 the next. The key is the players
   row he was picked from, then his name, and a bare number is merged with
   nobody.

   The third is that a goalkeeper is a different job. He is found where the
   analyst put him — the GK square of the formation board — and what he is
   measured on is what happened at the other end, which no stat row can carry.

   The arithmetic is EXECUTED — playerIndex, sumStats, playerCards, gkFigures and
   aggregate are lifted out of app.js by name and run in a vm against hand-written
   reports, the way tests/data-page.test.js runs discipline(). The rendering is
   read as source, as every other client test does: no build step, no DOM in the
   runner. */
const vm=require('vm');
const {test,eq,deepEq,ok,notOk}=require('./tiny-test');
const {grabFunction,readSrc,SHARED}=require('./harness');

const APPJS=readSrc('client/assets/app.js');
const APPCSS=readSrc('client/assets/app.css');
const VIEW=readSrc('Stats/stats-view.js');

const renderData=/function renderData\(view\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
const playerData=/function renderPlayerData\(body, rest\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
const listView=/function renderPlayerList\(body, people\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
const oneTable=/function playerTable\(title, people, cols\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
const profile=/function renderPlayerProfile\([^)]*\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
const headCard=/function playerHead\([^)]*\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
const matchTable=/function playerMatchTable\(who, cat\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
const indexFn=/function playerIndex\(aggs\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
const tabs=/function dataTabs\(open\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];

/* ---------- app.js's own helpers, running for real ----------
   shared.js first (the stat engine), then the named functions lifted out of
   app.js, as ONE script so their bindings can see each other. `window` is the
   handful of shared.js names app.js reaches through it. */
const LIFT=['playerIndex','aliasMap','sumStats','playerCards','gkFigures','gkCell','posFigures',
            'minsTotal','minsOne','per90','aggregate','discipline','playerTally','totalOf','aggregates'];
/* The role block, lifted whole: ROLES, ROLE_POS, the four lookups built off them,
   MODES, and the four tile tables. It is one contiguous run in app.js from its own
   banner comment to the last line of FALLBACK_KPIS, and taking it in one piece is
   what keeps the lookups in step with the tables they are read beside. */
const ROLEBLOCK=/\n  \/\* -+ roles -+[\s\S]*?c: 'yellow and red' \}\n  \];/.exec(APPJS)[0];
function sandbox(state){
  const ctx={console,location:{hash:''},
    document:{getElementById:()=>null,addEventListener(){},removeEventListener(){}},
    localStorage:{getItem:()=>null,setItem(){}},window:{}};
  vm.createContext(ctx);
  vm.runInContext([SHARED,
    'window.newStat=newStat;window.classifyCards=classifyCards;window.computeStats=computeStats;',
    'window.sumTeam=sumTeam;window.squadNames=squadNames;window.playedMinutes=playedMinutes;',
    'window.squadIds=squadIds;window.gkShirts=gkShirts;window.onPitchAt=onPitchAt;',
    'var state='+JSON.stringify(state||{})+';',
    LIFT.map(n=>grabFunction(n,APPJS,'client/assets/app.js')).join('\n'),
    /* app.js declares with `var`, which grabConst does not scan for */
    /\n  var PL_OUT = \[[\s\S]*?\n  \];/.exec(APPJS)[0],
    /\n  var PL_GK = \[[\s\S]*?\n  \];/.exec(APPJS)[0],
    ROLEBLOCK,
    ';globalThis.A={'+LIFT.join(',')+',PL_OUT,PL_GK,PLAYER_CATS,GK_COLS,'
      +'ROLES,ROLE_POS,ROLE_OF,ROLE_LABEL,ROLE_BADGE,MODES,'
      +'ROLE_KPIS,GK_KPIS,FALLBACK_KPIS,'
      +'squadIds,gkShirts,onPitchAt,newStat,pct,computeStats};'
  ].join('\n'),ctx,{filename:'client/assets/app.js-extract.js'});
  return ctx.A;
}
const A=sandbox();

/* ---------- fixtures ---------- */
const DUR={enabled:true,halfLen:45,h1Start:0,h1End:2700,h2Start:3000,h2End:5700};
const dot=(no,pos)=>({no,x:50,y:50,pos:pos||'CM'});
/* one aggregate() result, hand-built: the shape the Data view reduces a match to */
function agg(o){
  o=o||{};
  return {m:Object.assign({slug:'m1',id:'m1',date:'2025-06-11',opponent:'Barbados',
                           side:'home',result:'W'},o.m||{}),
          gf:o.gf==null?2:o.gf, ga:o.ga==null?1:o.ga,
          us:A.newStat(), them:A.newStat(),
          players:o.players||{}, names:o.names||{}, ids:o.ids||{},
          mins:o.mins===undefined?null:o.mins, cards:o.cards||{}, gk:o.gk||{}};
}
function stat(o){return Object.assign(A.newStat(),o||{});}
const byKey=(list,k)=>list.filter(p=>p.key===k)[0];
const played=min=>({min,sec:min*60,h1:Math.min(min,45)*60,h2:Math.max(0,min-45)*60,exact:true});

/* ================= who a player IS ================= */

test('a player is one man across the campaign, whatever number he wore', () => {
  const list=A.playerIndex([
    agg({m:{slug:'a',date:'2024-06-07'},players:{'14':stat({goals:1})},names:{'14':'Elva'}}),
    agg({m:{slug:'b',date:'2025-06-11'},players:{'9':stat({goals:2})},names:{'9':'Elva'}})
  ]);
  eq(list.length,1,'a call-up renumbers the squad; it does not make a second player');
  eq(list[0].key,'n:elva','tallied under the name');
  eq(list[0].apps,2);
  eq(list[0].total.goals,3,'his goals are the campaign-s, not one match-s');
  notOk('no' in list[0],'and no single shirt number is kept for him at all');
});

test('a players row beats a name, and survives a change of both number and spelling', () => {
  const list=A.playerIndex([
    agg({m:{slug:'a'},players:{'14':stat({goals:1})},names:{'14':'Elva'},ids:{'14':'uuid-1'}}),
    agg({m:{slug:'b'},players:{'9':stat({goals:1})},names:{'9':'elva '},ids:{'9':'uuid-1'}})
  ]);
  eq(list.length,1,'the players row is the same row, so it is the same man');
  eq(list[0].key,'p:uuid-1','and the uuid is what he is filed under');
});

test('a name met beside a players row anywhere is that row everywhere', () => {
  /* one match picked from the team list, one typed in by hand */
  const list=A.playerIndex([
    agg({m:{slug:'a'},players:{'14':stat({goals:1})},names:{'14':'Elva'},ids:{'14':'uuid-1'}}),
    agg({m:{slug:'b'},players:{'9':stat({goals:2})},names:{'9':'Elva'}})       // no pid
  ]);
  eq(list.length,1,'the alias pass ties the hand-typed match to the picked one');
  eq(list[0].key,'p:uuid-1');
  eq(list[0].total.goals,3);
});

test('a name seen against two players rows is NOT merged', () => {
  const map=A.aliasMap([
    agg({names:{'14':'Smith'},ids:{'14':'uuid-1'}}),
    agg({names:{'9':'Smith'},ids:{'9':'uuid-2'}})
  ]);
  notOk(map['n:smith'],'two people of one name is the one case where guessing is unforgivable');
  const list=A.playerIndex([
    agg({m:{slug:'a'},players:{'14':stat({goals:1})},names:{'14':'Smith'},ids:{'14':'uuid-1'}}),
    agg({m:{slug:'b'},players:{'9':stat({goals:1})},names:{'9':'Smith'},ids:{'9':'uuid-2'}})
  ]);
  eq(list.length,2,'they stay two rows — every figure would still have added up');
});

test('a shirt no squad names is a row of its own, merged with nobody', () => {
  const list=A.playerIndex([
    agg({m:{slug:'a'},players:{'7':stat({goals:1})},names:{'7':'Elva'}}),
    agg({m:{slug:'b'},players:{'7':stat({goals:1})},names:{}})       // no roster at all
  ]);
  eq(list.length,2,'a bare number cannot be trusted to mean the same man next match');
  ok(byKey(list,'n:elva')&&byKey(list,'#7'));
  eq(byKey(list,'#7').name,'Player 7','and shared.js-s own placeholder is what he is called');
});

test('the two tallies differ on purpose, and both say which rule they use', () => {
  /* playerTally() (the Key Players cards) is pinned by tests/data-page.test.js to
     the name-or-number rule. playerIndex() went further. Locking both is what
     makes the difference deliberate rather than drift. */
  ok(/nm \? 'n:' \+ nm\.toLowerCase\(\) : '#' \+ no/
     .test(/function playerTally\(aggs\)[\s\S]*?\n  \}/.exec(APPJS)[0]),
     'the cards still tally by name, as their own test requires');
  ok(/pid \? 'p:' \+ pid : \(nm \? 'n:' \+ nm\.toLowerCase\(\) : '#' \+ no\)/.test(indexFn),
     'and Player Data goes players-row first, name second, bare number last');
  ok(/key = alias\[key\] \|\| key;/.test(indexFn),'with the alias pass over the top');
});

test('a shirt number is read the way shared.js reads one', () => {
  const list=A.playerIndex([agg({players:{' 7 ':stat({goals:1})},names:{'7':'Elva'}})]);
  eq(list.length,1);
  eq(list[0].key,'n:elva',"' 7 ' and '7' are one shirt, so the roster name is found");
});

test('squadIds is squadNames-s twin, and answers nothing for a hand-typed squad', () => {
  const lu={home:{roster:[{no:'1',name:'Barclett',pid:'uuid-1'},{no:'7',name:'Elva'}],
                  xi:[],subs:[],dir:'lr'}};
  deepEq(A.squadIds(lu,'home'),{'1':'uuid-1'},'only the entry picked from the team list');
  deepEq(A.squadIds({},'home'),{},'no line-up, no answer');
});

/* ================= what counts as an appearance ================= */

test('a substitute who never came on is not an appearance', () => {
  const list=A.playerIndex([agg({
    players:{'7':stat({goals:1})},
    names:{'7':'Elva','19':'Unused'},
    mins:{'7':played(90)}
  })]);
  eq(list.length,1,'the bench is not a match played');
  notOk(byKey(list,'n:unused'),'and he is nowhere on the page');
});

test('a substitute who came on and touched nothing IS one', () => {
  const list=A.playerIndex([agg({
    players:{'7':stat({goals:1})},
    names:{'7':'Elva','3':'Frederick'},
    mins:{'7':played(64),'3':played(26)}
  })]);
  const sub=byKey(list,'n:frederick');
  ok(sub,'26 minutes on the pitch is an appearance');
  eq(sub.apps,1);
  eq(sub.total.goals,0,'with a row of zeroes, which is what he did');
  eq(sub.min,26);
});

test('a match nobody entered a line-up for still lists who was tagged', () => {
  const list=A.playerIndex([agg({players:{'7':stat({passes:12})},names:{},mins:null})]);
  eq(list.length,1,'the events are enough to know he played');
  eq(A.minsTotal(list[0]),'—','and the minutes say nothing rather than say zero');
  eq(list[0].min,0);
});

test('a player who is both on the pitch and in the events gets one row, not two', () => {
  const list=A.playerIndex([agg({
    players:{'7':stat({goals:1})},names:{'7':'Elva'},mins:{'7':played(90)}
  })]);
  eq(list.length,1);
  eq(list[0].apps,1,'two ways of finding the same man is still one appearance');
});

test('most minutes first, and a tie is settled by name', () => {
  const list=A.playerIndex([agg({
    players:{'7':A.newStat(),'9':A.newStat(),'3':A.newStat()},
    names:{'7':'Zulu','9':'Alpha','3':'Mike'},
    mins:{'7':played(90),'9':played(90),'3':played(12)}
  })]);
  deepEq(list.map(p=>p.name),['Alpha','Zulu','Mike'],
         '90, 90 then 12 — and the two 90s alphabetically, never by shirt');
});

/* ================= adding a campaign up ================= */

test('a total is the sum of the columns above it', () => {
  const list=A.playerIndex([
    agg({players:{'7':stat({goals:1,totalShots:4,shotsOn:2,passes:30,passesComp:24})},names:{'7':'Elva'}}),
    agg({m:{slug:'b'},players:{'7':stat({goals:2,totalShots:6,shotsOn:3,passes:20,passesComp:12})},names:{'7':'Elva'}})
  ]);
  const t=list[0].total;
  eq(t.goals,3); eq(t.totalShots,10); eq(t.shotsOn,5); eq(t.passes,50); eq(t.passesComp,36);
});

test('a percentage over a campaign is one ratio of the totals, not a mean of ratios', () => {
  const list=A.playerIndex([
    agg({players:{'7':stat({totalShots:1,shotsOn:1})},names:{'7':'Elva'}}),             // 100%
    agg({m:{slug:'b'},players:{'7':stat({totalShots:9,shotsOn:1})},names:{'7':'Elva'}}) // 11.1%
  ]);
  const acc=A.PLAYER_CATS.shooting.filter(c=>c[0]==='Shooting Accuracy')[0][1];
  eq(acc(list[0].total),'20.0%','2 of 10 — not the 55.6% the two match figures average to');
});

test('sumStats starts from shared.js-s own zero row', () => {
  deepEq(A.sumStats([]),A.newStat(),'nothing summed is the zero row, not an empty object');
  const one=stat({goals:2});
  const sum=A.sumStats([one,stat({goals:3})]);
  eq(sum.goals,5);
  eq(one.goals,2,'and the inputs are left alone');
});

/* ================= minutes ================= */

test('the campaign total is the minutes the page actually shows', () => {
  const list=A.playerIndex([
    agg({players:{'7':A.newStat()},names:{'7':'Elva'},mins:{'7':played(64)}}),
    agg({m:{slug:'b'},players:{'7':A.newStat()},names:{'7':'Elva'},mins:{'7':played(90)}})
  ]);
  eq(list[0].min,154,'64 + 90 — the two numbers on the screen');
  eq(A.minsTotal(list[0]),"154'");
});

test('one match without its Duration boundaries marks the whole total', () => {
  const list=A.playerIndex([
    agg({players:{'7':A.newStat()},names:{'7':'Elva'},mins:{'7':played(90)}}),
    agg({m:{slug:'b'},players:{'7':A.newStat()},names:{'7':'Elva'},
         mins:{'7':{min:83,sec:4980,h1:4980,h2:0,exact:false}}})
  ]);
  eq(A.minsTotal(list[0]),"~173'",'the ~ is the same mark the Stats tab puts on an estimate');
});

test('one match cell reads exactly as the Stats tab-s does', () => {
  eq(A.minsOne(null),'<td>—</td>','no line-up says nothing, never 0');
  ok(/>90'<\/td>/.test(A.minsOne(played(90))));
  ok(/1st 45' · 2nd 45'/.test(A.minsOne(played(90))),'with the halves on hover');
  const soft=A.minsOne({min:83,h1:4980,h2:0,exact:false});
  ok(/>~83'<\/td>/.test(soft)&&/approximate/.test(soft),'and an estimate says why');
});

/* ================= cards ================= */

const CARD_ROWS=[
  {t:10,team:'home',playerFrom:'7',event:'Yellow Card'},
  {t:20,team:'home',playerFrom:'7',event:'Yellow Card'},
  {t:21,team:'home',playerFrom:'7',event:'Red Card'},    // the SAME dismissal
  {t:30,team:'home',playerFrom:'4',event:'Red Card'},    // a straight one
  {t:40,team:'away',playerFrom:'9',event:'Yellow Card'}  // not our club
];

test('a second yellow is a yellow and a sending-off, counted once', () => {
  const c=A.playerCards(A.computeStats(CARD_ROWS,'home'));
  deepEq(c['7'],{y:2,r:1},'two yellows, one red — and the red row tagged with it adds nothing');
  deepEq(c['4'],{y:0,r:1});
  notOk(c['9'],'the opposition-s card is not ours');
});

test('a player-s cards add up to what the club-s card count says', () => {
  const B=sandbox({reports:{m1:{rows:CARD_ROWS}}});
  const team=B.discipline([{uuid:'m1',side:'home'}]);
  const per=B.playerCards(B.computeStats(CARD_ROWS,'home'));
  const y=Object.keys(per).reduce((n,k)=>n+per[k].y,0);
  const r=Object.keys(per).reduce((n,k)=>n+per[k].r,0);
  eq(y,team.yellow,'the same yellows the Overview shows');
  eq(r,team.red,'and the same reds');
});

/* ================= the goalkeeper ================= */

const GK_LU=o=>({
  home:{roster:[{no:'1',name:'Barclett'},{no:'7',name:'Elva'},{no:'13',name:'Reserve'}],
        xi:[dot('1','GK'),dot('7','CM')],subs:['13'],dir:'lr'},
  away:{roster:[],xi:[dot('30','GK')],subs:[],dir:'rl'},
  history:(o||{}).history||[]
});
const GOAL=(t,team)=>({t,team,playerFrom:'9',event:'goal'});

test('a keeper is where the analyst put him: the GK square', () => {
  const s=A.gkShirts(GK_LU(),'home');
  ok(s.has('1'),'the dot in the GK cell');
  notOk(s.has('7'),'and nobody else');
  eq(A.gkShirts({},'home').size,0,'no line-up, no keeper — nothing is guessed');
});

test('a keeper who came on from the bench is a keeper too', () => {
  const lu=GK_LU({history:[{t:3000,team:'home',xi:[dot('13','GK'),dot('7','CM')]}]});
  const s=A.gkShirts(lu,'home');
  ok(s.has('1')&&s.has('13'),'the starting XI and every later snapshot');
});

test('nothing falls back to guessing the deepest player', () => {
  const flat={home:{roster:[],xi:[dot('1',''),dot('7','')],subs:[],dir:'lr'}};
  eq(A.gkShirts(flat,'home').size,0,
     'a wrong GK card is worse than none — report.js may guess for a PDF, this may not');
  notOk(/reduce\([^)]*100 ?- ?p\.x/.test(APPJS),'and app.js carries no such fallback');
});

test('onPitchAt reads the last snapshot before the moment asked about', () => {
  const lu=GK_LU({history:[{t:3000,team:'home',xi:[dot('13','GK'),dot('7','CM')]}]});
  ok(A.onPitchAt(lu,'home',0).has('1'),'before any snapshot it is the starting XI');
  ok(A.onPitchAt(lu,'home',2999).has('1'),'right up to the change');
  ok(A.onPitchAt(lu,'home',3000).has('13'),'and from the moment of it');
  notOk(A.onPitchAt(lu,'home',3000).has('1'),'the man who went off is off');
  eq(A.onPitchAt(lu,'away',4000).size,1,'the other side is read from its own XI');
});

test('a goal conceded belongs to the keeper who was on the pitch', () => {
  const lu=GK_LU({history:[{t:3000,team:'home',xi:[dot('13','GK'),dot('7','CM')]}]});
  const g=A.gkFigures([GOAL(1000,'away'),GOAL(4000,'away'),GOAL(5000,'away')],lu,'home');
  eq(g['1'].conceded,1,'the one before the change');
  eq(g['13'].conceded,2,'and the two after it');
  eq(g['1'].clean,0); eq(g['13'].clean,0);
});

test('an own goal is a goal conceded, and the opposition-s own goal is not', () => {
  const lu=GK_LU();
  const g=A.gkFigures([{t:100,team:'home',playerFrom:'4',event:'own goal'},
                       {t:200,team:'away',playerFrom:'5',event:'own goal'}],lu,'home');
  eq(g['1'].conceded,1,'ours went in behind him; theirs went in at the other end');
});

test('a keeper who conceded nothing has a clean sheet', () => {
  const g=A.gkFigures([{t:100,team:'home',playerFrom:'7',event:'goal'}],GK_LU(),'home');
  eq(g['1'].conceded,0);
  eq(g['1'].clean,1,'our own goal is not one he let in');
  eq(g['1'].known,1,'and the line-up could answer, so it is a fact rather than a blank');
});

test('a match with no line-up answers nothing about a keeper', () => {
  deepEq(A.gkFigures([GOAL(100,'away')],{},'home'),{},
         'no formation board, no keeper, no conceded record');
});

test('a campaign of keeping adds up, and the rate is a ratio of the totals', () => {
  const list=A.playerIndex([
    agg({players:{'1':stat({saves:3})},names:{'1':'Barclett'},mins:{'1':played(90)},
         gk:{'1':{conceded:1,clean:0,known:1}}}),
    agg({m:{slug:'b'},players:{'1':stat({saves:7})},names:{'1':'Barclett'},mins:{'1':played(90)},
         gk:{'1':{conceded:0,clean:1,known:1}}})
  ]);
  const k=list[0];
  ok(k.gk,'one match in the GK square makes him a keeper');
  deepEq(k.gkTotal,{conceded:1,clean:1,known:2});
  eq(A.gkCell(k,'conceded'),1);
  eq(A.gkCell(k,'clean'),1);
  eq(A.gkCell(k,'rate'),'90.9%','10 saves of the 11 on target he faced');
});

test('a keeper stays a keeper in the matches nobody placed him for', () => {
  const list=A.playerIndex([
    agg({m:{slug:'a'},players:{'1':stat({saves:2})},names:{'1':'Barclett'},
         gk:{'1':{conceded:2,clean:0,known:1}}}),
    agg({m:{slug:'b'},players:{'1':stat({saves:1})},names:{'1':'Barclett'},gk:{}})   // board untidied
  ]);
  eq(list.length,1);
  ok(list[0].gk,'a board an analyst never tidied is not evidence he played elsewhere');
  eq(list[0].gkTotal.known,1,'but only the match that CAN answer is counted');
  eq(list[0].gkTotal.conceded,2);
});

test('a keeper nothing is known about reads —, never 0', () => {
  const list=A.playerIndex([agg({players:{'1':stat({saves:2})},names:{'1':'Barclett'},gk:{}})]);
  const k=list[0];
  notOk(k.gk,'no GK square anywhere means he is not shown as a keeper at all');
  const blank={gkTotal:{conceded:0,clean:0,known:0},total:stat({saves:2})};
  eq(A.gkCell(blank,'conceded'),'—','0 would claim a record nobody kept');
  eq(A.gkCell(blank,'clean'),'—');
  eq(A.gkCell(blank,'rate'),'—');
});

test('the keeper columns are shared.js-s, and take the match as well as the man', () => {
  deepEq(A.GK_COLS.map(c=>c[0]),
         ['Saves','Conceded','On Target Faced','Save Rate','Clean Sheets','Goal Kicks',
          'Catches','Parries','Standing','Diving','Collapse','Overhead','Kneeling',
          'Def. Line Support','Aerial Control','Conceded (tagged)']);
  ok(/const GK_COLS=\[/.test(SHARED),'the definition lives in shared.js, beside PLAYER_CATS');
  const s=stat({saves:4,goalKicks:9}), g={conceded:1,clean:0,known:1};
  const v=A.GK_COLS.map(c=>c[1](s,g));
  deepEq(v.slice(0,6),[4,1,5,'80.0%',0,9],'faced = kept out + let in, and the rate follows from it');
  /* The ten added below them are the keeper's own detail. They print their tally, so a
     match tagged before those events existed reads 0 — the two fraction columns as 0/0. */
  deepEq(v.slice(6),[0,0,0,0,0,0,0,'0/0','0/0',0],
         'the detail columns are a plain tally');
  /* `known` is a different question and still guards the four it always guarded: it asks
     whether a line-up existed to say who was on the pitch, not whether an event was
     tagged. With no board, those four say so and the rest still read. */
  const unknown=A.GK_COLS.map(c=>c[1](s,{conceded:0,clean:0,known:0}));
  deepEq(unknown.slice(0,6),[4,'—','—','—','—',9],'what only he did still reads; what the match knows does not');
});

test('PLAYER_CATS is the six tabs this page and the Stats tab share', () => {
  deepEq(Object.keys(A.PLAYER_CATS),
    ['shooting','distribution','defensive','goalkeeper','setPieces','fouls']);
  ok(/const STAT_CATS=PLAYER_CATS;/.test(VIEW),'one array, two readers');
  /* The rule this used to police by looking for "Conceded" in a label, which the
     Goalkeeper tab's own "Goals Conceded (tagged)" would now trip on. The rule was
     never about the wording: it is that a PLAYER_CATS column takes ONE argument.
     Anything needing the match around a player — Save Rate, Clean Sheets, the derived
     Conceded — takes two, belongs in GK_COLS, and would read `undefined.known` here.
     Checking the arity says exactly that, and cannot be fooled by a label. */
  Object.keys(A.PLAYER_CATS).forEach(k=>A.PLAYER_CATS[k].forEach(c=>
    eq(c[1].length,1,k+' / '+c[0]+' takes one stat object, like every column here')));
  A.GK_COLS.forEach(c=>eq(c[1].length,2,'GK_COLS / '+c[0]+' takes the match as well'));
});

/* ================= what it must not touch ================= */

test('reading a campaign by player changes nothing about reading it by match', () => {
  const shared=stat({goals:1,passes:10});
  const aggs=[agg({players:{'7':shared},names:{'7':'Elva'},mins:{'7':played(90)}})];
  const before=JSON.stringify(aggs);
  const tallyBefore=JSON.stringify(A.playerTally(aggs));

  A.playerIndex(aggs);

  eq(JSON.stringify(aggs),before,
     'no stat object app.js did not make is written to — withSquad() would have mutated this one');
  eq(JSON.stringify(A.playerTally(aggs)),tallyBefore,'so the Key Players cards read what they always did');
  eq(shared.goals,1,'and the match-s own figures are untouched');
});

test('aggregate() hands the new view its fields without disturbing the old ones', () => {
  const rows=[{t:100,team:'home',playerFrom:'7',event:'goal'},
              {t:200,team:'home',playerFrom:'7',event:'Yellow Card'},
              {t:300,team:'away',playerFrom:'9',event:'goal'},
              {t:400,team:'away',playerFrom:'5',event:'pass success',playerTo:'6'}];
  const lu=GK_LU();
  lu.home.roster[0].pid='uuid-1';
  const B=sandbox({reports:{u1:{rows:rows,lineups:lu,dur:DUR}}});
  const a=B.aggregate({uuid:'u1',side:'home',home:{score:1},away:{score:1}});
  ok(a.us&&a.them,'the two team columns are still there');
  ok(a.players['7'],'and the per-player figures Key Players reads');
  eq(a.players['7'].goals,1);
  ok(a.mins&&a.mins['7'],'plus who was on the pitch');
  eq(a.mins['7'].min,90);
  deepEq(a.cards['7'],{y:1,r:0},'who was booked');
  deepEq(a.ids,{'1':'uuid-1'},'which squad entries name a players row');
  deepEq(a.gk['1'],{conceded:1,clean:0,known:1},'and what went in past the keeper');
  eq(a.names['7'],'Elva');
});

/* ================= the route ================= */

test('Data is three sections, and which one is open is still in the URL', () => {
  ok(/\['overview', 'Overview'\], \['team', 'Team Data'\], \['player', 'Player Data'\]/.test(tabs),
     'three tabs, in that order');
  ok(/location\.hash = '#\/data\/' \+ t\[0\];/.test(tabs),'a tab click is a hash change');
  ok(/var onPlayer = rest\[0\] === 'player';/.test(renderData),'the hash decides');
  ok(/if \(onPlayer\) renderPlayerData\(body, rest\);/.test(renderData),'and one of the three is drawn');
  ok(/else if \(onTeam\) renderTeamData\(body, cat\); else renderOverview\(body\);/.test(renderData),
     'the other two are reached exactly as they were');
  const route=/function route\(\)[\s\S]*?\n  \}/.exec(APPJS)[0];
  ok(/parts\[0\] === 'data'/.test(route),'#/data/player/... still lights Data on the rail');
});

test('a player is a link somebody can send, and a dead one lands somewhere real', () => {
  ok(/encodeURIComponent\(p\.key\)/.test(headCard),'the dropdown encodes the key it puts in the hash');
  ok(/esc\(encodeURIComponent\(p\.key\)\)/.test(oneTable),
     'and the list row encodes it for the URL, then escapes it for the attribute it travels in');
  ok(/decodeURIComponent\(rest\[1\]\)/.test(playerData),'which is read back the same way');
  ok(/if \(key && !who\) \{ location\.replace\('#\/data\/player'\); return; \}/.test(playerData),
     'a key from another channel goes back to the list, and replaces rather than stacks');
});

test('a keeper opens on his own first tab, and so does everyone else', () => {
  ok(/t\[0\] === 'shooting' \? \['goalkeeping', 'Goalkeeping'\] : t/.test(APPJS),
     'Goalkeeping stands where Shooting stands for everybody else');
  ok(/var tabs = tabsFor\(who\);/.test(profile)&&
     /tabs\.some\(function \(t\) \{ return t\[0\] === wanted; \}\) \? wanted : tabs\[0\]\[0\]/.test(profile),
     'a category the URL invented falls back to his own first one, not to a fixed name');
  ok(/tabsFor\(p\)\.some\(function \(t\) \{ return t\[0\] === cat; \}\) \? cat : tabsFor\(p\)\[0\]\[0\]/.test(headCard),
     'and switching between a keeper and an outfielder cannot land on a tab he has not got');
  const cat=/function catCols\(cat\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
  ok(/cat === 'goalkeeping'/.test(cat)&&/typeof GK_COLS === 'undefined'/.test(cat),
     'and shared.js failing to load draws an empty table, not an exception');
});

/* ================= what is drawn ================= */

test('the list is two tables, and neither has a shirt column', () => {
  ok(/people\.filter\(function \(p\) \{ return !p\.gk; \}\)/.test(listView)&&
     /people\.filter\(function \(p\) \{ return p\.gk; \}\)/.test(listView),
     'outfield players and goalkeepers are two different jobs');
  ok(/if \(keepers\.length\) body\.appendChild\(playerTable\('Goalkeepers'/.test(listView),
     'and a channel with no keeper placed gets no empty section');
  ok(/'<th class="c-pl">Player<\/th>'/.test(oneTable),'the first column is who he is');
  notOk(/c-no|>No<|Shirt/.test(oneTable),'no shirt number column anywhere in it');
  notOk(/pl-shirt|who\.no|p\.no/.test(headCard+profile+matchTable+listView+oneTable),
        'nor a single number printed beside a name');
  deepEq(A.PL_OUT.map(c=>c[0]),['Apps','Minutes','Goals','Assists','Key Passes']);
  deepEq(A.PL_GK.map(c=>c[0]),['Apps','Minutes','Saves','Conceded','Save Rate','Clean Sheets']);
});

test('the list columns read a player the way his section reads him', () => {
  const p=A.playerIndex([agg({players:{'7':stat({goals:2,assists:1,keyPasses:3})},names:{'7':'Elva'},
    mins:{'7':played(90)}})])[0];
  deepEq(A.PL_OUT.map(c=>c[1](p)),[1,"90'",2,1,3]);
  const k=A.playerIndex([agg({players:{'1':stat({saves:9})},names:{'1':'Barclett'},
    mins:{'1':played(90)},gk:{'1':{conceded:1,clean:0,known:1}}})])[0];
  deepEq(A.PL_GK.map(c=>c[1](k)),[1,"90'",9,1,'90.0%',0]);
});

test('a keeper-s six tiles are about the goal, and his cards are not lost', () => {
  /* The four moved out of the function body and into a table when roles arrived —
     one builder now draws a keeper's row, a role's row and the fallback row, so
     none of the three is written out twice. What they SAY has not moved. */
  deepEq(A.GK_KPIS.map(t=>t.l),['Saves','Conceded','Save Rate','Clean Sheets'],
     'what he did instead of shooting');
  ok(/who\.gk\s*\n?\s*\?/.test(profile),'chosen by role, not drawn twice');
  deepEq(A.FALLBACK_KPIS.map(t=>t.l),['Goals','Assists','Key Passes','Cards'],
     'and the strip for a player no line-up placed is exactly as it was');
  ok(/who\.gk \|\| role \? ' · ' \+ who\.cards\.y \+ 'Y · ' \+ who\.cards\.r \+ 'R' : ''/.test(headCard),
     'a keeper-s booking record moves to the meta line rather than disappearing — and so does a role-s');
  ok(/pl-role">GK/.test(headCard),'and the badge says what he is — the one thing that does not change');
});

test('the match table is Team Data-s five fixed columns, with minutes for possession', () => {
  ok(/<th class="c-date">Date<\/th>/.test(matchTable)&&/<th class="c-opp">vs<\/th>/.test(matchTable)&&
     /<th class="c-res">Result<\/th>/.test(matchTable)&&/<th class="c-sc">Score<\/th>/.test(matchTable)&&
     /<th>Minutes Played<\/th>/.test(matchTable),'all five, in that order');
  notOk(/Possession/.test(matchTable),'possession is a team measure and is not one of them');
  notOk(/Rating/.test(matchTable),'and nothing here invents a number no other page can show');
  ok(/who\.matches\.slice\(\)\.reverse\(\)/.test(matchTable),'most recent match first');
  ok(/tr data-go=/.test(matchTable),'a row still opens the match it came from');
  ok(/var gkView = cat === 'goalkeeping';/.test(matchTable)&&
     /c\[1\]\(s, gkView \? \(g \|\| NOGK\) : undefined\)/.test(matchTable),
     'the keeper columns get the match as a second argument; the others never see one');
});

test('the campaign row is a foot, and its percentages come off the summed pair', () => {
  ok(/<tfoot>/.test(matchTable),'a total belongs under the column it totals');
  ok(/cell\(c, who\.total, who\.gkTotal\)/.test(matchTable),'run on the sums, never summed from the cells');
  notOk(/class="tot"/.test(matchTable),'and it is not the row Team Data took off its own table');
  notOk(/tr\.tot/.test(APPCSS),'nothing styles that row either');
});

test('a club is its name here too', () => {
  notOk(/crest|monogram/i.test(listView+oneTable+profile+headCard+matchTable),
        'no badge is drawn beside an opponent or a player');
  ok(/esc\(m\.opponent\)/.test(matchTable),'the vs column is who it was');
});

test('every empty state says whose move it is', () => {
  ok(/No submitted analysis to read/.test(playerData)&&/Submit Analysis/.test(playerData),
     'no report yet');
  ok(/never came on is not an appearance/.test(listView),
     'the list says what it is counting, since that is the one rule a reader cannot guess');
  ok(/belong to a match rather than to a player/.test(listView),
     'and says why there is no shirt number on it');
});

test('the index is built once per channel and dropped with it', () => {
  const src=/function playerList\(\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
  ok(/playerJob && playerJob\.forChannel === ch\.id/.test(src),'a category click redraws from memory');
  const load=/function loadMatches\(ch\)[\s\S]*?\n  \}/.exec(APPJS)[0];
  ok(/state\.reports = null; state\.reportsFor = null; reportJob = null; playerJob = null;/.test(load),
     'switching club cannot leave the last one-s squad on the screen');
});

test('Player Data pulls in nothing the Data view was not already loading', () => {
  const src=/function dataSource\(\)[\s\S]*?\n  \}/.exec(APPJS)[0];
  ok(/loadShared\(\)/.test(src),'the stat engine, as before');
  notOk(/loadStatsView|xlsx|stats-view/.test(src),
        'and still not the spreadsheet library or the renderers — the column sets are in shared.js');
  ok(/HNA\.reports/.test(src),'one read of the reports feeds all three sections');
});

/* ================= layout ================= */

test('the name stays put while the stats scroll', () => {
  const css=APPCSS.replace(/\s*\n\s*/g,'');
  ok(/table\.stbl \.c-pl\{position:sticky; left:0/.test(css),
     'the name is frozen at the edge — there is no shirt column in front of it any more');
  notOk(/table\.stbl \.c-no\{/.test(css),'and the styling for one is gone with it');
  /* the match table's own rule is left first and whole inside this block: it is
     the line tests/data-page.test.js reads to know that table lets go too */
  ok(/@media \(max-width:720px\)\{table\.stbl \.c-date, table\.stbl \.c-opp\{position:static\}/.test(css),
     'the match table still lets go where there is no width to spare');
  ok(/@media \(max-width:720px\)\{[^@]*table\.stbl \.c-pl\{position:static\}/.test(css),
     'and the player list lets go beside it');
  ok(/table\.stbl tfoot td\{/.test(css),'the total row is styled as one');
  ok(/\.pl-sec\{margin-bottom:20px\}/.test(css),'and the two list sections stand apart');
});

test('the player header is a card with the switcher on its end', () => {
  const css=APPCSS.replace(/\s*\n\s*/g,'');
  ok(/\.pl-id\{display:flex/.test(css)&&/\.pl-id \.menu-wrap\{margin-left:auto\}/.test(css),
     'name on the left, the way to another player on the right');
  ok(/\.pl-id \.menu\{max-height:52vh; overflow-y:auto\}/.test(css),
     'a squad of thirty does not run off the bottom of the screen');
  ok(/\.pl-role\{/.test(css)&&/color:var\(--amber\)/.test(/\.pl-role\{([^}]*)\}/.exec(css)[1]),
     'the GK badge is marked out from the name beside it');
  notOk(/\.pl-shirt/.test(css),'and no styling is left for a number that is no longer drawn');
  ok(/menu-wrap/.test(headCard)&&/document\.removeEventListener\('click', away\)/.test(headCard),
     'the menu takes its document listener off with it, as the channel one does');
});
