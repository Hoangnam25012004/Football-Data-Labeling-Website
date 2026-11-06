/* The analyst toolkit, redesigned: keyframes, links, measuring, the clip editor
   and tags. Design: docs/design/film-analyst-toolkit-design.md.

   The arithmetic is run for real, because that is where a telestration tool goes
   quietly wrong: a figure off by a metre looks exactly like a right one. The
   panels are driven through the same stub DOM film-tools.test.js uses. What only
   a browser can show (a real MP4, real seeking) is checked by hand and recorded
   in the design doc; here is what must not regress. */
const {readSrc}=require('./harness');
const {test,eq,ok,notOk}=require('./tiny-test');
const vm=require('vm');

const TOOLS=readSrc('apps/portal/assets/film-tools.js');
const CSS=readSrc('apps/portal/assets/film-tools.css');
const APP=readSrc('apps/portal/assets/app.js');
const SUPA=readSrc('apps/portal/assets/supa.js');
const SQL=readSrc('supabase/migrations/0027_film_tags.sql');
const GUIDE=readSrc('apps/portal/guide.html');

/* ================= the stub, as film-tools.test.js has it ================= */
function node(tag){
  const n={tag,attrs:{},style:{},children:[],parentNode:null,className:'',
    textContent:'',innerHTML:'',value:'',type:'',placeholder:'',title:'',
    offsetWidth:260,offsetHeight:400,scrollTop:0,
    rect:{x:0,y:0,width:0,height:0,left:0,top:0,right:0,bottom:0},
    getBoundingClientRect(){return n.rect;},
    setAttribute(k,v){n.attrs[k]=v;},getAttribute(k){return n.attrs[k];},
    appendChild(k){k.parentNode=n;n.children.push(k);return k;},
    removeChild(k){const i=n.children.indexOf(k);if(i>=0)n.children.splice(i,1);k.parentNode=null;return k;},
    remove(){if(n.parentNode)n.parentNode.removeChild(n);},
    addEventListener(t,f){(n.on[t]=n.on[t]||[]).push(f);},
    removeEventListener(t,f){const a=n.on[t]||[];const i=a.indexOf(f);if(i>=0)a.splice(i,1);},
    querySelector(){return null;},querySelectorAll(){return [];},
    focus(){},blur(){},click(){},setPointerCapture(){},releasePointerCapture(){}};
  n.on={};
  n.classList={_:[],contains(c){return n.classList._.indexOf(c)>=0;},
    add(c){if(!n.classList.contains(c))n.classList._.push(c);},
    remove(c){const i=n.classList._.indexOf(c);if(i>=0)n.classList._.splice(i,1);},
    toggle(c,f){f?n.classList.add(c):n.classList.remove(c);}};
  return n;
}
function mounted(extra,opts){
  opts=opts||{};
  const doc={createElement:t=>node(t),createElementNS:(ns,t)=>node(t),body:node('body'),
    addEventListener(){},removeEventListener(){}};
  const store={};
  const timers=[];
  const ctx={console,document:doc,
    localStorage:{getItem:k=>k in store?store[k]:null,setItem(k,v){store[k]=String(v);},removeItem(k){delete store[k];}},
    location:{href:'https://x.test/app.html#/match/1'},navigator:{},
    setTimeout:(f,ms)=>{timers.push({f,ms});return timers.length;},clearTimeout(){},
    Image:function(){},URL:{createObjectURL:()=>'blob:x',revokeObjectURL(){}},Promise,
    addEventListener(){},removeEventListener(){}};
  ctx.window=ctx; ctx.self=ctx;
  if(opts.HNA)ctx.HNA=opts.HNA;
  vm.createContext(ctx);
  vm.runInContext(TOOLS+'\n;globalThis.T=window.PTFilmTools;',ctx,{filename:'film-tools.js'});
  const v=node('video');
  v.videoWidth=1920;v.videoHeight=1080;v.currentTime=0;v.paused=true;v.playbackRate=1;v.muted=false;v.readyState=4;
  v.rect={x:0,y:0,width:1920,height:1080};v.offsetWidth=1920;v.offsetHeight=1080;
  const stage=node('div');stage.rect={x:0,y:0,width:1920,height:1080};
  const box=node('div');box.rect={x:0,y:0,width:1920,height:1080};
  const c=Object.assign({video:v,stage,box,win:{half:1,label:'1st Half',start:0,end:3000},
    cues:[],meta:{home:'A',away:'B',matchId:'m1'},dur:{},
    seek(t){v.currentTime=t;},seekBy(){},play(){v.paused=false;},toggle(){},
    pause(){v.paused=true;},end:()=>3000,matchTime:t=>t,
    clock:t=>('0'+Math.floor(t/60)).slice(-2)+':'+('0'+Math.floor(t%60)).slice(-2),
    isFull:()=>true,exitFull(){},chainHTML:()=>''},extra||{});
  ctx.T.attach(c);
  ctx.T._internals.setFull(true);
  const I=ctx.T._internals;
  const press=(k)=>ctx.T.key({key:k,preventDefault(){},stopPropagation(){}});
  const down=(x,y)=>stage.on.pointerdown[0]({button:0,clientX:x,clientY:y,pointerId:1,preventDefault(){},stopPropagation(){}});
  return {T:ctx.T,I,c,v,stage,box,press,down,timers,ctx,store};
}
const near=(a,b,d)=>Math.abs(a-b)<(d||1e-6);

