/* Stats tab → Distribution: the one map that carries passes, crosses, take-ons and
   step-ins, and the row it lives in.

   The dropdown picks which action, the All / 1st / 2nd buttons pick the period, and
   both halves are normalised so the team always attacks UP — one picture, not two
   behind a toggle. Passes OPEN on an 18-cell grid (the share started in each cell)
   because a whole match of arrows is unreadable; the other three open on their marks,
   and hovering a player in the ranking swaps to his either way.

   These tests carry over from the take-ons & step-ins map this one replaced: the
   colour per event, the evKey convention, whose events land on it, the normalisation,
   the ratio bands and the escaping all have to hold here too. */
const H=require('./harness');
const {loadStats}=H;
const {test,eq,deepEq,ok,notOk}=require('./tiny-test');

const NAMES={funcs:['matchTime','eventHalf','attackDir','distMapHTML'],
  consts:['DIST_CATS','jsArg']};
const DUR={enabled:true,halfLen:45,h1Start:0,h1End:2760,h2Start:2760,h2End:5700};
const GREEN='#39d98a', RED='#f7506b', BLUE='#2f81f7';
// t<2760 = 1st half, t>=2760 = 2nd. With no shots tagged, attackDir defaults to
// right in the 1st half and left in the 2nd, so 2nd-half marks are mirrored.
const ev=(team,event,x,y,t,to)=>({id:'e'+event+x+t,t,team,event,playerFrom:'7',playerTo:'',
  pXY:(x==null?null:{x,y}), rXY:(to==null?null:{x:to,y:50})});
// `cat`/`half` are the page's loose lets, so they go in through globals
const map=(rows,o)=>{o=o||{};
  return loadStats({rows,lineups:{},dur:DUR,meta:{home:'Haiti',away:'Saint Lucia',sport:'football'},
    globals:{distCat:o.cat||'takeons',distHalf:o.half||0}},NAMES)
    .distMapHTML(o.team||'home');};
const count=(s,re)=>(s.match(re)||[]).length;
// every mark is wrapped in the group the ranking hovers on, so they count cleanly
// however they are drawn (a dot for take-ons, an arrow for a pass)
const MARK=/class="dl-dot"/g;
// the six band percentages, in document order: the three down the LEFT (by third along
// the pitch, attacking third first) then the three along the bottom (across it)
const bands=s=>(s.match(/class="dl-band"[^>]*>(\d+%)</g)||[]).map(m=>/>(\d+%)</.exec(m)[1]);
const leftBands=s=>bands(s).slice(0,3);

/* ================= what lands on the map ================= */
test('each action gets its own colour, in its own dropdown entry', () => {
  const t=map([ev('home','take-on succes',30,30,100),ev('home','take-on fail',40,40,200)],{cat:'takeons'});
  eq(count(t,new RegExp('fill="'+GREEN+'"','g')),1,'take-on success is green');
  eq(count(t,new RegExp('fill="'+RED+'"','g')),1,'take-on fail is red');
  const s=map([ev('home','step in',50,50,300)],{cat:'stepins'});
  eq(count(s,new RegExp('fill="'+BLUE+'"','g')),1,'step-in is blue, on its own entry');
});

test('an action only lands on the entry that names it', () => {
  eq(count(map([ev('home','step in',50,50,300)],{cat:'takeons'}),MARK),0,'no step-in on Take-ons');
  eq(count(map([ev('home','take-on succes',30,30,100)],{cat:'stepins'}),MARK),0,'nor the other way');
});

test('event names are matched case-insensitively (evKey convention)', () => {
  eq(count(map([ev('home','Take-On Succes',30,30,100)],{cat:'takeons'}),MARK),1);
  eq(count(map([ev('home','STEP IN',40,40,200)],{cat:'stepins'}),MARK),1);
});

test('take-on concern stays OFF this map — it is a Defensive action', () => {
  const s=map([ev('home','take-on concern',30,30,100)],{cat:'takeons'});
  eq(count(s,MARK),0,'no marker drawn');
  deepEq(leftBands(s),['0%','0%','0%']);
});

test('an event with no pitch dot is left off, not drawn at 0,0', () => {
  eq(count(map([ev('home','step in',null,null,100),ev('home','step in',50,50,200)],{cat:'stepins'}),MARK),1);
});

test('the other side\'s events never appear', () => {
  eq(count(map([ev('away','take-on succes',30,30,100)],{cat:'takeons'}),MARK),0);
});

/* ================= halves ================= */
test('both halves are normalised so the team always attacks UP', () => {
  // no shots tagged -> 1st half attacks right, 2nd half left. The pitch is on end and
  // 1050 long, so x=20 in the 1st half sits deep (y=840) and the same x in the 2nd is
  // mirrored to 80 and lands up near the goal (y=210), where a 1st-half 80 would.
  const s=map([ev('home','step in',20,50,100),ev('home','step in',20,50,3000)],{cat:'stepins'});
  ok(/<circle cx="340.0" cy="840.0"/.test(s),'1st half: 20% of the length, from the back');
  ok(/<circle cx="340.0" cy="210.0"/.test(s),'2nd half: mirrored to 80%');
});

