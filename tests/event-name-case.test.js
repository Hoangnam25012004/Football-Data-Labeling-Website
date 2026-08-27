/* Event names are user-editable, so a type can be spelled with any capitalisation.

   Reported 2026-07-24: Throw-ins read 0 everywhere (Stats "Other" tab, report Set
   Pieces) even though throw-ins were being tagged — the tagger's event was named
   "throw-Ins" and EVENT_INC["throw-Ins"] is a case-sensitive miss against the
   "throw-ins" key. Every lookup against a fixed dictionary now goes through evKey. */
const {loadShared}=require('./harness');
const {test,eq,deepEq,ok}=require('./tiny-test');
const S=loadShared();

const ev=(team,no,event,t)=>({id:'r'+t+event,grp:null,team,playerFrom:no,playerTo:'',event,t});

test('evKey trims and lowercases, and survives junk', ()=>{
  eq(S.evKey('throw-Ins'),'throw-ins');
  eq(S.evKey('  Goal  '),'goal');
  eq(S.evKey('SHOT ON TARGET'),'shot on target');
  eq(S.evKey(null),''); eq(S.evKey(undefined),''); eq(S.evKey(0),'0');
});

test('the reported case: "throw-Ins" is counted as a throw-in', ()=>{
  const rows=[ev('home','15','throw-Ins',100),ev('home','15','throw-Ins',200),
              ev('home','2','throw-in',300)];
  const P=S.computeStats(rows,'home');
  eq(P['15'].throwIns,2,'both capitalised throw-ins counted');
  eq(P['2'].throwIns,1,'the singular spelling still works');
  eq(S.sumTeam(rows,'home').throwIns,3,'and the team total the report bars read');
});

test('any capitalisation of any mapped event counts', ()=>{
  const rows=[ev('home','9','Goal',100),ev('home','9','PASS SUCCESS',200),
              ev('home','9','  corner-kick  ',300),ev('home','9','Foul Won',400)];
  const P=S.computeStats(rows,'home');
  eq(P['9'].goals,1); eq(P['9'].passes,1); eq(P['9'].corners,1); eq(P['9'].foulsWon,1);
});

test('an unmapped event name is still ignored', ()=>{
  const rows=[ev('home','9','something made up',100)];
  deepEq(S.sortedPlayers(S.computeStats(rows,'home')),[],'no counter invented for it');
});

test('shot list and body part tolerate capitalisation too', ()=>{
  const rows=[
    {id:'a',grp:'g1',team:'home',playerFrom:'9',playerTo:'',event:'Shot On Target',t:100},
    {id:'b',grp:'g1',team:'home',playerFrom:'9',playerTo:'',event:'Right Foot',t:100.01},
  ];
  const list=S.shotList(rows,'home');
  eq(list.length,1,'the capitalised shot is listed');
  eq(list[0].bodyPart,'Right Foot','and its capitalised body part resolves');
});

test('shotColor is case-insensitive', ()=>{
  eq(S.shotColor('Goal'),S.shotColor('goal'));
  eq(S.shotColor('SHOT ON TARGET'),S.shotColor('shot on target'));
});

test('lowercase spellings keep working exactly as before', ()=>{
  const rows=[ev('home','9','goal',100),ev('home','9','throw-ins',200),ev('home','9','save',300)];
  const P=S.computeStats(rows,'home');
  eq(P['9'].goals,1); eq(P['9'].throwIns,1); eq(P['9'].saves,1);
});

/* ---- the rename, 2026-08-27 ----

   Two names went out of the shipped event list misspelt and were tagged that way
   for months. The list now ships the corrected spelling, so BOTH are in the data
   for good: the fold is what makes them one event, and it lives in evKey so that
   every dictionary in this file, in Stats/stats-view.js and in Stats/report.js
   gets it without being touched.

   The first test here is the one that matters. Every match tagged before the
   rename says 'take-on succes', and EVENT_INC is now keyed on the corrected
   spelling — without the fold, every one of those take-ons would read zero, in
   exactly the silent way "throw-Ins" did in July. */
test('a match tagged under the OLD spelling still counts, after the rename', ()=>{
  const rows=[ev('home','7','take-on succes',100),ev('home','7','take-on succes',200),
              ev('home','7','take-on fail',300)];
  const P=S.computeStats(rows,'home');
  eq(P['7'].takeOns,3,'all three attempts'); eq(P['7'].takeOnsWon,2,'and the two won');
});

test('the corrected spelling counts the same, and mixes with the old one', ()=>{
  const rows=[ev('home','7','take-on success',100),ev('home','7','take-on succes',200),
              ev('home','7','Take-On Success',300)];
  const P=S.computeStats(rows,'home');
  eq(P['7'].takeOns,3); eq(P['7'].takeOnsWon,3,'one event under three spellings');
  eq(S.sumTeam(rows,'home').takeOnsWon,3,'and the team total the report reads');
});

test('evKey folds the two renamed names and leaves every other name alone', ()=>{
  eq(S.evKey('take-on succes'),'take-on success');
  eq(S.evKey(' Take-On Succes '),'take-on success','trimmed and lowercased first');
  eq(S.evKey('gain possesion'),'gain possession');
  eq(S.evKey('take-on fail'),'take-on fail','the pair it belongs to is untouched');
  eq(S.evKey('take-on concern'),'take-on concern');
  eq(S.evKey('pass success'),'pass success');
  eq(S.evKey('throw-Ins'),'throw-ins','the old case rule still applies to everything else');
});

/* The fold is invisible in the data — nothing can un-fold it — so it may only ever
   join two spellings of ONE event. This is the guard on that: every alias has to
   be a name the stat dictionary actually knows, and must not quietly swallow a
   second real event. */
test('every alias points at a real event, and no real event is aliased away', ()=>{
  const inc=S.EVENT_INC;
  Object.keys(S.EV_ALIAS).forEach(from=>{
    const to=S.EV_ALIAS[from];
    ok(inc[to]||to==='gain possession',
       '"'+from+'" folds onto "'+to+'", which no dictionary knows');
    ok(!inc[from],'"'+from+'" is still a key of its own — the fold would never be reached');
  });
});
