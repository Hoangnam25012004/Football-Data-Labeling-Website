#!/usr/bin/env node
/* Regenerate supabase/migrations/0021_seed_event_types.sql from the shipped dictionary.

   The migration's VALUES block is generated, never hand-edited, so the three places that
   have to agree about what the dictionary is cannot drift apart:

     pitchtagger_events.json     the list the test suite reads
     DEFAULT_EVENTS (index.html) the list a first open falls back to
     0021_seed_event_types.sql   the list a fresh database is built from

   The first two are already asserted equal by tests/gk-events-duel-split.test.js; this
   script is what keeps the third in step, and tests/seed-event-types.test.js fails if the
   committed .sql does not match what this would print today.

       node tools/gen-event-types-sql.js            # write the migration
       node tools/gen-event-types-sql.js --stdout   # print it instead

   Adding the ten names the live project has and this repo does not (goal kick, throw-Ins,
   foul won, miss shot, the five body parts, and one more) is a matter of putting them in
   DEFAULT_EVENTS with their real hotkeys and running this again. */
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'supabase', 'migrations', '0021_seed_event_types.sql');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

/* Read the dictionary out of the JSON, then check index.html's copy says the same thing.
   Generating from one while the other has moved is how the migration would come to
   describe a dictionary that no longer exists. */
function dictionary() {
  const json = JSON.parse(read('pitchtagger_events.json')).football;
  const src = read('index.html');
  const from = src.indexOf('const DEFAULT_EVENTS = {');
  const to = src.indexOf('const SPORTS=', from);
  if (from < 0 || to < 0) throw new Error('DEFAULT_EVENTS not found in index.html');
  const body = src.slice(from + 'const DEFAULT_EVENTS = '.length, to).trim().replace(/;$/, '');
  const inline = JSON.parse(body).football;
  const shape = l => JSON.stringify(l.map(e => ({ name: e.name, key: e.key })));
  if (shape(json) !== shape(inline))
    throw new Error('pitchtagger_events.json and DEFAULT_EVENTS disagree — fix that first');
  return json;
}

const q = s => "'" + String(s).replace(/'/g, "''") + "'";

function sql(dict) {
  const rows = dict.map((e, i) =>
    `  ('football', ${q(e.name)}, ${e.key ? q(e.key) : 'null'}, ${i})`);
  return `-- ============================================================
--  The shipped event dictionary, as SQL.
--
--  GENERATED — do not hand-edit the VALUES below.
--    node tools/gen-event-types-sql.js
--
--  public.event_types has never been seeded from a migration. Every
--  event in it got there because somebody typed it into the Event
--  types modal, or because seed_gk_events.js put it there — which
--  means a fresh project (a UAT environment, a restore, a second
--  club) comes up with an EMPTY dictionary and nothing in this repo
--  says what belongs in it.
--
--  This is that statement. It is the list index.html falls back to on
--  a first open (DEFAULT_EVENTS) and the list the test suite reads
--  (pitchtagger_events.json); the generator refuses to run if those
--  two disagree, and tests/seed-event-types.test.js fails if this file
--  has fallen behind either.
--
--  ON CONFLICT DO NOTHING, so:
--    * against the live project this is a NO-OP. Every name below is
--      already there, and DO NOTHING leaves its key and its ord
--      exactly as they are. It will not re-key anybody's keyboard and
--      it will not reorder anybody's modal.
--    * against an empty project it bootstraps a working dictionary.
--    * it is safe to run twice.
--
--  A faithful copy of public.event_types as it stood on 2026-08-28,
--  dumped from a signed-in session. The first draft of this file was
--  not, and would not have been a no-op: the repo held two names the
--  database has never had — 'take-on success' and 'gain possession',
--  corrected spellings that were never pushed anywhere — so DO NOTHING
--  would have found no conflict and INSERTED them, each carrying a key
--  ('e', 'gp') already in use by the misspelling it was meant to
--  replace. Two events answering to one code, and eventForKey()
--  picking whichever sorted first. The dictionary was synced to the
--  live list instead, which is why the misspellings are below and the
--  tidy spellings are not.
--
--  Safe to run and re-run:  supabase db push
--                           (or paste into the SQL Editor)
-- ============================================================

insert into public.event_types (sport, event_name, key, ord) values
${rows.join(',\n')}
on conflict (sport, event_name) do nothing;

comment on table public.event_types is
  'The one event dictionary the whole site shares. Seeded from
   pitchtagger_events.json by 0021; grown after that through the app
   (cloud-sync.js pushEventTypes). event_types.key is the SITE DEFAULT
   hotkey — an analyst''s own keys live in public.user_prefs.hotkeys.';
`;
}

/* Only when run as a command. tests/seed-event-types.test.js requires this file to compare
   the committed migration against what the generator would produce — if requiring it also
   WROTE that migration, the comparison would pass by having just overwritten its own
   subject, and a stale file would never be caught. */
if (require.main === module) {
  const text = sql(dictionary());
  if (process.argv.includes('--stdout')) process.stdout.write(text);
  else { fs.writeFileSync(OUT, text); console.error('wrote ' + path.relative(ROOT, OUT)); }
}

module.exports = { sql, dictionary, OUT };
