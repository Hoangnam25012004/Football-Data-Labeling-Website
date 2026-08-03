/* Substitution / formation-history test cases.

   Regression under test (reported 2026-07-22): two players swapped in ONE entry at the
   same moment, but only one of them reached the formation. The second pair had been
   typed the wrong way round ("21sub13" while 13 was the one playing); applySubGroup()
   found no No.21 on the pitch, warned with a toast that the very next toast overwrote,
   and stored a snapshot in which that pair had simply not happened — while the events
   table and the period label both claimed it had.

   The fixture is that match: Saint Lucia, XI 1/2/4/6/7/8/11/13/14/15/17, bench 3/12/19/20/21.
*/
const {makeApp,submit}=require('./harness');
const {test,eq,deepEq,ok,notOk}=require('./tiny-test');

/* ---------------- fixture ---------------- */
const XI=[['1',92,50,'GK'],['2',75,72,'LB'],['4',75,45,'CB'],['6',75,28,'RB'],
          ['7',55,50,'CM'],['8',60,68,'LM'],['11',35,72,'LW'],['13',45,40,'CM'],
          ['14',20,50,'CF'],['15',60,30,'RM'],['17',40,25,'RW']];
const BENCH=['3','12','19','20','21'];
const ROSTER=[...XI.map(x=>x[0]),...BENCH].map(no=>({no,name:'P'+no}));

function fixture(over){
  const lu=team=>({
    xi:XI.map(([no,x,y,pos])=>({no,x,y,pos})),
    subs:BENCH.slice(),
    dir:team==='home'?'lr':'rl',
    roster:ROSTER.map(p=>({...p})),
  });
  return Object.assign({
    sport:'football',team:'home',rows:[],pendingDots:[],
    editingId:null,editingGroup:null,activeEvent:null,
    teamIds:{home:null,away:null,matchId:'m1',code:'m1'},
    duration:{enabled:false,halfLen:45,h1Start:0,h1End:0,h2Start:0,h2End:0},
    lineups:{home:lu('home'),away:lu('away'),history:[]},
  },over||{});
}
function app(over,now){return makeApp({state:fixture(over),now:now==null?600:now})}

// helpers that read the formation exactly the way the pitch panel does
const period=(a,i)=>a.state.lineups.history[i];
const xiOf=(a,t)=>a.effectiveLU(a.state.team,t).xi.map(x=>String(x.no)).sort((p,q)=>p-q);
const benchOf=(a,t)=>a.effectiveLU(a.state.team,t).subs.map(String).sort((p,q)=>p-q);
const onPitch=(a,t,no)=>xiOf(a,t).includes(String(no));
const rowText=a=>a.state.rows.map(r=>[r.playerFrom,r.event,r.playerTo].join(' ')).join(' | ');

/* ================= 1. the reported bug ================= */

test('double sub in one entry: BOTH pairs reach the formation', ()=>{
  const a=app(null,4834);
  submit(a,'7sub3*13sub21');
  eq(a.state.lineups.history.length,1,'one period for one entry');
  const t=5000;
  eq(xiOf(a,t).length,11,'XI stays at 11');
  notOk(onPitch(a,t,'7'),'7 came off');
  ok(onPitch(a,t,'3'),'3 came on');
  notOk(onPitch(a,t,'13'),'13 came off');
  ok(onPitch(a,t,'21'),'21 came on');
  deepEq(benchOf(a,t),['12','13','19','20','7'].sort((p,q)=>p-q),'bench holds both outgoing');
  eq(period(a,0).label,'Substitution: 7▼ 3▲, 13▼ 21▲');
  eq(a.state.lineups.home.subHistory.length,2,'both pairs counted for minutes played');
});

test('reported case: second pair typed back-to-front is corrected, not dropped', ()=>{
  const a=app(null,4834);
  submit(a,'7sub3*21sub13');            // 21 is on the bench, 13 is the one playing
  const t=5000;
  eq(a.state.lineups.history.length,1);
  eq(xiOf(a,t).length,11,'XI stays at 11 (used to become 12)');
  notOk(onPitch(a,t,'13'),'13 came off — the pair is no longer a silent no-op');
  ok(onPitch(a,t,'21'),'21 came on');
  eq(period(a,0).label,'Substitution: 7▼ 3▲, 13▼ 21▲','period label reads the right way round');
  eq(rowText(a),'7 substitution 3 | 13 substitution 21','the events table is corrected too');
  ok(a.log.toasts.join(' ').includes('swapped round 21▼13▲ → 13▼21▲'),'the correction is announced');
});