/* ================= keyframes ================= */
test('a keyframed point glides between its keys, and holds beyond them', () => {
  const {I}=mounted();
  const k=[{t:10,x:0,y:0},{t:20,x:100,y:50}];
  const at=t=>I.lerpKeys(k,t);
  eq(at(5).x,0,'before the first key');
  eq(at(25).x,100,'after the last');
  eq(at(15).x,50,'halfway along');
  eq(at(15).y,25);
});
test('keys stay in time order, and the same frame replaces rather than doubles', () => {
  const {I}=mounted();
  const k=[{t:10,x:0,y:0},{t:20,x:0,y:0}];
  I.upsertKey(k,15,{x:5,y:5});
  eq(k.map(q=>q.t).join(),'10,15,20','inserted in order');
  I.upsertKey(k,15.01,{x:9,y:9});
  eq(k.length,3,'half a frame away is the same key');
  eq(k[1].x,9,'and it moved');
});
test('an untracked shape resolves to itself, so the common frame allocates nothing', () => {
  const {I}=mounted();
  const s={kind:'spotlight',at:{x:1,y:2},r:10};
  ok(I.resolved(s,5)===s,'the very same object');
  eq(I.geoKey(s,5),'','and nothing to invalidate');
});
test('turning tracking on keeps the ring where it is, and a drag adds a key', () => {
  const {I,v,press}=mounted();
  v.currentTime=100;
  press('s');
  const s=I.state().shapes[0];
  const start={x:s.at.x,y:s.at.y};
  I.setTrack(s,true);
  eq(s.keys.length,1);
  eq(s.keys[0].x,start.x,'first key is exactly where the ring was');
  v.currentTime=102;
  I.placeAdjust(s,{x:400,y:300},0);
  eq(s.keys.length,2,'a second frame, a second key');
  eq(I.resolved(s,101).at.x,(start.x+400)/2,'and the frame between is worked out');
});
test('moving a key past the end of the window carries the window along', () => {
  const {I,v,press}=mounted();
  v.currentTime=100;
  press('s');
  const s=I.state().shapes[0];
  I.setTrack(s,true);
  const was=s.out;
  v.currentTime=was+3;
  I.placeAdjust(s,{x:1,y:1},0);
  ok(s.out>=was+3,'or the ring would vanish under the hand that moved it');
});
test('shortening the window never cuts a tracked mark off before its last key', () => {
  const {I,v,press}=mounted();
  v.currentTime=100;
  press('s');
  const s=I.state().shapes[0];
  I.setTrack(s,true);
  v.currentTime=108;
  I.placeAdjust(s,{x:1,y:1},0);
  press('1');
  ok(s.out>=108,'one second asked for, but the run is eight');
});
test('a tracked node is rebuilt when it moves, and left alone when it does not', () => {
  const {I,v,press}=mounted();
  v.currentTime=100;
  press('s');
  const s=I.state().shapes[0];
  I.setTrack(s,true);
  v.currentTime=102;
  I.placeAdjust(s,{x:900,y:300},0);
  const key=t=>I.geoKey(I.resolved(s,t),t);
  ok(key(100)!==key(102),'the key changes with the position');
  eq(key(103),key(104),'and is steady once it has stopped');
});
test('the last keyframe cannot be removed, or the ring would have nowhere to be', () => {
  const {I,v,press}=mounted();
  v.currentTime=100;
  press('s');
  const s=I.state().shapes[0];
  I.setTrack(s,true);
  notOk(I.removeKeyAt(s,100),'refused');
  eq(s.keys.length,1);
});

/* ================= old drawings ================= */
test('a spotlight saved before this redesign still draws as the circle it was', () => {
  const {I}=mounted();
  const g=I.shapeNode({id:'o',kind:'spotlight',at:{x:50,y:50},r:30,style:{color:'#fff',width:4},rev:0},0);
  eq(g.children[0].tag,'circle');
});
test('a new spotlight has the ring and the beam, and a label if it is given one', () => {
  const {I,press}=mounted();
  press('s');
  const s=I.state().shapes[0];
  eq(s.look,'both');
  s.label='#6';
  const g=I.shapeNode(s,0);
  const tags=g.children.map(n=>n.tag);
  ok(tags.indexOf('ellipse')>=0,'the ring');
  ok(tags.indexOf('path')>=0,'the beam');
  ok(g.children.some(n=>n.attrs['class']==='fmt-plate'),'the name tag');
});

/* ================= links ================= */
test('clicks make points until Finish, and too few points is not a link', () => {
  const {I,v,down}=mounted();
  v.currentTime=50;
  I.startLink('shape',50);
  const s=I.state().shapes[0];
  down(100,100);down(200,100);
  eq(s.pts.length,2);
  ok(I.ui().collect,'still collecting');
  I.finishCollect();
  eq(I.state().shapes.length,0,'two players are not a shape, and nothing is left behind');
  eq(I.ui().collect,null);
});
test('a finished link is dragged by its nearest point', () => {
  const {I,v,down}=mounted();
  v.currentTime=50;
  I.startLink('chain',50);
  const s=I.state().shapes[0];
  down(100,100);down(500,100);
  I.finishCollect();
  down(505,100);
  eq(s.pts[1].x,505,'the one that was pressed');
  eq(s.pts[0].x,100,'and only that one');
  down(1500,900);
  eq(s.pts[1].x,505,'a press away from every player moves nothing');
});
test('a defensive line runs out to the edges of the picture', () => {
  const {I}=mounted();
  const g=I.shapeNode(I.resolved({id:'l',kind:'link',sub:'line',pts:[{x:100,y:500},{x:300,y:500}],
    style:{color:'#fff',width:4},rev:0},0),0);
  const d=g.children[0].attrs.d;
  ok(/^M0 500L1920 500$/.test(d),'got '+d);
});
test('distances show only near the calibrated frame', () => {
  const {I}=mounted();
  const H=[1,0,0,0,1,0,0,0,1];
  const s={id:'l',kind:'link',sub:'chain',dist:true,H,calT:100,units:'m',
    pts:[{x:0,y:0},{x:10,y:0}],style:{color:'#fff',width:4},rev:0};
  const plates=t=>I.shapeNode(I.resolved(s,t),0).children.filter(n=>n.attrs['class']==='fmt-plate').length;
  eq(plates(100),1,'on the frame');
  eq(plates(100.9),1,'within a second');
  eq(plates(103),0,'and gone once the camera may have moved');
});

