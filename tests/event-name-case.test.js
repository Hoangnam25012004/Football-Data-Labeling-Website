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
