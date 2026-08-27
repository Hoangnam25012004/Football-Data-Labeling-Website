/* Film's three filters, as slicers.

   They were three <select>s, which can only ever say ONE thing: one team, one
   player, one event. The question being asked of the film is regularly wider —
   "the back four", "shots and goals" — and a select cannot say it at all.

   So: a button that opens a panel of checkboxes and STAYS open while several are
   ticked. What this file guards is the state behind it (three lists, the empty
   one meaning all, with every-ticked normalised back to it), what the closed
   button says about that state, the markup the binder queries, and that the
   panel is bound, synced and let go of in the right places.

   The DOM here is a stub — this repo has no build step and no jsdom — so the
   markup contract is asserted against the real filmSlicerHTML output as well,
   or the stub and the page could drift apart without either failing. */
const {grabFunction,grabConst,STATS,SHARED,readSrc}=require('./harness');
const {test,eq,ok,notOk}=require('./tiny-test');
const vm=require('vm');

const F=n=>grabFunction(n,STATS,'Stats/stats-view.js');

/* ================= a stub DOM, only as wide as the selectors used ================= */
const SELS=['.fm-slicer','.fm-sl-btn','.fm-sl-panel','.fm-sl-lbl',
            '.fm-sl-opt input','.fm-sl-opt input[value]',
            // the group headings: a separate class on purpose, so neither of the
            // two selectors above can see them (see filmSlicerHTML)
            '.fm-sl-head input'];

function node(tag,cls,attrs){
  const n={tag:tag,cls:(cls||'').split(' ').filter(Boolean),dataset:{},attrs:attrs||{},
           children:[],parentNode:null,hidden:false,text:null,nodeType:1,
           style:{},rect:{top:0,bottom:0,left:0,right:0,width:0,height:0},
           overflowY:'visible',
           getBoundingClientRect(){return n.rect;},
           setAttribute(k,v){n.attrs[k]=v;},getAttribute(k){return n.attrs[k];}};
  n.classList={
    contains:c=>n.cls.indexOf(c)>=0,
    add(c){if(n.cls.indexOf(c)<0)n.cls.push(c);},
    remove(c){const i=n.cls.indexOf(c);if(i>=0)n.cls.splice(i,1);},
    toggle(c,force){force?n.classList.add(c):n.classList.remove(c);}
  };
  Object.defineProperty(n,'textContent',{
    get(){return n.text!=null?n.text:n.children.map(c=>c.textContent).join('');},
    set(v){n.text=v;n.children=[];}
  });
  n.add=function(kid){kid.parentNode=n;n.children.push(kid);return kid;};
  n.querySelectorAll=sel=>qsa(n,sel);
  n.querySelector=sel=>qsa(n,sel)[0]||null;
  n.closest=sel=>{let p=n;while(p){if(step(p,sel))return p;p=p.parentNode;}return null;};
  return n;
}
const step=(n,s)=>s==='input[value]'?(n.tag==='input'&&n.attrs.value!=null)
                 :s==='input'?n.tag==='input'
                 :n.cls.indexOf(s.slice(1))>=0;
function qsa(root,sel){
  if(SELS.indexOf(sel)<0)throw new Error('the stub does not know the selector '+sel);
  const parts=sel.split(' '), last=parts[parts.length-1], out=[];
  (function walk(n){n.children.forEach(k=>{
    let hit=step(k,last);
    for(let i=parts.length-2;i>=0&&hit;i--){
      let p=k.parentNode,found=false;
      while(p){if(step(p,parts[i])){found=true;break;}p=p.parentNode;}
      hit=found;
    }
    if(hit)out.push(k);
    walk(k);
  });})(root);
  return out;
}

/* The stub's shape IS filmSlicerHTML's shape — the contract test below is what
   keeps that true. `opts` is [[value,label,group?],…]; `sel` is what is picked.
   A group opens a heading, exactly as the real markup does when o.grp changes. */
function slicerEl(key,all,many,opts,sel){
  const sl=node('div','fm-slicer');
  sl.dataset.key=key; sl.dataset.all=all; sl.dataset.many=many;
  const btn=sl.add(node('button','fm-sl-btn'));
  const lbl=btn.add(node('span','fm-sl-lbl'));
  lbl.textContent=!sel.length?all:sel.length>1?sel.length+' '+many
    :((opts.filter(o=>o[0]===sel[0])[0]||[null,sel[0]])[1]);
  btn.add(node('span','fm-sl-mark'));
  const panel=sl.add(node('div','fm-sl-panel'));
  panel.hidden=true;
  const opt=(attrs,text,on)=>{
    const l=panel.add(node('label','fm-sl-opt'));
    const i=l.add(node('input',null,attrs));
    i.checked=on;
    if(attrs.value!=null)i.value=attrs.value;
    if(attrs['data-all'])i.dataset.all='1';
    if(attrs['data-grp'])i.dataset.grp=attrs['data-grp'];
    l.add(node('span','fm-sl-txt')).textContent=text;
    return i;
  };
  // a heading: .fm-sl-head, no value, ticked when every option under it is
  const head=(g,on)=>{
    const l=panel.add(node('label','fm-sl-head'));
    const i=l.add(node('input',null,{'data-grp':g}));
    i.checked=on; i.dataset.grp=g;
    l.add(node('span','fm-sl-gtxt')).textContent=g;
    return i;
  };
  opt({'data-all':'1'},all,!sel.length);
  opts.forEach((o,i)=>{
    const g=o[2];
    if(g&&(!i||opts[i-1][2]!==g))
      head(g,opts.filter(x=>x[2]===g).every(x=>sel.indexOf(x[0])>=0));
    opt(g?{value:o[0],'data-grp':g}:{value:o[0]},o[1],sel.indexOf(o[0])>=0);
  });
  return sl;
}

