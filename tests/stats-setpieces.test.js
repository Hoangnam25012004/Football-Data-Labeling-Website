/* Dashboard → Set Pieces: one upright map per kind of restart, beside who took them.
   docs/setpiece-dashboard-design.md is the design; §8.2 there is the list this file keeps.

   The dropdown picks Freekicks / Corner Kicks / Throw-Ins / Goal Kicks, All / 1st / 2nd pick
   the period, and hovering a taker isolates their marks — the Distribution map's frame, with
   no bands and no grid. ONE mark per set piece, and it is the taker's DELIVERY: the pass,
   cross or shot typed beside the set piece in the same entry. The set-piece row itself never
   carries a destination (none of the 590 on file does), so an arrow drawn from it would be
   an arrow to nowhere. On the Freekicks map a delivery that is a shot is a ball.

   The fixtures are the chain shapes the data survey found (§2 of the design): "2k*cc" is a
   free-kick by 2 and a cross fail by 2 on one dot; "12j*c*z5d" is the ord-less corner whose
   rows come back with ord 0 and in any order. */
const H=require('./harness');
const {loadStats,loadShared}=H;
const vm=require('vm');
const {test,eq,deepEq,ok,notOk}=require('./tiny-test');

const NAMES={funcs:['matchTime','eventHalf','attackDir','spTaken','spBallSVG','spMapHTML'],
  consts:['SP_KINDS','SP_DELIVERY','SP_OK','SP_FAIL','SP_GOAL','jsArg']};
const DUR={enabled:true,halfLen:45,h1Start:0,h1End:2760,h2Start:2760,h2End:5700};
const GREEN='#39d98a', RED='#f7506b', GOLD='#f7b32f';
const KINDS=['freeKicks','corners','throwIns','goalKicks'];

let seq=0;
/* one entry, the way the tagger writes it: every row shares the grp and the clock, `ord` is
   its position in the entry, and a row keeps the taker's dot unless it says otherwise.
   Each spec is [event, player, extra] — extra overrides any field (pXY, rXY, playerTo…). */
const entry=(specs,o)=>{o=o||{};const grp='g'+(++seq);
  return specs.map(([event,from,extra],k)=>Object.assign({id:'r'+(++seq),t:o.t==null?100:o.t,
    team:o.team||'home',event,playerFrom:String(from),playerTo:'',grp,ord:k,
    pXY:o.at||{x:60,y:40},rXY:null},extra||{}));};
const loadOn=(rows,o)=>{o=o||{};
  return loadStats({rows,lineups:{},dur:DUR,meta:{home:'Haiti',away:'Saint Lucia',sport:'football'},
    globals:{spKind:o.kind||'freeKicks',spHalf:o.half||0}},NAMES);};
const map=(rows,o)=>loadOn(rows,o).spMapHTML((o&&o.team)||'home');
const count=(s,re)=>(s.match(re)||[]).length;
const MARK=/class="sp-mark"/g;
const ARROW=/<line [^>]*marker-end="url\(#spm/g;
// a ball ON the map: the first circle of a mark group. The key below the map draws the
// same glyph, so a bare r="17" would count the legend's three as well.
const BALL=c=>new RegExp('<g class="sp-mark" data-p="[^"]*"><circle [^>]*r="17" fill="'+c+'"','g');
// the ranking, one {no,succ,total,pct,rank} per row in document order
const ranking=s=>[...s.matchAll(/<tr data-p="([^"]*)"[^>]*><td class="dl-r">(\d*)<\/td><td><b class="dl-no">[^<]*<\/b>[^<]*<\/td><td class="dl-c">(\d+)<\/td><td class="dl-c">(\d+)<\/td><td class="dl-c">(\d+)%<\/td><\/tr>/g)]
  .map(m=>({no:m[1],rank:m[2],succ:+m[3],total:+m[4],pct:+m[5]}));
const fk=(from,delivery,extra,o)=>entry([['free-kick',from],[delivery,from,extra]],o);
const TO={rXY:{x:85,y:60}};   // where a pass or cross arrived