test('a pair whose OUT player is not on the pitch can never inflate the XI', ()=>{
  const a=app(null,4834);
  submit(a,'7sub3*20sub12');            // 20 AND 12 are both on the bench
  eq(a.state.lineups.history.length,0,'nothing written');
  eq(a.state.rows.length,0,'not even the valid pair — the entry is rejected as a whole');
  eq(a.log.alerts.length,1);
  ok(a.log.alerts[0].includes('No.20'),'the alert names the offending player');
});

/* ================= 2. single substitutions ================= */

test('single sub: OUT to the bench, IN takes its spot and zone', ()=>{
  const a=app(null,3000);
  submit(a,'7sub3');
  const t=3500;
  eq(xiOf(a,t).length,11);
  ok(onPitch(a,t,'3')); notOk(onPitch(a,t,'7'));
  const three=a.effectiveLU('home',t).xi.find(x=>x.no==='3');
  eq(three.x,55); eq(three.y,50,'inherits the outgoing player\'s spot');
  eq(three.pos,'CM','and its zone');
  eq(a.state.rows.length,1); eq(a.state.rows[0].grp,null,'a lone sub is not a group');
});

test('single sub typed back-to-front is corrected', ()=>{
  const a=app(null,3000);
  submit(a,'3sub7');                    // 3 is the substitute, 7 is playing
  eq(period(a,0).label,'Substitution: 7▼ 3▲');
  eq(rowText(a),'7 substitution 3');
  ok(onPitch(a,3500,'3')); notOk(onPitch(a,3500,'7'));
});

test('dots place the incoming player and set the time', ()=>{
  const a=app(null,3000);
  submit(a,'7sub3',[{x:30,y:60,t:2950}]);
  eq(period(a,0).t,2950,'the period starts at the dot, not at the video head');
  const three=a.effectiveLU('home',3000).xi.find(x=>x.no==='3');
  eq(three.x,30); eq(three.y,60);
  eq(a.state.rows[0].t,2950);
});

test('a 2nd-half dot is mirrored back to canonical (half-1) coordinates', ()=>{
  const a=app({duration:{enabled:true,halfLen:45,h1Start:0,h1End:2700,h2Start:3000,h2End:6000}},4000);
  submit(a,'7sub3',[{x:30,y:60,t:4000}]);
  const three=a.effectiveLU('home',4100).xi.find(x=>x.no==='3');
  eq(three.x,70,'x mirrored'); eq(three.y,40,'y mirrored');
});

test('wrong number of dots is refused before anything is written', ()=>{
  const a=app(null,3000);
  submit(a,'7sub3*13sub21',[{x:30,y:60,t:2950}]);   // 2 pairs, 1 dot
  eq(a.state.rows.length,0); eq(a.state.lineups.history.length,0);
  eq(a.log.alerts.length,1);
});

/* ================= 3. rejected entries ================= */

const rejects=[
  ['both players already on the pitch','7sub13'],
  ['neither player on the pitch','3sub12'],
  ['a player substituted for himself','7sub7'],
  ['the same player out twice','7sub3*7sub12'],
  ['the same player in twice','7sub3*13sub3'],
  ['the outgoing player also coming on','7sub3*3sub12'],
  ['no incoming player','7sub'],
  ['no numbers at all','sub'],
];
rejects.forEach(([why,raw])=>{
  test('rejected, with nothing written: '+why+' ("'+raw+'")', ()=>{
    const a=app(null,3000);
    submit(a,raw);
    eq(a.state.rows.length,0,'no event rows');
    eq(a.state.lineups.history.length,0,'no formation period');
    notOk(a.state.lineups.home.subHistory&&a.state.lineups.home.subHistory.length,'no minutes-played entry');
    eq(a.log.alerts.length,1,'the tagger is told, with an alert that cannot be missed');
  });
});

test('a valid double sub survives after a rejected one (no half-written state)', ()=>{
  const a=app(null,3000);
  submit(a,'7sub3*7sub12');             // rejected
  submit(a,'7sub3*13sub21');            // same moment, now correct
  eq(a.state.lineups.history.length,1);
  eq(xiOf(a,3500).length,11);
  ok(onPitch(a,3500,'3')&&onPitch(a,3500,'21'));
});

test('substitutions may not be mixed with other events', ()=>{
  const a=app(null,3000);
  submit(a,'7sub3s11');
  eq(a.state.rows.length,0);
  ok(a.log.alerts[0].includes('Do not mix a substitution'));
});

