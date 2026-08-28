/* The event dictionary, as a migration.

   public.event_types had never been seeded from SQL: every name in it got there because
   somebody typed it into the modal, or because a console script put it there. So a fresh
   project came up with an empty dictionary and nothing in the repo said what belonged in
   it. 0021 is that statement.

   The danger with a seed file is that it goes stale silently — the dictionary moves, the
   .sql does not, and a UAT environment is built from a list nobody has used for months.
   So the file is GENERATED, and this asserts the committed copy is what the generator
   would write today. When this fails the fix is to run the generator, not to edit the SQL.

   It also guards the two things a seed must never do to the live project: change a key or
   change an order. Every analyst's keyboard hangs off event_types.key, and the modal's
   reading order is event_types.ord. */
const {readSrc}=require('./harness');
const {test,eq,ok,notOk}=require('./tiny-test');
const gen=require('../tools/gen-event-types-sql');

const SQL=readSrc('supabase/migrations/0021_seed_event_types.sql');
const DICT=JSON.parse(readSrc('pitchtagger_events.json')).football;

test('the committed migration is what the generator writes today', () => {
  eq(SQL,gen.sql(gen.dictionary()),
     'supabase/migrations/0021_seed_event_types.sql has fallen behind the dictionary — '+
     'run: node tools/gen-event-types-sql.js');
});

test('the generator refuses to work from a dictionary that disagrees with itself', () => {
  /* It reads pitchtagger_events.json and checks index.html's DEFAULT_EVENTS says the same
     thing before writing anything. Generating from one copy while the other has moved is
     how the migration would come to describe a dictionary that does not exist. */
  const src=readSrc('tools/gen-event-types-sql.js');
  ok(/disagree/.test(src),'it says so rather than picking one');
  ok(/throw new Error/.test(src));
  // and it really does agree right now, which is what makes the check above meaningful
  eq(gen.dictionary().length,DICT.length);
});

test('every shipped event is in it, with the key and the order it ships with', () => {
  const rows=[...SQL.matchAll(/^ {2}\('football', ('(?:[^']|'')*'), (null|'(?:[^']|'')*'), (\d+)\)/gm)]
    .map(m=>({name:m[1].slice(1,-1).replace(/''/g,"'"),
              key:m[2]==='null'?'':m[2].slice(1,-1).replace(/''/g,"'"),
              ord:+m[3]}));
  eq(rows.length,DICT.length,'one row per event');
  DICT.forEach((e,i)=>{
    eq(rows[i].name,e.name,'row '+i+' names the wrong event');
    eq(rows[i].key,e.key||'','…or gives it the wrong code');
    eq(rows[i].ord,i,'…or puts it in the wrong place');
  });
});

test('it cannot touch a key or an order that is already there', () => {
  /* THE test of this file. event_types.key is the site-default hotkey every analyst who
     has not rebound one inherits, and ord is the order the modal reads in. An upsert here
     would re-key keyboards and reshuffle the list under people mid-match. */
  ok(/on conflict \(sport, event_name\) do nothing;/.test(SQL),'DO NOTHING, never DO UPDATE');
  notOk(/do update/i.test(SQL),'no upsert');
  notOk(/\bupdate\b|\bdelete\b|\bdrop\b|\btruncate\b|\balter table\b/i.test(
    SQL.replace(/^--.*$/gm,'')),'and nothing outside the insert at all');
});

test('it only ever adds, so it can be run against production or an empty project', () => {
  const body=SQL.replace(/^--.*$/gm,'').trim();
  ok(/^insert into public\.event_types/.test(body),'it starts with the insert');
  /* Blank the string literals before splitting: the table comment contains a semicolon of
     its own ("…by 0021; grown after that…"), and counting that as a statement boundary
     would make this test disagree with the database about how many statements there are.
     '' inside a literal is an escaped quote, not the end of one. */
  const bare=body.replace(/'(?:[^']|'')*'/g,"''");
  const stmts=bare.split(';').map(s=>s.trim()).filter(Boolean);
  eq(stmts.length,2,'exactly two statements: the insert and the table comment');
  ok(/^comment on table public\.event_types/.test(stmts[1]));
});

test('the names that only ever lived in the database are in it now', () => {
  /* Ten names existed in production and not in this repo, added through the modal before
     anyone thought to write them down. Until they were, the seed could not claim to be
     the dictionary, and no test could check the spelling of any of them. */
  const names=new Set(DICT.map(e=>e.name));
  ['goal kick','throw-Ins','foul won','miss shot','hit',
   'right foot','left foot','upper body','head','lower body'].forEach(n=>{
    ok(names.has(n),'the dictionary is missing "'+n+'"');
    ok(SQL.includes("'"+n+"'"),'and the seed does not carry it');
  });
  ok(names.has('throw-Ins'),'spelt with the capital I that macros "t" and "tt" match exactly');
});

test('and the two that only ever lived in the repo are gone', () => {
  /* THE test of this file, and the bug it was written after. 'take-on success' and
     'gain possession' were corrected spellings sitting in pitchtagger_events.json that
     were never pushed anywhere — applyEventTypes() overwrites the local list with the
     cloud's on every load, so every match went on being tagged with the misspellings.

     A seed generated from that list was NOT a no-op. ON CONFLICT matches on event_name;
     neither corrected name exists in the database, so DO NOTHING would have found no
     conflict and inserted both — each carrying a key ('e', 'gp') already held by the
     misspelling it was meant to replace. Two events answering to one code, and
     eventForKey() returning whichever sorted first. */
  const names=new Set(DICT.map(e=>e.name));
  ok(names.has('take-on succes'),'the dictionary ships the spelling the data really uses');
  notOk(names.has('take-on success'),'and not the tidy one, which nothing is tagged with');
  ok(names.has('gain possesion'));
  notOk(names.has('gain possession'));
  // a key may be held by exactly one event, or the entry box cannot resolve it
  const byKey={};
  DICT.forEach(e=>{if(e.key){ok(!byKey[e.key],'"'+e.key+'" is on both '+byKey[e.key]+
    ' and '+e.name); byKey[e.key]=e.name;}});
});
