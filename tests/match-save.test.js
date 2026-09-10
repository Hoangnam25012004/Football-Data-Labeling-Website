/* Saving a match — the squad and the clock — must reach the database, and must not be
   thrown away on the way back.

   Reported twice, as two bugs, with one cause and one extra:

     1. Player lists → ⇪ Submit home answered
        "⚠ cloud save failed: permission denied for table matches", the tagging tab still
        drew the formation, and a reload lost the formation and the substitutes on BOTH
        pages.
     2. Duration was filled in for both halves and was blank again after a reload.

   Migration 0023 is the cause the two share: it revoked UPDATE on public.matches from
   `authenticated`, which the tagging app also runs under, so lineups / config / team
   names / video_url stopped reaching the database in early September 2026. 0025 gives
   those five columns back (guarded in match-edit.test.js). What is guarded HERE is
   everything the browser then has to get right, because a write that cannot land must
   not also destroy the only copy that exists:

     A. an EMPTY lineups object arriving from the cloud is "the cloud has nothing", not
        "the squad is empty" — taking it was the wipe;
     B. the same rule on the Player lists page;
     C. saveLineupsLS / writeLineupsLS return the truth, so "sent" is never a lie;
     D. the clock is stamped for one match, like the squad, so match B cannot inherit
        match A's kick-off times;
     E. the duration store is declared BEFORE `state` — it was not, so loadDuration() read
        a const in its temporal dead zone, threw into its own catch and silently returned
        the blank default. That is the OTHER half of bug 2: the clock was in localStorage
        the whole time and the app never read it back at boot;
     F. a failed cloud write is shown, not whispered into console.warn. */
const {test,eq,ok,notOk,deepEq}=require('./tiny-test');
const {grabFunction,grabConst,fakeStorage,readSrc,SRC,SHARED,STATS,CLOUD}=require('./harness');
const vm=require('vm');

const MATCH='744ffee4-ad8a-47e9-aeed-2205e6380848';
const OTHER='9fd26c4c-34a4-4cfd-b9a8-df81334866db';
const SQUAD={home:{roster:[{no:'9',name:'Nazon'}],xi:[{no:'9',x:50,y:50,pos:'ST'}],subs:['15','17'],dir:'lr'},
             away:{roster:[],xi:[],subs:[],dir:'rl'}};
const EMPTY={home:{roster:[],xi:[],subs:[],dir:'lr'},away:{roster:[],xi:[],subs:[],dir:'rl'}};

/* the real storage layer out of index.html, run against a fake localStorage */
function taggerStore(seed){
  const ls=fakeStorage(seed);
  const ctx={localStorage:ls,console,JSON,String,Object,Array,Math};
  ctx.globalThis=ctx; vm.createContext(ctx);
  const code=['LU_STORE','LU_MATCH_STORE','blankTeamLU','teamLUEmpty','lineupsEmpty','lineupsAreFor']
    .map(n=>grabConst(n)).concat(['loadLineups','luStamp','writeLineupsLS'].map(n=>grabFunction(n))).join('\n');
  vm.runInContext(code+'\n;globalThis.__x={loadLineups,writeLineupsLS,lineupsAreFor,lineupsEmpty};',ctx);
  return Object.assign({ls},ctx.__x);
}
/* and the sub-pages' copy of it out of shared.js */
function sharedStore(seed){
  const ls=fakeStorage(seed);
  const ctx={localStorage:ls,console,JSON,String,Object,Array,Math};
  ctx.globalThis=ctx; vm.createContext(ctx);
  const code=['PT_KEYS','blankTeamLU','blankLineups','luStamp','lineupsAreFor','teamLUEmpty','lineupsEmpty',
              'durStamp','durationIsFor'].map(n=>grabConst(n,SHARED,'shared.js'))
    .concat(['loadJSON','loadLineups','saveLineupsLS'].map(n=>grabFunction(n,SHARED,'shared.js'))).join('\n');
  vm.runInContext(code+'\n;globalThis.__x={loadLineups,saveLineupsLS,lineupsAreFor,lineupsEmpty,durationIsFor};',ctx);
  return Object.assign({ls},ctx.__x);
}
const seeded=(stamp,squad)=>({'pitchtagger.lineups.v1':JSON.stringify(squad||SQUAD),
                              'pitchtagger.lineups.match.v1':stamp});
