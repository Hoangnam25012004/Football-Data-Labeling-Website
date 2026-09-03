/* Editing a match from the channel: the ⋯ on a row, the form behind it, and the
   four fields it writes.

   Three things are being pinned down here.

   The first is that the ⋯ did not cost the row its <button>. This page has been
   round that loop once already — the row was a div with role and tabindex only
   because a second control inside it aimed somewhere else, and it went back to a
   plain button when that control left. So the ⋯ is a SIBLING of the row inside
   .mrow-wrap, and the five tracks the scoreline is centred on are still five.

   The second is that a browser deciding not to draw a control is not security.
   0023 is what refuses the write: matches_update wants an admin of the channel
   the match is IN, and a column grant of exactly five columns is what keeps a
   form about dates away from home_score and published. The migration is read as
   source here, the way tests/client-channels.test.js reads 0013 and 0014.

   The third is that four fields nobody has filled in read exactly as the page
   read before they existed — "—" where a column must hold something, and simply
   absent where a line can be shorter.

   Rendering and SQL are read as source, as every other client test does. */
const {test,eq,deepEq,ok,notOk}=require('./tiny-test');
const {readSrc}=require('./harness');

const APPJS=readSrc('client/assets/app.js');
const APPCSS=readSrc('client/assets/app.css');
const SUPA=readSrc('client/assets/supa.js');
const MIG=readSrc('supabase/migrations/0023_match_round_and_edit.sql');