/* ================= what lands on the map ================= */
test('1 · the arrow is the delivery row\'s, never the set-piece row\'s', () => {
  // 2k*cc — and a set-piece row given an rXY of its own, to prove it is not the one read
  const rows=entry([['free-kick','2',{rXY:{x:10,y:10}}],['cross fail','2',TO]],{at:{x:30,y:20}});
  const s=map(rows);
  eq(count(s,MARK),1,'one set piece, one mark');
  ok(/<line x1="136\.0" y1="735\.0" x2="408\.0" y2="157\.5"/.test(s),
     'from the taker\'s dot to where the cross arrived, stood on end');
  notOk(/x2="68\.0"/.test(s),'not to the set-piece row\'s own rXY');
});

test('2 · a pass and a cross are drawn alike: one solid arrow, green or red', () => {
  const s=map([...fk('7','pass success',TO),...fk('7','cross success',TO),...fk('7','cross fail',TO)]);
  eq(count(s,ARROW),3,'three arrows');
  eq(count(s,/stroke-dasharray/g),0,'no dashed line anywhere');
  eq(count(s,new RegExp('<line [^>]*stroke="'+GREEN+'"','g')),2,'the two that came off are green');
  eq(count(s,new RegExp('<line [^>]*stroke="'+RED+'"','g')),1,'the one that did not is red');
});

test('3 · what the receiver did next is somebody else\'s action, and is not drawn', () => {
  // throw-in by 2 to 7, then 7's own pass on to 10 — one throw-in, one mark
  const rows=entry([['throw-Ins','2'],['pass success','2',{playerTo:'7',rXY:{x:70,y:30}}],
    ['pass success','7',{pXY:{x:70,y:30},rXY:{x:80,y:50}}]]);
  const s=map(rows,{kind:'throwIns'});
  eq(count(s,MARK),1);
  eq(count(s,ARROW),1);
  deepEq(ranking(s).map(r=>r.no),['2'],'only the taker is ranked');
});

test('4 · throw-Ins, THROW-INS and throw-in are all Throw-Ins (evKey)', () => {
  const rows=[...entry([['throw-Ins','2'],['pass success','2',TO]]),
    ...entry([['THROW-INS','2'],['pass success','2',TO]]),
    ...entry([['throw-in','2'],['pass fail','2',TO]])];
  const s=map(rows,{kind:'throwIns'});
  eq(count(s,MARK),3);
  deepEq(ranking(s)[0],{no:'2',rank:'1',succ:2,total:3,pct:67});
});

test('5 · each kind lands on its own entry only, and the other side never appears', () => {
  const rows=[...entry([['corner-kick','7'],['cross fail','7',TO]]),
    ...fk('10','pass success',TO),...fk('4','pass fail',TO,{team:'away'})];
  eq(count(map(rows,{kind:'freeKicks'}),MARK),1,'Freekicks: the home free-kick');
  eq(count(map(rows,{kind:'corners'}),MARK),1,'Corner Kicks: the corner');
  eq(count(map(rows,{kind:'throwIns'}),MARK),0,'Throw-Ins: none');
  eq(count(map(rows,{kind:'goalKicks'}),MARK),0,'Goal Kicks: none');
  deepEq(ranking(map(rows,{kind:'freeKicks',team:'away'})).map(r=>r.no),['4'],'the away map is away\'s');
});

test('6 · both halves are normalised so the team always attacks UP', () => {
  // no shots tagged -> 1st half attacks right, 2nd left: the same spot in the 2nd half is
  // mirrored, exactly as the Distribution map mirrors it
  const s=map([...fk('7','pass success',TO,{at:{x:20,y:50}}),...fk('7','pass success',TO,{at:{x:20,y:50},t:3000})]);
  ok(/<circle cx="340\.0" cy="840\.0" r="7"/.test(s),'1st half: 20% of the length, from the back');
  ok(/<circle cx="340\.0" cy="210\.0" r="7"/.test(s),'2nd half: mirrored to 80%');
});

