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
--  NOT THE WHOLE LIVE LIST. The production dictionary carries about
--  ten more names this repo has never held — goal kick, throw-Ins,
--  foul won, miss shot and the five body parts among them. They were
--  added through the app before anyone thought to write them down,
--  and their hotkeys are not known here. Closing that gap means
--  dumping the live list, putting the real names and codes into
--  DEFAULT_EVENTS, and running the generator again.
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
  ('football', 'pass success', 's', 7),
  ('football', 'pass fail', 'ss', 8),
  ('football', 'cross success', 'c', 9),
  ('football', 'cross fail', 'cc', 10),
  ('football', 'take-on success', 'e', 11),
  ('football', 'take-on fail', 'ee', 12),
  ('football', 'step in', 'r', 13),
  ('football', 'tackle success', 'a', 14),
  ('football', 'tackle fail', 'aa', 15),
  ('football', 'interception', 'q', 16),
  ('football', 'clearance', 'w', 17),
  ('football', 'block', 'qw', 18),
  ('football', 'recovery', 'qq', 19),
  ('football', 'aerial duel success', 'b', 20),
  ('football', 'aerial duel fail', 'bb', 21),
  ('football', 'ground duel success', 'x', 22),
  ('football', 'ground duel fail', 'xx', 23),
  ('football', 'physical duel success', 'pd', 24),
  ('football', 'physical duel fail', 'pdd', 25),
  ('football', 'loose ball duel success', 'lo', 26),
  ('football', 'loose ball duel fail', 'loo', 27),
  ('football', 'take-on concern', 'er', 28),
  ('football', 'mistake', 'm', 29),
  ('football', 'catch', 'ca', 30),
  ('football', 'parry', 'pr', 31),
  ('football', 'save', 'v', 32),
  ('football', 'save standing', 'vs', 33),
  ('football', 'save diving', 'vd', 34),
  ('football', 'save collapse', 'vc', 35),
  ('football', 'save overhead', 'vo', 36),
  ('football', 'save kneeling', 'vk', 37),
  ('football', 'defensive line support success', 'ln', 38),
  ('football', 'defensive line support fail', 'lnn', 39),
  ('football', 'aerial control success', 'ac', 40),
  ('football', 'aerial control fail', 'acc', 41),
  ('football', 'goal conceded', 'gc', 42),
  ('football', 'corner-kick', 'j', 43),
  ('football', 'free-kick', 'k', 44),
  ('football', 'penalty kick', 'pk', 45),
  ('football', 'foul', 'f', 46),
  ('football', 'foul throw', 'tf', 47),
  ('football', 'handball foul', 'hf', 48),
  ('football', 'offside', 'o', 49),
  ('football', 'yellow card', 'yc', 50),
  ('football', 'red card', 'rc', 51),
  ('football', 'substitution', 'sub', 52),
  ('football', 'gain possession', 'gp', 53),
  ('football', 'pause', 'pa', 54)
on conflict (sport, event_name) do nothing;

comment on table public.event_types is
  'The one event dictionary the whole site shares. Seeded from
   pitchtagger_events.json by 0021; grown after that through the app
   (cloud-sync.js pushEventTypes). event_types.key is the SITE DEFAULT
   hotkey — an analyst''s own keys live in public.user_prefs.hotkeys.';
