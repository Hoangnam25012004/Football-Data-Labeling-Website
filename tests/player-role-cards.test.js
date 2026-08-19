/* Player role cards: the six tiles on a player's profile, cut by the job he did.

   Three things are being pinned down here.

   The first is where a role comes from. Not a guess off the numbers — the square
   the analyst put his dot in on the formation board, which every report already
   carries as `pos` on each XI entry. posFigures() reads that board the way
   gkShirts() reads it for the keeper, and the fifteen outfield squares map onto
   Defender / Midfielder / Striker with nothing left over and nothing counted twice.

   The second is that a man is what he was PICKED as. A full back who pushes into
   midfield for ten minutes has played two roles and is still a full back, so the
   role that opens the page is the one he was placed in most often, and the chips
   offer every role he ever actually took.

   The third is the two readings. Total and Per 90 are one division apart, taken
   over the minutes the tile beside them is already showing, and the two tiles that
   no length of season changes — a percentage, and a clean sheet counted in matches
   — say so by not moving.

   Arithmetic is EXECUTED: posFigures, playerIndex and per90 are lifted out of
   app.js by name and run in a vm against hand-written line-ups, the way
   tests/player-data.test.js runs playerIndex. Rendering is read as source, as
   every other client test does. */
const vm=require('vm');
const {test,eq,deepEq,ok,notOk}=require('./tiny-test');
const {grabFunction,readSrc,SHARED}=require('./harness');

const APPJS=readSrc('client/assets/app.js');
const APPCSS=readSrc('client/assets/app.css');

const profile=/function renderPlayerProfile\([^)]*\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
const headCard=/function playerHead\([^)]*\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
const ctlFn=/function playerCtl\([^)]*\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
const catTabs=/function catTabs\([^)]*\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
const matchTable=/function playerMatchTable\([^)]*\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];

/* ---------- app.js's own helpers, running for real ---------- */
const LIFT=['playerIndex','aliasMap','sumStats','playerCards','gkFigures','gkCell','posFigures',
            'minsTotal','per90'];
/* the role block whole: the two tables, the four lookups built off them, MODES,
   and the four tile sets. One contiguous run in app.js, taken in one piece so the
   lookups cannot drift from the tables they sit beside. */
const ROLEBLOCK=/\n  \/\* -+ roles -+[\s\S]*?c: 'yellow and red' \}\n  \];/.exec(APPJS)[0];
function sandbox(){
  const ctx={console,location:{hash:''},
    document:{getElementById:()=>null,addEventListener(){},removeEventListener(){}},
    localStorage:{getItem:()=>null,setItem(){}},window:{}};
  vm.createContext(ctx);
  vm.runInContext([SHARED,
    'window.newStat=newStat;window.gkShirts=gkShirts;window.onPitchAt=onPitchAt;',
    'var state={};',
    LIFT.map(n=>grabFunction(n,APPJS,'client/assets/app.js')).join('\n'),
    ROLEBLOCK,
    ';globalThis.A={'+LIFT.join(',')+',ROLES,ROLE_POS,ROLE_OF,ROLE_LABEL,ROLE_BADGE,ROLE_RANK,'
      +'MODES,ROLE_KPIS,GK_KPIS,FALLBACK_KPIS,PLAYER_CATS,FORMATION_GRID,newStat,pct};'
  ].join('\n'),ctx,{filename:'client/assets/app.js-extract.js'});
  return ctx.A;
}
const A=sandbox();

/* ---------- fixtures ---------- */
const dot=(no,pos)=>({no:String(no),x:50,y:50,pos});
/* one side's line-up: a starting XI, plus any later snapshots */
const lu=(xi,hist)=>({home:{roster:[],xi,subs:[],dir:'lr'},away:{roster:[],xi:[],subs:[],dir:'rl'},
                      history:(hist||[]).map(h=>Object.assign({team:'home'},h))});
