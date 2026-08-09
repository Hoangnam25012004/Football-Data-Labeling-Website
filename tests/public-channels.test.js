/* A channel its admin has opened to anyone.

   This is the one place in the project where private data becomes
   world-readable, so what is guarded here is the shape of the hole: which
   doors open, which stay shut, and that the person opening it was told what
   goes through. */
const fs=require('fs'), path=require('path'), vm=require('vm');
const {test,eq,ok,notOk}=require('./tiny-test');

const ROOT=path.join(__dirname,'..');
const page=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const SQL=page('supabase/migrations/0017_public_channels.sql');
const SUPA=page('client/assets/supa.js');
const APPJS=page('client/assets/app.js');

const bare=s=>s.replace(/--[^\n]*/g,'');
const sql=bare(SQL);

/* ================= which doors open ================= */
test('exactly three things become readable without an account', () => {
  const anon=[];
  const re=/create policy (\w+) on public\.(\w+) for select to anon/g;
  for(let m;(m=re.exec(sql));) anon.push(m[2]);
  eq(anon.sort().join(','),'club_reports_placeholder'.replace('club_reports_placeholder',
     ['clubs','match_reports','matches'].join(',')),
     'clubs, matches and match_reports — and nothing else');
});

test('and each one checks the flag itself', () => {
  // a chain of policies that trust the one before it is a chain with a weak link
  ok(/create policy clubs_read_public[\s\S]{0,120}using \(is_public\)/.test(sql));
  ok(/create policy matches_read_public[\s\S]{0,240}c\.is_public/.test(sql),'matches joins back to the flag');
  ok(/create policy match_reports_read_public[\s\S]{0,240}c\.is_public/.test(sql),'so does match_reports');
  ok(/matches_read_public[\s\S]{0,120}published/.test(sql),'and an unpublished match stays private either way');
});

test('the live event stream is never opened', () => {
  notOk(/on public\.events for [a-z]+ to anon/.test(sql),'no anon policy on public.events');
  ok(/does not open public\.events/.test(SQL),'and the file says so out loud');
});

test('nothing anonymous may write, anywhere', () => {
  const writes=/for (insert|update|delete|all) to anon/.exec(sql);
  notOk(writes,'an anon write policy would be: '+(writes&&writes[0]));
});

/* ================= the view that would have leaked ================= */
test('anon is taken off match_stats, because a view ignores row-level security', () => {
  // this is the trap: every policy above could be right and a view granted to
  // anon still hands over the rolled-up numbers of every match in the database
  ok(/revoke select on public\.match_stats from anon/.test(sql));
  ok(/create or replace view public\.public_match_stats/.test(sql),'a narrowed one takes its place');
});

test('the replacement filters all the way back to the flag', () => {
  const view=/create or replace view public\.public_match_stats as([\s\S]*?);/.exec(sql)[1];
  ok(/join public\.matches/.test(view)&&/join public\.clubs/.test(view),'it joins to the club');
  ok(/m\.published/.test(view)&&/c\.is_public/.test(view),'and tests both conditions itself');
  ok(/grant select on public\.public_match_stats to anon/.test(sql),'and anon may read that one');
});

test('the client reads the narrowed view when it has no session', () => {
  ok(/anonymous \? 'public_match_stats' : 'match_stats'/.test(SUPA),'it picks by session');
  ok(/anonymous = !s;/.test(SUPA),'and the flag is set from the session, not guessed');
});

/* ================= the switch ================= */
test('only the flag is written, and only through the channel row', () => {
  const fn=/setPublic: function \(clubId, on\)[\s\S]*?\n      \},/.exec(SUPA)[0];
  ok(/update\(\{ is_public: !!on \}\)/.test(fn),'one column');
  ok(/\.eq\('id', clubId\)/.test(fn),'one channel');
  // clubs_update in 0014 already restricts this to admins and staff
  notOk(/rpc\(/.test(fn),'no privileged function needed — the table policy is the check');
});

test('a non-admin is not offered the switch at all', () => {
  const one=/function renderChannelOne\(view, slug\)[\s\S]*?\n  \}\n/.exec(APPJS)[0];
  ok(/if \(isAdmin\) \{\s*\n\s*publicCard/.test(one),'the card is drawn for admins only');
  ok(/else if \(ch\.isPublic\)/.test(one),'and a member of a public channel is told it is public');
});

test('the confirm names what goes public, rather than asking if you are sure', () => {
  const one=/function drawPublic\(\)[\s\S]*?\n    \}\n/.exec(APPJS)[0];
  ok(/confirm\(/.test(one),'there is a confirm');
  ['without an account','NAMES','opposition','already\n            been read']
    .forEach(function (phrase) {
      ok(one.indexOf(phrase.replace(/\s+/g,' '))>-1 || new RegExp(phrase.split('\n')[0]).test(one),
         'the confirm should mention: '+phrase.split('\n')[0]);
    });
  ok(/does not take back/.test(one),'and that closing it again does not undo anything');
});

test('closing it needs no confirm — only opening does', () => {
  const one=/function drawPublic\(\)[\s\S]*?\n    \}\n/.exec(APPJS)[0];
  ok(/if \(!on && !confirm\(/.test(one),'the dialog is on the way out, not the way back');
});

/* ================= it is visible that it is open ================= */
test('a public channel says so where it cannot be missed', () => {
  // in the bar beside the channel name, which is on screen whatever you scroll
  ok(/id="chanPublic"/.test(page('client/app.html')),'the badge is in the top bar');
  ok(/\$\('#chanPublic'\)\.hidden = !\(ch && ch\.isPublic\)/.test(APPJS),'shown only when it is one');
  ok(/badge-public/.test(page('client/assets/app.css')),'and it is styled');
  ok(/c\.isPublic \? ' · public' : ''/.test(APPJS),'the row in the channel list says so too');
});

test('a signed-out visitor is now asked for the channel list', () => {
  // before this, no session meant no request at all
  ok(/if \(!user\) return window\.HNA\.clubs\(\);/.test(APPJS));
  ok(/made\s*\n\s*it public is readable by anyone/.test(APPJS)||/public is readable by anyone/.test(APPJS),
     'and the reason is written down');
});

/* ================= the warning ================= */
test('the migration will not let anyone run it without reading what it does', () => {
  const head=SQL.slice(0, SQL.indexOf('alter table'));
  ['public means PUBLIC','anon key','NAMES','opposition','does not un-download']
    .forEach(p=>ok(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i').test(head),
      'the header should say: '+p));
});

test('it is off until somebody turns it on', () => {
  ok(/add column if not exists is_public boolean not null default false/.test(sql));
});

test('0017 leaves the tagging app alone', () => {
  ['events','teams','players','event_types'].forEach(t=>
    notOk(new RegExp('drop policy[^\\n]*on public\\.'+t+'\\b').test(sql),
      'no policy on public.'+t+' is dropped'));
  notOk(/drop table|truncate|delete from/i.test(sql),'nothing is dropped or emptied');
  notOk(/to authenticated/.test(sql),'and no existing signed-in access is widened');
});
