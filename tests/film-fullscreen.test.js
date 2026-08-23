/* Film, full screen — what a club puts on the projector in a team meeting.

   The whole feature turns on one choice: the element handed to the Fullscreen
   API is #statsHolder, NOT .film. An element leaving the document is how the
   browser is told full screen is over, and renderFilm() rebuilds .film from
   scratch on every change of half — and, on the Stats page, on every event
   arriving over the cloud. Point the API at .film and a meeting falls out of
   full screen every time somebody taps a number in the other tab; and it cannot
   simply be re-entered, because requestFullscreen() wants a user gesture that a
   WebSocket callback does not have.

   The second choice is that the CLASS does the layout and the API only takes
   the browser's chrome away, so a browser that refuses the API still gets the
   big view. That makes the state machine the delicate part: full screen ends by
   five routes and only one of them goes through our code, so the browser's
   fullscreenchange is the truth and everything here reconciles to it.

   And the third: only a host that ASKS gets it. The client channel mounts with
   {fullscreen:true}; the analyst's Stats page mounts as it always has and must
   come out of this change with no button, no key, and no way in.

   The DOM here is a stub — this repo has no build step and no jsdom — so what
   cannot be run is asserted against the shape of the real source instead. */
const {grabFunction,grabConst,STATS,readSrc}=require('./harness');
const {test,eq,ok,notOk}=require('./tiny-test');
const vm=require('vm');

const F=n=>grabFunction(n,STATS,'Stats/stats-view.js');
const G=n=>grabConst(n,STATS,'Stats/stats-view.js');

/* ================= a stub DOM, only as wide as the selectors used ================= */
function node(tag,cls){
  const n={tag:tag,cls:(cls||'').split(' ').filter(Boolean),dataset:{},attrs:{},
           children:[],parentNode:null,hidden:false,innerHTML:'',title:'',
           nodeType:1,style:{},blurred:0,
           setAttribute(k,v){n.attrs[k]=v;},getAttribute(k){return n.attrs[k];},
           blur(){n.blurred++;}};
  n.classList={
    contains:c=>n.cls.indexOf(c)>=0,
    add(c){if(n.cls.indexOf(c)<0)n.cls.push(c);},
    remove(c){const i=n.cls.indexOf(c);if(i>=0)n.cls.splice(i,1);},
    toggle(c,force){force?n.classList.add(c):n.classList.remove(c);}
  };
  n.add=function(kid){kid.parentNode=n;n.children.push(kid);return kid;};
  n.querySelector=sel=>n.children.filter(k=>k.cls.indexOf(sel.slice(1))>=0)[0]||null;
  n.closest=sel=>{let p=n;while(p){if(p.cls.indexOf(sel.slice(1))>=0)return p;p=p.parentNode;}return null;};
  return n;
}
// a .fm-slicer complete enough for filmSlicerOpen to walk over it
function slicer(){
  const s=node('div','fm-slicer open');
  s.add(node('button','fm-sl-btn'));
  const p=s.add(node('div','fm-sl-panel')); p.hidden=false;
  return s;
}

/* `opts.fullscreen` is what the host asked for; `api` is what the browser is
   willing to do about it. Everything else is a fresh page. */
