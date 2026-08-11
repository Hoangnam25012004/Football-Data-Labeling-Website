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

/* dur matches WIN below: the first half runs 100..1000 on the file's own clock,
   the second from 2000. eventHalf() reads it, and filmCues() now reads
   eventHalf() rather than the playback bounds. */
const DUR={enabled:true,halfLen:45,h1Start:100,h1End:1000,h2Start:2000,h2End:3000};
function sandbox(rows,filter,dur){
  const ctx={console};
  vm.createContext(ctx);
  vm.runInContext([
    'var rows='+JSON.stringify(rows)+';',
    'var dur='+JSON.stringify(dur||DUR)+';',
    'var filmFilter='+JSON.stringify(filter||{team:'',player:'',event:''})+';',
    'var film=null, draws=0;',
    'function filmDraw(){draws++;}',
    G('FILM_LEAD'),G('FILM_HOLD'),
    F('eventHalf'),F('filmCues'),F('filmMatches'),F('filmAdvance'),F('filmRewind'),
    ';globalThis.P={filmCues,filmMatches,filmAdvance,filmRewind,eventHalf,FILM_LEAD,FILM_HOLD,',
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

/* ================= what belongs to the half ================= */
/* Which half an event is in is eventHalf()'s answer — the one every other tab
   gives — and NOT the playback bounds'. Reading it off the bounds lost the
   opening pass of a match: the dot goes down as the ball is struck, which can
   land a fraction before the h1Start set afterwards, and matchTime() clamps
   anything at or before the kick-off to 00:00.00. The tagging table, Stats and
   the exports all showed it at 00:00 in the first half; only Film left it out. */
test('the half owns its events, in t order', () => {
  const P=sandbox([ev(500),ev(150),ev(2500),ev(1000),ev(100)]);
  eq(P.filmCues(WIN).map(x=>x.t).join(','),'100,150,500,1000','sorted');
  notOk(P.filmCues(WIN).some(x=>x.t===2500),'the second half is not this half');
  eq(P.filmCues({half:2,start:2000,end:3000}).map(x=>x.t).join(','),'2500',
     'and it is the second half that has it');
});

test('a kick-off tagged a fraction early is still in the first half', () => {
  // the reported case to the hundredth: 517.09 against an h1Start of 517.25
  const real={enabled:true,halfLen:45,h1Start:517.25,h1End:3341.96,h2Start:4249.34,h2End:7319.97};
  const P=sandbox([ev(517.09),ev(520.84),ev(523.06)],null,real);
  const c=P.filmCues({half:1,start:517.25,end:3341.96});
  eq(c.length,3,'all three, including the one before the boundary');
  eq(c[0].t,517.09,'and it leads the half, as its 00:00.00 timeline says it should');
});

test('an event tagged in the interval belongs where eventHalf puts it', () => {
  // 1400 is past h1End and before h2Start; eventHalf calls it first-half, so the
  // list says first-half too rather than losing it between the two
  const P=sandbox([ev(150),ev(1400),ev(2500)]);
  eq(P.filmCues(WIN).map(x=>x.t).join(','),'150,1400');
});

test('Full Match takes every event there is', () => {
  const P=sandbox([ev(90),ev(500),ev(1400),ev(2500)]);
  eq(P.filmCues({half:0,start:0,end:Infinity}).length,4,'no half named, nothing filtered');
});

test('an event with no time at all is still left out', () => {
  const P=sandbox([Object.assign(ev(500),{t:null}),ev(600)]);
  eq(P.filmCues(WIN).map(x=>x.t).join(','),'600');
});

/* ================= playing forwards ================= */
/* The hold is a twentieth of a second, so a one-player event owns a tenth of a
   second either side of its dot and no more. Two of them a second apart are
   never up together; the only thing that spans is a pass, whose window is the
   flight of the ball. */
test('the active set is right as the clock runs on', () => {
  const P=sandbox([ev(200),ev(201),ev(400)]);
  const L=P.FILM_LEAD, H=P.FILM_HOLD;
  const f=player(P,P.filmCues(WIN));
  P.filmAdvance(150);        eq(f.active.length,0,'nothing yet');
  P.filmAdvance(200-L);      eq(f.active.length,1,'the first is due, a moment before its own time');
  P.filmAdvance(200+H+0.01); eq(f.active.length,0,'and gone a moment after it');
  P.filmAdvance(201-L);      eq(f.active.length,1,'the second, on its own');
  P.filmAdvance(201+H+0.01); eq(f.active.length,0);
  P.filmAdvance(400-L);      eq(f.active[0].t,400,'and the third when its turn comes');
});

test('a pass is up for as long as the ball is in the air', () => {
  const P=sandbox([ev(200,{rt:203,playerTo:'3',rXY:{x:70,y:40}})]);
  const L=P.FILM_LEAD, H=P.FILM_HOLD;
  const f=player(P,P.filmCues(WIN));
  P.filmAdvance(200-L);      eq(f.active.length,1,'struck');
  P.filmAdvance(201.5);      eq(f.active.length,1,'still travelling');
  P.filmAdvance(203);        eq(f.active.length,1,'arriving');
  P.filmAdvance(203+H+0.01); eq(f.active.length,0,'and away a moment after it lands');
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
  P.filmAdvance(200);        eq(P.draws(),1,'…and holding it is free');
  P.filmAdvance(200+H-0.01); eq(P.draws(),1);
  // out is exclusive: it is already gone AT out, not a moment after
  P.filmAdvance(200+H);      eq(P.draws(),2,'it leaves');
  P.filmAdvance(300);        eq(P.draws(),2,'and an empty pitch stays empty');
  void f;
});

/* ================= seeking backwards ================= */
test('a rewind rebuilds the same set a play-through would have reached', () => {
  const rows=[ev(200),ev(201),ev(400),ev(402,{rt:404})];
  const P=sandbox(rows);
  const cues=P.filmCues(WIN);

  const L=P.FILM_LEAD;
  const a=player(P,cues);
  [150,200,201.5,203,300,401,403,500].forEach(t=>P.filmAdvance(t));
  const b=player(P,P.filmCues(WIN));

  P.filmRewind(201);
  eq(b.cursor,2,'the cursor sits after everything already due at 201');
  eq(b.active.map(c=>c.t).join(','),'201','and only the one still inside its window is up');

  P.filmRewind(200-L);
  eq(b.active.map(c=>c.t).join(','),'200','back to the moment the first one lands');
  eq(b.cursor,1);

  P.filmRewind(150);
  eq(b.active.length,0,'before anything was tagged');
  eq(b.cursor,0);
  void a;
});

test('a rewind lands mid-pass with the pass still up', () => {
  const P=sandbox([ev(402,{rt:404,playerTo:'3',rXY:{x:70,y:40}})]);
  const H=P.FILM_HOLD;
  const f=player(P,P.filmCues(WIN));
  P.filmRewind(403);
  eq(f.active.length,1,'the ball is in the air');
  // the hold runs from the RECEIVER's dot at 404, not from the passer's at 402
  P.filmRewind(404+H-0.01);
  eq(f.active.length,1,'still up, a hair before it runs out');
  P.filmRewind(404+H+0.01);
  eq(f.active.length,0,'and gone once it does');
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
test('an event lands a twentieth of a second either side of its dots', () => {
  // 2 #pass success 3 tagged at 1:03.05 is on screen, and lit in the list, at
  // 1:03.00 — both read off the same cursor, so they can never disagree — and
  // it is gone a twentieth of a second after the last dot it has
  const P=sandbox([]);
  eq(P.FILM_LEAD,0.05);
  eq(P.FILM_HOLD,0.05);
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

/* ================= the strip under the frame, split by side ================= */
/* A moment regularly holds both teams, and side by side the line had to be read
   before it was clear which half of it was whose. Home is written from the left
   edge, away from the right, so the edge answers that first. Nothing here
   consults a direction of attack: the pitch beside it is untouched. */
const caption=(()=>{
  const ctx={console};
  vm.createContext(ctx);
  vm.runInContext([
    "function esc(s){return String(s==null?'':s)}",
    'var film=null;',
    F('filmOrdered'),F('filmChainHTML'),F('filmCaption'),
    ';globalThis.CAP=active=>{const cap={className:"",innerHTML:""};',
    '  film={active:active,cap:cap}; filmCaption(); return cap;};'
  ].join('\n'),ctx,{filename:'film.js'});
  return ctx.CAP;
})();
const sideCue=(team,from,event,to)=>({t:1,r:{team:team,grp:null,ord:0,
  event:event,playerFrom:from,playerTo:to||''}});
const halves=html=>{
  const parts=html.split('<span class="fm-side away">');
  return {home:parts[0]||'', away:parts[1]||''};
};

test('both teams in one moment land on opposite edges', () => {
  const cap=caption([sideCue('away','14','pass success','13'),sideCue('home','6','tackle success')]);
  const {home,away}=halves(cap.innerHTML);
  ok(/fm-side home/.test(home),'the home half is written first, so it sits left');
  ok(/#tackle success/.test(home),'and holds the tackle');
  notOk(/#pass success/.test(home),'and nothing of the other side');
  ok(/#pass success/.test(away),'the away half holds the pass');
  ok(/>14</.test(away)&&/>13</.test(away),'both of its numbers');
  notOk(/>6</.test(away),'and none of theirs');
});

test('the numbers keep their own colours inside each half', () => {
  const cap=caption([sideCue('away','14','pass success','13'),sideCue('home','6','tackle success')]);
  ok(/class="fm-no home">6</.test(cap.innerHTML),'6 is white');
  ok(/class="fm-no away">14</.test(cap.innerHTML),'14 is yellow');
});

test('one side alone still writes both halves, so it keeps its own edge', () => {
  const cap=caption([sideCue('away','4','clearance')]);
  ok(/<span class="fm-side home"><\/span>/.test(cap.innerHTML),
     'the empty home half is still there — space-between needs two children');
  ok(/fm-side away">[\s\S]*4/.test(cap.innerHTML),'and the away half carries the event');
});

test('a run of one team reads as one chain on its own side', () => {
  const cap=caption([sideCue('home','13','recovery'),sideCue('home','13','pass success','14')]);
  const {home,away}=halves(cap.innerHTML);
  eq((home.match(/fm-no/g)||[]).length,2,'13 once, then the receiver 14');
  eq((home.match(/fm-ev/g)||[]).length,2,'both of his events');
  eq((away.match(/fm-ev/g)||[]).length,0,'the away half is empty');
});

test('nothing active leaves the strip blank, not half-drawn', () => {
  const cap=caption([]);
  eq(cap.innerHTML,'');
  eq(cap.className,'film-cap','and unlit');
});