const matches=/function renderMatches\(view\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
const menuFn=/function matchMenu\(m\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
const editFn=/function renderMatchEdit\(view, slug\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
const formFn=/function matchForm\(view, opts\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
const overview=/function renderOverview\(body\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
const recent=/function recentResultsCard\(played\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
const teamData=/function renderTeamData\(body, cat\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
const playerTable=/function playerMatchTable\(who, cat\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
const seasonsFn=/function seasonsOf\(matches\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
const detFn=/function detailsCell\(m\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
/* SQL with the comments taken out — this file's own prose says "home_score" a
   dozen times, and a test that cannot tell a comment from a grant is no test */
const SQL=MIG.replace(/--[^\n]*/g,'');

/* ================= the ⋯ on a row ================= */

test('the row is still a plain button, and the ⋯ is beside it rather than in it', () => {
  ok(/el\('button', 'mrow'\)/.test(matches),'a real button, keyboard-reachable for free');
  notOk(/setAttribute\('role', 'button'\)/.test(APPJS),'no hand-rolled role came back');
  notOk(/e\.key === 'Enter'/.test(APPJS),'and no hand-rolled key handling');
  /* the wrapper holds them as siblings: a <button> may not contain a <button> */
  ok(/var wrap = el\('div', 'mrow-wrap'\);/.test(matches),'a wrapper');
  ok(/wrap\.appendChild\(b\);/.test(matches)&&/wrap\.appendChild\(matchMenu\(m\)\);/.test(matches),
     'the row and the menu are two children of it');
  ok(/list\.appendChild\(wrap\);/.test(matches),'and the wrapper is what the list holds');
});

test('the ⋯ is still outside the row grid, whatever that grid is', () => {
  const css=APPCSS.replace(/\s*\n\s*/g,'');
  ok(/\.mlist-h,\.mrow\{--m-cols:/.test(css),'--m-cols is still declared on both');
  /* the arithmetic of the six tracks is checked in client-channels.test.js, where
     the mirror it protects was decided. All this one asks is that the ⋯ never
     became one of them. */
  ok(/\.mrow-wrap\{display:grid; ?grid-template-columns:minmax\(0,1fr\) 34px/.test(css),
     'the ⋯ is a track of the WRAPPER, not another track of the row');
  ok(/\.mlist-h\{[^}]*margin-right:34px/.test(css),
     'and the heading is pulled in by the same amount, or it drifts off its columns');
});

test('the menu is the one this app already has, not a second one', () => {
  ok(/el\('span', 'menu-wrap'\)/.test(menuFn)&&/el\('div', 'menu'\)/.test(menuFn)&&
     /el\('button', 'menu-opt'/.test(menuFn),'menu-wrap / menu / menu-opt, as settingsMenu uses');
  ok(/menu\.setAttribute\('role', 'menu'\)/.test(menuFn),'announced as a menu');
  ok(/aria-haspopup/.test(menuFn)&&/aria-expanded/.test(menuFn),'and it says whether it is open');
  const css=APPCSS.replace(/\/\*[\s\S]*?\*\//g,'');
  eq((css.match(/^\.menu\{/gm)||[]).length,1,'the one .menu rule is the one already there');
  ok(/\.mrow-more\{/.test(APPCSS),'only the trigger has a class of its own');
});

test('one document listener for the whole list, not one per match', () => {
  /* settingsMenu can afford one because it is the only menu on its page. Forty
     matches would be forty listeners on document, each holding a detached row. */
  eq((menuFn.match(/document\.addEventListener/g)||[]).length,0,
     'the menu itself hangs nothing on the document');
  eq((matches.match(/document\.addEventListener/g)||[]).length,1,
     'the list hangs exactly one');
  ok(/if \(!list\.isConnected\) \{ document\.removeEventListener\('click', away\); return; \}/.test(matches),
     'and it takes itself off once the list it belongs to is gone');
});

test('pressing the ⋯ does not open the match under it', () => {
  /* No stopPropagation, and that is the point: the ⋯ is a sibling of the row,
     so the click never passes through it. Stopping the event would only keep it
     from the list listener that closes whichever other menu was open. */
  notOk(/stopPropagation/.test(menuFn.replace(/\/\*[\s\S]*?\*\//g,'')),'nothing is stopped');
  ok(/SIBLING of the row/.test(menuFn),'and the reason is written down');
  ok(/location\.hash = '#\/match\/' \+ encodeURIComponent\(m\.slug \|\| m\.id\) \+ '\/edit'/.test(menuFn),
     'Edit goes to the edit route');
});

test('only an admin of this channel is offered the ⋯', () => {
  ok(/var mayEdit = !!\(state\.user && state\.channel && state\.channel\.role === 'admin'\);/.test(matches),
     'signed in, in a channel, and an admin of it');
  ok(/if \(mayEdit\) wrap\.appendChild\(matchMenu\(m\)\)/.test(matches),'no menu otherwise');
  ok(/if \(mayEdit\) \{\n\s*document\.addEventListener/.test(matches),
     'and no listener either, when there is nothing to close');
});

/* ================= the form ================= */

test('the route is the one suffix that means something other than the analysis', () => {
  const r=/function route\(\)[\s\S]*?\n  \}/.exec(APPJS)[0];
  ok(/if \(parts\[2\] === 'edit'\) return renderMatchEdit\(view, slug\)/.test(r));
  ok(/return renderMatchStats\(view, slug\);/.test(r),'everything else is still the analysis');
});

test('a viewer who types the URL gets told, not a form', () => {
  ok(/if \(!state\.channel \|\| state\.channel\.role !== 'admin'\) \{/.test(editFn),
     'the same shape renderChannelEdit takes');
  ok(/Not an admin of this channel/.test(editFn));
  ok(editFn.indexOf('emptyState')<editFn.indexOf('matchForm('),
     'and it returns before the form is built');
});

test('five fields, and only five', () => {
  const ids=(formFn.match(/id="me[A-Za-z]+"/g)||[])
    .map(s=>s.replace(/^id="/,'').replace(/"$/,''))
    .filter(s=>!/List$/.test(s))
    .filter(s=>!/^me(Go|Cancel|Msg)$/.test(s));
  deepEq(ids.sort(),['meDate','meLeague','meRound','meSeason','meVenue']);
  ok(/type="date"/.test(formFn),'the date is a date box, so it hands back YYYY-MM-DD');
});

test('the payload is the six columns the database grants, and no seventh', () => {
  const call=/opts\.save\(\{[\s\S]*?\}\)/.exec(formFn)[0];
  ['kickoff','match_date','league','season','round','venue'].forEach(k=>
    ok(new RegExp(k+':').test(call),k+' is sent'));
  ['home_score','away_score','published','club_id','our_side','competition','stage']
    .forEach(k=>notOk(new RegExp('\\b'+k+':').test(call),k+' must never be in this payload'));
});

test('the date goes into BOTH date columns', () => {
  /* shape() reads `m.kickoff || m.match_date` and the tagging app reads
     match_date. Writing one of them would show two different days for one match. */
  ok(/kickoff: day,/.test(formFn)&&/match_date: day,/.test(formFn));
  ok(/var day = card\.querySelector\('#meDate'\)\.value \|\| '';/.test(formFn),
     'one value, written twice — they cannot drift');
});

test('saving re-reads the channel rather than patching state by hand', () => {
  ok(/window\.HNA\.match\.update\(m\.uuid, fields\)/.test(editFn));
  ok(/return loadMatches\(state\.channel\)\.then/.test(editFn),
     'the database is asked what it kept');
  notOk(/state\.matches\[/.test(editFn),'nothing is written into state.matches by hand');
  ok(/route\(\);/.test(editFn),'and the same hash is redrawn, which nothing else would do');
});

test('the datalists are what this channel has already used', () => {
  ok(/valuesOf\(state\.matches, 'league'\)/.test(formFn));
  ok(/valuesOf\(state\.matches, 'season'\)/.test(formFn));
  ok(/valuesOf\(state\.matches, 'round'\)/.test(formFn));
  /* suggesting is not the same as forcing: a competition really can differ by
     case, and quietly rewriting what somebody typed cannot be undone */
  notOk(/toLowerCase\(\)/.test(formFn),'nothing typed is normalised on the way in');
});

/* ================= the write ================= */

test('supa.js sends exactly the six columns, whatever it is handed', () => {
  const up=/match: \{[\s\S]*?\n    \},/.exec(SUPA)[0];
  ok(/\['kickoff', 'match_date', 'league', 'season', 'round', 'venue'\]\.forEach/.test(up),
     'one list decides, and it is the list the database grants');
  ok(/hasOwnProperty\.call\(fields \|\| \{\}, k\)/.test(up),'a field not passed is not written');
  ok(/row\[k\] = v === '' \? null : v;/.test(up),'cleared reads as never-said, not as empty string');
  ok(/String\(v\)\.trim\(\)/.test(up),'and stray spaces are not a different league');
  notOk(/\.select\(/.test(up.replace(/\/\*[\s\S]*?\*\//g,'')),
     'no RETURNING — the row need not pass the SELECT policy to save');
});

test('a column the database has not got says which migration is missing', () => {
  ok(/code === '42703'/.test(SUPA),
     'PostgREST fails the WHOLE query for one unknown column, and the catch turns that into an empty channel');
});

/* ================= what the four fields look like ================= */

test('the date cell is the date, and says nothing about the competition', () => {
  const dateCell=/'<span class="m-date">'[\s\S]*?'<\/span>' \+/.exec(matches)[0];
  ok(/esc\(m\.dateLabel\)/.test(dateCell));
  ok(/\(ourHome \? 'Home' : 'Away'\) \+ ' · Match ID ' \+ esc\(m\.id\)/.test(dateCell),
     'which side was ours, and the id — what it said before there was more to say');
  ['m.league','m.season','m.round','m.venue'].forEach(f=>
    notOk(dateCell.indexOf(f)>=0,f+' belongs to the Details cell, not under the date'));
});

test('Details is one cell after Away, competition over ground', () => {
  ok(/'<span>Away<\/span><span>Details<\/span>'/.test(matches)
     ||/<span>Away<\/span><span>Details<\/span>/.test(matches),
     'the heading sits between Away and Result');
  ok(/detailsCell\(m\) \+/.test(matches),'and the cell is built after the away name');
  ok(/\[m\.league, m\.season, m\.round\]\.filter\(Boolean\)/.test(detFn),
     'league, season, round on the top line, each dropped when empty');
  ok(/m\.venue \? '<em>' \+ esc\(m\.venue\) \+ '<\/em>' : ''/.test(detFn),
     'the ground under them, dropped when there is none');
  /* three dashes would be three marks saying the same nothing, and the heading
     above already says what the column is for */
  notOk(/'—'/.test(detFn),'an undescribed match gets an empty cell, not a row of dashes');
});

test('the venue is the venue, with nothing standing in for it', () => {
  ok(/venue: m\.venue \|\| '',/.test(SUPA),
     'shape() carries it raw — it used to fall back to Home/Away, which the Details cell would print as a ground');
  ok(/\.m-det\{/.test(APPCSS)&&/\.m-det-top\{/.test(APPCSS)&&/\.m-det-sep\{/.test(APPCSS),
     'and the cell has its rules');
});

test('the Overview says which campaign its totals are', () => {
  ok(/var pairs = seasonsOf\(state\.matches\);/.test(overview));
  ok(/pairs\.length === 1/.test(overview),'one pair is named');
  ok(/pairs\.length \+ ' competitions'/.test(overview),'more than one is counted, not listed');
  ok(/span \? '<p class="card-sub">'/.test(overview),'and nothing is drawn when nothing was said');
  ok(/\.card-sub\{/.test(APPCSS),'the line has a rule');
});

test('seasonsOf skips a match nobody has said anything about', () => {
  ok(/if \(!lg && !sn\) return;/.test(seasonsFn),
     'a match with neither is not a competition of its own');
  ok(/if \(seen\[k\]\) return;/.test(seasonsFn),'and a pair is counted once');
});

test('Recent results carries the round, and nothing when there is none', () => {
  ok(/m\.round \? '<span class="rrd">' \+ esc\(m\.round\) \+ '<\/span>' : ''/.test(recent),
     'a dash on five rows would be five marks saying nothing');
  ok(/\.rrow \.rrd\{/.test(APPCSS));
});

test('Round is a column on BOTH match tables, in the same place', () => {
  ok(/<th class="c-rnd" rowspan="2">Round<\/th>/.test(teamData),'Team Data');
  ok(/<th class="c-rnd">Round<\/th>/.test(playerTable),'and a player-s own matches');
  /* Straight after the fixture in both — not after the date, because .c-date and
     .c-opp are a frozen PAIR and a sticky run has to be contiguous (see the next
     test). The two tables are meant to read alike, which is what the fixed-column
     test in player-data.test.js exists to keep. */
  ok(/c-opp" rowspan="2">Opposing team<\/th>' \+\n\s*'<th class="c-rnd"/.test(teamData),
     'after Opposing team in Team Data');
  ok(/<th class="c-opp">vs<\/th><th class="c-rnd">Round<\/th>/.test(playerTable),
     'after vs on the player page');
  ok(/esc\(m\.round \|\| '—'\)/.test(teamData)&&/esc\(m\.round \|\| '—'\)/.test(playerTable),
     'and an empty one reads "—" in a column that must hold something');
});

test('the player table-s campaign row keeps its columns lined up', () => {
  const foot=/var foot = [\s\S]*?'<\/tr>';/.exec(playerTable)[0];
  ok(/<td class="c-rnd"><\/td>/.test(foot),
     'empty, not "—": a campaign has no round, and a missing cell would shift every total left');
});

test('Round scrolls, and the frozen pair is left exactly as it was', () => {
  const css=APPCSS.replace(/\s*\n\s*/g,'');
  /* It cannot be sticky. A sticky run has to be contiguous, so .c-rnd would need
     a fixed left offset — and a table column grows to fit what is in it. 82px was
     allowed for; "Matchday 12" made the column 97, and .c-opp pinned at 186 sat
     15px on top of the text. Measured in a browser, not guessed. */
  notOk(/table\.stbl \.c-rnd\{[^}]*position:sticky/.test(css),'it is not sticky');
  ok(/table\.stbl \.c-opp\{position:sticky; ?left:104px/.test(css),
     '.c-opp still starts where .c-date ends, exactly as before this change');
  ok(/table\.stbl tfoot \.c-opp\{position:sticky; ?left:104px/.test(css),'and so does the foot');
  ok(/@media \(max-width:720px\)\{table\.stbl \.c-date, table\.stbl \.c-opp\{position:static\}/.test(css),
     'the two of them still let go where there is no width to spare');
  ok(/table\.stbl \.c-rnd\{[^}]*white-space:nowrap/.test(css),
     'and the round is kept on one line, whatever the competition calls it');
});

/* ================= 0023 ================= */

test('0023 adds a column and changes nothing that is already there', () => {
  ok(/alter table public\.matches add column if not exists round text;/.test(SQL));
  notOk(/drop column|alter column|update public\.matches|delete from/i.test(SQL),
     'nothing existing is rewritten');
  eq((SQL.match(/add column/g)||[]).length,1,'one column, not four — league and season are 0022-s');
});

test('reading a match is left exactly as it was', () => {
  ok(/create policy matches_select on public\.matches for select to authenticated\s*using \(true\)/.test(SQL),
     'narrowing what can be READ is a different change, and would cost the tagging app its matches');
  ok(/create policy matches_insert on public\.matches for insert to authenticated\s*with check \(true\)/.test(SQL),
     'and the tagging app still creates matches before they belong to a channel');
});

test('only an admin of the channel the match is IN may update it', () => {
  ok(/drop policy if exists matches_rw on public\.matches;/.test(SQL),
     'the for-all-using-true policy is gone');
  const up=/create policy matches_update[\s\S]*?;/.exec(SQL)[0];
  ok(/for update/.test(up));
  ok(/is_staff\(\)/.test(up),'staff keep their access');
  ok(/is_club_admin\(club_id\)/.test(up),'and an admin of that club');
  ok(/club_id is not null/.test(up),'a match in no channel has no admin, so only staff');
  /* using says which rows may be touched; with check says what they may become.
     Without it an admin could set club_id and push the match into a channel
     they do not administer, where nobody can pull it back. */
  const usingPart=/using\s*\(([\s\S]*?)\)\n?\s*with check/.exec(up);
  ok(usingPart,'it has both halves');
  ok(/with check \(public\.is_staff\(\) or \(club_id is not null and public\.is_club_admin\(club_id\)\)\)/.test(up),
     'and they say the same thing');
});

test('a channel may write six columns and no others', () => {
  ok(/revoke update on public\.matches from authenticated;/.test(SQL),'the blanket grant goes first');
  const grant=/grant\s+update \(([^)]*)\)/.exec(SQL);
  ok(grant,'and a column grant replaces it');
  const cols=grant[1].split(',').map(s=>s.trim());
  /* 0024 adds venue to this, because grant is cumulative — 0023 cannot be edited
     to include it: it has `create policy`, which errors on a second run. */
  const MIG24=readSrc('supabase/migrations/0024_match_venue_editable.sql');
  const SQL24=MIG24.replace(/--[^\n]*/g,'');
  ok(/grant update \(venue\) on public\.matches to authenticated;/.test(SQL24),
     '0024 opens the sixth');
  notOk(/create policy|alter table|revoke/i.test(SQL24),
     'and does nothing else — no policy to clash on a re-run, no column, no revoke');
  const all=cols.concat(['venue']).sort();
  deepEq(all,['kickoff','league','match_date','round','season','venue'],
     'exactly the six the form sends');
  ['home_score','away_score','published','club_id','our_side','code','home_team_id']
    .forEach(k=>notOk(all.indexOf(k)>=0,k+' must not be writable from a channel'));
  /* the one place in the client that decides, checked against the two migrations
     that decide in the database — they cannot drift without this failing */
  const list=/\['kickoff', 'match_date', 'league', 'season', 'round', 'venue'\]/.exec(SUPA);
  ok(list,'supa.js sends the same six');
});

test('0024 has to run after 0023, and says so', () => {
  const MIG24=readSrc('supabase/migrations/0024_match_venue_editable.sql');
  /* 0023 revokes UPDATE on the whole table and then grants five columns back.
     Run 0024 first and that revoke takes the venue grant away with everything
     else — the order is not a preference. */
  ok(/PHẢI CHẠY 0023 TRƯỚC|must run 0023 first/i.test(MIG24),'the order is stated');
  ok(/revoke/i.test(MIG24),'and why: 0023 revokes, so a grant made before it is lost');
});

test('deleting a match is not something a channel can do', () => {
  ok(/create policy matches_delete on public\.matches for delete to authenticated\s*using \(public\.is_staff\(\)\)/.test(SQL),
     'there is no delete button on the client site, and no policy that would serve one');
});

test('the migration says out loud what has to be checked after it runs', () => {
  /* revoke applies to the role the tagging app runs under too. If that app
     updates any other column of public.matches, it stops working — and the
     person running this needs to know that before they run it, not after. */
  ok(/APP TAGGING/.test(MIG),'the tagging app is named');
  ok(/permission denied for table matches/.test(MIG),'and the error it would give');
});

/* ================= nothing else moved ================= */

test('no stat, no column set and no shared figure was touched', () => {
  const SHAREDJS=readSrc('shared.js');
  ok(/const GK_COLS=\[/.test(SHAREDJS)&&/const PLAYER_CATS=/.test(SHAREDJS),
     'shared.js still holds both, unchanged by anything here');
  notOk(/round/.test(/const GK_COLS=\[[\s\S]*?\n\];/.exec(SHAREDJS)[0]),
     'round is a fact about a fixture, not a statistic');
  ok(/location\.hash = '#\/match\/' \+ encodeURIComponent\(m\.slug \|\| m\.id\);/.test(matches),
     'and clicking a row still opens the analysis');
});