/* ================= the ord trap (§2.4) ================= */
test('7 · an entry with no ord still finds the taker\'s own cross, not a team-mate\'s shot', () => {
  // "12j*c*z5d" as it comes back from before ord existed: every row reads ord 0, in any order
  const raw=entry([['shot off target','5'],['key pass','12'],['cross success','12',TO],['corner-kick','12']]);
  const zero=raw.map(r=>Object.assign({},r,{ord:0}));
  const none=raw.map(r=>{const c=Object.assign({},r);delete c.ord;return c;});
  [zero,none].forEach((rows,i)=>{
    const t=loadOn(rows,{kind:'corners'}).spTaken('home','corners',0);
    eq(t.length,1,'one corner');
    eq(t[0].del&&t[0].del.event,'cross success',(i?'ord missing':'ord 0')+': the delivery is 12\'s cross');
    const s=map(rows,{kind:'corners'});
    eq(count(s,ARROW),1,'drawn as the cross it was');
    deepEq(ranking(s),[{no:'12',rank:'1',succ:1,total:1,pct:100}]);
  });
});

test('8 · a set piece typed AFTER the pass does not take that pass as its delivery', () => {
  const rows=entry([['pass success','7',TO],['free-kick','7']]);
  const s=map(rows);
  eq(count(s,MARK),0,'nothing drawn');
  deepEq(ranking(s),[{no:'7',rank:'1',succ:0,total:1,pct:0}],'but it was still taken');
});

test('9 · an entry holding two set pieces is opened by the first', () => {
  const rows=entry([['free-kick','7'],['corner-kick','7'],['cross success','7',TO]]);
  eq(count(map(rows,{kind:'freeKicks'}),MARK),1,'the free-kick opened it and gets the cross');
  const c=map(rows,{kind:'corners'});
  eq(count(c,MARK),0,'the corner gets no mark…');
  deepEq(ranking(c).map(r=>r.total),[1],'…but is still counted as taken');
});

test('10 · a set piece typed on its own counts as taken, with no mark', () => {
  const s=map([{id:'solo',t:100,team:'home',event:'free-kick',playerFrom:'9',playerTo:'',
    grp:null,ord:0,pXY:{x:60,y:40},rXY:null}]);
  eq(count(s,MARK),0);
  deepEq(ranking(s),[{no:'9',rank:'1',succ:0,total:1,pct:0}]);
});

/* ================= the ball (Q1, Q2, Q4) ================= */
test('11 · a free-kick struck at goal is a ball where it was struck, in its outcome\'s colour', () => {
  const at={at:{x:80,y:40}};
  const s=map([...fk('10','goal',null,at),...fk('10','shot on target',null,at),
    ...fk('10','shot off target',null,at),...fk('10','blocked shot',null,at),...fk('10','miss shot',null,at)]);
  eq(count(s,MARK),5);
  eq(count(s,BALL(GOLD)),1,'a goal is gold');
  eq(count(s,BALL(GREEN)),1,'on target is green');
  eq(count(s,BALL(RED)),3,'off target, blocked and missed are all red');
  eq(count(s,ARROW),0,'a shot has no destination to point at');
  ok(/<circle cx="272\.0" cy="210\.0" r="17"/.test(s),'drawn on the free-kick spot');
});

test('12 · a team-mate\'s shot later in a free-kick\'s entry is not a ball, and nothing says so', () => {
  const rows=entry([['free-kick','7'],['cross success','7',Object.assign({playerTo:'14'},TO)],
    ['shot on target','14',{pXY:{x:85,y:60}}],['goal','14',{pXY:{x:85,y:60}}]]);
  const s=map(rows);
  eq(count(s,MARK),1,'the cross, and only the cross');
  eq(count(s,/<g class="sp-mark"[^>]*><circle [^>]*r="17"/g),0,'no ball on the map');
  notOk(/sm-sub/.test(s),'no line under the map');
  notOk(/free-kick delivery|not drawn here/.test(s),'no explanation of the difference');
});

test('13 · the key: Succeeded and Failed, plus three balls on Freekicks — no Pass, no Cross', () => {
  const f=map(fk('7','pass success',TO));
  ['Succeeded','Failed','Goal','On target','Off target / Blocked / Missed']
    .forEach(l=>ok(f.includes('</svg>'+l+'</span>')||f.includes('></span>'+l+'</span>'),'Freekicks key has '+l));
  KINDS.forEach(k=>{const s=map([],{kind:k});
    notOk(/>Pass<|>Cross</.test(s),k+': no Pass or Cross entry');});
  const c=map([],{kind:'corners'});
  notOk(/On target|Off target/.test(c),'the balls are a Freekicks key only');
});

