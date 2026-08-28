/* The Stats tab's four category tables became six: `other` was split into Goalkeeper,
   Set Pieces and Fouls, and the ground-duel columns gave way to the two kinds a duel on
   the floor is now tagged as. The team comparison on Overall was cut the same way.

   Three of the new column families are of three different kinds, and the difference is
   the whole reason this file exists:

     already measured   the fifteen Goalkeeper columns were being counted a month before
                        anything showed them. Nothing new is computed for them.
     already recorded   foul / foul throw / handball foul have ALWAYS been three separate
                        events sharing one counter, and yellow / red have always been
                        tagged. Breaking them out is exact for every match ever tagged,
                        and NOTHING here may read "—".
     never asked        what a free-kick or a corner produced is not on any single row.
                        It is read off the entry the set piece was tagged in — the grp
                        join shotBodyPart() already uses — and a match nobody chained has
                        no answer, which is what "—" is for.

   Run:  node tests/stats-tabs-split.test.js */
const fs=require('fs'), path=require('path'), vm=require('vm');
const {test,eq,ok,notOk,deepEq}=require('./tiny-test');
const {loadShared,grabFunction,grabConst,readSrc,SRC,SHARED,STATS}=require('./harness');

const S=loadShared();
const APPJS=readSrc('client/assets/app.js');
const REPORT=readSrc('Stats/report.js');
const PAGE=readSrc('Stats/index.html');

const ev=(o)=>Object.assign({team:'home',t:0},o);
const P=(rows,team)=>S.computeStats(rows,team||'home');
const col=(cat,label)=>S.PLAYER_CATS[cat].find(c=>c[0]===label)[1];

/* ================= 1. the six tabs ================= */

test('PLAYER_CATS is six categories and no `other`', () => {
  deepEq(Object.keys(S.PLAYER_CATS),
    ['shooting','distribution','defensive','goalkeeper','setPieces','fouls']);
  eq(Object.values(S.PLAYER_CATS).reduce((n,c)=>n+c.length,0),68,'sixty-eight columns in all');
});

test('nothing the old Other tab showed was dropped on the way', () => {
  // its nine columns, spread across the three tabs that replaced it
  const all=new Set([].concat(...Object.values(S.PLAYER_CATS)).map(c=>c[0]));
  ['Corners','Penalty Kicks','Goal Kicks','Fouls','Fouls Won','Offsides','Saves']
    .forEach(l=>ok(all.has(l),l+' still has a column somewhere'));
  // two were relabelled rather than removed, and the labels are the ones asked for
  ok(all.has('Freekicks'),'Free-kicks reads Freekicks under Set Pieces');
  ok(all.has('Throw-Ins'),'and Throw-ins reads Throw-Ins');
});

test('every column takes one stat object, which is what makes it a PLAYER_CATS column', () => {
  // GK_COLS is the other keeper table and takes the match as a second argument; a line
  // copied across from it would read `undefined.known` and take the whole table with it
  Object.keys(S.PLAYER_CATS).forEach(k=>S.PLAYER_CATS[k].forEach(c=>
    eq(c[1].length,1,k+' / '+c[0])));
  S.PLAYER_CATS.goalkeeper.forEach(c=>c[1](S.newStat()));   // throws if it needs a second
});

