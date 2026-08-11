/* Film — the cursor that decides what is on the pitch at a given moment.

   An event is not a frame. Tagged at 61:02.40, it would flash past unreadably at
   playback speed, so each one owns a stretch: FILM_LEAD before its own dot and
   FILM_HOLD after the last dot it has (the receiver's, on a pass). What this
   file guards is that the stretch is computed from the right two times, that the
   set on screen is right at any moment, and that it is right after a tua lùi as
   well as a play-through — the forward path walks a cursor, the backward one
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
  eq(c.in,199.5);
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
  const f=player(P,P.filmCues(WIN));
  P.filmAdvance(150); eq(f.active.length,0,'nothing yet');
  P.filmAdvance(199.6); eq(f.active.length,1,'the first is due');
  P.filmAdvance(200.6); eq(f.active.length,2,'and the second');
  P.filmAdvance(203.0); eq(f.active.length,1,'the first has had its hold');
  P.filmAdvance(204.0); eq(f.active.length,0,'and so has the second');
  P.filmAdvance(399.6); eq(f.active[0].t,400,'the next one arrives on its own');
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
  const f=player(P,P.filmCues(WIN));
  P.resetDraws();
  P.filmAdvance(150); eq(P.draws(),0,'nothing on screen, nothing to draw');
  P.filmAdvance(199.6); eq(P.draws(),1,'it arrives');
  P.filmAdvance(200.1); eq(P.draws(),1,'…and holding it is free');
  P.filmAdvance(201.0); eq(P.draws(),1);
  P.filmAdvance(203.0); eq(P.draws(),2,'it leaves');
});

/* ================= seeking backwards ================= */
test('a rewind rebuilds the same set a play-through would have reached', () => {
  const rows=[ev(200),ev(201),ev(400),ev(402,{rt:404})];
  const P=sandbox(rows);
  const cues=P.filmCues(WIN);

  const a=player(P,cues);
  [150,199.6,200.6,203,300,401,403,500].forEach(t=>P.filmAdvance(t));
  const b=player(P,P.filmCues(WIN));
  P.filmRewind(200.6);
  eq(b.active.map(c=>c.t).join(','),'200,201','back at 200.6, both are up');
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
