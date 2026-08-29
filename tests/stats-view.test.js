/* Stats as a mountable view.

   The renderers did not change when they moved out of Stats/index.html — the
   rest of the suite still lifts them out by name and runs them, which is what
   proves that. What is new, and what this file guards, is the door they are
   reached through: who owns the data, when the view draws, and the handful of
   names that have to stay global because the maps write their own markup.

   shared.js and stats-view.js are plain browser scripts with no build step, so
   both run in a sandbox against a DOM stub. */
const fs=require('fs'), path=require('path'), vm=require('vm');
const {test,eq,ok,notOk}=require('./tiny-test');

const ROOT=path.join(__dirname,'..');
/* Folded to LF, the way harness.js's readSrc() has always folded it. Several assertions
   below scan the source for a literal \n ("const CHROME =…;\n", "buildPages(host){\n"),
   and git checks these files out with CRLF on Windows — so they matched on the machine
   that wrote them and on CI (ubuntu), and stopped matching the moment the same files were
   checked out fresh here. Nothing in this file wants a \r, so the fold costs nothing. */
const page=p=>fs.readFileSync(path.join(ROOT,p),'utf8').replace(/\r\n/g,'\n');
const VIEW=page('Stats/stats-view.js');
const PAGE=page('Stats/index.html');
const REPORT=page('Stats/report.js');
const SHARED=page('shared.js');
const YML=page('.github/workflows/deploy.yml');

/* ---------- a DOM small enough to reason about ---------- */
function makeDom(){
  const nodes={};
  const mk=id=>({id,style:{},className:'',textContent:'',innerHTML:'',dataset:{},
    onclick:null,
    querySelector:()=>null,querySelectorAll:()=>[],
    appendChild(){},addEventListener(){},getContext:()=>null});
  const document={
    getElementById:id=>nodes[id]||(nodes[id]=mk(id)),
    querySelector:sel=>nodes['sel:'+sel]||(nodes['sel:'+sel]=mk(sel)),
    querySelectorAll:()=>[],
    createElement:()=>mk('new')
  };
  return {document,nodes};
}

function load(){
  const {document,nodes}=makeDom();
  const win={};
  const ctx={console,window:win,document,
    localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
    location:{hash:'',search:''},
    setTimeout,clearTimeout,Math,JSON,Date};
  ctx.globalThis=ctx;
  vm.createContext(ctx);
  vm.runInContext(SHARED,ctx,{filename:'shared.js'});
  vm.runInContext(VIEW,ctx,{filename:'Stats/stats-view.js'});
  return {PTStats:win.PTStats,win,document,nodes,ctx};
}

/* ================= the door ================= */
test('the file hands back one object, and the whole surface is on it', () => {
  const {PTStats}=load();
  ok(PTStats,'window.PTStats exists');
  ['mount','update','destroy','data','render'].forEach(k=>
    eq(typeof PTStats[k],'function',k+'() is there'));
  eq(PTStats.schema,1,'and it declares which payload shape it reads');
});

test('a view that has not been mounted holds nothing, rather than last time-s match', () => {
  const {PTStats}=load();
  const d=PTStats.data();
  eq(d.rows.length,0);
  eq(d.meta.matchId,null,'no match is open');
  eq(d.dur.enabled,false);
  notOk(PTStats.isMounted());
});

const REPORT_PAYLOAD={
  meta:{home:'Saint Lucia',away:'Barbados',matchId:'m1',matchCode:'32746',sport:'football'},
  rows:[{t:10,team:'home',event:'goal',playerFrom:'9',pXY:{x:80,y:50}},
        {t:20,team:'home',event:'pass success',playerFrom:'8',playerTo:'9'},
        {t:30,team:'away',event:'shot on target',playerFrom:'7',pXY:{x:20,y:50}}],
  lineups:{home:{roster:[{no:9,name:'A'},{no:8,name:'B'}],xi:[{no:9,x:70,y:50},{no:8,x:50,y:50}],subs:[],dir:'lr'},
           away:{roster:[],xi:[],subs:[],dir:'rl'}},
  dur:{enabled:true,halfLen:45,h1Start:0,h1End:2700,h2Start:2800,h2End:5500}
};

