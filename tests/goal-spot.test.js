/* Where the ball crossed the goal line.

   A #shot on target or #goal is now stored with the spot the ball went in at. Pressing
   Enter on such an entry does NOT write it: the formation panel turns into a goal mouth,
   the ball is dragged onto the spot, and the next Enter comes back through submitEntry
   with the spot and writes the rows. Esc backs out and leaves the entry and its dots
   alone. Nothing else in the app changes shape — every other event tags in one Enter.

   The spot is normalised to the MOUTH, not the pitch, so it means the same at any drawing
   size: x 0 = left post -> 100 = right post, y 0 = crossbar -> 100 = the goal line, both
   clamped to the frame because a shot on target is inside it by definition. */
const fs=require('fs'), path=require('path'), vm=require('vm');
const {makeApp,submit,submitShot,grabFunction,grabConst,SRC,CLOUD}=require('./harness');
const {test,eq,deepEq,ok,notOk}=require('./tiny-test');

function app(){
  return makeApp({state:{sport:'football',team:'home',rows:[],pendingDots:[],macros:{football:[]},
    lineups:{home:{xi:[],subs:[],roster:[]},away:{xi:[],subs:[],roster:[]},history:[]},
    duration:{enabled:false,h2Start:0},teamIds:{}}});
}
const dots=n=>Array.from({length:n},(_,i)=>({x:10+i*8,y:20+i*6,t:1}));

/* ================= the gate ================= */
test('a shot on target is not written until the ball has been placed', () => {
  const a=app();
  submit(a,'9dd',dots(1));
  eq(a.state.rows.length,0,'the first Enter writes nothing');
  eq(a.log.alerts.length,0,'and says nothing — the panel has become the goal');
  eq(a.state.pendingDots.length,1,'the dots are still there, waiting');
  a.submitEntry();                       // the confirming Enter
  eq(a.state.rows.length,1,'the second Enter writes it');
  deepEq(a.state.rows[0].gXY,{x:50,y:50},'the ball started in the middle of the mouth');
});

test('a goal is held the same way', () => {
  const a=app();
  submit(a,'9ddd',dots(1));
  eq(a.state.rows.length,0);
  a.submitEntry();
  eq(a.state.rows[0].event,'goal');
  ok(a.state.rows[0].gXY,'stored with a goal spot');
});

test('the ball goes where it was dragged', () => {
  const a=app();
  submitShot(a,'9dd',dots(1),{x:12.5,y:80});
  deepEq(a.state.rows[0].gXY,{x:12.5,y:80},'bottom-left corner, near post');
});

test('every other event still tags in one Enter', () => {
  [['2f',1,'foul'],['1s2',2,'pass success'],['9d',1,'shot off target'],
   ['9db',1,'blocked shot'],['13qq',1,'recovery']].forEach(([raw,n,name])=>{
    const a=app();
    submit(a,raw,dots(n));
    eq(a.state.rows.length,1,raw+' wrote straight away'+(a.log.alerts[0]?': '+a.log.alerts[0]:''));
    eq(a.state.rows[0].event,name);
    eq(a.state.rows[0].gXY,null,name+' carries no goal spot');
  });
});

test('one ball, one spot — it lands on the shot rows and nothing else', () => {
  const a=app();
  submitShot(a,'17j*c14dd',[{x:99,y:1,t:1},{x:80,y:40,t:1}],{x:70,y:20});
  deepEq(a.state.rows.map(r=>r.event),['corner-kick','cross success','shot on target']);
  eq(a.state.rows[0].gXY,null,'#corner-kick has none');
  eq(a.state.rows[1].gXY,null,'#cross success has none');
  deepEq(a.state.rows[2].gXY,{x:70,y:20},'only the shot carries it');
});

test('two shots in one entry share the one ball', () => {
  const a=app();
  submitShot(a,'9dd*ddd',dots(1),{x:44,y:66});
  deepEq(a.state.rows.map(r=>r.event),['shot on target','goal']);
  deepEq(a.state.rows[0].gXY,{x:44,y:66});
  deepEq(a.state.rows[1].gXY,{x:44,y:66},'the same shot went in — one place');
});