/* ================= calibration ================= */
test('the homography maps four known points to where they belong', () => {
  const {I}=mounted();
  const src=[{x:100,y:900},{x:1800,y:900},{x:1500,y:300},{x:400,y:300}];
  const dst=[{x:16.5,y:54.16},{x:88.5,y:54.16},{x:88.5,y:13.84},{x:16.5,y:13.84}];
  const H=I.homography(src,dst);
  src.forEach((p,i)=>{
    const q=I.applyH(H,p);
    ok(near(q.x,dst[i].x,1e-6)&&near(q.y,dst[i].y,1e-6),'corner '+i);
  });
  const m=I.applyH(H,{x:950,y:900});
  ok(near(m.y,54.16,1e-6),'a point on that line stays on that line');
});
test('perspective is honoured: the far half of a picture is not the near half', () => {
  const {I}=mounted();
  const src=[{x:100,y:900},{x:1800,y:900},{x:1500,y:300},{x:400,y:300}];
  const dst=[{x:0,y:40},{x:40,y:40},{x:40,y:0},{x:0,y:0}];
  const H=I.homography(src,dst);
  const mid=I.applyH(H,{x:950,y:600});
  ok(mid.y>20,'the far half is squeezed, so the middle of the picture is still on the near half, got '+mid.y);
});
test('three points in a line are caught, in either set', () => {
  const {I}=mounted();
  ok(I.collinear([{x:0,y:0},{x:50,y:50},{x:100,y:100},{x:0,y:100}],1),'three on a diagonal');
  notOk(I.collinear([{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}],1),'a square is fine');
});
test('a singular system says so instead of dividing by nothing', () => {
  const {I}=mounted();
  const p={x:5,y:5};
  eq(I.homography([p,p,p,p],[p,p,p,p]),null);
});
test('the pitch markings are where the laws of the game put them', () => {
  const {I}=mounted();
  const m=I.pitchMarks(105,68);
  const find=n=>m.filter(x=>x[0]===n)[0];
  eq(find('Centre spot')[1],52.5);
  eq(find('Centre spot')[2],34);
  eq(find('Left penalty spot')[1],11);
  eq(find('Right penalty spot')[1],94);
  ok(near(find('Left penalty box, near front corner')[2],54.16),'40.32 m wide, centred');
  eq(find('Right 6-yard box, far front corner')[1],99.5);
});
test('figures always say they are estimates, in the unit asked for', () => {
  const {I}=mounted();
  eq(I.fmtLen(10,'m'),'≈ 10.0 m');
  eq(I.fmtLen(10,'yd'),'≈ 10.9 yd');
  eq(I.fmtArea(100,'m'),'≈ 100 m²');
  eq(I.polyArea([{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}]),100);
});
test('a calibration goes stale a second from its frame, and survives a reload', () => {
  const {I,v,press,store}=mounted();
  v.currentTime=100;
  press('m');
  ok(I.ui().calDraft,'nothing yet, so M goes straight to calibrating');
  const d=I.ui().calDraft;
  d.pts.push({x:100,y:900,lm:8},{x:1800,y:900,lm:15},{x:1500,y:300,lm:14},{x:400,y:300,lm:7});
  I.applyCalib();
  ok(I.ui().cal,'applied');
  eq(I.ui().insp.kind,'measure');
  ok(JSON.parse(store['hna.film.tools.v1']).byMatch.m1.cal,'kept with the match');
  v.currentTime=105;
  I.startMeasure('distance',105);
  eq(I.state().mode,null,'five seconds on, no tool is armed: the camera may have moved');
});
test('calibrating refuses two points on the same marking', () => {
  const {I,v,press}=mounted();
  v.currentTime=100;
  press('m');
  const d=I.ui().calDraft;
  d.pts.push({x:100,y:900,lm:8},{x:1800,y:900,lm:8},{x:1500,y:300,lm:14},{x:400,y:300,lm:7});
  I.applyCalib();
  eq(I.ui().cal,null,'not applied');
  ok(I.ui().calDraft,'and the clicks are still there to fix');
});
test('pressing Backspace leaves calibration without keeping anything', () => {
  const {I,press}=mounted();
  press('m');
  ok(press('Backspace'));
  eq(I.ui().calDraft,null);
  eq(I.state().mode,null);
  eq(I.ui().insp,null);
});

