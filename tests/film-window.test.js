/* Film — which halves there are to watch, worked out from the four Duration
   boundaries and nothing else.

   The rule this file exists to pin: a half is a window only when its PAIR makes
   one. h1Start is allowed to be 0 — a video that opens on the kick-off is the
   ordinary case, not a field somebody forgot — so testing the start on its own
   would silently hide the first half of every tightly-cut match.

   And when there are no boundaries at all the view must not go blank: one
   window over the whole file is still something to watch. */
const {grabFunction,grabConst,STATS}=require('./harness');
const {test,eq,ok,notOk}=require('./tiny-test');
const vm=require('vm');

const D=(o)=>Object.assign({enabled:true,halfLen:45,h1Start:0,h1End:0,h2Start:0,h2End:0},o);

function windows(dur){
  const ctx={console};
  vm.createContext(ctx);
  vm.runInContext(['var dur='+JSON.stringify(dur)+';',
    grabFunction('filmWindows',STATS,'Stats/stats-view.js'),
    ';globalThis.W=filmWindows();'].join('\n'),ctx,{filename:'film.js'});
  return ctx.W;
}

test('both halves set give two windows, in file time', () => {
  const w=windows(D({h1Start:312,h1End:3160,h2Start:4100,h2End:7025}));
  eq(w.length,2,'one per half');
  eq(w[0].half,1); eq(w[0].start,312); eq(w[0].end,3160);
  eq(w[1].half,2); eq(w[1].start,4100); eq(w[1].end,7025);
  eq(w[0].label,'1st Half'); eq(w[1].label,'2nd Half');
});

test('a video that opens on the kick-off still has a first half', () => {
  // h1Start 0 is a real boundary, not a missing one — the pair is what decides
  const w=windows(D({h1Start:0,h1End:2900,h2Start:3600,h2End:6500}));
  eq(w.length,2,'both halves survive a zero start');
  eq(w[0].start,0); eq(w[0].end,2900);
});

test('only the first half mapped gives one window, not a fallback', () => {
  const w=windows(D({h1Start:100,h1End:2900}));
  eq(w.length,1);
  eq(w[0].half,1,'the half that exists');
  notOk(w.some(x=>x.half===0),'no Full Match alongside a real half');
});

test('a second half with no end is not a window', () => {
  const w=windows(D({h1Start:100,h1End:2900,h2Start:3600,h2End:0}));
  eq(w.length,1,'the unfinished half is left out');
  eq(w[0].half,1);
});

test('boundaries that do not go forwards are not windows', () => {
  eq(windows(D({h1Start:500,h1End:500})).length,1,'equal pair is no half');
  eq(windows(D({h1Start:500,h1End:500}))[0].half,0,'…so it falls back');
  eq(windows(D({h1Start:900,h1End:300}))[0].half,0,'nor is a backwards pair');
});

test('with nothing mapped the whole file is the window', () => {
  const w=windows(D({}));
  eq(w.length,1);
  eq(w[0].half,0); eq(w[0].label,'Full Match'); eq(w[0].start,0);
  ok(!isFinite(w[0].end),'open-ended — the duration is not known until metadata loads');
});

test('the fallback does not depend on the Duration checkbox', () => {
  // `enabled` drives whether the Timeline column shows match time; the windows
  // are the boundaries themselves, so an unticked box with real boundaries in it
  // still carves the match into halves
  const w=windows(D({enabled:false,h1Start:312,h1End:3160,h2Start:4100,h2End:7025}));
  eq(w.length,2,'the boundaries are what count');
});

test('the step the arrow keys take is two seconds', () => {
  const ctx={console};
  vm.createContext(ctx);
  vm.runInContext(grabConst('FILM_STEP',STATS,'Stats/stats-view.js')
    +'\n;globalThis.S=FILM_STEP;',ctx,{filename:'film.js'});
  eq(ctx.S,2);
});
