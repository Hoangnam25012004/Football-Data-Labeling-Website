/* Test harness for the tagging logic that lives inside index.html.
   The app is one static HTML file with no build step and no module system, so the
   suite lifts the functions it needs straight out of the <script> (by name, with a
   brace-matching scan) and runs them in a vm sandbox against hand-written stubs for
   the DOM / video / cloud. Nothing is duplicated here: a rename or a behaviour change
   in index.html is picked up by the next run — or fails loudly as "not found".

   Run:  node tests/run.js         (from the repo root) */
const fs=require('fs'), path=require('path'), vm=require('vm');

const ROOT=path.join(__dirname,'..');
const SRC=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const EVENTS=JSON.parse(fs.readFileSync(path.join(ROOT,'pitchtagger_events.json'),'utf8'));

/* ---- source scanning: skip strings/comments so braces inside them don't count ---- */
function skipQuoted(s,i){
  const q=s[i]; i++;
  while(i<s.length){
    if(s[i]==='\\'){i+=2;continue}
    if(s[i]===q)return i+1;
    if(q!=='`'&&s[i]==='\n')return i;   // unterminated — can't happen in valid source
    i++;
  }
  return i;
}
// walk from `start` until `stop(depth,char)` says we are done; returns that index
function scan(s,start,stop){
  let depth=0,i=start;
  while(i<s.length){
    const c=s[i];
    if(c==='"'||c==="'"||c==='`'){i=skipQuoted(s,i);continue}
    if(c==='/'&&s[i+1]==='/'){while(i<s.length&&s[i]!=='\n')i++;continue}
    if(c==='/'&&s[i+1]==='*'){i=s.indexOf('*/',i)+2;continue}
    if('([{'.includes(c))depth++;
    else if(')]}'.includes(c))depth--;
    const end=stop(depth,c,i);
    if(end!=null)return end;
    i++;
  }
  throw new Error('unbalanced source while scanning from '+start);
}
/* `src`/`what` default to index.html; pass cloud-sync.js to lift its helpers too (their
   declarations sit indented inside the module IIFE, hence the optional leading blanks). */
function grabFunction(name,src,what){
  src=src||SRC; what=what||'index.html';
  const m=new RegExp('(?:^|\\n)[ \\t]*(?:async +)?function '+name+'\\s*\\(').exec(src);
  if(!m)throw new Error('function '+name+' not found in '+what);
  const from=m.index+(src[m.index]==='\n'?1:0);
  const brace=src.indexOf('{',m.index);        // params never destructure here
  const end=scan(src,brace,(d,c,i)=>c==='}'&&d===0?i+1:null);
  return src.slice(from,end);
}
function grabConst(name,src,what){
  src=src||SRC; what=what||'index.html';
  const m=new RegExp('(?:^|\\n)[ \\t]*(?:const|let) '+name+'\\s*=').exec(src);
  if(!m)throw new Error('const '+name+' not found in '+what);
  const from=m.index+(src[m.index]==='\n'?1:0);
  const end=scan(src,from,(d,c,i)=>c===';'&&d===0?i+1:null);
  return src.slice(from,end);
}

// everything the substitution / entry flow needs, in dependency order
const CONSTS=['numEq','FORMATION_GRID','PZ_COLORS','effCol','effRow',
  'TRANSFER_EVENTS','TRAILING_EXTRA_DOT','NEEDS_RECEIVER','newId','SHOT_EVENTS','evtClass',
  'GOAL_SPOT_EVENTS','GOAL_VIEW','goalCapture',
  'scrollToRow','editPrevTeam'];
const FUNCS=['fmt','parseTime','eventHalf','matchTime','zoneAt','eventForKey',
  'macroForKey','expandKey','parseChain','goalToPct','goalFromPct',
  'openGoalCapture','closeGoalCapture',
  'effectiveLU','planSubGroup','swapInSnapshot','applySubGroup','subSideEffects',
  'removeSubSideEffects','shiftSubRowsWithPeriod','applyRedCard','redSideEffects',
  'removeRedSideEffects','submitEntry','chainHTML','deleteRows','startEdit','startEditGroup'];