test('14 · a corner struck straight at goal is a dot, not a ball — balls are for free-kicks', () => {
  const s=map(entry([['corner-kick','7'],['shot on target','7']]),{kind:'corners'});
  eq(count(s,MARK),1);
  ok(/<g class="sp-mark" data-p="7"><circle [^>]*r="12" fill="#39d98a"/.test(s),'a green dot');
  eq(count(s,/r="17"/g),0,'no ball anywhere on the Corner Kicks card');
});

test('15 · balls are drawn after the arrows, so no arrow crosses over one', () => {
  // by the mark groups, not by a bare <line — the pitch and the Attacking arrow are lines too
  const s=map([...fk('10','shot off target',null,{at:{x:80,y:40}}),...fk('7','pass success',TO,{t:200})]);
  const arrowAt=s.indexOf('<g class="sp-mark" data-p="7"><line');
  const ballAt=s.indexOf('<g class="sp-mark" data-p="10"><circle');
  ok(arrowAt>0&&ballAt>arrowAt,'the arrow comes first in the markup although the shot was tagged first');
});

/* ================= the ranking ================= */
test('16 · Total is the Stats tab\'s column, player by player, for every kind', () => {
  const rows=[...fk('7','pass success',TO),...fk('7','shot off target'),...fk('10','cross fail',TO,{t:3000}),
    ...entry([['corner-kick','7'],['cross success','7',TO]]),...entry([['corner-kick','11'],['pass success','11',TO]]),
    ...entry([['throw-Ins','2'],['pass success','2',TO]]),...entry([['throw-in','3'],['pass fail','3',TO]]),
    ...entry([['goal kick','1'],['pass success','1',TO]]),
    {id:'solo',t:100,team:'home',event:'goal kick',playerFrom:'1',playerTo:'',grp:null,ord:0,pXY:{x:5,y:50},rXY:null},
    ...entry([['shot off target','5'],['key pass','12'],['cross success','12',TO],['corner-kick','12']]).map(r=>Object.assign(r,{ord:0}))];
  const P=loadShared().computeStats(rows,'home');
  KINDS.forEach(k=>{
    const got={}; ranking(map(rows,{kind:k})).forEach(r=>{got[r.no]=r.total;});
    const want={}; Object.keys(P).forEach(no=>{if(P[no][k])want[no]=P[no][k];});
    deepEq(got,want,k+': ranking Total == computeStats column');
  });
});

test('17 · Succ., % and the order: Total, then Succ., then shirt — ties share a rank', () => {
  const rows=[...fk('10','pass fail',TO),...fk('10','pass fail',TO),...fk('10','pass success',TO),
    ...fk('7','pass success',TO),...fk('7','pass success',TO),...fk('7','pass fail',TO),
    ...fk('14','pass success',TO),...fk('9','pass success',TO)];
  deepEq(ranking(map(rows)),[
    {no:'7',rank:'1',succ:2,total:3,pct:67},
    {no:'10',rank:'2',succ:1,total:3,pct:33},
    {no:'9',rank:'3',succ:1,total:1,pct:100},
    {no:'14',rank:'',succ:1,total:1,pct:100}]);
});

test('18 · the half buttons count only that half', () => {
  const rows=[...fk('7','pass success',TO),...fk('7','pass success',TO),...fk('7','pass fail',TO,{t:3000})];
  eq(ranking(map(rows,{half:0}))[0].total,3,'All');
  eq(ranking(map(rows,{half:1}))[0].total,2,'1st');
  eq(ranking(map(rows,{half:2}))[0].total,1,'2nd');
});

test('19 · nothing to show -> the pitch is still drawn and the table says so', () => {
  const s=map([],{kind:'throwIns'});
  ok(/rotate\(-90\)/.test(s),'the pitch, on end');
  ok(s.includes('No throw-ins tagged for this period.'));
  eq(count(s,MARK),0);
  notOk(/stats-empty/.test(s),'no whole-tab placeholder');
});

