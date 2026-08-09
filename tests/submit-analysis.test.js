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
  const order=['loadShared','Stats/stats-view.js','Stats/report.js'];
  let at=-1;
  order.forEach(f=>{
    const i=fn.indexOf(f);
    ok(i>at,f+' is loaded after the one it depends on');
    at=i;
  });
  // the Data view needs the same stat engine and none of the rest, so the
  // file has ONE loader; two would be two version numbers to bump, and the
  // one that was forgotten would fetch a second copy over the first
  const sh=/function loadShared\(\)[\s\S]*?\n  \}/.exec(APPJS)[0];
  ok(/shared\.js\?v=\d+/.test(sh),'loadShared is what names the file');
  eq((APPJS.match(/shared\.js\?v=/g)||[]).length,1,'and it is named in one place only');
  ok(/async = false/.test(APPJS),'and the tags are ordered, not raced');
});

test('the heavy parts are fetched when a match is opened, not on every page load', () => {
  notOk(/xlsx\.full\.min\.js/.test(APPHTML),'the spreadsheet library is not in app.html');
  ok(/xlsx\.full\.min\.js/.test(APPJS),'it is pulled in by loadStatsView');
  notOk(/stats-view\.js/.test(APPHTML),'nor is the view itself');
});

/* ================= getting there ================= */
test('a row opens the analysis, and is a button again', () => {
  // it was a div with role and tabindex only because a second control inside
  // it aimed somewhere else; with one page per match there is nothing to aim
  ok(/el\('button', 'mrow'\)/.test(APPJS),'a real button, keyboard-reachable for free');
  notOk(/setAttribute\('role', 'button'\)/.test(APPJS),'no hand-rolled role');
  notOk(/e\.key === 'Enter'/.test(APPJS),'and no hand-rolled key handling');
  ok(/location\.hash = '#\/match\/' \+ encodeURIComponent\(m\.slug \|\| m\.id\)/.test(APPJS),
     'clicking it opens that match');
  ok(/class="m-open" aria-hidden="true"/.test(APPJS),'the ▶ is decoration now, not a second target');
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

/* ================= seeding a channel from SQL =================
   A channel normally comes from the client site, where whoever creates one
   becomes its admin. The SQL Editor has no session to take an admin from, so
   the first channel is seeded instead — and that script writes reports of its
   own, which means it has to build the same payload the browser would. */
const SEED=page('supabase/seed/saint_lucia_channel.sql');
const VIEW=page('Stats/stats-view.js');

/* The keys of a jsonb_build_object(...) call. Anchored to the start of a line,
   because a quoted string in the VALUE half — coalesce(attributes->>'team_name')
   — looks exactly like a key otherwise. */
function jsonKeys(sql){
  const out=[]; const re=/^\s*'([A-Za-z]+)',/gm;
  for(let m;(m=re.exec(sql));) out.push(m[1]);
  return out;
}
const noSqlComments=s=>s.replace(/--[^\n]*/g,'');

test('the seeded rows are the shape cloud-sync would have written', () => {
  // dbToRow() is what a browser turns a database row into, and what the view
  // reads. A snapshot built in SQL that disagrees opens blank, with nothing
  // anywhere saying why.
  const js=/function dbToRow\(d\) \{[\s\S]*?\n  \}/.exec(CLOUD)[0];
  const jsKeys=[]; const re=/(?:^|[\s{,])([A-Za-z]+):/g;
  for(let m;(m=re.exec(js.slice(js.indexOf('return {'))));) jsKeys.push(m[1]);

  const a=SEED.indexOf("'rows',"), b=SEED.indexOf('order by e.t_seconds', a);
  const sqlKeys=jsonKeys(SEED.slice(a,b)).filter(k=>k!=='rows'&&k!=='x'&&k!=='y');

  jsKeys.filter(k=>k!=='x'&&k!=='y').forEach(k=>
    ok(sqlKeys.includes(k),'the seed does not write "'+k+'", which dbToRow does'));
  sqlKeys.forEach(k=>
    ok(jsKeys.includes(k),'the seed writes "'+k+'", which dbToRow does not'));
});

test('and the meta it writes is the one the view starts from', () => {
  const blank=/const blankMeta=\(\)=>\(\{[\s\S]*?\}\);/.exec(VIEW)[0];
  const a=SEED.indexOf("'meta', jsonb_build_object("), b=SEED.indexOf('),',a);
  jsonKeys(SEED.slice(a,b)).filter(k=>k!=='meta').forEach(k=>
    ok(blank.includes(k+':'),'the view has no place for meta.'+k));
  ['home','away','sport','matchId','matchCode'].forEach(k=>
    ok(SEED.includes("'"+k+"',"),'the seed must carry meta.'+k));
});

test('running the seed twice changes nothing', () => {
  ok(/on conflict \(slug\) do nothing/.test(SEED),'the channel is not created twice');
  ok(/on conflict \(club_id, user_id\)\s*\ndo update set role = 'admin'/.test(SEED),
     'and the admin row is brought up to date rather than duplicated');
  ok(/where not exists \(select 1 from public\.match_reports r where r\.match_id = m\.id\)/.test(SEED),
     'a second run does not stack another version of the same report');
});

test('the seed publishes exactly the four qualifiers, on the right side', () => {
  const rows=/\(values([\s\S]*?)\) as v\(/.exec(SEED)[1];
  [['45956','away'],['55357','home'],['51977','away'],['32746','home']].forEach(([code,side])=>{
    const line=rows.split('\n').filter(l=>l.includes("'"+code+"'"))[0];
    ok(line,'match '+code+' is in the list');
    ok(line.includes("'"+side+"'"),'match '+code+' has Saint Lucia on the '+side);
  });
  eq((rows.match(/^\s*\('/gm)||[]).length,4,'four matches, no more');
  ok(/published   = true/.test(SEED),'and they are published, or the club sees nothing');
});

test('competition and stage are put on the match, never on the club', () => {
  const clubInsert=/insert into public\.clubs \(([^)]*)\)/.exec(SEED)[1];
  notOk(/competition|stage/.test(clubInsert),'the channel is created without either');
  ok(/competition = 'FIFA World Cup 26 Qualifying'/.test(SEED),'the match carries the competition');
  ok(/stage       = 'Concacaf Second Round/.test(SEED),'and the stage');
});

test('the seed only ever adds — it drops and deletes nothing', () => {
  const sql=noSqlComments(SEED);           // the prose says "drop those columns"
  notOk(/drop |truncate|delete from/i.test(sql));
  ['events','event_types','teams','players'].forEach(t=>
    notOk(new RegExp('update public\\.'+t+'\\b').test(sql),'public.'+t+' is not written to'));
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
