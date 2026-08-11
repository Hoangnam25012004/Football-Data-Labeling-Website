/* Film — what is on screen at a given moment, and how it reads.

   A cue is an ENTRY, not an event. "6 #recovery #pass success 15" is one thing
   that happened and one thing typed, and the tagging table has always shown it
   on one line; Film used to break it into a row per event, which read as two
   unrelated touches by the same player.

   An entry is not a frame either. Each cue owns a stretch: FILM_LEAD before its
   earliest dot, FILM_HOLD after its last. What this file guards is that the
   stretch is computed from the right dots, that the set on screen is right at
   any moment, that it is right after a seek back as well as a play-through —
   the forward path walks a cursor, the backward one rebuilds, and the two must
   agree — and that what is written out reads the way it was typed.

   Redrawing is expensive (the whole dot layer), so it must happen only when the
   set actually changes. The stub counts the calls. */
const {grabFunction,grabConst,STATS}=require('./harness');
const {test,eq,ok,notOk}=require('./tiny-test');
const vm=require('vm');

const G=n=>grabConst(n,STATS,'Stats/stats-view.js');
const F=n=>grabFunction(n,STATS,'Stats/stats-view.js');

/* one row: t, and whatever else the case needs. Solo by default — no grp, so it
   is a chain of itself; pass grp/ord to make several rows one entry. */
const ev=(t,o)=>Object.assign({id:'e'+t,t:t,rt:null,team:'home',event:'pass success',
  playerFrom:'2',playerTo:'',grp:null,ord:0,pXY:{x:50,y:50},rXY:null},o||{});

/* dur matches WIN below: the first half runs 100..1000 on the file's own clock,
   the second from 2000. eventHalf() reads it, and filmCues() reads eventHalf()
   rather than the playback bounds. */
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
    G('FILM_LEAD'),G('FILM_HOLD'),G('FILM_HOLD_MOVE'),
    F('eventHalf'),F('filmCues'),F('filmMatches'),G('filmCueMatches'),
    F('filmAdvance'),F('filmRewind'),
    ';globalThis.P={filmCues,filmMatches,filmCueMatches,filmAdvance,filmRewind,eventHalf,',
    '  FILM_LEAD,FILM_HOLD,FILM_HOLD_MOVE,',
    '  setFilm:f=>{film=f},draws:()=>draws,resetDraws:()=>{draws=0}};'
  ].join('\n'),ctx,{filename:'film.js'});
  return ctx.P;
}

const WIN={half:1,label:'1st Half',start:100,end:1000};
function player(P,cues){
  const f={win:WIN,cues:cues,cursor:0,active:[],last:-1};
  P.setFilm(f); return f;
}
const names=cue=>cue.rows.map(r=>r.event).join(' | ');

/* ================= an entry is one cue ================= */
/* The reported case: typed at 0:12 as "6 #recovery #pass success 15", it came
   back as two rows that read like two unrelated touches. */
const ENTRY_6=[
  ev(112.0,{grp:'g1',ord:0,event:'recovery',playerFrom:'6'}),
  ev(112.0,{grp:'g1',ord:1,event:'pass success',playerFrom:'6',playerTo:'15',
            rt:113.1,rXY:{x:70,y:40}})
];

test('the rows of one entry are one cue', () => {
  const cues=sandbox(ENTRY_6.slice()).filmCues(WIN);
  eq(cues.length,1,'one entry, one cue');
  eq(names(cues[0]),'recovery | pass success','both touches, in the order they were typed');
});

test('the cue starts at its earliest dot and ends after its last', () => {
  const P=sandbox(ENTRY_6.slice());
  const c=P.filmCues(WIN)[0];
  eq(c.t,112.0,'the earliest touch is where it sits on the clock');
  eq(c.in,112.0-P.FILM_LEAD);
  eq(c.out,113.1+P.FILM_HOLD_MOVE,'a move lets go just before its last dot — here the receiver');
});