/* ================= hover and safety ================= */
test('20 · every mark carries its taker, and hovering a row isolates them', () => {
  const s=map(fk('7','pass success',TO));
  ok(/class="sp-mark" data-p="7"/.test(s));
  ok(/onmouseenter="spHover\('7'\)"/.test(s)&&/onmouseleave="spHover\(''\)"/.test(s));
  // and what spHover does with them, against a document of three marks and two rows
  const el=p=>({dataset:{p},style:{display:''},classList:{on:new Set(),
    toggle(c,v){if(v)this.on.add(c);else this.on.delete(c);}}});
  const marks=[el('7'),el('7'),el('10')], trs=[el('7'),el('10')];
  const ctx={document:{querySelectorAll:q=>q==='.sp-mark'?marks:q==='.sp-rank tbody tr'?trs:[]}};
  vm.createContext(ctx);
  vm.runInContext(H.grabFunction('spHover',H.STATS,'Stats/stats-view.js')+';globalThis.h=spHover;',ctx);
  ctx.h('7');
  deepEq(marks.map(m=>m.style.display),['','','none'],'only 7\'s marks stay');
  ok(trs[0].classList.on.has('sel')&&trs[1].classList.on.has('dim'),'7 selected, 10 dimmed');
  ctx.h('');
  deepEq(marks.map(m=>m.style.display),['','',''],'letting go puts the team back');
  notOk(trs[0].classList.on.size||trs[1].classList.on.size,'and clears both rows');
});

test('21 · shirt numbers are escaped in the markup and in the handler', () => {
  const s=map(fk('<b>7','pass success',TO));
  ok(s.includes('&lt;b&gt;7')&&!s.includes('<b>7'),'escaped in the SVG and the table');
  const q=map(fk("7'x",'pass success',TO));
  ok(q.includes("spHover('7\\'x')"),'a quote cannot close the handler\'s string');
});

test('22 · the balls reconcile with the two Stats columns exactly (§4.6)', () => {
  const at={at:{x:80,y:40}};
  const rows=[...fk('10','goal',null,at),...fk('10','shot on target',null,at),
    ...fk('10','shot off target',null,at),...fk('8','blocked shot',null,at),...fk('8','miss shot',null,at),
    // team-mates' shots after a delivery: counted in the columns, not drawn
    ...entry([['free-kick','7'],['cross success','7',TO],['shot on target','14',{pXY:{x:85,y:60}}]]),
    ...entry([['free-kick','7'],['pass success','7',TO],['shot off target','9',{pXY:{x:75,y:50}}]]),
    ...entry([['free-kick','7'],['cross success','7',TO],['blocked shot','12',{pXY:{x:80,y:45}}]]),
    ...entry([['free-kick','7'],['cross success','7',TO],['goal','11',{pXY:{x:90,y:50}}]])];
  const s=map(rows), sh=loadShared(), P=sh.computeStats(rows,'home');
  // read through the columns themselves, so the labels are held to it as well
  const sum=label=>{const c=sh.PLAYER_CATS.setPieces.find(x=>x[0]===label)[1];
    return Object.values(P).reduce((a,p)=>a+c(p),0);};
  const gold=count(s,BALL(GOLD)), green=count(s,BALL(GREEN)), red=count(s,BALL(RED));
  const mateOn=2, mateOff=2;   // 14 and 11 on target; 9 off target and 12 blocked
  eq(gold+green+mateOn,sum('Freekicks: Shots On Target'),
    "gold + green + team-mates' on target == Freekicks: Shots On Target");
  /* Red is off target, blocked AND missed, and so is the column since 2026-09-24 — the
     only thing the map leaves out now is the team-mates' shots. */
  eq(red+mateOff,sum('Freekicks: Shots Off Target/ Blocked Shots/ Miss Shots'),
    "red + team-mates' off target/blocked/missed == Freekicks: Shots Off Target/ Blocked Shots/ Miss Shots");
});

/* ================= the row wiring ================= */
test('Set Pieces is the one map, in a row of its own', () => {
  const branch=/statCat==='setPieces'\)\{([\s\S]*?)\}else\{/.exec(H.STATS);
  ok(branch,'dashboardHTML has a Set Pieces branch ahead of the bare else');
  ok(/chart-row[\s\S]*spMapHTML\(team\)/.test(branch[1]),'and it draws spMapHTML in a chart row');
});
