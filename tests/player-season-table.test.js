/* The Season table: what a player has played, by league and by season.

   It stands where four tiles used to, in the right-hand half of the row the
   position board opens (docs/player-season-table-design.md). Four columns, and
   the same four for a centre back, a striker and a keeper alike — that a table
   does not change with the job he did is the whole reason it replaced the tiles.

   Three things are pinned down here.

   The first is the grouping. One row per (league, season) pair. Both fields are
   database columns nobody has filled in yet, so today every match falls into one
   group and the table has one row reading "— · — · apps · minutes" — but the
   grouping is real from the start, and the tests below feed it matches that DO
   carry the pair, so the day the database is filled in nothing has to be written.

   The second is that minutes are printed by the rule that already exists.
   seasonRows() makes the same three reductions playerIndex() makes over a whole
   campaign, and the result goes through minsTotal() itself — so "—" for a group
   no line-up ever answered for, and a leading "~" where a match had no Duration
   boundaries, behave here exactly as they do on the tile beside it.

   The third is that the card only reports: no button, no listener, nothing to
   press. seasonRows is EXECUTED; seasonCard is painted against a DOM small enough
   to reason about, the way tests/player-role-cards.test.js paints the profile. */
const vm=require('vm');
const {test,eq,deepEq,ok,notOk}=require('./tiny-test');
const {grabFunction,readSrc,SHARED}=require('./harness');

const APPJS=readSrc('client/assets/app.js');
const APPCSS=readSrc('client/assets/app.css');
const SUPA=readSrc('client/assets/supa.js');

const profile=/function renderPlayerProfile\([^)]*\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
const rowsFn=/function seasonRows\(who\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];
const cardFn=/function seasonCard\(who\) \{[\s\S]*?\n  \}/.exec(APPJS)[0];

/* ---------- the two functions, running for real ----------
   A DOM just big enough for el() to build a card in, then seasonRows and
   seasonCard lifted out of app.js by name. Same shape as the painter in
   tests/player-role-cards.test.js, minus everything the card does not touch. */
function paintSeason(who){
  const made=[];
  const mk=tag=>{
    const n={tag,className:'',innerHTML:'',title:'',kids:[],style:{},attrs:{},
      appendChild(c){n.kids.push(c);return c;},
      addEventListener(ev,fn){(n.on=n.on||{})[ev]=fn;},
      setAttribute(k,v){n.attrs[k]=String(v);},
      getAttribute:k=>(k in n.attrs?n.attrs[k]:null),
      classList:{toggle(){},add(){},remove(){},contains:()=>false}};
    made.push(n); return n;
  };
  const ctx={console,JSON,Math,Date,String,Number,Object,Array,Boolean,RegExp,isFinite,
    location:{hash:''},
    document:{createElement:mk,getElementById:()=>null,
              addEventListener(){},removeEventListener(){},querySelectorAll:()=>[]},
    window:{},state:{}};
  ctx.globalThis=ctx;
  vm.createContext(ctx);
  /* app.js is an IIFE and shared.js is global, so the lifted half goes inside a
     function scope here too — otherwise app.js's own esc() collides with the one
     shared.js declares, which is a collision the real page does not have. */
  vm.runInContext([SHARED,
    '(function(){',
    /\n  var el = function[\s\S]*?\n  \};/.exec(APPJS)[0],
    ['esc','num','minsTotal','seasonRows','seasonCard']
      .map(n=>grabFunction(n,APPJS,'client/assets/app.js')).join('\n'),
    ';globalThis.ROWS=seasonRows;globalThis.CARD=seasonCard;',
    '})();'
  ].join('\n'),ctx,{filename:'client/assets/app.js-season.js'});

  const card=ctx.CARD(who);
  const table=card.kids.filter(n=>n.className==='stbl-wrap')[0];
  /* app.js's esc() is doing its job on the way in — 90' comes out as 90&#39;.
     Read the cells back as a browser would render them, so an expectation below
     is the text on the screen rather than the entity behind it. */
  const text=s=>s.replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&amp;/g,'&');
  const cells=cls=>(table.innerHTML.match(new RegExp('class="'+cls+'">([^<]*)<','g'))||[])
    .map(s=>text(s.replace(new RegExp('^class="'+cls+'">'),'').replace(/<$/,'')));
  /* every <td> of every row, in document order, four to a row */
  const tds=(/<tbody>([\s\S]*?)<\/tbody>/.exec(table.innerHTML)[1].match(/<td[^>]*>([^<]*)</g)||[])
    .map(s=>text(s.replace(/^<td[^>]*>/,'').replace(/<$/,'')));
  const rows=[];
  for(let i=0;i<tds.length;i+=4)rows.push(tds.slice(i,i+4));
  return {card,table,rows,
    /* <th> or <th class=…>, and NOT <thead> — [^>]* would happily eat "ead" */
    heads:(table.innerHTML.match(/<th(?:\s[^>]*)?>([^<]*)</g)||[])
      .map(s=>text(s.replace(/^<th(?:\s[^>]*)?>/,'').replace(/<$/,''))),
    leagues:cells('c-lg'), seasons:cells('c-sn'),
    note:card.kids.filter(n=>n.className==='note')[0]};
}
/* ---------- fixtures ---------- */
const played=(min,exact)=>({min,sec:min*60,h1:Math.min(min,45)*60,
                            h2:Math.max(0,min-45)*60,exact:exact!==false});
