/* The performance analyst's toolkit over Film — and, above all, the four
   promises it makes about what it does NOT do.

   Three of those promises are the whole reason the feature was allowed to exist
   in this shape, and none of them is the kind of thing you can check by looking
   at a screenshot:

     it never uploads          a rendered clip goes RAM -> the analyst's disk and
                               stops. No R2 PUT, no Storage, no temporary link,
                               so no stored bytes and no bill.
     it never writes video     the only traffic to Cloudflare is the range GET
                               the player was already making.
     it never shows itself     no clip open means no layer in the DOM, so a
                               player opening the channel sees yesterday's Film.
     it is the channel's alone the tagging app's Stats page loads none of it.

   The first three are asserted against the SOURCE, because "there is no upload"
   is a statement about code that exists, not about code that ran. The fourth is
   asserted at both ends — the loader that pulls it in, and the page that does not.

   The rest is the coordinate maths, which is where a telestration tool actually
   goes wrong: a mark stored against the wrong box slides off the grass. */
const {grabFunction,grabConst,STATS,readSrc}=require('./harness');
const {test,eq,ok,notOk}=require('./tiny-test');
const vm=require('vm');

const TOOLS=readSrc('client/assets/film-tools.js');
const TOOLS_CSS=readSrc('client/assets/film-tools.css');
const APP=readSrc('client/assets/app.js');
const PAGE=readSrc('Stats/index.html');
const YML=readSrc('.github/workflows/deploy.yml');

/* ================= a stub DOM, only as wide as the module reaches ================= */
function node(tag){
  const n={tag:tag,attrs:{},style:{},children:[],parentNode:null,className:'',
           textContent:'',innerHTML:'',value:'',type:'',placeholder:'',title:'',
           offsetWidth:260,offsetHeight:400,
           rect:{x:0,y:0,width:0,height:0,left:0,top:0,right:0,bottom:0},
           getBoundingClientRect(){return n.rect;},
           setAttribute(k,v){n.attrs[k]=v;},getAttribute(k){return n.attrs[k];},
           appendChild(k){k.parentNode=n;n.children.push(k);return k;},
           removeChild(k){const i=n.children.indexOf(k);if(i>=0)n.children.splice(i,1);return k;},
           remove(){if(n.parentNode)n.parentNode.removeChild(n);},
           addEventListener(t,f){(n.on[t]=n.on[t]||[]).push(f);},
           removeEventListener(t,f){const a=n.on[t]||[];const i=a.indexOf(f);if(i>=0)a.splice(i,1);},
           querySelector(){return null;},querySelectorAll(){return [];},
           focus(){},blur(){},click(){},
           setPointerCapture(){},releasePointerCapture(){}};
  n.on={};
  n.classList={
    _:[],
    contains(c){return n.classList._.indexOf(c)>=0;},
    add(c){if(!n.classList.contains(c))n.classList._.push(c);},
    remove(c){const i=n.classList._.indexOf(c);if(i>=0)n.classList._.splice(i,1);},
    toggle(c,f){f?n.classList.add(c):n.classList.remove(c);}
  };
  return n;
}
function stubDoc(){
  const d={created:[],
    createElement(t){const n=node(t);d.created.push(n);return n;},
    createElementNS(ns,t){const n=node(t);n.ns=ns;d.created.push(n);return n;},
    body:node('body'),
    addEventListener(){},removeEventListener(){}};
  return d;
}
function fakeLS(){
  const map={};
  return {getItem:k=>k in map?map[k]:null,
          setItem(k,v){map[k]=String(v);},removeItem(k){delete map[k];},_map:map};
}

/* the real file, run whole — it has no top-level DOM access, only definitions */
function load(opts){
  opts=opts||{};
  const doc=stubDoc();
  const win={};
  const ctx={console,window:win,document:doc,localStorage:fakeLS(),
    location:{href:'https://x.test/app.html#/match/1'},
    navigator:{},setTimeout:()=>0,clearTimeout(){},Image:function(){},
    URL:{createObjectURL:()=>'blob:x',revokeObjectURL(){}},
    MediaRecorder:opts.mimes?function(){}:undefined,
    Promise};
  /* attach() puts a resize handler on the window and takes it off again in
     detach(); tracked here so the pair can be shown to balance. */
  const winL={};
  ctx.addEventListener=(t,f)=>{(winL[t]=winL[t]||[]).push(f);};
  ctx.removeEventListener=(t,f)=>{const a=winL[t]||[];const i=a.indexOf(f);if(i>=0)a.splice(i,1);};
  ctx.window=ctx; ctx.self=ctx;
  if(opts.mimes)ctx.MediaRecorder.isTypeSupported=t=>opts.mimes.indexOf(t)>=0;
  vm.createContext(ctx);
  vm.runInContext(TOOLS+'\n;globalThis.T=window.PTFilmTools;',ctx,{filename:'film-tools.js'});
  return {T:ctx.T,doc,ctx,winL};
}

/* A toolkit mounted the way stats-view mounts it: a real attach(), a
   letterboxed stage, and full screen on — which is the only state in which any
   of this exists. 1430x951 holding a 1920x1080 picture is the measurement the
   whole coordinate system is built on, so it is the one used here. */
function mounted(extra){
  const {T,doc,ctx:vmctx,winL}=load();
  const v=vid(1920,1080,{x:0,y:0,width:1430,height:951});
  v.offsetWidth=1430; v.offsetHeight=951;
  const c=ctxFor(v,extra);
  c.stage.offsetWidth=1430; c.stage.offsetHeight=951;
  T.attach(c);
  T._internals.setFull(true);
  const I=T._internals;
  const layerOf=()=>c.stage.children.find(n=>n.attrs&&n.attrs['class']==='fmt-layer');
  const grp=cls=>{const s=layerOf();return s?s.children.find(n=>n.attrs&&n.attrs['class']===cls):null;};
  return {T,I,c,v,doc,winL,
    layerOf,grp,
    live:()=>{const g=grp('fmt-shapes');return g?g.children.length:-1;},
    key:(k,x)=>T.key(Object.assign({key:k,preventDefault(){},stopPropagation(){}},x||{})),
    menu:(t,p)=>I.menuModel({t,p}),
    pick:(model,label)=>{
      const walk=m=>{for(const it of m){if(it&&it.label===label)return it;
        if(it&&it.sub){const f=walk(it.sub);if(f)return f;}}return null;};
      return walk(model);
    }};
}

/* a video that reports a real picture inside a real stage */
function vid(vw,vh,box){
  const v=node('video');
  v.videoWidth=vw; v.videoHeight=vh; v.currentTime=0; v.paused=true;
  v.rect=Object.assign({x:0,y:0,width:0,height:0},box||{});
  return v;
}
function ctxFor(video,extra){
  const stage=node('div');
  stage.rect={x:0,y:0,width:video.rect.width,height:video.rect.height};
  return Object.assign({
    video:video, stage:stage, box:node('div'),
    win:{half:1,label:'1st Half',start:0,end:3000},
    cues:[], meta:{home:'A',away:'B',matchId:'m1'}, dur:{},
    seek(t){video.currentTime=t;}, seekBy(){}, play(){}, toggle(){},
    pause(){video.paused=true;}, end:()=>3000,
    matchTime:t=>t, clock:t=>('0'+Math.floor(t/60)).slice(-2)+':'+('0'+Math.floor(t%60)).slice(-2),
    isFull:()=>true, exitFull(){}, chainHTML:()=>''
  },extra||{});
}