/* the three the page draws, over a filter, in one document */
function stage(filter){
  const doc=node('#document');
  doc.add(slicerEl('team','Both teams','teams',[['home','Rangers'],['away','Celtic']],filter.team));
  doc.add(slicerEl('player','All players','players',
    [['2','2'],['9','9'],['14','14']],filter.player));
  /* Four names over three groups, in the order filmEvCmp puts them, so the
     headings and the group ticks have something real to work on. `goal` stays
     first: the tests below reach for it by index. */
  doc.add(slicerEl('event','All events','events',
    [['goal','goal','Shooting'],['shot on target','shot on target','Shooting'],
     ['pass success','pass success','Distribution'],
     ['tackle success','tackle success','Defensive']],filter.event));
  return doc;
}

function sandbox(opts){
  opts=opts||{};
  const filter=Object.assign({team:[],player:[],event:[]},opts.filter||{});
  const doc=opts.doc===false?node('#document'):stage(filter);
  const body=node('body');
  doc.body=body; body.parentNode=doc;
  const ctx={console,document:doc,location:{hash:''},
             window:{innerHeight:opts.innerHeight==null?720:opts.innerHeight},
             getComputedStyle:n=>({overflowY:n.overflowY||'visible'}),
             localStorage:{getItem:()=>null,setItem(){}}};
  ctx.document.getElementById=()=>null;
  vm.createContext(ctx);
  vm.runInContext([
    SHARED,
    'var meta='+JSON.stringify(opts.meta||{home:'Rangers',away:'Celtic'})+';',
    'var filmFilter='+JSON.stringify(filter)+';',
    'var relists=0;',
    'function filmRelist(){relists++;}',
    /* the event filter's order — a table, a rank and a comparator. All three are
       arrow consts, so they come out with grabConst; grabFunction only matches
       `function name(`. They go in ABOVE filmSlicers, which now calls the
       comparator by name and would otherwise throw ReferenceError. */
    // in dependency order: the flat list is built from the groups
    grabConst('FILM_EV_GROUPS',STATS,'Stats/stats-view.js'),
    grabConst('FILM_EV_REST',STATS,'Stats/stats-view.js'),
    grabConst('FILM_EV_ORDER',STATS,'Stats/stats-view.js'),
    grabConst('filmEvRank',STATS,'Stats/stats-view.js'),
    grabConst('filmEvGroup',STATS,'Stats/stats-view.js'),
    grabConst('filmEvCmp',STATS,'Stats/stats-view.js'),
    F('filmSlicers'),F('filmSlicerLabel'),F('filmSlicerHTML'),
    grabConst('FILM_SL_MAX',STATS,'Stats/stats-view.js'),
    F('filmSlicerFit'),F('filmSlicerOpen'),F('filmSyncSlicer'),
    F('filmBindSlicers'),F('filmDocClick'),
    ';globalThis.P={filmSlicers,filmSlicerLabel,filmSlicerHTML,filmSlicerOpen,',
    '  filmSlicerFit,filmSyncSlicer,filmBindSlicers,filmDocClick,doc:document,',
    '  MAX:FILM_SL_MAX,MIN:FILM_SL_MIN,ORDER:FILM_EV_ORDER,evRank:filmEvRank,',
    '  GROUPS:FILM_EV_GROUPS,REST:FILM_EV_REST,evGroup:filmEvGroup,',
    '  filter:()=>filmFilter,relists:()=>relists};'
  ].join('\n'),ctx,{filename:'film-slicers.js'});
  return ctx.P;
}

const CHOICES={players:['2','9','14'],events:['goal','pass success']};
const byKey=(P,k)=>P.filmSlicers(CHOICES).filter(s=>s.key===k)[0];
const sl=(P,k)=>P.doc.querySelectorAll('.fm-slicer').filter(s=>s.dataset.key===k)[0];
const boxes=el=>el.querySelectorAll('.fm-sl-opt input');
const label=el=>el.querySelector('.fm-sl-lbl').textContent;
const open=el=>el.classList.contains('open');
// tick or untick as a person would: the browser flips it, then fires change
const click=(box,on)=>{box.checked=on;box.onchange();};