/* ---- a fresh sandbox per test, so no scenario can leak into the next ---- */
function makeApp(opts){
  opts=opts||{};
  const log={alerts:[],toasts:[],upserts:[],deletes:[],lineupSaves:0,fmModal:0};
  const els={};
  const el=id=>els[id]||(els[id]={id,value:'',textContent:'',style:{},dataset:{},
    classList:{add(){},remove(){},contains(){return false}},
    innerHTML:'',appendChild(){},querySelector(){return null},querySelectorAll(){return []},
    addEventListener(){},focus(){}});
  el('homeName').value=opts.homeName||'Home';
  el('awayName').value=opts.awayName||'Away';
  el('halfSel').value='1';

  const ctx={
    console,
    crypto:{randomUUID:(n=>()=>'id-'+(++n))(0)},
    log,
    state:opts.state,
    video:{src:'match.mp4',currentTime:opts.now==null?0:opts.now},
    window:{Cloud:{onLocalUpsert:r=>log.upserts.push(r),onLocalDelete:id=>log.deletes.push(id),
                   onLineupsChanged(){}}},
    document:{hasFocus:()=>false},
    $:el,
    alert:m=>log.alerts.push(m),
    toast:m=>log.toasts.push(m),
    curEvents:()=>EVENTS[opts.state.sport]||EVENTS.football,
    // macros are a per-sport list on state; a scenario opts in by seeding state.macros
    curMacros:()=>(opts.state.macros||{})[opts.state.sport]||[],
    saveLineups(){log.lineupSaves++},
    openFmModal(){log.fmModal++},
    // UI-only, irrelevant to what these tests assert. renderGoalCapture is the only part
    // of the goal mouth that touches the DOM — the gate itself (openGoalCapture setting
    // the spot, submitEntry refusing to write until it is there) is the real code.
    renderGoalCapture(){},
    renderTable(){},renderEvents(){},updateBanner(){},setTeam(t){opts.state.team=t},
    renderFormationMain(){},refreshFormation(){},saveRows(){},updateScore(){},
    pvRedraw:null,pvSyncEntry:null,
  };
  vm.createContext(ctx);
  // `function` declarations land on the context by themselves; const/let do not, so they
  // are re-exported explicitly (app.k.evtClass, …) for tests that need them directly
  vm.runInContext(CONSTS.map(n=>grabConst(n)).concat(FUNCS.map(n=>grabFunction(n))).join('\n')
    +'\n;globalThis.k={'+CONSTS.join(',')+'};',ctx,{filename:'index.html-extract.js'});
  return ctx;
}

/* type an entry the way a tagger does: optional dots, then Enter */
function submit(app,raw,dots){
  app.state.pendingDots=(dots||[]).map(d=>({x:d.x,y:d.y,t:d.t==null?app.video.currentTime:d.t}));
  app.$('playerInput').value=raw;
  app.submitEntry();
}
/* An entry holding a shot on target / goal is kept back for the spot the ball crossed the
   line at: the first Enter opens the goal mouth, the ball is moved onto the spot, and the
   second Enter writes the rows. This plays that round trip. `spot` is in mouth percentages
   and defaults to the middle, where the ball starts. The dots survive the first pass — the
   gate returns before they are consumed — so the second Enter needs nothing re-placed. */
function submitShot(app,raw,dots,spot){
  submit(app,raw,dots);
  if(spot)app.openGoalCapture('shot on target',spot);
  app.submitEntry();
}

/* shared.js is the plain script both sub-pages load. It has no top-level side effects,
   so the whole file runs in a sandbox and hands back its helpers (const/let bindings
   are not context properties, hence the explicit re-export). */
