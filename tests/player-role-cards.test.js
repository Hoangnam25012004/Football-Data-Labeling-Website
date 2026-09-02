/* Player roles and the position board: where a man has stood, drawn back.

   Two things are being pinned down here.

   The first is where a role comes from. Not a guess off the numbers — the square
   the analyst put his dot in on the formation board, which every report already
   carries as `pos` on each XI entry. posFigures() reads that board the way
   gkShirts() reads it for the keeper, and the fifteen outfield squares map onto
   Defender / Midfielder / Striker with nothing left over and nothing counted twice.
   His role is the job of the FIRST square he played — where he was introduced,
   which does not move as the campaign adds matches.

   The second is that the board REPORTS and no longer acts. It was a filter once:
   a click on a square chose the row of four tiles for the job that square belonged
   to. Those tiles went on 2026-09-03 (see docs/player-season-table-design.md), and
   with them the click, the role segment in the URL and the Total / Per 90 bar. What
   is left is a picture — a square lit for everywhere he has stood, nothing at all
   where he has not, every square of his role lit together, and the badge beside his
   name saying the same role. Nothing here is a button and nothing listens.

   Arithmetic is EXECUTED: posFigures and playerIndex are lifted out of app.js by
   name and run in a vm against hand-written line-ups, the way
   tests/player-data.test.js runs playerIndex. Rendering is read as source, as
   every other client test does. */
const vm=require('vm');
const {test,eq,deepEq,ok,notOk}=require('./tiny-test');
const {grabFunction,readSrc,SHARED}=require('./harness');

const APPJS=readSrc('client/assets/app.js');
const APPCSS=readSrc('client/assets/app.css');

const profile=/function renderPlayerProfile\([^)]*\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
const headCard=/function playerHead\([^)]*\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
const boardFn=/function positionBoard\([^)]*\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
const catTabs=/function catTabs\([^)]*\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
const matchTable=/function playerMatchTable\([^)]*\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];

/* ---------- app.js's own helpers, running for real ---------- */
const LIFT=['playerIndex','aliasMap','sumStats','playerCards','gkFigures','gkCell','posFigures',
            'minsTotal'];
/* the role block whole: the two tables and the three lookups built off them. One
   contiguous run in app.js, taken in one piece so the lookups cannot drift from
   the tables they sit beside. MODES and the four tile sets used to be part of this
   run; both went with the row of tiles. */
const ROLEBLOCK=/\n  \/\* -+ roles -+[\s\S]*?ROLE_OF\[p\] = r\[0\]; \}\);\n  \}\);/.exec(APPJS)[0];
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
    ';globalThis.A={'+LIFT.join(',')+',ROLES,ROLE_POS,ROLE_OF,ROLE_LABEL,ROLE_BADGE,'
      +'PLAYER_CATS,FORMATION_GRID,newStat,pct};'
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
  notOk(A.ROLE_OF.GK,'GK maps to no role, so no square on the board can ever claim him');
  notOk(A.ROLES.some(r=>r[0]==='goalkeeper'),'and there is no fourth entry pretending otherwise');
});

test('the three groups are the ones that were asked for', () => {
  deepEq(A.ROLE_POS.defender,['RB','CB','LB','RWB','LWB']);
  deepEq(A.ROLE_POS.midfielder,['CDM','CM','RM','LM','CAM']);
  deepEq(A.ROLE_POS.striker,['LW','RW','CF','RF','LF']);
  deepEq(A.ROLES.map(r=>r[0]),['defender','midfielder','striker'],'read from the back line forward');
  deepEq(A.ROLES.map(r=>r[2]),['DEF','MID','ST'],'and each has a badge');
});

/* ================= the tile tables are gone ================= */

test('no table of tiles is left in app.js, nor anything that read one', () => {
  ['ROLE_KPIS','GK_KPIS','FALLBACK_KPIS','MODES','function per90','function playerCtl']
    .forEach(n=>notOk(APPJS.indexOf(n)>=0,n+' is still in app.js'));
});