/* ================= what the three are made of ================= */
test('the team slicer offers the two sides by name, and nothing else', () => {
  const s=byKey(sandbox(),'team');
  eq(s.all,'Both teams');
  eq(s.opts.map(o=>o.v).join(','),'home,away');
  eq(s.opts.map(o=>o.lbl).join(','),'Rangers,Celtic','the clubs, not "home" and "away"');
});

test('a side with no name still has something to click', () => {
  const s=byKey(sandbox({meta:{home:'',away:''}}),'team');
  eq(s.opts.map(o=>o.lbl).join(','),'Home,Away');
});

test('players and events are the half own, in the order they are read in', () => {
  const P=sandbox();
  eq(byKey(P,'player').opts.map(o=>o.v).join(','),'2,9,14','numerically, not "14" before "2"');
  eq(byKey(P,'event').opts.map(o=>o.v).join(','),'goal,pass success',
     'shooting before distribution — not alphabetically, which agreed here by accident');
});

/* ================= the order the event filter is read in =================

   Shooting · Distribution · Defensive · Other · Body part: shared.js's own
   PLAYER_CATS — the four tabs the player table has always been read in — with
   BODY_PARTS after them.

   A–Z was the old answer. It sat `block` (a defensive stop) next to
   `blocked shot` (an attempt), two characters apart; it left `goal` between
   `free-kick` and `goal kick`; and it printed `pass fail` before `pass success`.
   The filter is used to build a themed playlist, so a set that belongs together
   has to READ together. What follows is that pair, and the four other things
   A–Z got wrong, plus the two properties nothing may cost us: every name still
   offered, and every value still exactly as it was tagged. */
const evOrder=(P,list)=>P.filmSlicers({players:[],events:list})
  .filter(s=>s.key==='event')[0].opts.map(o=>o.v).join(',');

test('the five groups come out in order, whatever order they went in', () => {
  eq(evOrder(sandbox(),['head','foul','tackle success','cross fail','shot on target']),
     'shot on target,cross fail,tackle success,foul,head',
     'shooting, distribution, defensive, other, body part');
});

test('block is defensive, blocked shot is a shot — the pair A-Z put side by side', () => {
  eq(evOrder(sandbox(),['block','blocked shot']),'blocked shot,block');
});

test('inside a group: the column order of PLAYER_CATS, success before failure', () => {
  const P=sandbox();
  eq(evOrder(P,['pass fail','pass success']),'pass success,pass fail');
  eq(evOrder(P,['miss shot','goal','key pass']),'goal,key pass,miss shot');
  eq(evOrder(P,['aerial duel fail','recovery','tackle success']),
     'tackle success,recovery,aerial duel fail');
  eq(evOrder(P,['free-kick','yellow card','corner-kick','save']),
     'corner-kick,free-kick,save,yellow card','set pieces, then the keeper, then the card');
});

test('body parts come last, in the order a shot is read in', () => {
  eq(evOrder(sandbox(),['head','lower body','right foot','upper body','left foot','goal']),
     'goal,right foot,left foot,upper body,head,lower body');
});

test('a name the table never heard of is still offered — last, and A-Z with its kind', () => {
  const P=sandbox();
  eq(evOrder(P,['zzz custom','goal']),'goal,zzz custom');
  eq(evOrder(P,['whistle','apple','goal']),'goal,apple,whistle',
     'the unknown bucket has an order of its own');
});

test('capitalisation ranks the same, and the VALUE is left exactly as tagged', () => {
  const P=sandbox();
  eq(evOrder(P,['pass success','Goal']),'Goal,pass success','ranked through evKey');
  eq(evOrder(P,['throw-Ins','goal']),'goal,throw-Ins','the tagger spelling ranks as a throw-in');
  /* One rank, so the raw strings break the tie and "Goal" lands first (G < g in
     UTF-16). WHICH of the two comes first does not matter; that both are still
     offered, and next to each other, does — filmMatches compares the value to
     r.event exactly, so merging them would drop a filter the data can answer. */
  eq(evOrder(P,['goal','Goal']),'Goal,goal',
     'two spellings are two filter values: both stay, side by side');
});

/* The pick carried in from the other half by union() is sorted with everything
   else rather than appended, or a filter set in the first half would sit at the
   bottom of the second half's panel. */
test('a pick carried in from the other half is ranked, not appended', () => {
  const P=sandbox({filter:{event:['goal']}});
  eq(evOrder(P,['pass success','tackle success']),'goal,pass success,tackle success');
});

test('nothing is added, dropped or merged — only the order moves', () => {
  const list=['head','block','goal','zzz','pass fail','save','Goal','right foot',
              'interception','key pass','cross success','offside'];
  const out=evOrder(sandbox(),list).split(',');
  eq(out.length,list.length,'same count');
  eq(out.slice().sort().join(','),list.slice().sort().join(','),'same set');
});