test('mounting with a published report is what fills it', () => {
  const {PTStats,document}=load();
  PTStats.mount(document.getElementById('host'),REPORT_PAYLOAD,{});
  const d=PTStats.data();
  eq(d.rows.length,3);
  eq(d.meta.home,'Saint Lucia');
  eq(d.dur.h2Start,2800);
  ok(PTStats.isMounted());
});

test('and it draws — a report goes in, a page of stats comes out', () => {
  // the whole point of the extraction: no page, no localStorage, no Supabase,
  // no session. A payload and an element are enough to render.
  const {PTStats,document,nodes}=load();
  PTStats.mount(document.getElementById('host'),REPORT_PAYLOAD,{});
  const drawn=nodes.statsHolder.innerHTML;
  ok(drawn.length>2000,'something substantial was rendered — got '+drawn.length+' chars');
  ok(/Saint Lucia/.test(drawn)&&/Barbados/.test(drawn),'both sides are named in it');
});

test('a snapshot missing a part falls back rather than throwing', () => {
  // an old report, or one written before a field existed, is still a report
  const {PTStats,document}=load();
  PTStats.mount(document.getElementById('host'),{meta:{home:'A',away:'B',matchId:'m'}},{});
  const d=PTStats.data();
  eq(d.rows.length,0,'no rows given');
  ok(d.lineups.home&&d.lineups.away,'blank line-ups, not undefined');
  eq(d.dur.halfLen,45,'and the default half length');
});

test('destroy() lets go of everything it was holding', () => {
  const {PTStats,document}=load();
  const el=document.getElementById('host');
  PTStats.mount(el,{meta:{home:'A',away:'B',matchId:'m'},rows:[{t:1,team:'home',event:'goal'}]},{});
  PTStats.destroy();
  eq(PTStats.data().rows.length,0);
  eq(PTStats.data().meta.matchId,null);
  notOk(PTStats.isMounted(),'and it knows it is not mounted');
  eq(el.innerHTML,'','the host element is handed back empty');
});

test('mounting fetches nothing and subscribes to nothing on its own', () => {
  // the client site hands over a report; a view that went looking for data would
  // need a Supabase client, a session, and read access to public.events
  const mount=/function mount\([\s\S]*?\n\}/.exec(VIEW)[0];
  ok(/if\(opts\.local\)loadLocal\(\)/.test(mount),'localStorage only when the host asks');
  ok(/if\(opts\.cloud\)statsCloud\(\)/.test(mount),'and the cloud only when the host asks');
  ok(/if\(opts\.local\)watchLocalStorage\(\)/.test(mount),'same for the cross-tab listener');
});