function sandbox(o){
  o=o||{};
  const holder=node('div'), btn=node('button','fm-full');
  const els={statsHolder:holder,fmFull:o.button===false?null:btn};
  const slicers=o.slicers?[slicer(),slicer()]:[];
  const calls={req:0,exit:0};
  if(o.api!=='none'){
    holder.requestFullscreen=()=>{
      calls.req++;
      calls.classAtRequest=holder.classList.contains('film-full');
      return o.api==='reject'?Promise.reject(new Error('refused')):Promise.resolve();
    };
  }
  const doc={
    fullscreenElement:null,
    querySelectorAll:sel=>sel==='.fm-slicer'?slicers:[],
    getElementById:id=>els[id]||null,
    exitFullscreen(){calls.exit++;doc.fullscreenElement=null;return Promise.resolve();}
  };
  const ctx={console,document:doc,Promise:Promise};
  vm.createContext(ctx);
  vm.runInContext([
    'const $=id=>document.getElementById(id);',
    'var opts='+JSON.stringify(o.opts||{fullscreen:true})+';',
    'var film='+(o.film===false?'null':'{}')+';',
    'var seeks=[],toggles=0;',
    'function filmSeekBy(d){seeks.push(d);}',
    'function filmToggle(){toggles++;}',
    'function filmSlicerFit(){}',
    G('FILM_STEP'),
    // the companion hook: null here, which is what every host but the channel sees
    G('filmTools'),
    G('filmFull'),G('filmFullNative'),
    G('filmFullOK'),G('filmFullBox'),G('FM_FULL_D'),G('filmFullIcon'),
    F('filmFullOn'),F('filmFullOff'),G('filmFullToggle'),
    F('filmFullSet'),F('filmFullChange'),
    F('filmSlicerOpen'),F('filmKeys'),
    ';globalThis.P={filmFullOn,filmFullOff,filmFullToggle,filmFullSet,filmFullChange,',
    '  filmFullIcon,filmKeys,FM_FULL_D,',
    '  full:()=>filmFull,native:()=>filmFullNative,',
    '  seeks:()=>seeks,toggles:()=>toggles};'
  ].join('\n'),ctx,{filename:'film-fullscreen.js'});
  return Object.assign(ctx.P,{holder,btn,doc,calls,slicers});
}

const big=P=>P.holder.classList.contains('film-full');
// a keydown as the browser delivers one; `t` is the focus target
function key(P,k,t){
  let stopped=0;
  P.filmKeys({key:k,target:t||node('div'),preventDefault(){stopped++;}});
  return stopped;
}

/* ================= only a host that asked ================= */
/* Q1 was answered B: the channel gets this, the analyst's Stats page is left
   exactly as it was. The gate has to hold at all three doors — the markup, the
   entry point and the keyboard — or "off" is only off in one of them. */
test('the Stats page gets no button, because it never asked for one', () => {
  const html=F('filmHTML');
  ok(/filmFullOK\(\)\?/.test(html),'the markup is behind the gate');
  const P=sandbox({opts:{chrome:false,local:true,cloud:true}});
  P.filmFullOn();
  notOk(big(P),'and the way in is shut even if something calls it');
  eq(P.calls.req,0,'the API is never even asked');
});

test('nor does it claim F', () => {
  const P=sandbox({opts:{local:true}});
  eq(key(P,'f'),0,'not swallowed — it is not ours to swallow');
  notOk(big(P));
});

test('the channel, which did ask, gets all three', () => {
  const P=sandbox();
  key(P,'f');
  ok(big(P));
});

/* ================= the layout first, the API second ================= */
/* The class IS the fallback. If the API is missing or refused there is still a
   view filling the window, and no branch ends in "pressed it, nothing happened". */
test('the class goes on before the browser is asked', () => {
  const P=sandbox();
  P.filmFullOn();
  ok(P.calls.classAtRequest,'so a refusal lands on a layout that is already up');
  eq(P.calls.req,1);
});

test('a browser with no Fullscreen API is still maximised', () => {
  const P=sandbox({api:'none'});
  P.filmFullOn();
  ok(big(P),'filling the window instead of the screen, which is the whole fallback');
});

test('and a browser that refuses stays maximised rather than throwing', () => {
  const P=sandbox({api:'reject'});
  P.filmFullOn();                       // the rejection lands on a later tick
  ok(big(P));
  return Promise.resolve().then(()=>ok(big(P),'still up once the promise has settled'));
});

test('going in twice is not going in twice', () => {
  const P=sandbox();
  P.filmFullOn(); P.filmFullOn();
  eq(P.calls.req,1);
});