test('the order is decided rather than incidental: sorting it again changes nothing', () => {
  const P=sandbox();
  const once=evOrder(P,['zzz','goal','Goal','head','block','pass fail']);
  eq(evOrder(P,once.split(',')),once);
});

test('every name in the table is lower case and appears once', () => {
  const P=sandbox(), seen={};
  P.ORDER.forEach(n=>{
    eq(n,String(n).trim().toLowerCase(),n+': the lookup goes through evKey, so the table is lower case');
    notOk(seen[n],n+' is in the table twice'); seen[n]=1;
  });
  eq(P.evRank('Goal'),0,'the first name of the table is goal');
  eq(P.evRank('no such event'),P.ORDER.length,'and an unknown one ranks past the end');
});

/* Both call sites, asserted against the source: filmChoices sorts the half's own
   names and filmSlicers sorts them again after union() has added the carried-in
   picks. One of the two left on a bare .sort() would be a second answer to
   "how are events ordered" sitting in the same file. */
test('both call sites sort with the comparator, not with A-Z', () => {
  ok(/events:Object\.keys\(events\)\.sort\(filmEvCmp\)/.test(STATS),'filmChoices');
  ok(/union\(choices\.events,picked\('event'\)\)\.sort\(filmEvCmp\)/.test(STATS),'filmSlicers');
});

/* ================= the headings, and the tick that takes a whole group =========

   The order alone still leaves five runs with nothing between them, and an
   analyst building "chance creation" still ticking four boxes one at a time. A
   heading names each run and IS the tick that takes it.

   The safety argument is one line of markup: .fm-sl-head, never .fm-sl-opt, and
   no `value`. Three things count the options off this panel — the "everything
   ticked is nothing ticked" threshold (`.fm-sl-opt input[value]`), the tick
   binder and the re-sync (`.fm-sl-opt input`) — and a heading answering any of
   them would be an option nobody can pick, with the threshold left one short
   forever. The last three tests here are that argument, measured. */
const evSlicer=(P,list)=>P.filmSlicers({players:[],events:list})
  .filter(s=>s.key==='event')[0];
const evHTML=(P,list)=>P.filmSlicerHTML(evSlicer(P,list));
const gtxt=html=>(html.match(/<span class="fm-sl-gtxt">[^<]*<\/span>/g)||[])
  .map(s=>s.replace(/<[^>]*>/g,''));
const heads=el=>el.querySelectorAll('.fm-sl-head input');

test('each run gets a heading, in the order the groups are read in', () => {
  eq(gtxt(evHTML(sandbox(),['head','foul','tackle success','cross fail','shot on target']))
     .join(','),'Shooting,Distribution,Defensive,Other,Body part');
});

test('one heading per run, not one per option', () => {
  const html=evHTML(sandbox(),['goal','shot on target','blocked shot']);
  eq((html.match(/fm-sl-head/g)||[]).length,1,'three shots under one Shooting');
  eq(gtxt(html).join(','),'Shooting');
});

test('names the table never heard of get a heading of their own, at the end', () => {
  const P=sandbox();
  eq(gtxt(evHTML(P,['goal','zzz custom','apple'])).join(','),'Shooting,'+P.REST);
  eq(P.evGroup('zzz custom'),P.REST);
  eq(P.evGroup('GOAL'),'Shooting','through evKey, like the rank');
  eq(P.evGroup('take-on succes'),'Distribution','and through the alias with it');
});

test('the other two slicers get no headings — there is nothing to group', () => {
  const P=sandbox();
  ok(P.filmSlicerHTML(byKey(P,'player')).indexOf('fm-sl-head')<0,'shirt numbers');
  ok(P.filmSlicerHTML(byKey(P,'team')).indexOf('fm-sl-head')<0,'two sides');
});

test('the markup: a heading label, a group tick with no value, and grouped options', () => {
  const html=evHTML(sandbox(),['goal','pass success']);
  ok(/<label class="fm-sl-head"><input type="checkbox" data-grp="Shooting">/.test(html),
     'the heading input carries a group and no value at all');
  ok(html.indexOf('<span class="fm-sl-gtxt">Shooting</span>')>=0,'and the name of the run');
  ok(html.indexOf('<input type="checkbox" value="goal" data-grp="Shooting">')>=0,
     'each option says which run it is in, so the group tick can find it');
});

test('a heading is ticked exactly when everything under it is', () => {
  const on=sandbox({filter:{event:['goal','shot on target']}});
  const html=evHTML(on,['goal','shot on target','pass success']);
  ok(/data-grp="Shooting" checked/.test(html),'both of Shooting picked');
  ok(/data-grp="Distribution">/.test(html),'the run with an unpicked option is not');
  const none=sandbox();
  ok(!/data-grp="[^"]*" checked/.test(evHTML(none,['goal','pass success'])),
     'and with nothing picked at all — which is what All means — no heading is');
});

