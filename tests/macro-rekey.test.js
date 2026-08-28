/* What happens to a macro when the keyboard moves under it.

   A macro is stored as the list of event NAMES it stands for, never as their hotkeys.
   That is the whole design — index.html says so where curMacros lives — and it is what
   lets an analyst re-bind a code without every macro they own quietly meaning something
   else. The property held when it was written and holds today; what it did not have was
   anything asserting it. tests/macro-hotkeys.test.js has thirty-odd tests about macros
   and none of them re-keys an event, and the nearest thing to this — its last test —
   only reads setKey's source to check it calls renderMacros().

   So this file runs the real thing. setKey(), parseChain(), expandMacros() and
   macroKeyProblem() are lifted out of index.html and driven against a stubbed
   localStorage and account, the way tests/user-prefs.test.js drives the stores. Nothing
   is re-implemented.

   The dictionary here is three events, made up on purpose. A test that used the shipped
   list would be asserting today's codes rather than the rule, and today's codes have
   already moved once: `x` was ground duel success when this was asked about and is
   physical duel success now. */
const vm=require('vm');
const {grabFunction,grabConst,SRC}=require('./harness');
const {test,eq,deepEq,ok,notOk}=require('./tiny-test');

/* The two halves of the machinery, in one sandbox: the stores and the resolver (which is
   what setKey writes through) and the entry parser (which is what proves a macro still
   fires). Neither existing sandbox has both — makeApp does not lift setKey, and
   user-prefs' does not lift parseChain. */
function sandbox(events,macros){
  const disk=new Map(), writes={};
  const state={sport:'football',events:{football:events},macros:{football:macros},
               hotkeys:{},activeEvent:null};
  const ctx={console,JSON,Date,Array,Object,String,Boolean,RegExp,Set,STORAGE_OK:true,state,
    // writes are counted as well as kept: "the store did not change" and "the store was
    // never written" are different claims, and only the second rules out a race with
    // another tab rewriting a macro list that had moved on
    localStorage:{getItem:k=>disk.has(k)?disk.get(k):null,
                  setItem(k,v){writes[k]=(writes[k]||0)+1;disk.set(k,String(v));},
                  removeItem(k){disk.delete(k);}},
    window:{PTAuth:{user:()=>({id:'u1'})},
            Cloud:{onUserPrefsChanged(){},onEventTypesChanged(){}}},
    renderEvents(){},renderMacros(){},updateBanner(){},updateStoreStatus(){}};
  vm.createContext(ctx);
  vm.runInContext([
    grabConst('SPORTS'),grabConst('HK_STORE'),grabConst('prefsUid'),grabConst('bySport'),
    grabConst('siteKeys'),grabConst('MAC_STORE'),grabConst('MAC_V1'),grabConst('PREFS_AT'),
    grabConst('EV_STORE'),grabConst('DEFAULT_KEYS'),
    grabFunction('curEvents'),grabFunction('curMacros'),
    grabFunction('seedSiteKeys'),grabFunction('saveEvents'),
    grabFunction('hotkeysAll'),grabFunction('loadHotkeys'),grabFunction('saveHotkeys'),
    grabFunction('snapSiteKeys'),grabFunction('resolveKeys'),
    grabFunction('macrosAll'),grabFunction('loadMacros'),grabFunction('saveMacros'),
    grabFunction('cleanMacros'),grabFunction('touchPrefs'),grabFunction('prefsAt'),
    grabFunction('setKey'),grabFunction('eventForKey'),grabFunction('macroForKey'),
    grabFunction('expandKey'),grabFunction('expandMacros'),grabFunction('freeCode'),
    grabFunction('parseChain'),grabFunction('macroKeyProblem'),
    ';globalThis.API={setKey,parseChain,expandMacros,macroKeyProblem,saveMacros,'
    +'eventForKey,macroForKey,resolveKeys,snapSiteKeys};'
  ].join('\n'),ctx,{filename:'macro-rekey-extract.js'});
  // boot the way index.html does: the site's codes, then mine over them
  ctx.snapSiteKeys(state.events);
  ctx.resolveKeys();
  return Object.assign({state,disk,writes,
    ev:n=>state.events.football.filter(e=>e.name===n)[0],
    mac:()=>state.macros.football[0],
    // what an entry tags, as "name|code" per row — the codes prove each event kept its own
    tags:raw=>ctx.parseChain(raw).evs.map(e=>e.name+'|'+(e.key||'-')),
    bad:raw=>ctx.parseChain(raw).badKey},ctx.API);
}

const DICT=()=>[{name:'ground duel success',key:'x'},
                {name:'tackle success',key:'a'},
                {name:'pass success',key:'s'}];
const XA=()=>[{key:'xa',events:['ground duel success','tackle success']}];
const BOTH=['ground duel success|x','tackle success|a'];

/* ================= the property that was asked for ================= */

test('re-keying an event leaves the macro exactly as it was', () => {
  const a=sandbox(DICT(),XA());
  a.setKey(a.ev('ground duel success'),'gr');
  eq(a.ev('ground duel success').key,'gr','the event took the new code');
  eq(a.mac().key,'xa','and the macro kept its own');
  deepEq(a.mac().events,['ground duel success','tackle success'],
         'pointing at the same two events, by name, as it always did');
});

test('…and it still tags those two events, under the same code', () => {
  const a=sandbox(DICT(),XA());
  deepEq(a.tags('1xa'),BOTH,'before');
  a.setKey(a.ev('ground duel success'),'gr');
  deepEq(a.tags('1xa'),['ground duel success|gr','tackle success|a'],
         'after — the same events, each carrying its own new code');
});