function stat(o){return Object.assign(A.newStat(),o||{});}
const played=min=>({min,sec:min*60,h1:Math.min(min,45)*60,h2:Math.max(0,min-45)*60,exact:true});
/* one aggregate() result, hand-built, with the pos map the Data view now reduces to */
function agg(o){
  o=o||{};
  return {m:Object.assign({slug:'m1',id:'m1',date:'2025-06-11',opponent:'Barbados',
                           side:'home',result:'W'},o.m||{}),
          gf:2, ga:1, us:A.newStat(), them:A.newStat(),
          players:o.players||{}, names:o.names||{'7':'Elva'}, ids:o.ids||{},
          mins:o.mins===undefined?{'7':played(90)}:o.mins,
          cards:o.cards||{}, gk:o.gk||{}, pos:o.pos===undefined?undefined:o.pos};
}
/* a player object shaped the way the tile functions read one */
function who(o){
  o=o||{};
  return {total:stat(o.total),cards:o.cards||{y:0,r:0},gkTotal:o.gk||{conceded:0,clean:0,known:0},
          min:o.min===undefined?360:o.min, timed:o.timed===undefined?true:o.timed,
          exact:o.exact===undefined?true:o.exact, apps:o.apps||4};
}

/* ================= the map from a square to a job ================= */

test('every outfield square of the formation board has exactly one role', () => {
  const squares=[].concat(...A.FORMATION_GRID).filter(s=>s&&s!=='GK');
  eq(squares.length,15,'fifteen squares outside the goal');
  squares.forEach(s=>ok(A.ROLE_OF[s],s+' has no role'));
  /* the other direction: nothing claimed twice, and nothing invented */
  const listed=[].concat(A.ROLE_POS.defender,A.ROLE_POS.midfielder,A.ROLE_POS.striker);
  eq(listed.length,15,'and no square is claimed by two roles');
  deepEq(listed.slice().sort(),squares.slice().sort(),'the two lists are the same fifteen');
});

test('the goalkeeper is not one of the three', () => {
  notOk(A.ROLE_OF.GK,'GK maps to no role, so no chip can ever offer it');
  notOk(A.ROLE_KPIS.goalkeeper,'and there is no fourth entry pretending otherwise');
});

test('the three groups are the ones that were asked for', () => {
  deepEq(A.ROLE_POS.defender,['RB','CB','LB','RWB','LWB']);
  deepEq(A.ROLE_POS.midfielder,['CDM','CM','RM','LM','CAM']);
  deepEq(A.ROLE_POS.striker,['LW','RW','CF','RF','LF']);
  deepEq(A.ROLES.map(r=>r[0]),['defender','midfielder','striker'],'read from the back line forward');
  deepEq(A.ROLES.map(r=>r[2]),['DEF','MID','ST'],'and each has a badge');
});

/* ================= the tile tables ================= */

test('ROLE_KPIS holds the three roles and nothing else', () => {
  deepEq(Object.keys(A.ROLE_KPIS),['defender','midfielder','striker']);
  ok(Array.isArray(A.FALLBACK_KPIS),'the net for a man no board placed is a constant of its own');
  notOk(A.ROLE_KPIS.general,'not a fourth role hiding inside the table');
});

test('every set is four tiles, so the row is always six', () => {
  [A.ROLE_KPIS.defender,A.ROLE_KPIS.midfielder,A.ROLE_KPIS.striker,
   A.GK_KPIS,A.FALLBACK_KPIS].forEach(set=>eq(set.length,4,'four beside Appearances and Minutes'));
  ok(/kpis six/.test(profile),'and the grid is still the six-wide one');
});

test('every tile reads a field that exists, in both readings', () => {
  const zero=who(), some=who({total:{tacklesWon:9,tackles:14,groundDuels:30,groundDuelsWon:18,
    aerialDuels:23,aerialDuelsWon:13,passes:412,passesComp:355,shotsOn:8,totalShots:18}});
  [].concat(A.ROLE_KPIS.defender,A.ROLE_KPIS.midfielder,A.ROLE_KPIS.striker,
            A.GK_KPIS,A.FALLBACK_KPIS).forEach(t=>{
    [zero,some].forEach(p=>{
      const v=t.v(p);
      ok(v!==undefined&&v===v,t.l+' read something that is not there');
      const c0=typeof t.c==='function'?t.c(p,false):t.c;
      const c1=typeof t.c==='function'?t.c(p,true):t.c;
      ok(typeof c0==='string'&&typeof c1==='string',t.l+' has no caption in one of the readings');
    });
  });
});