test('one tick on a heading takes the whole group', () => {
  const P=sandbox(); P.filmBindSlicers();
  const el=sl(P,'event');
  click(heads(el)[0],true);
  eq(P.filter().event.join(','),'goal,shot on target','both shooting names at once');
  eq(label(el),'2 events','the button counts them');
  eq(P.relists(),1,'and the list is redrawn once, not twice');
});

test('unticking a heading takes only its own run back out', () => {
  const P=sandbox({filter:{event:['goal','shot on target','pass success']}});
  P.filmBindSlicers();
  const el=sl(P,'event');
  click(heads(el)[0],false);
  eq(P.filter().event.join(','),'pass success','the other run is left alone');
});

test('a group is ADDED to what is already picked, the same as a single box', () => {
  const P=sandbox({filter:{event:['pass success']}}); P.filmBindSlicers();
  click(heads(sl(P,'event'))[0],true);
  eq(P.filter().event.join(','),'pass success,goal,shot on target');
});

test('taking every group is normalised back to All, like taking every box', () => {
  const P=sandbox(); P.filmBindSlicers();
  const el=sl(P,'event');
  heads(el).forEach(g=>click(g,true));
  eq(P.filter().event.length,0,'everything ticked is nothing ticked');
  eq(label(el),'All events');
  ok(boxes(el)[0].checked,'and All is ticked back');
});

test('ticking the last box of a run by hand lights its heading, and out again', () => {
  const P=sandbox(); P.filmBindSlicers();
  const el=sl(P,'event');
  click(boxes(el)[1],true);                       // goal
  notOk(heads(el)[0].checked,'one of the two is not the run');
  click(boxes(el)[2],true);                       // shot on target
  ok(heads(el)[0].checked,'both of the two is');
  click(boxes(el)[1],false);
  notOk(heads(el)[0].checked,'and taking one back out puts it out');
});

/* The three counts the binder lives by, over a panel that now has headings in it.
   If a heading ever answered one of these selectors, the number here would move
   and the test below it would stop being reachable. */
test('a heading is invisible to every selector the binder counts options with', () => {
  const el=sl(sandbox(),'event');
  eq(el.querySelectorAll('.fm-sl-opt input[value]').length,4,'four options — the threshold');
  eq(el.querySelectorAll('.fm-sl-opt input').length,5,'plus All — the tick binder');
  eq(heads(el).length,3,'and three headings, counted by neither');
});

test('the threshold is still reachable by hand: every option ticked is All', () => {
  const P=sandbox(); P.filmBindSlicers();
  const el=sl(P,'event');
  [1,2,3,4].forEach(i=>click(boxes(el)[i],true));
  eq(P.filter().event.length,0,'the headings did not inflate the count');
  eq(label(el),'All events');
});

/* A pick made in one half must stay visible in the next, or the button would
   read "9" over a panel with nothing ticked in it. */
test('a pick that this half has no event for is still offered, and still ticked', () => {
  const P=sandbox({filter:{player:['99']}});
  const s=byKey(P,'player');
  eq(s.opts.map(o=>o.v).join(','),'2,9,14,99','carried in beside the half own');
  eq(P.filmSlicerLabel(s),'99','and the button says so');
});

test('a pick this half does have is not offered twice', () => {
  const s=byKey(sandbox({filter:{player:['9']}}),'player');
  eq(s.opts.map(o=>o.v).join(','),'2,9,14');
});

/* ================= what the closed button says ================= */
test('none picked reads as the all-label', () => {
  const P=sandbox();
  eq(P.filmSlicerLabel(byKey(P,'team')),'Both teams');
  eq(P.filmSlicerLabel(byKey(P,'player')),'All players');
  eq(P.filmSlicerLabel(byKey(P,'event')),'All events');
});

test('one picked reads as that option own words', () => {
  const P=sandbox({filter:{team:['away'],event:['goal']}});
  eq(P.filmSlicerLabel(byKey(P,'team')),'Celtic','the club, not the value behind it');
  eq(P.filmSlicerLabel(byKey(P,'event')),'goal');
});

test('several picked read as a count, which is what the column has room for', () => {
  const P=sandbox({filter:{player:['9','14'],event:['goal','pass success']}});
  eq(P.filmSlicerLabel(byKey(P,'player')),'2 players');
  eq(P.filmSlicerLabel(byKey(P,'event')),'2 events');
});

/* ================= the markup the binder queries ================= */
/* filmBindSlicers and filmSyncSlicer reach into this markup by class and by data
   attribute. If the HTML stops carrying one of them the panel goes dead with
   nothing thrown, so the two are checked against each other here. */
test('the slicer carries the key, the all-label and the plural', () => {
  const P=sandbox();
  const html=P.filmSlicerHTML(byKey(P,'player'));
  ok(html.indexOf('data-key="player"')>=0,'the key filmBindSlicers writes back through');
  ok(html.indexOf('data-all="All players"')>=0,'the all-label filmSyncSlicer reads back');
  ok(html.indexOf('data-many="players"')>=0,'and the plural it counts with');
});