/* ================= the promise that costs money if broken ================= */
/* "Không lưu trên Cloudflare" is a claim about code that does not exist. The
   only way to keep it true a year from now is to fail loudly the day somebody
   adds it back. */
test('nothing in the toolkit can upload anything, anywhere', () => {
  [['fetch(','a request'],['XMLHttpRequest','a request'],['navigator.sendBeacon','a request'],
   ['uploadToR2','the tagging app uploader'],['presign','a signed PUT'],
   ['workerUrl','the Worker'],['r2.dev','the bucket'],['cloudflarestorage','the bucket'],
   ['supabase','the database'],['createClient','the database'],
   ["method:'PUT'",'a write'],['method: "PUT"','a write'],['.upload(','a write']
  ].forEach(([needle,what])=>
    notOk(TOOLS.indexOf(needle)>=0,
      'film-tools.js mentions '+needle+' ('+what+') — a rendered clip must never leave the machine'));
});

test('the only place a rendered blob can go is the analyst own disk', () => {
  const dl=grabFunction('download',TOOLS,'client/assets/film-tools.js');
  ok(/a\.download\s*=\s*name/.test(dl),'an <a download>, and nothing else');
  ok(/URL\.createObjectURL/.test(dl),'from a blob held in this tab');
  // every Blob built in the file is handed to download(), never to anything else
  const sinks=TOOLS.match(/new Blob\([^)]*\)/g)||[];
  ok(sinks.length>=1,'a blob is produced');
  ok(/download\(blob,\s*name\)/.test(TOOLS),'and that blob is downloaded');
});

test('and it never touches the original video object', () => {
  ['setVideoUrl','video_url','matches','removeAttribute(\'src\')']
    .forEach(n=>notOk(grabFunction('exportClip',TOOLS,'client/assets/film-tools.js')
      .indexOf('video_url')>=0,'the export never names '+n));
  // the export reads the SAME url the player is already playing, and only reads.
  // The element is built in openSource() now, so the binding is named there.
  ok(/\bel\.src\s*=\s*src/.test(TOOLS),'a second element pointed at the same source');
  ok(/currentSrc\s*\|\|\s*ctx\.video\.src/.test(TOOLS),'taken from the player, not rebuilt');
});

/* ================= the channel alone ================= */
test('the client channel loads it, and registers it through the one hook', () => {
  ok(/loadOnce\('assets\/film-tools\.js\?v=\d+'\)/.test(APP),'the script');
  ok(/loadOnce\('assets\/film-tools\.css\?v=\d+',\s*'css'\)/.test(APP),'and its stylesheet');
  ok(/registerFilmTools\(window\.PTFilmTools\)/.test(APP),'handed to the mounted view');
  ok(/window\.PTStats\.registerFilmTools\s*&&\s*window\.PTFilmTools/.test(APP),
     'guarded, so an older stats-view cannot break the channel');
});

test('the tagging app Stats page loads none of it', () => {
  notOk(/film-tools/.test(PAGE),'no script tag, no stylesheet');
  // …and the hook it does have is inert until something registers
  const reg=grabConst('filmTools',STATS,'Stats/stats-view.js');
  ok(/=\s*null/.test(reg),'filmTools starts null');
});

test('stats-view calls the companion exactly four times, each one guarded', () => {
  [['filmStart','attach'],['filmStop','detach'],['filmFrame','frame'],['filmFullSet','fullscreen']]
    .forEach(([fn,call])=>{
      const src=grabFunction(fn,STATS,'Stats/stats-view.js');
      ok(src.indexOf('if(filmTools)filmTools.'+call+'(')>=0,
         fn+' calls '+call+', and only when a companion is there');
    });
  const keys=grabFunction('filmKeys',STATS,'Stats/stats-view.js');
  ok(/if\(filmTools&&filmTools\.key\(e\)\)/.test(keys),'and gets first refusal on the keyboard');
  ok(keys.indexOf('filmTools')>keys.indexOf("e.key==='Escape'"),
     'BELOW Escape — Q3 settled that as one meaning in both full-screen modes');
  ok(keys.indexOf('filmTools')<keys.indexOf("e.key==='ArrowRight'"),
     'and ABOVE the transport keys, so a tool can claim one');
});

test('the context it is handed is a copy, not the module bindings', () => {
  const c=grabFunction('filmToolsCtx',STATS,'Stats/stats-view.js');
  ['video','stage','box','win','cues','seek','pause','end','matchTime','isFull']
    .forEach(k=>ok(c.indexOf(k+':')>=0,'the context carries '+k));
  notOk(/return\s*film\b/.test(c),'the player object itself is not handed over');
});

/* ================= coordinates: the picture, not the box ================= */
/* In full screen the stage measures 1430x951 and holds a 1430x804 picture —
   147px of black. A mark stored against the box lands 73px off the grass, and
   lands somewhere DIFFERENT on a machine with another aspect ratio. */
test('the picture is found inside a letterboxed stage', () => {
  const {T}=load();
  const v=vid(1920,1080,{x:0,y:0,width:1430,height:951});
  T._internals.setCtx(ctxFor(v));
  const r=T._internals.pictureRect();
  eq(Math.round(r.w),1430,'width-limited, so the picture is as wide as the box');
  eq(Math.round(r.h),804,'and 16:9 tall inside it — 1430*9/16 = 804.375');
  eq(Math.round(r.y),73,'centred: (951-804.375)/2');
  eq(Math.round(r.x),0);
});

test('and inside a pillarboxed one', () => {
  const {T}=load();
  const v=vid(1920,1080,{x:0,y:0,width:1000,height:900});
  T._internals.setCtx(ctxFor(v));
  const r=T._internals.pictureRect();
  eq(Math.round(r.h),563,'height would overflow, so the picture is width-limited');
  eq(Math.round(r.w),1000);
  eq(Math.round(r.y),169,'(900-563)/2');
});

test('a click maps to the video own pixels, whatever the window is doing', () => {
  const {T}=load();
  const v=vid(1920,1080,{x:0,y:0,width:1430,height:951});
  T._internals.setCtx(ctxFor(v));
  // the exact middle of the picture: y = 73.3125 + 804.375/2
  const mid=T._internals.toVideo(715,475.5);
  eq(Math.round(mid.x),960); eq(Math.round(mid.y),540);
  const tl=T._internals.toVideo(0,73.3125);
  eq(Math.round(tl.x),0); eq(Math.round(tl.y),0);
});

