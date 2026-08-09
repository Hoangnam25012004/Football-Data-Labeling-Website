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
const page=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
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
  ok(/data-cat="shooting"/.test(chrome)&&/data-cat="other"/.test(chrome),'and the four category tabs');
});

/* ================= the PDF export follows the view ================= */
test('report.js reads the four values back out of the view', () => {
  ok(/window\.PTStats&&window\.PTStats\.data/.test(REPORT),'it asks PTStats for them');
  ok(/function buildPages\(host\)\{\n\s*sync\(\);/.test(REPORT),'and refreshes before building a page');
  ok(/async function exportPdf\(\)\{[\s\S]{0,60}sync\(\);/.test(REPORT),'and before an export');
});

test('the PDF button is bound when it exists, not assumed', () => {
  // on the client site PTStats renders that button at mount time, which is after
  // report.js has run — binding once on load would have thrown on a missing node
  ok(/function bind\(\)\{const b=\$\('expPdf'\); if\(b\)b\.onclick=exportPdf;/.test(REPORT));
  ok(/window\.PTReport=\{buildPages,exportPdf,bind\}/.test(REPORT),'and a host can bind again later');
});

/* ================= shipping ================= */
test('the new file is staged for GitHub Pages', () => {
  ok(YML.includes('cp Stats/stats-view.js'),'deploy.yml copies it — without this it is a 404');
});

test('the page asks for a fresh copy of what moved', () => {
  ok(/report\.js\?v=(\d+)/.test(PAGE),'report.js is versioned');
  ok(+(/report\.js\?v=(\d+)/.exec(PAGE)[1])>=29,'and bumped, because sync() changed it');
});

test('the view no longer lives in the page', () => {
  notOk(/function renderStats\(\)/.test(PAGE),'the renderers are gone from Stats/index.html');
  ok(/function renderStats\(\)/.test(VIEW),'and are in stats-view.js');
  ok(/window\.PTStats = \(function \(\) \{/.test(VIEW),'wrapped, so its 130-odd names stay off the page');
});
