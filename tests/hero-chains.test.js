/* The landing page's hero board.

   It is a shop window for the tagging app, so what it shows has to be
   something the app could actually have produced. Three ways it can quietly
   stop being that, all of them found by reading the board rather than the code:

     • an event name the dictionary does not have,
     • two events in one entry booking the SAME metric — "#shot on target
       #goal" reads fine and is wrong, because a goal already counts itself as
       a total shot and a shot on target, so the table would show two attempts
       for one ball,
     • a dot that is not a touch: the app puts one dot per number in the entry,
       in order, plus one more when the entry ends with a failed pass.

   The chains are lifted out of client/index.html and checked against the real
   dictionary and the real EVENT_INC, so a change to either is picked up here
   rather than on the live site. */
const {test,eq,ok,notOk}=require('./tiny-test');
const {readSrc}=require('./harness');

const LANDING=readSrc('client/index.html');
const SHARED=readSrc('shared.js');
const EVENTS=JSON.parse(readSrc('pitchtagger_events.json'));

const DICT=new Set(EVENTS.football.map(e=>e.name));

/* the board's possessions, as data */
const CHAINS=(function(){
  const at=LANDING.indexOf('var CHAINS = [');
  const end=LANDING.indexOf('var LEG_MS',at);
  ok(at>-1&&end>at,'the chains are in the page');
  const body=LANDING.slice(at,end).replace('var CHAINS =','').trim().replace(/;\s*$/,'');
  return eval('('+body+')');   // eslint-disable-line no-eval
})();

/* shared.js's own event -> metric map, read rather than copied */
const EVENT_INC=(function(){
  const at=SHARED.indexOf('const EVENT_INC={');
  const end=SHARED.indexOf('\n};',at);
  ok(at>-1&&end>at,'EVENT_INC is in shared.js');
  return eval('('+SHARED.slice(at+'const EVENT_INC='.length,end+2)+')');   // eslint-disable-line no-eval
})();

const entries=()=>CHAINS.flatMap(c=>c.entries);
const names=en=>en.ev.map(e=>e.replace(/^#/,''));

test('every event on the board is one the dictionary really has', () => {
  entries().forEach(en=>names(en).forEach(n=>
    ok(DICT.has(n),'"'+n+'" is in pitchtagger_events.json')));
});

test('no entry books the same metric twice', () => {
  // this is the one that caught "#shot on target #goal": goal -> totalShots,
  // shotsOn and shot on target -> totalShots, shotsOn, so one attempt would
  // land in the table as two
  entries().forEach(en=>{
    const seen=new Map();
    names(en).forEach(n=>(EVENT_INC[n]||[]).forEach(metric=>{
      const first=seen.get(metric);
      notOk(first,'"'+en.ev.join(' ')+'" books '+metric+' twice ('+first+' and '+n+')');
      seen.set(metric,n);
    }));
  });
});

test('a goal is tagged as a goal, on its own', () => {
  const goals=entries().filter(en=>names(en).includes('goal'));
  ok(goals.length>0,'the board scores at least once');
  goals.forEach(en=>eq(en.ev.length,1,'a goal needs no shot event beside it'));
});

test('the ball before a goal is an assist, before a shot it is a key pass', () => {
  CHAINS.forEach(c=>{
    const scored=c.entries.some(en=>names(en).includes('goal'));
    c.entries.forEach(en=>{
      if(names(en).includes('assist')) ok(scored,'an assist only exists in a possession that scored');
      if(names(en).includes('key pass')) notOk(scored,'the pass that produced a goal is the assist, not a key pass');
    });
    // and never both on the one ball
    c.entries.forEach(en=>notOk(names(en).includes('assist')&&names(en).includes('key pass'),
      'one delivery is either the assist or the key pass'));
  });
});

test('a dot is a touch: one per number in the entry, in order', () => {
  CHAINS.forEach((c,ci)=>{
    c.entries.forEach(en=>{
      ok(c.touches[en.from],'possession '+(ci+1)+': the player on the ball has a dot');
      const fails=names(en).some(n=>n==='pass fail'||n==='cross fail');
      const succeeds=names(en).some(n=>n==='pass success'||n==='cross success');
      if(succeeds) ok(c.touches[en.to],'a successful pass names its receiver, and that receiver has a dot');
      // NEEDS_RECEIVER / TRAILING_EXTRA_DOT in index.html: a failed pass reaches
      // nobody, so it takes the extra dot instead of a receiver
      if(fails){
        notOk(en.to!=null,'a failed pass names no receiver');
        ok(en.dead&&typeof en.dead.x==='number','it takes the extra dot, where the ball was lost');
      }
    });
  });
});

test('a shirt is not a place — the same number is recorded at several', () => {
  const spots={};
  CHAINS.forEach(c=>c.touches.forEach(d=>{
    (spots[d.n]=spots[d.n]||new Set()).add(d.x+','+d.y);
  }));
  const many=Object.keys(spots).filter(n=>spots[n].size>1);
  ok(many.length>=2,'at least two shirts touch the ball in more than one place '+
     '(otherwise the board is a formation drawing, which is not what we record)');
});

test('a carry is the same player twice, not a pass', () => {
  CHAINS.forEach(c=>c.entries.forEach(en=>{
    if(!en.carry)return;
    const [a,b]=en.carry;
    eq(c.touches[a].n,c.touches[b].n,'a carry is one player at two dots');
    notOk(c.touches[a].x===c.touches[b].x&&c.touches[a].y===c.touches[b].y,'and the two dots are apart');
    eq(en.from,b,'the entry is played from the second of them');
    ok(names(en).includes('step in'),'which is what a step in is');
  }));
});