test('a click on the black bars is refused rather than snapped onto the grass', () => {
  const {T}=load();
  const v=vid(1920,1080,{x:0,y:0,width:1430,height:951});
  T._internals.setCtx(ctxFor(v));
  eq(T._internals.toVideo(715,10),null,'above the picture');
  eq(T._internals.toVideo(715,940),null,'below it');
});

test('no video, no coordinates — never a guess', () => {
  const {T}=load();
  const v=vid(0,0,{x:0,y:0,width:800,height:450});
  T._internals.setCtx(ctxFor(v));
  eq(T._internals.pictureRect(),null,'metadata has not arrived yet');
});

/* ================= the menu ================= */
function model(){
  const {T}=load();
  const v=vid(1920,1080,{x:0,y:0,width:1430,height:951});
  T._internals.setCtx(ctxFor(v));
  T._internals.setFull(true);
  return {T,m:T._internals.menuModel({t:754.3,p:{x:900,y:500}})};
}
test('the menu opens on the moment it was asked about', () => {
  const {m}=model();
  ok(/12:34/.test(m[0].head),'the match clock of the click, to the second');
  ok(/1st Half/.test(m[0].head),'and which half it was');
});

test('every one of the six things a meeting needs is on it', () => {
  const {m}=model();
  const flat=[];
  (function walk(list){list.forEach(i=>{
    if(i.label)flat.push(i.label);          // a branch has a label too — "Speed" is one
    if(i.sub)walk(i.sub);
  });})(m);
  const joined=flat.join(' | ');
  [['frame','Step forward one frame'],['speed','Speed'],['spotlight','Spotlight here'],
   ['dim','Dim everything else'],['zoom','Zoom in here'],['arrow','Arrow'],
   ['freehand','Freehand'],['zone','Zone (half-space, pocket)'],['text','Text'],
   ['mark in','Mark clip START'],['mark out','Mark clip END'],
   ['clip from event','Clip around this event (±6s)'],['png','Save this frame (.png)'],
   ['mp4','Download the marked section (.mp4)'],['link','Copy a link to this moment'],
   ['exit','Exit full screen']
  ].forEach(([what,label])=>ok(joined.indexOf(label)>=0,'the menu offers '+what));
});

test('every leaf does something and every branch has leaves', () => {
  const {m}=model();
  (function walk(list){
    list.forEach(i=>{
      if(i.head||i.sep)return;
      ok(i.label,'an item has a label');
      if(i.sub){ok(i.sub.length,'"'+i.label+'" has entries');walk(i.sub);}
      else ok(typeof i.run==='function','"'+i.label+'" does something');
    });
  })(m);
});

/* ================= the keyboard ================= */
function keyed(){
  const {T}=load();
  const v=vid(1920,1080,{x:0,y:0,width:1430,height:951});
  const c=ctxFor(v);
  T._internals.setCtx(c); T._internals.setFull(true);
  return {T,c,v,hit:k=>T.key({key:k})};
}
test('it claims its own keys and hands back everything else', () => {
  const {T,hit}=keyed();
  [',','.','[',']','h','H','d','D','c','C','l','L','t','T','s','S'].forEach(k=>
    ok(hit(k),k+' is claimed'));
  [' ','ArrowLeft','ArrowRight','f','F','Enter','a'].forEach(k=>
    notOk(hit(k),k+' is left for the player'));
});

/* z was the 2x zoom toggle and is now the wheel's job. A key that no longer
   does anything must also stop being advertised — a menu promising a shortcut
   that is not bound is the exact defect S sat in for the life of this file. */
test('z is gone, and nothing still advertises it', () => {
  const {hit}=keyed();
  notOk(hit('z'),'the key is unbound');
  notOk(hit('Z'),'in both cases');
  const model=grabFunction('menuModel',TOOLS,'client/assets/film-tools.js');
  notOk(/key:\s*'Z'/.test(model),'and the menu no longer offers it');
  ok(/use the wheel/.test(model),'it points at the wheel instead');
});

/* The window keys answer only when there is something to apply them to. A key
   that returns true makes filmKeys() call preventDefault() and stop, so one
   that claims a press it did nothing with would eat it from the whole page. */
test('the window keys hand the press back when there is nothing selected', () => {
  const {hit}=keyed();
  ['1','5','9','0','Delete'].forEach(k=>
    notOk(hit(k),k+' is not claimed with no shape selected and no tool armed'));
});

/* Q3 was answered A: Escape means one thing in both full-screen modes — out —
   so the inner layers must NOT be sitting on it. */
test('Escape is never claimed here', () => {
  const {hit}=keyed();
  notOk(hit('Escape'),'it belongs to full screen, and to the browser at that');
});

test('Backspace closes the innermost thing that is open, and nothing else', () => {
  const {T,hit}=keyed();
  notOk(hit('Backspace'),'with nothing open it is not ours either');
});

test('none of it answers when Film is not on screen', () => {
  const {T}=load();
  notOk(T.key({key:','}),'no context, no keyboard');
  T._internals.setCtx(ctxFor(vid(1920,1080,{width:100,height:100})));
  T._internals.setFull(false);
  notOk(T.key({key:','}),'and not outside full screen either');
});

/* ================= clips ================= */
test('a clip is a window on the same file, carrying the drawing that was on it', () => {
  const {T}=load();
  const v=vid(1920,1080,{x:0,y:0,width:1430,height:951});
  T._internals.setCtx(ctxFor(v));
  const c=T._internals.saveClip(100,112,'Phản công');
  eq(c.in,100); eq(c.out,112); eq(c.title,'Phản công');
  ok(Array.isArray(c.shapes),'and the shapes live at that moment');
  eq(T._internals.clips().length,1,'stored');
  eq(T._internals.clips()[0].title,'Phản công');
});

test('clips are kept per match, in this browser only', () => {
  const {T,ctx}=load();
  const v=vid(1920,1080,{x:0,y:0,width:1430,height:951});
  T._internals.setCtx(ctxFor(v));
  T._internals.saveClip(1,2,'x');
  const raw=ctx.localStorage.getItem(T._internals.STORE_KEY);
  ok(raw&&raw.indexOf('m1')>=0,'keyed by the match');
  ok(/localStorage/.test(TOOLS),'localStorage, per Q2 answered A');
});

/* ================= the export format ================= */
test('mp4 is preferred, and webm is the honest fallback', () => {
  eq(load({mimes:['video/mp4;codecs=avc1.640028','video/webm;codecs=vp9']})
       .T._internals.pickMime(),'video/mp4;codecs=avc1.640028','H.264 high when offered');
  eq(load({mimes:['video/webm;codecs=vp9']}).T._internals.pickMime(),
     'video/webm;codecs=vp9','WebM when that is all there is');
  eq(load({mimes:[]}).T._internals.pickMime(),'','and nothing is not a format');
  ok(/only make \.webm/.test(TOOLS),
     'and the analyst is told, rather than handed a file a coach cannot open');
});