const SHARED=fs.readFileSync(path.join(ROOT,'shared.js'),'utf8');
const CLOUD=fs.readFileSync(path.join(ROOT,'cloud-sync.js'),'utf8');
const SHARED_EXPORTS=['esc','squadOnPitch','squadNames','playerLabel','withSquad',
  'computeStats','sortedPlayers','newStat','statRow','sumTeam','passMatrix','pct',
  'blankTeamLU','blankLineups','zoneAt','EVENT_INC','STAT_HEADERS','STAT_GROUPS',
  'TEAM_SECTIONS','numOf',
  'SHOT_KINDS','BODY_PARTS','shotBodyPart','shotList','shotColor','evKey','classifyCards',
  'FORMATION_GRID','effCol','effRow','PZ_ROW_TOP','PZ_ROW_H','cellAt','cellCentre',
  'BENCH_CELL','benchSpot','arrangeXI','MAX_XI',
  'PT_KEYS','loadLineups','saveLineupsLS','luStamp','lineupsAreFor','lineupsEmpty','migrateLineupStamp'];
function loadShared(store){
  const ctx={console,document:{getElementById:()=>null},location:{hash:''},
    localStorage:store||{getItem:()=>null,setItem(){}}};
  vm.createContext(ctx);
  vm.runInContext(SHARED+'\n;globalThis.S={'+SHARED_EXPORTS.join(',')+'};',ctx,{filename:'shared.js'});
  return ctx.S;
}

/* Stats/index.html is a second standalone page whose renderers live in its own inline
   <script> (again: no build step, no modules). Same trick as loadShared: shared.js plus
   the named functions/consts lifted out of the page, run as ONE script so their const
   bindings can see each other, with the page state (rows / meta / lineups / duration)
   injected as plain globals in place of the localStorage the real page reads.
   `state` -> {rows, meta, lineups, dur}; returns the requested names plus `holder`,
   the stand-in for #statsHolder that the render functions write into. */
const STATS=fs.readFileSync(path.join(ROOT,'Stats','index.html'),'utf8');
function loadStats(state,names){
  const holder={innerHTML:''};
  const ctx={console,document:{getElementById:()=>holder},location:{hash:''},
    localStorage:{getItem:()=>null,setItem(){}}};
  vm.createContext(ctx);
  const consts=(names.consts||[]).map(n=>grabConst(n,STATS,'Stats/index.html'));
  const funcs=(names.funcs||[]).map(n=>grabFunction(n,STATS,'Stats/index.html'));
  vm.runInContext([SHARED,
    'var rows='+JSON.stringify(state.rows||[])+';',
    'var meta='+JSON.stringify(state.meta||{home:'Home',away:'Away',sport:'football'})+';',
    'var lineups='+JSON.stringify(state.lineups||{})+';',
    'var dur='+JSON.stringify(state.dur||{enabled:false,halfLen:45,h1Start:0,h1End:0,h2Start:0,h2End:0})+';',
    consts.join('\n'), funcs.join('\n'),
    ';globalThis.P={rows,meta,lineups,dur,'
      +(names.consts||[]).concat(names.funcs||[]).join(',')+'};'
  ].join('\n'),ctx,{filename:'Stats/index.html-extract.js'});
  return Object.assign({holder},ctx.P);
}

/* a localStorage stand-in that also records the ORDER of the writes — the lineups store
   and its match stamp must land in the right sequence for other tabs to read them */
function fakeStorage(seed){
  const map=new Map(Object.entries(seed||{})), writes=[];
  return {writes,
    getItem:k=>map.has(k)?map.get(k):null,
    setItem(k,v){map.set(k,String(v));writes.push(k);},
    removeItem(k){map.delete(k);},
    snapshot:()=>Object.fromEntries(map)};
}

module.exports={makeApp,submit,submitShot,grabFunction,grabConst,loadShared,loadStats,fakeStorage,
  SRC,SHARED,STATS,CLOUD,EVENTS};