const xiOf=l=>l.home.xi.length, subsOf=l=>l.home.subs.length;

/* ================= A. the wipe itself ================= */

test('an empty lineups object from the cloud is not handed to applyCloudLineups', () => {
  const open=/async function openMatchRow\(row\) \{[\s\S]*?\n    subscribe\(\);/.exec(CLOUD)[0];
  ok(/if \(row\.lineups && !\(PT\(\)\.lineupsEmpty && PT\(\)\.lineupsEmpty\(row\.lineups\)\)\) PT\(\)\.applyCloudLineups/
     .test(open),'the emptiness of the cloud copy is tested before it is applied');
  ok(/else if \(PT\(\)\.resetLineups\) PT\(\)\.resetLineups\(row\.id\)/.test(open),
     'and an empty one goes where a missing one goes: the reset path');
  ok(/lineupsEmpty/.test(/window\.PT=\{[\s\S]*?\};/.exec(SRC)[0]),
     'lineupsEmpty is on the PT bridge for cloud-sync to reach');
});

test('resetLineups keeps a stamped, non-empty local squad — that is what saves it', () => {
  const fn=grabFunction('resetLineups');
  ok(/lineupsAreFor\(id\)&&!lineupsEmpty\(local\)/.test(fn),'both conditions, not one');
  ok(/state\.lineups=local/.test(fn),'the local copy becomes the open one');
  ok(/onLineupsChanged\(local,id\)/.test(fn),'and is pushed back up, so the row stops being empty');
});

test('the squad that reaches the reset path survives a reload', () => {
  // exactly the reported state: submitted, cloud refused it, the copy is stamped for the match
  const s=taggerStore(seeded(MATCH));
  eq(xiOf(s.loadLineups()),1,'the squad is in the store to begin with');
  ok(s.lineupsAreFor(MATCH)&&!s.lineupsEmpty(s.loadLineups()),
     'resetLineups would adopt it rather than blank it');
  // and the guard above is what routes an empty cloud copy here instead of over the top of it
  ok(s.lineupsEmpty(EMPTY),'an empty-but-shaped cloud copy reads as empty');
  notOk(s.lineupsEmpty(SQUAD),'a real one does not');
});

test('a live UPDATE carrying an empty squad still arrives — clearing one is a real action', () => {
  const sub=/function subscribe\(\) \{[\s\S]*?\n  \}/.exec(CLOUD)[0];
  ok(/if \(p\.new\.lineups\) PT\(\)\.applyCloudLineups\(p\.new\.lineups, matchId\)/.test(sub),
     'the realtime handler is deliberately NOT given the open-match rule');
  ok(/real news/.test(sub),'and says why, so it is not "fixed" to match');
});

/* ================= B. the same rule on Player lists ================= */

test('Player lists reads an empty cloud copy as nothing, and pushes its own back up', () => {
  const PL=readSrc('Player-Lists/index.html');
  const fn=/async function loadMatchLineups\(\)\{[\s\S]*?\n\}/.exec(PL)[0];
  ok(/const cloud=\(raw&&!lineupsEmpty\(raw\)\)\?raw:null;/.test(fn),
     'the empty one becomes null rather than the published copy');
  ok(/if\(!\(cloud&&cloud\.home&&cloud\.away\)&&hadLocal\)pushPublished\(published,id,null\)/.test(fn),
     'which arms the push that repairs the row');
  notOk(/const cloud=data&&data\.lineups;/.test(fn),'the old unconditional read is gone');
});

/* ================= C. "sent" must not be a lie ================= */

test('a refused write reports false rather than true', () => {
  const both=[grabFunction('writeLineupsLS'),grabFunction('saveLineupsLS',SHARED,'shared.js')];
  both.forEach((fn,i)=>{
    const where=i?'shared.js':'index.html';
    ok(/catch\(e\)\{[\s\S]*?return false;[\s\S]*?\}/.test(fn),where+': a throw returns false');
    ok(/localStorage\.removeItem\(|setItem\([A-Z_]*[a-zA-Z.]*Match[a-zA-Z]*,prev\)/.test(fn),
       where+': and the stamp is put back');
  });
});

test('a store that refuses the squad leaves the stamp where it was', () => {
  // quota, or a browser refusing storage: the first write lands, the second throws
  const s=taggerStore(seeded(OTHER));
  let n=0;
  const real=s.ls.setItem.bind(s.ls);
  s.ls.setItem=(k,v)=>{ if(++n===2) throw new Error('QuotaExceededError'); real(k,v); };
  eq(s.writeLineupsLS(SQUAD,MATCH),false,'the caller is told nothing was stored');
  eq(s.ls.getItem('pitchtagger.lineups.match.v1'),OTHER,
     'and the stamp still names the match whose squad is actually in the store');
  notOk(s.lineupsAreFor(MATCH),'so lineupsAreFor does not claim this match owns it');
});

test('publishTeam already refuses on a false return — now that return can happen', () => {
  const PL=readSrc('Player-Lists/index.html');
  ok(/if\(!saveLineupsLS\(P,id\)\)\{setSaveStatus\('⚠ could not save the squad',true\);return;\}/.test(PL),
     'the branch is there and stops before it claims the squad was sent');
});

/* ================= D. the clock belongs to one match ================= */

test('the duration store is stamped, exactly as the lineups store is', () => {
  ok(/const DUR_MATCH_STORE='pitchtagger\.duration\.match\.v1';/.test(SRC),'the tagging app has a stamp key');
  ok(/durationMatch:'pitchtagger\.duration\.match\.v1',/.test(SHARED),'and shared.js names the same one');
  const save=grabFunction('saveDuration');
  ok(save.indexOf('DUR_MATCH_STORE')<save.indexOf('DUR_STORE'),
     'stamp first, then the clock — the order writeLineupsLS uses, for the same reason');
  const load=grabFunction('loadDuration');
  ok(/durationIsFor\(loadTeamIds\(\)\.matchId\)/.test(load),
     'and a clock stamped for another match is not loaded');
});

test('opening a match with no clock of its own does not inherit the last one', () => {
  const open=/async function openMatchRow\(row\) \{[\s\S]*?\n    subscribe\(\);/.exec(CLOUD)[0];
  ok(/if \(row\.config && Object\.keys\(row\.config\)\.length\) PT\(\)\.applyCloudDuration\(row\.config, row\.id\)/
     .test(open),'config is `not null default {}`, so an empty one has to be tested for');
  ok(/else if \(PT\(\)\.resetDuration\) PT\(\)\.resetDuration\(row\.id\)/.test(open),'and it goes to the reset path');
  const fn=grabFunction('resetDuration');
  ok(/durationIsFor\(id\)/.test(fn),'which keeps a clock stamped for THIS match');
  ok(/onDurationChanged\(state\.duration,id\)/.test(fn),'and puts it up where the report can read it');
  ok(/state\.duration=blankDur\(\)/.test(fn),'and otherwise starts blank rather than borrowing');
});

test('the Stats page reads the clock through the same stamp check as the squad', () => {
  ok(/const ourDur=\(\)=>durationIsFor\(loadMeta\(\)\.matchId\)\?loadJSON\(PT_KEYS\.duration,blankDur\(\)\):blankDur\(\);/
     .test(STATS),'ourDur mirrors ourLineups');
  notOk(/dur=loadJSON\(PT_KEYS\.duration,blankDur\(\)\)/.test(STATS),'no bare read left at boot');
  ok(/e\.key===PT_KEYS\.duration\|\|e\.key===PT_KEYS\.durationMatch/.test(STATS),
     'the stamp landing on its own re-reads too — it is written before the clock');
  ok(/PT_KEYS\.meta\)\{meta=loadMeta\(\);lineups=ourLineups\(\);dur=ourDur\(\)/.test(STATS),
     'and a match change re-reads the clock with the squad');
});

/* ================= E. the temporal dead zone that ate the clock ================= */

test('the duration store is declared BEFORE state, or loadDuration() reads a dead name', () => {
  /* This is bug 2's other half, and it is invisible: loadDuration() runs while the `state`
     object literal is being built. With `const DUR_STORE` below that literal, the read hit
     the temporal dead zone, the ReferenceError landed in loadDuration()'s own try/catch and
     the function returned the blank default — every single boot. The clock was in
     localStorage the whole week; the app simply never read it back.
     LU_STORE was moved above `state` for this exact reason, with a comment saying so. */
  const iState=SRC.indexOf('const state = {');
  ['DUR_STORE','DUR_MATCH_STORE','blankDur','durationIsFor','LU_STORE','LU_MATCH_STORE'].forEach(n=>{
    const i=SRC.search(new RegExp('\\nconst '+n+'\\s*='));
    ok(i>0,n+' is declared');
    ok(i<iState,n+' is declared before `state` uses it');
  });
  // and the loader really is called from inside that literal — the thing that makes it matter
  ok(/\n  duration:loadDuration\(\),/.test(SRC),'state.duration is filled by loadDuration()');
  ok(/\n  lineups:loadLineups\(\),/.test(SRC),'and state.lineups by loadLineups()');
});

/* ================= F. a failed write is shown ================= */

test('every write onto the match row reports its failure to the user', () => {
  ok(/function saveFailed\(what, error\) \{/.test(CLOUD),'there is one place that reports it');
  const fn=/function saveFailed\(what, error\) \{[\s\S]*?\n  \}/.exec(CLOUD)[0];
  ok(/status\(/.test(fn),'it reaches the ☁ Cloud / ⚽ Match status line');
  ok(/PT\(\)\.toast/.test(fn),'and a toast, since neither modal need be open');
  ok(/saved on this computer only/.test(fn),'and says what the failure MEANS, not just its text');
  ['video','team names','duration','lineups'].forEach(w=>
    ok(new RegExp("saveFailed\\('"+w+"', error\\)").test(CLOUD),w+' goes through it'));
  // the four that used to whisper
  ['video_url save:','match name update:','duration save:','lineups save:'].forEach(old=>
    notOk(new RegExp("console\\.warn\\('"+old.replace(/[:.]/g,'\\$&')).test(CLOUD),
      'no bare console.warn left for '+JSON.stringify(old)));
});

test('a debounced clock write names the match it belongs to', () => {
  /* Both writes onto the match row are debounced, so both can land after the user has
     moved on. onLineupsChanged has always named its match; the clock did not, and would
     have written one match's kick-off times onto whichever row was open 250ms later —
     the very thing the stamp above exists to prevent, arriving from the other side. */
  const fn=/function onDurationChanged\(d, forMatchId\) \{[\s\S]*?\n  \}/.exec(CLOUD);
  ok(fn,'it takes the match its copy belongs to');
  ok(/String\(forMatchId \|\| ''\) !== String\(matchId\)/.test(fn[0]),'and refuses a copy from another match');
  ok(/if \(forId !== matchId\) return;/.test(fn[0]),'and again after the wait, in case the match changed');
  // every caller hands it one
  ok(/onDurationChanged\(d,state\.teamIds\.matchId\)/.test(SRC),'applyDur names the open match');
  ok(/onDurationChanged\(state\.duration,id\)/.test(SRC),'and so does resetDuration');
});
