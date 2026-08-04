/* The goal mouth on the shooting maps.

   A shot on target or a goal now carries gXY — where the ball crossed the line, normalised
   to the mouth (x 0 = left post -> 100 = right post, y 0 = crossbar -> 100 = the goal line).
   Both shooting maps draw that beside the pitch, so the pair reads as "struck from here,
   ended up there": the Stats tab labels the markers with the shirt number, the printed
   report with the shot's number, which is the same number as its row in the Event List.

   It needs no mirroring for half or attacking direction — unlike pXY it is already in the
   goal's own frame, not the pitch's. */
const fs=require('fs'), path=require('path'), vm=require('vm');
const {loadShared,grabFunction,grabConst}=require('./harness');
const {test,eq,deepEq,ok,notOk}=require('./tiny-test');

const S=loadShared();
const G=S.GOAL_MAP;
const ROOT=path.join(__dirname,'..');
const STATS=fs.readFileSync(path.join(ROOT,'Stats','index.html'),'utf8');
const REPORT=fs.readFileSync(path.join(ROOT,'Stats','report.js'),'utf8');

/* ================= the drawing ================= */
test('a marker lands where its gXY says, in the mouth', () => {
  const at=(x,y)=>{
    const m=/<circle cx="([\d.]+)" cy="([\d.]+)"/.exec(
      S.goalMouthSVG([{x,y,label:'9',color:'#39d98a'}]));
    return [+m[1],+m[2]];
  };
  deepEq(at(0,0),[G.x,G.y],'top-left is the crossbar meeting the left post');
  deepEq(at(100,0),[G.x+G.mw,G.y],'top-right');
  deepEq(at(0,100),[G.x,G.y+G.mh],'bottom-left, on the goal line');
  deepEq(at(100,100),[G.x+G.mw,G.y+G.mh],'bottom-right');
  deepEq(at(50,50),[G.x+G.mw/2,G.y+G.mh/2],'and the middle is the middle');
});

test('the frame, the net and the goal line are all drawn', () => {
  const svg=S.goalMouthSVG([]);
  ok(/^<svg /.test(svg)&&svg.includes('viewBox="0 0 '+G.w+' '+G.h+'"'),'one svg');
  eq((svg.match(/<line/g)||[]).length,15+7+1,'15 uprights, 7 crosses, and the goal line');
  ok(/<path d="M [\d.-]+ [\d.]+ V [\d.-]+ H [\d.]+ V [\d.]+"/.test(svg),'posts and crossbar in one path');
  ok(/stroke-linejoin="round"/.test(svg),'with rounded corners, like the tagging one');
  notOk(/<circle|<rect/.test(svg),'and nothing in it when nothing was placed');
});

test('the mouth is a goal shape, not a square', () => {
  ok(G.mw/G.mh>2.5&&G.mw/G.mh<3.5,'about 3:1 — '+(G.mw/G.mh).toFixed(2));
});

test('it themes for the dark tab and the light report', () => {
  const dark=S.goalMouthSVG([{x:50,y:50,label:'1',color:'#39d98a'}],{ink:'#06281a'});
  const light=S.goalMouthSVG([{x:50,y:50,label:'1',color:'#39d98a'}],
    {net:'#c9cfd9',frame:'#98a0aa',ink:'#fff',ring:'#fff'});
  ok(dark.includes('#06281a')&&!dark.includes('#c9cfd9'),'dark keeps its own ink');
  ok(light.includes('#c9cfd9')&&light.includes('#98a0aa'),'light gets the printed palette');
});

test('a 2nd-half marker is a square, a 1st-half one a circle', () => {
  ok(/<circle/.test(S.goalMouthSVG([{x:20,y:30,label:'1',color:'#f7b32f'}])),'1st');
  ok(/<rect/.test(S.goalMouthSVG([{x:20,y:30,label:'1',color:'#f7b32f',square:true}])),'2nd');
});

test('the label is drawn on the marker', () => {
  const svg=S.goalMouthSVG([{x:10,y:10,label:7,color:'#39d98a'}]);
  ok(/>7<\/text>/.test(svg),'the number is there');
  eq((S.goalMouthSVG([{x:1,y:1,label:'',color:'#fff'}]).match(/<text/g)||[]).length,1,
     'an empty label still draws its marker');
});

/* ================= which shots get one ================= */
const R=(o)=>Object.assign({team:'home',event:'shot on target',t:1,playerFrom:'9',
  pXY:{x:80,y:50},gXY:{x:40,y:60}},o);

test('only shots that were placed in the goal appear', () => {
  const rows=[R(),R({event:'goal',gXY:{x:10,y:20}}),
              R({event:'shot off target',gXY:null}),   // never gets a spot
              R({event:'blocked shot',gXY:null}),
              R({event:'pass success',gXY:{x:5,y:5}}), // not a shot at all
              R({gXY:null})];                          // on target, but not placed
  const got=S.goalMarks(rows,'home',r=>({x:r.gXY.x,y:r.gXY.y,label:r.playerFrom,color:'#fff'}));
  eq(got.length,2,'the two placed shots, and nothing else');
  deepEq(got.map(m=>m.x),[40,10]);
});

test('a team only sees its own', () => {
  const rows=[R(),R({team:'away',gXY:{x:90,y:90}})];
  eq(S.goalMarks(rows,'home',r=>({x:r.gXY.x,y:r.gXY.y,color:'#fff'})).length,1);
  eq(S.goalMarks(rows,'away',r=>({x:r.gXY.x,y:r.gXY.y,color:'#fff'})).length,1);
  eq(S.goalMarks(rows,null,r=>({x:r.gXY.x,y:r.gXY.y,color:'#fff'})).length,2,'null = both');
});

