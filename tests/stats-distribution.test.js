/* Stats tab → Distribution: the take-ons & step-ins map, and the row it lives in.

   The three events share ONE map, told apart by colour, with the whole match on a
   single pitch: both halves are normalised so the team attacks RIGHT and the marker
   shape says which half it was (circle 1st, square 2nd) — the same reading as the
   map in the PDF report. It is drawn on the cross map's geometry so the two sit
   side by side at the same size on the row below the pass table. */
const H=require('./harness');
const {loadStats}=H;
const {test,eq,deepEq,ok,notOk}=require('./tiny-test');

const NAMES={funcs:['matchTime','eventHalf','attackDir','dirArrowSVG','takeOnMapHTML'],
  consts:['TAKEON_PARTS']};
const DUR={enabled:true,halfLen:45,h1Start:0,h1End:2760,h2Start:2760,h2End:5700};
const GREEN='#39d98a', RED='#f7506b', BLUE='#2f81f7';
// t<2760 = 1st half, t>=2760 = 2nd. With no shots tagged, attackDir defaults to
// right in the 1st half and left in the 2nd, so 2nd-half marks are mirrored.
const ev=(team,event,x,y,t)=>({id:'e'+event+x+t,t,team,event,playerFrom:'7',playerTo:'',
  pXY:(x==null?null:{x,y})});
const load=rows=>loadStats({rows,lineups:{},dur:DUR,
  meta:{home:'Haiti',away:'Saint Lucia',sport:'football'}},NAMES);
const map=(rows,team)=>load(rows).takeOnMapHTML(team||'home');
const count=(s,re)=>(s.match(re)||[]).length;
// the pitch markings are circles too (centre circle, centre + penalty spots), so
// markers are counted on the fill-opacity only they carry
const MARK=/fill-opacity="0.92"/g, MARK_C=/<circle[^>]*fill-opacity="0.92"/g,
      MARK_R=/<rect[^>]*fill-opacity="0.92"/g;
// the three band percentages along the top of the map, left third first
const topBands=s=>(s.match(/y="40"[^>]*>([\d.]+%)</g)||[]).map(m=>/>([\d.]+%)</.exec(m)[1]);

/* ================= what lands on the map ================= */
test('each of the three events gets its own colour', () => {
  const s=map([ev('home','take-on succes',30,30,100),
               ev('home','take-on fail',40,40,200),
               ev('home','step in',50,50,300)]);
  eq(count(s,new RegExp('fill="'+GREEN+'"','g')),1,'take-on success is green');
  eq(count(s,new RegExp('fill="'+RED+'"','g')),1,'take-on fail is red');
  eq(count(s,new RegExp('fill="'+BLUE+'"','g')),1,'step-in is blue');
});

test('event names are matched case-insensitively (evKey convention)', () => {
  const s=map([ev('home','Take-On Succes',30,30,100),ev('home','STEP IN',40,40,200)]);
  eq(count(s,new RegExp('fill="'+GREEN+'"','g')),1);
  eq(count(s,new RegExp('fill="'+BLUE+'"','g')),1);
});

test('take-on concern stays OFF this map — it is a Defensive action', () => {
  const s=map([ev('home','take-on concern',30,30,100)]);
  eq(count(s,MARK),0,'no marker drawn');
  deepEq(topBands(s),['0%','0%','0%']);
});

test('an event with no pitch dot is left off, not drawn at 0,0', () => {
  const s=map([ev('home','step in',null,null,100),ev('home','step in',50,50,200)]);
  eq(count(s,MARK),1);
});

test('the other side\'s take-ons never appear', () => {
  const s=map([ev('away','take-on succes',30,30,100)],'home');
  eq(count(s,MARK),0);
});

/* ================= halves ================= */
test('circle marks the 1st half, rounded square the 2nd', () => {
  const s=map([ev('home','step in',30,30,100),ev('home','step in',30,30,3000)]);
  eq(count(s,MARK_C),1,'one 1st-half circle');
  eq(count(s,MARK_R),1,'one 2nd-half square');
});

test('both halves are normalised so the team always attacks RIGHT', () => {
  // no shots tagged -> 1st half attacks right, 2nd half left, so the 2nd-half mark
  // at x=20 is mirrored to x=80 and lands on the same spot as a 1st-half x=80
  const s=map([ev('home','step in',20,50,100),ev('home','step in',20,50,3000)]);
  ok(/<circle cx="210.0"/.test(s),'1st half: 20% of a 1050-wide pitch');
  ok(/<rect x="829.0"/.test(s),'2nd half: mirrored to 80% (840 minus the 11 half-width)');
});

/* ================= the ratio bands (shared with the cross map) ================= */
test('the top band splits the marks by third along the pitch', () => {
  const s=map([ev('home','step in',10,50,100),ev('home','step in',20,50,200),
               ev('home','step in',50,50,300),ev('home','step in',90,50,400)]);
  deepEq(topBands(s),['50%','25%','25%']);
});

test('no data -> the pitch and its 0% bands stay, instead of a text note', () => {
  const s=map([]);
  deepEq(topBands(s),['0%','0%','0%']);
  ok(/Attacking/.test(s),'the pitch is still drawn');
  notOk(/stats-empty/.test(s),'no "no data" placeholder');
});

/* ================= presentation ================= */
test('the bands take the colour of the team being shown', () => {
  ok(/fill="var\(--home\)"/.test(map([ev('home','step in',30,30,100)],'home')));
  ok(/fill="var\(--away\)"/.test(map([ev('away','step in',30,30,100)],'away')));
});

test('the legend names the three events and both half shapes', () => {
  const s=map([ev('home','step in',30,30,100)]);
  ['Take-on success','Take-on fail','Step-in','Circle = 1st half','Square = 2nd half']
    .forEach(l=>ok(s.includes(l),l+' in the legend'));
  ok(/takeon-legend/.test(s),'the legend may wrap without changing the card height');
});

test('it is drawn on the cross map geometry, so the pair lines up on one row', () => {
  const s=map([ev('home','step in',30,30,100)]);
  ok(/viewBox="0 0 1200 756"/.test(s),'same viewBox as the cross map');
  ok(/class="chart-card cross-card"/.test(s),'and the same card sizing');
});

test('shirt numbers are escaped before they reach the SVG', () => {
  const r=ev('home','step in',30,30,100); r.playerFrom='<b>7';
  const s=map([r]);
  ok(s.includes('&lt;b&gt;7')&&!s.includes('<b>7'));
});

/* ================= the row wiring =================
   Layout itself is CSS, but which builder goes in which row is code: this guards
   the split — pass matrix + scatter on one row, the two maps on the next. */
test('Distribution renders matrix + scatter, then cross map + take-on map', () => {
  const branch=/statCat==='distribution'\)\{([\s\S]*?)\}else if/.exec(H.STATS)[1];
  ok(/chart-row dist-row.*passMatrixHTML.*passScatterHTML/s.test(branch)
     &&!/dist-row[^`]*crossMapHTML/s.test(branch),'row 1: matrix + scatter only');
  ok(/chart-row dist-maps.*crossMapHTML.*takeOnMapHTML/s.test(branch),
     'row 2: cross map on the left, take-ons & step-ins beside it');
  ok(branch.indexOf('dist-row')<branch.indexOf('dist-maps'),'maps go below');
  ok(branch.indexOf('dist-maps')<branch.indexOf('heatMapHTML'),'and above the heatmap');
});