/* ================= coming back out ================= */
test('leaving takes the class off and hands the screen back', () => {
  const P=sandbox();
  P.filmFullOn();
  P.doc.fullscreenElement=P.holder;     // as the browser would report it
  P.filmFullOff();
  notOk(big(P));
  eq(P.calls.exit,1);
});

test('but only if the screen was ours to hand back', () => {
  const P=sandbox();
  P.filmFullOn();
  P.doc.fullscreenElement=node('video');  // something else has it
  P.filmFullOff();
  notOk(big(P),'our layout still comes down');
  eq(P.calls.exit,0,'and we do not cancel a full screen we did not start');
});

test('leaving when we were never in is a no-op', () => {
  const P=sandbox();
  P.filmFullOff();
  eq(P.calls.exit,0);
});

/* Escape, F11, the window manager, the element being taken out of the document:
   four ways out that never touch our code. A state we kept on our own would go
   on believing otherwise and leave a position:fixed sheet over a page that is
   not full screen — this feature's classic bug. */
test('the browser taking the screen back is noticed', () => {
  const P=sandbox();
  P.filmFullOn();
  P.doc.fullscreenElement=P.holder; P.filmFullChange();
  ok(P.native(),'the browser is holding it');
  P.doc.fullscreenElement=null; P.filmFullChange();      // Escape
  notOk(big(P),'the class comes off without us being asked');
  notOk(P.native());
});

test('and a fallback that was never native is not torn down by that same event', () => {
  const P=sandbox({api:'none'});
  P.filmFullOn();
  P.filmFullChange();                   // fires for someone else on the page
  ok(big(P),'it was never the browser holding this one');
});

/* ================= the button says which way it goes ================= */
test('the button turns around with the state', () => {
  const P=sandbox();
  P.filmFullSet(true);
  eq(P.btn.attrs['aria-pressed'],'true');
  eq(P.btn.title,'Exit full screen (Esc)');
  eq(P.btn.attrs['aria-label'],P.btn.title,'the same words to a screen reader');
  ok(P.btn.innerHTML.indexOf(P.FM_FULL_D.out)>=0,'corners pointing in');
  P.filmFullSet(false);
  eq(P.btn.attrs['aria-pressed'],'false');
  eq(P.btn.title,'Full screen (F)');
  ok(P.btn.innerHTML.indexOf(P.FM_FULL_D.in)>=0,'and back out');
});

test('a host with no button in the markup is not a crash', () => {
  const P=sandbox({button:false});
  P.filmFullSet(true);
  ok(big(P),'the layout is the part that matters');
});

/* A panel is cut to the room under it AS IT OPENS (filmSlicerFit). Going in or
   out of full screen changes that room under an open one. */
test('changing the screen shuts any slicer that was open over it', () => {
  const P=sandbox({slicers:true});
  P.filmFullSet(true);
  P.slicers.forEach(s=>{
    notOk(s.classList.contains('open'),'closed');
    ok(s.querySelector('.fm-sl-panel').hidden,'and hidden with it');
  });
});

/* ================= the keyboard ================= */
test('F toggles, both cases', () => {
  const P=sandbox();
  eq(key(P,'f'),1,'and the default is prevented once it is claimed');
  ok(big(P));
  key(P,'F');
  notOk(big(P));
});

test('Space and the arrows are untouched', () => {
  const P=sandbox();
  key(P,' '); key(P,'ArrowRight'); key(P,'ArrowLeft');
  eq(P.toggles(),1);
  eq(P.seeks().join(','),'2,-2');
});

/* Escape under NATIVE full screen is the browser's and cannot be cancelled — in
   some it is not even delivered here. The fallback has nobody doing it for us. */
