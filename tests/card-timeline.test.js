/* Match-timeline card classification (shared.js) — used by the report timeline and the
   Stats-tab summary timeline.

   Reported 2026-07-24: a player's 2nd yellow at 61' plus an explicit red card tagged for
   the same dismissal showed TWICE — a "2nd Yellow → Red" line AND a "Red Card" line on
   the report, two markers on the Stats timeline. classifyCards() drops the redundant red.

   Kinds: 'yc' first yellow · 'y2' second yellow → red · 'rc' a red that is NOT a 2nd
   yellow (a straight red). A red for a player who already has two yellows is omitted. */
const {loadShared}=require('./harness');
const {test,eq,deepEq,ok,notOk}=require('./tiny-test');
const S=loadShared();

const ev=(team,no,event,t)=>({id:'r'+t+event+no,team,playerFrom:no,event,t});
// classifyCards returns a Map(row -> kind); this reads it back as an ordered list
const kinds=(rows)=>{const m=S.classifyCards(rows);
  return rows.filter(r=>m.has(r)).map(r=>r.event+' #'+r.playerFrom+' -> '+m.get(r));};

test('the reported case: 2nd yellow + explicit red = one sending-off', ()=>{
  const rows=[
    ev('away','13','yellow card',1020),   // 17'
    ev('away','13','yellow card',3660),   // 61' — 2nd yellow
    ev('away','13','red card',3660),      // 61' — explicit red for the SAME dismissal
  ];
  const m=S.classifyCards(rows);
  eq(m.get(rows[0]),'yc','first yellow');
  eq(m.get(rows[1]),'y2','second yellow shows as → red');
  notOk(m.has(rows[2]),'the explicit red is dropped (not a second line)');
});

test('the explicit red is dropped whatever order the two 61\' cards sort in', ()=>{
  // red listed BEFORE the 2nd yellow in the array, same timestamp
  const rows=[
    ev('away','13','yellow card',1020),
    ev('away','13','red card',3660),
    ev('away','13','yellow card',3660),
  ];
  const m=S.classifyCards(rows);
  notOk(m.has(rows[1]),'the red is still recognised as the 2nd-yellow dismissal');
  eq(m.get(rows[2]),'y2');
});

test('a straight red (no prior yellows) is shown as a red card', ()=>{
  const rows=[ev('home','5','red card',1800)];
  eq(S.classifyCards(rows).get(rows[0]),'rc');
});

test('a caution then a straight red are two distinct cards', ()=>{
  const rows=[ev('home','5','yellow card',600),ev('home','5','red card',1800)];
  const m=S.classifyCards(rows);
  eq(m.get(rows[0]),'yc'); eq(m.get(rows[1]),'rc','one yellow does not absorb the red');
});

test('two yellows with NO explicit red still read as one → red', ()=>{
  const rows=[ev('home','8','yellow card',600),ev('home','8','yellow card',3000)];
  deepEq(kinds(rows),['yellow card #8 -> yc','yellow card #8 -> y2']);
});

test('two different players, each their own tally', ()=>{
  const rows=[
    ev('home','8','yellow card',600),ev('away','8','yellow card',700),  // same number, different teams
    ev('home','8','yellow card',3000),                                  // home 8 -> 2nd yellow
  ];
  const m=S.classifyCards(rows);
  eq(m.get(rows[0]),'yc'); eq(m.get(rows[1]),'yc','away #8 only has one');
  eq(m.get(rows[2]),'y2','home #8 reaches two');
});

test('non-card events are ignored entirely', ()=>{
  const rows=[ev('home','9','goal',600),ev('home','9','pass success',700),ev('home','9','yellow card',800)];
  const m=S.classifyCards(rows);
  eq(m.size,1); eq(m.get(rows[2]),'yc');
});

test('capitalised card names still classify (user-editable event names)', ()=>{
  const rows=[ev('away','13','Yellow Card',1020),ev('away','13','YELLOW CARD',3660),
              ev('away','13','Red Card',3660)];
  const m=S.classifyCards(rows);
  eq(m.get(rows[1]),'y2'); notOk(m.has(rows[2]),'the capitalised red is dropped too');
});

test('rows with no time are skipped, not crashed on', ()=>{
  const rows=[ev('home','7','yellow card',null),ev('home','7','yellow card',600)];
  const m=S.classifyCards(rows);
  // the timed yellow is the first COUNTED, but total (untimed included) is 2 -> a red
  // for #7 would be dropped; here there is no red, so just the one timed yellow shows
  eq([...m.values()].filter(Boolean).length,1);
});
