/* Shot Event List + body-part resolution (shared.js) — used by the Stats Shooting tab
   and the match report. A shot's body part comes from the body-part event tagged in the
   SAME chain entry ("2 free-kick shot-on-target left-foot"), else the nearest same-player
   one; every shot kind is listed in time order and numbered from 1. */
const {loadShared}=require('./harness');
const {test,eq,deepEq,ok,notOk}=require('./tiny-test');
const S=loadShared();

// build a chain (shared grp) of solo events for one player, in order
let _id=0,_grp=0;
function chain(team,no,evs,t){
  const g='g'+(++_grp);
  return evs.map((event,i)=>({id:'r'+(++_id),grp:g,ord:i,team,playerFrom:no,playerTo:'',event,t:t+i*0.01}));
}
function solo(team,no,event,t,grp){return {id:'r'+(++_id),grp:grp||null,team,playerFrom:no,playerTo:'',event,t};}

test('every shot kind is listed, numbered in time order', ()=>{
  const rows=[
    solo('home','9','goal',300),
    solo('home','7','shot off target',100),
    solo('home','8','blocked shot',200),
    solo('home','10','miss shot',400),
    solo('home','11','shot on target',150),
    solo('home','2','pass success',50),   // not a shot
  ];
  const list=S.shotList(rows,'home');
  eq(list.length,5,'five shots, the pass excluded');
  deepEq(list.map(s=>s.idx),[1,2,3,4,5]);
  deepEq(list.map(s=>s.no),['7','11','8','9','10'],'ordered by time');
  deepEq(list.map(s=>s.event),['shot off target','shot on target','blocked shot','goal','miss shot']);
});

test('body part comes from the same chain entry', ()=>{
  const rows=chain('home','71',['free-kick','shot on target','left foot'],660);
  const list=S.shotList(rows,'home');
  eq(list.length,1);
  eq(list[0].no,'71'); eq(list[0].bodyPart,'Left Foot');
});

test('all five body parts map to their display label', ()=>{
  const cases=[['right foot','Right Foot'],['left foot','Left Foot'],['head','Header'],
    ['upper body','Upper Body'],['lower body','Lower Body']];
  cases.forEach(([raw,label])=>{
    const rows=chain('home','9',['shot on target',raw],500);
    eq(S.shotList(rows,'home')[0].bodyPart,label,raw);
  });
});

test('a shot with no body part shows blank, not a crash', ()=>{
  const rows=[solo('home','9','goal',300)];
  eq(S.shotList(rows,'home')[0].bodyPart,'');
});

test('body part falls back to the nearest same-player event when not in a group', ()=>{
  const rows=[
    solo('home','9','shot on target',300),          // no grp
    solo('home','9','right foot',300.2),            // separate entry, same player, close
    solo('home','5','left foot',300.1),             // another player — must NOT be used
  ];
  eq(S.shotList(rows,'home')[0].bodyPart,'Right Foot');
});

test('the group body part wins over a stray same-player one elsewhere', ()=>{
  const g=chain('home','9',['shot on target','head'],700);
  const rows=[...g, solo('home','9','left foot',10)];  // an unrelated early left-foot event
  eq(S.shotList(rows,'home')[0].bodyPart,'Header','the in-chain head is used');
});

test('a body part from the other team is never borrowed', ()=>{
  const rows=[
    solo('home','9','goal',300),
    solo('away','9','right foot',300.1),   // same number, wrong team
  ];
  eq(S.shotList(rows,'home')[0].bodyPart,'','no cross-team match');
});

test('team filter and the both-teams view', ()=>{
  const rows=[solo('home','9','goal',100),solo('away','7','shot on target',200)];
  eq(S.shotList(rows,'home').length,1);
  eq(S.shotList(rows,'away').length,1);
  eq(S.shotList(rows,null).length,2,'both teams when team is null');
});

test('rows with no time are skipped', ()=>{
  const rows=[solo('home','9','goal',null),solo('home','7','shot on target',100)];
  const list=S.shotList(rows,'home');
  eq(list.length,1); eq(list[0].no,'7');
});

test('shotColor: gold goal, green on target, grey otherwise', ()=>{
  eq(S.shotColor('goal'),'#f7b32f');
  eq(S.shotColor('shot on target'),'#39d98a');
  ['shot off target','blocked shot','miss shot','anything'].forEach(e=>eq(S.shotColor(e),'#8b97a7',e));
});

test('body-part events do NOT feed the shot counters in computeStats', ()=>{
  // they are descriptors, not shots — computeStats has no mapping for them
  const rows=chain('home','9',['shot on target','right foot'],500);
  const P=S.computeStats(rows,'home');
  eq(P['9'].totalShots,1,'one shot'); eq(P['9'].shotsOn,1);
});
