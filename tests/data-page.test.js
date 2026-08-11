/* The Data view: Overview and Team Data.

   What the page shows is worked out from the reports Submit Analysis froze,
   through shared.js's stat engine — there is no second implementation of a
   metric here, and these tests are what says so. The rendering itself is
   checked by reading the source rather than by driving a browser: this repo
   has no build step and no DOM in the runner, and every other client test
   works the same way.

   The one thing that IS executed is supa.js's reports(), against the same
   stand-in Supabase client the channel tests use. */
const fs=require('fs'), path=require('path'), vm=require('vm');
const {test,eq,ok,notOk}=require('./tiny-test');
const {grabFunction}=require('./harness');

const ROOT=path.join(__dirname,'..');
const page=p=>fs.readFileSync(path.join(ROOT,p),'utf8');

const SUPA=page('client/assets/supa.js');
const APPJS=page('client/assets/app.js');
const APPCSS=page('client/assets/app.css');
const SHARED=page('shared.js');
const YML=page('.github/workflows/deploy.yml');

const renderData=/function renderData\(view\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
const teamData=/function renderTeamData\(body, cat\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
const overview=/function renderOverview\(body\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];

/* ---------- a Supabase client that answers from a handler ---------- */
function fakeDB(handler){
  const calls=[];
  function chain(state){
    const api={
      select(c){state.cols=c;return api;},
      order(c,o){state.order=[c,o||null];return api;},
      eq(k,v){state.filters.push(['eq',k,v]);return api;},
      in(k,v){state.filters.push(['in',k,v]);return api;},
      limit(n){state.limit=n;return api;},
      then(onOk,onErr){
        calls.push(state);
        let out;
        try{out=handler(state);}
        catch(e){return Promise.reject(e).then(onOk,onErr);}
        return Promise.resolve(out===undefined?{data:[],error:null}:out).then(onOk,onErr);
      }
    };
    return api;
  }
  const client={
    from(table){return {select(c){return chain({table,op:'select',cols:c,filters:[]});}};},
    auth:{getSession:()=>Promise.resolve({data:{session:{user:{id:'u1'}}}})}
  };
  return {client,calls};
}
function loadAPI(handler){
  const db=fakeDB(handler);
  const win={supabase:{createClient:()=>db.client}};
  const ctx={console,window:win,URLSearchParams,Promise};
  vm.createContext(ctx);
  vm.runInContext(SUPA,ctx,{filename:'client/assets/supa.js'});
  return {api:win.HNA,calls:db.calls};
}

/* ================= scenarios, kicked off at load ================= */
const res={};

/* two versions of one report, and one of another */
(function(){
  const {api,calls}=loadAPI(()=>({error:null,data:[
    {match_id:'m1',version:1,payload:{rows:['v1']}},
    {match_id:'m2',version:1,payload:{rows:['other']}},
    {match_id:'m1',version:2,payload:{rows:['v2']}}
  ]}));
  res.repCalls=calls;
  api.reports(['m1','m2']).then(r=>{res.reports=r;},e=>{res.repErr=e;});
})();

/* more matches than fit in one request */
(function(){
  const ids=[];
  for(let i=0;i<45;i++)ids.push('m'+i);
  const {api,calls}=loadAPI(()=>({error:null,data:[]}));
  res.chunkCalls=calls;
  api.reports(ids).then(()=>{},()=>{});
})();

/* the table is not there yet */
(function(){
  const {api}=loadAPI(()=>({data:null,error:{code:'42P01',message:'relation "public.match_reports" does not exist'}}));
  api.reports(['m1']).then(()=>{},e=>{res.repMissing=e;});
})();

/* ================= reading them ================= */
test('the newest version of each report is the one kept', () => {
  eq(res.reports.m1.rows[0],'v2','version 2 wins over version 1');
  eq(res.reports.m2.rows[0],'other','and a match with one version is untouched');
  const c=res.repCalls[0];
  eq(c.table,'match_reports','it reads the signed-off reports, not public.events');
  eq(JSON.stringify(c.order),JSON.stringify(['version',{ascending:true}]),
     'ordered oldest-first, because the last row written into the map is the one that survives');
  eq(JSON.stringify(c.filters),JSON.stringify([['in','match_id',['m1','m2']]]),
     'and asks for the whole channel in one go');
});

test('a channel of many matches is asked for in chunks', () => {
  eq(res.chunkCalls.length,3,'45 ids go out as 20 + 20 + 5, not as one URL of 45');
  res.chunkCalls.forEach(c=>ok(c.filters[0][2].length<=20,'no chunk is over the limit'));
});

test('a missing table says which migration is missing, as everything else does', () => {
  ok(/0014_channel_admin\.sql/.test(res.repMissing.message),
     'the error is put through asError rather than passed on raw');
});

test('reports() asks for no more of the row than the view draws', () => {
  eq(res.repCalls[0].cols,'match_id,version,payload',
     'no event_count, no published_at, no club_id — a payload is big enough on its own');
});

/* ================= the two sections ================= */
test('Data is Overview and Team Data, and which one is open is in the URL', () => {
  ok(/renderData\(view\) \{\n    if \(!state\.channel\)/.test(APPJS),
     'it still checks for a channel before it reads one');
  ok(/'#\/data\/' \+ t\[0\]/.test(APPJS),'a tab click is a hash change');
  ok(/rest\[0\] === 'team'/.test(renderData),'and the hash is what decides which section');
  ok(/if \(onTeam\) renderTeamData\(body, cat\); else renderOverview\(body\);/.test(renderData),
     'one of the two is drawn, never both');
  // route() lights the rail from parts[0], so a sub-route must not unlight Data
  const route=/function route\(\)[\s\S]*?\n  \}/.exec(APPJS)[0];
  ok(/parts\[0\] === 'data'/.test(route),'#/data/team/... still lights Data on the rail');
});

test('an unknown category falls back rather than drawing an empty table', () => {
  ok(/TD_TABS\.some\(function \(t\) \{ return t\[0\] === rest\[1\]; \}\) \? rest\[1\] : 'shooting'/.test(renderData),
     '#/data/team/nonsense opens Shooting');
});

/* ================= where the numbers come from ================= */
test('every figure comes from a submitted report, through shared.js', () => {
  const agg=/function aggregate\(m\)[\s\S]*?\n  \}/.exec(APPJS)[0];
  ok(/state\.reports/.test(agg),'the source is the reports, not the match_stats view');
  ok(/window\.sumTeam\(rep\.rows, m\.side\)/.test(agg)&&/window\.sumTeam\(rep\.rows, other\)/.test(agg),
     'both sides, so possession and goals conceded have something to be worked out against');
  ok(/window\.computeStats\(rep\.rows, m\.side\)/.test(agg),'and the club-s own side per player');
  // the whole point: no second copy of a metric on this page
  notOk(/EVENT_INC|newStat\(\) *=|function computeStats/.test(APPJS),
        'app.js defines no stat engine of its own');
});

test('the four categories are shared.js-s own team sections, by name', () => {
  const titles=[...APPJS.matchAll(/\['(?:shooting|distribution|defensive|other)', *'[^']+', *'([^']+)'\]/g)]
    .map(m=>m[1]);
  eq(titles.length,4,'four tabs');
  titles.forEach(t=>ok(SHARED.includes("['"+t+"',"),
    'TEAM_SECTIONS still has a section called '+t));
});

test('Possession is a fixed column, so Distribution does not print it twice', () => {
  ok(/c\[0\] !== 'Possession %'/.test(APPJS),'the section-s own copy is filtered out');
  ok(/<th class="c-date" rowspan="2">Date<\/th>/.test(teamData)&&
     /<th class="c-opp" rowspan="2">Opposing team<\/th>/.test(teamData)&&
     /<th class="c-res" rowspan="2">Result<\/th>/.test(teamData)&&
     /<th class="c-sc" rowspan="2">Score<\/th>/.test(teamData)&&
     /<th rowspan="2">Possession<\/th>/.test(teamData),
     'and all five fixed columns are on every category');
});

test('Team Data is the matches and nothing else — no campaign row, no note', () => {
  notOk(/class="tot"|Campaign/.test(teamData),'the totals row is gone');
  notOk(/mean of ratios|Click a row to open/.test(teamData),'and the paragraph under it with it');
  notOk(/tr\.tot/.test(APPCSS),'nothing still styles a row that is never drawn');
  // a row is still the way into a match, it just no longer says so in prose
  ok(/tr\[data-go\]/.test(teamData),'clicking a row still opens that match');
});

test('what the whole campaign came to is worked out on the Overview', () => {
  const tot=/function totalOf\(aggs, which\)[\s\S]*?\n  \}/.exec(APPJS)[0];
  ok(/window\.newStat\(\)/.test(tot),'the totals start from shared.js-s own zero row');
  // one ratio of the totals, never a mean of per-match ratios
  ok(/pct\(S\.passesComp, S\.passes\)/.test(overview)&&
     /pct\(S\.passes, S\.passes \+ O\.passes\)/.test(overview),
     'pass accuracy and possession are computed from the summed passes');
  ok(/totalOf\(aggs, 'us'\), O = totalOf\(aggs, 'them'\)/.test(overview),'both sides are summed');
});

/* ================= grouped headers ================= */
test('only adjacent columns of one group are spanned', () => {
  ok(/while \(g && j < cols\.length && TD_GROUP\[cols\[j\]\[0\]\] === g\) j\+\+;/.test(teamData),
     'the run stops at the first column that is not in the group');
  ok(/if \(g && j - i > 1\)/.test(teamData),
     'a group of one is drawn as a plain column, so a reordered section cannot make a wrong span');
  ok(/'<th rowspan="2">' \+ esc\(cols\[i\]\[0\]\)/.test(teamData),
     'and an ungrouped column spans both header rows instead of leaving a hole');
});

test('every grouped label is a column some section actually has', () => {
  const grp=/var TD_GROUP = \{[\s\S]*?\n  \};/.exec(APPJS)[0];
  const labels=[...grp.matchAll(/'([^']+)': '[^']+'/g)].map(m=>m[1]);
  ok(labels.length>20,'the map is not empty');
  labels.forEach(l=>ok(SHARED.includes("['"+l+"',"),
    'TEAM_SECTIONS still has a column called '+l));
});