/* The render pump must not be clocked off requestAnimationFrame: measured, rAF
   stops dead in a hidden tab (0 callbacks in 19s) while MediaRecorder's own
   clock keeps running — which is a stalled render that still eats wall time. */
test('the render pump is ours, not the compositor', () => {
  ok(/captureStream\(0\)/.test(TOOLS),'frames are asked for, not taken');
  ok(/track\.requestFrame\(\)/.test(TOOLS),'one call per output frame');
  const pump=grabFunction('pump',TOOLS,'client/assets/film-tools.js');
  notOk(/requestAnimationFrame/.test(pump),'nothing in the pump waits on rAF');
  ok(/setTimeout\(pump,\s*1000\s*\/\s*fps\)/.test(pump),'it drives itself');
  ok(/var now\s*=\s*v\.currentTime/.test(pump),
     'and the clock is the SOURCE, so a drawing lands on the frame it was put on');
});

test('a tainted canvas is proved on one pixel before forty seconds are spent', () => {
  const ex=grabFunction('exportClip',TOOLS,'client/assets/film-tools.js');
  ok(/getImageData\(0,\s*0,\s*1,\s*1\)/.test(ex),'one pixel, read early');
  ok(ex.indexOf('getImageData')<ex.indexOf('rec.start'),'before the recorder is started');
  // crossOrigin lives in openSource() now — still on an element of its own, and
  // still never on the one the analyst is watching
  const open=grabFunction('openSource',TOOLS,'client/assets/film-tools.js');
  ok(/crossOrigin\s*=\s*'anonymous'/.test(open),'on a SECOND element');
  ok(/document\.createElement\('video'\)/.test(open),'built there, not borrowed');
  notOk(/ctx\.video\.crossOrigin/.test(TOOLS),
     'never on the one on screen — the attribute is a requirement, and a mismatch is no video at all');
});