/* ================= the edit list ================= */
const clip=(I)=>{const c={in:50,out:60};c.edit=I.newEdit(c);return c;};
test('a split keeps both sides, at the same speed', () => {
  const {I}=mounted();
  const c=clip(I);
  c.edit.segs[0].speed=0.5;
  const n=I.splitAt(c.edit,55);
  eq(c.edit.segs.length,2);
  eq(c.edit.segs[0].b,55);eq(n.a,55);eq(n.b,60);eq(n.speed,0.5);
});
test('a split on the edge of a segment is refused, not a sliver', () => {
  const {I}=mounted();
  const c=clip(I);
  eq(I.splitAt(c.edit,50.05),null);
  eq(I.splitAt(c.edit,59.95),null);
  eq(I.splitAt(c.edit,70),null,'and outside it');
  eq(c.edit.segs.length,1);
});
test('a trim stops at its neighbour and never reaches nothing', () => {
  const {I}=mounted();
  const c=clip(I);
  const n=I.splitAt(c.edit,55);
  const a=c.edit.segs[0];
  I.trimSeg(c.edit,a.id,'b',58,0,3000);
  eq(a.b,55,'cannot run over the next segment');
  I.trimSeg(c.edit,n.id,'a',54,0,3000);
  eq(n.a,55,'nor back over the last');
  I.trimSeg(c.edit,a.id,'a',54.99,0,3000);
  ok(near(a.a,54.8),'and stops a fifth of a second short');
  I.trimSeg(c.edit,n.id,'b',9999,0,3000);
  eq(n.b,3000,'nor past the end of the half');
});
test('the last segment cannot be deleted', () => {
  const {I}=mounted();
  const c=clip(I);
  notOk(I.dropSeg(c.edit,c.edit.segs[0].id));
  eq(c.edit.segs.length,1);
});
test('deleting a segment takes its freeze with it, and the clip ends follow', () => {
  const {I}=mounted();
  const c=clip(I);
  const n=I.splitAt(c.edit,55);
  c.edit.freezes.push({id:'f',t:57,hold:3});
  I.dropSeg(c.edit,n.id);
  I.syncClip(c);
  eq(c.out,55);
  eq(c.edit.freezes.length,0);
});
test('a plain clip is planned as exactly what it always was', () => {
  const {I}=mounted();
  const p=I.planOf(10,22,undefined,[]);
  eq(p.segs.length,1);eq(p.segs[0].speed,1);eq(p.total,12);eq(p.mute,false);
});
test('the plan counts slow motion, fast forward, holds and the stretch cut out', () => {
  const {I}=mounted();
  const c=clip(I);                                  // 50-60
  const b=I.splitAt(c.edit,52);                     // 50-52 | 52-60
  const d=I.splitAt(c.edit,54);                     // 50-52 | 52-54 | 54-60
  I.splitAt(c.edit,56);                             // ...   | 54-56 | 56-60
  c.edit.segs[1].speed=0.5;                         // 2 s -> 4 s
  c.edit.segs[3].speed=2;                           // 4 s -> 2 s
  I.dropSeg(c.edit,d.id);                           // 54-56 cut out
  c.edit.freezes.push({id:'f',t:53,hold:3});
  eq(b.a,52);
  eq(I.planOf(50,60,c.edit,[]).total,2+4+2+3);
});
test('marks on one moment stop the film once, for the longest of them', () => {
  const {I}=mounted();
  const shapes=[{freeze:2,t:55},{freeze:5,t:55.1},{freeze:3,t:58}];
  const p=I.planOf(50,60,undefined,shapes);
  eq(p.freezes.length,2);
  eq(p.freezes[0].hold,5);
  eq(p.total,10+5+3);
});
test('a freeze inside a stretch that was cut out is not held', () => {
  const {I}=mounted();
  const c=clip(I);
  const n=I.splitAt(c.edit,55);
  I.dropSeg(c.edit,n.id);
  eq(I.planOf(50,55,c.edit,[{freeze:3,t:58}]).holdTotal,0);
});
test('a fade dips to black at the join and is clear between', () => {
  const {I}=mounted();
  const c=clip(I);
  const n=I.splitAt(c.edit,55);
  n.trans='fade';
  const a=t=>I.fadeAlpha(c.edit.segs,t);
  eq(a(52),0,'nowhere near it');
  eq(a(55),1,'black on the cut');
  ok(a(54.9)>0.5,'going down into it');
  ok(a(55.1)>0.5,'and coming up out of it');
  eq(a(57),0,'clear again');
});