test('a row with no grp is a chain of itself', () => {
  const cues=sandbox([ev(200),ev(300)]).filmCues(WIN);
  eq(cues.length,2);
  eq(cues[0].rows.length,1); eq(cues[1].rows.length,1);
});

test('a solo cue runs from LEAD before to HOLD after its own dot', () => {
  const P=sandbox([ev(200)]);
  const c=P.filmCues(WIN)[0];
  eq(c.in,200-P.FILM_LEAD);
  eq(c.out,200+P.FILM_HOLD);
});

test('a receiver dot tagged before the passer cannot shorten the cue', () => {
  // dots can be placed in any order; out must never come out earlier than t
  const P=sandbox([ev(200,{rt:197})]);
  eq(P.filmCues(WIN)[0].out,200+P.FILM_HOLD);
});

test('a receiver time that is not a number is treated as absent', () => {
  const P=sandbox([ev(200,{rt:'x'})]);
  eq(P.filmCues(WIN)[0].out,200+P.FILM_HOLD);
});

/* ================= the order it was typed in ================= */
/* Each row of an entry carries the time of ITS OWN dot, and one tagged without
   a dot carries the moment Enter was pressed — so per-row times run backwards
   inside a move. The chain holds its typed order and sits at its earliest touch. */
const ENTRY_17=[
  ev(135.9,{grp:'g2',ord:2,event:'key pass',playerFrom:'17'}),   // no dot: time of the Enter
  ev(135.1,{grp:'g2',ord:0,event:'recovery',playerFrom:'17'}),
  ev(135.4,{grp:'g2',ord:1,event:'cross success',playerFrom:'17',playerTo:'14'}),
  ev(137.6,{grp:'g2',ord:4,event:'right foot',playerFrom:'14'}),
  ev(137.2,{grp:'g2',ord:3,event:'shot on target',playerFrom:'14'})
];

test('a chain reads in the order it was typed, not the order the dots landed', () => {
  const c=sandbox(ENTRY_17.slice()).filmCues(WIN)[0];
  eq(names(c),'recovery | cross success | key pass | shot on target | right foot');
  eq(c.t,135.1,'and sits at the earliest touch in it');
  eq(c.out,137.6-0.05,'and lets go just before the last');
});

test('the clock still decides where a chain sits among everything else', () => {
  const P=sandbox([ev(120,{event:'throw-in'}),ev(150,{event:'goal kick'})].concat(ENTRY_17));
  eq(P.filmCues(WIN).map(names).join('  /  '),
     'throw-in  /  recovery | cross success | key pass | shot on target | right foot  /  goal kick');
});

test('a chain is never split by a loose event falling inside its span', () => {
  // 136.5 sits between the chain's first touch and its last, but the block holds
  const P=sandbox(ENTRY_17.concat([ev(136.5,{event:'foul',playerFrom:'8'})]));
  const out=P.filmCues(WIN).map(names);
  eq(out.length,2);
  eq(out[0],'recovery | cross success | key pass | shot on target | right foot');
  eq(out[1],'foul','the loose event sorts after the block it interrupted');
});

test('two entries at the same instant stay whole rather than interleaving', () => {
  const P=sandbox([
    ev(200,{grp:'bb',ord:1,event:'b2'}), ev(200,{grp:'aa',ord:1,event:'a2'}),
    ev(200,{grp:'bb',ord:0,event:'b1'}), ev(200,{grp:'aa',ord:0,event:'a1'})
  ]);
  eq(P.filmCues(WIN).map(names).join('  /  '),'a1 | a2  /  b1 | b2');
});

/* ================= what belongs to the half ================= */
/* Which half an event is in is eventHalf()'s answer — the one every other tab
   gives — and NOT the playback bounds'. Reading it off the bounds lost the
   opening pass of a match: the dot goes down as the ball is struck, which can
   land a fraction before the h1Start set afterwards, and matchTime() clamps
   anything at or before the kick-off to 00:00.00. */