test('…and setKey never writes to the macro store at all', () => {
  /* The stores are separate on purpose: hotkeys.v1 and macros.v2. A re-key that touched
     the second would be able to lose a macro to a race with another tab. */
  const a=sandbox(DICT(),XA());
  a.saveMacros();                                    // put the store on disk to compare against
  const before=a.disk.get('pitchtagger.macros.v2');
  const wrote=a.writes['pitchtagger.macros.v2']||0;
  a.setKey(a.ev('ground duel success'),'gr');
  eq(a.writes['pitchtagger.macros.v2']||0,wrote,'the macro store was not written at all');
  eq(a.disk.get('pitchtagger.macros.v2'),before,'and so is byte for byte what it was');
  ok((a.writes['pitchtagger.hotkeys.v1']||0)>0,'the new code went to the other store');
  ok(/"gr"/.test(a.disk.get('pitchtagger.hotkeys.v1')||''));
});

test('the long form follows the keyboard, because that is what a long form is', () => {
  /* ✎ Edit opens a macro entry as the events it stands for, written in the codes I press
     TODAY. Handing back "1x*a" after `x` has moved would put an entry in the box that
     tags something else the moment it is submitted. */
  const a=sandbox(DICT(),XA());
  eq(a.expandMacros('1xa'),'1x*a','before');
  a.setKey(a.ev('ground duel success'),'gr');
  eq(a.expandMacros('1xa'),'1gr*a','after');
});

test('a round trip puts the keyboard back and the macro never moved', () => {
  const a=sandbox(DICT(),XA());
  a.setKey(a.ev('ground duel success'),'gr');
  a.setKey(a.ev('ground duel success'),'x');
  eq(a.ev('ground duel success').key,'x');
  eq(a.mac().key,'xa');
  deepEq(a.tags('1xa'),BOTH);
  eq(a.expandMacros('1xa'),'1x*a');
});

test('the old code is genuinely handed back, not left pointing at both', () => {
  const a=sandbox(DICT(),XA());
  a.setKey(a.ev('ground duel success'),'gr');
  deepEq(a.tags('1gr'),['ground duel success|gr'],'the new code works');
  eq(a.bad('1x'),'x','and the old one answers to nothing');
});

/* ================= the awkward corners ================= */

test('unbinding an event a macro uses does not stop the macro', () => {
  /* '' means "I deliberately left this one unbound". The macro resolves by name, so it
     goes on firing; only the long form has nothing to write, and expandMacros leaves the
     entry as typed rather than inventing a code. */
  const a=sandbox(DICT(),XA());
  a.setKey(a.ev('ground duel success'),'');
  eq(a.ev('ground duel success').key,'');
  /* The row for an event with no code of its own records the code that was TYPED — the
     macro's — because expandKey falls back with `ev.key||k`. Something has to go in
     action_code for ✎ Edit to read the row back with, and the macro's code is the only
     thing the tagger actually pressed. */
  deepEq(a.tags('1xa'),['ground duel success|xa','tackle success|a'],'it still fires');
  eq(a.expandMacros('1xa'),'1xa','and the shorthand is left alone, not half-expanded');
  eq(a.macroKeyProblem(a.mac()),'','nothing is wrong with the macro itself');
});

test('there is exactly one way to stop a macro: give an event its code', () => {
  const a=sandbox(DICT(),XA());
  a.setKey(a.ev('pass success'),'xa');
  deepEq(a.tags('1xa'),['pass success|xa'],'an event hotkey always wins (see expandKey)');
});

test('…and that one way is loud, not silent', () => {
  /* The macro is not deleted and nothing is lost — the row stays in the table with its
     code box painted red and a sentence saying why. Silent would be the bug. */
  const a=sandbox(DICT(),XA());
  a.setKey(a.ev('pass success'),'xa');
  deepEq(a.mac().events,['ground duel success','tackle success'],'the macro is still there');
  eq(a.mac().key,'xa');
  ok(/already uses this code/.test(a.macroKeyProblem(a.mac())),a.macroKeyProblem(a.mac()));
  // …and taking the code away again brings it straight back
  a.setKey(a.ev('pass success'),'s');
  eq(a.macroKeyProblem(a.mac()),'');
  deepEq(a.tags('1xa'),BOTH);
});

test('a code taken from another event is taken silently — from the event, not the macro', () => {
  /* setKey clears a duplicate code off whatever else held it, with no warning. That is a
     hazard of the keyboard and is asserted here so it is not mistaken for a macro fault:
     the macro still names both events and still tags both. */
  const a=sandbox(DICT(),XA());
  a.setKey(a.ev('ground duel success'),'a');         // 'a' belonged to tackle success
  eq(a.ev('ground duel success').key,'a');
  eq(a.ev('tackle success').key,'','the other event lost its code and was not told');
  // tackle success now has no code of its own, so its row falls back to the typed one
  deepEq(a.tags('1xa'),['ground duel success|a','tackle success|xa'],'the macro is unharmed');
  deepEq(a.mac().events,['ground duel success','tackle success'],'and still names both');
});

test('re-keying an event no macro mentions leaves every macro alone', () => {
  const a=sandbox(DICT(),XA());
  a.setKey(a.ev('pass success'),'ps');
  eq(a.mac().key,'xa');
  deepEq(a.tags('1xa'),BOTH);
  eq(a.expandMacros('1xa'),'1x*a');
});
