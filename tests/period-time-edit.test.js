/* Editing a formation period's start time must move the substitution it came from.

   Reported: "18sub17" landed in the events table at 45:00.62. In Formation by time the
   period's start was double-clicked and set to 45:00.00 — the swap happened at the
   interval, before the second half kicked off. The period moved; the event row stayed at
   45:00.62. The two are one moment shown twice, and everything downstream reads the ROW:
   which half the swap belongs to, minutes played, and finding the row again to delete it.

   A period covers one entry's worth of pairs, so a triple swap has to move as one. */
const {makeApp,submit,SRC}=require('./harness');
const {test,eq,deepEq,ok,notOk}=require('./tiny-test');

/* ---------------- fixture: the reported match ---------------- */
const XI=[['1',92,50],['2',75,72],['4',75,45],['7',55,50],['9',20,50],['10',35,72],
          ['13',45,40],['14',60,30],['18',40,25],['20',30,60],['22',65,55]];
const BENCH=['11','16','17','21'];
const ROSTER=[...XI.map(x=>x[0]),...BENCH].map(no=>({no,name:'P'+no}));
// half-time whistle 47:00 on the video clock, second half kicking off at 60:00
const DUR={enabled:true,halfLen:45,h1Start:0,h1End:2820,h2Start:3600,h2End:6500};
function app(now){
  const lu=team=>({xi:XI.map(([no,x,y])=>({no,x,y})),subs:BENCH.slice(),
    dir:team==='home'?'lr':'rl',roster:ROSTER.map(p=>({...p}))});
  return makeApp({now,state:{sport:'football',team:'home',rows:[],pendingDots:[],
    editingId:null,editingGroup:null,activeEvent:null,
    teamIds:{home:null,away:null,matchId:'m1',code:'m1'},
    duration:DUR,lineups:{home:lu('home'),away:lu('away'),history:[]}}});
}
const per=a=>a.state.lineups.history[0];
const subRows=a=>a.state.rows.filter(r=>r.event==='substitution')
  .slice().sort((x,y)=>x.t-y.t);
const times=a=>subRows(a).map(r=>+r.t.toFixed(2));
// move period 0 to a new video time, the way the modal's commit does
const moveTo=(a,newT)=>{const h=per(a),old=h.t;h.t=newT;
  return a.shiftSubRowsWithPeriod(h,old,newT);};

/* ================= the reported case ================= */
test('a single swap: the event row follows the period', () => {
  const a=app(2700.62);                    // tagged at 45:00.62 on the video clock
  submit(a,'18sub17');
  eq(times(a)[0],2700.62,'the row starts where it was tagged');
  eq(per(a).t,2700.62,'and so does its period');
  eq(moveTo(a,2700),1,'one row moved');
  eq(times(a)[0],2700,'the events table now agrees with the period');
  eq(per(a).t,2700);
});

test('the row is what the halves and the report read, so it has to be right', () => {
  const a=app(2900);                       // tagged in the half-time break
  submit(a,'18sub17');
  moveTo(a,3600);                          // corrected to the second-half kick-off
  eq(a.eventHalf(subRows(a)[0]),2,'the row is a 2nd-half row now, not a 1st-half one');
  eq(a.state.lineups.home.subHistory[0].t,3600,'minutes played moved with it');
});

/* ================= 2 and 3 players in one entry ================= */
test('a double swap moves as one, both rows', () => {
  const a=app(2700.62);
  submit(a,'18sub17*10sub11');
  eq(a.state.lineups.history.length,1,'one period for one entry');
  eq(moveTo(a,2700),2,'both rows moved');
  deepEq(times(a),[2700,2700],'both land on the new time');
  eq(a.state.lineups.home.subHistory.length,2);
  deepEq(a.state.lineups.home.subHistory.map(s=>s.t),[2700,2700]);
});

test('a triple swap moves as one, all three rows', () => {
  const a=app(2700.62);
  submit(a,'18sub17*10sub11*20sub21');
  eq(moveTo(a,3600),3);
  deepEq(times(a),[3600,3600,3600]);
});

test('dots placed at different moments keep their spacing inside the entry', () => {
  const a=app(2700);
  // one dot per pair, tagged 0.5s and 2s after the first
  submit(a,'18sub17*10sub11*20sub21',
    [{x:40,y:25,t:2700.62},{x:35,y:72,t:2701.12},{x:30,y:60,t:2702.62}]);
  eq(per(a).t,2700.62,'the period sits on the earliest pair');
  eq(moveTo(a,2700),3);
  deepEq(times(a),[2700,2700.5,2702],'earliest lands exactly, the rest keep their offsets');
  eq(per(a).t,2700,'and the period still matches the earliest');
});