test('every class the stub and the binder query is in the markup', () => {
  const P=sandbox();
  const html=P.filmSlicerHTML(byKey(P,'player'));
  ['fm-slicer','fm-sl-btn','fm-sl-lbl','fm-sl-panel','fm-sl-opt','fm-sl-txt']
    .forEach(c=>ok(html.indexOf('class="'+c)>=0||html.indexOf(c)>=0,c+' is written'));
  ok(/<div class="fm-sl-panel" hidden>/.test(html),'and the panel starts shut');
});

test('an All box with no value, then one real checkbox per option', () => {
  const P=sandbox();
  const html=P.filmSlicerHTML(byKey(P,'player'));
  eq((html.match(/<input type="checkbox"/g)||[]).length,4,'All, plus the three numbers');
  ok(html.indexOf('<input type="checkbox" data-all="1" checked>')>=0,
     'All is what is ticked when nothing is');
  ok(html.indexOf('value="9"')>=0&&html.indexOf('value="14"')>=0,'each number is its own value');
  ok(/class="fm-sl-opt all"/.test(html),'and All is marked, so it can sit above the rule');
});

test('what is picked comes back ticked, and All does not', () => {
  const P=sandbox({filter:{player:['9']}});
  const html=P.filmSlicerHTML(byKey(P,'player'));
  ok(html.indexOf('<input type="checkbox" value="9" checked>')>=0,'the pick is ticked');
  ok(html.indexOf('<input type="checkbox" data-all="1">')>=0,'All is not');
  ok(html.indexOf('>9</span>')>=0,'and the button says 9');
});

/* The label is cut with an ellipsis at 97px, so the tooltip carries it in full —
   and has to move with it, never left describing a state that has gone. */
test('the tooltip says what the button says, and is moved on with it', () => {
  const P=sandbox({filter:{team:['home']}});
  ok(P.filmSlicerHTML(byKey(P,'team')).indexOf('title="Rangers"')>=0,
     'the picked side, not the all-label it replaced');
  const Q=sandbox(); Q.filmBindSlicers();
  const el=sl(Q,'player');
  eq(el.querySelector('.fm-sl-btn').attrs.title,undefined,'nothing set until it changes');
  click(boxes(el)[2],true);
  eq(el.querySelector('.fm-sl-btn').title,'9','and it follows the label on every tick');
  click(boxes(el)[3],true);
  eq(el.querySelector('.fm-sl-btn').title,'2 players');
});

test('names out of the squad are escaped on the way into the markup', () => {
  const P=sandbox({meta:{home:'A & B "FC"',away:'<Celtic>'}});
  const html=P.filmSlicerHTML(byKey(P,'team'));
  notOk(/<Celtic>/.test(html),'a tag in a club name is not a tag here');
  ok(html.indexOf('&amp;')>=0&&html.indexOf('&quot;')>=0,'and the attribute cannot be broken out of');
});

/* ================= ticking ================= */
test('ticking one number narrows to it, and says so without redrawing the panel', () => {
  const P=sandbox(); P.filmBindSlicers();
  const el=sl(P,'player'), was=boxes(el)[2];   // All, 2, 9 -> this is 9
  click(was,true);
  eq(P.filter().player.join(','),'9');
  eq(label(el),'9','the button relabels itself');
  eq(P.relists(),1,'and the list is redrawn once');
  ok(boxes(el)[0].checked===false,'All lets go');
});

test('a second tick adds rather than replaces — the whole point of a slicer', () => {
  const P=sandbox(); P.filmBindSlicers();
  const el=sl(P,'player');
  click(boxes(el)[2],true); click(boxes(el)[3],true);
  eq(P.filter().player.join(','),'9,14','both, not the last one only');
  eq(label(el),'2 players');
  eq(P.relists(),2);
});

test('unticking takes one back out and leaves the rest', () => {
  const P=sandbox({filter:{player:['9','14']}}); P.filmBindSlicers();
  const el=sl(P,'player');
  click(boxes(el)[2],false);
  eq(P.filter().player.join(','),'14');
  eq(label(el),'14','back to the one number own words');
});

test('the last one out is All again', () => {
  const P=sandbox({filter:{player:['9']}}); P.filmBindSlicers();
  const el=sl(P,'player');
  click(boxes(el)[2],false);
  eq(P.filter().player.length,0);
  eq(label(el),'All players');
  ok(boxes(el)[0].checked,'and All is ticked back');
});

/* Every option ticked and none ticked are the same answer. Kept as one spelling,
   so the label and the All box never disagree about which of the two it is. */
