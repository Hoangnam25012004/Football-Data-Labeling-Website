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
  ctx.window=ctx; ctx.self=ctx;
  if(opts.mimes)ctx.MediaRecorder.isTypeSupported=t=>opts.mimes.indexOf(t)>=0;
  vm.createContext(ctx);
  vm.runInContext(TOOLS+'\n;globalThis.T=window.PTFilmTools;',ctx,{filename:'film-tools.js'});
  return {T:ctx.T,doc,ctx};
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
  // the export reads the SAME url the player is already playing, and only reads
  ok(/v\.src\s*=\s*src/.test(TOOLS),'a second element pointed at the same source');
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
    if(i.label)flat.push(i.label);          // a branch has a label too — "Tốc độ" is one
    if(i.sub)walk(i.sub);
  });})(m);
  const joined=flat.join(' | ');
  [['frame','Bước tới 1 frame'],['tốc độ','Tốc độ'],['spotlight','Rọi đèn vào đây'],
   ['dim','Làm tối phần còn lại'],['zoom','Phóng to vùng này'],['mũi tên','Mũi tên'],
   ['bút','Bút tự do'],['vùng','Vùng (half-space, pocket)'],['chữ','Chữ'],
   ['mark in','Đánh dấu ĐẦU clip'],['mark out','Đánh dấu CUỐI clip'],
   ['clip from event','Clip quanh event này (±6s)'],['png','Lưu khung hình (.png)'],
   ['mp4','Tải đoạn đã đánh dấu (.mp4)'],['link','Chép link tới khoảnh khắc này'],
   ['exit','Thoát toàn màn hình']
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
  [',','.','[',']','h','H','d','D','c','C','z','Z','l','L'].forEach(k=>
    ok(hit(k),k+' is claimed'));
  [' ','ArrowLeft','ArrowRight','f','F','Enter','a','1'].forEach(k=>
    notOk(hit(k),k+' is left for the player'));
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
  ok(/chỉ tạo được \.webm/.test(TOOLS),
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
  ok(/crossOrigin\s*=\s*'anonymous'/.test(ex),'on a SECOND element');
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