/* ================= it does not exist until it is asked for ================= */
test('a player who opens no clip gets no layer and no query', () => {
  const {T,doc}=load();
  const v=vid(1920,1080,{x:0,y:0,width:1430,height:951});
  const c=ctxFor(v);
  T._internals.setCtx(c);
  eq(c.stage.children.length,0,'nothing has been appended to the stage');
  const ens=grabFunction('ensureLayer',TOOLS,'client/assets/film-tools.js');
  ok(/if\s*\(layer\s*\|\|\s*!ctx/.test(ens),'the layer is built once, on demand');
  const rest=grabFunction('restore',TOOLS,'client/assets/film-tools.js');
  ok(/if\s*\(shapes\.length\)/.test(rest),'and only restored when there is something to restore');
});

/* ============================================================================
   TIME — a mark belongs to the moment it was drawn on

   The complaint that started this: "I draw an arrow at 3:14 and it is there for
   the whole match." Measured, the window was already there and already worked —
   four seconds, fixed, invisible and uneditable, with four bugs around it. What
   follows locks down the window being VISIBLE and OWNED, and each of the four.
   ========================================================================== */
test('a mark is alive at its moment and nowhere else', () => {
  const {I,v,live,menu,pick}=mounted();
  v.currentTime=194;
  pick(menu(194,{x:900,y:500}),'Spotlight here').run();
  const s=I.state().shapes[0];
  eq(s.t,194,'anchored to the frame it was drawn on');
  eq(s.in,194); eq(s.out,198,'four seconds, which is what Q2 settled');
  [[193.5,0],[194,1],[197.9,1],[198.4,0],[400,0],[2000,0]].forEach(([t,n])=>{
    v.currentTime=t; I.paint(t,0);
    eq(live(),n,'at t='+t+' the layer holds '+n+' node(s)');
  });
});

test('pinning is the ONE way back to being there for the whole file', () => {
  const {I,v,live,menu,pick}=mounted();
  v.currentTime=194;
  pick(menu(194,{x:900,y:500}),'Spotlight here').run();
  const s=I.state().shapes[0];
  I.selectShape(s.id);
  ok(/📌/.test(pick(menu(194,{x:900,y:500}),'📌 Keep for the whole clip').label),'offered, not assumed');
  pick(menu(194,{x:900,y:500}),'📌 Keep for the whole clip').run();
  eq(I.state().shapes[0].life,'pinned');
  [0,194,2000,9999].forEach(t=>{ v.currentTime=t; I.paint(t,0); eq(live(),1,'alive at t='+t); });
});

test('the fade is a function of time, so the export can have it too', () => {
  const {I}=mounted();
  const s={in:100,out:104,fade:0.25,life:'moment'};
  eq(I.alpha(s,99.75).toFixed(2),'0.00','it begins at nothing');
  eq(I.alpha(s,99.875).toFixed(2),'0.50','half way in');
  eq(I.alpha(s,100).toFixed(2),'1.00');
  eq(I.alpha(s,102).toFixed(2),'1.00');
  eq(I.alpha(s,104).toFixed(2),'1.00');
  eq(I.alpha(s,104.25).toFixed(2),'0.00','and ends at nothing');
  eq(I.alpha({in:1,out:2,life:'pinned'},9e9),1,'a pinned mark never fades');
});

/* MEASURED BUG (a): with the video running, a stroke that took longer than the
   window was stored 100..104 and was therefore already dead when the analyst
   let go — they drew a line and nothing appeared. */
test('a stroke that outlasts its own window is not born dead', () => {
  const {I,c,v,live,layerOf,menu,pick}=mounted();
  v.currentTime=100;
  pick(menu(100,{x:1,y:1}),'Freehand').run();
  c.stage.on['pointerdown'][0]({button:0,clientX:300,clientY:300,pointerId:1,
    preventDefault(){},stopPropagation(){}});
  const svg=layerOf();
  for(let i=1;i<=6;i++){v.currentTime=100+i;svg.on['pointermove'][0]({clientX:300+i*40,clientY:300+i*10});}
  svg.on['pointerup'][0]({});
  const pen=I.state().shapes.slice(-1)[0];
  eq(pen.in,100,'anchored where the pen went down');
  ok(pen.out>=106+1.5,'and it outlives the release by MIN_TAIL — got out='+pen.out);
  v.currentTime=106; I.paint(106,0);
  ok(live()>=1,'so the analyst sees what they just drew');
});

/* MEASURED BUG (b): playing a clip replaced the match drawing with the clip's
   copy, and the next persist() wrote that truncated list to disk. */
test('playing a clip leaves the match drawing alone', () => {
  const {I,v,menu,pick}=mounted();
  [194,600,1200].forEach(t=>{v.currentTime=t;pick(menu(t,{x:900,y:500}),'Spotlight here').run();});
  eq(I.state().shapes.length,3);
  const clip=I.saveClip(190,200,'Clip A');
  eq(clip.shapes.length,1,'the clip still carries only what overlaps it');
  const playClip=grabFunction('playClip',TOOLS,'client/assets/film-tools.js');
  notOk(/shapes\s*=\s*c\.shapes/.test(playClip),'and playing it never reassigns shapes');
  eq(I.state().shapes.length,3,'so all three survive');
});

/* MEASURED BUG (c): every node rebuilt sixty times a second, and a fresh mask
   id on each of five consecutive frames. */
test('a frame that changes nothing touches no DOM', () => {
  const {I,v,grp,menu,pick}=mounted();
  v.currentTime=194;
  pick(menu(194,{x:900,y:500}),'Spotlight here').run();
  I.paint(194,0);
  const n1=grp('fmt-shapes').children[0];
  I.paint(194.01,0.1);
  eq(grp('fmt-shapes').children[0],n1,'the same node, not a replacement');
});

test('the dim mask is rebuilt when a spotlight moves, and only then', () => {
  const {I,v,grp,key,menu,pick}=mounted();
  v.currentTime=194;
  pick(menu(194,{x:900,y:500}),'Spotlight here').run();
  key('d');                                     // dim on
  const idOf=()=>{const m=grp('fmt-dim').children.find(n=>n.tag==='mask');return m&&m.attrs.id;};
  I.paint(194,0); const first=idOf();
  for(let i=1;i<5;i++)I.paint(194+i*0.001,0);
  eq(idOf(),first,'nothing moved, so the mask is left where it is');
  I.onWheel({deltaY:-100,clientX:700,clientY:400,preventDefault(){}});   // grow it
  I.paint(194,0);
  ok(idOf()!==first,'the hole has to follow the light — id is x/y/r, not the id alone');
});

test('a v1 record loads, keeps its window to the millisecond, and gains a fade', () => {
  const {I}=mounted();
  const up=I.upgrade({kind:'arrow',in:10.125,out:14.5});
  eq(up.in,10.125,'window untouched'); eq(up.out,14.5);
  eq(up.t,10.125,'the anchor was the start, back then');
  eq(up.life,'moment'); eq(up.fade,0.25,'Q3: yes, old drawings get the fade too');
  eq(up.rev,0);
});

/* ================= the four adjustments ================= */
/* #4 — the toolkit is not a transport control. Opening it must not stop the
   film; what that costs is that every item creating a drawing has to anchor to
   the frame that was right-clicked, not to wherever the clock has got to. */
test('right-clicking opens the toolkit without stopping the film', () => {
  const {c,v}=mounted();
  v.paused=false;
  c.stage.on['contextmenu'][0]({clientX:700,clientY:400,preventDefault(){},stopPropagation(){}});
  eq(v.paused,false,'the analyst keeps their playback');
  const open=grabFunction('openMenu',TOOLS,'client/assets/film-tools.js');
  notOk(/ctx\.pause\(\)/.test(open),'and the pause is gone from the source, not just quiet');
});

test('a menu item anchors to the frame that was right-clicked, not to now', () => {
  const {I,v,menu,pick}=mounted();
  v.currentTime=300;
  const model=menu(300,{x:800,y:400});
  v.currentTime=303;                       // three seconds spent reading the menu
  pick(model,'Spotlight here').run();
  const s=I.state().shapes.slice(-1)[0];
  eq(s.t,300,'the light lands on the frame that was pointed at');
  eq(s.in,300);
});

/* #1 — S has been printed beside "Spotlight here" since the day this file was
   written, and nothing was ever bound to it. */
test('S places a spotlight where the pointer is', () => {
  const {I,c,key}=mounted();
  c.stage.on['pointermove'][0]({clientX:500,clientY:400});
  ok(key('s'),'the key is taken now');
  const s=I.state().shapes.slice(-1)[0];
  eq(s.kind,'spotlight');
  eq(Math.round(s.at.x),Math.round(I.state().ptr.x),'at the pointer, not the middle');
  ok(I.state().adjust&&I.state().adjust.id===s.id,
     'and straight into adjust, so the wheel sizes it without a second trip');
});

test('S with the pointer off the picture falls back to the centre', () => {
  const {I,key}=mounted();
  ok(key('S'),'still taken');
  const s=I.state().shapes.slice(-1)[0];
  eq(s.at.x,960,'half of 1920'); eq(s.at.y,540,'half of 1080');
});

/* #2 — the spotlight can be put where it belongs and sized by the wheel. */
test('the wheel sizes the spotlight being adjusted, within limits', () => {
  const {I,key}=mounted();
  key('s');
  const r0=I.state().shapes.slice(-1)[0].r;
  I.onWheel({deltaY:-100,clientX:500,clientY:400,preventDefault(){}});
  ok(I.state().shapes.slice(-1)[0].r>r0,'up grows it');
  I.onWheel({deltaY:120,clientX:500,clientY:400,preventDefault(){}});
  I.onWheel({deltaY:120,clientX:500,clientY:400,preventDefault(){}});
  ok(I.state().shapes.slice(-1)[0].r<r0,'down shrinks it');
  for(let i=0;i<120;i++)I.onWheel({deltaY:-100,clientX:5,clientY:5,preventDefault(){}});
  ok(I.state().shapes.slice(-1)[0].r<=1080*0.60+0.001,
     'and it stops at 0.60 of the picture — an unbounded wheel plus dim is a white screen');
  for(let i=0;i<300;i++)I.onWheel({deltaY:120,clientX:5,clientY:5,preventDefault(){}});
  ok(I.state().shapes.slice(-1)[0].r>=1080*0.02-0.001,'and at 0.02 the other way');
});

test('dragging the adjusted spotlight moves it, and nothing else takes the click', () => {
  const {I,c,key,layerOf}=mounted();
  key('s');
  const id=I.state().shapes.slice(-1)[0].id;
  c.stage.on['pointerdown'][0]({button:0,clientX:400,clientY:300,pointerId:2,
    preventDefault(){},stopPropagation(){}});
  const moved=I.state().shapes.slice(-1)[0].at;
  ok(moved.x>0&&moved.y>0,'it went to the pointer');
  ok(layerOf().classList.contains('fmt-adjust'),
     'the layer takes the pointer only while adjusting — the rule it may not repeal otherwise');
  layerOf().on['pointerup'][0]({});
  eq(I.state().shapes.slice(-1)[0].id,id,'still the same one');
});

/* #3 — the wheel is the zoom, and the arbitration between the two jobs. */
test('with nothing being adjusted the wheel is the zoom', () => {
  const {I,key}=mounted();
  I.onWheel({deltaY:-100,clientX:700,clientY:400,preventDefault(){}});
  ok(I.state().zoom&&I.state().zoom.k>1,'in');
  for(let i=0;i<60;i++)I.onWheel({deltaY:-100,clientX:700,clientY:400,preventDefault(){}});
  ok(I.state().zoom.k<=6,'capped at 6x');
  for(let i=0;i<80;i++)I.onWheel({deltaY:120,clientX:700,clientY:400,preventDefault(){}});
  eq(I.state().zoom,null,
     'and back at life size the transform is taken OFF, not left as scale(1)');
});

test('the wheel refuses the two cases where it is not ours', () => {
  const {I}=mounted();
  let stopped=false;
  I.onWheel({deltaY:-100,clientX:700,clientY:400,ctrlKey:true,preventDefault(){stopped=true;}});
  notOk(stopped,'ctrl+wheel is the browser own zoom — taking it breaks an OS control');
  eq(I.state().zoom,null,'and it did nothing');
  I.setFull(false);
  I.onWheel({deltaY:-100,clientX:700,clientY:400,preventDefault(){stopped=true;}});
  notOk(stopped,'outside full screen the page keeps its scroll — .film-full is overflow:auto under 900px');
});

test('the wheel listener is on the stage, and asks for the right to cancel', () => {
  const at=grabFunction('attach',TOOLS,'client/assets/film-tools.js');
  ok(/ctx\.stage\.addEventListener\('wheel',\s*onWheel,\s*\{\s*passive:\s*false\s*\}\)/.test(at),
     'on ctx.stage, never document, and passive:false or preventDefault is ignored');
  notOk(/document\.addEventListener\('wheel'/.test(TOOLS),'nothing global');
});

/* The zoom origin, which the wheel made load-bearing. One origin string for two
   differently shaped boxes put the grass and the drawing on separate centres. */
test('the zoom origin is worked out in each element own box', () => {
  const {I}=mounted();
  const o=I.originOnElement(480,270);
  const y=parseFloat(o.split(' ')[1]);
  ok(Math.abs(y-274.5/951*100)<0.01,
     'y=270 of 1080 sits at 73.5+(270/1080)*804 = 274.5 of 951, not at 25% — got '+o);
  const x=parseFloat(o.split(' ')[0]);
  ok(Math.abs(x-25)<0.01,'and the unboxed axis is still a plain quarter');
  const az=grabFunction('applyZoom',TOOLS,'client/assets/film-tools.js');
  ok(/originOnElement/.test(az),'the video uses the element-space origin');
  ok(/layer\.w\s*\*\s*100/.test(az),'the SVG keeps the picture-space one, because it IS the picture');
});

/* ================= the lane ================= */
test('the lane shows one bar per shape, at its own window', () => {
  // a 200s window, so a four-second mark is 2% wide and clears the floor below
  const {I,v,menu,pick}=mounted({win:{half:1,label:'1st Half',start:0,end:200},end:()=>200});
  [20,60,120].forEach(t=>{v.currentTime=t;pick(menu(t,{x:900,y:500}),'Spotlight here').run();});
  const st=I.state().strip;
  ok(st,'it is up as soon as the match has a drawing (Q4)');
  eq(Object.keys(st.bars).length,3,'one bar each');
  const first=st.lane.children[0];
  ok(Math.abs(parseFloat(first.style.left)-10)<0.01,'left is its in-point: 20/200');
  ok(Math.abs(parseFloat(first.style.width)-2)<0.01,'width is its length: 4/200');
  ok(Math.abs(parseFloat(st.lane.children[2].style.left)-60)<0.01,'and the third is at 120/200');
});

/* A four-second mark inside a forty-five minute half is 0.13% of the lane —
   about two pixels, which is neither visible nor clickable. */
test('a very short window still gets a bar you can hit', () => {
  const {I,v,menu,pick}=mounted();                 // the default 3000s half
  v.currentTime=194;
  pick(menu(194,{x:900,y:500}),'Spotlight here').run();
  const bar=I.state().strip.lane.children[0];
  ok(Math.abs(parseFloat(bar.style.left)-194/3000*100)<0.01,'placed exactly');
  eq(parseFloat(bar.style.width),0.4,'but floored at 0.4% so it can be seen and hit');
});

test('the lane sits in the black bar ABOVE the picture, clear of the caption', () => {
  const {I,key}=mounted();
  key('s');
  const st=I.state().strip, top=parseFloat(st.el.style.top);
  // 1430x951 around a 1430x804 picture leaves 73.3px above and below; the one
  // below already belongs to .film-cap, which is 38-54px tall in full screen
  ok(top>=0,'inside the stage');
  ok(top+26<=73.32,'and entirely inside the top letterbox — got top='+top);
  notOk(st.el.classList.contains('fmt-over'),'so it covers no grass at all');
});

test('with no room above, the lane says so instead of moving somewhere unexpected', () => {
  const {T,I}=(()=>{
    const {T,doc,ctx}=load();
    const v=vid(1920,1080,{x:0,y:0,width:1430,height:810});   // barely any letterbox
    v.offsetWidth=1430; v.offsetHeight=810;
    const c=ctxFor(v); c.stage.offsetWidth=1430; c.stage.offsetHeight=810;
    T.attach(c); T._internals.setFull(true);
    return {T,I:T._internals};
  })();
  T.key({key:'s',preventDefault(){},stopPropagation(){}});
  ok(I.state().strip.el.classList.contains('fmt-over'),'it goes darker and lies over the edge');
});

test('the lane is a full-screen thing, and goes when full screen does', () => {
  const {T,I,key}=mounted();
  key('s');
  ok(I.state().strip,'up in full screen');
  T.fullscreen(false);
  eq(I.state().strip,null,'and down outside it');
  eq(I.state().selected,null,'with nothing left selected');
  eq(I.state().adjust,null);
});

/* ================= editing a window ================= */
test('the number row sets the window, and 0 pins it', () => {
  const {I,v,key,menu,pick}=mounted();
  v.currentTime=194;
  pick(menu(194,{x:900,y:500}),'Spotlight here').run();
  const s=I.state().shapes[0];
  I.selectShape(s.id);
  ok(key('8'),'claimed, because there is something to apply it to');
  eq(I.state().shapes[0].out,202,'194 + 8');
  ok(key('0'));
  eq(I.state().shapes[0].life,'pinned');
  ok(key('0'));
  eq(I.state().shapes[0].life,'moment','and back again');
  ok(key('Delete'));
  eq(I.state().shapes.length,0,'Delete takes the selected one');
});

test('shift+arrow nudges the window by a frame, and leaves the transport keys alone', () => {
  const {I,v,key,menu,pick}=mounted();
  v.currentTime=194;
  pick(menu(194,{x:900,y:500}),'Spotlight here').run();
  I.selectShape(I.state().shapes[0].id);
  const before=I.state().shapes[0].in;
  ok(key('ArrowRight',{shiftKey:true}),'shift+right is ours');
  ok(I.state().shapes[0].in>before,'the whole window moved');
  eq(I.state().shapes[0].out-I.state().shapes[0].in,4,'its length did not');
  notOk(key('ArrowRight'),'plain right is still the player seeking');
});

test('nothing here relies on a modifier stats-view throws away first', () => {
  const k=grabFunction('key',TOOLS,'client/assets/film-tools.js');
  ['altKey','ctrlKey','metaKey'].forEach(m=>
    notOk(k.indexOf(m)>=0,
      'key() reads '+m+' — filmKeys() returns before us on those, so it would never run'));
  ok(/shiftKey/.test(k),'shift is the one modifier that does reach here');
});

/* ================= the exports ================= */
test('the export builds its overlay detached, and stops driving the screen', () => {
  const ov=grabFunction('overlaySVGString',TOOLS,'client/assets/film-tools.js');
  notOk(/\bpaint\(/.test(ov),'a forty-second render may not move the analyst own picture');
  ok(/liveAt\(now\)/.test(ov),'the same window the screen uses');
  ok(/alpha\(s,\s*now\)/.test(ov),'and the same fade, so the file matches what was seen');
});

/* Q1 was answered B: the reference product stops on the frame. */
test('a freeze segment holds one frame, and the file comes out longer for it', () => {
  const ex=grabFunction('exportClip',TOOLS,'client/assets/film-tools.js');
  ok(/s\.freeze\s*>\s*0/.test(ex),'a shape can ask for a hold');
  ok(/Math\.abs\(last\.t\s*-\s*f\.t\)\s*<\s*0\.25/.test(ex),
     'points within a quarter second merge — an arrow, a zone and a caption on one frame stop it once');
  ok(/Math\.max\(last\.hold,\s*f\.hold\)/.test(ex),'and the longest hold wins');
  ok(/total\s*=\s*dur\s*\+\s*holdTotal/.test(ex),'the progress figure counts the holds');
  const pump=grabFunction('pump',TOOLS,'client/assets/film-tools.js');
  ok(/if\s*\(frozen\)/.test(pump),'the pump has a holding branch');
  ok(/v\.pause\(\)/.test(pump),'the source stops, so the picture really is one frame');
  ok(/Date\.now\(\)\s*>=\s*frozen\.until/.test(pump),
     'and the wall clock ends it, because that is what MediaRecorder writes against');
});

test('a shape can be given a freeze from the menu it belongs to', () => {
  const {I,v,menu,pick}=mounted();
  v.currentTime=194;
  pick(menu(194,{x:900,y:500}),'Spotlight here').run();
  const model=menu(194,{x:900,y:500-81});          // on the ring of the light
  const item=pick(model,'4 s');
  ok(item,'the freeze lengths are offered on the shape that was hit');
  pick(model,'Select to edit').run();
  pick(menu(194,{x:900,y:500-81}),'3 s').run();
  ok(I.state().shapes[0].freeze===3||I.state().shapes[0].out===197,
     'either the freeze or the window took the number — both live on that submenu');
});

/* ================= nothing is left behind ================= */
test('detach takes off every listener attach put on', () => {
  const {T,c,v,winL}=mounted();
  ['contextmenu','pointerdown','pointermove','wheel'].forEach(t=>
    ok((c.stage.on[t]||[]).length>0,t+' is bound while Film is up'));
  T.detach();
  ['contextmenu','pointerdown','pointermove','wheel'].forEach(t=>
    eq((c.stage.on[t]||[]).length,0,t+' is gone again'));
  eq((winL.resize||[]).length,0,'and so is the window resize');
  eq((v.on['loadedmetadata']||[]).length,0,'and the metadata handler');
});

/* ============================================================================
   OPENING THE SOURCE — telling the truth about why a render failed

   Measured against the bucket this site serves video from: a request carrying
   an Origin header comes back with no Access-Control-Allow-Origin at all. With
   crossOrigin="anonymous" set — and it must be set, or the canvas is tainted
   and nothing can be recorded from it — the file therefore fails to LOAD, and
   the export blamed the video. The video was fine. The header was missing.
   ========================================================================== */
function opener(){
  const {T,doc}=load();
  const I=T._internals;
  const lastVideo=()=>doc.created.filter(n=>n.tag==='video').slice(-1)[0];
  const fire=(n,t)=>(n.on[t]||[]).forEach(f=>f());
  return {T,I,doc,lastVideo,fire};
}

test('the source is opened with crossOrigin, and resolves when it loads', async () => {
  const {I,lastVideo,fire}=opener();
  const p=I.openSource('https://x.test/m.mp4',true);
  const el=lastVideo();
  eq(el.crossOrigin,'anonymous','beat one asks for the header');
  eq(el.src,'https://x.test/m.mp4','pointed at the url the player is already on');
  fire(el,'loadedmetadata');
  const got=await p;
  eq(got,el,'and hands back the element it opened');
});

test('and rejects when the browser refuses it', async () => {
  const {I,lastVideo,fire}=opener();
  const p=I.openSource('https://x.test/m.mp4',true);
  fire(lastVideo(),'error');
  let rejected=false;
  await p.then(()=>{},()=>{rejected=true;});
  ok(rejected,'a refusal is a rejection, not a hang');
});

test('beat two drops crossOrigin — that is the whole point of it', () => {
  const {I,lastVideo}=opener();
  I.openSource('https://x.test/m.mp4',false);
  const el=lastVideo();
  ok(!el.crossOrigin,'no attribute, so a server without CORS can still answer');
  eq(el.src,'https://x.test/m.mp4','same file, so the answer is about the header alone');
});

test('a source that answers twice only settles once', async () => {
  const {I,lastVideo,fire}=opener();
  const p=I.openSource('https://x.test/m.mp4',true);
  const el=lastVideo();
  fire(el,'loadedmetadata');
  fire(el,'error');            // some browsers follow one with the other
  let ok1=false;
  await p.then(()=>{ok1=true;},()=>{});
  ok(ok1,'the first answer is the answer');
});

test('the export asks twice, and the second answer picks the message', () => {
  const ex=grabFunction('exportClip',TOOLS,'client/assets/film-tools.js');
  ok(/openSource\(src,\s*true\)/.test(ex),'beat one, with the header demanded');
  ok(/openSource\(src,\s*false\)/.test(ex),'beat two, without it');
  ok(ex.indexOf('openSource(src, true)')<ex.indexOf('openSource(src, false)'),
     'and only ever in that order — beat two is a diagnosis, not a fallback');
  ok(/fail\(NEED_CORS\)/.test(ex),
     'it opened without the header, so the file is fine and the SERVER is what to fix');
  ok(/bad URL, or the file is gone/.test(ex),
     'neither opened, so this really is the file');
  notOk(/video could not be opened for rendering/i.test(TOOLS),
     'the old sentence blamed the video for a missing header and is gone');
});

test('the diagnosing element renders nothing and is thrown away at once', () => {
  const ex=grabFunction('exportClip',TOOLS,'client/assets/film-tools.js');
  ok(/dropSource\(el\)/.test(ex),'beat two is disposed of the moment it has answered');
  const drop=grabFunction('dropSource',TOOLS,'client/assets/film-tools.js');
  ok(/removeAttribute\('src'\)/.test(drop),'src let go');
  ok(/\.load\(\)/.test(drop),'and the buffer with it');
});

test('a proven missing header is remembered, and said before it is asked again', () => {
  const {T,I}=(()=>{const {T}=load();return {T,I:T._internals};})();
  eq(I.state().corsState,null,'nothing assumed to begin with');
  I.setCors(false);
  eq(I.state().corsState,false);
  const ex=grabFunction('exportClip',TOOLS,'client/assets/film-tools.js');
  ok(/corsState === false/.test(ex),'a second attempt says so at once');
  ok(ex.indexOf('corsState === false')<ex.indexOf('pickMime'),
     'before a recorder, an audio graph or a canvas is built for nothing');
  const rp=grabFunction('renderPanel',TOOLS,'client/assets/film-tools.js');
  ok(/corsState === false/.test(rp),'and the drawer stops offering the button as ready');
});

/* Finding the cause must not smuggle in a network primitive. The four promises
   at the top of this file are statements about code that EXISTS. */
test('diagnosing CORS added no way to talk to anything', () => {
  ['fetch(','XMLHttpRequest','navigator.sendBeacon','.upload('].forEach(n=>
    notOk(TOOLS.indexOf(n)>=0,'film-tools.js mentions '+n));
  const open=grabFunction('openSource',TOOLS,'client/assets/film-tools.js');
  ok(/document\.createElement\('video'\)/.test(open),
     'the only thing that touches the network is a <video>, which the player was already doing');
});

/* A render that cannot draw the drawing must STOP. Handing over a file that
   looks finished but carries no graphics is the worst of the three outcomes. */
test('an overlay that will not rasterise stops the render instead of shipping a bare clip', () => {
  const ex=grabFunction('exportClip',TOOLS,'client/assets/film-tools.js');
  const then=ex.slice(ex.indexOf('overlayImage(str).then'));
  notOk(/overlayImage\(str\)\.then\(function \(img\) \{ lastImg = img; after\(\); \}, after\)/.test(ex),
     'the rejection no longer falls through to after() with lastImg still null');
  ok(/The graphics layer could not be built/.test(then),'it fails, loudly');
  ok(then.indexOf('fail(')<then.indexOf('} else after();'),'and fails rather than continuing');
});

/* ============================================================================
   DISMISSING THE MENU — the one thing every context menu does
   ========================================================================== */
function withMenu(){
  const m=mounted();
  m.c.stage.on['contextmenu'][0]({clientX:700,clientY:400,
    preventDefault(){},stopPropagation(){}});
  return m;
}

test('a left click on the frame shuts the menu, and stops there', () => {
  const {I,c}=withMenu();
  ok(I.state().menu,'the menu is up');
  let prevented=false,stopped=false;
  c.stage.on['pointerdown'][0]({button:0,clientX:600,clientY:400,pointerId:1,
    preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});
  eq(I.state().menu,null,'and now it is not');
  ok(prevented,'the press is consumed');
  ok(stopped,'and does not carry on to anything else');
});

test('that click does not also move a spotlight or begin a stroke', () => {
  const {T,I,c,key}=mounted();
  key('s');                                            // a spotlight, in adjust
  const at0=Object.assign({},I.state().shapes[0].at);
  const n0=I.state().shapes.length;
  c.stage.on['contextmenu'][0]({clientX:700,clientY:400,preventDefault(){},stopPropagation(){}});
  c.stage.on['pointerdown'][0]({button:0,clientX:200,clientY:200,pointerId:2,
    preventDefault(){},stopPropagation(){}});
  eq(I.state().menu,null,'the menu shut');
  eq(I.state().shapes.length,n0,'no shape was added');
  eq(I.state().shapes[0].at.x,at0.x,'and the light did not jump to the pointer');
  eq(I.state().shapes[0].at.y,at0.y);
});

/* The items are <button>s driven by onclick, and click fires AFTER pointerdown.
   Without this guard, pressing an item would shut the menu at pointerdown, tear
   the button out of the document, and the click would never arrive — every item
   in the menu silently dead. */
test('a press INSIDE the menu is left alone, so the items still work', () => {
  const {I,c}=withMenu();
  const menu=c.box.children.find(n=>n.className==='fmt-menu');
  ok(menu,'the menu is a child of the box');
  const item=menu.children.find(n=>n.className==='fmt-m-it');
  c.box.on['pointerdown'][0]({target:item,button:0});
  ok(I.state().menu,'still open — the click belongs to the item');
  let ran=false;
  const model=I.menuModel({t:0,p:{x:10,y:10}});
  ok(model.length>0,'and the model behind it is intact');
});

test('a press elsewhere in the box shuts it, and is NOT swallowed', () => {
  const {I,c}=withMenu();
  const elsewhere={parentNode:c.box};                  // a row in the event list
  let prevented=false;
  c.box.on['pointerdown'][0]({target:elsewhere,button:0,preventDefault(){prevented=true;}});
  eq(I.state().menu,null,'shut');
  notOk(prevented,'and the row underneath still gets its click');
});

test('the box listener exists only while the menu does', () => {
  const {T,I,c}=mounted();
  eq((c.box.on['pointerdown']||[]).length,0,'nothing bound with no menu');
  c.stage.on['contextmenu'][0]({clientX:700,clientY:400,preventDefault(){},stopPropagation(){}});
  eq(c.box.on['pointerdown'].length,1,'one while it is open');
  T.key({key:'Backspace',preventDefault(){},stopPropagation(){}});
  eq(I.state().menu,null);
  eq(c.box.on['pointerdown'].length,0,'and none again after it closes');
});

test('with no menu open, a click on the frame does what it always did: nothing', () => {
  const {I,c}=mounted();
  const before=I.state().shapes.length;
  let prevented=false;
  c.stage.on['pointerdown'][0]({button:0,clientX:600,clientY:400,pointerId:3,
    preventDefault(){prevented=true;},stopPropagation(){}});
  eq(I.state().shapes.length,before,'no shape');
  notOk(prevented,'and the press is not claimed — the video surface takes no click');
  const od=grabFunction('onDown',TOOLS,'client/assets/film-tools.js');
  ok(od.indexOf('if (menu)')<od.indexOf('if (!mode && adjust)'),
     'the dismiss branch is FIRST, so one click can only ever mean one thing');
});

/* ================= the stylesheet cannot reach anything else ================= */
function selectors(css){
  const out=[];
  css.replace(/\/\*[\s\S]*?\*\//g,'').replace(/@media[^{]*\{/g,'').split('}').forEach(b=>{
    const s=b.split('{')[0];
    if(!s||/^\s*@/.test(s))return;
    s.split(',').forEach(x=>{x=x.trim(); if(x)out.push(x);});
  });
  return out;
}
test('every rule is scoped to the toolkit', () => {
  selectors(TOOLS_CSS).forEach(s=>
    ok(/^\.fmt-|^\.film-full/.test(s),
       s+' is not scoped to .fmt- or .film-full — it could restyle Film as a player reads it'));
});

test('and nothing in it reaches for a bare tag', () => {
  selectors(TOOLS_CSS).forEach(s=>
    notOk(/^[a-z]/i.test(s),s+' would dress whatever page loads this'));
});

/* ================= shipping ================= */
test('both new files are staged for GitHub Pages', () => {
  ['cp client/assets/film-tools.js','cp client/assets/film-tools.css']
    .forEach(line=>ok(YML.indexOf(line)>=0,
      'deploy.yml is missing: '+line+' — it would 404 live while the build stays green'));
});