test('a tile that counts things carries the reading in its label; a fixed one does not', () => {
  /* the row builder appends ' (total)' / ' (per 90)' — a tile may not smuggle
     either into its own label, or the two would be printed twice */
  [].concat(A.ROLE_KPIS.defender,A.ROLE_KPIS.midfielder,A.ROLE_KPIS.striker,
            A.GK_KPIS,A.FALLBACK_KPIS).forEach(t=>{
    notOk(/total|per 90|%/i.test(t.l),t.l+' says the reading in its own label');
  });
  ok(/t\.fixed \? '' : rate \? ' \(per 90\)' : ' \(total\)'/.test(profile),
     'the label suffix is decided in one place, off one flag');
  /* the four that must not follow the button, and only those four */
  const fixed=[].concat(A.GK_KPIS,A.FALLBACK_KPIS,A.ROLE_KPIS.defender,
                        A.ROLE_KPIS.midfielder,A.ROLE_KPIS.striker)
    .filter(t=>t.fixed).map(t=>t.l).sort();
  deepEq(fixed,['Cards','Clean Sheets','Save Rate'],
     'a percentage, a count of matches, and a booking record — nothing else holds still');
});

test('Shots On Target is the same sum shared.js already publishes', () => {
  const s=stat({shotsOn:8,totalShots:18});
  const col=A.PLAYER_CATS.shooting.filter(c=>c[0]==='Shooting Accuracy')[0];
  const tile=A.ROLE_KPIS.striker.filter(t=>t.l==='Shots On Target')[0];
  ok(/44\.4%/.test(tile.c(who({total:{shotsOn:8,totalShots:18}}),false)),
     'the share under the tile');
  eq(col[1](s),'44.4%','and the column in the table right below it — one ratio, not two');
});

/* ================= posFigures ================= */

test('the starting XI says where a man was picked', () => {
  const p=A.posFigures(lu([dot(4,'CB'),dot(6,'CDM'),dot(9,'CF')]),'home');
  deepEq(p['4'],{start:'CB',all:['CB']});
  deepEq(p['9'],{start:'CF',all:['CF']});
  notOk(p['3'],'and nobody who was not on the board');
});

test('a substitute is picked in the square the man he replaced left behind', () => {
  const p=A.posFigures(lu([dot(4,'CB'),dot(6,'CDM')],
                          [{t:3600,xi:[dot(4,'CB'),dot(21,'CDM')]}]),'home');
  deepEq(p['21'],{start:'CDM',all:['CDM']},'he enters at a real position, not at nothing');
  deepEq(p['4'],{start:'CB',all:['CB']},'and the man who stayed on is unchanged');
});

test('a man who moves during the match holds both squares, and the first is where he started', () => {
  const p=A.posFigures(lu([dot(3,'LB')],[{t:3600,xi:[dot(3,'LM')]}]),'home');
  eq(p['3'].start,'LB','he was picked at left back');
  deepEq(p['3'].all,['LB','LM'],'and he stood in both');
});

test('snapshots out of order still name the square he started in', () => {
  /* two changes pushed the wrong way round — the later one first */
  const p=A.posFigures(lu([dot(3,'LB')],
    [{t:4500,xi:[dot(3,'LW')]},{t:3600,xi:[dot(3,'LM')]}]),'home');
  eq(p['3'].start,'LB','the starting XI is the root, whatever order the rest arrived in');
  deepEq(p['3'].all.slice(0,2),['LB','LM'],'and the run reads forward in time');
});

test('a dot still in the staging square is not a position', () => {
  const p=A.posFigures(lu([dot(4,''),dot(6,'CM')]),'home');
  notOk(p['4'],'somewhere to park a dot is not somewhere he played');
  ok(p['6'],'and the man who was placed is placed');
});

test('no line-up at all answers nothing, and does not throw', () => {
  deepEq(A.posFigures({},'home'),{});
  deepEq(A.posFigures({home:null},'home'),{});
  deepEq(A.posFigures(lu([]),'home'),{});
});

/* ================= a role across a campaign ================= */

const three=(...poss)=>poss.map((ps,i)=>agg({
  m:{slug:'m'+i,date:'2025-0'+(i+1)+'-01'},
  players:{'7':stat({goals:1})},
  pos:{'7':{start:ps[0],all:ps}}
}));

test('one square every week is one role', () => {
  const p=A.playerIndex(three(['CB'],['CB'],['CB']))[0];
  deepEq(p.roles,['defender']);
  eq(p.role,'defender');
  eq(p.roleApps.defender,3);
});

test('two squares over a campaign are two chips, in the fixed order', () => {
  const p=A.playerIndex(three(['CM'],['CB'],['CB']))[0];
  deepEq(p.roles,['defender','midfielder'],'never the order they turned up in');
  eq(p.role,'defender','picked there twice, in midfield once');
  eq(p.roleApps.midfielder,1);
});