/* one row of who.matches: the match, and how long he was on it */
const M=(date,league,season,mins)=>({
  m:{slug:'m'+date,id:'m'+date,date,opponent:'Barbados',side:'home',result:'W',
     league:league||'',season:season||''},
  gf:2,ga:1,mins:mins===undefined?played(90):mins,cards:{y:0,r:0},gk:null,pos:null});
/* the three fields playerIndex() adds up over the whole campaign, so a fixture
   can be handed to the card the way the view hands it one */
function man(matches){
  return {key:'n:elva',name:'Elva',matches,apps:matches.length,
    min:matches.reduce((n,r)=>n+(r.mins?r.mins.min:0),0),
    timed:matches.some(r=>r.mins),
    exact:matches.every(r=>r.mins&&r.mins.exact)};
}
const rowsOf=matches=>paintSeason(man(matches)).rows;

/* ================= the grouping ================= */

test('nothing filled in yet is ONE row, and it is his whole campaign', () => {
  const r=rowsOf([M('2025-06-11'),M('2025-06-14'),M('2025-06-18')]);
  eq(r.length,1,'three matches, one row — nobody has said which league or season');
  deepEq(r[0],['—','—','3',"270'"]);
});

test('two seasons in one league are two rows', () => {
  const r=rowsOf([M('2024-08-10','Bepro League','23/24'),
                  M('2024-08-17','Bepro League','23/24'),
                  M('2025-08-09','Bepro League','24/25')]);
  eq(r.length,2);
  deepEq(r[0],['Bepro League','24/25','1',"90'"],'newest season first');
  deepEq(r[1],['Bepro League','23/24','2',"180'"]);
});

test('two leagues in one season are two rows', () => {
  const r=rowsOf([M('2025-03-01','Bepro League','24/25'),
                  M('2025-03-08','Bepro Cup','24/25')]);
  eq(r.length,2);
  deepEq(r.map(x=>x[0]).sort(),['Bepro Cup','Bepro League']);
  ok(r.every(x=>x[1]==='24/25'&&x[2]==='1'));
});

test('a separator no name contains, so a slash cannot merge two pairs', () => {
  /* ("A/B","C") and ("A","B/C") join to the same string on any printable
     separator. They must not be one row. */
  const r=rowsOf([M('2025-03-01','A/B','C'),M('2025-03-08','A','B/C')]);
  eq(r.length,2,'two pairs, two rows');
  ok(/\\u0000/.test(rowsFn),'the key is joined on U+0000, written as an escape');
});

test('the rows add back up to the two tiles beside them', () => {
  const ms=[M('2024-08-10','Bepro League','23/24'),
            M('2025-08-09','Bepro League','24/25',played(45)),
            M('2025-08-16','Bepro Cup','24/25')];
  const who=man(ms), r=rowsOf(ms);
  eq(r.reduce((n,x)=>n+ +x[2],0),who.apps,'appearances');
  eq(r.reduce((n,x)=>n+parseInt(x[3],10),0),who.min,'and minutes');
});

test('the order is the date of the latest match in a group, not the season text', () => {
  /* "2023-24" sorts before "23/24" as text, and the wrong way round as a season.
     Ordering on the date the database actually knows sidesteps the question. */
  const r=rowsOf([M('2024-05-01','L','2023-24'),M('2025-05-01','L','23/24')]);
  deepEq(r.map(x=>x[1]),['23/24','2023-24'],'the later season is first however it is spelt');
});

test('a match with no date does not upset the order, and does not throw', () => {
  const undated=M('2025-01-01','L','A'); undated.m.date=null;
  const r=rowsOf([undated,M('2025-06-01','L','B')]);
  eq(r.length,2);
  deepEq(r.map(x=>x[1]),['B','A'],'a group nothing can place keeps to the end');
});

/* ================= minutes ================= */

test('a group no line-up answered for reads a dash, never a zero', () => {
  const r=rowsOf([M('2025-06-11','L','A',null),M('2025-06-14','L','A',null)]);
  deepEq(r[0],['L','A','2','—'],'2 appearances is known; the minutes are not');
});