test('ticking every option is normalised back to All', () => {
  const P=sandbox(); P.filmBindSlicers();
  const el=sl(P,'team');
  click(boxes(el)[1],true);
  eq(label(el),'Rangers');
  click(boxes(el)[2],true);
  eq(P.filter().team.length,0,'both sides is both sides — the empty list');
  eq(label(el),'Both teams');
  ok(boxes(el)[0].checked,'All ticked');
  notOk(boxes(el)[1].checked||boxes(el)[2].checked,'and the two it stands for are not');
});

test('All clears whatever was picked, and unticking All is a no-op', () => {
  const P=sandbox({filter:{player:['9','14']}}); P.filmBindSlicers();
  const el=sl(P,'player');
  click(boxes(el)[0],true);
  eq(P.filter().player.length,0,'cleared');
  notOk(boxes(el)[2].checked,'and the ticks come off');
  click(boxes(el)[0],false);
  eq(P.filter().player.length,0,'still all — there is nothing narrower to mean');
  ok(boxes(el)[0].checked,'so it is put back');
});

test('the three slicers are independent of one another', () => {
  const P=sandbox(); P.filmBindSlicers();
  click(boxes(sl(P,'player'))[2],true);
  click(boxes(sl(P,'event'))[1],true);
  eq(P.filter().player.join(','),'9');
  eq(P.filter().event.join(','),'goal');
  eq(P.filter().team.length,0,'the one nobody touched is untouched');
});

/* ================= opening and shutting ================= */
test('the button opens its own panel and shuts every other', () => {
  const P=sandbox(); P.filmBindSlicers();
  const a=sl(P,'player'), b=sl(P,'event');
  a.querySelector('.fm-sl-btn').onclick();
  ok(open(a)&&!a.querySelector('.fm-sl-panel').hidden,'open');
  eq(a.querySelector('.fm-sl-btn').getAttribute('aria-expanded'),'true');
  b.querySelector('.fm-sl-btn').onclick();
  ok(open(b),'the second opens');
  notOk(open(a),'and the first shuts — one panel would cover the other');
  ok(a.querySelector('.fm-sl-panel').hidden);
  eq(a.querySelector('.fm-sl-btn').getAttribute('aria-expanded'),'false');
});

test('the same button again shuts it', () => {
  const P=sandbox(); P.filmBindSlicers();
  const el=sl(P,'player'), btn=el.querySelector('.fm-sl-btn');
  btn.onclick(); ok(open(el));
  btn.onclick(); notOk(open(el));
});

test('it stays open across a tick, which is how several get picked', () => {
  const P=sandbox(); P.filmBindSlicers();
  const el=sl(P,'player');
  el.querySelector('.fm-sl-btn').onclick();
  click(boxes(el)[2],true);
  ok(open(el),'still open');
  click(boxes(el)[3],true);
  ok(open(el),'and after the second');
  eq(P.filter().player.join(','),'9,14');
});

test('a click anywhere outside shuts them; inside one leaves it alone', () => {
  const P=sandbox(); P.filmBindSlicers();
  const el=sl(P,'player');
  el.querySelector('.fm-sl-btn').onclick();
  P.filmDocClick({target:boxes(el)[2]});
  ok(open(el),'a click on one of its own boxes is not a click away');
  P.filmDocClick({target:node('div','film-list')});
  notOk(open(el),'the list below is');
  P.filmDocClick({target:null});             // never thrown at, but never a crash either
});

/* ================= cut to the room there is ================= */
/* The panel hangs over .stats-wrap, which scrolls and so has a bottom edge of
   its own. At 1280x720 the measured gap between the filters and that edge was
   157px against a panel wanting 230: the last numbers of a full squad sat past
   it, reachable only by scrolling the whole Stats area. */
function fitted(P,key,opts){
  opts=opts||{};
  const s=sl(P,key);
  s.querySelector('.fm-sl-btn').rect={bottom:opts.btnBottom==null?400:opts.btnBottom};
  if(opts.wrapBottom!=null){                  // a clipping ancestor, as the page has
    const wrap=node('div','stats-wrap');
    wrap.overflowY='auto'; wrap.rect={bottom:opts.wrapBottom};
    const was=s.parentNode;
    wrap.parentNode=was; s.parentNode=wrap; wrap.children=[s];
  }
  P.filmSlicerOpen(s,true);
  return parseInt(s.querySelector('.fm-sl-panel').style.maxHeight,10);
}

test('with room to spare the panel keeps its full height', () => {
  const P=sandbox({innerHeight:1400});
  eq(fitted(P,'player',{btnBottom:200}),P.MAX,'nothing is taken off it');
});

test('near the foot of the window it is cut rather than pushed past it', () => {
  const P=sandbox({innerHeight:720});
  eq(fitted(P,'player',{btnBottom:600}),110,'720 - 600 - 10 of gap');
});

test('a scroller edge nearer than the window is what it measures against', () => {
  const P=sandbox({innerHeight:1400});
  eq(fitted(P,'player',{btnBottom:450,wrapBottom:610}),150,
     'the .stats-wrap bottom, not the window, is what would have clipped it');
});

