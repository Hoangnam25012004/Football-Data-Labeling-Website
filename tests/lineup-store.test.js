/* The lineups store belongs to ONE match.
   localStorage is shared by every tab and by every match a browser has ever opened, so a
   stored squad carries a stamp naming its match. These tests pin the rules that stop a
   window sitting on another match — or on no match at all — from writing its own, usually
   empty, squad over the open match's, in localStorage and in the database.
   (The bug: a lineup + formation entered on the Player lists tab vanished completely.) */
const vm=require('vm');
const {test,eq,ok,notOk,deepEq}=require('./tiny-test');
const {grabFunction,grabConst,loadShared,fakeStorage,SRC,CLOUD}=require('./harness');

const A='11111111-1111-4111-8111-111111111111';   // match A
const B='22222222-2222-4222-8222-222222222222';   // match B
const LU='pitchtagger.lineups.v1', STAMP='pitchtagger.lineups.match.v1';

const squad=()=>({home:{roster:[{no:'7',name:'Bảy'}],xi:[{no:'7',x:50,y:50,pos:'CM'}],subs:[],dir:'lr'},
                  away:{roster:[],xi:[],subs:[],dir:'rl'}});
const blank=()=>({home:{roster:[],xi:[],subs:[],dir:'lr'},away:{roster:[],xi:[],subs:[],dir:'rl'}});

/* ---- the main tagging tab (index.html) ---- */
const APP_CONSTS=['LU_STORE','LU_MATCH_STORE','blankTeamLU','lineupsAreFor','teamLUEmpty','lineupsEmpty'];
const APP_FUNCS=['loadLineups','luStamp','writeLineupsLS','saveLineups','applyCloudLineups','resetLineups'];
function makeMain(seed,matchId){
  const store=fakeStorage(seed);
  const log={pushes:[],renders:0};
  const ctx={console,localStorage:store,log,
    state:{lineups:blank(),teamIds:{home:null,away:null,matchId:matchId||null,code:null}},
    $:()=>null,
    window:{Cloud:{onLineupsChanged:(l,id)=>log.pushes.push({id,lineups:l})}},
    refreshFormation(){log.renders++},renderLineup(){},renderFmModal(){}};
  vm.createContext(ctx);
  vm.runInContext(APP_CONSTS.map(n=>grabConst(n)).concat(APP_FUNCS.map(n=>grabFunction(n))).join('\n')
    +'\n;globalThis.k={'+APP_CONSTS.join(',')+'};',ctx,{filename:'index.html-lineups.js'});
  return {ctx,store,log};
}

test('the store keys match the ones the sub-pages read', ()=>{
  const {ctx}=makeMain({},A);
  eq(ctx.k.LU_STORE,LU);
  eq(ctx.k.LU_MATCH_STORE,STAMP);
  eq(loadShared().PT_KEYS.lineups,LU,'shared.js lineups key');
  eq(loadShared().PT_KEYS.lineupsMatch,STAMP,'shared.js stamp key');
});

test('a write stamps the squad with the match it belongs to', ()=>{
  const {ctx,store}=makeMain({},A);
  ok(ctx.writeLineupsLS(squad(),A));
  eq(store.getItem(STAMP),A);
  deepEq(JSON.parse(store.getItem(LU)),squad());
});

test('the stamp is written BEFORE the squad, so other tabs never read a stale one', ()=>{
  const {ctx,store}=makeMain({},A);
  ctx.writeLineupsLS(squad(),A);
  deepEq(store.writes,[STAMP,LU]);
});

test('a write with no match open is refused while a real squad is stored', ()=>{
  const {ctx,store}=makeMain({[STAMP]:A,[LU]:JSON.stringify(squad())},null);
  notOk(ctx.writeLineupsLS(blank(),null),'the write must be refused');
  eq(store.getItem(STAMP),A,'the stamp is untouched');
  deepEq(JSON.parse(store.getItem(LU)),squad(),'match A keeps its squad');
});

test('a write with no match open is allowed when nothing real is stored', ()=>{
  const {ctx,store}=makeMain({[STAMP]:A,[LU]:JSON.stringify(blank())},null);
  ok(ctx.writeLineupsLS(blank(),null));
  eq(store.getItem(STAMP),'');
});

test('a copy is only "for" the match it was stamped with', ()=>{
  const {ctx}=makeMain({[STAMP]:A},A);
  ok(ctx.k.lineupsAreFor(A));
  notOk(ctx.k.lineupsAreFor(B),'another match');
  notOk(ctx.k.lineupsAreFor(null),'no match open');
});

test('an unstamped store belongs to nobody until it is migrated', ()=>{
  const {ctx}=makeMain({[LU]:JSON.stringify(squad())},A);
  eq(ctx.luStamp(),null);
  notOk(ctx.k.lineupsAreFor(A));
});

test('saveLineups pushes to the cloud tagged with the open match', ()=>{
  const {ctx,store,log}=makeMain({},A);
  ctx.state.lineups=squad();
  ctx.saveLineups();
  eq(store.getItem(STAMP),A);
  eq(log.pushes.length,1);
  eq(log.pushes[0].id,A,'the push names the match the squad is for');
});

test('saveLineups with no match open neither wipes the store nor pushes', ()=>{
  const {ctx,store,log}=makeMain({[STAMP]:A,[LU]:JSON.stringify(squad())},null);
  ctx.state.lineups=blank();          // what a tab with no match open holds
  ctx.saveLineups();
  deepEq(JSON.parse(store.getItem(LU)),squad(),'match A keeps its squad');
  eq(log.pushes.length,1,'the cloud hook is still called…');
  eq(log.pushes[0].id,null,'…tagged for no match, so cloud-sync drops it');
});

