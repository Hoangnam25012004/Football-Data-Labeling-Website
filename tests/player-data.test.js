/* Player Data: the Data view's third section — one player, the whole campaign.

   The same reports Overview and Team Data add up, cut by the man rather than by
   the match. Two things are being pinned down here.

   The first is that there is no second implementation of anything: the columns
   are shared.js's own PLAYER_CATS, which is the array the Stats tab's per-player
   table draws from, and the minutes, the cards and the stat totals all go back
   through shared.js. A figure on a player's page and the same figure on the
   match page cannot disagree, because one function produces both.

   The second is what "an appearance" is, which is the only genuinely new rule
   here: a named substitute who never came on is not one.

   The arithmetic is EXECUTED — playerIndex, sumStats, playerCards and aggregate
   are lifted out of app.js by name and run in a vm against hand-written reports,
   the way tests/data-page.test.js runs discipline(). The rendering is read as
   source, as every other client test does: no build step, no DOM in the runner. */
const vm=require('vm');
const {test,eq,deepEq,ok,notOk}=require('./tiny-test');
const {grabFunction,readSrc,SHARED}=require('./harness');

const APPJS=readSrc('client/assets/app.js');
const APPCSS=readSrc('client/assets/app.css');
const VIEW=readSrc('Stats/stats-view.js');