/* ================= the names that must stay global ================= */
test('every function an inline handler names is published to window', () => {
  const {win}=load();
  // the maps write their own controls as markup: onclick="setHeatHalf(1)",
  // onmouseenter="shotHover(...)". Those are compiled against the global scope,
  // so a name left inside the closure is a dead button with nothing in the console.
  const named=new Set();
  const re=/on(?:click|change|mouseenter|mouseleave|input)=[\\"']*([a-zA-Z_][a-zA-Z0-9_]*)\(/g;
  for(let m;(m=re.exec(VIEW));) named.add(m[1]);
  ok(named.size>=10,'sanity: the markup names a good few — found '+named.size);
  named.forEach(n=>eq(typeof win[n],'function','window.'+n+' is missing — that control is dead'));
});

test('and nothing else is published, so the module is not leaking', () => {
  const {win}=load();
  const allowed=new Set(['PTStats','setDefHalf','setDefCat','setDistHalf','setDistCat',
    'setHeatHalf','setOthCat','defHover','distHover','heatHover','shotHover']);
  Object.keys(win).forEach(k=>ok(allowed.has(k),'window.'+k+' should not be there'));
  /* The other direction too: a name left on the whitelist after its control was removed
     is a name this test would go on excusing for ever. */
  allowed.forEach(n=>eq(typeof win[n],n==='PTStats'?'object':'function',
    'window.'+n+' is on the list but no longer published'));
});

/* ================= the two hosts ================= */
test('the Stats page mounts into its own markup and keeps both of its data paths', () => {
  ok(/<script src="stats-view\.js\?v=\d+"><\/script>/.test(PAGE),'the page loads the view');
  const call=/PTStats\.mount\([^;]*\);/.exec(PAGE)[0];
  ok(/chrome:\s*false/.test(call),'it brings its own header and toggles');
  ok(/local:\s*true/.test(call),'still reads the tagging tab-s localStorage');
  ok(/cloud:\s*true/.test(call),'and still follows a #match= link');
  ok(PAGE.indexOf('shared.js')<PAGE.indexOf('stats-view.js'),'shared.js first — the view uses it throughout');
});

test('the page kept the chrome every renderer reaches for by id', () => {
  ['noMatchMsg','teamToggle','catToggle','statsHolder',
   'viewOverallBtn','viewDashBtn','viewStatsBtn','statHomeBtn','statAwayBtn',
   'expXlsx','expCsv','expPdf'].forEach(id=>
    ok(PAGE.includes('id="'+id+'"'),'Stats/index.html still has #'+id));
});

test('a host with no chrome of its own is given the same ids', () => {
  const chrome=/const CHROME =([\s\S]*?);\n/.exec(VIEW)[1];
  ['noMatchMsg','teamToggle','catToggle','statsHolder',
   'viewOverallBtn','viewDashBtn','viewStatsBtn','statHomeBtn','statAwayBtn',
   'expXlsx','expCsv','expPdf'].forEach(id=>
    ok(chrome.includes('id="'+id+'"'),'the rendered chrome has #'+id));
  /* Read off PLAYER_CATS rather than typed out again: the tabs ARE its keys, and a
     category added there has to appear in both chromes or it is a tab nobody can reach.
     The Stats page's own markup is checked against the same list, so the two copies
     cannot drift apart either. */
  const keys=[...chrome.matchAll(/data-cat="([A-Za-z]+)"/g)].map(m=>m[1]);
  eq(keys.join(' '),'shooting distribution defensive goalkeeper setPieces fouls',
     'the six category tabs, in the order the table is read in');
  keys.forEach(k=>ok(PAGE.includes('data-cat="'+k+'"'),
    'Stats/index.html has the '+k+' tab too'));
});

/* ================= the PDF export follows the view ================= */
test('report.js reads the four values back out of the view', () => {
  ok(/const d=S&&S\.data&&S\.data\(\)/.test(REPORT),'it asks PTStats for them');
  ok(/const S=window\.PTStats/.test(REPORT),'and PTStats is the only place it looks');
  ok(/function buildPages\(host\)\{\n\s*sync\(\);/.test(REPORT),'and refreshes before building a page');
  ok(/async function exportPdf\(\)\{[\s\S]{0,300}?try\{sync\(\);\}/.test(REPORT),
     'and before an export, inside a catch — an async reject there is a silent no-op');
});

/* ---- the helpers, which is the half that was missing ----
   report.js was written against the Stats page's inline script and calls a
   dozen of its functions by bare name. Wrapping that script into a module
   left every one of them undefined, and a ⭳ PDF click threw "matchTime is
   not defined" before a single page was built. Both halves of the handover
   are checked, because either one alone brings it straight back. */
test('and the helpers it calls but does not define', () => {
  const {PTStats}=load();
  const names=/const HELPER_NAMES=\[([\s\S]*?)\];/.exec(REPORT);
  ok(names,'report.js lists the names it needs');
  const wanted=names[1].match(/'([^']+)'/g).map(s=>s.slice(1,-1));
  ok(wanted.length>=12,'sanity: there are a good few — found '+wanted.length);
  wanted.forEach(n=>ok(PTStats.helpers&&PTStats.helpers[n]!=null,
    'PTStats.helpers.'+n+' is missing — every call site of it throws'));
  ok(/\(\{matchTime,eventHalf/.test(REPORT),'and sync() binds them, not just the four values');
});

test('a view too old to hand them over says so, rather than failing per call site', () => {
  // a stale stats-view.js out of the browser cache is exactly how this happens,
  // and "matchTime is not a function" names neither the cause nor the cure
  const fn=/function sync\(\)\{[\s\S]*?\n\}/.exec(REPORT)[0];
  ok(/gone\.length\)throw new Error/.test(fn),'it throws once, up front');
  ok(/reload the page/.test(fn),'saying what to do about it');
  ok(/gone\.join/.test(fn),'and which names were missing');
});

test('a mounted report builds every page of the PDF', () => {
  /* The end-to-end the two tests above exist to protect: no html2canvas and no
     jsPDF — those are CDN libraries and a browser — but everything up to them,
     which is all of the report's own code. A name it cannot reach throws here
     exactly as it threw in the browser. */
  const {PTStats,document,ctx}=load();
  ctx.alert=m=>{throw new Error('unexpected alert: '+m);};
  PTStats.mount(document.getElementById('host'),REPORT_PAYLOAD,{});
  vm.runInContext(REPORT,ctx,{filename:'Stats/report.js'});

  const host=document.createElement('host');
  const pages=ctx.window.PTReport.buildPages(host);
  ok(pages.length>=20,'a full report is a couple of dozen pages — got '+pages.length);
  const html=pages.map(p=>p.innerHTML).join('');
  ok(html.length>20000,'and they carry something — got '+html.length+' chars');
  ok(/Saint Lucia/.test(html)&&/Barbados/.test(html),'both sides are named');
  ok(/1 <span[^>]*>–<\/span> 0/.test(html),'and the header carries the score the view worked out');
});

test('the PDF button is bound when it exists, not assumed', () => {
  // on the client site PTStats renders that button at mount time, which is after
  // report.js has run — binding once on load would have thrown on a missing node
  ok(/function bind\(\)\{const b=\$\('expPdf'\); if\(b\)b\.onclick=exportPdf;/.test(REPORT));
  ok(/window\.PTReport=\{buildPages,exportPdf,bind\}/.test(REPORT),'and a host can bind again later');
});

/* ================= the CSS a second shell can survive ================= */
const CSS=page('Stats/stats-view.css');
const SHARED_CSS=page('shared.css');
const PAGE_CSS=page('shared-page.css');

/* every selector in a stylesheet, @media blocks flattened */
function selectors(css){
  const out=[];
  css.replace(/\/\*[\s\S]*?\*\//g,'').replace(/@media[^{]*\{/g,'').split('}').forEach(b=>{
    const s=b.split('{')[0];
    if(!s||/^\s*@/.test(s))return;
    s.split(',').forEach(x=>{x=x.trim(); if(x)out.push(x);});
  });
  return out;
}
/* a selector that starts with a bare tag name dresses whatever page it lands on */
const bareTag=s=>/^[a-z][a-z0-9]*(\s|>|$|:)/i.test(s)&&!/^[.#]/.test(s);

test('nothing the client will load reaches for a bare html, body or header', () => {
  // the whole reason the split exists: shared.css used to carry
  // body{font-size:13px} and a sticky header, and the client site loads
  // shared.css now for the tokens the view draws with
  [['shared.css',SHARED_CSS],['Stats/stats-view.css',CSS]].forEach(([name,src])=>{
    const bleeds=selectors(src).filter(s=>bareTag(s)&&!/^\*|^:root/.test(s));
    eq(bleeds.join(', '),'',name+' would restyle the shell of any page that loads it');
  });
});

test('the page-level rules are still there, just somewhere only the tagger looks', () => {
  const s=selectors(PAGE_CSS);
  ['body','header','header h1','header h1 span'].forEach(sel=>
    ok(s.includes(sel),'shared-page.css keeps '+sel));
  ok(PAGE.includes('shared-page.css'),'Stats loads it');
  ok(page('Player-Lists/index.html').includes('shared-page.css'),'and so does Player-Lists');
});

test('the two pages that share shared.css ask for the same copy of it', () => {
  const v=s=>(/shared\.css\?v=(\d+)/.exec(s)||[])[1];
  eq(v(PAGE),v(page('Player-Lists/index.html')),'bumped in step, or one page gets the old file');
  ok(+v(PAGE)>=13,'and bumped, because the page rules left it');
});

test('both hosts of the view ask for the same copy of it', () => {
  // the Stats page loads it with a tag, the client site injects it from app.js —
  // bump one and not the other and the two sites run different shooting layouts
  const APP=page('client/assets/app.js');
  // report.js is in that list because the helpers it needs are handed over by
  // stats-view.js: one host on the old pair and the new report.js is a ⭳ PDF
  // that throws, which is the shape of the bug that put them there
  ['stats-view.js','stats-view.css','report.js'].forEach(f=>{
    const re=new RegExp(f.replace('.','\\.')+'\\?v=(\\d+)');
    const inPage=(re.exec(PAGE)||[])[1], inApp=(re.exec(APP)||[])[1];
    ok(inPage,'Stats/index.html versions '+f);
    eq(inApp,inPage,'client/assets/app.js loads '+f+' too, so it must be bumped in step');
  });
});

test('the shooting row gives its three cards named places', () => {
  // a wrapping flex row dropped the ranking below the map, which is two to three
  // times the donut's height — the table moved a long way for a small resize
  ok(/class="chart-row sh-row"><div class="sh-grid"/.test(VIEW),'the row is a grid, not a wrap');
  ok(/grid-template-areas:"donut" "map" "shots"/.test(CSS),'stacked is the base');
  ok(/grid-template-areas:"donut map" "shots map"/.test(CSS),'then the ranking tucks under the donut');
  ok(/grid-template-areas:"donut map shots"/.test(CSS),'and all three sit in a row when it fits');
  ok(/container-type:inline-size/.test(CSS)&&/@container \(min-width:/.test(CSS),
     'measured against the row, because the client site is 340px narrower than the Stats page');
});

test('the tokens the view draws with stayed in shared.css', () => {
  // moving these out would leave every .stats-* class unthemed on the client
  ok(/:root\{/.test(SHARED_CSS),'the token block is still there');
  ['--bg','--panel','--ink','--mut','--accent','--home','--away'].forEach(t=>
    ok(SHARED_CSS.includes(t+':'),'shared.css still defines '+t));
});

/* ================= shipping ================= */
test('the new files are staged for GitHub Pages', () => {
  ['cp Stats/stats-view.js','cp Stats/stats-view.css','cp shared-page.css']
    .forEach(line=>ok(YML.includes(line),'deploy.yml is missing: '+line));
});

test('the page asks for a fresh copy of what moved', () => {
  ok(/report\.js\?v=(\d+)/.test(PAGE),'report.js is versioned');
  ok(+(/report\.js\?v=(\d+)/.exec(PAGE)[1])>=30,'and bumped, because sync() changed again');
  ok(/stats-view\.js\?v=(\d+)/.test(PAGE),'stats-view.js is versioned');
  ok(+(/stats-view\.js\?v=(\d+)/.exec(PAGE)[1])>=3,'and bumped with it — it is the half that hands the helpers over');
});

test('the view no longer lives in the page', () => {
  notOk(/function renderStats\(\)/.test(PAGE),'the renderers are gone from Stats/index.html');
  ok(/function renderStats\(\)/.test(VIEW),'and are in stats-view.js');
  ok(/window\.PTStats = \(function \(\) \{/.test(VIEW),'wrapped, so its 130-odd names stay off the page');
});