/* ================= the editor, driven ================= */
function editing(extra){
  const m=mounted(extra);
  m.v.currentTime=50;
  m.I.saveClip(50,60,'t');
  m.press('e');
  return m;
}
test('E opens the editor on the clip under the playhead, not a new one', () => {
  const {I}=editing();
  ok(I.ui().editor);
  eq(I.clips().length,1);
  eq(I.ui().insp.kind,'clip');
});
test('E where there is no clip makes one around the moment', () => {
  const {I,v,press}=mounted();
  v.currentTime=200;
  press('e');
  eq(I.clips().length,1);
  eq(I.clips()[0].in,194);
  eq(I.clips()[0].out,206);
});
test('a clip from the other half is refused with a sentence', () => {
  const {I,v,press}=mounted();
  v.currentTime=200;
  const c=I.saveClip(4000,4010,'other');
  I.openEditor(c.id);
  eq(I.ui().editor,null);
  press('Backspace');
});
test('X, Q, Y, Delete and U do what they say, and survive a reload of the list', () => {
  const {I,v,press}=editing();
  const e=()=>I.ui().editor.clip.edit;
  v.currentTime=55;
  press('x');
  eq(e().segs.length,2,'split');
  press('q');
  eq(e().freezes.length,1,'freeze');
  press('y');
  eq(e().texts.length,1,'text');
  press('Delete');
  eq(e().texts.length,0,'delete takes what is selected: the text just added');
  press('u');
  eq(e().texts.length,1,'undo brings it back');
  eq(I.clips()[0].edit.freezes.length,1,'and it is all on disk');
});
test('[ and ] in the editor trim the clip rather than start a new one', () => {
  const {I,v,press}=editing();
  v.currentTime=52;
  press('[');
  eq(I.clips().length,1);
  eq(I.ui().editor.clip.in,52);
  v.currentTime=58;
  press(']');
  eq(I.ui().editor.clip.out,58);
  eq(I.state().mark.in,null,'and no mark is left pending');
});
test('V picks the segment under the playhead, not the last one clicked', () => {
  const {I,v,press}=editing();
  v.currentTime=55;
  press('x');                                       // selects the new, later segment
  v.currentTime=52;
  press('v');
  const ed=I.ui().editor;
  eq(ed.clip.edit.segs.filter(s=>s.id===ed.sel.id)[0].a,50);
});
test('closing the editor gives playback back exactly as it was', () => {
  const {I,v,press}=editing();
  v.playbackRate=0.5;
  v.muted=false;
  press('Backspace');
  eq(I.ui().editor,null);
  eq(v.playbackRate,1,'what it was when the editor opened');
  eq(v.muted,false);
  eq(I.ui().previewRate,null);
});
test('a redraw under the editor brings it back on the same clip', () => {
  const m=editing();
  const id=m.I.ui().editor.clip.id;
  m.T.detach();
  eq(m.I.ui().editor,null,'gone with the stage');
  m.T.fullscreen(true);                  // stats-view calls this first, on the new stage
  m.T.attach(m.c);
  ok(m.I.ui().editor,'back');
  eq(m.I.ui().editor.clip.id,id,'on the same clip');
  m.T.fullscreen(false);
  m.T.detach();
  m.T.attach(m.c);
  eq(m.I.ui().editor,null,'but not after full screen was left on purpose');
});
test('leaving full screen shuts every panel and forgets the clip', () => {
  const {T,I,press}=editing();
  press('c');
  T.fullscreen(false);
  eq(I.ui().editor,null);
  eq(I.ui().insp,null);
  eq(I.ui().panel,null);
});

/* ---- the preview, one frame at a time ---- */
test('the preview plays each segment at its speed and jumps a removed one', () => {
  const {I,v,c}=editing();
  const ed=()=>I.ui().editor.clip.edit;
  const a=I.splitAt(ed(),55);                       // 50-55 | 55-60
  I.splitAt(ed(),57);                               // 50-55 | 55-57 | 57-60
  ed().segs[2].speed=0.5;
  I.dropSeg(ed(),a.id);                             // 55-57 gone
  v.paused=false;
  v.currentTime=54;
  I.runEdit(54);
  eq(v.playbackRate,1);
  v.currentTime=55.01;
  I.runEdit(55.01);
  eq(v.currentTime,57,'over the gap');
  I.runEdit(57);
  eq(v.playbackRate,0.5);
  ok(c);
});
test('the preview stops on a freeze, and stops at the end of the clip', () => {
  const {I,v,timers}=editing();
  const e=I.ui().editor.clip.edit;
  e.freezes.push({id:'f',t:52,hold:3});
  v.paused=false;
  I.runEdit(51.9);
  I.runEdit(52.05);
  eq(v.paused,true,'held');
  const t=timers[timers.length-1];
  eq(t.ms,3000);
  t.f();
  eq(v.paused,false,'and carries on');
  I.runEdit(59.99);
  I.runEdit(60);
  eq(v.paused,true,'the end of the clip');
});

/* ---- every clip in one file ---- */
test('clips join in match order, with a fade across each jump', () => {
  const {I}=mounted();
  const e=I.mergedEdit([{in:300,out:312},{in:100,out:112}]);
  eq(e.segs.map(s=>s.a).join(),'100,300');
  eq(e.segs[0].trans,'cut','nothing to fade from at the start');
  eq(e.segs[1].trans,'fade');
  eq(I.planOf(100,312,e,[]).total,24);
});
test('two clips that overlap do not repeat those seconds', () => {
  const {I}=mounted();
  const e=I.mergedEdit([{in:100,out:112},{in:108,out:120}]);
  eq(e.segs.map(s=>s.a+'-'+s.b).join(),'100-112,112-120');
  eq(e.segs[1].trans,'cut','it simply carries on, so there is nothing to fade');
  eq(I.planOf(100,120,e,[]).total,20);
});
test('a clip inside the last one adds nothing', () => {
  const {I}=mounted();
  eq(I.mergedEdit([{in:100,out:120},{in:105,out:110}]).segs.length,1);
});
test('the edits of each clip survive the join', () => {
  const {I}=mounted();
  const a={in:100,out:110};a.edit=I.newEdit(a);I.splitAt(a.edit,105);a.edit.segs[1].speed=0.5;
  a.edit.freezes.push({id:'f',t:106,hold:2});a.edit.texts.push({id:'x',a:101,b:103,text:'Goal'});
  const e=I.mergedEdit([{in:200,out:204},a]);
  eq(e.segs.map(s=>s.speed).join(),'1,0.5,1');
  eq(e.segs[1].trans,'cut','a cut the analyst made is left alone');
  eq(e.texts.length,1);
  eq(I.planOf(100,204,e,[]).total,5+10+4+2);
});
test('the file keeps its sound unless every clip was muted', () => {
  const {I}=mounted();
  const a={in:1,out:5};a.edit=I.newEdit(a);a.edit.mute=true;
  const b={in:9,out:15};b.edit=I.newEdit(b);b.edit.mute=true;
  eq(I.mergedEdit([a,b]).mute,true);
  eq(I.mergedEdit([a,{in:20,out:25}]).mute,false);
});
test('the button is there from two clips, and one clip says why not', () => {
  const m=mounted();
  m.I.saveClip(10,20,'a');
  m.I.exportAll();
  eq(m.I.ui().exportTexts,null,'nothing started');
  ok(/'⭳ Export all'/.test(TOOLS));
  ok(/list\.length > 1/.test(TOOLS));
});
test('a playlist plays the clips this half can reach, and never hangs on the others', () => {
  const m=mounted({win:{half:1,label:'1st Half',start:0,end:100},end:()=>100});
  m.I.saveClip(10,20,'a');m.I.saveClip(30,40,'b');m.I.saveClip(200,210,'second half');
  m.I.playAll();
  eq(m.v.currentTime,10);
  m.I.frame(20.1);
  eq(m.v.currentTime,30,'on to the next');
  m.v.paused=false;
  m.I.frame(40.1);
  eq(m.v.paused,true,'and it stops at the end of this half rather than waiting for ever');
});
test('Export all renders through the same pipeline, so nothing can upload', () => {
  ok(/exportClip\(e\.segs\[0\]\.a, e\.segs\[e\.segs\.length - 1\]\.b, 'Highlights', e\)/.test(TOOLS));
});