/* ================= only the right rows move ================= */
test('a second substitution elsewhere in the match is untouched', () => {
  const a=app(2700.62);
  submit(a,'18sub17');
  a.video.currentTime=4500; submit(a,'9sub16');
  eq(a.state.lineups.history.length,2);
  const early=a.state.lineups.history[0], old=early.t;
  early.t=2700;
  eq(a.shiftSubRowsWithPeriod(early,old,2700),1,'only the one that period covers');
  deepEq(times(a),[2700,4500],'the later swap stayed put');
});

test('ordinary events sitting at the same second are not dragged along', () => {
  const a=app(2700.62);
  submit(a,'18sub17');
  submit(a,'7s10',[{x:50,y:50,t:2700.7},{x:40,y:40,t:2700.9}]);
  moveTo(a,2700);
  const pass=a.state.rows.find(r=>r.event==='pass success');
  eq(+pass.t.toFixed(2),2700.7,'the pass keeps its own time');
});

test('the other team\'s swap at the same second is not dragged along', () => {
  const a=app(2700.62);
  submit(a,'18sub17');
  a.setTeam('away'); submit(a,'18sub17'); a.setTeam('home');
  const home=a.state.lineups.history.find(h=>h.team==='home'), old=home.t;
  home.t=2700;
  eq(a.shiftSubRowsWithPeriod(home,old,2700),1,'one side only');
  const away=a.state.rows.filter(r=>r.team==='away'&&r.event==='substitution');
  eq(+away[0].t.toFixed(2),2700.62,'the away row kept its time');
});

test('a red-card period carries no rows to move', () => {
  const a=app(2700.62);
  submit(a,'18rc',[{x:40,y:25,t:2700.62}]);   // a card is placed on the pitch, unlike a sub
  const h=a.state.lineups.history[0];
  ok(h&&!/^Substitution/.test(h.label||''),'it is a red-card period');
  eq(a.shiftSubRowsWithPeriod(h,h.t,2700),0,'nothing moved, nothing thrown');
});

/* ================= robustness ================= */
test('setting the same time again is a no-op', () => {
  const a=app(2700.62);
  submit(a,'18sub17');
  eq(a.shiftSubRowsWithPeriod(per(a),2700.62,2700.62),0);
  eq(times(a)[0],2700.62);
});

test('a period whose rows were already deleted moves nothing', () => {
  const a=app(2700.62);
  submit(a,'18sub17');
  a.state.rows.length=0;
  eq(moveTo(a,2700),0,'no rows, no throw');
});

test('a second edit still lands the row exactly — it self-heals stale data', () => {
  const a=app(2700.62);
  submit(a,'18sub17');
  per(a).t=2700;                       // the old bug: period moved, row left behind
  eq(times(a)[0],2700.62);
  eq(moveTo(a,2760),1);
  eq(times(a)[0],2760,'anchored on the row, so it lands exactly and the drift is gone');
});

test('a time cannot be pushed below zero', () => {
  const a=app(30);
  submit(a,'18sub17');
  moveTo(a,0);
  eq(times(a)[0],0);
});

test('the moved rows are pushed to the cloud', () => {
  const a=app(2700.62);
  submit(a,'18sub17*10sub11');
  a.log.upserts.length=0;
  moveTo(a,2700);
  eq(a.log.upserts.length,2,'one upsert per moved row');
  deepEq(a.log.upserts.map(r=>+r.t.toFixed(2)),[2700,2700]);
});

/* ================= the wiring =================
   The commit path is DOM-bound; this guards that it still calls the helper and
   still re-renders the table afterwards (which is what persists the rows). */
test('the modal\'s time editor moves the rows and re-renders the table', () => {
  const body=/function fmEditPeriodTime\(([\s\S]*?)\n}/.exec(SRC)[1];
  ok(/const oldT=h\.t/.test(body),'the old time is captured before the change');
  ok(/shiftSubRowsWithPeriod\(h,oldT,h\.t\)/.test(body),'the rows are moved');
  ok(/renderTable\(\)/.test(body),'and the table is re-rendered, which saves them');
  ok(body.indexOf('shiftSubRowsWithPeriod')<body.indexOf('saveLineups'),
     'rows move before the lineups are saved');
});