/* ================= what the page does NOT pull in ================= */
test('the Data view fetches the stat engine and nothing heavier', () => {
  const src=/function dataSource\(\)[\s\S]*?\n  \}/.exec(APPJS)[0];
  ok(/loadShared\(\)/.test(src),'shared.js, for computeStats and TEAM_SECTIONS');
  notOk(/loadStatsView|xlsx|stats-view/.test(src),
        'and not the spreadsheet library, the renderers or the tagging app-s stylesheets');
  const shared=/function loadShared\(\)[\s\S]*?\n  \}/.exec(APPJS)[0];
  notOk(/\.css/.test(shared),'loadShared brings no :root of its own onto this page');
});

test('the reports are read once per channel, and dropped when it changes', () => {
  const src=/function dataSource\(\)[\s\S]*?\n  \}/.exec(APPJS)[0];
  ok(/state\.reportsFor === ch\.id && state\.reports/.test(src),'a second tab click redraws from memory');
  ok(/reportJob && reportJob\.forChannel === ch\.id/.test(src),'and two quick clicks share one request');
  ok(/reportJob = null;[\s\S]{0,80}so leaving and coming back retries/.test(src),
     'a failed read does not cache the failure');
  const load=/function loadMatches\(ch\)[\s\S]*?\n  \}/.exec(APPJS)[0];
  ok(/state\.reports = null; state\.reportsFor = null; reportJob = null;/.test(load),
     'switching channel cannot leave the last club-s numbers on the screen');
});