test('Escape is ours on the fallback, and the browser on the real thing', () => {
  const P=sandbox({api:'none'});
  P.filmFullOn();
  eq(key(P,'Escape'),1,'claimed');
  notOk(big(P),'and it got us out');

  const Q=sandbox();
  Q.filmFullOn();
  Q.doc.fullscreenElement=Q.holder; Q.filmFullChange();
  eq(key(Q,'Escape'),0,'not claimed — two exits racing each other is worse than one');
});

test('Escape with nothing to close does nothing, as before', () => {
  const P=sandbox();
  eq(key(P,'Escape'),0);
});

test('a slicer still owns the keyboard while the focus is in it', () => {
  const P=sandbox({slicers:true});
  P.filmFullOn();
  const sl=P.slicers[0];
  const inside=node('input'); sl.add(inside);
  sl.classList.add('open');                  // filmFullOn() shuts them; this one is up
  eq(key(P,'f',inside),0,'F does not toggle from inside an open panel');
  ok(big(P));
  eq(key(P,'Escape',inside),1,'and Escape there still just shuts the panel');
  ok(big(P),'it did not also take the screen down');
});

/* The other half of that rule, and the bug it was hiding.

   A mouse click on a <button> IS focus, and nothing blurs a slicer button the
   way #fmFull and #fmNext blur themselves. So with "owns the keyboard" resting
   on the focus alone, one press of "All players" left the whole Film keyboard
   dead — measured on the live site: [ never reached the toolkit and no clip
   could be marked. Shut, the slicer keeps only the two keys that work its own
   button; everything else goes back to Film. */
test('a slicer that is shut keeps only the keys that open it', () => {
  const P=sandbox({slicers:true});
  P.filmFullOn();
  const sl=P.slicers[0], btn=sl.querySelector('.fm-sl-btn');
  notOk(sl.classList.contains('open'),'the panel is down');
  eq(key(P,' ',btn),0,'Space still presses the button rather than the video');
  eq(key(P,'Enter',btn),0,'and so does Enter');
  eq(key(P,'f',btn),1,'but F is Film again — this is the key that used to die');
  notOk(big(P),'and it really did toggle');
});

test('and a text field anywhere else keeps its f', () => {
  const P=sandbox();
  eq(key(P,'f',node('input')&&Object.assign(node('input'),{tagName:'INPUT'})),0);
  notOk(big(P));
});

/* ================= wired up, and let go of ================= */
const filmStart=F('filmStart'), filmStop=F('filmStop'), filmHTML=F('filmHTML');

test('the element handed to the API is the one that survives a redraw', () => {
  const box=G('filmFullBox');
  ok(/statsHolder/.test(box),'#statsHolder — written into by renderFilm, never replaced');
  notOk(/'film'|\.film\b/.test(box),
     'not .film, which renderFilm rebuilds — and a removed element ends full screen');
});

