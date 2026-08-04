/* Macros: one hotkey standing for a run of events.

   The Event modal now holds two separate tables. "Event types" is unchanged — one hotkey,
   one event. "Macro" is the new one: a code like "qs" stands for the events you would
   otherwise type as "qq*s", so "1qs2" tags #recovery + #pass success 1->2 in one go.

   A macro is stored as the list of event NAMES it stands for (not their hotkeys), so
   re-keying an event — or picking the dictionary up from the cloud — leaves it pointing
   at the same events. Expansion happens inside parseChain, at the exact spot the key was
   typed, which is what keeps chains, '*' groups and the ball-carrier rule working. */
const {makeApp,submit,grabFunction,SRC,EVENTS}=require('./harness');
const {test,eq,deepEq,ok,notOk}=require('./tiny-test');
const vm=require('vm');

const RECOVERY_PASS=[{key:'qs',events:['recovery','pass success']}];
function app(macros,rows){
  return makeApp({state:{sport:'football',team:'home',rows:rows||[],pendingDots:[],
    macros:{football:macros||[]},
    lineups:{home:{xi:[],subs:[],roster:[]},away:{xi:[],subs:[],roster:[]},history:[]},
    duration:{enabled:false,h2Start:0},teamIds:{}}});
}
const shape=evs=>evs.map(e=>[e.name,e.from,e.to].join('|'));

/* ================= expansion ================= */
test('a macro key tags exactly what its long form tags', () => {
  const a=app(RECOVERY_PASS);
  deepEq(shape(a.parseChain('1qs2').evs), shape(a.parseChain('1qq*s2').evs),
    '"1qs2" is "1qq*s2"');
  deepEq(shape(a.parseChain('1qs2').evs), ['recovery|1|','pass success|1|2']);
});

test('the touch count is the long form\'s too, so the dots still line up', () => {
  const a=app(RECOVERY_PASS);
  eq(a.parseChain('1qs2').touches, a.parseChain('1qq*s2').touches);
  eq(a.parseChain('1qs2').touches, 2);
});

test('the transfer event inside the macro is the one that carries the ball', () => {
  const a=app(RECOVERY_PASS);
  const evs=a.parseChain('1qs2').evs;
  eq(evs[0].to,'','#recovery keeps no receiver');
  eq(evs[1].to,'2','#pass success takes the next number');
});

test('each expanded event keeps its OWN hotkey as the action code', () => {
  const evs=app(RECOVERY_PASS).parseChain('1qs2').evs;
  deepEq(evs.map(e=>e.key),['qq','s'],'not the macro code — the events\' own');
});

test('a macro works mid-chain, twice over, and next to ordinary keys', () => {
  const a=app(RECOVERY_PASS);
  deepEq(shape(a.parseChain('1qs2qs3').evs),
    ['recovery|1|','pass success|1|2','recovery|2|','pass success|2|3']);
  deepEq(shape(a.parseChain('1f*qs2').evs),
    ['foul|1|','recovery|1|','pass success|1|2'],'inside a * group');
});

test('a macro before the first number belongs to that player', () => {
  deepEq(shape(app(RECOVERY_PASS).parseChain('qs2').evs),
    ['recovery|2|','pass success|2|'],'same rule as a plain key');
});

test('a one-event macro is just an alias', () => {
  deepEq(shape(app([{key:'u',events:['substitution']}]).parseChain('38u6').evs),
    ['substitution|38|6']);
});

test('a macro may stand for three or more events', () => {
  deepEq(shape(app([{key:'g',events:['ground duel success','recovery','pass success']}])
    .parseChain('1g2').evs),
    ['ground duel success|1|','recovery|1|','pass success|1|2']);
});

/* ================= precedence and breakage ================= */
test('an event hotkey always wins — a macro can never shadow one', () => {
  // 's' is #pass success; a macro claiming 's' must not change what 's' has always done
  const a=app([{key:'s',events:['recovery','foul']}]);
  deepEq(shape(a.parseChain('1s2').evs),['pass success|1|2']);
});

test('a macro pointing at a deleted event is reported, not half-applied', () => {
  const a=app([{key:'qz',events:['recovery','no such event']}]);
  eq(a.parseChain('1qz2').badKey,'qz','the typed key is what the user is told about');
  submit(a,'1qz2',[{x:10,y:10},{x:20,y:20}]);
  eq(a.state.rows.length,0,'nothing is written');
  ok(/No event is bound to hotkey "qz"/.test(a.log.alerts[0]),a.log.alerts[0]);
});

test('an unknown key is still an unknown key', () => {
  const a=app(RECOVERY_PASS);
  eq(a.parseChain('1zzz2').badKey,'zzz');
});

