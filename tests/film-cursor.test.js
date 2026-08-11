/* Film — the cursor that decides what is on the pitch at a given moment.

   An event is not a frame. Tagged at 61:02.40, it would flash past unreadably at
   playback speed, so each one owns a stretch: FILM_LEAD before its own dot and
   FILM_HOLD after the last dot it has (the receiver's, on a pass). What this
   file guards is that the stretch is computed from the right two times, that the
   set on screen is right at any moment, and that it is right after a seek back
   as well as a play-through — the forward path walks a cursor, the backward one
   rebuilds, and the two must agree.

   Redrawing is expensive (the whole dot layer), so it must happen only when the
   set actually changes. The stub counts the calls. */
const {grabFunction,grabConst,STATS}=require('./harness');
const {test,eq,ok,notOk}=require('./tiny-test');
const vm=require('vm');

const G=n=>grabConst(n,STATS,'Stats/stats-view.js');
const F=n=>grabFunction(n,STATS,'Stats/stats-view.js');

/* one event: t, and optionally the receiver's time */
const ev=(t,o)=>Object.assign({id:'e'+t,t:t,rt:null,team:'home',event:'pass success',
  playerFrom:'2',playerTo:'',pXY:{x:50,y:50},rXY:null},o||{});

function sandbox(rows,filter){
  const ctx={console};
  vm.createContext(ctx);
  vm.runInContext([
    'var rows='+JSON.stringify(rows)+';',
    'var filmFilter='+JSON.stringify(filter||{team:'',player:'',event:''})+';',
    'var film=null, draws=0;',
    'function filmDraw(){draws++;}',
    G('FILM_LEAD'),G('FILM_HOLD'),
    F('filmCues'),F('filmMatches'),F('filmAdvance'),F('filmRewind'),
    ';globalThis.P={filmCues,filmMatches,filmAdvance,filmRewind,FILM_LEAD,FILM_HOLD,',
    '  setFilm:f=>{film=f},getFilm:()=>film,draws:()=>draws,resetDraws:()=>{draws=0}};'
  ].join('\n'),ctx,{filename:'film.js'});
  return ctx.P;
}

const WIN={half:1,label:'1st Half',start:100,end:1000};
function player(P,cues){
  const f={win:WIN,cues:cues,cursor:0,active:[],last:-1};
  P.setFilm(f); return f;
}

/* ================= the stretch each event owns ================= */
test('a solo event runs from LEAD before to HOLD after its own moment', () => {
  const P=sandbox([ev(200)]);
  const c=P.filmCues(WIN)[0];
  eq(c.in,200-P.FILM_LEAD);
  eq(c.out,200+P.FILM_HOLD);
  eq(c.rt,null,'nothing to interpolate to');
});

test('a pass runs to HOLD after the RECEIVER, not the passer', () => {
  const P=sandbox([ev(200,{rt:203.4,playerTo:'3',rXY:{x:70,y:40}})]);
  const c=P.filmCues(WIN)[0];
  eq(c.in,200-P.FILM_LEAD);
  eq(c.out,203.4+P.FILM_HOLD,'the ball has to arrive before the clock starts');
  eq(c.rt,203.4,'and the arrival time is kept, for the ball to run on');
});

test('a receiver time tagged before the passer cannot shorten the window', () => {
  // dots can be placed in any order; out must never come out earlier than t
  const P=sandbox([ev(200,{rt:197})]);
  eq(P.filmCues(WIN)[0].out,200+P.FILM_HOLD);
});

test('a receiver time that is not a number is treated as absent', () => {
  const P=sandbox([ev(200,{rt:'x'}),ev(300,{rt:null})]);
  const c=P.filmCues(WIN);
  eq(c[0].rt,null); eq(c[1].rt,null);
});

/* ================= what belongs to the window ================= */
test('only events inside the window, and always in t order', () => {
  const P=sandbox([ev(500),ev(90),ev(1400),ev(150),ev(1000),ev(100)]);
  const c=P.filmCues(WIN);
  eq(c.map(x=>x.t).join(','),'100,150,500,1000','sorted, both boundaries inclusive');
  notOk(c.some(x=>x.t===90),'before the kick-off: belongs to no half');
  notOk(c.some(x=>x.t===1400),'and neither does the interval or what follows it');
});

