/* Per-analyst hotkeys and macros.

   The event LIST is the whole website's: one dictionary, shared, live. What used to ride
   along with it — the code you press for each event — is not. It belonged to
   event_types.key, so one analyst re-binding a key re-bound it for everybody, in the
   middle of their tagging. And macros belonged to nothing at all: one browser's
   localStorage, no copy anywhere else, which is how a domain move erased every macro on
   the site at once.

   Both now live in public.user_prefs, one row per account, and state.events keeps its
   shape — [{name,key}, …] — so every reader downstream never learns any of it happened.
   These tests hold that line: the list stays common, the codes stay personal, and no
   account can see or move another's. */
const fs=require('fs'), path=require('path'), vm=require('vm');
const {test,eq,ok,notOk,deepEq}=require('./tiny-test');
const {grabFunction,grabConst,SRC,CLOUD,EVENTS}=require('./harness');

const MIG=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','0020_user_prefs.sql'),'utf8').replace(/\r\n/g,'\n');

/* the two stores + the resolver, lifted out of index.html and run against a stubbed
   localStorage and a stubbed account. Nothing is re-implemented here. */
function makePrefs(userId,events,seed){
  const map=new Map(Object.entries(seed||{}));
  const log={renders:0,banners:0,cloud:0,status:0};
  const state={sport:'football',events:events||{football:[],football7:[],futsal:[],basketball:[]},
               hotkeys:{},macros:{}};
  const ctx={console,JSON,Date,Array,Object,String,Boolean,RegExp,
    STORAGE_OK:true,
    state,
    localStorage:{getItem:k=>map.has(k)?map.get(k):null,
                  setItem(k,v){map.set(k,String(v));},removeItem(k){map.delete(k);}},
    window:{PTAuth:{user:()=>userId?{id:userId}:null},
            Cloud:{onUserPrefsChanged(){log.cloud++},onEventTypesChanged(){log.pushed++}}},
    curEvents:()=>state.events[state.sport]||(state.events[state.sport]=[]),
    curMacros:()=>state.macros[state.sport]||(state.macros[state.sport]=[]),
    renderEvents(){log.renders++}, renderMacros(){log.renders++},
    updateBanner(){log.banners++}, updateStoreStatus(){log.status++}};
  vm.createContext(ctx);
  vm.runInContext([
    grabConst('SPORTS'),grabConst('HK_STORE'),grabConst('prefsUid'),grabConst('bySport'),
    grabConst('siteKeys'),grabConst('MAC_STORE'),grabConst('MAC_V1'),grabConst('PREFS_AT'),
    grabConst('EV_STORE'),grabConst('DEFAULT_KEYS'),
    grabFunction('seedSiteKeys'),grabFunction('saveEvents'),grabFunction('nextFreeKey'),
    grabFunction('hotkeysAll'),grabFunction('loadHotkeys'),grabFunction('saveHotkeys'),
    grabFunction('snapSiteKeys'),grabFunction('resolveKeys'),
    grabFunction('cleanMacros'),grabFunction('macrosAll'),grabFunction('loadMacros'),
    grabFunction('saveMacros'),grabFunction('touchPrefs'),grabFunction('prefsAt'),
    grabFunction('localPrefs'),grabFunction('applyUserPrefs'),
    grabFunction('eventForKey'),grabFunction('macroForKey'),grabFunction('freeCode'),
    grabFunction('retypeForMe'),grabFunction('setKey'),
    ';globalThis.API={loadHotkeys,saveHotkeys,snapSiteKeys,resolveKeys,loadMacros,saveMacros,'
    +'localPrefs,applyUserPrefs,retypeForMe,setKey,prefsAt,cleanMacros,saveEvents,nextFreeKey};'
  ].join('\n'),ctx,{filename:'user-prefs-extract.js'});
  // boot the way index.html does: my map, then the site's codes, then mine over them
  state.hotkeys=ctx.loadHotkeys();
  state.macros=ctx.loadMacros();
  ctx.snapSiteKeys(state.events);
  ctx.resolveKeys();
  return Object.assign({state,log,ctx,raw:k=>map.get(k),map},ctx.API);
}
// a small football dictionary with the codes the site ships
const dict=()=>({football:[{name:'pass success',key:'s'},{name:'pass fail',key:'ss'},
                           {name:'shot on target',key:'dd'},{name:'recovery',key:'qq'}],
                 football7:[],futsal:[],basketball:[]});
const keyOf=(a,n)=>(a.state.events.football.find(e=>e.name===n)||{}).key;

/* ===================== resolving a code ===================== */