/* ================= it queues behind every other check ================= */
test('a wrong dot count is reported instead of opening the goal', () => {
  const a=app();
  submit(a,'1s2dd',dots(1));           // 2 touches, only 1 dot
  eq(a.state.rows.length,0);
  ok(/Check the dots/.test(a.log.alerts[0]),a.log.alerts[0]);
});

test('a missing receiver is reported instead of opening the goal', () => {
  const a=app();
  submit(a,'1s*dd',dots(1));
  eq(a.state.rows.length,0);
  ok(/needs a receiver/.test(a.log.alerts[0]),a.log.alerts[0]);
});

test('and a missing shirt number too', () => {
  const a=app();
  submit(a,'dd',dots(1));
  eq(a.state.rows.length,0);
  ok(/needs a shirt number/.test(a.log.alerts[0]),a.log.alerts[0]);
});

test('backing out leaves the entry and its dots exactly as they were', () => {
  const a=app();
  submit(a,'9dd',dots(1));
  a.closeGoalCapture();                       // what Esc does
  eq(a.state.rows.length,0,'still nothing written');
  eq(a.state.pendingDots.length,1,'the dot survived');
  eq(a.$('playerInput').value,'9dd','and so did the entry');
  a.submitEntry(); a.submitEntry();           // opens again, then confirms
  eq(a.state.rows.length,1,'and it can be tagged after all');
});

/* ================= the mouth's coordinate system ================= */
test('the mouth maps to the panel and back', () => {
  const a=app(), G=a.k.GOAL_VIEW;
  // the four corners of the mouth, and its middle
  [[0,0],[100,0],[0,100],[100,100],[50,50]].forEach(([x,y])=>{
    const p=a.goalToPct({x,y});
    const back=a.goalFromPct(p.left,p.top);
    ok(Math.abs(back.x-x)<1e-9&&Math.abs(back.y-y)<1e-9,'round trip at '+x+','+y);
  });
  // the middle of the mouth is the middle of the posts, horizontally
  eq(a.goalToPct({x:50,y:50}).left,(G.x+G.mw/2)/G.w*100);
});

test('a click outside the frame is pulled back onto it', () => {
  const a=app();
  deepEq(a.goalFromPct(0,0),{x:0,y:0},'above and left of the goal -> the top-left corner');
  deepEq(a.goalFromPct(100,100),{x:100,y:100},'below and right -> the bottom-right corner');
  const low=a.goalFromPct(50,99);      // on the grass, well under the crossbar
  eq(low.y,100,'never past the goal line');
  ok(low.x>0&&low.x<100);
});

test('the ball can be put in any corner of the mouth', () => {
  [[0,0],[100,0],[0,100],[100,100]].forEach(([x,y])=>{
    const a=app();
    submitShot(a,'9dd',dots(1),{x,y});
    deepEq(a.state.rows[0].gXY,{x,y});
  });
});

/* ================= re-editing ================= */
test('re-editing a shot starts the ball where it already is', () => {
  const a=app();
  submitShot(a,'9dd',dots(1),{x:20,y:30});
  const row=a.state.rows[0];
  a.state.editingId=row.id;                   // ✎ Edit on that row
  submit(a,'9dd',dots(1));                    // 1st Enter -> the goal opens, seeded
  a.submitEntry();                            // confirm without moving it
  deepEq(a.state.rows[0].gXY,{x:20,y:30},'the spot is kept, not reset to the middle');
  eq(a.state.rows.length,1,'and the row was updated in place');
});

/* ================= the database ================= */
// rowToDb / dbToRow lifted out of cloud-sync.js, as the other cloud tests do
function mapper(){
  const ctx={console,matchId:'m-1',toInt:v=>{const n=parseInt(v,10);return isNaN(n)?null:n;},
    PT:()=>({eventHalf:()=>1})};
  vm.createContext(ctx);
  vm.runInContext([grabFunction('rowToDb',CLOUD,'cloud-sync.js'),
                   grabFunction('dbToRow',CLOUD,'cloud-sync.js')].join('\n'),ctx);
  return ctx;
}
const baseRow={id:'r1',team:'home',event:'shot on target',action:'dd',playerFrom:'9',playerTo:'',
  pXY:{x:10,y:20},rXY:null,t:5,raw:'9dd',teamName:'Home',rt:null,grp:null,ord:0};