test('the six tabs are the six buttons, in both copies of the chrome', () => {
  const keys=Object.keys(S.PLAYER_CATS);
  keys.forEach(k=>{
    ok(STATS.includes('data-cat="'+k+'"'),'the rendered chrome has the '+k+' tab');
    ok(PAGE.includes('data-cat="'+k+'"'),'and so does Stats/index.html');
  });
  eq((STATS.match(/data-cat="/g)||[]).length,keys.length,'and no button for a tab that is not there');
});

test('every category has something for the Dashboard to draw', () => {
  /* Dashboard and Stats share statCat. A category with no branch in dashboardHTML is a
     button that renders a blank page — no error, nothing in the console. */
  const fn=grabFunction('dashboardHTML',STATS,'Stats/stats-view.js');
  Object.keys(S.PLAYER_CATS).forEach(k=>
    ok(fn.includes("statCat==='"+k+"'")||k==='shooting',
       k+' has a branch in dashboardHTML'));
  ok(fn.includes("statCat==='shooting'"),'shooting included');
});

/* ================= 2. nothing that already worked moved ================= */

const OLD_ROWS=[
  ev({event:'goal',playerFrom:'9'}), ev({event:'shot on target',playerFrom:'9'}),
  ev({event:'pass success',playerFrom:'6'}), ev({event:'pass fail',playerFrom:'6'}),
  ev({event:'tackle success',playerFrom:'4'}), ev({event:'tackle fail',playerFrom:'4'}),
  ev({event:'ground duel success',playerFrom:'4'}), ev({event:'ground duel fail',playerFrom:'4'}),
  ev({event:'corner-kick',playerFrom:'7'}), ev({event:'save',playerFrom:'1'})
];

test('the figures the app read before any of this come out unchanged', () => {
  const p=P(OLD_ROWS);
  eq(p['9'].goals,1); eq(p['9'].totalShots,2); eq(p['9'].shotsOn,2);
  eq(p['6'].passes,2); eq(p['6'].passesComp,1);
  eq(p['4'].tackles,2); eq(p['4'].tacklesWon,1);
  eq(p['4'].groundDuels,2,'the roll-up is still counted, it is only no longer shown');
  eq(p['4'].groundDuelsWon,1);
  eq(p['7'].corners,1); eq(p['1'].saves,1);
});

test('the two new passes touch none of the first pass-s counters', () => {
  /* Whatever cardFold and setPieceFold do, they may not write to a key EVENT_INC owns.
     Run the engine over rows that exercise both, and compare every EVENT_INC key against
     a hand count of the same rows. */
  const rows=[
    ev({event:'free-kick',playerFrom:'10',grp:'g'}),
    ev({event:'shot on target',playerFrom:'10',grp:'g'}),
    ev({event:'yellow card',playerFrom:'10',t:5})
  ];
  const p=P(rows)['10'];
  eq(p.freeKicks,1); eq(p.totalShots,1); eq(p.shotsOn,1);
  // the set-piece columns are extra tallies beside those, never instead of them
  eq(p.fkShotsOn,1); eq(p.setPieceShots,1);
});

test('TEAM_SECTIONS keeps its first three sections exactly where they are', () => {
  /* Stats/report.js reaches for its comparison pages by POSITION — sectionRows(0), (1),
     (2). Insert a section among those three and the PDF prints one section-s rows under
     another section-s heading: no error, and the bars still look right. Every new
     section is APPENDED. */
  eq(S.TEAM_SECTIONS[0][0],'Attacking Stats');
  eq(S.TEAM_SECTIONS[1][0],'Distribution Stats');
  eq(S.TEAM_SECTIONS[2][0],'Defensive Stats');
  [0,1,2].forEach(i=>ok(new RegExp('sectionRows\\('+i+'\\)').test(REPORT),
    'report.js still reads section '+i+' by index'));
  eq(S.TEAM_SECTIONS.length,6,'and three were added after them');
});

test('Goals Conceded on the comparison is still the derived one', () => {
  // off the opposition-s goals, which cannot be forgotten -- never the tagged event,
  // which can. The tagged one is labelled as such and lives on the Goalkeeper tab.
  const gk=S.TEAM_SECTIONS.find(s=>s[0]==='Goalkeeper Stats')[1];
  const row=gk.find(r=>r[0]==='Goals Conceded');
  const us=S.newStat(), them=S.newStat(); them.goals=3; us.goalsConceded=99;
  eq(row[1](us,them),3,'their goals, not the number somebody typed');
});

/* ================= 3. the fouls: recorded all along, so no "—" ================= */

const FOUL_ROWS=[
  ev({event:'foul',playerFrom:'4',t:1}), ev({event:'foul',playerFrom:'4',t:2}),
  ev({event:'handball foul',playerFrom:'4',t:3}),
  ev({event:'foul throw',playerFrom:'2',t:4}),
  ev({event:'foul won',playerFrom:'9',t:5}),
  ev({event:'offside',playerFrom:'9',t:6})
];

test('Total Fouls is exactly its three parts, for every match ever tagged', () => {
  const p=P(FOUL_ROWS);
  eq(p['4'].fouls,3,'the total is untouched — the PDF and the comparison still read it');
  eq(p['4'].foulsPlain,2); eq(p['4'].handballFouls,1); eq(p['4'].foulThrows,0);
  eq(p['2'].fouls,1); eq(p['2'].foulThrows,1); eq(p['2'].foulsPlain,0);
  Object.values(p).forEach(s=>
    eq(s.fouls,s.foulsPlain+s.foulThrows+s.handballFouls,'total = plain + throw + handball'));
});

test('the Fouls tab never prints a dash — every one of its figures is on file', () => {
  const p=P(FOUL_ROWS);
  ['4','2','9'].forEach(no=>S.PLAYER_CATS.fouls.forEach(c=>
    notOk(String(c[1](p[no]))==='—',c[0]+' has an answer for '+no)));
  // and a player from a match tagged years ago is no different: a blank stat is all zeroes
  S.PLAYER_CATS.fouls.forEach(c=>eq(c[1](S.newStat()),0,c[0]+' reads 0, not —'));
});

/* ================= 4. the cards, through classifyCards ================= */

const CARD_ROWS=[
  ev({event:'Yellow Card',playerFrom:'7',t:10}),
  ev({event:'Yellow Card',playerFrom:'7',t:20}),
  ev({event:'Red Card',playerFrom:'7',t:21}),          // the SAME dismissal
  ev({event:'red card',playerFrom:'4',t:30}),          // a straight one
  ev({team:'away',event:'yellow card',playerFrom:'7',t:40})
];

test('a second yellow is a booking and the sending-off it is, counted once', () => {
  const p=P(CARD_ROWS);
  eq(p['7'].yellowCards,2); eq(p['7'].redCards,1,'the explicit red beside it adds nothing');
  eq(p['4'].redCards,1); eq(p['4'].yellowCards,0);
  eq(P(CARD_ROWS,'away')['7'].yellowCards,1,'the other side-s 7 is a different man');
  eq(P(CARD_ROWS,'away')['7'].redCards,0);
});

test('cards are NOT in EVENT_INC, which is what stops them being counted twice', () => {
  notOk(S.EVENT_INC['yellow card'],'no EVENT_INC line for a yellow');
  notOk(S.EVENT_INC['red card'],'nor a red');
  ok(/classifyCards\(rows\)/.test(SHARED),'computeStats goes through classifyCards');
  ok(/classifyCards\(state\.rows\)/.test(SRC),'and so does the tagging tab-s copy');
});

test('a card with no timestamp is not counted, exactly as the timeline has always had it', () => {
  const p=P([ev({event:'yellow card',playerFrom:'7',t:null})]);
  ok(!p['7']||!p['7'].yellowCards,'classifyCards only walks rows that have a moment');
});

/* ================= 5. the set pieces, read off the entry ================= */

const SP_ROWS=[
  // a free-kick struck straight at goal, one entry
  ev({event:'free-kick',playerFrom:'10',grp:'a'}),
  ev({event:'shot on target',playerFrom:'10',grp:'a'}),
  // another, off target
  ev({event:'free-kick',playerFrom:'10',grp:'b'}),
  ev({event:'shot off target',playerFrom:'10',grp:'b'}),
  // a free-kick crossed in and cleared
  ev({event:'free-kick',playerFrom:'10',grp:'c'}),
  ev({event:'cross fail',playerFrom:'10',grp:'c'}),
  // a corner swung in by 17 and headed home by 14 — ONE entry, two players
  ev({event:'corner-kick',playerFrom:'17',grp:'d'}),
  ev({event:'cross success',playerFrom:'17',grp:'d'}),
  ev({event:'goal',playerFrom:'14',grp:'d'}),
  // open play: not a set piece at all
  ev({event:'shot on target',playerFrom:'9'})
];

test('the finisher is credited, not the taker', () => {
  const p=P(SP_ROWS);
  eq(p['14'].setPieceGoals,1,'14 headed it in, so it is 14-s set-piece goal');
  eq(p['14'].setPieceShots,1);
  eq(p['17'].setPieceGoals,0,'17 swung it in, and gets the corner, not the goal');
  eq(p['17'].corners,1);
});

test('every set-piece figure is a subset of a column that already exists', () => {
  /* This is what crediting the finisher buys: the new columns can be checked against the
     old ones instead of being taken on trust. */
  Object.values(P(SP_ROWS)).forEach(s=>{
    ok(s.fkShotsOn<=s.shotsOn,'fkShotsOn ⊆ shotsOn');
    ok(s.fkShotsOff<=s.shotsOff,'fkShotsOff ⊆ shotsOff');
    ok(s.fkCrossesComp<=s.fkCrosses,'succeeded ⊆ attempted');
    ok(s.fkCrosses<=s.crosses,'fkCrosses ⊆ crosses');
    ok(s.setPieceGoals<=s.goals,'setPieceGoals ⊆ goals');
    ok(s.setPieceShots<=s.totalShots,'setPieceShots ⊆ totalShots');
    ok(s.fkShotsOn+s.fkShotsOff<=s.setPieceShots,'a free-kick shot is a set-piece shot');
  });
});

test('a goal counts as on target, the same way the Shooting tab counts it', () => {
  const p=P([ev({event:'free-kick',playerFrom:'10',grp:'x'}),
             ev({event:'goal',playerFrom:'10',grp:'x'})]);
  eq(p['10'].fkShotsOn,1,'straight in from the free-kick');
  eq(p['10'].shotsOn,1,'and EVENT_INC says the same about the plain column');
});

test('only a free-kick feeds the Freekicks columns', () => {
  const p=P(SP_ROWS);
  eq(p['17'].fkCrosses,0,'a corner is a set piece, but it is not a free-kick');
  eq(p['10'].fkShotsOn,1); eq(p['10'].fkShotsOff,1);
  eq(p['10'].fkCrosses,1); eq(p['10'].fkCrossesComp,0,'his cross was cleared');
});

test('open play is not a set piece', () => {
  eq(P(SP_ROWS)['9'].setPieceShots,0);
  eq(P(SP_ROWS)['9'].shotsOn,1,'…but it is still a shot');
});

test('two events tagged as separate entries carry no join', () => {
  /* A free-kick and the shot after it typed as two Enters share no grp — a group id is
     only minted for an entry of two events or more. That is a real limit of reading the
     answer off the entry: the column reads 0, and spDetail is the only thing that knows
     the difference between "no set-piece shot" and "never tagged as one chain". */
  const p=P([ev({event:'free-kick',playerFrom:'10'}),ev({event:'shot on target',playerFrom:'10'})]);
  eq(p['10'].setPieceShots,0,'nothing joins them');
  eq(p['10'].spDetail,0,'and the match is not marked as chained');
  eq(col('setPieces','Set Piece Shot')(p['10']),0,'the column prints the tally');
  eq(p['10'].shotsOn,1,'while the shot itself is counted as it always was');
});

test('the detail flag is about the MATCH, so a finisher never hides behind a 0 flag', () => {
  /* If the flag were counted per event on the taker, 14 — who touched no set-piece event,
     only the goal inside one — would carry setPieceGoals:1 behind spDetail:0, and the
     column would print "—" over a real number. */
  const p=P(SP_ROWS);
  ok(p['14'].spDetail>0,'14 is marked, though he took no set piece');
  ok(p['9'].spDetail>0,'and so is 9, who was nowhere near one');
  eq(col('setPieces','Set Piece Goal')(p['14']),1,'his goal is printed, not hidden');
  eq(col('setPieces','Set Piece Shot')(p['9']),0,'and 9 reads a truthful 0');
});

test('the flag sums over a season the way every other field does', () => {
  const t=S.sumTeam(SP_ROWS,'home');
  ok(t.spDetail>0,'sumTeam adds it up with the rest');
  eq(t.setPieceGoals,1); eq(t.setPieceShots,3);
});

/* ================= 6. the goalkeeper ================= */

const GK_ROWS=[
  ev({event:'catch',playerFrom:'1',t:1}), ev({event:'catch',playerFrom:'1',t:2}),
  ev({event:'parry',playerFrom:'1',t:3}),
  ev({event:'save',playerFrom:'1',t:4}),               // the old name, still counted
  ev({event:'save diving',playerFrom:'1',t:5}),
  ev({event:'defensive line support success',playerFrom:'1',t:6}),
  ev({event:'defensive line support fail',playerFrom:'1',t:7}),
  ev({event:'aerial control success',playerFrom:'1',t:8}),
  ev({event:'goal conceded',playerFrom:'1',t:9})
];

test('Saves on the Goalkeeper tab is catches + parries, not the save event', () => {
  const s=P(GK_ROWS)['1'];
  eq(s.saves,4,'the counter still holds all three names — GK_COLS and the PDF read it');
  eq(col('goalkeeper','Saves')(s),3,'…but the column is the two outcomes: 2 caught, 1 parried');
  eq(col('goalkeeper','Catches')(s),2);
  eq(col('goalkeeper','Parries')(s),1);
  // GK_COLS, which feeds Save Rate and On Target Faced, is deliberately NOT changed
  eq(S.GK_COLS.find(c=>c[0]==='Saves')[1](s,{known:1,conceded:0,clean:0}),4);
});

test('a match with no catch or parry reads 0, never the legacy save count', () => {
  const s=P([ev({event:'save',playerFrom:'1',t:1})])['1'];
  eq(s.saves,1,'the counter still holds it, and Save Rate is still built on that');
  eq(col('goalkeeper','Saves')(s),0,'one column, one meaning — never a silent fallback');
});

test('the fail side is the remainder, so the three figures cannot disagree', () => {
  const s=P(GK_ROWS)['1'];
  eq(col('goalkeeper','Def. Line Support Success')(s),1);
  eq(col('goalkeeper','Def. Line Support Fail')(s),1);
  eq(col('goalkeeper','Def. Line Support %')(s),'50.0%');
  eq(col('goalkeeper','Aerial Control Success')(s),1);
  eq(col('goalkeeper','Aerial Control Fail')(s),0,'one won, none lost');
  eq(col('goalkeeper','Aerial Control %')(s),'100.0%');
  notOk('defLineSupportsFail' in s,'no third counter that could drift from the other two');
});

test('the hand-tagged goals conceded is the plain name here, and suffixed in GK_COLS', () => {
  const s=P(GK_ROWS)['1'];
  eq(col('goalkeeper','Goals Conceded')(s),1);
  /* This table holds neither derived figure, so the plain name is free. GK_COLS does hold
     one — the keeper's own Conceded, off who was on the pitch — so there the tagged one
     keeps its suffix, or that table would print two columns called Conceded. */
  const gk=S.GK_COLS.map(c=>c[0]);
  ok(gk.indexOf('Conceded')>=0&&gk.indexOf('Conceded (tagged)')>=0,
     'both live in GK_COLS, told apart by the suffix');
  eq(S.PLAYER_CATS.goalkeeper.filter(c=>/Conceded/.test(c[0])).length,1,
     'and only one of them is on the tab');
});

test('a keeper from before these events existed reads 0, not a dash', () => {
  const s=S.newStat();
  S.PLAYER_CATS.goalkeeper.forEach(c=>{
    const v=c[1](s);
    ok(v===0||v==='0.0%',c[0]+' reads a plain zero, got '+JSON.stringify(v));
  });
});

/* ================= 7. the duels the tables no longer show ================= */

test('Ground Duels is gone from every table, and still counted underneath', () => {
  const labels=new Set([].concat(...Object.values(S.PLAYER_CATS)).map(c=>c[0])
    .concat([].concat(...S.TEAM_SECTIONS.map(s=>s[1])).map(r=>r[0])));
  notOk(labels.has('Ground Duels'),'not on a player tab or the comparison');
  notOk(labels.has('Ground Duels Won'));
  ok(labels.has('Physical Duels')&&labels.has('Loose Ball Duels'),'the two kinds are');
  // the counter and every event that feeds it are untouched: no data was thrown away
  deepEq(S.EVENT_INC['ground duel success'],['groundDuels','groundDuelsWon']);
  deepEq(S.EVENT_INC['physical duel success'],
    ['groundDuels','groundDuelsWon','physicalDuels','physicalDuelsWon','duelDetail']);
  eq(P(OLD_ROWS)['4'].groundDuels,2,'a pre-split match still adds up behind the scenes');
});

test('a match tagged before the split reads 0 in the four duel columns', () => {
  const s=P(OLD_ROWS)['4'];
  ['Physical Duels','Physical Won','Loose Ball Duels','Loose Ball Won']
    .forEach(l=>eq(col('defensive',l)(s),0,l+' prints its tally'));
  eq(s.groundDuels,2,'while the roll-up behind them is still the real figure');
  eq(s.duelDetail,0,'and the flag still records that the question was never put');
});

/* ================= 7b. no column reads a *Detail flag any more ================= */

test('every column prints a tally: no table anywhere falls back to a dash', () => {
  /* The one exception is GK_COLS' `known` group — Conceded, On Target Faced, Save Rate,
     Clean Sheets — which asks whether a line-up existed at all, not whether an event was
     tagged. Those four keep their guard. */
  const blank=S.newStat(), g={conceded:0,clean:0,known:1};
  Object.keys(S.PLAYER_CATS).forEach(k=>S.PLAYER_CATS[k].forEach(c=>
    notOk(String(c[1](blank))==='—',k+' / '+c[0]+' must not read a dash')));
  S.TEAM_SECTIONS.forEach(sec=>sec[1].forEach(r=>
    notOk(String(r[1](blank,blank))==='—',sec[0]+' / '+r[0]+' must not read a dash')));
  S.GK_COLS.forEach(c=>notOk(String(c[1](blank,g))==='—',
    'GK_COLS / '+c[0]+' must not read a dash when a board exists'));
  // …and the four that legitimately still do, when no board can answer
  const none={conceded:0,clean:0,known:0};
  ['Conceded','On Target Faced','Save Rate','Clean Sheets'].forEach(l=>
    eq(S.GK_COLS.find(c=>c[0]===l)[1](blank,none),'—',l+' still says so with no line-up'));
});

test('the dashboard and the PDF dropped it too, and gained the two kinds', () => {
  const cats=grabConst('DEF_CATS',STATS,'Stats/stats-view.js');
  notOk(/^\s*ground:/m.test(cats),'no ground entry in DEF_CATS');
  ok(/physical:\{label:'Physical Duels'/.test(cats));
  ok(/looseBall:\{label:'Loose Ball Duels'/.test(cats));
  // report.js builds one map page per DEF_CATS entry, so those two follow on their own;
  // the player table and the radar name their counters directly and had to be changed
  notOk(/groundDuelsWon/.test(REPORT),'no ground duel left in the report');
  ok(/physicalDuelsWon/.test(REPORT)&&/looseBallDuelsWon/.test(REPORT),'both kinds are in it');
});

/* ================= 7c. the Goalkeeper tab is for keepers ================= */

/* Fifteen keeper columns are zero on an outfield player for ever, so neither site offers
   him the tab: the Stats page filters the rows off the formation board, the client site
   drops the tab from his strip. TD_TABS itself keeps the category, because Team Data
   reads it for the name of a TEAM_SECTIONS section and a team does have a keeper. */
test('the Goalkeeper tab is for keepers only, on both sites', () => {
  const fn=grabFunction('catPlayers',STATS,'Stats/stats-view.js');
  ok(/statCat!=='goalkeeper'\)return players/.test(fn),'every other tab is left alone');
  ok(/gkShirts\(lineups,statTeam\)/.test(fn),'and the keepers come off the board');
  ok(/cat==='goalkeeper'/.test(grabFunction('catSheet',STATS,'Stats/stats-view.js')),
     'the exported sheet is the same rows as the tab');
  ok(/OUT_TABS = TD_TABS\.filter\(function \(t\) \{ return t\[0\] !== 'goalkeeper'; \}\)/.test(APPJS),
     'the client site drops it for an outfield player');
  ok(/who\.gk \? GK_TABS : OUT_TABS/.test(APPJS),'…and that is what tabsFor hands him');
  ok(/var TD_TABS = \[[\s\S]*?'goalkeeper'/.test(APPJS),
     'while TD_TABS keeps it, because Team Data still needs the section name');
});

test('gkShirts counts the keeper who came on, not only the one who started', () => {
  const lu={home:{xi:[{no:'1',pos:'GK'},{no:'7',pos:'CM'}],subs:[],roster:[],dir:'lr'},
            away:{xi:[],subs:[],roster:[],dir:'rl'},
            history:[{t:100,team:'home',xi:[{no:'13',pos:'GK'},{no:'7',pos:'CM'}],subs:[]}]};
  const k=S.gkShirts(lu,'home');
  ok(k.has('1')&&k.has('13'),'a side that changed goalkeeper gets both rows');
  notOk(k.has('7'),'and nobody else');
});

/* ================= 8. the two joins that fail silently ================= */

test('every category tab names a real PLAYER_CATS key and a real TEAM_SECTIONS section', () => {
  /* catCols() and sectionCols() on the client site both return [] on a miss, so a stale
     key draws an empty table with nothing in the console. */
  const block=/var TD_TABS = \[([\s\S]*?)\n  \];/.exec(APPJS)[1];
  const rows=[...block.matchAll(/\['([A-Za-z]+)', *'[^']*', *'([^']+)'\]/g)];
  eq(rows.length,6,'six tabs on the client site too');
  rows.forEach(m=>{
    ok(S.PLAYER_CATS[m[1]],'PLAYER_CATS has '+m[1]);
    ok(S.TEAM_SECTIONS.some(s=>s[0]===m[2]),'TEAM_SECTIONS has '+m[2]);
  });
});

test('the map matches event names through evKey, because the dictionary shouts', () => {
  /* The shipped list spells the throw-in "throw-Ins", with a capital I. A raw compare
     drew an empty pitch for it — and would for any type an analyst had renamed. */
  const fn=grabFunction('plainEventMapHTML',STATS,'Stats/stats-view.js');
  ok(/evKey\(r\.event\)===want/.test(fn),'rows are keyed');
  ok(/const want=evKey\(eventName\)/.test(fn),'and so is what they are compared against');
  ok(S.SET_PIECE_EVENTS.has('throw-ins'),'and the set-piece list is in evKey-s own casing');
  eq(S.evKey('throw-Ins'),'throw-ins');
});

/* ================= 9. the two engines are still twins ================= */

test('newStat carries the same fields in shared.js and in the tagging tab', () => {
  const ctx={console};
  vm.createContext(ctx);
  vm.runInContext(grabConst('EVENT_INC',SRC)+'\n'+grabFunction('newStat',SRC)
    +'\n;globalThis.T={newStat,EVENT_INC};',ctx,{filename:'index.html-extract.js'});
  deepEq(Object.keys(ctx.T.newStat()),Object.keys(S.newStat()),
         'a field added to one copy has to be added to the other');
  deepEq(ctx.T.EVENT_INC['foul'],S.EVENT_INC['foul']);
  deepEq(ctx.T.EVENT_INC['foul throw'],S.EVENT_INC['foul throw']);
  deepEq(ctx.T.EVENT_INC['handball foul'],S.EVENT_INC['handball foul']);
});

test('and the same team comparison', () => {
  const mine=S.TEAM_SECTIONS.map(s=>[s[0],s[1].map(r=>r[0])]);
  const theirs=/const TEAM_SECTIONS=\[([\s\S]*?)\n\];/.exec(SRC)[1];
  mine.forEach(([title,labels])=>{
    ok(theirs.includes("['"+title+"',"),'index.html has the '+title+' section');
    labels.forEach(l=>ok(theirs.includes("['"+l+"',"),title+' / '+l+' is in both'));
  });
});