test('the half owns its events, in t order', () => {
  const P=sandbox([ev(500),ev(150),ev(2500),ev(1000),ev(100)]);
  eq(P.filmCues(WIN).map(c=>c.t).join(','),'100,150,500,1000','sorted');
  eq(P.filmCues({half:2,start:2000,end:3000}).map(c=>c.t).join(','),'2500',
     'and the second half has the rest');
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
  const P=sandbox([ev(150),ev(1400),ev(2500)]);
  eq(P.filmCues(WIN).map(c=>c.t).join(','),'150,1400');
});

test('Full Match takes every event there is', () => {
  const P=sandbox([ev(90),ev(500),ev(1400),ev(2500)]);
  eq(P.filmCues({half:0,start:0,end:Infinity}).length,4,'no half named, nothing filtered');
});

test('a row with no time at all is still left out', () => {
  const P=sandbox([Object.assign(ev(500),{t:null}),ev(600)]);
  eq(P.filmCues(WIN).map(c=>c.t).join(','),'600');
});

/* ================= playing forwards ================= */
/* The hold is a twentieth of a second, so a one-touch entry owns a tenth of a
   second around its dot and no more. What spans is a move: a chain is up from
   its first touch to its last. */
test('a moment holds, then goes', () => {
  const P=sandbox([ev(200),ev(300),ev(400)]);
  const L=P.FILM_LEAD, H=P.FILM_HOLD;
  const f=player(P,P.filmCues(WIN));
  P.filmAdvance(150);        eq(f.active.length,0,'nothing yet');
  P.filmAdvance(200-L);      eq(f.active.length,1,'the first is due, a moment before its own time');
  P.filmAdvance(200+H-0.01); eq(f.active.length,1,'and stays up for most of a second');
  P.filmAdvance(200+H);      eq(f.active.length,0,'then goes');
  P.filmAdvance(300-L);      eq(f.active.length,1,'the second, on its own');
  P.filmAdvance(400-L);      eq(f.active[0].t,400,'and the third when its turn comes');
});

test('a move is up for the flight, and clear before the ball lands', () => {
  const P=sandbox(ENTRY_6.slice());
  const L=P.FILM_LEAD, M=P.FILM_HOLD_MOVE;
  const f=player(P,P.filmCues(WIN));
  P.filmAdvance(112-L);        eq(f.active.length,1,'the recovery starts it');
  eq(names(f.active[0]),'recovery | pass success','and the pass is up with it from the first frame');
  P.filmAdvance(112.5);        eq(f.active.length,1,'still up while the ball travels');
  P.filmAdvance(113.1+M-0.01); eq(f.active.length,1,'still up as it closes in');
  P.filmAdvance(113.1+M);      eq(f.active.length,0,'and clear a twentieth of a second before it lands');
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
  player(P,P.filmCues(WIN));
  P.resetDraws();
  P.filmAdvance(150);        eq(P.draws(),0,'nothing on screen, nothing to draw');
  P.filmAdvance(200-L);      eq(P.draws(),1,'it arrives');
  P.filmAdvance(200);        eq(P.draws(),1,'…and holding it is free');
  P.filmAdvance(200+H-0.01); eq(P.draws(),1);
  // out is exclusive: it is already gone AT out, not a moment after
  P.filmAdvance(200+H);      eq(P.draws(),2,'it leaves');
  P.filmAdvance(300);        eq(P.draws(),2,'and an empty pitch stays empty');
});