/* ================= playing forwards ================= */
test('the active set is right as the clock runs on', () => {
  const P=sandbox([ev(200),ev(201),ev(400)]);
  const L=P.FILM_LEAD, H=P.FILM_HOLD;
  const f=player(P,P.filmCues(WIN));
  P.filmAdvance(150);        eq(f.active.length,0,'nothing yet');
  P.filmAdvance(200-L);      eq(f.active.length,1,'the first is due, a moment before its own time');
  P.filmAdvance(201);        eq(f.active.length,2,'and the second');
  P.filmAdvance(200+H+0.01); eq(f.active.length,1,'the first has had its hold');
  P.filmAdvance(201+H+0.01); eq(f.active.length,0,'and so has the second');
  P.filmAdvance(400-L);      eq(f.active[0].t,400,'the next one arrives on its own');
});

test('the cursor only ever moves forward while playing', () => {
  const P=sandbox([ev(200),ev(400),ev(600)]);
  const f=player(P,P.filmCues(WIN));
  P.filmAdvance(700);
  eq(f.cursor,3,'one pass over the array, not a rescan');
  eq(f.active.length,0,'every one of them is long past');
});

test('a redraw happens when the set changes, and not otherwise', () => {
  const P=sandbox([ev(200)]);
  const L=P.FILM_LEAD, H=P.FILM_HOLD;
  const f=player(P,P.filmCues(WIN));
  P.resetDraws();
  P.filmAdvance(150);        eq(P.draws(),0,'nothing on screen, nothing to draw');
  P.filmAdvance(200-L);      eq(P.draws(),1,'it arrives');
  P.filmAdvance(200.1);      eq(P.draws(),1,'…and holding it is free');
  P.filmAdvance(201.0);      eq(P.draws(),1);
  P.filmAdvance(200+H+0.01); eq(P.draws(),2,'it leaves');
  void f;
});

/* ================= seeking backwards ================= */
test('a rewind rebuilds the same set a play-through would have reached', () => {
  const rows=[ev(200),ev(201),ev(400),ev(402,{rt:404})];
  const P=sandbox(rows);
  const cues=P.filmCues(WIN);

  const a=player(P,cues);
  [150,200,201.5,203,300,401,403,500].forEach(t=>P.filmAdvance(t));
  const b=player(P,P.filmCues(WIN));
  P.filmRewind(201.5);
  eq(b.active.map(c=>c.t).join(','),'200,201','back at 201.5, both are up');
  eq(b.cursor,2,'and the cursor sits after them');

  P.filmRewind(150);
  eq(b.active.length,0,'before anything was tagged');
  eq(b.cursor,0);
  void a;
});

test('a rewind lands mid-pass with the pass still up', () => {
  const P=sandbox([ev(402,{rt:404,playerTo:'3',rXY:{x:70,y:40}})]);
  const f=player(P,P.filmCues(WIN));
  P.filmRewind(403);
  eq(f.active.length,1,'the ball is in the air');
  // it arrived at 404, so the hold runs out at 406.5 — not at 404 + 2.5 from t
  P.filmRewind(406.4);
  eq(f.active.length,1,'still held, nearly 2.5s after it arrived');
  P.filmRewind(406.6);
  eq(f.active.length,0,'and gone once the hold is up');
});

/* ================= the filter (list + Next clip only) ================= */
test('the filter matches on either end of a pass', () => {
  const P=sandbox([],{team:'',player:'3',event:''});
  ok(P.filmMatches(ev(1,{playerFrom:'3'})),'the passer');
  ok(P.filmMatches(ev(1,{playerFrom:'2',playerTo:'3'})),'and the receiver');
  notOk(P.filmMatches(ev(1,{playerFrom:'2',playerTo:'9'})),'nobody else');
});

test('team and event narrow, an empty filter lets everything through', () => {
  eq(sandbox([],{team:'away',player:'',event:''}).filmMatches(ev(1,{team:'home'})),false);
  eq(sandbox([],{team:'',player:'',event:'goal'}).filmMatches(ev(1,{event:'pass success'})),false);
  eq(sandbox([],{team:'',player:'',event:''}).filmMatches(ev(1)),true);
});

/* ================= whose number is whose ================= */
/* One moment on screen regularly holds both sides at once: a tackle that answers
   the pass it broke up is two events, two teams, one caption. Colouring the strip
   by "the last event's team" handed the tackle to whoever had just lost the ball,
   which is the opposite of what the caption is for. The side now rides on each
   number. */