test('a placed shot carries goal_x / goal_y to the database', () => {
  const db=mapper().rowToDb(Object.assign({},baseRow,{gXY:{x:70,y:25}}));
  eq(db.goal_x,70); eq(db.goal_y,25);
});

test('an event with no spot does not name the columns at all', () => {
  // until migration 0012 has been run those columns do not exist, and PostgREST rejects
  // the whole statement when one is mentioned — so an ordinary event must not mention it
  const db=mapper().rowToDb(Object.assign({},baseRow,{event:'foul',gXY:null}));
  notOk('goal_x' in db,'goal_x is absent, not null');
  notOk('goal_y' in db,'goal_y is absent, not null');
  // …and everything it always sent is still there
  ['id','match_id','team','event_name','player_from','x','y','rx','ry','t_seconds','half','attributes']
    .forEach(k=>ok(k in db,k+' still sent'));
});

test('the spot comes back off the database', () => {
  const m=mapper();
  deepEq(m.dbToRow({id:'r1',t_seconds:5,team:'home',event_name:'goal',goal_x:12,goal_y:88}).gXY,
    {x:12,y:88});
  eq(m.dbToRow({id:'r1',t_seconds:5,team:'home',event_name:'foul'}).gXY,null,
    'no column yet, or never placed — both read as no spot');
});

test('the migration adds both columns and is safe to re-run', () => {
  const sql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','0012_event_goal_xy.sql'),'utf8');
  ok(/add column if not exists goal_x/.test(sql),'goal_x');
  ok(/add column if not exists goal_y/.test(sql),'goal_y');
  ok(/create index if not exists/.test(sql),'and the index is guarded too');
});

/* ================= wiring on the page ================= */
test('the panel holds a goal stage beside the formation, not instead of it', () => {
  const panel=SRC.slice(SRC.indexOf('<div id="formationPanel">'),SRC.indexOf('</div>\n  </div>'));
  ok(/id="fmPitch"/.test(panel),'the formation pitch is still there');
  ok(/id="goalStage"/.test(panel),'and the goal stage beside it');
  ok(/id="goalWrap"/.test(panel),'with the frame it draws into');
  // one class decides which of the two is on screen
  ok(/#formationPanel\.goal-on \.fm-stage[^}]*display:none/.test(SRC),'the pitch hides');
  ok(/#formationPanel\.goal-on \.goal-stage\{display:flex\}/.test(SRC),'and the goal shows');
});

test('the gate sits after every other check in submitEntry', () => {
  const fn=grabFunction('submitEntry');
  ok(/if\(shot&&!goalCapture\)\{/.test(fn),'held only when there is no spot yet');
  ok(fn.indexOf('Check the dots')<fn.indexOf('openGoalCapture'),'dots are checked first');
  ok(fn.indexOf('needs a receiver')<fn.indexOf('openGoalCapture'),'and the receiver rule');
  ok(fn.indexOf('openGoalCapture')<fn.indexOf('state.rows.push'),'and it is ahead of the write');
  ok(/closeGoalCapture\(\)/.test(fn),'the panel is handed back once the row lands');
});

test('Esc backs out of the goal before it can pop a dot', () => {
  const h=SRC.slice(SRC.indexOf("$('playerInput').addEventListener('keydown'"));
  const esc=h.indexOf("e.key==='Escape'&&goalCapture");
  const editEsc=h.indexOf("e.key==='Escape'&&(state.editingId");
  ok(esc>0,'the goal has its own Esc');
  ok(esc<editEsc,'ahead of the edit-mode one, so Esc never does both');
});

test('only a shot on target and a goal ask for a spot', () => {
  deepEq([...app().k.GOAL_SPOT_EVENTS].sort(),['goal','shot on target']);
});
