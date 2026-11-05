/* 0026 and the workflows around it: who may write tagging data, what the
   portal reads, and what watches the live system. See
   docs/design/infra-hardening-design.md. */
const {test,eq,ok,notOk}=require('./tiny-test');
const {readSrc}=require('./harness');

const RAW=readSrc('supabase/migrations/0026_staff_writes_and_read_path.sql');
const sql=RAW.replace(/--[^\n]*/g,'');
const SQL15=readSrc('supabase/migrations/0015_match_stats_event_names.sql').replace(/--[^\n]*/g,'');
const DEPLOY=readSrc('.github/workflows/deploy.yml');
const HEALTH=readSrc('.github/workflows/health.yml');
const BACKUP=readSrc('.github/workflows/backup.yml');

const policies=(table)=>{
  const out=[], re=new RegExp('create policy (\\w+) on public\\.'+table+' for (\\w+) to (\\w+)([\\s\\S]*?);','g');
  for(let m;(m=re.exec(sql));) out.push({name:m[1],cmd:m[2],role:m[3],body:m[4]});
  return out;
};

/* ================= the lock-out guard ================= */
test('0026 refuses to run while public.staff is empty', () => {
  const guard=sql.indexOf('if not exists (select 1 from public.staff)');
  ok(guard>0,'the guard is there');
  ok(guard<sql.indexOf('create policy'),'and it runs before any policy is touched');
  ok(/raise exception/.test(sql.slice(guard,guard+300)),'it raises, so the whole file rolls back');
  notOk(/@[a-z0-9-]+\.[a-z]{2,}/i.test(sql),'and no analyst email is committed into a public repo');
});

/* ================= the hole that is closed ================= */
test('no write to tagging data is open to every account any more', () => {
  ['events','players','teams','event_types','matches'].forEach(t=>{
    policies(t).filter(p=>p.cmd!=='select').forEach(p=>{
      notOk(/(using|check) \(true\)/.test(p.body),t+'.'+p.name+' writes with (true)');
      ok(/is_staff\(\)/.test(p.body),t+'.'+p.name+' asks for staff');
    });
  });
  ['events_rw','players_rw','teams_rw','event_types_rw'].forEach(n=>
    ok(new RegExp('drop policy if exists '+n+' ').test(sql),'the old '+n+' is dropped'));
});

test('events and players are not readable by a non-staff account either', () => {
  ['events','players'].forEach(t=>{
    const ps=policies(t);
    eq(ps.length,1,t+' has exactly one policy');
    ok(/using \(\(select public\.is_staff\(\)\)\)/.test(ps[0].body),t+' reads are staff-only');
  });
});

test('matches are read by staff, the creator, the channel admins, or members once published', () => {
  const sel=policies('matches').filter(p=>p.cmd==='select');
  eq(sel.length,1);
  const b=sel[0].body;
  notOk(/using \(true\)/.test(b),'not every account');
  ok(/is_staff/.test(b)&&/created_by = \(select auth\.uid\(\)\)/.test(b));
  ok(/is_club_admin\(club_id\)/.test(b),'a channel admin sees the channel before publishing');
  ok(/published and public\.is_club_member\(club_id\)/.test(b),'a member only once published');
});

test('nothing here gives anon a policy', () => {
  notOk(/ to anon/.test(sql.replace(/revoke[^;]*;/g,'').replace(/grant select on public\.match_reports_latest to anon, authenticated;/,'')),
        'anon keeps exactly what 0017 gave it');
});

/* ================= the advisor's performance warnings ================= */
test('auth.uid() is evaluated once per query, never bare', () => {
  const bare=sql.match(/(?<!select )auth\.uid\(\)/g)||[];
  eq(bare.length,0,'every auth.uid() is wrapped in (select …)');
});

test('the tables that had two SELECT policies have one', () => {
  ['club_members','club_invites','match_reports'].forEach(t=>{
    ok(new RegExp('drop policy if exists '+t+'_(modify|write) ').test(sql),t+' loses its for-all policy');
    eq(policies(t).filter(p=>p.cmd==='all').length,0,t+' has no for-all policy left');
    ['insert','update','delete'].forEach(c=>ok(policies(t).some(p=>p.cmd===c),t+' '+c));
  });
});

test('SECURITY DEFINER helpers are off anon', () => {
  ['claim_club_invites','is_club_admin','is_club_member','is_staff','publish_match_report',
   'club_creator_is_admin','club_keep_an_admin'].forEach(f=>
    ok(new RegExp('revoke execute on function public\\.'+f+'\\([^)]*\\)\\s+from public, anon').test(sql),f));
  ['bump_version','gen_match_code','gen_team_code','jwt_email','jwt_name','touch_updated_at','touch_user_prefs'].forEach(f=>
    ok(new RegExp('alter function public\\.'+f+'\\(\\)\\s+set search_path = public, extensions, pg_temp').test(sql),f+' has a fixed search_path'));
});