test('with no macros at all, parsing is bit-for-bit what it was', () => {
  const a=app([]);
  deepEq(shape(a.parseChain('1s2s3s4').evs),
    ['pass success|1|2','pass success|2|3','pass success|3|4']);
  deepEq(shape(a.parseChain('1xx*aa').evs),['ground duel fail|1|','tackle fail|1|']);
  deepEq(shape(a.parseChain('1k*c2').evs),['free-kick|1|','cross success|1|2']);
  eq(a.parseChain('').evs.length,0);
});

/* ================= tagging through to the rows ================= */
test('one entry, one row per event, sharing a group', () => {
  const a=app(RECOVERY_PASS);
  submit(a,'1qs2',[{x:10,y:20,t:5},{x:30,y:40,t:5}]);
  eq(a.state.rows.length,2,'two rows');
  deepEq(a.state.rows.map(r=>r.event),['recovery','pass success']);
  deepEq(a.state.rows.map(r=>r.action),['qq','s'],'each row carries its event\'s code');
  eq(a.state.rows[0].grp,a.state.rows[1].grp,'one group -> one line in the table');
  ok(a.state.rows[0].grp,'and it is a real group id');
  deepEq(a.state.rows.map(r=>r.raw),['1qs2','1qs2'],'the macro entry is what was typed');
  deepEq(a.state.rows.map(r=>r.playerFrom),['1','1']);
  deepEq(a.state.rows.map(r=>r.playerTo),['','2']);
});

test('the macro entry needs the same dots as its long form', () => {
  const a=app(RECOVERY_PASS);
  submit(a,'1qs2',[{x:10,y:20}]);            // one dot short
  eq(a.state.rows.length,0,'refused');
  ok(/2 needed/.test(a.log.alerts[0]),a.log.alerts[0]);
});

test('a macro ending in a failed pass asks for the opponent-recovery dot', () => {
  // the extra dot is owed when nobody is named as receiver — "1qf", not "1qf2" — and the
  // macro owes it on exactly the entries its long form does
  const a=app([{key:'qf',events:['recovery','pass fail']}]);
  eq(a.parseChain('1qf').evs[1].to,'','nobody took the ball');
  eq(a.parseChain('1qf2').evs[1].to,'2','...unless the entry names them');

  submit(a,'1qf',[{x:10,y:20}]);
  eq(a.state.rows.length,0,'refused — the opponent-recovery dot is missing');
  ok(/2 needed/.test(a.log.alerts[0]),a.log.alerts[0]);
  submit(a,'1qf',[{x:10,y:20},{x:30,y:40}]);
  eq(a.state.rows.length,2,'with the second dot it lands');
  // named receiver -> two touches, two dots, no extra
  const b=app([{key:'qf',events:['recovery','pass fail']}]);
  submit(b,'1qf2',[{x:10,y:20},{x:30,y:40}]);
  eq(b.state.rows.length,2,'"1qf2" is happy with two, exactly like "1qq*ss2"');
  eq(b.log.alerts.length,0);
});

/* ================= the macro table's own rules ================= */
// the modal's helpers run against stubs: no DOM, no localStorage
function ui(macros,events){
  const log={saves:0,renders:0,alerts:[],prompted:[]};
  const box={focus(){},scrollIntoView(){}};
  const ctx={console,log,
    state:{sport:'football',macros:{football:macros||[]}},
    curEvents:()=>events||EVENTS.football,
    saveMacros(){log.saves++}, renderMacros(){log.renders++},
    alert:m=>log.alerts.push(m),
    prompt:q=>{log.prompted.push(q);return log.reply;},
    $:()=>({querySelectorAll:()=>[box]}),
  };
  vm.createContext(ctx);
  vm.runInContext(['curMacros','macroForKey','eventForKey','expandKey',
    'macroKeyProblem','setMacroKey','addMacro'].map(n=>grabFunction(n)).join('\n'),ctx);
  return ctx;
}

test('a macro key is reduced to the letters the entry box reads as one key', () => {
  const c=ui([{key:'',events:['recovery']}]);
  const m=c.state.macros.football[0];
  c.setMacroKey(m,'  Q S  '); eq(m.key,'qs','upper case and spaces go');
  c.setMacroKey(m,'q1s');     eq(m.key,'qs','digits are player numbers, never part of a key');
  c.setMacroKey(m,'q*s');     eq(m.key,'qs',"'*' is the separator between keys");
  eq(c.log.saves,3,'every edit is persisted');
});

test('a key an event already owns is flagged — it could never fire', () => {
  const c=ui([{key:'s',events:['recovery','foul']}]);
  ok(/already uses this code/.test(c.macroKeyProblem(c.state.macros.football[0])));
});