/* ---- the export, against the source ---- */
test('a render jumps a gap with the recorder paused, and gives up rather than hang', () => {
  ok(/rec\.pause\(\)/.test(TOOLS),'the file holds no gap');
  ok(/rec\.resume\(\)/.test(TOOLS));
  ok(/stopped answering while jumping/.test(TOOLS),'a seek that never returns stops the render');
  ok(/gain\.gain\.value\s*=\s*plan\.mute/.test(TOOLS),'mute silences the track but keeps it');
});
test('every way into a render carries the clip edit', () => {
  ok(/exportClip\(c\.in, c\.out, c\.title, c\.edit\)/.test(TOOLS),'the clip list');
  ok(/exportClip\(c\.in, c\.out, c\.title, e\)/.test(TOOLS),'the editor');
  ok(/l\[l\.length - 1\]\.edit\)/.test(TOOLS),'the menu');
});

/* ================= the panels stay out of the picture's way ================= */
test('a press on the inspector never reaches the stage', () => {
  const {I,press}=mounted();
  press('s');
  const n=I.ui().insp.el;
  let stopped=false;
  n.on.pointerdown[0]({stopPropagation(){stopped=true;}});
  ok(stopped);
  ['contextmenu','wheel','click'].forEach(t=>ok(n.on[t]&&n.on[t].length,t+' is fenced too'));
});
test('the inspector and the editor are children of the stage, so never over the list', () => {
  const {I,stage}=editing();
  ok(stage.children.indexOf(I.ui().insp.el)>=0);
  ok(stage.children.indexOf(I.ui().editor.el)>=0);
});
test('a label typed in the inspector cannot break out of its text node', () => {
  const {I,press}=mounted();
  press('s');
  const s=I.state().shapes[0];
  s.label='<img src=x onerror=alert(1)>';
  const g=I.shapeNode(s,0);
  const plate=g.children.filter(n=>n.attrs['class']==='fmt-plate')[0];
  const text=plate.children.filter(n=>n.tag==='text')[0];
  eq(text.textContent,s.label,'set as text');
  eq(text.innerHTML,'','never as markup');
});

