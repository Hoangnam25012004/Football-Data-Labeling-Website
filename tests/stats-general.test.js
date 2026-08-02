/* Stats tab → General: the match-summary timeline and the bench under each formation.

   Substitutions are on the timeline as a red ▼ / green ▲ pair. Several players swapped
   at the same moment must read as ONE marker badged x2 / x3 — a row of identical arrows
   at the same minute is what the reference layout avoids — so the grouping rule is what
   these tests pin down: the pairs of one entry ("38sub6*27sub43") share a group id and
   always land together, and separate entries join them when they fall in the same minute
   of the same half.

   The bench listed under each formation is the squad as NAMED before kick-off
   (lineups[team].subs), to match the starting XI drawn above it. */
const {loadStats}=require('./harness');
const {test,eq,deepEq,ok,notOk}=require('./tiny-test');

const NAMES={funcs:['matchTime','eventHalf','teamGoals','scoreBarHTML','subMarkers',
  'matchSummaryHTML','pitchSVGV','benchListHTML','formationSideHTML'],
  consts:['SUMMARY_EVENTS']};
// 45-minute halves, the 2nd starting at video 2760 -> match second = 2700 + (t - 2760)
const DUR={enabled:true,halfLen:45,h1Start:0,h1End:2760,h2Start:2760,h2End:5700};
const sub=(team,t,off,on,grp)=>({id:'s'+t+off,t,team,event:'substitution',
  playerFrom:off,playerTo:on,grp:grp==null?null:grp});
const load=(rows,lineups)=>loadStats({rows,lineups:lineups||{},dur:DUR,
  meta:{home:'Haiti',away:'Saint Lucia',sport:'football'}},NAMES);
// markers in timeline order, as "team@minute xN" (minute as the timeline labels it:
// match second 2940 = 49:00 played = the 50th minute)
const shape=P=>P.subMarkers().sort((a,b)=>a.half-b.half||a.sec-b.sec)
  .map(m=>m.team+'@'+(Math.floor(m.sec/60)+1)+"' x"+m.pairs.length);

/* ================= grouping ================= */
test('three pairs typed as ONE entry are one marker badged x3', () => {
  const P=load([sub('home',3600,'9','7','g1'),sub('home',3605,'10','21','g1'),
                sub('home',3610,'14','22','g1')]);
  deepEq(shape(P),["home@60' x3"]);
  deepEq(P.subMarkers()[0].pairs,
    [{off:'9',on:'7'},{off:'10',on:'21'},{off:'14',on:'22'}],'off/on kept per pair, in order');
});

test('two SEPARATE entries in the same minute still read as one x2', () => {
  const P=load([sub('away',3000,'12','3'),sub('away',3020,'17','6')]);
  deepEq(shape(P),["away@50' x2"]);
});

test('subs a few minutes apart stay separate markers', () => {
  const P=load([sub('home',3000,'12','3'),sub('home',3600,'9','7')]);
  deepEq(shape(P),["home@50' x1","home@60' x1"]);
});

test('the two teams never share a marker', () => {
  const P=load([sub('home',3000,'12','3'),sub('away',3010,'17','6')]);
  deepEq(shape(P).sort(),["away@50' x1","home@50' x1"]);
});

test('one entry stays together even when its dots straddle the minute mark', () => {
  // 44:58 and 45:02 of the second half — same entry, so the later pair follows the first
  const P=load([sub('home',5458,'9','7','g1'),sub('home',5462,'10','21','g1')]);
  deepEq(shape(P),["home@90' x2"],'one marker, at the FIRST swap of the window');
});

test('a marker sits at the first swap of its window', () => {
  const P=load([sub('home',3610,'14','22','g1'),sub('home',3600,'9','7','g1')]);
  eq(P.subMarkers()[0].sec,3540,'video 3600 -> match second 3540 (minute 60)');
});

test('half and minute are read through the Duration settings', () => {
  const P=load([sub('home',600,'9','7'),sub('home',3600,'10','21')]);
  deepEq(P.subMarkers().map(m=>m.half),[1,2]);
});

/* ================= what counts as a substitution ================= */
test('event names are matched case-insensitively (evKey convention)', () => {
  const rows=[sub('home',3600,'9','7')]; rows[0].event='Substitution';
  deepEq(shape(load(rows)),["home@60' x1"]);
});

