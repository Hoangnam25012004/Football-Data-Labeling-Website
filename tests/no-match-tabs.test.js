/* Stats and Player lists belong to ONE match — and to nothing at all when none is open.

   Reported: with no match ever opened, the Stats tab showed a full formation, both squads
   named, for a match the user had not touched. The stores those pages read (rows, meta,
   lineups) are shared by every tab and by every match this browser has ever opened, so
   what was on screen was simply the last match anyone had looked at.

   The lineups store carries a stamp saying which match its copy belongs to, and
   Player-Lists had always checked it before trusting the copy. Stats never did: it called
   loadLineups() flat, on load and again on every storage event. That is the bug.

   Two defences, and this file guards both:
     1. Stats reads a stored squad only when the stamp names the match that is open, and
        shows a notice instead of the last match's leftovers when there is no match;
     2. the main tab does not offer the trip at all — both buttons are disabled until a
        match is open, so the pages are not reached by accident in the first place. */
const fs=require('fs'), path=require('path'), vm=require('vm');
const {test,eq,ok,notOk,deepEq}=require('./tiny-test');
const {grabConst,SHARED,STATS,SRC}=require('./harness');

const ROOT=path.join(__dirname,'..');

/* localStorage stand-in seeded the way the real one looks after a match has been open */
function store(seed){
  const map=new Map(Object.entries(seed||{}));
  return {getItem:k=>map.has(k)?map.get(k):null,setItem(k,v){map.set(k,String(v));},removeItem(k){map.delete(k);}};
}
const SQUAD={home:{roster:[{no:'9',name:'Nazon'}],xi:[{no:'9',x:50,y:50,pos:'ST'}],subs:[],dir:'lr'},
             away:{roster:[{no:'14',name:'Elva'}],xi:[{no:'14',x:50,y:50,pos:'ST'}],subs:[],dir:'rl'}};
const seed=(stampedFor,openMatch)=>({
  'pitchtagger.lineups.v1':JSON.stringify(SQUAD),
  'pitchtagger.lineups.match.v1':stampedFor,
  'pitchtagger.meta.v1':JSON.stringify({home:'Hanley Town',away:'Gornal',matchId:openMatch})
});

/* what Stats now uses in place of a bare loadLineups() */
function statsLineups(seeded){
  const ctx={console,document:{getElementById:()=>null},location:{hash:''},localStorage:store(seeded)};
  vm.createContext(ctx);
  vm.runInContext([SHARED,grabConst('ourLineups',STATS,'Stats/index.html'),
                   ';globalThis.out=ourLineups();'].join('\n'),ctx,{filename:'stats-ourLineups.js'});
  return ctx.out;
}
const empty=l=>!l.home.xi.length&&!l.away.xi.length&&!l.home.roster.length;

/* ================= the bug itself ================= */
test('no match open: the last match\'s squad is not borrowed', () => {
  // exactly the reported state — a squad in the store, stamped for a match, none open
  ok(empty(statsLineups(seed('match-1',null))),'nothing to draw a formation from');
});

test('a different match\'s squad is not borrowed either', () => {
  ok(empty(statsLineups(seed('match-1','match-2'))),'the stamp has to name the open match');
});

test('the open match\'s own squad is still used', () => {
  const lu=statsLineups(seed('match-1','match-1'));
  deepEq(lu.home.xi,SQUAD.home.xi,'home XI comes through');
  eq(lu.away.roster[0].name,'Elva','and the away roster');
});

test('an unstamped store is not trusted on the strength of there being one', () => {
  const s=seed('match-1','match-1'); delete s['pitchtagger.lineups.match.v1'];
  ok(empty(statsLineups(s)),'no stamp, no claim on the open match');
});

/* ================= Stats says so, rather than showing leftovers ================= */
const statsSrc=fs.readFileSync(path.join(ROOT,'Stats','index.html'),'utf8');

