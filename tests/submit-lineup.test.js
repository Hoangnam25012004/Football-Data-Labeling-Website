/* Player lists stopped sending the board over as it is arranged.

   Every tick, every changed shirt number, every dragged dot used to land in the store the
   tagging tab watches — so a squad being sorted out appeared on the tagging pitch halfway
   through being sorted out, one player at a time, and a mis-click reached the match row
   300ms later. The page now edits a DRAFT nobody else can see, and a side crosses over
   only when ⇪ Submit home / Submit away is pressed.

   Which makes one object into two, and the object was already shared: `lineups` holds the
   squads this page owns AND, on the same tree, the things the tagging tab owns — `history`
   (the formation snapshot every substitution and red card leaves behind) and `subHistory`
   (minutes played). A publish that carried a whole draft over would hand back a copy of
   those from whenever the page was opened, and the substitution tagged in the meantime
   would be gone. So a publish copies the four fields this page owns and re-reads the rest,
   there and then.

   And it carries one fact that cannot belong to a single side: attacking direction. Two
   teams cannot both attack the same goal, so submitting home is also a statement about
   away. Publishing one side's direction and leaving the other's is how the fixture ends up
   impossible — the bug attack-direction.test.js exists to keep out. So every publish turns
   BOTH sides, through the same faceTeam() that file already guards, which does nothing at
   all to a side already facing that way.

   publishTeam() is async only in its last line (the push to the match row); everything
   asserted below has already happened by the time it returns, and with no database wired
   up that push resolves at once. Hence the plain, synchronous calls.                    */
const path=require('path'), vm=require('vm');
const {test,eq,ok,notOk,deepEq}=require('./tiny-test');
const {grabFunction,grabConst,loadShared,readSrc,fakeStorage,SHARED}=require('./harness');

const WHERE='Player-Lists/index.html';
const PL=readSrc(path.join('Player-Lists','index.html'));
const S=loadShared();
const MATCH='match-1';
const LIVE='pitchtagger.lineups.v1', LIVE_STAMP='pitchtagger.lineups.match.v1';
const DRAFT='pitchtagger.lineups.draft.v1', DRAFT_STAMP='pitchtagger.lineups.draft.match.v1';

/* ---------- the fixture: two sides, each with a keeper and a wide player ----------
   Same shape attack-direction.test.js uses, and for the same reason: a right-back is the
   role a mirror gets wrong, and a keeper is the one you notice standing in the wrong box. */
const cell=(row,col)=>({x:(col+0.5)*100/6,y:S.PZ_ROW_TOP[row]+S.PZ_ROW_H[row]/2});
const GK=dir=>dir==='rl'?[1,5]:[1,0];
const RB=dir=>dir==='rl'?[0,4]:[2,1];
const dot=(no,rc,dir)=>{const c=cell(rc[0],rc[1]);
  return {no,x:c.x,y:c.y,pos:S.zoneAt(c.x,c.y,dir)};};
const side=(dir,tag)=>({
  roster:[{no:'1',name:tag+' One',pid:'p-'+tag+'-1'},{no:'9',name:tag+' Nine'},{no:'12',name:tag+' Twelve'}],
  xi:[dot('1',GK(dir),dir),dot('9',RB(dir),dir)],subs:['12'],dir});

/* What the tagging tab has: two squads, one side's minutes-played bookkeeping, and one
   formation snapshot per side — a substitution and a red card. */
function live(homeDir,awayDir){
  const l={home:side(homeDir||'lr','H'),away:side(awayDir||'rl','A')};
  l.home.subHistory=[{out:'9',in:'12',t:600}];
  l.history=[
    {t:600,team:'home',subs:['9'],label:'Substitution: 9▼ 12▲',
     xi:[dot('1',GK(l.home.dir),l.home.dir),dot('12',RB(l.home.dir),l.home.dir)]},
    {t:900,team:'away',subs:['12'],off:'9',label:'Red card: 9',
     offSpot:cell(RB(l.away.dir)[0],RB(l.away.dir)[1]),
     xi:[dot('1',GK(l.away.dir),l.away.dir)]}
  ];
  return l;
}
const copy=v=>JSON.parse(JSON.stringify(v));
const asDraft=l=>({home:{roster:copy(l.home.roster),xi:copy(l.home.xi),subs:copy(l.home.subs),dir:l.home.dir},
                   away:{roster:copy(l.away.roster),xi:copy(l.away.xi),subs:copy(l.away.subs),dir:l.away.dir}});