test('rows with no team or no timestamp are ignored, not crashed on', () => {
  const rows=[sub('','',  '5','8'),sub('home',3600,'9','7')];
  rows[0].team=''; rows[1].t=3600;
  rows.push({id:'nt',team:'home',event:'substitution',playerFrom:'2',playerTo:'3',t:null});
  deepEq(shape(load(rows)),["home@60' x1"]);
});

test('non-substitution events produce no sub markers', () => {
  const P=load([{id:'g',t:120,team:'home',event:'goal',playerFrom:'9',playerTo:''}]);
  deepEq(P.subMarkers(),[]);
});

/* ================= the rendered timeline ================= */
test('the timeline draws both arrows, and xN only when it means something', () => {
  const svg=load([sub('home',3600,'9','7','g1'),sub('home',3605,'10','21','g1'),
                  sub('away',4500,'12','3')]).matchSummaryHTML();
  ok(/polygon points="-5\.5,8/.test(svg),'the player going off: red ▼');
  ok(/polygon points="5\.5,-8/.test(svg),'the player coming on: green ▲');
  eq((svg.match(/>x2</g)||[]).length,1,'the double swap is badged');
  notOk(/>x1</.test(svg),'a single swap carries no badge');
});

test('goals and cards still share the timeline with substitutions', () => {
  const svg=load([{id:'g',t:120,team:'home',event:'goal',playerFrom:'9',playerTo:''},
                  {id:'y',t:900,team:'home',event:'yellow card',playerFrom:'18',playerTo:''},
                  sub('home',3600,'9','7')]).matchSummaryHTML();
  eq((svg.match(/<g transform="translate/g)||[]).length,3,'one marker each');
  ok(/⚽/.test(svg)&&/Haiti/.test(svg));
});

test('who went off for whom is spelled out on hover', () => {
  const svg=load([sub('home',3600,'9','7','g1'),sub('home',3605,'10','21','g1')]).matchSummaryHTML();
  ok(/<title>60' 9 ▼ 7 ▲ · 10 ▼ 21 ▲<\/title>/.test(svg));
});

test('a match with substitutions but no goals or cards still gets a timeline', () => {
  const svg=load([sub('home',3600,'9','7')]).matchSummaryHTML();
  notOk(/No goals, cards or substitutions yet/.test(svg),'not the empty state');
  ok(/polygon/.test(svg));
});

test('nothing tagged at all -> the empty note, not a bare axis', () => {
  ok(/No goals, cards or substitutions yet/.test(load([]).matchSummaryHTML()));
});

/* ================= the bench under each formation ================= */
const LU={home:{dir:'lr',roster:[{no:'7',name:'Picault'},{no:'21',name:'Alcenat'},{no:'11',name:''}],
    xi:[{no:'1',x:6,y:50}],subs:['7','21','11']},
  away:{dir:'rl',roster:[{no:'3',name:'Thomas'}],xi:[{no:'1',x:6,y:50}],subs:['3']}};

test('every named substitute is listed, with his number and registered name', () => {
  const h=load([],LU).benchListHTML('home');
  eq((h.match(/gf-sno/g)||[]).length,3);
  ok(/>7<\/span><span class="gf-snm">Picault</.test(h));
  ok(/gf-bcnt">3</.test(h),'and counted');
});

test('a substitute with no registered name still gets his chip', () => {
  ok(/>11<\/span><span class="gf-snm"><\/span>/.test(load([],LU).benchListHTML('home')));
});

test('the chips carry their own side, so home and away keep their colours', () => {
  const P=load([],LU);
  ok(/gf-sub home/.test(P.benchListHTML('home')));
  ok(/gf-sub away/.test(P.benchListHTML('away')));
});

test('no bench named -> a note, not an empty strip', () => {
  const lu={home:{dir:'lr',roster:[],xi:[{no:'1',x:6,y:50}],subs:[]}};
  ok(/No substitutes named/.test(load([],lu).benchListHTML('home')));
});

test('a team with no lineup at all does not throw', () => {
  ok(/No substitutes named/.test(load([],{}).benchListHTML('home')));
});

test('the bench sits inside the formation panel — with or without a starting XI', () => {
  const P=load([],LU);
  ok(/gf-bench/.test(P.formationSideHTML('home')),'under the pitch');
  const noXI={home:{dir:'lr',roster:LU.home.roster,xi:[],subs:['7']}};
  const h=load([],noXI).formationSideHTML('home');
  ok(/No starting lineup yet/.test(h)&&/gf-bench/.test(h),'and still there when no XI is set');
});