test('two macros on the same key are flagged, both of them', () => {
  const c=ui([{key:'qs',events:['recovery']},{key:'qs',events:['foul']}]);
  const [a,b]=c.state.macros.football;
  ok(/Another macro/.test(c.macroKeyProblem(a)),'first');
  ok(/Another macro/.test(c.macroKeyProblem(b)),'second');
});

test('a free key, and a key not typed yet, are not flagged', () => {
  const c=ui([{key:'qs',events:['recovery']},{key:'',events:['foul']}]);
  eq(c.macroKeyProblem(c.state.macros.football[0]),'');
  eq(c.macroKeyProblem(c.state.macros.football[1]),'','an empty box is just unfinished');
});

test('+ Add Macro resolves the typed events and leaves the hotkey to be filled in', () => {
  const c=ui([]);
  c.log.reply='qq*s';
  c.addMacro();
  deepEq(c.state.macros.football,[{key:'',events:['recovery','pass success']}]);
  eq(c.log.saves,1); ok(c.log.renders>0,'the table is redrawn');
});

test('+ Add Macro takes the same syntax as the entry box, including a macro of a macro', () => {
  const c=ui([{key:'qs',events:['recovery','pass success']}]);
  c.log.reply='qs*ddd';                       // an existing macro, then #goal
  c.addMacro();
  deepEq(c.state.macros.football[1].events,['recovery','pass success','goal'],
    'flattened at creation, so no macro can chase another at tagging time');
});

test('+ Add Macro refuses what is not a run of events', () => {
  const c=ui([]);
  c.log.reply='1qq*s2'; c.addMacro();
  ok(/player numbers/.test(c.log.alerts[0]),c.log.alerts[0]);
  c.log.reply='qq*nope'; c.addMacro();
  ok(/No event is bound to hotkey "nope"/.test(c.log.alerts[1]),c.log.alerts[1]);
  c.log.reply='   ';    c.addMacro();
  c.log.reply=null;     c.addMacro();          // Cancel
  eq(c.state.macros.football.length,0,'nothing was added by any of them');
  eq(c.log.alerts.length,2,'a blank entry and Cancel just do nothing');
});

/* ================= the page it lives on ================= */
test('the Event modal holds two separate tables', () => {
  const modal=/<div class="modal-overlay" id="evModal">[\s\S]*?\n<\/div>/.exec(SRC)[0];
  ok(/<b>Event types<\/b>/.test(modal),'the events table is named');
  ok(/<b>Macro<\/b>/.test(modal),'the macro table is named');
  ok(/id="evList"/.test(modal)&&/id="macList"/.test(modal),'each has its own list');
  ok(modal.indexOf('id="evList"')<modal.indexOf('id="macList"'),'events first, macro under it');
  // the events half is untouched: same list, same add row
  ok(/id="newEvName"/.test(modal)&&/id="addEvBtn"/.test(modal),'the add-an-event row stays');
  ok(/id="addMacroBtn"/.test(modal),'and the macro table has its own add button');
});

test('macros are kept in their own store, away from the event dictionary', () => {
  ok(/const MAC_STORE='pitchtagger\.macros\.v1'/.test(SRC),'its own key');
  ok(/const EV_STORE='pitchtagger\.events\.v1'/.test(SRC),'the event store is untouched');
  // saveEvents still pushes to the cloud; saveMacros must not pretend to
  ok(/onEventTypesChanged/.test(grabFunction('saveEvents')),'events still sync');
  notOk(/Cloud/.test(grabFunction('saveMacros')),'macros are local — no cloud table for them');
});

test('the macros are loaded after MAC_STORE exists, not from the state literal', () => {
  // calling loadMacros() from inside `const state = {…}` reads MAC_STORE in its temporal
  // dead zone; the loader's own catch swallows the ReferenceError and hands back nothing,
  // so every macro would silently vanish on reload
  const lit=/const state = \{[\s\S]*?\n\};/.exec(SRC)[0]
    .replace(/\/\/[^\n]*/g,'');   // the note explaining why says "loadMacros()" itself
  notOk(/loadMacros\(\)/.test(lit),'not called from the state literal');
  ok(/\n\s*macros:\{\},/.test(lit),'the field is still declared there');
  ok(SRC.indexOf('const MAC_STORE')<SRC.indexOf('state.macros=loadMacros()'),
     'assigned only once the store name exists');
});

test('every path that redraws the events table redraws the macro table too', () => {
  // both tables are on screen at once, and the macro rows read the event dictionary
  ok(/renderEvents\(\); renderMacros\(\)/.test(grabFunction('applyEventTypes')),
     'a dictionary pushed from the cloud');
  ok(/renderMacros\(\)/.test(grabFunction('setKey')),'an event re-keyed');
  ok(/renderMacros\(\)/.test(grabFunction('openEvModal')),'the modal opening');
});