/* ---------- the page, lifted ----------
   shared.js underneath (the store helpers, the zone map, MAX_XI), then the page's own
   draft/publish code by name. Nothing is re-typed here: a rename on the page fails loudly
   as "not found" on the next run. */
const CONSTS=['LU_DRAFT','LU_DRAFT_MATCH','draftStamp','draftIsFor','clone','teamDraft',
              'draftOf','teamSig','teamDirty','dirtyTeams'];
const FUNCS=['teamLU','maxXI','setSaveStatus','loadDraft','saveDraftLS','save',
             'renderSubmitState','pushPublished','publishTeam','turnXI','faceTeam','luSwitchDir'];

function editor(opts){
  opts=opts||{};
  const published=opts.published||live();
  const draft=opts.draft||asDraft(published);
  const seed={};
  if(!opts.noLive){seed[LIVE]=JSON.stringify(published);seed[LIVE_STAMP]=opts.stamp||MATCH;}
  if(opts.draftStore){seed[DRAFT]=JSON.stringify(opts.draftStore);
                      seed[DRAFT_STAMP]=opts.draftStamp||MATCH;}
  const store=fakeStorage(seed), els={};
  const el=id=>els[id]||(els[id]={id,textContent:'',disabled:false,style:{},
    classList:{s:new Set(),
      toggle(c,on){if(on)this.s.add(c);else this.s.delete(c);},
      contains(c){return this.s.has(c);}},
    setAttribute(){}});
  const ctx={console,localStorage:store,store,els,el,
    document:{getElementById:el},location:{hash:''},
    renderLineup(){}};                       // the redraw every editor action ends on
  vm.createContext(ctx);
  vm.runInContext([
    SHARED,
    'var meta='+JSON.stringify({matchId:MATCH,sport:'football',home:'Home',away:'Away'})+';',
    'var luMatchId='+JSON.stringify(opts.luMatchId===undefined?MATCH:opts.luMatchId)+';',
    'var luReady='+(opts.luReady===false?'false':'true')+', sb=null, lineupTeam="home";',
    'var published='+JSON.stringify(published)+';',
    'var lineups='+JSON.stringify(draft)+';',
    CONSTS.map(n=>grabConst(n,PL,WHERE)).join('\n'),
    FUNCS.map(n=>grabFunction(n,PL,WHERE)).join('\n'),
    ';globalThis.C={'+CONSTS.join(',')+'};'
  ].join('\n'),ctx,{filename:'Player-Lists-submit.js'});
  return ctx;
}
/* Source counted without its prose: these comments name the very helpers being counted,
   and a mention in a comment is not a call. Only whole-line // comments are dropped, so a
   "https://" inside an attribute is left where it is. */
const strip=s=>s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^[ \t]*\/\/.*$/gm,'');
const count=(s,re)=>(s.match(re)||[]).length;
const stored=(ctx,k)=>{const s=ctx.store.snapshot()[k];return s==null?null:JSON.parse(s);};
const liveNow=ctx=>stored(ctx,LIVE);
// every dot a side owns — starting XI and its own snapshots alike, keyed so a role can be
// compared with itself across a turn
function dots(l,team){
  const out={};
  ((l[team]||{}).xi||[]).forEach(x=>{out['xi/'+x.no]=x;});
  (l.history||[]).filter(h=>h.team===team).forEach((h,i)=>
    (h.xi||[]).forEach(x=>{out['h'+i+'/'+x.no]=x;}));
  return out;
}

/* ================= T1-T2: nothing leaks out of the draft ================= */

test('save() writes the draft store, and never the one the tagging tab reads', () => {
  const ctx=editor();
  const before=ctx.store.snapshot()[LIVE];
  ctx.lineups.home.subs.push('7');
  ctx.save();
  const snap=ctx.store.snapshot();
  eq(snap[LIVE],before,'the live copy did not move');
  eq(snap[DRAFT_STAMP],MATCH,'the draft is stamped for this match');
  deepEq(JSON.parse(snap[DRAFT]).home.subs,['12','7'],'and it holds the edit');
  const w=ctx.store.writes.filter(k=>k.indexOf('draft')>=0);
  eq(w[0],DRAFT_STAMP,'the stamp lands before the draft, as it does for the live store');
});