test('a man who moves inside one match has both roles, and stays what he was picked as', () => {
  const p=A.playerIndex(three(['LB','LM']))[0];
  deepEq(p.roles,['defender','midfielder'],'both are true of that match');
  eq(p.role,'defender','but the team sheet put him at left back');
  eq(p.roleApps.defender,1);
  eq(p.roleApps.midfielder,1);
});

test('a role is counted once per match however many squares it covers', () => {
  const p=A.playerIndex(three(['CB','LB','RWB']))[0];
  eq(p.roleApps.defender,1,'three defensive squares in one match are one appearance at the back');
});

test('the default role does not depend on the order the matches arrive in', () => {
  const fwd=A.playerIndex(three(['CM'],['CB']))[0];
  const rev=A.playerIndex(three(['CB'],['CM']))[0];
  eq(fwd.role,rev.role,'a tie breaks the same way whichever match was read first');
  eq(fwd.role,'defender','and it breaks on the fixed order, back line first');
  deepEq(fwd.roles,rev.roles);
});

test('a man no board ever placed has no role, and nothing pretends he does', () => {
  const p=A.playerIndex([agg({players:{'7':stat({goals:1})}})])[0];
  deepEq(p.roles,[]);
  eq(p.role,'');
  deepEq(p.roleApps,{});
});

test('a keeper is still a keeper, and roles changed none of his figures', () => {
  const p=A.playerIndex([agg({
    players:{'1':stat({saves:9})},names:{'1':'Barclett'},mins:{'1':played(90)},
    gk:{'1':{conceded:1,clean:0,known:1}},pos:{'1':{start:'GK',all:['GK']}}
  })])[0];
  ok(p.gk,'the GK square settles it for the campaign, exactly as before');
  deepEq(p.gkTotal,{conceded:1,clean:0,known:1},'and what went past him is untouched');
  deepEq(p.roles,[],'a keeper is offered no role to filter by');
});

/* ================= the two readings ================= */

test('per 90 is the figure over the minutes beside it', () => {
  eq(A.per90(who({min:360}),21),'5.3','21 across four full matches');
  eq(A.per90(who({min:90}),1),'1.0','one decimal always, so a column reads down');
  eq(A.per90(who({min:360}),0),'0.0','nothing done is a rate of nothing, not a dash');
});

test('a rate nobody can work out is a dash, never a zero and never an infinity', () => {
  eq(A.per90(who({timed:false,min:0}),9),'—','no line-up ever named him');
  eq(A.per90(who({min:0}),9),'—','and no minutes is not a rate of zero');
  eq(A.per90(who({min:360}),'—'),'—','the keeper-s Conceded already reads this when no board can answer');
  eq(A.per90(who({min:360}),null),'—');
});

test('an approximate total can only make an approximate rate', () => {
  eq(A.per90(who({min:360,exact:false}),21),'~5.3','the same mark minsTotal puts on the tile beside it');
  eq(A.per90(who({min:360,exact:true}),21),'5.3');
});

test('a share does not move with the reading; the count it is a share of does', () => {
  const p=who({total:{tacklesWon:9,tackles:14},min:360});
  const t=A.ROLE_KPIS.defender.filter(x=>x.l==='Tackles Won')[0];
  eq(t.v(p),9,'the figure is a count in both readings, one division apart');
  eq(t.c(p,false),'64.3% of 14');
  eq(t.c(p,true),'64.3% of 3.5','the share holds, the total it is out of goes to a rate');
});