test('the All / 1st / 2nd buttons pick the period', () => {
  const rows=[ev('home','step in',30,30,100),ev('home','step in',30,30,3000)];
  eq(count(map(rows,{cat:'stepins',half:0}),MARK),2,'All keeps both');
  eq(count(map(rows,{cat:'stepins',half:1}),MARK),1,'1st keeps one');
  eq(count(map(rows,{cat:'stepins',half:2}),MARK),1,'2nd keeps the other');
});

/* ================= the ratio bands ================= */
test('the left band splits the marks by third along the pitch, attacking third first', () => {
  const s=map([ev('home','step in',10,50,100),ev('home','step in',20,50,200),
               ev('home','step in',50,50,300),ev('home','step in',90,50,400)],{cat:'stepins'});
  deepEq(leftBands(s),['25%','25%','50%'],'one up front, one in the middle, two at the back');
});

test('no data -> the pitch and its 0% bands stay, instead of a text note', () => {
  const s=map([],{cat:'stepins'});
  deepEq(bands(s),['0%','0%','0%','0%','0%','0%']);
  ok(/rotate\(-90\)/.test(s),'the pitch is still drawn, on end');
  notOk(/stats-empty/.test(s),'no "no data" placeholder');
});

test('the bands take the colour of the team being shown', () => {
  ok(/class="dl-band"[^>]*fill="var\(--home\)"/.test(map([ev('home','step in',30,30,100)],{cat:'stepins'})));
  ok(/class="dl-band"[^>]*fill="var\(--away\)"/.test(
     map([ev('away','step in',30,30,100)],{cat:'stepins',team:'away'})));
});

/* ================= the two readings ================= */
test('Passes open on the 18-cell grid; the other three open on their marks', () => {
  const p=map([ev('home','pass success',30,30,100,60)],{cat:'passes'});
  ok(/data-mode="grid" data-mode0="grid"/.test(p),'the card opens in grid mode');
  eq(count(p,/class="dl-grid"/g),1,'and the grid is drawn');
  eq(count(p,/ \/ 1</g),18,'18 cells, each carrying its n / total');
  const s=map([ev('home','step in',30,30,100)],{cat:'stepins'});
  ok(/data-mode="dots" data-mode0="dots"/.test(s),'step-ins open on the marks');
});

test('a pass with a receiver is an arrow, a take-on is a dot', () => {
  ok(/<line [^>]*marker-end=/.test(map([ev('home','pass success',30,50,100,70)],{cat:'passes'})),
     'origin to target');
  notOk(/<line [^>]*marker-end=/.test(map([ev('home','take-on succes',30,50,100)],{cat:'takeons'})),
     'take-ons have no target to point at');
});

/* ================= the ranking ================= */
test('the ranking orders on total, with Succ. and % for a won-lost pair', () => {
  const s=map([ev('home','take-on succes',30,30,100),ev('home','take-on fail',30,30,150),
               ev('away','take-on succes',30,30,200)],{cat:'takeons'});
  ok(/<th class="dl-c">Succ\.<\/th>/.test(s)&&/<th class="dl-c">Total<\/th>/.test(s)
     &&/<th class="dl-c">%<\/th>/.test(s),'all five columns');
  ok(/>1<\/td><td><b class="dl-no">7\.<\/b>[^<]*<\/td><td class="dl-c">1<\/td><td class="dl-c">2<\/td><td class="dl-c">50%<\/td>/.test(s),
     'one of two take-ons won reads 1 / 2 / 50%');
});

test('step-ins are ranked on count alone — there is nothing to succeed at', () => {
  const s=map([ev('home','step in',30,30,100)],{cat:'stepins'});
  notOk(/Succ\./.test(s),'no Succ. column');
  ok(/<th class="dl-c">Total<\/th>/.test(s),'just Total');
});

test('hovering a ranking row is what isolates a player', () => {
  const s=map([ev('home','step in',30,30,100)],{cat:'stepins'});
  ok(/onmouseenter="distHover\('7'\)"/.test(s)&&/onmouseleave="distHover\(''\)"/.test(s));
  ok(/class="dl-dot" data-p="7"/.test(s),'and the mark carries the number it isolates on');
});

test('shirt numbers are escaped before they reach the SVG', () => {
  const r=ev('home','step in',30,30,100); r.playerFrom='<b>7';
  const s=map([r],{cat:'stepins'});
  ok(s.includes('&lt;b&gt;7')&&!s.includes('<b>7'));
});

/* ================= the row wiring =================
   Layout itself is CSS, but which builder goes in which row is code: this guards the
   order — the touch heatmap leads, and the one distribution map follows it. */
test('Distribution is the heatmap and then the one map, nothing else', () => {
  const branch=/statCat==='distribution'\)\{([\s\S]*?)\}else if/.exec(H.STATS)[1];
  ok(branch.indexOf('heatMapHTML')<branch.indexOf('distMapHTML'),'the heatmap opens the tab');
  ['passMatrixHTML','passScatterHTML','crossMapHTML','takeOnMapHTML','passTypesHTML','passNetHTML']
    .forEach(f=>notOk(new RegExp(f).test(H.STATS),f+' is gone from the page'));
});