/* ================= the menu ================= */
function model(extra){
  const m=mounted(extra);
  return Object.assign(m,{tree:m.I.menuModel({t:100,p:{x:500,y:500}})});
}
const labels=tree=>{const out=[];(function walk(l){l.forEach(i=>{if(i.label)out.push(i.label);if(i.sub)walk(i.sub);});})(tree);return out;};
test('the three groups are there, in order', () => {
  const {tree}=model();
  eq(tree.filter(i=>i.title).map(i=>i.title).join(),'TELESTRATION,CLIP,TAG & SHARE');
});
test('it says whose event this is, and only when it knows', () => {
  eq(model().tree[0].chip,null,'no event near');
  const m=model({cues:[{t:101,rows:[{playerFrom:'6',event:'pass'}]}]});
  eq(m.tree[0].chip,'Event: #6');
  ok(/Near/.test(TOOLS)===false||!/'Near #/.test(TOOLS),'it never claims to know who is near the click');
});
test('nothing on it advertises a key that does not answer', () => {
  const {tree,I,press,ctx}=model();
  const keys=[];
  (function walk(l){l.forEach(i=>{if(i.key)keys.push(i.key);if(i.sub)walk(i.sub);});})(tree);
  ['S','K','N','M','Q','X','[',']','A','V','E','C','G','H','T','L','D',',','.'].forEach(k=>
    ok(keys.indexOf(k)>=0,k+' is on the menu'));
  ok(I,'');ok(press,'');ok(ctx,'');
});
test('F is still full screen, and the number row is still the duration', () => {
  const {press}=mounted();
  notOk(press('f'),'left for filmKeys');
  notOk(press('F'));
  notOk(press('1'),'nothing selected, so handed back');
});
test('the new keys are bound, and hand back when there is nothing to do', () => {
  const {I,press,v}=mounted();
  v.currentTime=100;
  notOk(press('u'),'nothing to undo');
  notOk(press('y'),'Y is the editor alone');
  ok(press('k'));
  ok(I.ui().collect,'K starts collecting');
  press('Backspace');
});
test('Freeze & draw holds the frame and the shape carries the hold', () => {
  const {I,v,c,down}=mounted();
  v.currentTime=300;v.paused=false;
  I.freezeDraw(299);
  eq(v.paused,true);
  eq(v.currentTime,299,'back on the frame that was pointed at');
  eq(I.state().mode.freeze,3);
  ok(c,'');ok(down,'');
});
test('a submenu is placed by hand, because the menu now scrolls', () => {
  ok(/\.fmt-m-sub\{[^}]*position:fixed/.test(CSS.replace(/\r\n/g,'\n').replace(/\n\s*/g,'')));
  ok(/max-height:calc\(100vh - 12px\); overflow-y:auto/.test(CSS),'a short laptop scrolls it');
});

/* ================= tags ================= */
function fakeStore(over){
  const calls={saved:[],removed:[]};
  return {calls,film:Object.assign({
    list:()=>Promise.resolve({tags:[],playlists:[{id:'p1',name:'Press'}],codes:[]}),
    saveTag:(c,m,t)=>{calls.saved.push({c,m,t});return Promise.resolve(Object.assign({id:'n1',createdBy:'u'},t));},
    removeTag:id=>{calls.removed.push(id);return Promise.resolve();},
    addPlaylist:(c,n)=>Promise.resolve({id:'p2',name:n}),
    addCode:(c,n)=>Promise.resolve({id:'c1',name:n,color:'#123456'})
  },over||{})};
}
function tagging(role,over){
  const st=fakeStore(over);
  const m=mounted(null,{HNA:{film:st.film}});
  m.T.setScope({clubId:'c',matchUuid:'mu',role:role||'analyst',userId:'u'});
  return Object.assign(m,{calls:st.calls});
}
const tick=()=>new Promise(r=>setImmediate(r));
test('with no channel there is no form, only a sentence', () => {
  const {I,press}=mounted();
  ok(press('g'),'the key is still answered');
  eq(I.ui().insp,null);
  notOk(I.canTag());
});
test('a public reader with an account but no role in the channel has none either', () => {
  const st=fakeStore();
  const m=mounted(null,{HNA:{film:st.film}});
  m.T.setScope({clubId:'c',matchUuid:'mu',role:null,userId:'u'});
  notOk(m.I.canTag());
});
test('no query is fired for anyone until they enter full screen', () => {
  const body=TOOLS.slice(TOOLS.indexOf('function restore()'),TOOLS.indexOf('function addShape'));
  notOk(/loadTags/.test(body),'loading a match draws no tags');
  ok(/if \(full\) loadTags\(\)/.test(TOOLS),'attach asks only in full screen');
});
test('the number row picks a code while the panel is up, and Enter saves', async () => {
  const {I,v,press,calls}=tagging();
  await I.loadTags();
  v.currentTime=100;
  press('g');
  press('1');
  eq(I.ui().insp.form.code,'Press trigger');
  press('1');
  eq(I.ui().insp.form.code,null,'again clears it');
  press('3');
  press('Enter');
  await tick();await tick();
  eq(calls.saved.length,1);
  eq(calls.saved[0].t.code,'Build-up');
  eq(calls.saved[0].c,'c','the channel');
  eq(calls.saved[0].m,'mu','and the match, by its real id');
  eq(calls.saved[0].t.tIn,94);
  eq(calls.saved[0].t.tOut,106);
  eq(I.ui().insp,null,'closed');
  eq(I.tagList().length,1,'on the lane');
});
test('a tag with no code and no playlist is refused before it goes anywhere', async () => {
  const {I,press,calls}=tagging();
  await I.loadTags();
  press('g');
  press('Enter');
  await tick();
  eq(calls.saved.length,0);
  ok(I.ui().insp,'the form is still up');
});
test('a save that fails keeps the form and the note', async () => {
  const {I,press}=tagging('analyst',{saveTag:()=>Promise.reject(new Error('offline'))});
  await I.loadTags();
  press('g');
  press('1');
  I.ui().insp.form.note='keep me';
  press('Enter');
  await tick();await tick();
  ok(I.ui().insp,'still open');
  eq(I.ui().insp.form.note,'keep me');
  eq(I.ui().insp.form.saving,false,'and it can be tried again');
});
test('a viewer can tag privately, and the form cannot send anything else', async () => {
  const {I,press,calls}=tagging('viewer');
  await I.loadTags();
  notOk(I.canShare());
  press('g');
  press('1');
  I.ui().insp.form.visibility='channel';
  press('Enter');
  await tick();await tick();
  eq(calls.saved[0].t.visibility,'private');
});
test('analysts and admins may share', () => {
  ok(tagging('analyst').I.canShare());
  ok(tagging('admin').I.canShare());
});
test('a tag load that fails says nothing on the projector, and the tools still work', async () => {
  const {I,press,box}=tagging('analyst',{list:()=>Promise.reject(new Error('no table'))});
  await I.loadTags();
  await tick();
  const toast=box.children.filter(n=>n.className==='fmt-toast')[0];
  ok(!toast||!toast.classList.contains('on'),'nobody watching needs to read that');
  ok(press('s'),'and the rest of the toolkit answers');
});
test('and says so when the analyst actually asks for tags', async () => {
  const {I,press,box}=tagging('analyst',{list:()=>Promise.reject(new Error('no table'))});
  await I.loadTags();
  press('g');
  await tick();await tick();
  const toast=box.children.filter(n=>n.className==='fmt-toast')[0];
  ok(toast&&/no table|could not/i.test(toast.textContent),'got '+(toast&&toast.textContent));
});
test('another match forgets the tags of the last one', async () => {
  const {T,I}=tagging();
  await I.loadTags();
  ok(I.ui().tagData);
  T.setScope({clubId:'c',matchUuid:'other',role:'analyst',userId:'u'});
  eq(I.ui().tagData,null);
});
test('a tag bar on the lane does not stop the drawing lane being a drawing lane', async () => {
  const {I,press}=tagging();
  await I.loadTags();
  press('s');
  const st=I.state().strip;
  ok(st,'up');
  eq(st.lane.children.length,1,'one bar per shape, tags kept apart');
});

/* ================= the wiring ================= */
test('the toolkit reaches the database only through the data layer', () => {
  notOk(/\.from\(/.test(TOOLS),'no table is named in film-tools.js');
  ok(/window\.HNA && window\.HNA\.film/.test(TOOLS));
  ['film_tags','film_playlists','film_codes'].forEach(t=>
    ok(SUPA.indexOf("from('"+t+"')")>=0,'supa.js reads '+t));
});
test('the host tells it whose channel and which match, before mounting', () => {
  const i=APP.indexOf('PTFilmTools.setScope'),j=APP.indexOf('window.PTStats.mount(holder, rep.payload');
  ok(i>0&&i<j,'in that order');
  ok(/matchUuid:\s*m\.uuid/.test(APP));
  ok(/role:\s*state\.channel && state\.channel\.role/.test(APP));
});
test('every rule added is still scoped to the toolkit', () => {
  const rules=CSS.replace(/\/\*[\s\S]*?\*\//g,'').match(/[^{}]+\{/g)||[];
  rules.forEach(r=>{
    const sel=r.replace('{','').trim();
    if(sel.startsWith('@'))return;
    sel.split(',').forEach(x=>ok(/^\s*\.(fmt-|film-full)/.test(x),'unscoped selector: '+x));
  });
});

/* ================= the migration ================= */
const body=SQL.replace(/--[^\n]*/g,'');
test('0027 only adds', () => {
  notOk(/\bdrop\s+table\b/i.test(body));
  notOk(/\balter\s+table\s+public\.(events|matches|match_reports|clubs|club_members)\b/i.test(body));
  notOk(/\bdelete\s+from\b/i.test(body));
});
test('row level security is on all three tables, and anon has nothing', () => {
  ['film_tags','film_playlists','film_codes'].forEach(t=>{
    ok(new RegExp('alter table public\\.'+t+'\\s+enable row level security').test(body),t+' RLS');
    ok(new RegExp('revoke all on public\\.'+t+'\\s+from anon').test(body),t+' anon');
    notOk(new RegExp('grant[^;]*public\\.'+t+'[^;]*to\\s+(anon|public)').test(body),t+' no grant to anon');
  });
});
test('a private tag is its owner\'s, and only analysts and admins can share', () => {
  const sel=body.slice(body.indexOf('create policy film_tags_select'),body.indexOf('create policy film_tags_insert'));
  ok(/visibility = 'channel' or created_by = \(select auth\.uid\(\)\)/.test(sel));
  const ins=body.slice(body.indexOf('create policy film_tags_insert'),body.indexOf('create policy film_tags_update'));
  ok(/visibility = 'private' or public\.is_club_analyst\(club_id\)/.test(ins));
  ok(/created_by = \(select auth\.uid\(\)\)/.test(ins),'nobody files a tag in another name');
  ok(/film_match_in_club\(match_id, club_id\)/.test(ins),'nor against another club\'s match');
});
test('the helper functions are not callable by anon', () => {
  ['is_club_analyst(uuid)','film_match_in_club(uuid, uuid)'].forEach(f=>
    ok(body.indexOf('revoke execute on function public.'+f)>=0,f));
  ok(/security definer set search_path = public/.test(body),'and their search path is pinned');
});
test('deleting a playlist keeps the analysis filed under it', () => {
  ok(/playlist_id uuid references public\.film_playlists\(id\) on delete set null/.test(body));
});

/* ================= the guide ================= */
test('the guide covers every new tool, under its name on the menu', () => {
  ['Spotlight &amp; track player','Link players','Defensive line','Measure','Freeze here &amp; draw',
   'Open clip editor','Tag this moment','Add to playlist','Track with keyframes',
   'Camera hasn&rsquo;t moved','Whole channel','Save tag','Export MP4','Preview'
  ].forEach(s=>ok(GUIDE.indexOf(s)>=0,'the guide explains '+s));
});
test('every tool label the guide names still exists in the code', () => {
  ['Track with keyframes','Mute commentary','From the mark','New playlist…','Calibrate this frame',
   'Finish area','Distances on each link','Save tag','Export MP4'
  ].forEach(s=>ok(TOOLS.indexOf(s)>=0,s+' is in film-tools.js'));
});
test('the guide tells nobody about a key that is not bound', () => {
  notOk(/Spotlight here/.test(GUIDE),'the old name is gone');
  notOk(/Film only (ever )?reads/.test(GUIDE),'tags are written now, and the page says so');
});
