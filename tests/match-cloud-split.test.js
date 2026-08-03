/* ☁ Cloud and ⚽ Match used to be one modal.

   The connection (Supabase URL, anon key, Connect) and the matches you reach with it
   (＋ New match, the Match ID box) had nothing to do with each other beyond needing the
   first before the second. So the connection moved into ▾ Other, where it is set once and
   forgotten, and ⚽ Match took its place on the bar, where it is used constantly.

   The split was done by moving the DOM, not by rewriting the wiring: every control kept
   the id cloud-sync.js already binds, so no handler changed hands. What this file guards
   is that nothing was left pointing at the modal it used to live in — the preview card in
   particular closed #cloudModal, which no longer contains it. */
const fs=require('fs'), path=require('path');
const {test,eq,ok,notOk}=require('./tiny-test');
const {SRC,CLOUD,grabConst}=require('./harness');

const ROOT=path.join(__dirname,'..');
const header=SRC.slice(SRC.indexOf('<header>'),SRC.indexOf('</header>'));
const modal=id=>{
  const from=SRC.indexOf('id="'+id+'"');
  return from<0?'':SRC.slice(from,SRC.indexOf('</div>\n</div>',from));
};

/* ================= where the two buttons live ================= */
test('Cloud is in the ▾ Other menu, and only there', () => {
  const menu=header.slice(header.indexOf('id="otherMenu"'),header.indexOf('</div>',header.indexOf('id="signOutBtn"')));
  ok(/id="cloudBtn"/.test(menu),'the Cloud entry is a menu row');
  ok(/class="other-item" id="cloudBtn"/.test(menu),'styled as one, not as a bar button');
  eq((header.match(/id="cloudBtn"/g)||[]).length,1,'it is not also still on the bar');
});

test('Match sits on the bar where Cloud used to', () => {
  ok(/class="ev-btn" id="matchBtn"/.test(header),'a bar button');
  // Cloud sat between Duration and Player lists; Match inherits exactly that slot
  ok(header.indexOf('id="durBtn"')<header.indexOf('id="matchBtn"'),'after Duration');
  ok(header.indexOf('id="matchBtn"')<header.indexOf('id="lineupBtn"'),'before Player lists');
});

test('opening a match is never gated — it is how a match gets opened', () => {
  const gated=grabConst('GATED_BTNS');
  notOk(gated.includes('matchBtn'),'⚽ Match stays clickable with no match open');
  notOk(gated.includes('cloudBtn'),'and so does the connection behind it');
});

/* ================= what each modal holds ================= */
test('the connection stayed in ☁ Cloud', () => {
  const m=modal('cloudModal');
  ['cloudUrl','cloudKey','cloudConnect','cloudStatus'].forEach(id=>ok(m.includes('id="'+id+'"'),id));
  ['cloudCreate','cloudMatchId','cloudJoin','matchPreview']
    .forEach(id=>notOk(m.includes('id="'+id+'"'),id+' went to ⚽ Match'));
});

test('the matches moved to ⚽ Match', () => {
  const m=modal('matchHub');
  ['cloudConnected','cloudCreate','cloudMatchId','cloudJoin','matchPreview']
    .forEach(id=>ok(m.includes('id="'+id+'"'),id));
  ['cloudUrl','cloudKey','cloudConnect'].forEach(id=>notOk(m.includes('id="'+id+'"'),id+' stayed in ☁ Cloud'));
  // still behind the connection, exactly as before — cloud-sync reveals it on connect
  ok(/id="cloudConnected" style="display:none"/.test(m),'hidden until the database answers');
});

test('every id cloud-sync binds still exists somewhere', () => {
  const bound=[...new Set((CLOUD.match(/\$\('([a-zA-Z]+)'\)/g)||[]).map(s=>s.slice(3,-2)))];
  bound.forEach(id=>ok(SRC.includes('id="'+id+'"'),'cloud-sync binds #'+id+', and it is in the page'));
});

/* ================= nothing left pointing at the old modal ================= */
test('the preview card closes the modal it actually sits in', () => {
  const render=/function renderMatchPreview\([\s\S]*?\n\}/.exec(SRC)[0];
  ok(/\$\('matchHub'\)\.classList\.remove\('show'\)/.test(render),'⚽ Match, where the card is');
  notOk(/cloudModal/.test(render),'not ☁ Cloud, which no longer contains it');
});

test('both modals open and close on their own', () => {
  ok(/\$\('cloudBtn'\)\.onclick = \(\) => \$\('cloudModal'\)/.test(CLOUD),'Cloud opens Cloud');
  ok(/\$\('matchBtn'\)\.onclick = \(\) => \{ \$\('matchHub'\)/.test(CLOUD),'Match opens Match');
  ok(/previewMatchId\(\);/.test(CLOUD.slice(CLOUD.indexOf("$('matchBtn')"))),
     'and refreshes the preview on open, as the Cloud modal used to');
  ['matchHubClose','matchHub'].forEach(id=>ok(CLOUD.includes("$('"+id+"')"),id+' is wired'));
  ok(/matchHub'\)\)[\s\S]{0,60}remove\('show'\)/.test(CLOUD),'clicking the backdrop closes it');
});

test('the menu gets out of the way when Cloud is picked from it', () => {
  // a listener, not .onclick — cloud-sync owns that property on this button
  ok(/\$\('cloudBtn'\)\.addEventListener\('click',\(\)=>setOpen\(false\)\)/.test(SRC));
});

test('the connection status shows in both places', () => {
  const fn=/function status\([\s\S]*?\n  \}/.exec(CLOUD)[0];
  ok(/cloudStatus/.test(fn)&&/matchHubStatus/.test(fn),
     '⚽ Match hides its controls until connected, so it has to say why');
  ok(SRC.includes('id="matchHubStatus"'),'and the element is there to say it in');
});

test('cloud-sync.js is re-fetched rather than served from cache', () => {
  const v=/cloud-sync\.js\?v=(\d+)/.exec(SRC);
  ok(v,'the script tag carries a version');
  ok(+v[1]>=44,'bumped past 43, the version that shipped before this split — got '+v[1]);
});