test('the code I bound wins over the one the site ships', () => {
  const a=makePrefs('u1',dict(),{'pitchtagger.hotkeys.v1':JSON.stringify({u1:{football:{'pass success':'p'}}})});
  eq(keyOf(a,'pass success'),'p','mine');
  eq(keyOf(a,'pass fail'),'ss','the ones I never touched keep the site default');
});

test('no entry of mine at all means "give me the site default"', () => {
  const a=makePrefs('u1',dict());
  deepEq(a.state.events.football.map(e=>e.key),['s','ss','dd','qq']);
});

test('"" is "I unbound this one", and it does NOT fall back to the site', () => {
  const a=makePrefs('u1',dict(),{'pitchtagger.hotkeys.v1':JSON.stringify({u1:{football:{'pass success':''}}})});
  eq(keyOf(a,'pass success'),'','an empty string is an answer, not a missing one');
  eq(keyOf(a,'recovery'),'qq','and it says nothing about the others');
});

test('an event the site never gave a code to stays unbound', () => {
  const ev=dict(); ev.football.push({name:'block',key:''});
  const a=makePrefs('u1',ev);
  eq(keyOf(a,'block'),'');
});

test('an event that arrives later is resolved too', () => {
  const a=makePrefs('u1',dict(),{'pitchtagger.hotkeys.v1':JSON.stringify({u1:{football:{'corner-kick':'j'}}})});
  a.state.events.football.push({name:'corner-kick',key:'x'});   // pushed from the cloud
  a.snapSiteKeys(a.state.events); a.resolveKeys();
  eq(keyOf(a,'corner-kick'),'j','my binding, not the site x');
});

test('resolving touches the code and nothing else', () => {
  const a=makePrefs('u1',dict(),{'pitchtagger.hotkeys.v1':JSON.stringify({u1:{football:{'pass success':'p'}}})});
  deepEq(a.state.events.football.map(e=>e.name),
    ['pass success','pass fail','shot on target','recovery'],'names and order are the site\'s');
});

test('each sport resolves out of its own map', () => {
  const ev=dict(); ev.futsal=[{name:'pass success',key:'s'}];
  const a=makePrefs('u1',ev,{'pitchtagger.hotkeys.v1':JSON.stringify({u1:{football:{'pass success':'p'}}})});
  eq(a.state.events.futsal[0].key,'s','futsal was not re-bound by a football binding');
});

/* ===================== one browser, two accounts ===================== */

test('two analysts on the same machine keep separate keyboards', () => {
  const seed={'pitchtagger.hotkeys.v1':JSON.stringify({
    u1:{football:{'pass success':'p'}}, u2:{football:{'pass success':'z'}}})};
  eq(keyOf(makePrefs('u1',dict(),seed),'pass success'),'p');
  eq(keyOf(makePrefs('u2',dict(),seed),'pass success'),'z');
});

test('binding a code writes my map and leaves the shared list alone', () => {
  const a=makePrefs('u1',dict());
  a.setKey(a.state.events.football[0],'P');
  eq(a.state.hotkeys.football['pass success'],'p','lower-cased into my map');
  const stored=JSON.parse(a.raw('pitchtagger.hotkeys.v1'));
  deepEq(Object.keys(stored),['u1'],'stored under my account and no one else\'s');
  eq(stored.u1.football['pass success'],'p');
});