/* ================= 4. three pairs / repeated windows ================= */

test('three pairs in one entry', ()=>{
  const a=app(null,3000);
  submit(a,'7sub3*13sub21*8sub12');
  const t=3500;
  eq(xiOf(a,t).length,11);
  ['3','21','12'].forEach(n=>ok(onPitch(a,t,n),n+' on'));
  ['7','13','8'].forEach(n=>notOk(onPitch(a,t,n),n+' off'));
  eq(a.state.lineups.history.length,1,'still one period');
  eq(a.state.lineups.home.subHistory.length,3);
});

test('consecutive substitution windows build on each other', ()=>{
  const a=app(null,2700);
  submit(a,'7sub3');
  a.video.currentTime=4477; submit(a,'8sub19');
  a.video.currentTime=4834; submit(a,'13sub21*15sub12');
  const t=5200;
  eq(a.state.lineups.history.length,3);
  eq(xiOf(a,t).length,11);
  deepEq(xiOf(a,t),['1','2','3','4','6','11','12','14','17','19','21'].sort((p,q)=>p-q));
  ok(onPitch(a,3000,'7')===false&&onPitch(a,2600,'7'),'the earlier period is unchanged');
  ok(onPitch(a,4000,'8'),'8 still playing before its own window');
});

test('a player already substituted OFF cannot come off again', ()=>{
  const a=app(null,3000);
  submit(a,'7sub3');
  a.video.currentTime=4000; submit(a,'7sub12');
  eq(a.state.lineups.history.length,1,'the second entry is rejected');
  eq(a.state.rows.length,1);
  ok(a.log.alerts[0].includes('No.7'));
});

test('a substitute who came on can be taken off later', ()=>{
  const a=app(null,3000);
  submit(a,'7sub3');
  a.video.currentTime=4000; submit(a,'3sub12');
  eq(a.state.lineups.history.length,2);
  eq(xiOf(a,4500).length,11);
  notOk(onPitch(a,4500,'3')); ok(onPitch(a,4500,'12'));
  ok(onPitch(a,3500,'3'),'the first period still shows 3 playing');
});

/* ================= 5. tagging out of order ================= */

test('a sub tagged after a later one still shows up in every later period', ()=>{
  const a=app(null,4834);
  submit(a,'13sub21');                  // tagged first, happens late
  a.video.currentTime=2700; submit(a,'7sub3');   // rewound: an earlier sub tagged after
  eq(a.state.lineups.history.length,2);
  eq(period(a,0).t,2700,'periods stay in chronological order');
  ok(onPitch(a,3000,'3')&&!onPitch(a,3000,'7'),'earlier period correct');
  const late=5000;
  eq(xiOf(a,late).length,11);
  ok(onPitch(a,late,'3'),'the earlier sub is carried into the later period');
  notOk(onPitch(a,late,'7'));
  ok(onPitch(a,late,'21'),'and the later sub is still there');
});

/* ================= 6. editing an existing substitution ================= */

test('re-tagging a wrong sub replaces the formation period instead of stacking', ()=>{
  const a=app(null,3000);
  submit(a,'7sub3');
  a.startEdit(0);
  submit(a,'7sub12');                   // same OUT player, different substitute
  eq(a.state.lineups.history.length,1,'still ONE period');
  eq(period(a,0).label,'Substitution: 7▼ 12▲');
  eq(xiOf(a,3500).length,11);
  ok(onPitch(a,3500,'12')); notOk(onPitch(a,3500,'3'),'the first substitute is back on the bench');
  eq(a.state.lineups.home.subHistory.length,1,'minutes played updated, not duplicated');
  eq(rowText(a),'7 substitution 12');
});

test('re-tagging a two-pair entry rebuilds both pairs', ()=>{
  const a=app(null,3000);
  submit(a,'7sub3*13sub21');
  a.startEditGroup(a.state.rows.slice());
  submit(a,'7sub3*15sub12');
  eq(a.state.lineups.history.length,1);
  const t=3500;
  eq(xiOf(a,t).length,11);
  ok(onPitch(a,t,'3')&&onPitch(a,t,'12'));
  ok(onPitch(a,t,'13'),'13 is back on the pitch');
  notOk(onPitch(a,t,'21'),'21 is back on the bench');
});