test('Stats shows a notice instead of another match\'s numbers', () => {
  ok(/id="noMatchMsg"/.test(statsSrc),'the notice exists');
  const render=/function renderStats\(\)\{[\s\S]*?\n\}/.exec(statsSrc)[0];
  ok(/const open=!!meta\.matchId/.test(render),'decided by whether a match is open');
  ok(/noMatchMsg'\)\.style\.display=open\?'none':'block'/.test(render),'shown when it is not');
  ok(/stats-wrap'\)\.style\.display=open\?'':'none'/.test(render),'and the tables hidden');
  ok(/if\(!open\)return/.test(render),'nothing below it runs');
});

test('every route into the squad goes through the stamp check', () => {
  // load, a meta change (the match itself changing), and a lineups write
  notOk(/=loadLineups\(\)/.test(statsSrc.replace(/const ourLineups=[^\n]*\n/,'')),
        'no bare loadLineups() left anywhere in the page');
  ok(/PT_KEYS\.lineups\|\|e\.key===PT_KEYS\.lineupsMatch/.test(statsSrc),
     'the stamp landing on its own re-reads too — it is written before the squad');
  ok(/PT_KEYS\.meta\)\{meta=loadMeta\(\);lineups=ourLineups\(\)/.test(statsSrc),
     'and a match change re-reads the squad with it');
});

/* ================= the main tab does not offer the trip ================= */
test('every match-bound button is shut until a match is open', () => {
  const fn=/function updateMatchGate\(\)\{[\s\S]*?\n\}/.exec(SRC)[0];
  const list=grabConst('GATED_BTNS');
  ok(/const open=!!state\.teamIds\.matchId/.test(fn),'open means a match id, nothing looser');
  // stats and squads belong to a match; so do the video it is tagged against and that
  // video's mapping onto the match clock
  ['statsBtn','lineupBtn','videoBtn','durBtn'].forEach(id=>ok(list.includes(id),id+' is gated'));
  ok(/b\.disabled=!open/.test(fn),'disabled, so the click cannot happen at all');
  ok(/Open a match first/.test(fn),'and it says why on hover');
  // the buttons that do not depend on a match must stay alone
  ['eventBtn','popBtn','cloudBtn','otherBtn','signOutBtn'].forEach(id=>notOk(list.includes(id),id+' is left alone'));
});

test('the panel behind the video is a viewport, not an uploader', () => {
  // a local file dropped over a shared match would quietly replace its video_url
  notOk(/drop\.onclick/.test(SRC),'clicking it no longer opens the file picker');
  notOk(/drop\.addEventListener\('drop',e=>loadFile/.test(SRC),'and a dropped file is not loaded');
  // …but the drop is still swallowed, or the browser navigates away from the app to the file
  ok(/\['dragover','dragenter','dragleave','drop'\][\s\S]{0,90}preventDefault/.test(SRC),
     'every drag event is still prevented');
  // 🎞 Video keeps its own local-file route, which is the only way in now
  ok(/\$\('vidLocalPick'\)\.onclick=\(\)=>fileInput\.click\(\)/.test(SRC),'the modal still picks a local file');
  ok(/fileInput\.onchange=e=>loadFile/.test(SRC),'and that route still loads it');
});

test('the placeholder says which of the two states you are in', () => {
  const fn=/function updateMatchGate\(\)\{[\s\S]*?\n\}/.exec(SRC)[0];
  ok(/dropHint/.test(fn)&&/Use 🎞 Video to load one/.test(fn),'points at the button when a match is open');
  ok(/hint\.textContent=open\?/.test(fn),'and at ☁ Cloud when there is none');
  notOk(/Click or drag &amp; drop a video/.test(SRC),'the old "drag & drop" invitation is gone');
});

test('it runs at every point the open match can change', () => {
  ok(/function setMatchTeams\([\s\S]*?updateMatchGate\(\)[\s\S]*?\n\}/.test(SRC),
     'when a match is opened');
  ok(/\nupdateMatchGate\(\);/.test(SRC),'and on load, where a bare URL clears the match');
  // the boot path that clears it must come first, or the gate would read the old state
  ok(SRC.indexOf('state.teamIds={home:null,away:null,matchId:null,code:null}')
     < SRC.lastIndexOf('updateMatchGate();'),'after the no-#match reset, not before');
});

test('the buttons still carry the match when there is one', () => {
  // subPageUrl is what puts #match= on the sub-page URL — untouched by the gate
  ok(/window\.open\(subPageUrl\('Stats'\)/.test(SRC));
  ok(/window\.open\(subPageUrl\('Player-Lists'\)/.test(SRC));
});