/* ================= what was taken off the page ================= */
test('the Data page carries no strapline under its title', () => {
  ok(/head\('Data'\)/.test(renderData),'head() is called with a title and nothing else');
  notOk(/Every published match in this channel/.test(APPJS),'the sentence is gone from the file');
  // head() draws no .sub at all when there is none, so no empty flex item is left
  const head=/function head\(title, sub\)[\s\S]*?\n  \}/.exec(APPJS)[0];
  ok(/sub \?/.test(head),'and an absent one opens no gap');
});

test('the Recent formation card is gone, and so is everything that drew it', () => {
  notOk(/formationCard|PITCH_SVG/.test(APPJS),'no builder and no pitch left in app.js');
  // the comment that says where it went is welcome; markup that draws it is not
  notOk(/card-h">Recent formation/.test(APPJS),'nor the card it made');
  ['fm-card','fm-pitch','fm-dot','fm-meta','fm-subs','fm-sub']
    .forEach(c=>notOk(new RegExp('\\.'+c+'[\\s{,]').test(APPCSS),'.'+c+' styling went with it'));
  notOk(/dgrid/.test(APPJS)||/\.dgrid/.test(APPCSS),
        'and the two-column grid that only existed to sit beside it');
  // the line-up itself is untouched: the match page still draws it
  ok(/lineup: \(m\.lineups && m\.lineups\[side\]\) \|\| null/.test(SUPA),
     'matches still carry their line-up — only this card stopped using it');
});

/* ================= Overview ================= */
test('the record, the last five, and the three key players', () => {
  ok(/tstat\('Total'/.test(overview)&&/tstat\('Win'/.test(overview)&&
     /tstat\('Draw'/.test(overview)&&/tstat\('Loss'/.test(overview),'the record');
  ok(/Average goals scored/.test(overview)&&/Average goals conceded/.test(overview),
     'and what it came to per match');
  ok(/tstat\('Yellow cards'/.test(overview)&&/tstat\('Red cards'/.test(overview),
     'and how the club behaved while it did');
  notOk(/Goal difference/.test(overview),
        'the difference is not a tile here — Goals against carries it');
  const rec=/function recentResultsCard\(played\)[\s\S]*?\n  \}/.exec(APPJS)[0];
  ok(/\.slice\(0, 5\)/.test(rec),'five results');
  ok(/\.reverse\(\)/.test(rec),'most recent first — the fixture list reads the other way round');
  const kp=/var KEY_PLAYERS = \[[\s\S]*?\];/.exec(APPJS)[0];
  ['Top Scorer','Top Assist','Top Key Pass'].forEach(t=>ok(kp.includes(t),kp+' has '+t));
});

/* The card counts are the one thing on that card newStat() does not carry, so
   discipline() is EXECUTED rather than read: the 2nd-yellow rule is the whole
   reason it goes through classifyCards() instead of counting rows itself. */
function runDiscipline(reports, matches){
  const ctx={console,document:{getElementById:()=>null},location:{hash:''},
    localStorage:{getItem:()=>null,setItem(){}},window:{}};
  vm.createContext(ctx);
  vm.runInContext([SHARED,
    'window.classifyCards=classifyCards;',
    'var state={reports:'+JSON.stringify(reports)+'};',
    grabFunction('discipline',APPJS,'client/assets/app.js'),
    ';globalThis.out=discipline('+JSON.stringify(matches)+');'
  ].join('\n'),ctx,{filename:'client/assets/app.js-discipline'});
  return ctx.out;
}

test('the card counts say what the match timeline says', () => {
  const rows=[
    {t:10,team:'home',playerFrom:'7',event:'Yellow Card'},
    {t:20,team:'home',playerFrom:'7',event:'Yellow Card'},
    // the tagger logged the sending-off as well; it is the SAME dismissal
    {t:21,team:'home',playerFrom:'7',event:'Red Card'},
    {t:30,team:'home',playerFrom:'4',event:'Red Card'},   // a straight one
    {t:40,team:'away',playerFrom:'9',event:'Yellow Card'} // not our club
  ];
  const got=runDiscipline({m1:{rows}},[{uuid:'m1',side:'home'}]);
  eq(got.yellow,2,'both yellows count — the second is still a yellow');
  eq(got.red,2,'the 2nd-yellow dismissal and the straight red, and the duplicate red once');
});

test('the card counts read the club\'s own side of the fixture', () => {
  const rows=[
    {t:10,team:'home',playerFrom:'7',event:'Yellow Card'},
    {t:20,team:'away',playerFrom:'9',event:'Yellow Card'},
    {t:30,team:'away',playerFrom:'9',event:'Red Card'}
  ];
  eq(runDiscipline({m1:{rows}},[{uuid:'m1',side:'away'}]).yellow,1,'away is ours here');
  eq(runDiscipline({m1:{rows}},[{uuid:'m1',side:'home'}]).yellow,1,'and home when it is');
});

test('with nothing submitted the cards read — , not a clean sheet', () => {
  const got=runDiscipline({},[{uuid:'m1',side:'home'}]);
  eq(got.yellow,null,'0 would claim a discipline record the channel has not got');
  eq(got.red,null);
  // and a match whose report came back with no rows is the same as no report
  eq(runDiscipline({m1:{rows:[]}},[{uuid:'m1',side:'home'}]).yellow,null);
});

test('a player is tallied under his name, not his shirt number', () => {
  const tally=/function playerTally\(aggs\)[\s\S]*?\n  \}/.exec(APPJS)[0];
  ok(/nm \? 'n:' \+ nm\.toLowerCase\(\) : '#' \+ no/.test(tally),
     'a squad number changes between windows; a name does not');
  ok(/t\.no = no;/.test(tally),'the number shown is the most recent one he wore');
});

test('the key player cards do not point at a page with nothing on it', () => {
  const row=/function keyPlayersRow\(aggs\)[\s\S]*?\n  \}/.exec(APPJS)[0];
  notOk(/#\/players/.test(row),'nothing fills renderPlayers in, so no chevron pretends otherwise');
  notOk(/addEventListener/.test(row),'and the cards are cards, not dead buttons');
});

/* ================= the page still adds up with nothing to add up ================= */
test('every empty state says whose move it is', () => {
  ok(/Nothing to add up yet/.test(renderData),'no matches at all');
  ok(/No submitted analysis to tabulate/.test(teamData)&&/Submit Analysis/.test(teamData),
     'matches, but none submitted');
  ok(/The submitted analyses could not be read/.test(renderData),'and a read that failed says so');
  ok(/Adding up the campaign/.test(renderData),'with a spinner while it is happening');
  ok(/if \(!body\.parentNode\) return;/.test(renderData),
     'a slow read that lands after someone navigated on draws nothing');
});

/* ================= layout ================= */
test('nothing on the Data page leaves a part-empty grid row', () => {
  const css=APPCSS.replace(/\s*\n\s*/g,'');
  ok(/\.kp-grid\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/.test(css),
     'three key player cards, three columns');
  ok(/\.kpis\.six\{grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/.test(css),
     'six tiles wrap 6 / 3 / 2, never 5 and a hole');
  ok(/kpis six/.test(APPJS),'and the strip asks for that layout');
});

test('the frozen columns of the wide table give way on a phone', () => {
  const css=APPCSS.replace(/\s*\n\s*/g,'');
  ok(/\.stbl-wrap\{[^}]*overflow-x:auto/.test(css),'the table scrolls inside its own frame');
  ok(/table\.stbl \.c-date\{[^}]*position:sticky/.test(css),'the date stays put while it does');
  ok(/@media \(max-width:720px\)\{table\.stbl \.c-date, table\.stbl \.c-opp\{position:static\}/.test(css),
     'and lets go where there is no width to spare');
});

test('the results row can shrink to its names rather than to nothing', () => {
  const css=APPCSS.replace(/\s*\n\s*/g,'');
  ok(/\.rrow \.rn\{[^}]*min-width:0/.test(css),
     'without it a long club name pushes the scoreline off the middle of the row');
  const rec=/function recentResultsCard\(played\)[\s\S]*?\n  \}/.exec(APPJS)[0];
  ok(/HNA\.shortDate/.test(rec),'and the date is the short one — the long one crowded the names out');
});

test('the fixture is centred on the row, at both widths', () => {
  const css=APPCSS.replace(/\s*\n\s*/g,'');
  const cols=s=>/grid-template-columns:([^;}]+)/.exec(s)[1].trim().split(/\s+/);
  [['.rrow{', /\.rrow\{[^}]*\}/],
   ['the phone row', /@media \(max-width:640px\)\{[\s\S]*?\.rrow\{[^}]*\}/]
  ].forEach(([what,re])=>{
    const c=cols(re.exec(css)[0]);
    eq(c.length,6,what+' is six cells');
    eq(c[0],c[5],what+': the two ends are equal, so the score lands on the middle');
    eq(c[1],c[4],what+': and the names get the same room either side of it');
  });
  // the date is what made the right end wide; on a phone it goes and both ends shrink
  ok(/@media \(max-width:640px\)\{[^@]*\.rrow \.rd\{display:none\}/.test(css),'the date goes narrow');
  const rec=/function recentResultsCard\(played\)[\s\S]*?\n  \}/.exec(APPJS)[0];
  ok(/class="rn rn-h/.test(rec)&&/class="rn rn-a/.test(rec),'the two names are told apart');
  ok(/\.rrow \.rn-h\{text-align:right\}/.test(css)&&/\.rrow \.rn-a\{text-align:left\}/.test(css),
     'home reads into the score, away reads out of it');
  ok(/class="rend"/.test(rec)&&/\.rrow \.rend\{[^}]*justify-content:flex-end/.test(css),
     'the date and the chevron share the end cell, so it is one width to balance');
});

test('the team stats card is two rows on one grid', () => {
  const css=APPCSS.replace(/\s*\n\s*/g,'');
  ok(/\.tstats\{[^}]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/.test(css),'four columns');
  notOk(/grid-template-columns/.test(/\.tstats\.sec\{([^}]*)\}/.exec(css)[1]),
        'and the second row does not ask for its own — three under four lined up with nothing');
  const sec=/'<div class="tstats sec">'([\s\S]*?)'<\/div>'/.exec(overview)[1];
  eq((sec.match(/tstat\(/g)||[]).length,4,'four tiles for the four columns, so no hole is left');
});

/* ================= deploy ================= */
test('the Data view added no file the deploy would have to be told about', () => {
  ['client/assets/app.js','client/assets/app.css','client/assets/supa.js']
    .forEach(f=>ok(YML.includes(f),f+' is staged'));
  // ?v= is how a returning browser is made to re-fetch these
  const v=(src,name)=>(new RegExp(name.replace('.','\\.')+'\\?v=(\\d+)').exec(src)||[])[1];
  const app=page('client/app.html');
  ok(+v(app,'app.js')>=12,'app.js is bumped for the new Data view');
  ok(+v(app,'supa.js')>=10,'supa.js too, for reports()');
  ok(+v(app,'app.css')>=8,'and app.css for what draws it');
});