/* ================= what the portal reads ================= */
test('match_reports_latest is one row per match, under the reader\'s own RLS', () => {
  ok(/create or replace view public\.match_reports_latest with \(security_invoker = true\)/.test(sql),
     'security_invoker, so anon still sees only public channels');
  ok(/select distinct on \(match_id\) \*\s+from public\.match_reports\s+order by match_id, version desc/.test(sql));
});

test('the rollup counts exactly what 0015 counted', () => {
  const cols=s=>{const out={},re=/count\(\*\)( filter \(where ([\s\S]*?)\))?\s+as (\w+)/g;
    for(let m;(m=re.exec(s));) out[m[3]]=(m[2]||'').replace(/\s+/g,' ').trim(); return out;};
  const a=cols(SQL15), b=cols(sql.slice(sql.indexOf('create materialized view')));
  eq(Object.keys(b).join(','),Object.keys(a).join(','),'same columns, same order');
  Object.keys(a).forEach(k=>eq(b[k],a[k],k+' counts the same event names'));
});

test('both stats views read the rollup and keep a row filter', () => {
  const ms=/create or replace view public\.match_stats as([\s\S]*?);/.exec(sql)[1];
  ok(/from private\.match_stats_mv/.test(ms),'match_stats reads the rollup');
  ok(/is_staff/.test(ms)&&/is_club_member\(m\.club_id\)/.test(ms)&&/m\.published/.test(ms),
     'and, running with its owner\'s rights, filters rows itself');
  const pub=/create or replace view public\.public_match_stats as([\s\S]*?);/.exec(sql)[1];
  ok(/from private\.match_stats_mv/.test(pub)&&/m\.published/.test(pub)&&/c\.is_public/.test(pub),
     'public_match_stats still joins back to the flag');
  ok(/revoke select on public\.match_stats from anon/.test(sql),'anon stays off match_stats');
  ok(/revoke all on private\.match_stats_mv from public, anon, authenticated/.test(sql),'the rollup itself is unreadable');
});

test('the rollup refreshes on a schedule, and only when events changed', () => {
  ok(/create unique index if not exists match_stats_mv_key on private\.match_stats_mv \(match_id, team\)/.test(sql),
     'CONCURRENTLY needs a unique index');
  const fn=/function private\.refresh_match_stats\(\)([\s\S]*?)end \$\$/.exec(sql)[1];
  ok(/if last is not distinct from fp then return/.test(fn),'unchanged events, no refresh');
  ok(/refresh materialized view concurrently private\.match_stats_mv/.test(fn),'concurrently: readers are never blocked');
  ok(/cron\.schedule\('refresh-match-stats', '\* \* \* \* \*'/.test(sql),'once a minute');
});

/* ================= CI ================= */
test('the deploy waits for the test suite', () => {
  ok(/\n  test:\n[\s\S]*?run: node tests\/run\.js/.test(DEPLOY),'a test job runs the suite');
  ok(/\n  deploy:\n    needs: test\n/.test(DEPLOY),'and deploy needs it');
});

test('every staged file is fetched from the live site after a deploy', () => {
  const smoke=/Smoke-test the deployed paths[\s\S]*$/.exec(DEPLOY)[0];
  ok(/steps\.deployment\.outputs\.page_url/.test(smoke),'it asks the deployed URL, not the repo path');
  ok(/find \. -type f/.test(smoke),'for every file in _site');
  ok(/\[ "\$fails" = "0" \]/.test(smoke),'and fails the run on a miss');
});

test('the health check probes every service and keeps Supabase awake', () => {
  ok(/cron: '17 \* \* \* \*'/.test(HEALTH),'hourly');
  ['portal landing','tagger','supabase rest','supabase auth','worker presign','worker contact'].forEach(n=>
    ok(HEALTH.indexOf('probe "'+n)>=0,n));
  ok(/rest\/v1\/clubs\?select=id/.test(HEALTH),'the REST probe reaches Postgres');
  notOk(/service_role|SERVICE_KEY/.test(HEALTH),'and only the publishable key is in it');
});

test('the backup is encrypted before it leaves the runner', () => {
  const enc=BACKUP.indexOf('--symmetric'), up=BACKUP.indexOf('actions/upload-artifact');
  ok(enc>0&&up>enc,'gpg runs before the upload');
  ok(/rm -f backup\.dump/.test(BACKUP),'and the clear dump is removed');
  ok(/path: hna-db-\*\.dump\.gpg/.test(BACKUP),'only the .gpg is uploaded');
  ok(/run=no/.test(BACKUP),'without its secrets the job stops instead of failing');
});
