/* Tagging is quiet, and the events table has no heading over it.

   Tagging a match means several hundred entries. Each one used to raise a toast naming
   the event ("pass success ✓"), and starting an edit raised another explaining what to do
   next — read once, then in the way for the rest of the match. Both are gone: the new row
   appearing in the table, highlighted and scrolled to, already says the tag landed, and an
   edit shows itself as a highlighted row with its text waiting in the entry box.

   What stays are the toasts that report something you cannot otherwise see — a sending-off
   changing the XI, a substitution that could not be applied, a match created. Those are not
   confirmations of a thing you just watched happen. */
const {test,eq,ok,notOk}=require('./tiny-test');
const {grabFunction,SRC}=require('./harness');

/* ================= the table header ================= */
test('the "Events N" heading and its counter are gone', () => {
  notOk(/id="count"/.test(SRC),'no counter element');
  notOk(/<b>Events<\/b>/.test(SRC),'no heading');
  // …and nothing still tries to write to it, which would throw on every render
  notOk(/\$\('count'\)/.test(SRC),"nothing assigns to $('count')");
});

test('the controls that shared that row are untouched', () => {
  const head=/<div class="tbl-head">[\s\S]*?\n    <\/div>/.exec(SRC)[0];
  ok(/id="fmBtn"/.test(head),'⛨ Formation is still there');
  ok(/id="halfSel"/.test(head),'and the half picker');
  ok(/justify-content:flex-end/.test(SRC),'and they keep the right-hand side to themselves');
});

/* ================= tagging ================= */
test('a tag that worked says nothing', () => {
  const fn=grabFunction('submitEntry');
  notOk(/toast\(evs\.length/.test(fn),'no "N events ✓" / "<event> ✓" confirmation');
  notOk(/toast\([^)]*✓/.test(fn),'no success toast of any kind left in the entry path');
});

test('a sending-off is applied without announcing itself', () => {
  const fn=grabFunction('submitEntry');
  notOk(/🟥/.test(fn),'no sent-off toast');
  // …and the work it was wrapped around is still done
  ok(/if\(redOut\.length\|\|replacedReds\.length\)saveLineups\(\)/.test(fn),
     'the new XI is still saved');
  ok(/applyRedCard\(r\.team,r\.playerFrom,r\.t\)/.test(fn),'the player still leaves the pitch');
  ok(/removeRedSideEffects\(replacedReds\)/.test(fn),'and a re-tag still rolls the old one back');
});

test('a substitution that could not be applied still stops, silently', () => {
  const fn=grabFunction('applySubGroup');
  notOk(/toast\(/.test(fn.slice(0,fn.indexOf('state.lineups.history'))),
        'nothing announced on the way out');
  // the early return is the load-bearing half of that line — without it a period would be
  // created for a swap that never happened
  ok(/if\(!done\.length\)return false;/.test(fn),'it still reports failure to the caller');
});

/* ================= editing ================= */
test('starting an edit says nothing either', () => {
  ['startEdit','startEditGroup'].forEach(name=>{
    const fn=grabFunction(name);
    notOk(/toast\(/.test(fn),name+' raises no toast');
    // the row is highlighted and the box is filled — that is the notice
    ok(/renderTable\(\)/.test(fn),name+' still highlights the row');
    ok(/\$\('playerInput'\)/.test(fn),name+' still puts the entry back in the box');
  });
});

/* ================= everything else is left alone ================= */
test('toast() itself is untouched, and still used where it earns its place', () => {
  ok(/function toast\(/.test(SRC),'the helper is still defined');
  // one-off actions in the Match / Cloud / Video flows, not the tagging loop
  ['Match created ✓','Saved team','Opening match #','Uploaded to R2 ✓']
    .forEach(msg=>ok(SRC.includes(msg),'still reported: '+msg));
});

test('the tagging loop is down to two notices, both about something unseen', () => {
  ['applyRedCard','startEdit','startEditGroup','deleteRows']
    .forEach(name=>notOk(/toast\(/.test(grabFunction(name)),name+' is silent'));

  // the tag landed but the formation could not follow it — not a confirmation
  const entry=grabFunction('submitEntry');
  eq((entry.match(/toast\(/g)||[]).length,1,'submitEntry keeps one');
  ok(/toast\('⚠ '\+subPlan\.notices\[0\]\)/.test(entry),'the "no starting XI" notice');

  // applySubGroup still confirms a swap it applied, and opens the formation modal with it
  const sub=grabFunction('applySubGroup');
  eq((sub.match(/toast\(/g)||[]).length,1,'applySubGroup keeps one');
  ok(/toast\('Substitution '\+done\.map/.test(sub),'the one naming the swap that went through');
  ok(/openFmModal\(team\)/.test(sub),'raised beside the modal it tells you to adjust');
});