test('Appearances and Minutes are the divisor, so they hold still', () => {
  ok(/kpi\('Appearances', who\.apps/.test(profile)&&/kpi\('Minutes', minsTotal\(who\)/.test(profile),
     'built once, outside the map, so no reading can reach them');
  notOk(/per90\(who, who\.apps\)/.test(profile),'nobody divides his appearances by his minutes');
});

/* ================= what is drawn ================= */

test('one table draws all three rows, and the keeper is asked about first', () => {
  ok(/var set = who\.gk \? GK_KPIS : \(ROLE_KPIS\[role\] \|\| FALLBACK_KPIS\);/.test(profile),
     'a keeper, then a role, then the net — in that order, in one line');
  ok(/who\.gk\s*\n?\s*\?/.test(profile),'chosen by role, not drawn twice');
  notOk(/kpi\('Goals', who\.total\.goals/.test(profile),
     'and no row of tiles is still written out by hand');
});

test('the reading resets when a player is opened', () => {
  ok(/var mode = 'total';/.test(profile),'Total is where every visit starts');
  notOk(/localStorage/.test(profile+ctlFn),'nothing is remembered between two visits');
  const hashSets=(profile+ctlFn).match(/location\.hash = [^\n]*/g)||[];
  ok(hashSets.length>0,'the role chip does put its role in the URL');
  notOk(hashSets.some(h=>/mode|p90|total/.test(h)),
     'but the reading never goes there — a click on it must not redraw the whole view');
});

test('a keeper gets the two readings and no role filter', () => {
  ok(/if \(who\.roles && who\.roles\.length > 1\)/.test(ctlFn),
     'the role group needs two roles to choose between');
  ok(/var right = el\('div', 'pl-grp right'\);/.test(ctlFn),
     'the reading group is built unconditionally, so a keeper has it too');
  notOk(/who\.gk/.test(ctlFn),'nothing in the bar turns on whether he keeps goal');
});

test('Per 90 is refused when there are no minutes to divide by', () => {
  ok(/var canRate = !!\(who\.timed && who\.min\);/.test(ctlFn),'both flags, as per90 reads them');
  ok(/b\.disabled = true;/.test(ctlFn)&&/b\.title = 'No match in this channel has a line-up/.test(ctlFn),
     'disabled, and it says why rather than offering a row of dashes');
  ok(/\} else \{\n\s*b\.addEventListener/.test(ctlFn),'and a disabled button gets no listener at all');
});

test('a role chip is a link somebody can send, category and all', () => {
  ok(/var base = '#\/data\/player\/' \+ encodeURIComponent\(who\.key\) \+ '\/' \+ cat \+ '\/';/.test(ctlFn),
     'the category he was reading in is carried into the role he switches to');
  ok(/location\.hash = base \+ r;/.test(ctlFn));
  ok(/renderPlayerProfile\(body, who, people, rest\[2\], rest\[3\]\)/.test(APPJS),
     'and the fourth segment is read back out of the hash');
});

test('switching category keeps the role, and Team Data is untouched by the change', () => {
  ok(/function catTabs\(cat, base, tabs, tail\)/.test(catTabs),'a fourth argument, with a default');
  ok(/\(base \|\| '#\/data\/team\/'\) \+ t\[0\] \+ \(tail \|\| ''\)/.test(catTabs),
     'nothing appended when nothing is passed');
  ok(/body\.appendChild\(catTabs\(cat\)\);/.test(APPJS),
     'Team Data still calls it with one argument and builds the href it always did');
  ok(/role \? '\/' \+ role : ''/.test(profile),'and a player without a role appends nothing');
});

test('the badge says which role is being read', () => {
  ok(/pl-role">GK/.test(headCard),'a keeper is asked about first, and his badge is unchanged');
  ok(/esc\(ROLE_BADGE\[role\]\)/.test(headCard),'the other three come off one table');
  ok(/who\.gk \|\| role \? ' · ' \+ who\.cards\.y/.test(headCard),
     'and the booking record moves to the meta line whenever the tiles have no room for it');
});

test('the role filter does not reach the table under it', () => {
  ok(/function playerMatchTable\(who, cat\)/.test(matchTable),'no role, no reading');
  notOk(/role|mode|per90/.test(matchTable),'a match row is what happened that match, whole');
});

test('nothing on this bar prints a shirt number', () => {
  notOk(/who\.no|p\.no|pl-shirt/.test(ctlFn),
     'a number belongs to a match rather than to a man — the rule the rest of this page keeps');
});

test('the bar brings its own styles and borrows the rest', () => {
  ok(/\.pl-ctl\{/.test(APPCSS)&&/\.pl-grp\{/.test(APPCSS),'both new names are defined');
  ok(/\.pl-ctl \.chip\.role\.on\{/.test(APPCSS),'a role chip takes the amber of the badge');
  notOk(/^\.chip\{/m.test(APPCSS),'and .chip itself is left where site.css defines it');
  ok(/\.pl-grp\.right\{margin-left:auto\}/.test(APPCSS),'the reading group sits at the far end');
});

test('the bar hangs no listener on the document', () => {
  /* playerHead's player menu has to, and takes it off again on the way out.
     Nothing here does, so nothing here can hold a detached node alive. */
  notOk(/document\.addEventListener/.test(ctlFn));
  ok(/b\.addEventListener\('click'/.test(ctlFn),'every listener is on a button it just built');
});

/* ================= the profile, actually drawn =================
   Everything above reads the render as source, which cannot catch a name that is
   not in scope or a field read off undefined. So the whole of renderPlayerProfile
   is run here against a DOM small enough to reason about, and the six tiles are
   read back out of it. This is the test that fails if the page would throw. */
function paintProfile(person, wantedRole){
  const made=[];
  const mk=tag=>{
    const n={tag,className:'',innerHTML:'',title:'',type:'',disabled:false,kids:[],
      appendChild(c){n.kids.push(c);return c;},
      addEventListener(ev,fn){(n.on=n.on||{})[ev]=fn;},
      setAttribute(){},removeAttribute(){},
      classList:{toggle(c,on){n.className=on?(n.className+' '+c):n.className.replace(' '+c,'');},
                 add(){},remove(){},contains:()=>false},
      querySelectorAll:sel=>made.filter(x=>x.sel===sel||
        (sel==='.pl-grp.right .chip'&&x.tag==='button'&&/\bchip\b/.test(x.className)&&x.inRight))};
    made.push(n); return n;
  };
  const ctx={console,JSON,Math,Date,String,Number,Object,Array,Boolean,RegExp,isFinite,
    location:{hash:''},
    document:{createElement:mk,getElementById:()=>null,
              addEventListener(){},removeEventListener(){},querySelectorAll:()=>[]},
    localStorage:{getItem:()=>null,setItem(){}},
    window:{HNA:{shortDate:d=>String(d)}},
    state:{}};
  ctx.globalThis=ctx;
  vm.createContext(ctx);
  const NAMES=['esc','num','kpi','catCols','minsTotal','minsOne','per90','gkCell',
               'catTabs','playerHead','playerCtl','playerMatchTable','renderPlayerProfile'];
  /* app.js is an IIFE and shared.js is global, so the lifted half goes inside a
     function scope here too — otherwise app.js's own esc() collides with the one
     shared.js declares, which is a collision the real page does not have. */
  vm.runInContext([SHARED,
    'window.newStat=newStat;',
    '(function(){',
    /\n  var el = function[\s\S]*?\n  \};/.exec(APPJS)[0],
    /\n  var TD_TABS = \[[\s\S]*?\n  \];/.exec(APPJS)[0],
    /\n  var GK_TABS = TD_TABS[\s\S]*?\n  \}\);/.exec(APPJS)[0],
    /\n  var tabsFor = [^\n]*/.exec(APPJS)[0],
    ROLEBLOCK,
    NAMES.map(n=>grabFunction(n,APPJS,'client/assets/app.js')).join('\n'),
    ';globalThis.OUT=renderPlayerProfile;',
    '})();'
  ].join('\n'),ctx,{filename:'client/assets/app.js-render.js'});

  const body=mk('div');
  ctx.OUT(body,person,[person],'shooting',wantedRole);
  /* the tiles are one innerHTML string; the bar is the node before them */
  const kpis=body.kids.filter(n=>n.className==='kpis six')[0];
  const bar=body.kids.filter(n=>n.className==='pl-ctl')[0];
  const labels=(kpis.innerHTML.match(/class="k-l">([^<]*)</g)||[])
    .map(s=>s.replace(/^class="k-l">/,'').replace(/<$/,''));
  const values=(kpis.innerHTML.match(/class="k-v">([^<]*)</g)||[])
    .map(s=>s.replace(/^class="k-v">/,'').replace(/<$/,''));
  return {body,kpis,bar,labels,values,repaint:m=>{
    /* the button's own click handler, run the way a click would run it */
    const btns=bar.kids.filter(n=>n.className==='pl-grp right')[0].kids;
    const b=btns.filter(n=>/Per 90|Total/.test(n.innerHTML))[MODES_IDX[m]];
    b.on.click();
    return (kpis.innerHTML.match(/class="k-l">([^<]*)</g)||[])
      .map(s=>s.replace(/^class="k-l">/,'').replace(/<$/,''));
  }};
}
const MODES_IDX={total:0,p90:1};
/* a fully-formed player, the shape playerIndex hands the view */
function person(o){
  o=o||{};
  const m={m:{slug:'m1',id:'m1',date:'2025-06-11',opponent:'Barbados',side:'home',result:'W'},
           gf:2,ga:1,stat:stat(o.total),mins:played(90),cards:{y:0,r:0},gk:null,pos:null};
  return Object.assign(who(o),{key:'n:elva',name:'Elva',matches:[m],gk:!!o.isGk,
    roles:o.roles||[],role:o.role||'',roleApps:o.roleApps||{},
    total:stat(o.total),min:o.min===undefined?360:o.min,
    timed:o.timed===undefined?true:o.timed});
}

test('a defender-s profile draws, and the four tiles are his', () => {
  const r=paintProfile(person({role:'defender',roles:['defender'],roleApps:{defender:4},
    total:{tacklesWon:9,tackles:14,interceptions:14,clearances:21,
           groundDuels:30,groundDuelsWon:18,aerialDuels:23,aerialDuelsWon:13}}));
  deepEq(r.labels,['Appearances','Minutes','Tackles Won (total)','Interceptions (total)',
                   'Clearances (total)','Duels Won (total)']);
  deepEq(r.values,['4',"360'",'9','14','21','31']);
});

test('Per 90 divides the counts and leaves the two on the left alone', () => {
  const r=paintProfile(person({role:'defender',roles:['defender'],roleApps:{defender:4},
    total:{tacklesWon:9,tackles:14,interceptions:14,clearances:21,
           groundDuels:30,groundDuelsWon:18,aerialDuels:23,aerialDuelsWon:13}}));
  const after=r.repaint('p90');
  deepEq(after,['Appearances','Minutes','Tackles Won (per 90)','Interceptions (per 90)',
                'Clearances (per 90)','Duels Won (per 90)'],'the label follows the button');
  const values=(r.kpis.innerHTML.match(/class="k-v">([^<]*)</g)||[])
    .map(s=>s.replace(/^class="k-v">/,'').replace(/<$/,''));
  deepEq(values,['4',"360'",'2.3','3.5','5.3','7.8'],'21 clearances over four matches is 5.3');
});

test('a keeper draws his own four, and gets the two readings', () => {
  const r=paintProfile(person({isGk:true,total:{saves:9},min:360}));
  deepEq(r.labels,['Appearances','Minutes','Saves (total)','Conceded (total)',
                   'Save Rate','Clean Sheets'],
     'a percentage and a count of matches carry no reading, because none applies');
  deepEq(r.repaint('p90').slice(2),['Saves (per 90)','Conceded (per 90)','Save Rate','Clean Sheets'],
     'and the two that hold still, hold still');
  ok(r.bar,'he has the bar');
  notOk(r.bar.kids.some(k=>k.className==='pl-grp'),'but no role group in it');
});

test('a man no board placed draws the page he had before roles existed', () => {
  const r=paintProfile(person({total:{goals:3,assists:2,keyPasses:6}}));
  deepEq(r.labels,['Appearances','Minutes','Goals (total)','Assists (total)',
                   'Key Passes (total)','Cards'],
     'the four he has always seen, and his booking record still among them');
  deepEq(r.values,['4',"360'",'3','2','6','0Y · 0R']);
});

test('a man with two roles gets two chips, and the URL from one of them', () => {
  const r=paintProfile(person({role:'defender',roles:['defender','midfielder'],
    roleApps:{defender:3,midfielder:1}}),'midfielder');
  const left=r.bar.kids.filter(n=>n.className==='pl-grp')[0];
  const chips=left.kids.filter(n=>n.tag==='button');
  eq(chips.length,2);
  deepEq(chips.map(c=>c.innerHTML),['Defender','Midfielder']);
  eq(chips[1].className,'chip role on','the role asked for in the URL is the one lit');
  deepEq(r.labels.slice(2,3),['Pass Success (total)'],'and the tiles are that role-s');
  eq(chips[0].title,'3 matches in this position');
});

test('a profile with no minutes refuses Per 90 rather than drawing dashes', () => {
  const r=paintProfile(person({role:'striker',roles:['striker'],roleApps:{striker:1},
    timed:false,min:0}));
  const right=r.bar.kids.filter(n=>n.className==='pl-grp right')[0];
  const p90=right.kids[1];
  ok(p90.disabled,'the button is off');
  ok(/no minutes to divide by/.test(p90.title),'and says why');
  notOk(p90.on&&p90.on.click,'a button nobody may press is given nothing to do');
});