/* ================= seeking backwards ================= */
test('a rewind rebuilds the same set a play-through would have reached', () => {
  const P=sandbox([ev(200),ev(201),ev(400)]);
  const L=P.FILM_LEAD;
  const a=player(P,P.filmCues(WIN));
  [150,200,201,300,401,500].forEach(t=>P.filmAdvance(t));

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

test('a rewind lands mid-move with the whole move still up', () => {
  const P=sandbox(ENTRY_6.slice());
  const M=P.FILM_HOLD_MOVE;
  const f=player(P,P.filmCues(WIN));
  P.filmRewind(112.6);
  eq(f.active.length,1,'the ball is in the air');
  eq(names(f.active[0]),'recovery | pass success','and the touch that started it is still written');
  P.filmRewind(113.1+M-0.01);
  eq(f.active.length,1,'still up, a hair before it lets go');
  P.filmRewind(113.1+M);
  eq(f.active.length,0,'and clear before the ball lands');
});

/* ================= the filter takes whole entries ================= */
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

test('one touch inside an entry brings the whole move with it', () => {
  // filtering to #15, who only appears as the receiver of the second touch: the
  // recovery that set it up comes too, or the row would read as half a move
  const P=sandbox(ENTRY_6.slice(),{team:'',player:'15',event:''});
  const cues=P.filmCues(WIN);
  ok(P.filmCueMatches(cues[0]),'the entry matches');
  eq(names(cues[0]),'recovery | pass success','and it is still whole');
  notOk(P.filmMatches(cues[0].rows[0]),'even though the recovery on its own does not');
});

test('an entry nobody in it matches is left out', () => {
  const P=sandbox(ENTRY_6.slice(),{team:'',player:'99',event:''});
  notOk(P.filmCueMatches(P.filmCues(WIN)[0]));
});

/* ================= whose number is whose ================= */
/* One moment on screen regularly holds both sides at once: a tackle that answers
   the pass it broke up is two entries, two teams, one strip. The side rides on
   each number, so neither colour nor edge can misattribute a touch. */
const chain=(()=>{
  const ctx={console};
  vm.createContext(ctx);
  vm.runInContext(["function esc(s){return String(s==null?'':s)}",
    F('filmChainHTML'),';globalThis.C=filmChainHTML;'].join('\n'),ctx,{filename:'film.js'});
  return ctx.C;
})();
const row=(team,from,event,to)=>({team:team,playerFrom:from,event:event,playerTo:to||''});

test('a home number is home and an away number is away, in the same line', () => {
  const html=chain([row('away','14','pass success','13'),row('home','6','tackle success')]);
  eq((html.match(/class="fm-no away"/g)||[]).length,2,'14 and 13 are the away side');
  eq((html.match(/class="fm-no home"/g)||[]).length,1,'6 is not');
});

test('the same shirt number on both sides is printed twice, not folded', () => {
  const html=chain([row('home','13','recovery'),row('away','13','clearance')]);
  eq((html.match(/class="fm-no /g)||[]).length,2,'both are named');
  ok(/fm-no home">13</.test(html)&&/fm-no away">13</.test(html),'each in its own colour');
});

test("one entry's run of events prints its player once", () => {
  const html=chain([row('home','6','recovery'),row('home','6','pass success','15')]);
  eq(html.replace(/<[^>]+>/g,''),'6 #recovery #pass success 15','the line from the tagging table');
  eq((html.match(/class="fm-no /g)||[]).length,2,'6 once, then the receiver 15');
});

/* ================= the strip under the frame, split by side ================= */
const caption=(()=>{
  const ctx={console};
  vm.createContext(ctx);
  vm.runInContext([
    "function esc(s){return String(s==null?'':s)}",
    'var film=null;',
    F('filmChainHTML'),F('filmCaption'),
    ';globalThis.CAP=active=>{const cap={className:"",innerHTML:""};',
    '  film={active:active,cap:cap}; filmCaption(); return cap;};'
  ].join('\n'),ctx,{filename:'film.js'});
  return ctx.CAP;
})();
const sideCue=(team,list)=>({t:1,rows:list.map(r=>Object.assign({team:team,grp:'g',ord:0},r))});
const halves=html=>{
  const parts=html.split('<span class="fm-side away">');
  return {home:parts[0]||'', away:parts[1]||''};
};

test('both teams in one moment land on opposite edges', () => {
  const cap=caption([
    sideCue('away',[{playerFrom:'14',event:'pass success',playerTo:'13'}]),
    sideCue('home',[{playerFrom:'6',event:'tackle success',playerTo:''}])
  ]);
  const {home,away}=halves(cap.innerHTML);
  ok(/fm-side home/.test(home),'the home half is written first, so it sits left');
  ok(/#tackle success/.test(home),'and holds the tackle');
  notOk(/#pass success/.test(home),'and nothing of the other side');
  ok(/#pass success/.test(away),'the away half holds the pass');
  notOk(/>6</.test(away),'and none of their numbers');
});

test('a whole entry reads as one chain on its own side', () => {
  const cap=caption([sideCue('home',[
    {playerFrom:'6',event:'recovery',playerTo:''},
    {playerFrom:'6',event:'pass success',playerTo:'15'}])]);
  const {home,away}=halves(cap.innerHTML);
  eq(home.replace(/<[^>]+>/g,'').trim(),'6 #recovery #pass success 15');
  eq((away.match(/fm-ev/g)||[]).length,0,'the away half is empty');
});

test('one side alone still writes both halves, so it keeps its own edge', () => {
  const cap=caption([sideCue('away',[{playerFrom:'4',event:'clearance',playerTo:''}])]);
  ok(/<span class="fm-side home"><\/span>/.test(cap.innerHTML),
     'the empty home half is still there — space-between needs two children');
  ok(/fm-side away">[\s\S]*4/.test(cap.innerHTML),'and the away half carries the event');
});

test('nothing active leaves the strip blank, not half-drawn', () => {
  const cap=caption([]);
  eq(cap.innerHTML,'');
  eq(cap.className,'film-cap','and unlit');
});

/* ================= how far ahead, and how the list follows ================= */
test('the three numbers the window is made of', () => {
  const P=sandbox([]);
  eq(P.FILM_LEAD,0.05,'everything lands a twentieth of a second early');
  eq(P.FILM_HOLD,0.95,'a moment is held for most of a second after it');
  eq(P.FILM_HOLD_MOVE,-0.05,'a move lets go a twentieth of a second before its last dot');
});

/* The line between the two, drawn on the span rather than on the shape of the
   entry. A move tagged with both its dots on one frame has no flight to show
   either, and would be on screen for a negative length of time. */
test('an entry with a span is a move; one without is a moment', () => {
  const P=sandbox([
    ev(200,{grp:'m',ord:0,event:'pass success',playerTo:'3',rt:201.4}),   // a real flight
    ev(300,{grp:'i',ord:0,event:'tackle success'}),                      // one instant
    ev(400,{grp:'i2',ord:0,event:'ground duel success'}),                // …typed together,
    ev(400,{grp:'i2',ord:1,event:'recovery'})                            //    both on one frame
  ]);
  const c=P.filmCues(WIN);
  eq(c[0].out,201.4+P.FILM_HOLD_MOVE,'the pass lets go before the ball arrives');
  eq(c[1].out,300+P.FILM_HOLD,'the tackle is held');
  eq(c[2].out,400+P.FILM_HOLD,'and so is a two-touch entry with no span to show');
  ok(c[2].out>c[2].in,'…which is the point: at -0.05 it would never be drawn at all');
});

test('a pass whose receiver dot was never placed is a moment, not a zero-length move', () => {
  // playerTo names a receiver but no dot was put down, so there is nothing to
  // run to and nothing to be read during
  const P=sandbox([ev(200,{event:'pass fail',playerTo:'9'})]);
  const c=P.filmCues(WIN)[0];
  eq(c.out,200+P.FILM_HOLD);
  ok(c.out>c.in,'it is on screen at all, which is what matters');
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
  const list=offsets.map(d=>{
    const el={on:false,classList:{add(){el.on=true;},remove(){el.on=false;}},
      getBoundingClientRect:()=>({top:BOX_TOP+BORDER+d-box.scrollTop})};
    return el;});
  return {box:box,rows:list};
}

test('the moment being played is pulled to the TOP of the list', () => {
  const {box,rows}=scroller([0,24,48,72,96]);
  marker.set({cursor:3,rowFor:rows,list:box,curRow:null}); marker.mark();
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
  marker.set({cursor:0,rowFor:rows,list:box,curRow:null}); marker.mark();
  eq(box.scrollTop,0);
  ok(!rows[0].on,'the first event has not come round yet');
});