const chain=(()=>{
  const ctx={console};
  vm.createContext(ctx);
  vm.runInContext([
    "function esc(s){return String(s==null?'':s)}",
    F('filmChainHTML'),';globalThis.C=filmChainHTML;'
  ].join('\n'),ctx,{filename:'film.js'});
  return ctx.C;
})();
const row=(team,from,event,to)=>({team:team,playerFrom:from,event:event,playerTo:to||''});

test('a home number is home and an away number is away, in the same caption', () => {
  const html=chain([row('away','14','pass success','13'),row('home','6','tackle success')]);
  eq((html.match(/class="fm-no away"/g)||[]).length,2,'14 and 13 are the away side');
  eq((html.match(/class="fm-no home"/g)||[]).length,1,'6 is not');
  ok(html.indexOf('14')<html.indexOf('13'),'passer before receiver');
  ok(html.indexOf('13')<html.indexOf('6'),'and the tackle after the pass it broke up');
});

test('a solo home event is white, a solo away event is yellow', () => {
  ok(/class="fm-no home">4</.test(chain([row('home','4','clearance')])));
  ok(/class="fm-no away">4</.test(chain([row('away','4','clearance')])));
});

test('the same shirt number on both sides is printed twice, not folded', () => {
  // 13 recovering for one side then 13 receiving for the other is two players
  const html=chain([row('home','13','recovery'),row('away','13','clearance')]);
  eq((html.match(/class="fm-no /g)||[]).length,2,'both are named');
  ok(/fm-no home">13</.test(html)&&/fm-no away">13</.test(html),'each in its own colour');
});

test('one player\'s run of events still prints his number once', () => {
  const html=chain([row('home','13','recovery'),row('home','13','pass success','14')]);
  eq((html.match(/class="fm-no /g)||[]).length,2,'13 once, then the receiver 14');
  eq((html.match(/fm-ev/g)||[]).length,2,'both of his events');
  ok(/fm-no home">14</.test(html),'the receiver takes the passer\'s side');
});

/* ================= the order it was typed in ================= */
/* One entry writes several rows and each carries the time of ITS OWN dot — an
   event tagged without a dot carries the moment Enter was pressed. Sorted by t
   alone, "17 #recovery #cross success #key pass 14 #shot on target #right foot"
   came back as key pass, recovery, cross success: the same touches, in an order
   nobody typed. A chain moves as one block now, at its earliest touch, in ord. */
const ordered=(()=>{
  const ctx={console};
  vm.createContext(ctx);
  vm.runInContext(F('filmOrdered')+';globalThis.O=filmOrdered;',ctx,{filename:'film.js'});
  return ctx.O;
})();
// the entry from the report, with the dot times that scrambled it
const cue=(t,grp,ord,event,from,to)=>({t:t,r:{grp:grp,ord:ord,event:event,team:'home',
  playerFrom:from,playerTo:to||''}});
const ENTRY=[
  cue(35.9,'g1',2,'key pass','17'),          // no dot: carries the moment Enter was hit
  cue(35.1,'g1',0,'recovery','17'),
  cue(35.4,'g1',1,'cross success','17','14'),
  cue(37.6,'g1',4,'right foot','14'),
  cue(37.2,'g1',3,'shot on target','14')
];
const names=list=>list.map(c=>c.r.event).join(' | ');

test('a chain reads in the order it was typed, not the order the dots landed', () => {
  eq(names(ordered(ENTRY)),
     'recovery | cross success | key pass | shot on target | right foot');
});

test('the clock still decides where the chain SITS', () => {
  const before={t:20,r:{grp:null,ord:0,event:'throw-in',playerFrom:'3',playerTo:''}};
  const after ={t:50,r:{grp:null,ord:0,event:'goal kick',playerFrom:'1',playerTo:''}};
  eq(names(ordered([after].concat(ENTRY,[before]))),
     'throw-in | recovery | cross success | key pass | shot on target | right foot | goal kick');
});

test('a chain is never split by a solo event that falls inside its span', () => {
  // 36.5 sits between the chain's first touch and its last, but the block holds
  const mid={t:36.5,r:{grp:null,ord:0,event:'foul',playerFrom:'8',playerTo:''}};
  const out=names(ordered(ENTRY.concat([mid])));
  ok(/recovery \| cross success \| key pass \| shot on target \| right foot/.test(out),
     'the five stay contiguous: '+out);
  ok(out.endsWith('| foul'),'and the loose event sorts after the block it interrupted');
});

test('two chains at the same instant stay whole rather than interleaving', () => {
  const a=[{t:10,r:{grp:'aa',ord:0,event:'a1',playerFrom:'1',playerTo:''}},
           {t:10,r:{grp:'aa',ord:1,event:'a2',playerFrom:'1',playerTo:''}}];
  const b=[{t:10,r:{grp:'bb',ord:0,event:'b1',playerFrom:'2',playerTo:''}},
           {t:10,r:{grp:'bb',ord:1,event:'b2',playerFrom:'2',playerTo:''}}];
  eq(names(ordered([a[1],b[1],a[0],b[0]])),'a1 | a2 | b1 | b2');
});

test('ordering is a second view — it does not disturb the cues themselves', () => {
  const src=ENTRY.slice();
  const before=names(src);
  ordered(src);
  eq(names(src),before,'the array the cursor walks is left in clock order');
});

test('the caption reads the same entry back as one line', () => {
  const html=chain(ordered(ENTRY).map(c=>c.r));
  eq(html.replace(/<[^>]+>/g,''),'17 #recovery #cross success #key pass 14 #shot on target #right foot');
});

/* ================= how far ahead, and how the list follows ================= */
test('an event lands a twentieth of a second before its own moment', () => {
  // 2 #pass success 3 tagged at 1:03.05 is on screen, and lit in the list, at
  // 1:03.00 — both read off the same cursor, so they can never disagree
  eq(sandbox([]).FILM_LEAD,0.05);
});

/* filmMark scrolls by measuring two rectangles, so the stub is a real scroller:
   a row sitting `d` below the list's content top reports a viewport position
   that moves with scrollTop, exactly as the browser would. */
const marker=(()=>{
  const ctx={console};
  vm.createContext(ctx);
  vm.runInContext(['var film=null;',F('filmMark'),
    ';globalThis.M={mark:filmMark,set:f=>{film=f}};'].join('\n'),ctx,{filename:'film.js'});
  return ctx.M;
})();
const BOX_TOP=100, BORDER=1;
function scroller(offsets){
  const box={scrollTop:0,clientTop:BORDER,getBoundingClientRect:()=>({top:BOX_TOP})};
  const rows=offsets.map(d=>{
    const el={on:false,classList:{add(){el.on=true;},remove(){el.on=false;}},
      getBoundingClientRect:()=>({top:BOX_TOP+BORDER+d-box.scrollTop})};
    return el;});
  return {box:box,rows:rows};
}

test('the moment being played is pulled to the TOP of the list', () => {
  const {box,rows}=scroller([0,24,48,72,96]);
  const f={cursor:3,rowFor:rows,list:box,curRow:null};
  marker.set(f); marker.mark();
  eq(box.scrollTop,48,'the third row now sits against the top edge');
  ok(rows[2].on,'and it is the lit one');
});

test('it follows on every change, from wherever the list happens to be', () => {
  const {box,rows}=scroller([0,24,48,72,96]);
  const f={cursor:5,rowFor:rows,list:box,curRow:null};
  marker.set(f); marker.mark();
  eq(box.scrollTop,96,'straight to the last row');
  f.cursor=2; marker.mark();
  eq(box.scrollTop,24,'and back up when the video is seeked back');
  ok(rows[1].on,'the earlier row is lit');
  ok(!rows[4].on,'and the later one is not');
});

test('the same row twice does not re-scroll a list somebody is reading', () => {
  const {box,rows}=scroller([0,24,48]);
  const f={cursor:2,rowFor:rows,list:box,curRow:null};
  marker.set(f); marker.mark();
  eq(box.scrollTop,24);
  box.scrollTop=999;                     // as if it had been scrolled by hand
  marker.mark();
  eq(box.scrollTop,999,'nothing moves until the lit row actually changes');
});

test('nothing lit before the first event, and nothing scrolls', () => {
  const {box,rows}=scroller([0,24]);
  marker.set({cursor:0,rowFor:rows,list:box,curRow:null});
  marker.mark();
  eq(box.scrollTop,0);
  ok(!rows[0].on,'the first event has not come round yet');
});
