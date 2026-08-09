/* Submit Analysis — the border between the two apps.

   Everything the tagging app does happens live. What crosses over to a client
   is one signed-off row, and these are the rules about how it gets there and
   what the other side does with it. */
const fs=require('fs'), path=require('path'), vm=require('vm');
const {test,eq,ok,notOk}=require('./tiny-test');
const {grabFunction}=require('./harness');

const ROOT=path.join(__dirname,'..');
const page=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const CLOUD=page('cloud-sync.js');
const TAGGER=page('index.html');
const APPJS=page('client/assets/app.js');
const APPHTML=page('client/app.html');
const SUPA=page('client/assets/supa.js');
const SQL=page('supabase/migrations/0016_match_reports.sql');
const YML=page('.github/workflows/deploy.yml');

/* ================= what gets frozen ================= */
test('the snapshot is read back out of the database, not out of this tab', () => {
  const fn=/async function buildReport\(\)[\s\S]*?\n  \}/.exec(CLOUD)[0];
  ok(/sb\.from\('matches'\)/.test(fn),'the match row comes from the database');
  ok(/fetchAllEvents\(matchId\)/.test(fn),'and so do the events');
  ok(/PT\(\)\.state\.rows/.test(fn),'this tab-s own count is read only to compare against');
  notOk(/loadRows\(\)|localStorage/.test(fn),'nothing is taken from localStorage');
});

test('a long match is paged through, so a snapshot is never short by a thousand', () => {
  const fn=/async function fetchAllEvents\(id\)[\s\S]*?\n  \}/.exec(CLOUD)[0];
  ok(/range\(from, from \+ PAGE - 1\)/.test(fn),'it asks for windows');
  ok(/data\.length < PAGE\) break/.test(fn),'and stops only when one comes back short');
  ok(/if \(error\) throw error/.test(fn),'a failed page is not quietly treated as the end');
});

test('the payload is the four things Stats renders from, and the shape is versioned', () => {
  const fn=/async function buildReport\(\)[\s\S]*?\n  \}/.exec(CLOUD)[0];
  ['schema:','meta:','lineups:','dur:','rows:'].forEach(k=>ok(fn.includes(k),'payload carries '+k));
  ok(/schema: 1/.test(fn),'schema 1');
  // scores / kick-off / competition live on public.matches and are already read there
  notOk(/home_score|kickoff|competition/.test(fn),'nothing already on the match row is copied in');
});

test('the substitution history goes with the line-ups', () => {
  // lineups.history is what every per-period squad is worked out from; freezing
  // the starting eleven without it makes every stat after a change wrong
  const fn=/async function buildReport\(\)[\s\S]*?\n  \}/.exec(CLOUD)[0];
  ok(/m\.lineups && m\.lineups\.home && m\.lineups\.away/.test(fn),'the whole lineups object is taken');
  notOk(/lineups\.home\.xi|\.history\b/.test(fn),'not picked apart into pieces that could drop it');
});

test('publishing is one call, so a report and its match cannot disagree', () => {
  const fn=/async function publishReport\(clubId\)[\s\S]*?\n  \}/.exec(CLOUD)[0];
  ok(/sb\.rpc\('publish_match_report'/.test(fn),'it goes through the function');
  notOk(/from\('matches'\)\.update|from\('match_reports'\)\.insert/.test(fn),
        'not two writes from the browser — half of that landing is the bad case');
});

test('Cloud hands the tagging app exactly the four calls the dialog makes', () => {
  const surface=/window\.Cloud = \{[\s\S]*?\n  \};/.exec(CLOUD)[0];
  ['buildReport','reportClubs','publishReport','reportStatus'].forEach(f=>
    ok(surface.includes(f),'Cloud.'+f+' is exposed'));
});

/* ================= the dialog ================= */
test('Submit Analysis sits in the Other menu, beside Cloud', () => {
  ok(/id="submitBtn"[^>]*>⇪ Submit Analysis</.test(TAGGER),'the menu item is there');
  const menu=TAGGER.slice(TAGGER.indexOf('id="otherMenu"'),TAGGER.indexOf('id="eventBtn"'));
  ok(menu.includes('submitBtn'),'inside the menu, not loose on the bar');
  ok(menu.indexOf('cloudBtn')<menu.indexOf('submitBtn'),'after Cloud — you connect before you publish');
  ok(/\$\('submitBtn'\)\.addEventListener\('click',\(\)=>setOpen\(false\)\)/.test(TAGGER),
     'and it closes the menu behind it, like every other item');
});