test('it never collapses to a sliver, however little room there is', () => {
  const P=sandbox({innerHeight:720});
  eq(fitted(P,'player',{btnBottom:715}),P.MIN,
     'a panel too short to click is worse than one that overhangs');
});

test('the room is measured again on every opening, not once', () => {
  const P=sandbox({innerHeight:720}); P.filmBindSlicers();
  const s=sl(P,'player'), btn=s.querySelector('.fm-sl-btn');
  btn.rect={bottom:200}; btn.onclick();
  eq(parseInt(s.querySelector('.fm-sl-panel').style.maxHeight,10),P.MAX);
  btn.onclick();                                    // shut
  btn.rect={bottom:600}; btn.onclick();             // …and the page has scrolled
  eq(parseInt(s.querySelector('.fm-sl-panel').style.maxHeight,10),110,'re-measured');
});

/* ================= wired up, and let go of ================= */
const filmStart=F('filmStart'), filmStop=F('filmStop'), filmKeys=F('filmKeys');
const filmHTML=F('filmHTML');

test('Film binds the slicers where it used to bind the selects', () => {
  ok(/filmBindSlicers\(\)/.test(filmStart),'bound on every render');
  notOk(/fmTeam|fmPlayer|fmEvent/.test(filmStart),'and nothing is left listening to a select');
  notOk(/<select/.test(filmHTML),'the markup has no select in it any more');
  ok(/filmSlicers\(choices\)\.map\(filmSlicerHTML\)/.test(filmHTML),'it draws the three slicers');
});

test('the outside-click listener goes when Film goes', () => {
  ok(/document\.addEventListener\('click',filmDocClick\)/.test(filmStart),'added by name');
  ok(/document\.removeEventListener\('click',filmDocClick\)/.test(filmStop),'and taken off by name');
  notOk(/addEventListener\('click',\s*(?:\(|function)/.test(filmStart),
        'no inline handler: it could never be removed again');
});

/* Space is play/pause on the document. Inside a slicer it has to tick the box or
   press the button instead, and it must not be swallowed on the way. */
test('the keyboard belongs to a slicer while its panel is OPEN', () => {
  ok(filmKeys.indexOf("closest('.fm-slicer')")>=0,'filmKeys checks for one');
  const inside=filmKeys.slice(filmKeys.indexOf("closest('.fm-slicer')"));
  ok(/Escape/.test(inside.slice(0,200)),'Escape shuts it');
  ok(inside.indexOf('return;')>=0,'and everything else is handed back to the browser');
  ok(filmKeys.indexOf("closest('.fm-slicer')")<filmKeys.indexOf("tag==='INPUT'"),
     'checked before the tag test, so the button is covered as well as the boxes');
  /* The focus alone is NOT the test any more. A click on the button focuses it
     and nothing here blurs it, so resting on the focus meant one press of a
     filter killed every Film key — [ and ] first among them. The panel being up
     is what hands the keyboard over; with it down only Space and Enter, which
     work the button itself, stay the browser's. */
  ok(/classList\.contains\('open'\)/.test(inside.slice(0,400)),
     'it asks whether the panel is open, not merely where the focus is');
  ok(/e\.key===' '\|\|e\.key==='Spacebar'\|\|e\.key==='Enter'/.test(inside.slice(0,400)),
     'and a shut slicer still gets the two keys that open it');
});

test('handing over a match empties the three lists', () => {
  const setData=grabFunction('setData',STATS,'Stats/stats-view.js');
  ok(/filmFilter=\{team:\[\],player:\[\],event:\[\]\}/.test(setData),
     'and it is the empty LIST now, not the empty string');
});

/* ================= the styling the panel depends on ================= */
test('the panel hangs over the list rather than pushing it down', () => {
  const css=readSrc('Stats/stats-view.css');
  ok(/\.fm-slicer\{[^}]*position:relative/.test(css),'the slicer is the frame it hangs from');
  ok(/\.fm-sl-panel\{[^}]*position:absolute/.test(css),'so the panel is out of the flow');
  ok(/\.fm-sl-panel\{[^}]*z-index:/.test(css),'and over the scroller below it');
  ok(/\.fm-sl-panel\{[^}]*overflow-y:auto/.test(css),'a long squad scrolls inside it');
  ok(/\.fm-sl-panel\[hidden\]\{display:none\}/.test(css),'shut is shut, hidden being no match for display:flex');
  notOk(/\.fm-sel\{/.test(css),'and the select styling went with the selects');
});

/* The panel is wider than its button whenever min-width bites, and it grows
   rightwards: at 375px that put the third one on the edge of the screen. */
test('the last slicer opens its panel leftwards, off the right edge', () => {
  const css=readSrc('Stats/stats-view.css');
  ok(/\.film-filters \.fm-slicer:last-of-type \.fm-sl-panel\{left:auto;right:0\}/.test(css),
     'anchored to its own right edge instead');
});