test('the picker can drop a row by returning nothing', () => {
  const rows=[R({t:1}),R({t:2})];
  eq(S.goalMarks(rows,'home',r=>r.t===1?{x:0,y:0,color:'#fff'}:null).length,1,
     'which is how each map filters to its own half');
});

test('no rows at all is an empty goal, not a crash', () => {
  deepEq(S.goalMarks([],'home',r=>r),[]);
  deepEq(S.goalMarks(null,'home',r=>r),[]);
  ok(/^<svg /.test(S.goalMouthSVG(null)),'and it still draws the frame');
});

/* ================= the Stats tab ================= */
test('the Stats shooting map draws the goal above the pitch', () => {
  const fn=grabFunction('shotMapHTML',STATS,'Stats/index.html');
  ok(/goalMouthSVG\(gm,/.test(fn),'the goal is drawn');
  ok(/goalMarks\(rows,team,/.test(fn),'from the placed shots');
  ok(/eventHalf\(r\)===shotHalf/.test(fn),'of the half being shown');
  ok(/label:r\.playerFrom/.test(fn),'labelled with the shirt number, like the pitch dots');
  ok(/color:kinds\[r\.event\]/.test(fn),'and coloured by outcome, like them too');
  ok(fn.indexOf('${goal}')<fn.indexOf('shotmap-pitch'),'goal first, pitch under it');
  // the pitch map itself is untouched
  ok(/dirArrowSVG\(attackDir\(team,shotHalf\)\)\+dots/.test(fn),'the old dots still go on the pitch');
});

test('the goal card says when nothing has been placed', () => {
  const fn=grabFunction('shotMapHTML',STATS,'Stats/index.html');
  ok(/gm\.length\?'Where they crossed the line':'No shot placed in the goal yet'/.test(fn));
});

/* ================= the match report ================= */
// goalMarksV lifted out of report.js and run against stubs, as report-visuals.test.js does
function reportMarks(rows){
  const ctx={console,rows,eventHalf:r=>r.half||1,
    SHOT_KINDS:S.SHOT_KINDS,
    SHOT_MAP_COLORS:{'goal':'#f4b942','shot on target':'#38b76e'}};
  vm.createContext(ctx);
  vm.runInContext(grabFunction('goalMarksV',REPORT,'Stats/report.js'),ctx);
  return ctx.goalMarksV('home');
}

test('the report numbers a goal marker exactly as the pitch map numbers it', () => {
  // four shots in time order; the 2nd and 4th were placed in the goal
  const rows=[
    {team:'home',event:'shot off target',t:10,pXY:{x:1,y:1},gXY:null},
    {team:'home',event:'goal',t:20,pXY:{x:2,y:2},gXY:{x:15,y:35}},
    {team:'home',event:'blocked shot',t:30,pXY:{x:3,y:3},gXY:null},
    {team:'home',event:'shot on target',t:40,pXY:{x:4,y:4},gXY:{x:80,y:60},half:2}];
  const m=reportMarks(rows);
  deepEq(m.map(x=>x.label),[2,4],'the numbers they carry on the pitch and in the Event List');
  deepEq(m.map(x=>[x.x,x.y]),[[15,35],[80,60]]);
  eq(m[0].color,'#f4b942','a goal is gold');
  eq(m[1].color,'#38b76e','on target is green');
  notOk(m[0].square,'1st half is a circle');
  ok(m[1].square,'2nd half is a square, same as the pitch map');
});

test('the report keeps the shot order it always used', () => {
  const fnV=grabFunction('shotDotsV',REPORT,'Stats/report.js');
  const fnG=grabFunction('goalMarksV',REPORT,'Stats/report.js');
  const filt=/rows\.filter\(r=>r\.team===team&&SHOT_KINDS\.has\(r\.event\)&&r\.t!=null\)/;
  ok(filt.test(fnV)&&filt.test(fnG),'same filter');
  ok(/sort\(\(a,b\)=>a\.t-b\.t\)/.test(fnV)&&/sort\(\(a,b\)=>a\.t-b\.t\)/.test(fnG),'same order');
});

test('the report page puts the goal above the pitch, in the left column', () => {
  const fn=grabFunction('shotsAndGoalsPages',REPORT,'Stats/report.js');
  ok(/rp-goalmouth/.test(fn)&&/goalMouthSVG\(gm,/.test(fn),'drawn');
  ok(fn.indexOf('rp-goalmouth')<fn.indexOf('vPitchSVG'),'above the pitch');
  ok(/\.rp-goalmouth\{/.test(REPORT),'and it has a style');
  // the page's own furniture is untouched
  ok(/vPitchSVG\(vUpArrowSVG\(\)\+shotDotsV\(team\)\)/.test(fn),'the pitch map is as it was');
  ok(/const FIRST=25, CONT=33/.test(fn),'and the row counts that fit a page are unchanged');
});

/* ================= shipped ================= */
test('shared.js and report.js were cache-busted after being changed', () => {
  // both are edited here; without a bump returning users keep the old file and the goal
  // mouth is an undefined function
  const pl=fs.readFileSync(path.join(ROOT,'Player-Lists','index.html'),'utf8');
  const v=s=>(/shared\.js\?v=(\d+)/.exec(s)||[])[1];
  eq(v(STATS),v(pl),'both pages ask for the same shared.js');
  ok(+v(STATS)>=16,'and it was bumped past the version that had no goal mouth');
  ok(+(/report\.js\?v=(\d+)/.exec(STATS)||[])[1]>=28,'report.js too');
});
