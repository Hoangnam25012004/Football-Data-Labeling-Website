/* Matchday-squad helpers in shared.js — the Stats tables, the heatmap list, the XLSX
   sheet and the PDF report all read the squad through these.

   Regression under test (reported 2026-07-23): No.3 came on at 81' and never touched the
   ball. computeStats() only knows players with a tagged event, so he was missing from
   every stats table and from the heatmap — the match report said he never played.
*/
const {loadShared}=require('./harness');
const {test,eq,deepEq,ok,notOk}=require('./tiny-test');
const S=loadShared();

/* the reported match: XI 1/2/4/6/7/8/11/13/14/15/17, bench 3/12/19/20/21,
   3 comes on for 7 at 81' and never gets on the ball */
const XI=['1','2','4','6','7','8','11','13','14','15','17'];
const BENCH=['3','12','19','20','21'];
const NAMES={'1':'Barclett','2':'Frederick','3':'Alexander','4':'Thomas','6':'Doxilly',
  '7':'Jude-Boyd','8':'Henville','11':'Richard','12':'Charley','13':'Aman','14':'Elva',
  '15':'Caull','17':'Solomon-Davies','19':'Myers','20':'Jn Baptiste','21':'Nelson'};
function lineups(over){
  const lu=()=>({xi:XI.map(no=>({no,x:50,y:50})),subs:BENCH.slice(),dir:'lr',
    roster:[...XI,...BENCH].map(no=>({no,name:NAMES[no]}))});
  return Object.assign({home:lu(),away:lu(),history:[]},over||{});
}
// the formation snapshot applySubGroup() writes when 7 goes off for 3
const subPeriod=(team,out,inNo,t)=>({t,team,label:'Substitution: '+out+'▼ '+inNo+'▲',
  xi:XI.filter(n=>n!==out).concat(inNo).map(no=>({no,x:50,y:50})),
  subs:BENCH.filter(n=>n!==inNo).concat(out)});

/* ================= squadOnPitch ================= */

test('the starting XI alone, when nobody has been substituted', ()=>{
  deepEq(S.squadOnPitch(lineups(),'home'),XI);
});

test('a substitute who came on is part of the squad', ()=>{
  const l=lineups({history:[subPeriod('home','7','3',4860)]});
  const sq=S.squadOnPitch(l,'home');
  ok(sq.includes('3'),'No.3 played');
  eq(sq.length,12,'the XI plus the one who came on');
});

test('bench players who never came on are NOT listed', ()=>{
  const sq=S.squadOnPitch(lineups({history:[subPeriod('home','7','3',4860)]}),'home');
  ['12','19','20','21'].forEach(n=>notOk(sq.includes(n),'No.'+n+' never played'));
});

test('subHistory alone is enough (snapshot removed by hand)', ()=>{
  const l=lineups(); l.home.subHistory=[{out:'7',in:'3',t:4860}];
  ok(S.squadOnPitch(l,'home').includes('3'));
});

test('several substitution windows all count, once each', ()=>{
  const l=lineups({history:[subPeriod('home','7','3',4860),subPeriod('home','13','21',4900)]});
  const sq=S.squadOnPitch(l,'home');
  ok(sq.includes('3')&&sq.includes('21'));
  eq(sq.length,new Set(sq).size,'no duplicates');
});

test('numbers are trimmed and de-duplicated', ()=>{
  const l=lineups(); l.home.xi=[{no:' 7 '},{no:'7'},{no:7},{no:'9'}];
  l.home.subHistory=[{out:'9',in:' 7 '}];
  deepEq(S.squadOnPitch(l,'home'),['7','9']);
});

test('the away side is independent, and junk input is survivable', ()=>{
  const l=lineups({history:[subPeriod('home','7','3',4860)]});
  notOk(S.squadOnPitch(l,'away').includes('3'),'the home sub is not an away player');
  deepEq(S.squadOnPitch(null,'home'),[]);
  deepEq(S.squadOnPitch({},'home'),[]);
  deepEq(S.squadOnPitch({home:{}},'home'),[]);
  deepEq(S.squadOnPitch({home:{xi:[{no:''},{no:null},{}]}},'home'),[]);
});