const renderData=/function renderData\(view\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
const playerData=/function renderPlayerData\(body, rest\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
const playerList=/function renderPlayerList\(body, people\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
const profile=/function renderPlayerProfile\(body, who, people, wanted\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
const headCard=/function playerHead\(who, people, cat\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
const matchTable=/function playerMatchTable\(who, cat\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
const tabs=/function dataTabs\(open\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];

/* ---------- app.js's own helpers, running for real ----------
   shared.js first (the stat engine), then the named functions lifted out of
   app.js, as ONE script so their bindings can see each other. `window` is the
   handful of shared.js names app.js reaches through it. */
const LIFT=['playerIndex','sumStats','playerCards','minsTotal','minsOne','aggregate',
            'discipline','playerTally','totalOf','aggregates'];
function sandbox(state){
  const ctx={console,location:{hash:''},
    document:{getElementById:()=>null,addEventListener(){},removeEventListener(){}},
    localStorage:{getItem:()=>null,setItem(){}},window:{}};
  vm.createContext(ctx);
  vm.runInContext([SHARED,
    'window.newStat=newStat;window.classifyCards=classifyCards;window.computeStats=computeStats;',
    'window.sumTeam=sumTeam;window.squadNames=squadNames;window.playedMinutes=playedMinutes;',
    'var state='+JSON.stringify(state||{})+';',
    LIFT.map(n=>grabFunction(n,APPJS,'client/assets/app.js')).join('\n'),
    /* app.js declares with `var`, which grabConst does not scan for */
    /\n  var PL_COLS = \[[\s\S]*?\n  \];/.exec(APPJS)[0],
    ';globalThis.A={'+LIFT.join(',')+',PL_COLS,PLAYER_CATS,newStat,pct};'
  ].join('\n'),ctx,{filename:'client/assets/app.js-extract.js'});
  return ctx.A;
}
const A=sandbox();

/* ---------- fixtures ----------
   A line-up the way the tagger stores one: a starting XI, a bench, and the
   substitution history that says who came on for whom. */
const DUR={enabled:true,halfLen:45,h1Start:0,h1End:2700,h2Start:3000,h2End:5700};
function lineup(o){
  o=o||{};
  return {home:{roster:o.roster||[{no:'7',name:'Elva'},{no:'3',name:'Frederick'},{no:'9',name:'Nazon'}],
                xi:(o.xi||['7','9']).map(no=>({no,x:50,y:50})),
                subs:o.subs||['3','19'],dir:'lr',
                subHistory:o.subHistory||[]},
          away:{roster:[],xi:[],subs:[],dir:'rl'},
          history:o.history||[]};
}
/* one aggregate() result, hand-built: the shape the Data view reduces a match to */
function agg(o){
  o=o||{};
  return {m:Object.assign({slug:'m1',id:'m1',date:'2025-06-11',opponent:'Barbados',
                           side:'home',result:'W'},o.m||{}),
          gf:o.gf==null?2:o.gf, ga:o.ga==null?1:o.ga,
          us:A.newStat(), them:A.newStat(),
          players:o.players||{}, names:o.names||{},
          mins:o.mins===undefined?null:o.mins, cards:o.cards||{}};
}
function stat(o){return Object.assign(A.newStat(),o||{});}
const byKey=(list,k)=>list.filter(p=>p.key===k)[0];

/* ================= who is on the list, and under what name ================= */

test('a player is one entry across the campaign, even when his shirt changes', () => {
  const list=A.playerIndex([
    agg({m:{slug:'a',date:'2024-06-07'},players:{'14':stat({goals:1})},names:{'14':'Elva'}}),
    agg({m:{slug:'b',date:'2025-06-11'},players:{'9':stat({goals:2})},names:{'9':'Elva'}})
  ]);
  eq(list.length,1,'a call-up renumbers the squad; it does not make a second player');
  eq(list[0].key,'n:elva','tallied under the name');
  eq(list[0].no,'9','and shown in the shirt he wore most recently');
  eq(list[0].apps,2);
  eq(list[0].total.goals,3,'his goals are the campaign-s, not one match-s');
});

test('a shirt no squad names is still a player, under his number', () => {
  const list=A.playerIndex([agg({players:{'21':stat({assists:1})},names:{}})]);
  eq(list[0].key,'#21','nothing better is on record');
  eq(list[0].name,'Player 21','and shared.js-s own placeholder is what he is called');
});

test('the key rule is written the same way here as on the Key Players cards', () => {
  /* Two copies of one line, on purpose: playerTally() is where a test reads
     this rule from, so it cannot be pulled out into a helper. This is what
     catches the two drifting apart. */
  const rule=/nm \? 'n:' \+ nm\.toLowerCase\(\) : '#' \+ no/g;
  eq((APPJS.match(rule)||[]).length,2,
     'playerTally() and playerIndex() name a player by exactly the same rule');
  const idx=/function playerIndex\(aggs\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
  ok(rule.test(idx),'and one of the two is in playerIndex');
});

test('a shirt number is read the way shared.js reads one', () => {
  const list=A.playerIndex([agg({players:{' 7 ':stat({goals:1})},names:{'7':'Elva'}})]);
  eq(list.length,1);
  eq(list[0].key,'n:elva',"' 7 ' and '7' are one shirt, so the roster name is found");
});

/* ================= what counts as an appearance ================= */

test('a substitute who never came on is not an appearance', () => {
  /* 19 is on the bench and in no snapshot, so playedMinutes never returns him */
  const mins=A.aggregate ? null : null;
  const list=A.playerIndex([agg({
    players:{'7':stat({goals:1})},
    names:{'7':'Elva','19':'Unused'},
    mins:{'7':{min:90,sec:5400,h1:2700,h2:2700,exact:true,sentOff:false}}
  })]);
  eq(list.length,1,'the bench is not a match played');
  notOk(byKey(list,'n:unused'),'and he is nowhere on the page');
});

test('a substitute who came on and touched nothing IS one', () => {
  const list=A.playerIndex([agg({
    players:{'7':stat({goals:1})},
    names:{'7':'Elva','3':'Frederick'},
    mins:{'7':{min:64,sec:3840,h1:2700,h2:1140,exact:true,sentOff:false},
          '3':{min:26,sec:1560,h1:0,h2:1560,exact:true,sentOff:false}}
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
    players:{'7':stat({goals:1})},names:{'7':'Elva'},
    mins:{'7':{min:90,sec:5400,h1:2700,h2:2700,exact:true,sentOff:false}}
  })]);
  eq(list.length,1);
  eq(list[0].apps,1,'two ways of finding the same man is still one appearance');
});

test('most minutes first, and a tie is settled before the shirt is', () => {
  const list=A.playerIndex([agg({
    players:{'7':A.newStat(),'9':A.newStat(),'3':A.newStat()},
    names:{'7':'A','9':'B','3':'C'},
    mins:{'7':{min:90,sec:5400,h1:2700,h2:2700,exact:true},
          '9':{min:90,sec:5400,h1:2700,h2:2700,exact:true},
          '3':{min:12,sec:720,h1:0,h2:720,exact:true}}
  })]);
  deepEq(list.map(p=>p.no),['7','9','3'],'90, 90 then 12 — and the two 90s by shirt');
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
    agg({players:{'7':stat({totalShots:1,shotsOn:1})},names:{'7':'Elva'}}),          // 100%
    agg({m:{slug:'b'},players:{'7':stat({totalShots:9,shotsOn:1})},names:{'7':'Elva'}})  // 11.1%
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
    agg({players:{'7':A.newStat()},names:{'7':'Elva'},
         mins:{'7':{min:64,sec:3840,h1:2700,h2:1140,exact:true}}}),
    agg({m:{slug:'b'},players:{'7':A.newStat()},names:{'7':'Elva'},
         mins:{'7':{min:90,sec:5400,h1:2700,h2:2700,exact:true}}})
  ]);
  eq(list[0].min,154,'64 + 90 — the two numbers on the screen');
  eq(A.minsTotal(list[0]),"154'");
});

test('one match without its Duration boundaries marks the whole total', () => {
  const list=A.playerIndex([
    agg({players:{'7':A.newStat()},names:{'7':'Elva'},
         mins:{'7':{min:90,sec:5400,h1:2700,h2:2700,exact:true}}}),
    agg({m:{slug:'b'},players:{'7':A.newStat()},names:{'7':'Elva'},
         mins:{'7':{min:83,sec:4980,h1:4980,h2:0,exact:false}}})
  ]);
  eq(A.minsTotal(list[0]),"~173'",'the ~ is the same mark the Stats tab puts on an estimate');
});

test('one match cell reads exactly as the Stats tab-s does', () => {
  eq(A.minsOne(null),'<td>—</td>','no line-up says nothing, never 0');
  ok(/>90'<\/td>/.test(A.minsOne({min:90,h1:2700,h2:2700,exact:true})));
  ok(/1st 45' · 2nd 45'/.test(A.minsOne({min:90,h1:2700,h2:2700,exact:true})),
     'with the halves on hover');
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
  const c=A.playerCards(CARD_ROWS,'home');
  deepEq(c['7'],{y:2,r:1},'two yellows, one red — and the red row tagged with it adds nothing');
  deepEq(c['4'],{y:0,r:1});
  notOk(c['9'],'the opposition-s card is not ours');
});

test('a player-s cards add up to what the club-s card count says', () => {
  const B=sandbox({reports:{m1:{rows:CARD_ROWS}}});
  const team=B.discipline([{uuid:'m1',side:'home'}]);
  const per=B.playerCards(CARD_ROWS,'home');
  const y=Object.keys(per).reduce((n,k)=>n+per[k].y,0);
  const r=Object.keys(per).reduce((n,k)=>n+per[k].r,0);
  eq(y,team.yellow,'the same yellows the Overview shows');
  eq(r,team.red,'and the same reds');
});

test('the campaign card count is every match added up', () => {
  const list=A.playerIndex([
    agg({players:{'7':A.newStat()},names:{'7':'Elva'},cards:{'7':{y:1,r:0}}}),
    agg({m:{slug:'b'},players:{'7':A.newStat()},names:{'7':'Elva'},cards:{'7':{y:2,r:1}}})
  ]);
  deepEq(list[0].cards,{y:3,r:1});
});

/* ================= what it must not touch ================= */

test('reading a campaign by player changes nothing about reading it by match', () => {
  const shared=stat({goals:1,passes:10});
  const aggs=[agg({players:{'7':shared},names:{'7':'Elva'},
    mins:{'7':{min:90,sec:5400,h1:2700,h2:2700,exact:true}}})];
  const before=JSON.stringify(aggs);
  const tallyBefore=JSON.stringify(A.playerTally(aggs));

  A.playerIndex(aggs);

  eq(JSON.stringify(aggs),before,
     'no stat object app.js did not make is written to — withSquad() would have mutated this one');
  eq(JSON.stringify(A.playerTally(aggs)),tallyBefore,'so the Key Players cards read what they always did');
  eq(shared.goals,1,'and the match-s own figures are untouched');
});

test('aggregate() hands the new view its two fields without disturbing the old ones', () => {
  const rows=[{t:100,team:'home',playerFrom:'7',event:'goal'},
              {t:200,team:'home',playerFrom:'7',event:'Yellow Card'},
              {t:300,team:'away',playerFrom:'5',event:'pass success',playerTo:'6'}];
  const B=sandbox({reports:{u1:{rows:rows,lineups:lineup(),dur:DUR}}});
  const a=B.aggregate({uuid:'u1',side:'home',home:{score:2},away:{score:1}});
  ok(a.us&&a.them,'the two team columns are still there');
  ok(a.players['7'],'and the per-player figures Key Players reads');
  eq(a.players['7'].goals,1);
  ok(a.mins&&a.mins['7'],'plus who was on the pitch');
  eq(a.mins['7'].min,90);
  deepEq(a.cards['7'],{y:1,r:0},'and who was booked');
  eq(a.names['7'],'Elva');
});

test('a match with no line-up gives no minutes rather than a column of zeroes', () => {
  const B=sandbox({reports:{u1:{rows:[{t:1,team:'home',playerFrom:'7',event:'goal'}],lineups:null,dur:null}}});
  const a=B.aggregate({uuid:'u1',side:'home',home:{score:1},away:{score:0}});
  eq(a.mins,null,'playedMinutes says nothing can be said');
  ok(a.players['7'],'the events are still read');
});

/* ================= the columns ================= */

test('the four categories are shared.js-s, and the Stats tab draws the same array', () => {
  deepEq(Object.keys(A.PLAYER_CATS),['shooting','distribution','defensive','other']);
  ok(/const PLAYER_CATS=\{/.test(SHARED),'the definition lives in shared.js');
  ok(/const STAT_CATS=PLAYER_CATS;/.test(VIEW),
     'and Stats/stats-view.js points its own name at it — one array, two readers');
  notOk(/const STAT_CATS=\{/.test(VIEW),'the literal it used to hold is gone, not copied');
  notOk(/PLAYER_CATS *= *\{|STAT_CATS *= *\{/.test(APPJS),'and app.js defines no column set of its own');
});

test('every column is a label and a function of ONE stat object', () => {
  Object.keys(A.PLAYER_CATS).forEach(cat=>{
    A.PLAYER_CATS[cat].forEach(c=>{
      eq(typeof c[0],'string',cat+' has a label');
      eq(typeof c[1],'function',cat+'/'+c[0]+' is a function');
      const v=c[1](A.newStat());
      ok(typeof v==='number'||typeof v==='string',cat+'/'+c[0]+' reads on a zero row: '+v);
    });
  });
});

test('a category the URL invented falls back rather than drawing an empty table', () => {
  ok(/TD_TABS\.some\(function \(t\) \{ return t\[0\] === wanted; \}\) \? wanted : 'shooting'/.test(profile),
     '#/data/player/<key>/nonsense opens Shooting');
  const cols=/function catCols\(cat\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
  ok(/typeof PLAYER_CATS === 'undefined'/.test(cols),
     'and shared.js failing to load draws an empty table, not an exception');
});

test('the five summary columns of the list are the ones a squad is read by', () => {
  deepEq(A.PL_COLS.map(c=>c[0]),['Apps','Minutes','Goals','Assists','Key Passes']);
  const p=A.playerIndex([agg({players:{'7':stat({goals:2,assists:1,keyPasses:3})},names:{'7':'Elva'},
    mins:{'7':{min:90,sec:5400,h1:2700,h2:2700,exact:true}}})])[0];
  deepEq(A.PL_COLS.map(c=>c[1](p)),[1,"90'",2,1,3]);
});

/* ================= the route ================= */

test('Data is three sections now, and which one is open is still in the URL', () => {
  ok(/\['overview', 'Overview'\], \['team', 'Team Data'\], \['player', 'Player Data'\]/.test(tabs),
     'three tabs, in that order');
  ok(/location\.hash = '#\/data\/' \+ t\[0\];/.test(tabs),'a tab click is a hash change');
  ok(/var onPlayer = rest\[0\] === 'player';/.test(renderData),'the hash decides');
  ok(/if \(onPlayer\) renderPlayerData\(body, rest\);/.test(renderData),'and one of the three is drawn');
  ok(/else if \(onTeam\) renderTeamData\(body, cat\); else renderOverview\(body\);/.test(renderData),
     'the other two are reached exactly as they were');
  // route() lights the rail off parts[0], so the deeper route must not unlight Data
  const route=/function route\(\)[\s\S]*?\n  \}/.exec(APPJS)[0];
  ok(/parts\[0\] === 'data'/.test(route),'#/data/player/... still lights Data on the rail');
});

test('a player is a link somebody can send, and a dead one lands somewhere real', () => {
  ok(/encodeURIComponent\(p\.key\)/.test(headCard),'the dropdown encodes the key it puts in the hash');
  ok(/esc\(encodeURIComponent\(p\.key\)\)/.test(playerList),
     'and the list row encodes it for the URL, then escapes it for the attribute it travels in');
  ok(/decodeURIComponent\(rest\[1\]\)/.test(playerData),'which is read back the same way');
  ok(/if \(key && !who\) \{ location\.replace\('#\/data\/player'\); return; \}/.test(playerData),
     'a key from another channel goes back to the list, and replaces rather than stacks');
});

test('the profile keeps the category while it changes player', () => {
  ok(/'#\/data\/player\/' \+ encodeURIComponent\(p\.key\) \+ '\/' \+ cat/.test(headCard),
     'comparing two players on Defensive should not drop back to Shooting');
  ok(/catTabs\(cat, '#\/data\/player\/' \+ encodeURIComponent\(who\.key\) \+ '\/'\)/.test(profile),
     'and the chips are the same four, pointed at this player');
  const cat=/function catTabs\(cat, base\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
  ok(/\(base \|\| '#\/data\/team\/'\) \+ t\[0\]/.test(cat),
     'Team Data keeps its own route through the same builder');
});

/* ================= what is drawn ================= */

test('the match table is Team Data-s five fixed columns, with minutes for possession', () => {
  ok(/<th class="c-date">Date<\/th>/.test(matchTable)&&/<th class="c-opp">vs<\/th>/.test(matchTable)&&
     /<th class="c-res">Result<\/th>/.test(matchTable)&&/<th class="c-sc">Score<\/th>/.test(matchTable)&&
     /<th>Minutes Played<\/th>/.test(matchTable),'all five, in that order');
  notOk(/Possession/.test(matchTable),'possession is a team measure and is not one of them');
  notOk(/Rating/.test(matchTable),'and nothing here invents a number no other page can show');
  ok(/who\.matches\.slice\(\)\.reverse\(\)/.test(matchTable),'most recent match first');
  ok(/tr data-go=/.test(matchTable),'a row still opens the match it came from');
});

test('the campaign row is a foot, and its percentages come off the summed stat', () => {
  ok(/<tfoot>/.test(matchTable),'a total belongs under the column it totals');
  ok(/c\[1\]\(who\.total\)/.test(matchTable),'run on the sum, never summed from the cells');
  notOk(/class="tot"/.test(matchTable),'and it is not the row Team Data took off its own table');
  notOk(/tr\.tot/.test(APPCSS),'nothing styles that row either');
});

test('a club is its name here too', () => {
  notOk(/crest|monogram/i.test(playerList+profile+headCard+matchTable),
        'no badge is drawn beside an opponent or a player');
  ok(/esc\(m\.opponent\)/.test(matchTable),'the vs column is who it was');
});

test('every empty state says whose move it is', () => {
  ok(/No submitted analysis to read/.test(playerData)&&/Submit Analysis/.test(playerData),
     'no report yet');
  ok(/never came on is not an appearance/.test(playerList),
     'and the list says what it is counting, since that is the one rule a reader cannot guess');
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
        'and still not the spreadsheet library or the renderers — PLAYER_CATS is in shared.js for exactly this reason');
  ok(/HNA\.reports/.test(src),'one read of the reports feeds all three sections');
});

/* ================= layout ================= */

test('the shirt and the name stay put while the stats scroll', () => {
  const css=APPCSS.replace(/\s*\n\s*/g,'');
  ok(/table\.stbl \.c-no\{[^}]*position:sticky/.test(css),'the number is frozen');
  ok(/table\.stbl \.c-pl\{position:sticky; left:58px/.test(css),
     'and the name sits exactly where the number ends');
  /* the match table's own rule is left first and whole inside this block: it is
     the line tests/data-page.test.js reads to know that table lets go too */
  ok(/@media \(max-width:720px\)\{table\.stbl \.c-date, table\.stbl \.c-opp\{position:static\}/.test(css),
     'the match table still lets go where there is no width to spare');
  ok(/@media \(max-width:720px\)\{[^@]*table\.stbl \.c-no, table\.stbl \.c-pl\{position:static\}/.test(css),
     'and the player list lets go beside it');
  ok(/table\.stbl tfoot td\{/.test(css),'and the total row is styled as one');
});

test('the player header is a card with the switcher on its end', () => {
  const css=APPCSS.replace(/\s*\n\s*/g,'');
  ok(/\.pl-id\{display:flex/.test(css)&&/\.pl-id \.menu-wrap\{margin-left:auto\}/.test(css),
     'name on the left, the way to another player on the right');
  ok(/\.pl-id \.menu\{max-height:52vh; overflow-y:auto\}/.test(css),
     'a squad of thirty does not run off the bottom of the screen');
  ok(/menu-wrap/.test(headCard)&&/document\.removeEventListener\('click', away\)/.test(headCard),
     'and the menu takes its document listener off with it, as the channel one does');
});