test('the profile draws no tile at all', () => {
  /* Appearances and Minutes are the Season table's own last two columns. A tile
     repeating either of them under the board printed the same figure twice on one
     screen, which is the rule this page keeps everywhere else. */
  eq((profile.match(/kpi\(/g)||[]).length,0,'not one kpi() call is left in the profile');
  notOk(/kpis/.test(profile),'and it asks for no tile grid, six-wide or two-wide');
  ok(/\.kpis\.six\{/.test(APPCSS),'.kpis.six stays in the CSS — Team Data still draws it');
  notOk(/\.kpis\.two\{/.test(APPCSS),'.kpis.two took its rule with it');
});

test('Shooting Accuracy is still one ratio, in the table it belongs to', () => {
  /* This used to check the striker tile's caption against the column below it —
     one ratio, not two. The tile is gone; the column is the only place the figure
     is printed now, and it still comes out of shared.js. */
  const s=stat({shotsOn:8,totalShots:18});
  const col=A.PLAYER_CATS.shooting.filter(c=>c[0]==='Shooting Accuracy')[0];
  eq(col[1](s),'44.4%');
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

test('one square every week is one role, and the board counts the matches at it', () => {
  const p=A.playerIndex(three(['CB'],['CB'],['CB']))[0];
  deepEq(p.roles,['defender']);
  eq(p.role,'defender');
  eq(p.posApps.CB,3,'three matches at centre back, which is what its tooltip says');
  eq(p.pos0,'CB');
});

test('two squares are two lit cells, and roles keep the fixed order', () => {
  const p=A.playerIndex(three(['CM'],['CB'],['CB']))[0];
  deepEq(p.roles,['defender','midfielder'],'never the order they turned up in');
  deepEq(Object.keys(p.posApps).sort(),['CB','CM'],'and both squares light up');
  eq(p.posApps.CB,2);
  eq(p.posApps.CM,1);
});

test('a man who moves inside one match lights both squares', () => {
  const p=A.playerIndex(three(['LB','LM']))[0];
  deepEq(p.roles,['defender','midfielder'],'both are true of that match');
  eq(p.posApps.LB,1);
  eq(p.posApps.LM,1);
  eq(p.role,'defender','but he began at left back');
});

test('a square is counted once per match however many times it appears', () => {
  const p=A.playerIndex(three(['CB','CB','LB']))[0];
  eq(p.posApps.CB,1,'standing at centre back twice in one match is one match at centre back');
  eq(p.posApps.LB,1);
});

/* ---- the default card: the FIRST square he played ---- */

test('the card a profile opens on is the job of his first square', () => {
  eq(A.playerIndex(three(['CM'],['CB'],['CB']))[0].role,'midfielder',
     'he began in midfield, so midfield is what opens — not the role he played most');
  eq(A.playerIndex(three(['CB'],['CM'],['CM']))[0].role,'defender',
     'and the other way round, by the same rule');
});

test('the first square is read off the earliest match, not the earliest read', () => {
  const p=A.playerIndex(three(['LW'],['CB']))[0];
  eq(p.pos0,'LW','matches arrive in kickoff order, so matches[0] is where he began');
  eq(p.role,'striker');
  /* the campaign grows; where he started does not move */
  const later=A.playerIndex(three(['LW'],['CB'],['CB'],['CB']))[0];
  eq(later.role,'striker','three more at the back cannot rewrite where he was introduced');
});

test('a match that placed nobody is skipped, not taken as no position at all', () => {
  const p=A.playerIndex([agg({m:{slug:'m0',date:'2025-01-01'},players:{'7':stat()}}),
                         ...three(['CB'])])[0];
  eq(p.pos0,'CB','the earliest match that placed him is the one that answers');
  eq(p.role,'defender');
});

test('a man no board ever placed has no role, and nothing pretends he does', () => {
  const p=A.playerIndex([agg({players:{'7':stat({goals:1})}})])[0];
  deepEq(p.roles,[]);
  eq(p.role,'');
  eq(p.pos0,'');
  deepEq(p.posApps,{});
});

test('a keeper is still a keeper, and roles changed none of his figures', () => {
  const p=A.playerIndex([agg({
    players:{'1':stat({saves:9})},names:{'1':'Barclett'},mins:{'1':played(90)},
    gk:{'1':{conceded:1,clean:0,known:1}},pos:{'1':{start:'GK',all:['GK']}}
  })])[0];
  ok(p.gk,'the GK square settles it for the campaign, exactly as before');
  deepEq(p.gkTotal,{conceded:1,clean:0,known:1},'and what went past him is untouched');
  deepEq(p.roles,[],'a keeper is claimed by none of the three');
});

/* ================= what is drawn ================= */

test('the board is a picture: no button, no listener, no role in the URL', () => {
  notOk(/addEventListener/.test(boardFn),'the card hangs nothing');
  notOk(/location\.hash/.test(boardFn),'and no square can navigate');
  notOk(/data-role|aria-pressed/.test(boardFn),
     'nor carry the attributes a click used to be dispatched on');
  ok(/el\('div', 'pl-pz'/.test(boardFn),'a square is a div, not a button');
  notOk(/'button'/.test(boardFn),'nothing in here is a button at all');
});

test('a keeper gets no board, and a man no board placed gets none either', () => {
  ok(/if \(who\.gk \|\| !who\.roles\.length\) return null;/.test(boardFn),
     'the two who are left out, in one line');
  notOk(/chip/.test(boardFn),'and there are no chips — there never were, since the squares replaced them');
});

test('his role is the one his first square gives him, and nothing can override it', () => {
  ok(/var role = who\.gk \? '' : who\.role;/.test(profile),
     'read straight off the man; a keeper has none');
  notOk(/wantedRole|roles\.indexOf/.test(profile),'nothing asks the URL what role to read');
  ok(/function renderPlayerProfile\(body, who, people, wanted\)/.test(profile),
     'and the parameter it was asked with is gone');
  ok(/renderPlayerProfile\(body, who, people, rest\[2\]\)/.test(APPJS),
     'so the route passes three segments, not four');
});

test('switching category no longer appends anything, and Team Data is untouched', () => {
  ok(/function catTabs\(cat, base, tabs\)/.test(catTabs),'three arguments now, not four');
  ok(/\(base \|\| '#\/data\/team\/'\) \+ t\[0\];/.test(catTabs),
     'the href is the base and the category, full stop');
  notOk(/tail/.test(catTabs),'no fourth segment is built anywhere');
  ok(/body\.appendChild\(catTabs\(cat\)\);/.test(APPJS),
     'Team Data still calls it with one argument and builds the href it always did');
});

test('the badge says his role, and the booking record prints for everybody', () => {
  ok(/pl-role">GK/.test(headCard),'a keeper is asked about first, and his badge is unchanged');
  ok(/esc\(ROLE_BADGE\[role\]\)/.test(headCard),'the other three come off one table');
  ok(/' · ' \+ who\.cards\.y \+ 'Y · ' \+ who\.cards\.r \+ 'R'/.test(headCard),
     'the meta line carries the booking record');
  notOk(/who\.gk \|\| role \? ' · ' \+ who\.cards\.y/.test(headCard),
     'and no longer only for a keeper and a man with a role — the tiles that carried it for the third are gone');
});

test('the role filter does not reach the table under it', () => {
  ok(/function playerMatchTable\(who, cat\)/.test(matchTable),'no role, no reading');
  notOk(/role|mode|per90/.test(matchTable),'a match row is what happened that match, whole');
});

test('nothing on this card prints a shirt number', () => {
  notOk(/who\.no|p\.no|pl-shirt/.test(boardFn),
     'a number belongs to a match rather than to a man — the rule the rest of this page keeps');
});

test('the new markup brings its own styles and borrows the rest', () => {
  ok(/\.pl-duo\{/.test(APPCSS),'the two-column row is defined');
  ok(/\.pl-season\{/.test(APPCSS),'and the card that sits in its right half');
  notOk(/\.pl-duo-l\{/.test(APPCSS),'the left column is the board itself now, not a wrapper');
  ok(/\.pl-pos\{/.test(APPCSS)&&/\.pl-pitch\{/.test(APPCSS)&&/\.pl-pz\{/.test(APPCSS),
     'the board is defined');
  ok(/\.pl-pz\.on\{/.test(APPCSS),'a lit square takes the amber of the badge');
  notOk(/\.pl-ctl\{|\.pl-grp\{/.test(APPCSS),'and the reading bar took its rules with it');
  notOk(/^\.chip\{/m.test(APPCSS),'.chip itself is left where site.css defines it');
});

test('a square that cannot be pressed does not look pressable', () => {
  const board=/\.pl-pz\{[^}]*\}/.exec(APPCSS)[0];
  notOk(/cursor:pointer/.test(board),'no hand cursor over something inert');
  notOk(/\.pl-pz:hover\{/.test(APPCSS),'and no hover state to promise a click');
});

test('the board does not answer to the tagger-s .pz, nor it to this one', () => {
  /* shared.css styles .pz for the formation board, is loaded the first time
     anyone opens a match, and stays in the document afterwards. Its .pz carries
     pointer-events:none — these squares would look clickable and do nothing. */
  const SHAREDCSS=readSrc('shared.css');
  ok(/\.pz\{[^}]*pointer-events:none/.test(SHAREDCSS),'which is exactly what it carries');
  /* selectors only — this file's own comments talk about .pz, and saying so is
     the opposite of the mistake being guarded against */
  const rules=APPCSS.replace(/\/\*[\s\S]*?\*\//g,'');
  notOk(/(^|[^-\w])\.pz[-.{ ]/.test(rules),'so no selector here is called .pz');
  notOk(/pl-pz/.test(SHAREDCSS),'and nothing there is called pl-pz');
  ok(/class="pl-pz-dot"/.test(boardFn)&&/'pl-pz' \+ \(r === role/.test(boardFn),
     'the board writes only its own vocabulary');
});

test('the profile hangs no listener on the document', () => {
  /* playerHead's player menu has to, and takes it off again on the way out.
     Nothing else here does, so nothing else can hold a detached node alive. */
  notOk(/document\.addEventListener/.test(profile+boardFn));
});

/* ================= the profile, actually drawn =================
   Everything above reads the render as source, which cannot catch a name that is
   not in scope or a field read off undefined. So the whole of renderPlayerProfile
   is run here against a DOM small enough to reason about, and the two tiles and
   the board are read back out of it. This is the test that fails if the page
   would throw. The Season card in the other half of that row has its own file,
   tests/player-season-table.test.js, which paints the card alone. */
function paintProfile(person){
  const made=[];
  const mk=tag=>{
    const n={tag,className:'',innerHTML:'',title:'',type:'',disabled:false,kids:[],
      style:{},attrs:{},
      appendChild(c){n.kids.push(c);return c;},
      addEventListener(ev,fn){(n.on=n.on||{})[ev]=fn;},
      setAttribute(k,v){n.attrs[k]=String(v);},removeAttribute(k){delete n.attrs[k];},
      getAttribute:k=>(k in n.attrs?n.attrs[k]:null),
      closest:()=>null,
      classList:{toggle(c,on){n.className=on?(n.className+' '+c):n.className.replace(' '+c,'');},
                 add(){},remove(){},contains:()=>false},
      querySelectorAll:sel=>made.filter(x=>x.sel===sel)};
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
  const NAMES=['esc','num','kpi','catCols','minsTotal','minsOne','gkCell',
               'catTabs','playerHead','seasonRows','seasonCard','positionBoard',
               'playerMatchTable','renderPlayerProfile'];
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
    ';globalThis.OUT=renderPlayerProfile;globalThis.SEASONROWS=seasonRows;',
    '})();'
  ].join('\n'),ctx,{filename:'client/assets/app.js-render.js'});

  const body=mk('div');
  ctx.OUT(body,person,[person],'shooting');
  /* One row: the board on the left, the Season card on the right. A player with
     no board gets no row at all — the card is appended to the body on its own. */
  const duo=body.kids.filter(n=>n.className==='pl-duo')[0]||null;
  const season=(duo?duo.kids:body.kids).filter(n=>n.className==='card pl-season')[0]||null;
  const board=duo?duo.kids.filter(n=>n.className==='card pl-pos')[0]||null:null;
  const pitch=board?board.kids.filter(n=>n.className==='pl-pitch')[0]:null;
  /* every square drawn on it, in the order the two loops walked the grid */
  /* the class list exactly, not a substring match: the direction arrow beside them
     is .pl-pz-arrow, and /\bpl-pz\b/ would take it for a square */
  const squares=pitch?pitch.kids.filter(n=>n.className.split(' ').indexOf('pl-pz')>=0).map(b=>({
    pos:(/class="pl-pz-lb">([^<]*)</.exec(b.innerHTML)||[])[1],
    tag:b.tag, on:b.className.split(' ').indexOf('on')>=0,
    role:b.getAttribute('data-role'), pressed:b.getAttribute('aria-pressed'),
    title:b.title, left:b.style.left, top:b.style.top, node:b})):[];
  return {body,duo,season,board,pitch,squares,ctx,seasonRows:ctx.SEASONROWS,
    /* every .kpi tile anywhere in the profile — there should be none */
    tiles:body.kids.filter(n=>/\bkpis\b/.test(n.className))};
}
/* a fully-formed player, the shape playerIndex hands the view */
function person(o){
  o=o||{};
  const m={m:Object.assign({slug:'m1',id:'m1',date:'2025-06-11',opponent:'Barbados',
                            side:'home',result:'W'},o.m||{}),
           gf:2,ga:1,stat:stat(o.total),mins:played(90),cards:{y:0,r:0},gk:null,pos:null};
  return Object.assign(who(o),{key:'n:elva',name:'Elva',matches:o.matches||[m],gk:!!o.isGk,
    roles:o.roles||[],role:o.role||'',posApps:o.posApps||{},pos0:o.pos0||'',
    total:stat(o.total),min:o.min===undefined?360:o.min,
    timed:o.timed===undefined?true:o.timed});
}

test('the row holds exactly two things: the board, then the Season card', () => {
  const r=paintProfile(person({role:'defender',roles:['defender'],posApps:{CB:4}}));
  ok(r.duo,'a .pl-duo row');
  deepEq(r.duo.kids.map(n=>n.className),['card pl-pos','card pl-season'],
     'the board is the left column itself — there is no wrapper round it any more');
  deepEq(r.tiles,[],'and no tile strip anywhere on the profile');
});

test('a player with no board gets the Season card at full width, not an empty half', () => {
  [person({isGk:true,total:{saves:9},min:360}),                  // a keeper
   person({total:{goals:3,assists:2}})].forEach(p=>{             // nobody ever placed him
    const r=paintProfile(p);
    notOk(r.board,'no board');
    notOk(r.duo,'so no two-column row either');
    ok(r.season,'but the Season card is still his — it does not change with the job');
    ok(r.body.kids.indexOf(r.season)>=0,'and it sits straight on the body');
  });
});

test('a man no board placed keeps his booking record', () => {
  const r=paintProfile(person({total:{goals:3,assists:2,keyPasses:6},cards:{y:2,r:1}}));
  deepEq(r.tiles,[],'the Cards tile he used to get went with every other tile');
  /* which is exactly why the meta line has to be carrying it */
  const meta=r.body.kids.filter(n=>n.className==='card pl-head')[0]
                  .kids.filter(n=>n.className==='pl-meta')[0];
  ok(/2Y · 1R/.test(meta.innerHTML),'and it is printed on the meta line instead');
});

/* the man in the picture: two on the left flank, one on the right */
const WINGER={role:'striker',roles:['midfielder','striker'],
              posApps:{LM:1,LW:2,RW:1},pos0:'LW'};

test('the board draws a square for every position he played, and nothing else', () => {
  const r=paintProfile(person(WINGER));
  ok(r.board,'a Position card');
  deepEq(r.squares.map(s=>s.pos).sort(),['LM','LW','RW'],
     'three squares out of eighteen — the rest of the pitch is left empty');
  /* which job a square belongs to is no longer an attribute on it — nothing reads
     one back any more. The title says it, and that is where it is checked. */
  ok(/^Midfielder · /.test(r.squares.filter(s=>s.pos==='LM')[0].title));
  ok(/^Striker · /.test(r.squares.filter(s=>s.pos==='LW')[0].title));
});

test('the squares land where the tagger would have drawn them', () => {
  const r=paintProfile(person(WINGER));
  const at=p=>r.squares.filter(s=>s.pos===p)[0];
  /* reading left to right: the top band is the left flank, the bottom the right,
     and a winger sits one column in from the forwards. FORMATION_GRID walked
     through effRow/effCol with dir 'lr' — the same two functions gridHTML uses. */
  eq(at('LM').top,'0%','the left flank runs along the top');
  eq(at('LW').top,'0%');
  eq(at('RW').top,'75%','and the right flank along the bottom');
  eq(at('LM').left,(3*100/6)+'%');
  eq(at('LW').left,(4*100/6)+'%','a winger is further forward than a wide midfielder');
  eq(at('RW').left,(4*100/6)+'%','and his mirror is in the same column');
});

test('every square of his role lights up, not just the first one he stood in', () => {
  const r=paintProfile(person(WINGER));
  deepEq(r.squares.filter(s=>s.on).map(s=>s.pos).sort(),['LW','RW'],
     'a winger-s role is no more about the left wing than the right, so both say so');
  eq(r.squares.filter(s=>s.pos==='LM')[0].on,false,'and the job he did not open on stays dark');
});

test('a square says which job it feeds and how often he took it', () => {
  const r=paintProfile(person(WINGER));
  eq(r.squares.filter(s=>s.pos==='LW')[0].title,'Striker · 2 matches at LW');
  eq(r.squares.filter(s=>s.pos==='LM')[0].title,'Midfielder · 1 match at LM');
});

test('the board is drawn on the channel-s own game', () => {
  ok(/var sport = \(state\.channel && state\.channel\.sport\) \|\| 'football';/.test(boardFn),
     'the same fallback the channel card takes');
  ok(/pitchSVG\(sport\)/.test(boardFn),'the tagger-s pitch, not a second drawing of one');
  ok(/pitch\.style\.aspectRatio = dim\.w \+ ' \/ ' \+ dim\.h;/.test(boardFn),
     'and its shape off PITCH_DIMS — a futsal court is not a football pitch-s proportions');
  ok(/\.replace\(' id="pv-dots"', ''\)/.test(boardFn),
     'the tagger-s own id does not travel with it');
});

test('a drawn square is inert: not a button, and nothing to press', () => {
  const r=paintProfile(person(WINGER));
  ok(r.squares.every(s=>s.tag==='div'),'a div, so no keyboard focus and no press');
  ok(r.squares.every(s=>s.pressed===null),'no aria-pressed, because nothing is pressed');
  ok(r.squares.every(s=>s.role===null),'no data-role, because no click reads one back');
  ok(r.squares.every(s=>!s.node.on),'and not one of them carries a listener');
  notOk(r.pitch.on,'nor does the pitch they sit on');
});

test('the badge and the lit squares say the job of his FIRST square', () => {
  const r=paintProfile(person(WINGER));       // began at LW
  deepEq(r.squares.filter(s=>s.on).map(s=>s.pos).sort(),['LW','RW'],'the striker-s two');
  const head=r.body.kids.filter(n=>n.className==='card pl-head')[0];
  ok(/pl-role">ST</.test(head.kids[0].innerHTML),'and the badge beside his name agrees');
});

test('a man with one position still gets his board', () => {
  const r=paintProfile(person({role:'defender',roles:['defender'],posApps:{CB:4},pos0:'CB'}));
  ok(r.board,'where he plays is worth saying even when there is nothing to choose');
  deepEq(r.squares.map(s=>s.pos),['CB']);
  eq(r.squares[0].on,true);
});

test('a profile with no minutes draws, and says so where minutes are printed', () => {
  const r=paintProfile(person({role:'striker',roles:['striker'],posApps:{CF:1},
    timed:false,min:0}));
  ok(r.duo&&r.season,'the page draws rather than throwing');
  /* the only place minutes are printed on this row now is the table's last column */
  ok(/—/.test(r.season.innerHTML+r.season.kids.map(n=>n.innerHTML).join('')),
     'and no line-up means no minutes, not zero of them');
});