/* ================= names ================= */

test('registered names are used, with the old placeholder as a fallback', ()=>{
  const n=S.squadNames(lineups(),'home');
  eq(n['3'],'Alexander');
  eq(S.playerLabel(n,'3'),'Alexander');
  eq(S.playerLabel(n,' 3 '),'Alexander','a padded number still resolves');
  eq(S.playerLabel(n,'99'),'Player 99','unknown number keeps the default label');
  eq(S.playerLabel({},'7'),'Player 7');
  eq(S.playerLabel(null,'7'),'Player 7');
  eq(S.playerLabel(null,'GK'),'GK','non-numeric labels pass through');
  eq(S.playerLabel(null,''),'');
});

test('a squad with no names at all falls back everywhere', ()=>{
  const l=lineups(); l.home.roster=XI.map(no=>({no}));
  const n=S.squadNames(l,'home');
  deepEq(n,{});
  eq(S.playerLabel(n,'7'),'Player 7');
});

test('names are escaped where they reach innerHTML', ()=>{
  eq(S.esc('<b>x</b> & "y"'),'&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;');
  eq(S.esc(null),''); eq(S.esc(0),'0');
});

/* ================= withSquad ================= */

const evRows=[
  {team:'home',event:'pass success',playerFrom:'7',playerTo:'8'},
  {team:'home',event:'pass success',playerFrom:'8',playerTo:'7'},
  {team:'home',event:'goal',playerFrom:'14'},
  {team:'away',event:'pass success',playerFrom:'5',playerTo:'6'},
];

test('the reported case: No.3 came on with no events and still gets a row', ()=>{
  const l=lineups({history:[subPeriod('home','7','3',4860)]});
  const P=S.withSquad(S.computeStats(evRows,'home'),l,'home');
  ok(P['3'],'No.3 is in the table');
  eq(P['3'].passes,0); eq(P['3'].goals,0); eq(P['3'].recoveries,0);
  ok(S.sortedPlayers(P).includes('3'));
});

test('padding never overwrites a player who does have events', ()=>{
  const l=lineups({history:[subPeriod('home','7','3',4860)]});
  const P=S.withSquad(S.computeStats(evRows,'home'),l,'home');
  eq(P['7'].passes,1,'No.7 keeps his tally');
  eq(P['8'].passes,1);
  eq(P['14'].goals,1);
});

test('every starting player is listed even with no events at all', ()=>{
  const P=S.withSquad(S.computeStats([],'home'),lineups(),'home');
  deepEq(S.sortedPlayers(P),XI.slice().sort((a,b)=>a-b));
});

test('a player with events but no lineup entry is still kept', ()=>{
  const P=S.withSquad(S.computeStats(evRows,'away'),lineups(),'away');
  ok(P['5'],'tagged but not in the XI — must not be dropped');
  eq(P['5'].passes,1);
});

test('no lineups at all degrades to the old behaviour', ()=>{
  const P=S.withSquad(S.computeStats(evRows,'home'),{home:S.blankTeamLU('lr'),away:S.blankTeamLU('rl')},'home');
  deepEq(S.sortedPlayers(P),['7','8','14']);
});

test('the padded rows survive statRow() (XLSX / PDF row builders)', ()=>{
  const l=lineups({history:[subPeriod('home','7','3',4860)]});
  const P=S.withSquad(S.computeStats(evRows,'home'),l,'home');
  const row=S.statRow('3',P['3']);
  eq(row[0],'3');
  eq(row.length,S.STAT_HEADERS.length,'one cell per header');
  ok(row.slice(1).every(v=>v===0||v==='0.0%'),'all zeroes: '+row.join(','));
});