test('it refuses to look ready when the database is behind this tab', () => {
  // the failure this guards is invisible afterwards: a report short of events
  // still adds up, it is just wrong
  const wire=/\/\* ---- Submit Analysis[\s\S]*?\n\}\)\(\);/.exec(TAGGER)[0];
  ok(/built\.localCount>0&&built\.eventCount<built\.localCount/.test(wire),'it compares the two counts');
  ok(/\$\('submitGo'\)\.disabled=short/.test(wire),'and the button stays down when they disagree');
  ok(/let the sync finish/.test(wire),'saying what to do about it');
});

test('the dialog says what is about to be frozen', () => {
  const wire=/\/\* ---- Submit Analysis[\s\S]*?\n\}\)\(\);/.exec(TAGGER)[0];
  ok(/events stored/.test(wire),'how many events');
  ok(/No starting line-up saved/.test(wire),'and warns when there is no line-up');
  ok(/Last published: v/.test(wire),'and which version the club is on');
  ok(/confirm\('Publish this match to '/.test(wire),'publishing is confirmed, not one click');
  ok(/sees this version until you publish again/.test(wire),'and says what publishing means');
});

test('with no match open it says so instead of failing', () => {
  const wire=/\/\* ---- Submit Analysis[\s\S]*?\n\}\)\(\);/.exec(TAGGER)[0];
  ok(/!window\.Cloud\|\|!Cloud\.connected\|\|!Cloud\.matchId/.test(wire));
  ok(/Open a match on the cloud first/.test(wire));
});

test('cloud-sync was cache-busted, or a returning analyst has no such button', () => {
  ok(+(/cloud-sync\.js\?v=(\d+)/.exec(TAGGER)[1])>=47);
});

/* ================= the far side ================= */
test('a club reads one row, never the events table', () => {
  ok(/report: function \(matchUuid\)/.test(SUPA),'there is a report() call');
  const fn=/report: function \(matchUuid\)[\s\S]*?\n    \}/.exec(SUPA)[0];
  ok(/from\('match_reports'\)/.test(fn));
  ok(/order\('version', \{ ascending: false \}\)[\s\S]{0,40}limit\(1\)/.test(fn),'the newest version only');
  notOk(/from\('events'\)/.test(SUPA),'and nothing in the client asks for events any more');
});

test('no report yet is a state, not an error', () => {
  const fn=/report: function \(matchUuid\)[\s\S]*?\n    \}/.exec(SUPA)[0];
  ok(/if \(!row\) return null/.test(fn),'it comes back null');
  ok(/No analysis submitted yet/.test(APPJS),'and the page says who sends one');
});

/* ================= finding the tagging app-s files ================= */
const ctx={};
vm.createContext(ctx);
vm.runInContext(grabFunction('taggerRoot',APPJS,'app.js')+
  ';globalThis.taggerRoot=taggerRoot;',ctx);

test('the view-s files are found in both layouts, without a build step', () => {
  // the deploy puts this site at the root and the whole tagging app under
  // /tagger; the repo has them side by side with the client in client/
  const at=p=>{ctx.location={pathname:p};return ctx.taggerRoot();};
  eq(at('/Football-Data-Labeling-Website/app.html'),'tagger/','deployed');
  eq(at('/client/app.html'),'../','served from the repo');
  eq(at('/client/app.html?x=1'),'../','a query string changes nothing');
});

test('shared.js is loaded before the view, and the view before the exports', () => {
  const fn=/function loadStatsView\(\)[\s\S]*?\n  \}/.exec(APPJS)[0];
  const order=['shared.js','Stats/stats-view.js','Stats/report.js'];
  let at=-1;
  order.forEach(f=>{
    const i=fn.indexOf(f);
    ok(i>at,f+' is loaded after the one it depends on');
    at=i;
  });
  ok(/async = false/.test(APPJS),'and the tags are ordered, not raced');
});