test('an approximate match makes an approximate group', () => {
  const r=rowsOf([M('2025-06-11','L','A',played(90,false)),M('2025-06-14','L','A',played(90))]);
  eq(r[0][3],"~180'",'one match without Duration boundaries marks the whole total');
});

test('every match exact makes an exact group', () => {
  const r=rowsOf([M('2025-06-11','L','A'),M('2025-06-14','L','A')]);
  eq(r[0][3],"180'",'no tilde');
});

test('one group prints exactly what the Minutes tile beside it prints', () => {
  const ms=[M('2025-06-11'),M('2025-06-14',null,null,played(45,false))];
  const who=man(ms);
  /* minsTotal reads .timed/.exact/.min and nothing else, so a group and a whole
     campaign go through the same function and cannot disagree */
  eq(rowsOf(ms)[0][3],"~135'");
  ok(/minsTotal\(g\)/.test(cardFn),'the card calls it rather than formatting its own');
  eq(who.min,135);
});

/* ================= what is drawn ================= */

test('four columns, in the order the design asks for', () => {
  deepEq(paintSeason(man([M('2025-06-11')])).heads,
         ['League','Season','Appearances','Minutes']);
});

test('the card is a title and a table, and nothing else', () => {
  const r=paintSeason(man([M('2025-06-11')]));
  ok(/card-h/.test(r.card.kids[0].className));
  eq(r.card.kids[0].innerHTML,'Season');
  deepEq(r.card.kids.map(n=>n.className),['card-h','stbl-wrap'],
     'no explanatory note under it — the "—" in the two columns says it itself');
  notOk(r.note,'and none is built');
});

test('the card reports and nothing else — no button, no listener', () => {
  notOk(/addEventListener/.test(cardFn),'nothing on the card listens');
  notOk(/location\.hash/.test(cardFn),'and nothing on it navigates');
  notOk(/<button|el\('button'/.test(cardFn),'there is not a button in it');
  const r=paintSeason(man([M('2025-06-11')]));
  ok(!r.card.on&&!r.table.on,'and the painted card carries no handler either');
});

test('a league or a season somebody typed is escaped, not injected', () => {
  const r=paintSeason(man([M('2025-06-11','<b>L</b>','"A"')]));
  ok(/&lt;b&gt;L&lt;\/b&gt;/.test(r.table.innerHTML),'the markup is shown, not run');
  notOk(/<b>L<\/b>/.test(r.table.innerHTML));
});

test('it borrows the table styles rather than defining a second set', () => {
  ok(/stbl-wrap/.test(cardFn)&&/class="stbl"/.test(cardFn),
     'the same vocabulary playerTable and playerMatchTable use');
  ok(/table\.stbl \.c-lg,table\.stbl \.c-sn\{text-align:left\}/.test(APPCSS),
     'the two word columns read left, as the other text columns of this page do');
});

/* ================= how it is wired in ================= */

test('the profile draws it for everybody, keeper included', () => {
  ok(/duo\.appendChild\(seasonCard\(who\)\);/.test(profile),
     'one call, outside any branch on who he is');
  notOk(/who\.gk[^\n]*seasonCard|seasonCard[^\n]*who\.gk/.test(profile),
     'nothing asks whether he keeps goal before drawing it');
});

test('the two columns are read off the match, and are allowed to be empty', () => {
  ok(/league: m\.league \|\| '',/.test(SUPA)&&/season: m\.season \|\| '',/.test(SUPA),
     'shape() carries them through as strings');
  ok(/,league,season,/.test(SUPA),'and the select asks for them by name');
  /* which is why 0022 has to be run first — naming a column that is not there
     fails the whole query and the channel comes back empty */
  const mig=readSrc('supabase/migrations/0022_match_league_season.sql');
  ok(/add column if not exists league text;/.test(mig)&&
     /add column if not exists season text;/.test(mig),'both columns, added only');
  notOk(/drop |alter column |update public\.matches/.test(mig),
     'and the migration changes nothing that is already there');
});

test('the row it sits in collapses to one column on a phone', () => {
  const css=APPCSS.replace(/\s*\n\s*/g,'');
  ok(/\.pl-duo\{[^}]*grid-template-columns:minmax\(0,\.85fr\) minmax\(0,1\.15fr\)/.test(css),
     'the board is the narrower half — it is a drawing with a fixed shape');
  ok(/@media \(max-width:820px\)\{ ?\.pl-duo\{grid-template-columns:minmax\(0,1fr\)\}/.test(css),
     'and 820px is the breakpoint the rest of the page already uses');
});
