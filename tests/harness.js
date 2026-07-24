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
function grabFunction(name){
  const m=new RegExp('(?:^|\\n)function '+name+'\\s*\\(').exec(SRC);
  if(!m)throw new Error('function '+name+' not found in index.html');
  const from=m.index+(SRC[m.index]==='\n'?1:0);
  const brace=SRC.indexOf('{',m.index);        // params never destructure here
  const end=scan(SRC,brace,(d,c,i)=>c==='}'&&d===0?i+1:null);
  return SRC.slice(from,end);
}
function grabConst(name){
  const m=new RegExp('(?:^|\\n)(?:const|let) '+name+'\\s*=').exec(SRC);
  if(!m)throw new Error('const '+name+' not found in index.html');
  const from=m.index+(SRC[m.index]==='\n'?1:0);
  const end=scan(SRC,from,(d,c,i)=>c===';'&&d===0?i+1:null);
  return SRC.slice(from,end);
}

// everything the substitution / entry flow needs, in dependency order
const CONSTS=['numEq','FORMATION_GRID','PZ_COLORS','effCol','effRow',
  'TRANSFER_EVENTS','TRAILING_EXTRA_DOT','newId','SHOT_EVENTS','evtClass',
  'scrollToRow','editPrevTeam'];
const FUNCS=['fmt','parseTime','eventHalf','matchTime','zoneAt','eventForKey','parseChain',
  'effectiveLU','planSubGroup','swapInSnapshot','applySubGroup','subSideEffects',
  'removeSubSideEffects','applyRedCard','redSideEffects','removeRedSideEffects',
  'submitEntry','chainHTML','deleteRows','startEdit','startEditGroup'];

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
    saveLineups(){log.lineupSaves++},
    openFmModal(){log.fmModal++},
    // UI-only, irrelevant to what these tests assert
    renderTable(){},renderEvents(){},updateBanner(){},setTeam(t){opts.state.team=t},
    renderFormationMain(){},refreshFormation(){},saveRows(){},updateScore(){},
    pvRedraw:null,pvSyncEntry:null,
  };
  vm.createContext(ctx);
  // `function` declarations land on the context by themselves; const/let do not, so they
  // are re-exported explicitly (app.k.evtClass, …) for tests that need them directly
  vm.runInContext(CONSTS.map(grabConst).concat(FUNCS.map(grabFunction)).join('\n')
    +'\n;globalThis.k={'+CONSTS.join(',')+'};',ctx,{filename:'index.html-extract.js'});
  return ctx;
}

/* type an entry the way a tagger does: optional dots, then Enter */
function submit(app,raw,dots){
  app.state.pendingDots=(dots||[]).map(d=>({x:d.x,y:d.y,t:d.t==null?app.video.currentTime:d.t}));
  app.$('playerInput').value=raw;
  app.submitEntry();
}

/* shared.js is the plain script both sub-pages load. It has no top-level side effects,
   so the whole file runs in a sandbox and hands back its helpers (const/let bindings
   are not context properties, hence the explicit re-export). */
const SHARED=fs.readFileSync(path.join(ROOT,'shared.js'),'utf8');
const SHARED_EXPORTS=['esc','squadOnPitch','squadNames','playerLabel','withSquad',
  'computeStats','sortedPlayers','newStat','statRow','sumTeam','passMatrix','pct',
  'blankTeamLU','zoneAt','EVENT_INC','STAT_HEADERS','STAT_GROUPS',
  'SHOT_KINDS','BODY_PARTS','shotBodyPart','shotList','shotColor','evKey'];
function loadShared(){
  const ctx={console,document:{getElementById:()=>null},location:{hash:''},
    localStorage:{getItem:()=>null,setItem(){}}};
  vm.createContext(ctx);
  vm.runInContext(SHARED+'\n;globalThis.S={'+SHARED_EXPORTS.join(',')+'};',ctx,{filename:'shared.js'});
  return ctx.S;
}

module.exports={makeApp,submit,grabFunction,grabConst,loadShared,SRC,SHARED,EVENTS};