test('editing a substitution into an ordinary event removes its formation period', ()=>{
  const a=app(null,3000);
  submit(a,'7sub3');
  a.startEdit(0);
  submit(a,'7s11',[{x:50,y:50,t:3000},{x:60,y:50,t:3000}]);
  eq(a.state.lineups.history.length,0,'the period is gone');
  eq(xiOf(a,3500).length,11);
  ok(onPitch(a,3500,'7'),'7 is playing again');
  eq(a.state.rows[0].event,'pass success');
});

test('an invalid edit leaves the original substitution untouched', ()=>{
  const a=app(null,3000);
  submit(a,'7sub3');
  a.startEdit(0);
  submit(a,'20sub12');                  // neither is on the pitch
  eq(a.log.alerts.length,1);
  eq(a.state.lineups.history.length,1,'the original period survives');
  eq(period(a,0).label,'Substitution: 7▼ 3▲');
  ok(onPitch(a,3500,'3'));
});

/* ================= 7. deleting ================= */

test('deleting a substitution row rolls the formation back', ()=>{
  const a=app(null,3000);
  submit(a,'7sub3');
  a.deleteRows(a.state.rows.slice());
  eq(a.state.lineups.history.length,0);
  eq(a.state.lineups.home.subHistory.length,0);
  ok(onPitch(a,3500,'7')); notOk(onPitch(a,3500,'3'));
});

test('deleting one window leaves the others intact, in both directions', ()=>{
  const a=app(null,2700);
  submit(a,'7sub3');
  a.video.currentTime=4834; submit(a,'13sub21');
  a.deleteRows(a.state.rows.filter(r=>r.playerFrom==='7'));
  eq(a.state.lineups.history.length,1);
  const t=5200;
  eq(xiOf(a,t).length,11);
  ok(onPitch(a,t,'7'),'the deleted sub is undone in the later period too');
  notOk(onPitch(a,t,'3'));
  ok(onPitch(a,t,'21'),'the surviving sub still applies');
});

test('deleting a two-pair entry removes both pairs at once', ()=>{
  const a=app(null,3000);
  submit(a,'7sub3*13sub21');
  a.deleteRows(a.state.rows.slice());
  eq(a.state.lineups.history.length,0);
  deepEq(xiOf(a,3500),XI.map(x=>x[0]).sort((p,q)=>p-q),'back to the starting XI');
});

/* ================= 8. neighbouring behaviour must not regress ================= */

test('ordinary chains still tag normally', ()=>{
  const a=app(null,1000);
  submit(a,'17j*c14dd',[{x:99,y:1,t:1000},{x:80,y:40,t:1002}]);
  eq(a.state.rows.length,3);
  deepEq(a.state.rows.map(r=>r.event),['corner-kick','cross success','shot on target']);
  eq(a.state.lineups.history.length,0,'no formation period for non-subs');
  eq(a.state.rows[0].grp,a.state.rows[2].grp,'one entry, one group');
});

test('a failed pass still asks for the extra recovery dot', ()=>{
  const a=app(null,1000);
  submit(a,'7ss',[{x:50,y:50,t:1000}]);
  eq(a.state.rows.length,0); eq(a.log.alerts.length,1);
  submit(a,'7ss',[{x:50,y:50,t:1000},{x:60,y:55,t:1001}]);
  eq(a.state.rows.length,1);
});

test('the away side keeps its own formation history', ()=>{
  const a=app(null,3000);
  submit(a,'7sub3');
  a.state.team='away';
  submit(a,'14sub19');
  eq(a.state.lineups.history.filter(h=>h.team==='home').length,1);
  eq(a.state.lineups.history.filter(h=>h.team==='away').length,1);
  a.state.team='home';
  ok(onPitch(a,3500,'3')&&onPitch(a,3500,'14'),'home is unaffected by the away sub');
  a.state.team='away';
  ok(onPitch(a,3500,'19')&&!onPitch(a,3500,'14'));
});

test('subs are still tagged when no starting XI has been entered', ()=>{
  const a=app(null,3000);
  a.state.lineups.home.xi=[];
  submit(a,'7sub3');
  eq(a.state.rows.length,1,'the event is recorded');
  eq(a.state.lineups.history.length,0,'but there is no formation to change');
  eq(a.log.alerts.length,0,'and the tagger is not blocked');
});

test('shirt numbers with stray spaces still match', ()=>{
  const a=app(null,3000);
  a.state.lineups.home.xi=a.state.lineups.home.xi.map(x=>x.no==='7'?{...x,no:' 7 '}:x);
  submit(a,'7sub3');
  eq(a.state.lineups.history.length,1);
  ok(onPitch(a,3500,'3'));
});