test('the two listeners go on by name and come off by the same name', () => {
  ['fullscreenchange','webkitfullscreenchange'].forEach(ev=>{
    ok(filmStart.indexOf("document.addEventListener('"+ev+"',filmFullChange)")>=0,ev+' added');
    ok(filmStop.indexOf("document.removeEventListener('"+ev+"',filmFullChange)")>=0,ev+' removed');
  });
  notOk(/addEventListener\('(?:webkit)?fullscreenchange',\s*(?:\(|function)/.test(filmStart),
        'no inline handler: it could never be removed again');
});

/* filmHTML always draws the "go in" icon. A redraw UNDER full screen — a change
   of half, a live event on the Stats page — therefore hands us a brand-new
   button saying the wrong thing. */
test('a redraw under full screen leaves no button telling the wrong story', () => {
  ok(/filmFullSet\(filmFull\)/.test(filmStart),'filmStart re-states it on every render');
});

test('the click is bound where the others are, and hands focus back', () => {
  ok(/\$\('fmFull'\)\.onclick=\(\)=>\{filmFullToggle\(\);\$\('fmFull'\)\.blur\(\);\}/.test(filmStart),
     'blur, so the next Space is play/pause and not this button again');
  ok(/if\(\$\('fmFull'\)\)/.test(filmStart),'and only when the host asked for one');
});

/* Full screen is Film's. Any other view drawn into that box, and the "no match"
   notice above all — which sets display:none on .stats-wrap and would leave a
   black screen with nothing on it — has to give the screen back first. */
test('leaving Film gives the screen back', () => {
  const rs=F('renderStats');
  ok(/if\(statView!=='film'\|\|!meta\.matchId\)filmFullOff\(\);/.test(rs),
     'on the way into every other view, and on the way to the empty notice');
  ok(rs.indexOf('filmFullOff()')<rs.indexOf('const open='),
     'before anything is drawn, not after');
  ok(rs.indexOf('filmStop()')<rs.indexOf('filmFullOff()'),
     'and after filmStop, which is where every teardown in this file starts');
});

test('and so does handing the whole view away', () => {
  ok(/filmStop\(\);\n\s*filmFullOff\(\);/.test(F('destroy')),
     'destroy() says it out loud rather than leaning on the browser noticing');
});

/* ================= the markup ================= */
test('the button sits at the end of the transport bar', () => {
  const bar=filmHTML.slice(filmHTML.indexOf('class="film-bar"'),
                           filmHTML.indexOf('class="film-side"'));
  ok(bar.indexOf('id="fmFull"')>=0,'in the bar');
  ok(bar.indexOf('id="fmTc"')<bar.indexOf('id="fmFull"'),'after the clock');
  ok(bar.indexOf('type="button"')>=0&&bar.indexOf('aria-pressed="false"')>=0);
});

/* That row has three measured numbers in it — the slicer flex-basis, the panel
   height and the last-of-type panel flip. Nothing new goes in there. */
test('the row of slicers is not where it went', () => {
  const filters=filmHTML.slice(filmHTML.indexOf('class="film-filters"'));
  notOk(/fmFull/.test(filters));
  ok(/id="fmNext"/.test(filters),'still the only button beside the three');
});

test('the icon is drawn, not typed', () => {
  const P=sandbox();
  const svg=P.filmFullIcon(false);
  ok(/^<svg /.test(svg)&&/<path d="/.test(svg),'paths');
  ok(/aria-hidden="true"/.test(svg),'and no screen reader reads a shape');
  notOk(/⛶|&#9974;|&#x26F6;/.test(filmHTML+svg),
        'U+26F6 is missing from plenty of system fonts, and this control has no words beside it');
});

/* ================= the CSS ================= */
const CSS=readSrc('Stats/stats-view.css');
function selectors(css){
  const out=[];
  css.replace(/\/\*[\s\S]*?\*\//g,'').replace(/@media[^{]*\{/g,'').split('}').forEach(b=>{
    const s=b.split('{')[0];
    if(!s||/^\s*@/.test(s))return;
    s.split(',').forEach(x=>{x=x.trim(); if(x)out.push(x);});
  });
  return out;
}
// from the opening /* of the block, so selectors() can strip its comment
const TAIL=CSS.slice(CSS.lastIndexOf('/*',CSS.indexOf('Film, full screen')));

test('the new block redefines nothing that exists outside full screen', () => {
  ok(TAIL.length>0,'the block is there to check');
  selectors(TAIL).forEach(s=>
    ok(/\.film-full|\.fm-full/.test(s),
       s+' is in the full-screen block but is not scoped to it — it would restyle Film as it is normally read'));
});

test('and the rules it overrides are still saying what they said', () => {
  [ '.film-grid{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:14px;align-items:start}',
    '.film-stage{position:relative;aspect-ratio:16/9;',
    '.film-list{max-height:340px;',
    '.fm-row .fm-no{min-width:18px;height:18px;font-size:11px}'
  ].forEach(line=>ok(CSS.indexOf(line)>=0,'untouched: '+line));
});

/* filmSlicerFit() walks up for the nearest ancestor that CLIPS and measures the
   panel against its bottom edge. Out here that is .stats-wrap; in full screen
   .stats-wrap is still laid out at its old place in a page nobody can see, and
   measuring against it would cut a panel to FILM_SL_MIN in the middle of a
   1080-tall screen. .film-full clipping is what stops that walk one step early,
   on a box whose rect IS the viewport — so filmSlicerFit needs no change at
   all, and this is the line that keeps it true. */
test('the full-screen box clips, which is what leaves filmSlicerFit alone', () => {
  const base=/\.film-full\{([^}]*)\}/.exec(TAIL);
  ok(base,'the box has a rule');
  ok(/overflow:hidden/.test(base[1]),'and it clips');
  const narrow=/@media \(max-width:900px\)\{\s*\.film-full\{([^}]*)\}/.exec(TAIL);
  ok(narrow&&/overflow:auto/.test(narrow[1]),
     'auto at the narrow width — still not visible, so the walk still stops here');
  notOk(/fullscreen|film-full/.test(F('filmSlicerFit')),
     'and the function itself has not heard of full screen');
});

test('the fallback can cover the page it is drawn over', () => {
  const base=/\.film-full\{([^}]*)\}/.exec(TAIL)[1];
  ['position:fixed','inset:0','z-index:','background:','box-sizing:border-box']
    .forEach(d=>ok(base.indexOf(d)>=0,'.film-full needs '+d));
});