test('applyCloudLineups stamps the copy for the match it came from', ()=>{
  const {ctx,store}=makeMain({[STAMP]:B,[LU]:JSON.stringify(blank())},A);
  ctx.applyCloudLineups(squad(),A);
  eq(store.getItem(STAMP),A);
  deepEq(ctx.state.lineups,squad());
});

test('applyCloudLineups ignores a malformed payload', ()=>{
  const {ctx}=makeMain({},A);
  ctx.state.lineups=squad();
  ctx.applyCloudLineups(null,A);
  ctx.applyCloudLineups({home:{}},A);
  deepEq(ctx.state.lineups,squad(),'the open squad survives');
});

test('opening a match with nothing saved adopts this browser\'s copy of THAT match', ()=>{
  // entered on the Player lists tab while it could not reach the database: the only copy
  const {ctx,store,log}=makeMain({[STAMP]:A,[LU]:JSON.stringify(squad())},A);
  ctx.resetLineups(A);
  deepEq(ctx.state.lineups,squad(),'kept, not blanked');
  deepEq(JSON.parse(store.getItem(LU)),squad());
  eq(log.pushes.length,1,'and pushed up so it stops being the only copy');
  eq(log.pushes[0].id,A);
});

test('opening a match with nothing saved blanks a copy belonging to another match', ()=>{
  const {ctx,store,log}=makeMain({[STAMP]:A,[LU]:JSON.stringify(squad())},B);
  ctx.resetLineups(B);
  deepEq(ctx.state.lineups,blank());
  eq(store.getItem(STAMP),B);
  deepEq(JSON.parse(store.getItem(LU)),blank(),'match B starts empty');
  eq(log.pushes.length,0,'nothing is written to the cloud');
});

test('opening a match with nothing saved and nothing stored just blanks', ()=>{
  const {ctx,log}=makeMain({[STAMP]:A,[LU]:JSON.stringify(blank())},A);
  ctx.resetLineups(A);
  deepEq(ctx.state.lineups,blank());
  eq(log.pushes.length,0);
});

test('an empty squad is recognised whatever it carries', ()=>{
  const {ctx}=makeMain({},A);
  ok(ctx.k.lineupsEmpty(null));
  ok(ctx.k.lineupsEmpty(blank()));
  notOk(ctx.k.lineupsEmpty(squad()));
  notOk(ctx.k.lineupsEmpty({...blank(),history:[{t:600,team:'home',xi:[],subs:[]}]}),
    'a formation history alone still counts as data');
});

/* ---- the sub-pages (shared.js) follow the same rules ---- */
test('shared.js stamps its writes the same way', ()=>{
  const store=fakeStorage({});
  const S=loadShared(store);
  ok(S.saveLineupsLS(squad(),A));
  deepEq(store.writes,[STAMP,LU],'stamp first here too');
  eq(store.getItem(STAMP),A);
  ok(S.lineupsAreFor(A));
  notOk(S.lineupsAreFor(B));
});

test('shared.js refuses a no-match write over a stored squad', ()=>{
  const store=fakeStorage({[STAMP]:A,[LU]:JSON.stringify(squad())});
  const S=loadShared(store);
  notOk(S.saveLineupsLS(S.blankLineups(),null));
  deepEq(JSON.parse(store.getItem(LU)),squad());
});

test('the one-off migration stamps an older store, and only that one', ()=>{
  const store=fakeStorage({[LU]:JSON.stringify(squad())});
  const S=loadShared(store);
  S.migrateLineupStamp(A);
  eq(store.getItem(STAMP),A,'an unstamped store belongs to the match meta still names');
  S.migrateLineupStamp(B);
  eq(store.getItem(STAMP),A,'an existing stamp is never re-pointed');
});

/* ---- cloud-sync.js: the last line of defence before the database ---- */
function makeCloud(openMatch){
  const log={updates:[],warns:[]};
  const ctx={console:{warn:(...a)=>log.warns.push(a.join(' ')),log(){}},log,
    connected:true, matchId:openMatch,
    setTimeout:fn=>{fn();return 1;}, clearTimeout(){},
    sb:{from:()=>({update:v=>({eq:(_c,id)=>{log.updates.push({id,lineups:v.lineups});
      return Promise.resolve({error:null});}})})}};
  vm.createContext(ctx);
  vm.runInContext(grabConst('luTimer',CLOUD,'cloud-sync.js')+'\n'
    +grabFunction('onLineupsChanged',CLOUD,'cloud-sync.js'),ctx,{filename:'cloud-sync.js-lineups.js'});
  return {ctx,log};
}

test('cloud-sync saves a squad stamped for the open match', ()=>{
  const {ctx,log}=makeCloud(A);
  ctx.onLineupsChanged(squad(),A);
  eq(log.updates.length,1);
  eq(log.updates[0].id,A);
});

test('cloud-sync refuses a squad belonging to another match', ()=>{
  const {ctx,log}=makeCloud(A);
  ctx.onLineupsChanged(squad(),B);
  eq(log.updates.length,0,'match A must not be overwritten with match B\'s squad');
});

test('cloud-sync refuses an untagged squad (a window with no match open)', ()=>{
  const {ctx,log}=makeCloud(A);
  ctx.onLineupsChanged(blank(),null);
  ctx.onLineupsChanged(blank());
  eq(log.updates.length,0,'this was the wipe: an empty squad written over a real one');
});

test('cloud-sync writes nothing when no match is open at all', ()=>{
  const {ctx,log}=makeCloud(null);
  ctx.onLineupsChanged(squad(),A);
  eq(log.updates.length,0);
});
