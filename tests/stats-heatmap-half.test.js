/* Stats tab → Distribution → touch map: WHO the player list shows per half.

   Reported: with the map filtered to the 1st half, players who only came on after
   the break were listed on 0 touches — the list was the whole matchday squad
   whichever half was selected, so a 2nd-half substitute read as someone who played
   the first half and never touched the ball.

   The list must now be the players who were on the pitch in the selected half,
   both ends of every swap made in it included:
     1st half — the starting XI, plus anyone brought on before the break
     2nd half — the XI that came out after the break, plus anyone brought on in it
     All      — everyone who played (unchanged) */
const {loadStats}=require('./harness');
const {test,eq,deepEq,ok,notOk}=require('./tiny-test');

const NAMES={funcs:['matchTime','eventHalf','squadInHalf'],consts:[]};
// 45-minute halves, the 2nd kicking off at video second 2760
const DUR={enabled:true,halfLen:45,h1Start:0,h1End:2760,h2Start:2760,h2End:5700};
const XI=['1','2','4','6','7','8','11','13','14','15','17'];
const BENCH=['3','12','19','20','21'];
const lu=()=>({xi:XI.map(no=>({no,x:50,y:50})),subs:BENCH.slice(),dir:'lr',
  roster:[...XI,...BENCH].map(no=>({no,name:'P'+no}))});
// the formation snapshot applySubGroup() writes: `on` is the XI in force from t
const period=(team,on,t)=>({t,team,label:'Substitution',
  xi:on.map(no=>({no,x:50,y:50})),subs:[]});
const load=over=>loadStats({rows:[],dur:DUR,
  lineups:Object.assign({home:lu(),away:lu(),history:[]},over||{})},NAMES);
const half=(P,h,team)=>P.squadInHalf(team||'home',h).slice().sort((a,b)=>a-b);
const SORTED_XI=XI.slice().sort((a,b)=>a-b);

/* ================= the reported case ================= */
test('a 2nd-half substitute is not listed in the 1st half', () => {
  // 7 off, 3 on at 81' (video 4860 -> 2nd half)
  const P=load({history:[period('home',XI.filter(n=>n!=='7').concat('3'),4860)]});
  notOk(half(P,1).includes('3'),'No.3 had not come on yet');
  ok(half(P,2).includes('3'),'…but he did play the 2nd half');
});

test('he is still counted for the whole match', () => {
  const P=load({history:[period('home',XI.filter(n=>n!=='7').concat('3'),4860)]});
  ok(P.squadInHalf('home',0).includes('3'),'"All" is everyone who played');
});

test('bench players who never came on are in no list at all', () => {
  const P=load({history:[period('home',XI.filter(n=>n!=='7').concat('3'),4860)]});
  [1,2,0].forEach(h=>['12','19','20','21'].forEach(n=>
    notOk(P.squadInHalf('home',h).includes(n),'No.'+n+' never played (half '+h+')')));
});

/* ================= both ends of a swap ================= */
test('the man taken off in the 2nd half is still a 2nd-half player', () => {
  const P=load({history:[period('home',XI.filter(n=>n!=='7').concat('3'),4860)]});
  ok(half(P,2).includes('7'),'No.7 played until 81\'');
});

test('a 1st-half swap: both men are 1st-half players, only the sub is a 2nd-half one', () => {
  // 7 off, 3 on at 30' (video 1800 -> 1st half)
  const P=load({history:[period('home',XI.filter(n=>n!=='7').concat('3'),1800)]});
  ok(half(P,1).includes('7')&&half(P,1).includes('3'),'both were on in the 1st half');
  ok(half(P,2).includes('3'),'the sub carries on after the break');
  notOk(half(P,2).includes('7'),'the man he replaced does not');
});

test('on and off inside the same half counts for that half only', () => {
  const P=load({history:[
    period('home',XI.filter(n=>n!=='7').concat('3'),3000),    // 3 on for 7, 2nd half
    period('home',XI.filter(n=>n!=='7').concat('12'),4200)]}); // 12 on for 3, 2nd half
  ok(half(P,2).includes('3'),'No.3 came on and went off in the 2nd half');
  notOk(half(P,1).includes('3'));
  notOk(half(P,1).includes('12'));
});

/* ================= no substitutions ================= */
test('with no subs at all both halves are the starting XI', () => {
  const P=load();
  deepEq(half(P,1),SORTED_XI);
  deepEq(half(P,2),SORTED_XI);
});

test('the XI a half kicks off with carries over from the half before', () => {
  // 7 off, 3 on at 30' and nothing after: the 2nd half starts with that XI
  const P=load({history:[period('home',XI.filter(n=>n!=='7').concat('3'),1800)]});
  deepEq(half(P,2),XI.filter(n=>n!=='7').concat('3').sort((a,b)=>a-b));
});

test('a player sent off in the 1st half does not appear in the 2nd', () => {
  // applyRedCard appends a period the same way, just with 10 men
  const P=load({history:[period('home',XI.filter(n=>n!=='6'),1500)]});
  ok(half(P,1).includes('6'),'he played up to the card');
  notOk(half(P,2).includes('6'),'and not after it');
  eq(half(P,2).length,10,'ten men out after the break');
});

/* ================= robustness ================= */
test('a swap whose snapshot was edited away still counts, in its own half', () => {
  const l={home:lu(),away:lu(),history:[]};
  l.home.subHistory=[{out:'7',in:'3',t:4860}];
  const P=loadStats({rows:[],dur:DUR,lineups:l},NAMES);
  notOk(P.squadInHalf('home',1).includes('3'));
  ok(P.squadInHalf('home',2).includes('3'),'the fallback keeps him in the 2nd half');
  ok(P.squadInHalf('home',2).includes('7'),'and the man he replaced');
});

test('the away side keeps its own lists', () => {
  const P=load({history:[period('home',XI.filter(n=>n!=='7').concat('3'),4860)]});
  notOk(half(P,2,'away').includes('3'),'a home sub is not an away player');
  deepEq(half(P,2,'away'),SORTED_XI);
});

test('numbers are trimmed and de-duplicated', () => {
  const l={home:{xi:[{no:' 7 '},{no:'7'},{no:7},{no:'9'}],subs:[],dir:'lr',roster:[]},
           away:lu(),history:[]};
  deepEq(loadStats({rows:[],dur:DUR,lineups:l},NAMES).squadInHalf('home',1),['7','9']);
});

test('no lineups at all -> an empty list, not a throw', () => {
  [{},{home:{}},{home:{xi:[{no:''},{no:null},{}]}}].forEach(l=>{
    const P=loadStats({rows:[],dur:DUR,lineups:l},NAMES);
    deepEq(P.squadInHalf('home',1),[],'half 1');
    deepEq(P.squadInHalf('home',2),[],'half 2');
  });
});

test('with no half-time set, everything falls in the 1st half', () => {
  // Duration off -> eventHalf() always says 1; the 2nd half then just carries the XI
  const l={home:lu(),away:lu(),history:[period('home',XI.filter(n=>n!=='7').concat('3'),4860)]};
  const P=loadStats({rows:[],lineups:l,
    dur:{enabled:false,halfLen:45,h1Start:0,h1End:0,h2Start:0,h2End:0}},NAMES);
  ok(P.squadInHalf('home',1).includes('3'),'the swap reads as a 1st-half one');
  deepEq(P.squadInHalf('home',2).slice().sort((a,b)=>a-b),
    XI.filter(n=>n!=='7').concat('3').sort((a,b)=>a-b),'the 2nd half carries that XI');
});