/* The block outranks the @media above it on specificity alone, so a tablet held
   upright would be forced into two columns unless the block says otherwise. */
test('a narrow screen is still one column in full screen', () => {
  const narrow=TAIL.slice(TAIL.indexOf('@media (max-width:900px)'));
  ok(/\.film-full \.film-grid\{grid-template-columns:minmax\(0,1fr\)\}/.test(narrow));
  ok(/\.film-full \.film-stage\{aspect-ratio:16\/9/.test(narrow),
     'and the stage goes back to its ratio, there being no height to divide up');
});

/* .fm-row .fm-no and .film-full .fm-no are both (0,2,0). On a tie the later rule
   wins, and the later one is the full-screen sheet — so without these the shirt
   numbers in the list would jump to caption size. */
test('the list keeps its own smaller numbers', () => {
  ok(/\.film-full \.fm-row \.fm-no\{/.test(TAIL),'restated at (0,3,0) to win the tie');
  ok(/\.film-full \.fm-row \.fm-ev\{/.test(TAIL));
});

test('the stage stops being sized by its ratio, since here the height is known', () => {
  ok(/\.film-full \.film-stage\{aspect-ratio:auto;flex:1;min-height:0\}/.test(TAIL));
  ok(/\.film-full \.film-list\{flex:1;min-height:0;max-height:none\}/.test(TAIL),
     'and the list takes the rest of the column instead of stopping at 340px');
});

/* All six of the things a meeting needs are still on the screen. */
test('nothing is dropped on the way to the projector', () => {
  [['the frame','.film-stage'],['the strip under it','.film-cap'],
   ['the pitch','.film-pitch'],['the slicers','.fm-sl-btn'],
   ['the transport bar','.film-bar'],['the list','.fm-row']]
    .forEach(([what,sel])=>ok(TAIL.indexOf('.film-full '+sel)>=0,
      what+' ('+sel+') has no full-screen sizing — it would be read at 12px from the back of a room'));
});

/* The pitch needed no JavaScript: filmDot sizes itself in the SVG's own user
   units, so a wider column is a bigger pitch and bigger dots on it, in step. */
test('the dots scale with the pitch on their own', () => {
  ok(/const R=Math\.round\(d\.h\*0\.028\)/.test(F('filmDraw')),
     'a fraction of the pitch, not a pixel count — so full screen costs it nothing');
  notOk(/film-full|fullscreen/.test(F('filmDraw')+F('filmDot')+F('filmBall')),
        'and none of the three drawing functions has heard of full screen');
});