test('setKey never pushes the shared dictionary', () => {
  const src=grabFunction('setKey');
  notOk(/saveEvents\(/.test(src),'no saveEvents: the site list is not what changed');
  ok(/saveHotkeys\(/.test(src),'it is my own store that is written');
});

test('a hotkey rides the account channel, never the dictionary channel', () => {
  const src=grabFunction('saveHotkeys');
  ok(/onUserPrefsChanged/.test(src),'up with my prefs');
  notOk(/onEventTypesChanged/.test(src),'not as a change to everybody\'s events');
});

test('taking a code off another event records that in MY map, as ""', () => {
  const a=makePrefs('u1',dict());
  a.setKey(a.state.events.football[3],'s');          // recovery claims 's', which pass success had
  eq(a.state.hotkeys.football['pass success'],'','unbound for me');
  eq(a.state.hotkeys.football['recovery'],'s');
  eq(keyOf(a,'pass success'),'','and it does not creep back from the site default');
  const other=makePrefs('u2',dict(),{'pitchtagger.hotkeys.v1':a.raw('pitchtagger.hotkeys.v1')});
  eq(keyOf(other,'pass success'),'s','the other analyst still presses s for a pass');
});

test('macros are kept per account as well', () => {
  const seed={'pitchtagger.macros.v2':JSON.stringify({
    u1:{football:[{key:'qs',events:['recovery','pass success']}]},
    u2:{football:[{key:'zz',events:['pass fail']}]}})};
  deepEq(makePrefs('u1',dict(),seed).state.macros.football.map(m=>m.key),['qs']);
  deepEq(makePrefs('u2',dict(),seed).state.macros.football.map(m=>m.key),['zz']);
});

/* ===================== the event list is still everybody's ===================== */

test('adding an event is still a change to the shared dictionary', () => {
  ok(/onEventTypesChanged/.test(grabFunction('saveEvents')),'saveEvents still pushes to the cloud');
  const add=/\$\('addEvBtn'\)\.onclick=[^\n]*\n?/.exec(SRC)[0];
  ok(/saveEvents\(\)/.test(add),'+ still writes the site list');
});

test('nobody can delete an event from the shared list any more', () => {
  const src=grabFunction('renderEvents');
  notOk(/ev-x/.test(src),'no delete control on an event type row');
  notOk(/filter\(o=>o!==ev\)/.test(src),'and no path that drops one');
  // the tagger's own Events table is untouched: a tagged row is one person's work
  ok(/function deleteRows/.test(SRC),'rows in the tagger can still be deleted');
  ok(/function startEdit\b/.test(SRC),'and edited');
});

test('an event created here keeps the code it was given, with no cloud to echo it back', () => {
  // the site default for a brand-new event is the code it was created with. Without
  // recording that, the next re-key of ANY event resolved this one against a blank and
  // silently took its code away — offline, that would never have come back.
  const a=makePrefs('u1',dict());
  a.state.events.football.push({name:'second ball won',key:a.nextFreeKey()});
  a.saveEvents();
  const given=keyOf(a,'second ball won');
  ok(given,'created with a free code');
  a.setKey(a.state.events.football[0],'zq');     // re-key something else -> resolve again
  eq(keyOf(a,'second ball won'),given,'and it still has it');
});

test('a code the site already has is not replaced by mine', () => {
  const a=makePrefs('u1',dict());
  a.setKey(a.state.events.football[0],'p');      // mine for #pass success
  a.state.events.football.push({name:'second ball won',key:'w'});
  a.saveEvents();                                // seeds only what is missing
  const b=makePrefs('u2',dict());                // another analyst, same shared list
  eq(keyOf(b,'pass success'),'s','the site default was never overwritten by u1\'s p');
});

test('pushEventTypes cannot delete anything', () => {
  const src=grabFunction('pushEventTypes',CLOUD,'cloud-sync.js');
  notOk(/\.delete\(/.test(src),'no delete call reaches event_types');
});

test('a code is written when the event first lands, and never again', () => {
  const src=grabFunction('pushEventTypes',CLOUD,'cloud-sync.js');
  ok(/known\.has\(/.test(src),'it asks which events the table already holds');
  // the row for an event already there carries no key -> ON CONFLICT cannot overwrite it
  ok(/seen\.push\(\{ sport, event_name: e\.name, ord: i \}\)/.test(src),'existing: no key');
  ok(/fresh\.push\(\{ sport, event_name: e\.name, key: e\.key \|\| null, ord: i \}\)/.test(src),'new: key');
});

test('new and existing events go up as two separate writes', () => {
  const src=grabFunction('pushEventTypes',CLOUD,'cloud-sync.js');
  ok(/upsert\(seen/.test(src)&&/insert\(fresh/.test(src),'one call each');
  // PostgREST builds the column list from the union of the array's keys, so a single
  // mixed batch would put `key` in the DO UPDATE SET and blank the site default
  ok(src.indexOf('upsert(seen')!==src.indexOf('insert(fresh'),'never the same call');
});

/* ===================== macros: their own store, and the way home ===================== */

test('the pre-account macro store is adopted for whoever is signed in', () => {
  const a=makePrefs('u1',dict(),{'pitchtagger.macros.v1':JSON.stringify(
    {football:[{key:'qs',events:['recovery','pass success']}]})});
  deepEq(a.state.macros.football,[{key:'qs',events:['recovery','pass success']}]);
});

test('the old store is read, never removed', () => {
  const a=makePrefs('u1',dict(),{'pitchtagger.macros.v1':JSON.stringify(
    {football:[{key:'qs',events:['recovery']}]})});
  a.saveMacros();
  ok(a.raw('pitchtagger.macros.v1'),'v1 is still there — it was the only copy anybody had');
  notOk(/removeItem/.test(grabFunction('loadMacros')),'nothing in the loader deletes it');
});

test('once this account has macros of its own, the old store is ignored', () => {
  const a=makePrefs('u1',dict(),{
    'pitchtagger.macros.v1':JSON.stringify({football:[{key:'qs',events:['recovery']}]}),
    'pitchtagger.macros.v2':JSON.stringify({u1:{football:[{key:'zz',events:['pass fail']}]}})});
  deepEq(a.state.macros.football.map(m=>m.key),['zz']);
});

test('an account that deleted all its macros does not get the old ones back', () => {
  const a=makePrefs('u1',dict(),{
    'pitchtagger.macros.v1':JSON.stringify({football:[{key:'qs',events:['recovery']}]}),
    'pitchtagger.macros.v2':JSON.stringify({u1:{football:[]}})});
  deepEq(a.state.macros.football,[],'an empty list is a decision, not a missing entry');
});

test('a macro list is cleaned on the way in', () => {
  const a=makePrefs('u1',dict(),{'pitchtagger.macros.v2':JSON.stringify({u1:{football:[
    {key:'QS',events:['recovery']}, {key:'x',events:[]}, null, {key:'y'}]}})});
  deepEq(a.state.macros.football,[{key:'qs',events:['recovery']}],'lower-cased, and the empty ones dropped');
});

test('a macro points at names, so re-binding a code leaves it whole', () => {
  const a=makePrefs('u1',dict(),{'pitchtagger.macros.v2':JSON.stringify(
    {u1:{football:[{key:'qs',events:['recovery','pass success']}]}})});
  a.setKey(a.state.events.football[0],'p');
  deepEq(a.state.macros.football[0].events,['recovery','pass success'],'untouched');
});

/* ===================== ✎ Edit, read in my own keyboard ===================== */
// A tagged with s = #pass success. B presses p for it, and s is B's #shot on target.
const bDict=()=>({football:[{name:'pass success',key:'p'},{name:'shot on target',key:'s'},
                            {name:'recovery',key:'qq'},{name:'pass fail',key:'ss'}],
                  football7:[],futsal:[],basketball:[]});

test('a row tagged by someone else opens in MY codes, not theirs', () => {
  const b=makePrefs('u2',bDict());
  eq(b.retypeForMe('1s2',[{action:'s',event:'pass success'}]),'1p2',
    'their s is my p — without this the row would be re-tagged as a shot');
});

test('when the tagger is me and nothing moved, the entry comes back character for character', () => {
  const a=makePrefs('u1',dict());
  ['1s2','1s2s3s4','1qq*s2','12ss*dd','1s2ss3'].forEach(raw=>
    eq(a.retypeForMe(raw,[{action:'s',event:'pass success'},{action:'ss',event:'pass fail'},
                          {action:'dd',event:'shot on target'},{action:'qq',event:'recovery'}]),
       raw,raw));
});

test('every code in a chain is translated, and nothing else is', () => {
  const b=makePrefs('u2',bDict());
  eq(b.retypeForMe('12s7ss9',[{action:'s',event:'pass success'},{action:'ss',event:'pass fail'}]),
    '12p7ss9','shirt numbers survive, and pass fail is ss for both of us');
  eq(b.retypeForMe('1qq*s2',[{action:'qq',event:'recovery'},{action:'s',event:'pass success'}]),
    '1qq*p2',"the '*' and the order are exactly as typed");
});

test('a code I have not bound is never handed back meaning something else', () => {
  // I unbound #pass success, and s is MY #shot on target. Giving "1s2" back would
  // re-tag the row as a shot the moment Enter is pressed.
  const noKey=bDict(); noKey.football[0].key='';
  const b=makePrefs('u2',noKey);
  const out=b.retypeForMe('1s2',[{action:'s',event:'pass success'}]);
  notOk(/s/.test(out.replace(/\d/g,'')),'their s is gone: '+out);
  eq(b.ctx.eventForKey(out.replace(/\d/g,'')),null,'and what replaced it means nothing — the gate refuses out loud');
});

test('a code I have not bound IS handed back when it means nothing to me either', () => {
  const noKey=bDict(); noKey.football[0].key=''; noKey.football[1].key='';   // s owned by nobody now
  const b=makePrefs('u2',noKey);
  eq(b.retypeForMe('1s2',[{action:'s',event:'pass success'}]),'1s2',
    'nothing to confuse it with, so it is left as typed and refused by name');
});

test('a row whose event I cannot type comes back as its numbers alone', () => {
  // an entry with no code re-tags the ACTIVE event, and startEdit has just set that to
  // this row's own — so the numbers alone put the row back exactly as it was
  const src=grabFunction('startEdit');
  ok(/\(mine\|\|''\)/.test(src),'no fallback to the code the tagger pressed');
  ok(/state\.activeEvent=row\.event/.test(src),'which is safe only because of this line');
});

test('a code the rows do not explain falls back to my own dictionary', () => {
  const b=makePrefs('u2',bDict());
  eq(b.retypeForMe('1qq2',[]),'1qq2','my recovery');
  eq(b.retypeForMe('1zz2',[]),'1zz2','and a code nobody owns is left as typed');
});

test('a single row is rebuilt from the event it IS, not the code it was typed with', () => {
  const src=grabFunction('startEdit');
  ok(/curEvents\(\)\.find\(o=>o\.name===row\.event\)/.test(src),'my code for that event name');
  notOk(/row\.action/.test(src),'the code the tagger pressed is never handed back');
  ok(/retypeForMe\(/.test(grabFunction('startEditGroup')),'and a chain goes through the translator');
});

/* ===================== the rules that stop this happening again ===================== */

test('a read that failed never turns into a write', () => {
  const src=grabFunction('initUserPrefs',CLOUD,'cloud-sync.js');
  ok(/if \(error\) \{[^}]*return;/.test(src),'an error returns before any push');
  ok(src.indexOf('if (error)')<src.indexOf('pushUserPrefs'),'and it returns FIRST');
});

test('an anonymous session is local-only', () => {
  ok(/const realUid = \(session\)/.test(CLOUD)&&/is_anonymous !== true/.test(CLOUD),
    'a throwaway id is not an account');
  const init=grabFunction('initUserPrefs',CLOUD,'cloud-sync.js');
  ok(/if \(!prefsUid\) return;/.test(init),'no read and no write without a real one');
  ok(/if \(!prefsUid\) return;/.test(grabFunction('pushUserPrefs',CLOUD,'cloud-sync.js')),'the push agrees');
});

test('an edit made while the network was down is not overwritten by an older copy', () => {
  const src=grabFunction('initUserPrefs',CLOUD,'cloud-sync.js');
  ok(/local\.at > Date\.parse\(data\.updated_at/.test(src),'local wins when it is newer');
  ok(/if \(!data\) await pushUserPrefs\(local\)/.test(src),'and an empty server is seeded, not read');
});

test('what came down from the server does not look newer than the server', () => {
  const src=grabFunction('applyUserPrefs');
  notOk(/touchPrefs\(/.test(src),'applying a copy must not stamp it as my own edit');
  ok(/localStorage\.setItem\(HK_STORE/.test(src)&&/localStorage\.setItem\(MAC_STORE/.test(src),
    'but it is cached, so the next open has it before the network answers');
});

test('my prefs ride a channel filtered to my own row', () => {
  const src=grabFunction('subscribeUserPrefs',CLOUD,'cloud-sync.js');
  ok(/filter: 'user_id=eq\.' \+ prefsUid/.test(src),'nobody else\'s row can arrive here');
  ok(/table: 'user_prefs'/.test(src));
});

test('prefs are loaded after the dictionary, never before', () => {
  const i=CLOUD.indexOf('await initEventTypes()'), j=CLOUD.indexOf('await initUserPrefs(session)');
  ok(i>0&&j>i,'the codes are resolved ONTO the shared list, so the list has to be there');
});

test('the local clock is stamped by my edits and only by mine', () => {
  const a=makePrefs('u1',dict());
  eq(a.prefsAt(),0,'nothing yet');
  a.setKey(a.state.events.football[0],'p');
  ok(a.prefsAt()>0,'binding a code is an edit');
  ok(/touchPrefs\(/.test(grabFunction('saveMacros')),'so is changing a macro');
});

/* ===================== the migration ===================== */

test('0020 only adds', () => {
  // the prose above each block says words like "rename" and "drop" precisely to promise
  // it does none of them — judge the statements the database will run, not the comments
  const sql=MIG.replace(/^\s*--.*$/gm,'');
  notOk(/drop table|drop column|rename|alter table public\.event_types/i.test(sql),
    'no existing table is touched — a tab on the old build keeps working');
  ok(/create table if not exists public\.user_prefs/.test(MIG));
  ok(/alter publication supabase_realtime add table public\.user_prefs/.test(MIG),'realtime');
});

test('a prefs row belongs to one account and is sealed to everyone else', () => {
  ok(/enable row level security/.test(MIG));
  ok(/using \(user_id = auth\.uid\(\)\)/.test(MIG),'reads');
  ok(/with check \(user_id = auth\.uid\(\)\)/.test(MIG),'and writes');
  // event_types is the opposite on purpose: the dictionary is everybody's
  const et=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','0003_event_types.sql'),'utf8');
  ok(/using \(true\)/.test(et),'the shared list stayed shared');
});
