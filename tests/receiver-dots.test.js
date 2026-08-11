/* What every row is allowed to carry into the database.

   The events table showed "2 #pass success" with no receiver, and that row reached Supabase
   with rx,ry NULL — a completed pass to nowhere. TRAILING_EXTRA_DOT held only the FAIL
   variants, so it was the only thing ever demanding a second dot; a pass/cross SUCCESS that
   ended without a receiver needed no extra dot and was written with rXY:null.

   The rules, checked on the events as they are SPLIT into rows (not on the typed text, so a
   chain cannot smuggle a half-formed one through in the middle):
     - every event names the player who did it            -> x,y always stored
     - #pass success / #cross success name the receiver    -> rx,ry from the receiver's dot
     - #pass fail / #cross fail keep the trailing extra dot, and must be last to get it
   Substitutions are in neither set and keep their own dot-optional rule. */
const {makeApp,submit,grabFunction,grabConst,EVENTS}=require('./harness');
const {test,eq,deepEq,ok,notOk}=require('./tiny-test');
const vm=require('vm');

const TRANSFER=['pass success','pass fail','cross success','cross fail'];
function app(active){
  return makeApp({state:{sport:'football',team:'home',rows:[],pendingDots:[],macros:{football:[]},
    activeEvent:active||null,
    lineups:{home:{xi:['1','2','3','7','9','10','11','13','14','17'],subs:['21'],roster:[]},
             away:{xi:[],subs:[],roster:[]},history:[]},
    duration:{enabled:false,h2Start:0},teamIds:{}}});
}
const dots=n=>Array.from({length:n},(_,i)=>({x:10+i*7,y:20+i*5,t:1}));
// submit `raw` with n dots; returns {rows written, first alert}
function tag(raw,n,active){
  const a=app(active);
  submit(a,raw,dots(n));
  // An entry holding a shot on target / goal is kept back for its goal spot: the first
  // Enter opens the goal mouth, the second writes the rows. These tests are about the
  // receiver rule, so the ball is left in the middle and the entry just confirmed.
  // Nothing written and nothing said is the gate — a refusal always raises an alert.
  if(!a.state.rows.length&&!a.log.alerts.length)a.submitEntry();
  return {rows:a.state.rows,alert:a.log.alerts[0]||'',app:a};
}

/* ================= refused: no shirt number ================= */
test('an event with no shirt number is refused — nothing is stored without a player', () => {
  ['f','s','qq'].forEach(raw=>{
    const r=tag(raw,1);
    eq(r.rows.length,0,raw+' wrote nothing');
    ok(/needs a shirt number/.test(r.alert),raw+': '+r.alert);
  });
  // and with no dot either, which used to write x,y AND rx,ry all NULL
  const r=tag('s',0);
  eq(r.rows.length,0);
  ok(/needs a shirt number/.test(r.alert),r.alert);
});

/* ================= refused: a successful pass to nobody ================= */
test('the reported bug: every way to type a receiver-less success is refused', () => {
  // one cause, five entries — this is why the guard reads the split events, not the text
  [['2s','pass success'],   // the entry in the screenshot
   ['2c','cross success'],
   ['s2','pass success'],   // key before the number
   ['1k*c','cross success'],// last in a '*' group
   ['1s*s2','pass success'] // buried mid-entry, where no extra dot could ever reach it
  ].forEach(([raw,name])=>{
    [1,2,3].forEach(n=>{                       // no number of dots buys its way past
      const r=tag(raw,n);
      eq(r.rows.length,0,raw+' with '+n+' dot(s) wrote nothing');
      ok(r.alert.startsWith('#'+name+' needs a receiver'),raw+': '+r.alert);
    });
  });
});

test('the active-event path is held to it too', () => {
  const r=tag('9',1,'pass success');           // "9" + the active event, no receiver
  eq(r.rows.length,0);
  ok(/needs a receiver/.test(r.alert),r.alert);
  const ok2=tag('9 10',2,'pass success');      // naming one is enough
  eq(ok2.rows.length,1);
  eq(ok2.rows[0].playerTo,'10');
  ok(!!ok2.rows[0].rXY,'rx,ry stored');
});

/* ================= refused: a receiver on an event that cannot have one =================
   The mirror of the rule above. When a '*' group is followed by a number, parseChain hands
   that number to the last event that TRANSFERS the ball — and, failing that, to the last
   event in the group, whatever it is. So "9ddd*f3" stored #foul with player_to = 3 and a
   receiver dot: a number the heat map counts as 3's touch and the report reads as a real
   pass target. Only a pass, a cross or a substitution may be followed by a number. */