test('save() refuses to write a draft it cannot vouch for', () => {
  // luReady false, or a copy belonging to another match — the old guard, unchanged
  notOk(editor({luReady:false}).store.snapshot()[DRAFT],'nothing written before the match row resolved');
  const other=editor({luMatchId:'match-2'});
  other.save();
  notOk(other.store.snapshot()[DRAFT],'nor for a copy belonging to another match');
});

test('publishTeam and the offline-adoption path are the only writers of the live store', () => {
  const save=grabFunction('save',PL,WHERE);
  notOk(/saveLineupsLS/.test(save),'save() no longer writes the shared store');
  notOk(/sb\.from/.test(save),'nor the match row');
  ok(/saveDraftLS\(\)/.test(save),'it writes the draft instead');
  // counted over code only: the comments name both helpers, and a mention is not a call
  const owners=strip(['publishTeam','loadMatchLineups'].map(n=>grabFunction(n,PL,WHERE)).join('\n'));
  eq(count(strip(PL),/saveLineupsLS\(/g),count(owners,/saveLineupsLS\(/g),
     'no third place writes the store the tagging tab reads');
  eq(count(strip(PL),/from\('matches'\)\.update/g),1,'one place pushes to the match row');
  ok(/from\('matches'\)\.update/.test(grabFunction('pushPublished',PL,WHERE)),'and it is pushPublished');
  notOk(/pushTimer/.test(PL),'the 300ms debounced push is gone with it');
});

/* ================= T3-T6: a publish sends one side and disturbs nothing else ============ */

test('publishing a side sends its squad and its board', () => {
  const ctx=editor();
  ctx.lineups.home.subs.push('7');
  ctx.lineups.home.roster.push({no:'7',name:'H Seven'});
  ctx.lineups.home.xi[1].x=12.5;
  ctx.publishTeam('home');
  const P=liveNow(ctx);
  ['roster','xi','subs','dir'].forEach(k=>
    deepEq(P.home[k],ctx.lineups.home[k],'home '+k+' crossed over'));
  deepEq(ctx.published.home.xi,P.home.xi,'and the page knows what it sent');
});

test('publishing home leaves away exactly as it was', () => {
  const ctx=editor();
  const before=copy(liveNow(ctx).away);
  ctx.lineups.away.subs.push('7');          // arranged, but not submitted
  ctx.lineups.away.xi[0].x=1;
  ctx.publishTeam('home');
  deepEq(liveNow(ctx).away,before,'not one field of the un-submitted side moved');
});

test('the snapshots and the minutes-played bookkeeping survive a publish', () => {
  const ctx=editor();
  const before=copy(liveNow(ctx));
  ctx.lineups.home.subs.push('7');
  ctx.publishTeam('home');
  const P=liveNow(ctx);
  deepEq(P.history,before.history,'history is the tagging tab’s, and it is untouched');
  deepEq(P.home.subHistory,before.home.subHistory,'so is subHistory');
  ctx.publishTeam('away');
  deepEq(liveNow(ctx).history,before.history,'the second side does not disturb it either');
  deepEq(liveNow(ctx).home.subHistory,before.home.subHistory);
});

test('a substitution tagged while the page was open survives the publish', () => {
  // the reason publishTeam re-reads the live copy instead of using the one it loaded with
  const ctx=editor();
  const later=liveNow(ctx);
  later.history.push({t:1500,team:'home',subs:[],label:'Substitution: 1▼ 12▲',
    xi:[dot('12',GK('lr'),'lr')]});
  later.home.subHistory.push({out:'1',in:'12',t:1500});
  ctx.store.setItem(LIVE,JSON.stringify(later));      // what the tagging tab just wrote
  ctx.lineups.home.subs.push('7');
  ctx.publishTeam('home');
  const P=liveNow(ctx);
  eq(P.history.length,3,'the snapshot tagged in the meantime is still there');
  eq(P.home.subHistory.length,2,'and so is its minutes-played entry');
  deepEq(P.home.subs,['12','7'],'while the submitted board still crossed over');
});

/* ================= T7-T10: attacking direction ================= */

test('after any publish the two sides are still attacking opposite ends', () => {
  const ctx=editor();
  for(let i=0;i<5;i++){
    if(i%2){ctx.lineupTeam=ctx.lineupTeam==='home'?'away':'home';ctx.luSwitchDir();}
    ctx.publishTeam(i%2?'away':'home');
    const P=liveNow(ctx);
    ok(P.home.dir!==P.away.dir,'publish '+(i+1)+': still opposites');
  }
});

test('a publish that does not change the direction moves not one dot', () => {
  const ctx=editor();
  const before=copy(liveNow(ctx));
  ctx.publishTeam('home');
  const P=liveNow(ctx);
  deepEq(P.away,before.away,'the other side is untouched');
  deepEq(P.history,before.history,'and so is every snapshot');
  deepEq(P.home.xi,before.home.xi,'this side too — nothing was arranged');
});

test('switching direction then publishing one side turns the other side with it', () => {
  const ctx=editor();
  const before=copy(liveNow(ctx));
  ctx.luSwitchDir();                        // pressed on the home board
  ctx.publishTeam('home');
  const P=liveNow(ctx);
  eq(P.home.dir,'rl','the side on screen turned');
  eq(P.away.dir,'lr','and the other side turned the other way');
  // exactly once, both axes — a mirror would leave y alone
  Object.entries(dots(P,'away')).forEach(([k,x])=>{
    eq(x.x,100-dots(before,'away')[k].x,'away '+k+': across the halfway line');
    eq(x.y,100-dots(before,'away')[k].y,'away '+k+': and across the middle of the pitch');
  });
  ['home','away'].forEach(t=>Object.entries(dots(P,t)).forEach(([k,x])=>
    eq(x.pos,S.zoneAt(x.x,x.y,P[t].dir),t+' '+k+': the position matches where the dot stands')));
  const spot=P.history[1].offSpot;
  eq(S.zoneAt(spot.x,spot.y,P.away.dir),'RB','the sent-off player would come back a right-back');
  deepEq(P.away.xi,ctx.lineups.away.xi,'and the draft agrees with what was published');
});

test('publishing twice, or publishing the second side after, turns nothing twice', () => {
  const ctx=editor();
  ctx.luSwitchDir();
  ctx.publishTeam('home');
  const after=copy(liveNow(ctx));
  ctx.publishTeam('home');
  deepEq(liveNow(ctx),after,'the same submit again changes not one byte');
  ctx.publishTeam('away');
  const P=liveNow(ctx);
  deepEq(P.history,after.history,'the other side’s submit does not turn the snapshots again');
  deepEq(P.away.xi,after.away.xi,'nor its dots');
  ok(P.home.dir!==P.away.dir,'still opposites');
});

test('a live copy with both sides facing the same way is repaired by the first publish', () => {
  // what the old switch could leave behind: home turned, away never told
  const ctx=editor({published:live('rl','rl')});
  ctx.publishTeam('home');
  const P=liveNow(ctx);
  ok(P.home.dir!==P.away.dir,'the impossible fixture is gone');
  eq(P.home.dir,'rl','the submitted side keeps the direction it was sent with');
});

/* ================= T11-T12: what a draft is, and whose it is ================= */

test('a draft carries the two sides and nothing the tagging tab owns', () => {
  const ctx=editor();
  ctx.save();
  const d=stored(ctx,DRAFT);
  notOk('history' in d,'no formation snapshots in the draft');
  ['home','away'].forEach(t=>{
    notOk('subHistory' in d[t],t+': no minutes-played bookkeeping either');
    deepEq(Object.keys(d[t]).sort(),['dir','roster','subs','xi'],t+': four fields, no more');
  });
  const seeded=ctx.C.draftOf(live());
  notOk('history' in seeded,'and draftOf() never puts one there');
});

test('switching direction on the draft leaves the live snapshots alone until submit', () => {
  const ctx=editor();
  const before=copy(liveNow(ctx));
  ctx.luSwitchDir();
  deepEq(liveNow(ctx),before,'the live copy has not heard about it yet');
  eq(ctx.lineups.home.dir,'rl','while the draft has turned');
  eq(ctx.lineups.away.dir,'lr','both sides of it');
  notOk(ctx.lineups.history,'and no snapshot was invented on the draft');
});

test('a draft belongs to one match, and another match’s is not adopted', () => {
  const mine=asDraft(live()); mine.home.subs.push('7');
  ok(editor({draftStore:mine}).C.draftIsFor(MATCH),'this match’s draft is claimed');
  const theirs=editor({draftStore:mine,draftStamp:'match-2'});
  notOk(theirs.C.draftIsFor(MATCH),'a draft stamped for another match is not');
  notOk(theirs.C.draftIsFor(null),'and no match means no claim at all');
  const fn=grabFunction('loadMatchLineups',PL,WHERE);
  ok(/lineups=\(draftIsFor\(id\)&&loadDraft\(\)\)\|\|draftOf\(published\)/.test(fn),
     'so the page falls back to a draft seeded from the published board');
  ok(/if\(!draftIsFor\(id\)\)\{lineups=draftOf\(published\);saveDraftLS\(\);\}/.test(fn),
     'and seeds it once the match row has resolved');
});

/* ================= T13-T15: what the user sees, and the offline route ================= */

test('the dot lights when the draft differs, and goes out when it is sent', () => {
  const ctx=editor();
  deepEq(ctx.C.dirtyTeams(),[],'a freshly seeded draft matches the tagging tab');
  ctx.lineups.home.xi[0].x+=20;
  deepEq(ctx.C.dirtyTeams(),['home'],'a moved dot is a change');
  ctx.publishTeam('home');
  deepEq(ctx.C.dirtyTeams(),[],'and sending it settles both sides');
  ctx.lineups.away.xi[0].x+=1e-4;
  deepEq(ctx.C.dirtyTeams(),[],'float noise from arrangeXI is not an edit');
  ctx.lineups.away.roster.reverse();
  deepEq(ctx.C.dirtyTeams(),[],'nor is re-sorting a table');
  ctx.lineups.away.subs.push('7');
  deepEq(ctx.C.dirtyTeams(),['away'],'a new substitute is');
  ctx.renderSubmitState();
  ok(ctx.el('luSubmitBtn').classList.contains('dirty'),'the button says so');
  ok(ctx.el('luSubmitAway').classList.contains('dirty'),'and the item that would fix it');
  notOk(ctx.el('luSubmitHome').classList.contains('dirty'),'the settled side is left plain');
  eq(ctx.el('luMarkAway').textContent,'2/11 · 2 subs · not sent','the tally is what would be sent');
});

test('the two menu items exist and are wired to the two publishes', () => {
  ok(/id="luSubmitHome"/.test(PL)&&/id="luSubmitAway"/.test(PL),'both items are there');
  ok(/Submit home<\/span>/.test(PL)&&/Submit away<\/span>/.test(PL),'labelled as asked');
  ok(/\$\('luSubmitHome'\)\.onclick=\(\)=>\{setSubmitOpen\(false\);publishTeam\('home'\);\}/.test(PL),
     'home sends home');
  ok(/\$\('luSubmitAway'\)\.onclick=\(\)=>\{setSubmitOpen\(false\);publishTeam\('away'\);\}/.test(PL),
     'away sends away');
  ok(/id="luSubmitMenu"/.test(PL)&&/lu-submit-menu/.test(PL),'hung off a menu, not two bare buttons');
  ok(/\.lu-submit-menu\.show\{display:block\}/.test(readSrc('shared.css')),'which has somewhere to get its styling');
});

test('publishing with no match open, or before the squad has loaded, writes nothing', () => {
  const ctx=editor({luReady:false});
  const before=ctx.store.snapshot()[LIVE];
  ctx.publishTeam('home');
  eq(ctx.store.snapshot()[LIVE],before,'the live copy is not touched by a page that is not ready');
  ok(/still loading/.test(ctx.el('saveStatus').textContent),'and it says why');
});

test('a squad entered offline still reaches the match row once it can', () => {
  // save() used to be what pushed it; it no longer reaches the cloud, so the adoption
  // path has to push for itself or the copy stays in this browser for good
  const fn=grabFunction('loadMatchLineups',PL,WHERE);
  ok(/if\(!\(cloud&&cloud\.home&&cloud\.away\)&&hadLocal\)pushPublished\(published,id,null\)/.test(fn),
     'the offline-adoption path pushes the published copy itself');
  notOk(/hadLocal\)save\(\)/.test(fn),'and no longer leans on save() to do it');
});
