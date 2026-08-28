-- ============================================================
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
  ('football', 'goal', 'ddd', 0),
  ('football', 'own goal', 'og', 1),
  ('football', 'assist', 'zz', 2),
  ('football', 'key pass', 'z', 3),
  ('football', 'shot on target', 'dd', 4),
  ('football', 'shot off target', 'd', 5),
  ('football', 'blocked shot', 'db', 6),
  ('football', 'miss shot', 'dm', 7),
  ('football', 'pass success', 's', 8),
  ('football', 'pass fail', 'ss', 9),
  ('football', 'cross success', 'c', 10),
  ('football', 'cross fail', 'cc', 11),
  ('football', 'take-on succes', 'e', 12),
  ('football', 'take-on fail', 'ee', 13),
  ('football', 'step in', 'r', 14),
  ('football', 'tackle success', 'a', 15),
  ('football', 'tackle fail', 'aa', 16),
  ('football', 'interception', 'q', 17),
  ('football', 'clearance', 'w', 18),
  ('football', 'block', 'qw', 19),
  ('football', 'recovery', 'qq', 20),
  ('football', 'aerial duel success', 'b', 21),
  ('football', 'aerial duel fail', 'bb', 22),
  ('football', 'ground duel success', 'gd', 23),
  ('football', 'ground duel fail', 'gdd', 24),
  ('football', 'physical duel success', 'x', 25),
  ('football', 'physical duel fail', 'xx', 26),
  ('football', 'loose ball duel success', 'l', 27),
  ('football', 'loose ball duel fail', 'll', 28),
  ('football', 'take-on concern', 'er', 29),
  ('football', 'mistake', 'm', 30),
  ('football', 'catch', 'v', 31),
  ('football', 'parry', 'vv', 32),
  ('football', 'save', 'va', 33),
  ('football', 'save standing', 'vs', 34),
  ('football', 'save diving', 'vd', 35),
  ('football', 'save collapse', 'vc', 36),
  ('football', 'save overhead', 'vo', 37),
  ('football', 'save kneeling', 'vk', 38),
  ('football', 'defensive line support success', 'gx', 39),
  ('football', 'defensive line support fail', 'gxx', 40),
  ('football', 'aerial control success', 'gb', 41),
  ('football', 'aerial control fail', 'gbb', 42),
  ('football', 'goal conceded', 'p', 43),
  ('football', 'corner-kick', 'j', 44),
  ('football', 'free-kick', 'k', 45),
  ('football', 'penalty kick', 'pk', 46),
  ('football', 'throw-Ins', 'tm', 47),
  ('football', 'goal kick', 'gk', 48),
  ('football', 'foul', 'f', 49),
  ('football', 'foul throw', 'tf', 50),
  ('football', 'handball foul', 'hf', 51),
  ('football', 'foul won', 'ff', 52),
  ('football', 'offside', 'o', 53),
  ('football', 'yellow card', 'yc', 54),
  ('football', 'red card', 'rc', 55),
  ('football', 'substitution', 'sub', 56),
  ('football', 'pause', 'pa', 57),
  ('football', 'right foot', 'rf', 58),
  ('football', 'left foot', 'lf', 59),
  ('football', 'upper body', 'ub', 60),
  ('football', 'head', 'h', 61),
  ('football', 'lower body', 'lb', 62),
  ('football', 'gain possesion', 'gp', 63),
  ('football', 'hit', 'i', 64)
on conflict (sport, event_name) do nothing;

comment on table public.event_types is
  'The one event dictionary the whole site shares. Seeded from
   pitchtagger_events.json by 0021; grown after that through the app
   (cloud-sync.js pushEventTypes). event_types.key is the SITE DEFAULT
   hotkey — an analyst''s own keys live in public.user_prefs.hotkeys.';