test('an event that cannot be played to is refused the number that follows it', () => {
  [['9ddd3','goal'],                  // a goal "scored to" the next player
   ['1xx2','ground duel fail'],       // a lost duel "played to" the winner
   ['13f*yc2','yellow card'],         // last in a '*' group, none of which transfers
   ['9j*ddd3','goal']                 // …even with another non-transfer event ahead of it
  ].forEach(([raw,name])=>{
    [0,1,2,3].forEach(n=>{            // no number of dots buys its way past
      const r=tag(raw,n);
      eq(r.rows.length,0,raw+' with '+n+' dot(s) wrote nothing');
      ok(r.alert.startsWith('#'+name+' cannot be played to anyone'),raw+': '+r.alert);
    });
  });
});

test('the message says whose action still needs an entry', () => {
  ok(/Tag what 3 did as its own entry/.test(tag('9ddd3',2).alert));
});

test('a macro is held to it too — the shorthand cannot smuggle one in', () => {
  const a=makeApp({state:{sport:'football',team:'home',rows:[],pendingDots:[],
    macros:{football:[{key:'gr',events:['goal','foul']}]},
    lineups:{home:{xi:[],subs:[],roster:[]},away:{xi:[],subs:[],roster:[]},history:[]},
    duration:{enabled:false,h2Start:0},teamIds:{}}});
  submit(a,'9gr3',dots(2));
  eq(a.state.rows.length,0,'nothing written');
  ok(/^#foul cannot be played to anyone/.test(a.log.alerts[0]),a.log.alerts[0]);
});

test('the active-event path is held to it as well', () => {
  const r=tag('9 3',2,'goal');        // two numbers + an event that transfers nothing
  eq(r.rows.length,0);
  ok(/#goal cannot be played to anyone/.test(r.alert),r.alert);
});

test('a group that DOES transfer the ball is untouched', () => {
  // the transfer event takes the number; its group-mates stay solo, exactly as before
  const r=tag('1k*c2',2);
  eq(r.alert,'');
  deepEq(r.rows.map(x=>[x.event,x.playerFrom,x.playerTo].join('|')),
    ['free-kick|1|','cross success|1|2']);
  const s=tag('17j*c14dd',2);         // transfer in the middle of the group
  eq(s.alert,'');
  deepEq(s.rows.map(x=>x.playerTo),['','14','']);
});

/* ================= refused: a failed pass that can never get its dot ================= */
test('a receiver-less failed pass buried mid-entry is refused', () => {
  const r=tag('1ss*ss2',2);
  eq(r.rows.length,0);
  ok(/has to be the last event in the entry/.test(r.alert),r.alert);
});

/* ================= unchanged: the fail rule ================= */
test('#pass fail keeps the trailing extra dot, exactly as before', () => {
  const r=tag('7ss',2);
  eq(r.rows.length,1);
  eq(r.rows[0].event,'pass fail');
  eq(r.rows[0].playerTo,'','no receiver is named — the ball reached nobody');
  ok(!!r.rows[0].rXY,'but rx,ry mark where it ended up');
  // still refuses the wrong dot count, with the message it always had
  const short=tag('7ss',1);
  eq(short.rows.length,0);
  ok(/opponent won the ball/.test(short.alert),short.alert);
});

test('#pass fail may still name who ended up with it', () => {
  const r=tag('7ss3',2);
  eq(r.rows.length,1);
  eq(r.rows[0].playerTo,'3');
  ok(!!r.rows[0].rXY);
});

/* ================= unchanged: everything that was already right ================= */
test('the entries the syntax is built around still tag', () => {
  const cases=[['2s3',2,1],['1s2s3s4',4,3],['1k*c2',2,2],['17j*c14dd',2,3],
               ['2f',1,1],['13f*yc*rc',1,3],['13qq',1,1]];
  cases.forEach(([raw,n,rows])=>{
    const r=tag(raw,n);
    eq(r.rows.length,rows,raw+' -> '+rows+' row(s)'+(r.alert?' ('+r.alert+')':''));
    eq(r.alert,'',raw+' raised nothing');
  });
});

test('substitutions are untouched — still dot-optional, still no receiver rule', () => {
  [['7sub3',0],['7sub3',1],['7sub3*13sub21',0],['7sub3*13sub21',2]].forEach(([raw,n])=>{
    const r=tag(raw,n);
    ok(r.rows.length>0,raw+' with '+n+' dot(s) tagged'+(r.alert?': '+r.alert:''));
    eq(r.alert,'',raw+' raised nothing');
  });
});

/* ================= the property the database cares about ================= */
test('INVARIANT: every stored row has x,y — and every ball-moving one has rx,ry', () => {
  // the whole accepted matrix, swept for the two things Supabase is asked to hold
  const accepted=[['2s3',2],['7ss',2],['7ss3',2],['1s2s3s4',4],['1k*c2',2],['17j*c14dd',2],
                  ['2f',1],['13f*yc*rc',1],['13qq',1],['7sub3',1],['7sub3*13sub21',2]];
  let checked=0;
  accepted.forEach(([raw,n])=>{
    tag(raw,n).rows.forEach(r=>{
      checked++;
      ok(!!r.pXY,raw+' -> #'+r.event+' has x,y');
      if(TRANSFER.includes(r.event))
        ok(!!r.rXY,raw+' -> #'+r.event+' has rx,ry');
      if(['pass success','cross success'].includes(r.event))
        ok(!!r.playerTo,raw+' -> #'+r.event+' names its receiver');
      // …and the other way round: a receiver on anything else is the row that must not exist
      if(r.playerTo)
        ok(TRANSFER.concat('substitution').includes(r.event),
           raw+' -> #'+r.event+' must not carry a receiver');
    });
  });
  ok(checked>=18,'swept '+checked+' rows');
});

test('INVARIANT: nothing that would break it can be written at all', () => {
  // every refused shape, at every plausible dot count, writes zero rows
  ['2s','2c','s2','1k*c','1s*s2','1ss*ss2','f','s','qq'].forEach(raw=>
    [0,1,2,3].forEach(n=>eq(tag(raw,n).rows.length,0,raw+' + '+n+' dot(s)')));
});

/* ================= the double-click event cell ================= */
// editEventCell swaps the NAME of an existing row; it cannot invent dots, so it must not be
// able to rename a row into a ball-moving event it has no receiver for
function cell(row){
  const log={alerts:[],upserts:[],renders:0};
  let inp=null;
  const td={textContent:'',appendChild(n){inp=n}};
  const ctx={console,log,
    state:{sport:'football',rows:[row]},
    curEvents:()=>EVENTS.football,
    document:{createElement:()=>({value:'',className:'',style:{},focus(){},select(){}})},
    renderTable(){log.renders++},
    window:{Cloud:{onLocalUpsert:r=>log.upserts.push(r)}},
    alert:m=>log.alerts.push(m),
  };
  vm.createContext(ctx);
  vm.runInContext([grabConst('TRAILING_EXTRA_DOT'),grabConst('NEEDS_RECEIVER'),
    grabFunction('eventForKey'),grabFunction('editEventCell')].join('\n'),ctx);
  return {log,retype(key){ctx.editEventCell(td,0);inp.value=key;inp.onblur();}};
}
const oneDotRow=extra=>Object.assign(
  {id:'r1',event:'foul',action:'f',playerFrom:'7',playerTo:'',pXY:{x:10,y:20},rXY:null},extra||{});

test('a 1-dot row cannot be renamed into a successful pass', () => {
  const row=oneDotRow(), c=cell(row);
  c.retype('s');
  eq(row.event,'foul','the row is left exactly as it was');
  eq(row.action,'f');
  ok(/#pass success needs a receiver and a second dot/.test(c.log.alerts[0]),c.log.alerts[0]);
});

test('nor into a failed pass, which also needs its dot', () => {
  const row=oneDotRow(), c=cell(row);
  c.retype('ss');
  eq(row.event,'foul');
  ok(/#pass fail needs the dot where the ball ended up/.test(c.log.alerts[0]),c.log.alerts[0]);
});

test('a row that HAS both is free to become one', () => {
  const row=oneDotRow({playerTo:'9',rXY:{x:80,y:40}}), c=cell(row);
  c.retype('s');
  eq(row.event,'pass success','allowed — the receiver and the dot are both there');
  eq(row.action,'s');
  eq(c.log.alerts.length,0);
});

test('renaming between ordinary events is untouched', () => {
  const row=oneDotRow(), c=cell(row);
  c.retype('yc');
  eq(row.event,'yellow card');
  eq(row.action,'yc');
  eq(c.log.alerts.length,0,'no new obstacle in the way of a normal correction');
  ok(c.log.upserts.length>0,'and it still syncs');
});

test('an unknown hotkey still says so', () => {
  const row=oneDotRow(), c=cell(row);
  c.retype('zzz');
  eq(row.event,'foul');
  ok(/No event is bound to hotkey "zzz"/.test(c.log.alerts[0]),c.log.alerts[0]);
});