test('the heavy parts are fetched when a match is opened, not on every page load', () => {
  notOk(/xlsx\.full\.min\.js/.test(APPHTML),'the spreadsheet library is not in app.html');
  ok(/xlsx\.full\.min\.js/.test(APPJS),'it is pulled in by loadStatsView');
  notOk(/stats-view\.js/.test(APPHTML),'nor is the view itself');
});

/* ================= getting there ================= */
test('the play button on a row opens the analysis, the row opens the match', () => {
  ok(/parts\[2\] === 'stats' \? renderMatchStats/.test(APPJS),'#/match/<code>/stats is routed');
  ok(/location\.hash = href \+ '\/stats'/.test(APPJS),'the button goes there');
  ok(/e\.stopPropagation\(\)/.test(APPJS),'without the row opening underneath it');
});

test('a row full of controls is still reachable from a keyboard', () => {
  // it had to stop being a <button> — a button cannot contain a button
  ok(/el\('div', 'mrow'\)/.test(APPJS));
  ok(/setAttribute\('role', 'button'\)/.test(APPJS)&&/setAttribute\('tabindex', '0'\)/.test(APPJS));
  ok(/e\.key === 'Enter' \|\| e\.key === ' '/.test(APPJS),'Enter and Space open it');
});

test('the two tabs of a match both exist and only one is lit', () => {
  const fn=/function matchTabs\(m, on\)[\s\S]*?\n  \}/.exec(APPJS)[0];
  ok(/'overview', '', 'Overview'/.test(fn)&&/'stats', '\/stats', 'Analysis'/.test(fn));
  ok(/on === t\[0\] \? ' on' : ''/.test(fn),'exactly the one you are on');
});

/* ================= the table it lands in ================= */
test('0016 keeps every version rather than overwriting the last', () => {
  ok(/version      integer not null/.test(SQL));
  ok(/unique \(match_id, version\)/.test(SQL),'one row per version');
  ok(/coalesce\(max\(version\), 0\) \+ 1/.test(SQL),'publishing again adds one');
  ok(/schema       integer not null default 1/.test(SQL),'and the payload shape is versioned too');
});

test('a club reads its own reports and no one else-s', () => {
  ok(/create policy match_reports_read[\s\S]{0,200}is_club_member\(club_id\)/.test(SQL));
  ok(/create policy match_reports_write[\s\S]{0,240}is_club_admin\(club_id\)/.test(SQL));
});

test('publishing checks who is asking, and does both halves or neither', () => {
  const fn=/create or replace function public\.publish_match_report[\s\S]*?\$\$;/.exec(SQL)[0];
  ok(/is_staff\(\) or public\.is_club_admin\(p_club_id\)/.test(fn),'staff, or an admin of that channel');
  ok(/insert into public\.match_reports/.test(fn)&&/update public\.matches/.test(fn),
     'the report and the published flag move together');
  ok(/security definer/.test(fn),'so a channel admin need not be staff to publish their own club');
});

test('0016 leaves the tagging app alone', () => {
  ['events','teams','players','event_types'].forEach(t=>
    notOk(new RegExp('(drop|create) policy[^\\n]*on public\\.'+t+'\\b').test(SQL),
      'no policy on public.'+t+' is touched'));
  notOk(/drop table|truncate|delete from/i.test(SQL),'nothing is dropped or emptied');
});

/* ================= shipping ================= */
test('the client can reach the files it loads at runtime', () => {
  // it loads them out of the deployed tagging app, so those cp lines cover both
  ['cp Stats/stats-view.js','cp Stats/stats-view.css','cp Stats/report.js','cp shared.js']
    .forEach(l=>ok(YML.includes(l),'deploy.yml is missing: '+l));
});

test('the ported shooting map is gone, now that the real one is here', () => {
  ['shootingCard','SHOT_COLORS','VPITCH_LINES','shotsOf'].forEach(n=>
    notOk(new RegExp('\\b'+n+'\\b').test(APPJS),n+' should have gone with it'));
  ok(/PTStats\.mount/.test(APPJS),'the whole Stats view is mounted instead');
});
