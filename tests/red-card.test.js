/* Red-card / formation test cases.

   Reported 2026-07-24: a red card for No.13 left the formation at 11 — the sending-off
   never dropped the player from the pitch. A red card must now append a formation
   snapshot removing him (11 -> 10) WITHOUT putting him on the bench, exactly the way a
   substitution appends its snapshot, and undo cleanly on delete / re-tag.
*/
const {makeApp,submit}=require('./harness');
const {test,eq,deepEq,ok,notOk}=require('./tiny-test');

/* fixture: the away team from the screenshot — XI 1/2/3/4/6/8/9/10/12/13/7, bench 14/11/17/22 */
const XI=[['1',92,50,'GK'],['2',75,72,'RB'],['3',60,25,'CF'],['4',75,45,'CB'],['6',55,50,'CM'],
          ['8',45,40,'CM'],['9',25,30,'CF'],['10',30,70,'LW'],['12',40,80,'LM'],['13',68,30,'CB'],
          ['7',20,55,'RW']];
const BENCH=['14','11','17','22'];
const ROSTER=[...XI.map(x=>x[0]),...BENCH].map(no=>({no,name:'P'+no}));

function fixture(over){
  const lu=team=>({
    xi:XI.map(([no,x,y,pos])=>({no,x,y,pos})),
    subs:BENCH.slice(), dir:team==='home'?'lr':'rl',
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
function app(over,now){return makeApp({state:fixture(over),now:now==null?3600:now})}

const period=(a,i)=>a.state.lineups.history[i];
const xiOf=(a,t)=>a.effectiveLU(a.state.team,t).xi.map(x=>String(x.no)).sort((p,q)=>p-q);
const benchOf=(a,t)=>a.effectiveLU(a.state.team,t).subs.map(String).sort((p,q)=>p-q);
const onPitch=(a,t,no)=>xiOf(a,t).includes(String(no));
const rowText=a=>a.state.rows.map(r=>[r.playerFrom,r.event,r.playerTo].filter(Boolean).join(' ')).join(' | ');
// a card is a located event now: one pitch dot per shirt number, at the current video time
// (where the card was shown / the foul that earned it happened)
function card(a,raw,t){
  t=t==null?a.video.currentTime:t;
  const n=(raw.match(/\d+/g)||[]).length;
  submit(a,raw,Array.from({length:n},(_,i)=>({x:40+i*8,y:50,t})));
}

/* ================= 1. the reported bug ================= */

test('the reported case: a red card drops the XI to 10 and removes the player', ()=>{
  const a=app(null,3600);
  card(a,'13rc');
  eq(a.state.lineups.history.length,1,'one formation period is created');
  const t=3700;
  eq(xiOf(a,t).length,10,'ten players on the pitch (was staying 11)');
  notOk(onPitch(a,t,'13'),'No.13 is off the pitch');
  notOk(benchOf(a,t).includes('13'),'and NOT on the bench — he is sent off, not substituted');
  eq(period(a,0).label,'Red card: 13🟥');
  eq(a.state.rows.length,1); eq(a.state.rows[0].event,'red card');
});

test('a red card inside a chain (foul + 2nd yellow + red) still sends the player off', ()=>{
  const a=app(null,3600);
  submit(a,'13f*yc*rc',[{x:60,y:40,t:3600}]);   // the foul carries the chain's one dot
  deepEq(a.state.rows.map(r=>r.event),['foul','yellow card','red card']);
  const t=3700;
  eq(xiOf(a,t).length,10);
  notOk(onPitch(a,t,'13'));
  eq(a.state.lineups.history.length,1,'one snapshot, not three');
  eq(period(a,0).off,'13');
});

/* ================= 2. only real on-pitch sendings-off change the shape ================= */

test('a red card for a bench player leaves the pitch untouched', ()=>{
  const a=app(null,3600);
  card(a,'14rc');                          // 14 is a substitute
  eq(a.state.rows.length,1,'the event is still recorded');
  eq(a.state.lineups.history.length,0,'but no formation period');
  eq(xiOf(a,3700).length,11);
});

test('a red card with no starting XI records the event and leaves the formation alone', ()=>{
  const a=app(null,3600);
  a.state.lineups.home.xi=[];
  card(a,'13rc');
  eq(a.state.rows.length,1);
  eq(a.state.lineups.history.length,0);
});

test('the same player red-carded twice never creates a second snapshot', ()=>{
  const a=app(null,3600);
  card(a,'13rc');
  a.video.currentTime=3800; card(a,'13rc');
  eq(a.state.lineups.history.length,1);
  eq(xiOf(a,3900).length,10);
});

/* ================= 3. two sendings-off ================= */

test('two red cards take the XI down to 9', ()=>{
  const a=app(null,3600);
  card(a,'13rc');
  a.video.currentTime=3800; card(a,'9rc');
  eq(a.state.lineups.history.length,2);
  const t=3900;
  eq(xiOf(a,t).length,9);
  notOk(onPitch(a,t,'13')); notOk(onPitch(a,t,'9'));
  ok(onPitch(a,3700,'9'),'9 was still on before his own card');
});

/* ================= 4. tagging out of order ================= */

test('a red card carries through a substitution snapshot tagged earlier', ()=>{
  const a=app(null,3600);
  // a sub happens LATER in the match but is tagged first
  a.video.currentTime=4000; submit(a,'6sub14');
  a.video.currentTime=3600; card(a,'13rc');   // earlier red card, tagged after
  eq(a.state.lineups.history.length,2);
  const late=4100;
  eq(xiOf(a,late).length,10,'still 10 after both the sub and the earlier red card');
  notOk(onPitch(a,late,'13'),'the red card is carried into the later sub period');
  ok(onPitch(a,late,'14'),'the substitute is on');
  notOk(onPitch(a,late,'6'),'the subbed player is off');
});

test('a red card BEFORE a later sub: the sub still applies on the 10 men', ()=>{
  const a=app(null,3600);
  card(a,'13rc');
  a.video.currentTime=4000; submit(a,'6sub14');
  const t=4100;
  eq(xiOf(a,t).length,10);
  ok(onPitch(a,t,'14')&&!onPitch(a,t,'6')&&!onPitch(a,t,'13'));
});

/* ================= 5. deleting ================= */

test('deleting a red card row brings the player back and restores 11', ()=>{
  const a=app(null,3600);
  card(a,'13rc');
  a.deleteRows(a.state.rows.slice());
  eq(a.state.lineups.history.length,0);
  eq(xiOf(a,3700).length,11);
  ok(onPitch(a,3700,'13'));
});

test('deleting a red card restores the player in a later sub period too', ()=>{
  const a=app(null,3600);
  card(a,'13rc');
  a.video.currentTime=4000; submit(a,'6sub14');
  a.deleteRows(a.state.rows.filter(r=>r.event==='red card'));
  const t=4100;
  eq(xiOf(a,t).length,11,'11 again once the red card is undone');
  ok(onPitch(a,t,'13'),'13 is back in the later period');
  ok(onPitch(a,t,'14')&&!onPitch(a,t,'6'),'the surviving sub still applies');
});

test('deleting the red card out of a chain keeps the foul/yellow but restores the XI', ()=>{
  const a=app(null,3600);
  card(a,'13f*yc*rc');
  a.deleteRows(a.state.rows.slice());       // the whole chain
  eq(a.state.lineups.history.length,0);
  eq(xiOf(a,3700).length,11);
});

/* ================= 6. editing ================= */

test('re-tagging a red card onto a different player moves the sending-off', ()=>{
  const a=app(null,3600);
  card(a,'13rc');
  a.startEdit(0);
  card(a,'9rc');
  eq(a.state.lineups.history.length,1,'still one period');
  const t=3700;
  eq(xiOf(a,t).length,10);
  ok(onPitch(a,t,'13'),'13 is back on');
  notOk(onPitch(a,t,'9'),'9 is now the one off');
  eq(period(a,0).off,'9');
  eq(rowText(a),'9 red card');
});

test('editing a red card into an ordinary event restores the XI', ()=>{
  const a=app(null,3600);
  card(a,'13rc');
  a.startEdit(0);
  submit(a,'13qq',[{x:50,y:50,t:3600}]);    // recovery (qq) — a located event needs its dot
  eq(a.state.lineups.history.length,0,'the sending-off snapshot is gone');
  eq(xiOf(a,3700).length,11);
  ok(onPitch(a,3700,'13'));
  eq(a.state.rows[0].event,'recovery');
});

/* ================= 7. interaction with the sub bug fix (must not regress) ================= */

test('a substitution still drops the outgoing player to the bench (not sent off)', ()=>{
  const a=app(null,3600);
  submit(a,'6sub14');
  const t=3700;
  eq(xiOf(a,t).length,11,'a sub keeps the XI at 11');
  ok(benchOf(a,t).includes('6'),'the outgoing player IS on the bench (unlike a red card)');
});

test('a red card then a substitution: 10 men, and the sub does not re-add the sent-off player', ()=>{
  const a=app(null,3600);
  card(a,'13rc');
  a.video.currentTime=3800; submit(a,'6sub14');
  const t=3900;
  eq(xiOf(a,t).length,10);
  notOk(onPitch(a,t,'13'),'still off');
  notOk(benchOf(a,t).includes('13'),'never on the bench');
});

test('the away side keeps its own sendings-off', ()=>{
  const a=app(null,3600);
  card(a,'13rc');
  a.state.team='away';
  card(a,'9rc');
  a.state.team='home';
  eq(xiOf(a,3700).length,10); notOk(onPitch(a,3700,'13'));
  a.state.team='away';
  eq(xiOf(a,3700).length,10); notOk(onPitch(a,3700,'9')); ok(onPitch(a,3700,'13'));
});

/* ================= 8. a card MUST be placed on the pitch (only subs are dot-free) ======= */

test('a red card with no dot is rejected — nothing written', ()=>{
  const a=app(null,3600);
  submit(a,'13rc');                          // no dot
  eq(a.state.rows.length,0,'no event row');
  eq(a.state.lineups.history.length,0,'no formation period');
  eq(a.log.alerts.length,1,'the tagger is told a dot is needed');
  ok(onPitch(a,3700,'13'),'13 is still on the pitch');
});

test('a yellow card with no dot is rejected too', ()=>{
  const a=app(null,3600);
  submit(a,'13yc');
  eq(a.state.rows.length,0);
  eq(a.log.alerts.length,1);
});

test('a card chain (foul+yellow+red) with no dot is rejected', ()=>{
  const a=app(null,3600);
  submit(a,'13f*yc*rc');                     // one touch, no dot
  eq(a.state.rows.length,0);
  eq(a.state.lineups.history.length,0);
  eq(a.log.alerts.length,1);
});

test('a card WITH its dot is accepted and keeps the dot as the event location', ()=>{
  const a=app(null,3600);
  card(a,'13rc');
  eq(a.state.rows.length,1);
  ok(a.state.rows[0].pXY,'the red card row carries a pitch coordinate');
  eq(a.state.lineups.history.length,1,'and the formation drops to 10');
});
