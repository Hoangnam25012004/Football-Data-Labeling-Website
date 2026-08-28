/* What the Stats tab downloads.

   Two buttons over one body of numbers: the four category tables, for each
   side. XLSX takes them as eight sheets — shooting_home … other_away — and CSV,
   which holds one table and not eight, takes them stacked in a single file
   under those same names. Both are built from the SAME worksheets, so the pair
   cannot disagree about a figure; most of what is below is checking that, and
   that a sheet is its tab — same columns, same order, same padded squad.

   The spreadsheet library belongs to the browser (a CDN <script>), so the
   sandbox is handed a stand-in that writes nothing and keeps everything given
   to it. Turning 0.6 and "0.0%" into the text 60.0% is the real library's job
   and is not retested here. What IS tested is that a percentage reaches it as a
   number with a format beside it, rather than as the words "60.0%" — that is
   the difference between a column Excel can average and one it cannot. */
const vm=require('vm');
const {grabFunction,grabConst,SHARED,STATS,readSrc}=require('./harness');
const {test,eq,ok,notOk,deepEq}=require('./tiny-test');

/* A spreadsheet library that keeps what it is handed: a worksheet IS its rows,
   so every assertion below reads the export's own output rather than a
   re-implementation of Excel. */
function recorder(){
  const col=c=>{let s='',n=c+1;while(n>0){s=String.fromCharCode(64+(n-1)%26+1)+s;n=Math.floor((n-1)/26);}return s;};
  return {utils:{
    aoa_to_sheet:aoa=>({aoa}),
    encode_range:r=>col(r.s.c)+(r.s.r+1)+':'+col(r.e.c)+(r.e.r+1),
    // the real one formats every cell; here a formatted cell keeps both halves
    // visible, so a test can see which of the two went into the CSV
    sheet_to_csv:ws=>ws.aoa.map(r=>r.map(c=>c&&c.z?c.v+'@'+c.z:c).join(',')).join('\n')
  }};
}

/* The export half of stats-view.js, lifted out and run over one match. */
function exporter(state){
  const ctx={console,Math,JSON,Date,XLSX:recorder()};
  ctx.globalThis=ctx;
  vm.createContext(ctx);
  vm.runInContext([SHARED,
    'var rows='+JSON.stringify(state.rows||[])+';',
    'var meta='+JSON.stringify(state.meta||{home:'Home',away:'Away',sport:'football'})+';',
    'var lineups='+JSON.stringify(state.lineups||{})+';',
    'var dur='+JSON.stringify(state.dur||{enabled:false,halfLen:45,h1Start:0,h1End:0,h2Start:0,h2End:0})+';',
    grabConst('STAT_CATS',STATS,'Stats/stats-view.js'),
    grabConst('PCT_CELL',STATS,'Stats/stats-view.js'),
    ['statCell','catSheet','buildSheets','buildCsv']
      .map(n=>grabFunction(n,STATS,'Stats/stats-view.js')).join('\n'),
    ';globalThis.P={statCell,catSheet,buildSheets,buildCsv,STAT_CATS};'
  ].join('\n'),ctx,{filename:'Stats/stats-view.js-extract.js'});
  return ctx.P;
}

/* ---- one match: eleven a side, a striker who shot five times and scored one ---- */
const XI=['1','2','3','6','8','9','10','11','12','13','14'];
const NAMES={1:'Barclett',2:'Frederick',3:'Thomas',6:'Doxilly',8:'Henville',9:'Edward',
  10:'Richard',11:'Stanislas',12:'Joseph',13:'Pearson',14:'Elva'};
const side=dir=>({xi:XI.map(no=>({no,x:50,y:50})),subs:['17','19'],dir,
  roster:Object.keys(NAMES).map(no=>({no,name:NAMES[no]}))});
const DUR={enabled:true,halfLen:45,h1Start:0,h1End:2760,h2Start:3000,h2End:5940};
const ev=(t,team,event,playerFrom)=>({t,team,event,playerFrom});
const ROWS=[
  ev(100,'home','goal','11'),ev(200,'home','shot on target','11'),ev(300,'home','shot on target','11'),
  ev(400,'home','shot off target','11'),ev(500,'home','blocked shot','11'),
  ev(600,'home','tackle success','3'),ev(650,'home','tackle fail','3'),
  ev(700,'home','corner-kick','2'),ev(750,'home','pass success','14'),ev(800,'home','pass fail','14'),
  ev(900,'away','goal','9'),ev(950,'away','shot on target','9')
];
const P=exporter({rows:ROWS,meta:{home:'Saint Lucia',away:'Aruba',sport:'football'},
  lineups:{home:side('lr'),away:side('rl'),history:[]},dur:DUR});
const SHEETS=P.buildSheets();
const byName=n=>SHEETS.find(s=>s[0]===n)[1].aoa;
const rowFor=(n,no)=>byName(n).slice(1).find(r=>String(r[0])===String(no));

/* ================= the twelve ================= */

test('twelve sheets, six per side, in the order the tabs are read', () => {
  deepEq(SHEETS.map(s=>s[0]),
    ['shooting_home','distribution_home','defensive_home',
     'goalkeeper_home','setPieces_home','fouls_home',
     'shooting_away','distribution_away','defensive_away',
     'goalkeeper_away','setPieces_away','fouls_away']);
  // Excel refuses a sheet name over 31 characters, and would refuse the whole book
  SHEETS.forEach(s=>ok(s[0].length<=31,s[0]+' fits a worksheet name'));
});

test('a sheet is its tab: the same columns, in the same order', () => {
  ['home','away'].forEach(team=>Object.keys(P.STAT_CATS).forEach(cat=>{
    deepEq(byName(cat+'_'+team)[0],
      ['No','Player','Minutes Played'].concat(P.STAT_CATS[cat].map(c=>c[0])),
      cat+'_'+team+' carries its category, behind No / Player / Minutes Played');
  }));
});

test('shooting_home is the shooting table, player for player', () => {
  const head=byName('shooting_home')[0];
  eq(head[3],'Goals'); eq(head[11],'Shooting Accuracy');
  const r=rowFor('shooting_home','11');
  eq(r[1],'Stanislas','the name, off the same roster the table reads');
  eq(r[2],90,'the minutes he played');
  eq(r[3],1,'his goal'); eq(r[6],5,'his five shots'); eq(r[7],3,'three of them on target');
  eq(byName('shooting_home').length,XI.length+1,'the padded squad, one header row above it');
});

test('each side is its own side', () => {
  eq(rowFor('shooting_away','9')[3],1,"Aruba's goal is on Aruba's sheet");
  eq(rowFor('shooting_home','9')[3],0,'and not on the other one');
  eq(rowFor('defensive_home','3')[3],2,'a tackle lands under Defensive, not Shooting');
  eq(rowFor('distribution_home','14')[3],2,'a pass under Distribution');
  eq(rowFor('setPieces_home','2')[8],1,'and a corner under Set Pieces');
});

/* ================= formatting ================= */

test('a percentage goes in as a number with a format, not as the word for one', () => {
  const acc=rowFor('shooting_home','11')[11];
  eq(acc.t,'n','a number'); eq(acc.v,0.6,'three on target out of five');
  eq(acc.z,'0.0%','wearing the format that spells it 60.0%');
  eq(rowFor('shooting_home','1')[11].v,0,'a man who never shot reads 0.0%, not blank');
  eq(rowFor('distribution_home','14')[5].v,0.5,'and it is the same cell in every category');
});

test('a squad number and a minute count are numbers too, so a column sorts', () => {
  const r=rowFor('shooting_home','11');
  eq(typeof r[0],'number','No'); eq(typeof r[2],'number','Minutes Played');
  eq(typeof P.statCell(4),'number','a plain tally stays a plain number');
  eq(P.statCell('Elva'),'Elva','and text stays text');
});

test('a player tagged by name keeps his name in the No column', () => {
  const Q=exporter({rows:[ev(10,'home','goal','Elva')],lineups:{},dur:DUR});
  eq(Q.buildSheets().find(s=>s[0]==='shooting_home')[1].aoa[1][0],'Elva');
});

test('every sheet carries its widths and a filter across the header row', () => {
  SHEETS.forEach(([name,ws])=>{
    eq(ws['!cols'].length,ws.aoa[0].length,name+': a width per column');
    ok(new RegExp('^A1:[A-Z]+'+ws.aoa.length+'$').test(ws['!autofilter'].ref),
       name+': the filter covers the table, header row down to the last player');
  });
});

/* ================= the CSV ================= */

const CSV=P.buildCsv();

test('one file, eight tables, each under the name of its sheet', () => {
  const heads=CSV.split('\n').filter(l=>l.slice(0,4)==='### ').map(l=>l.slice(4));
  deepEq(heads,SHEETS.map(s=>s[0]),'the eight, in the order the workbook has them');
  ok(/\n\n### distribution_home\n/.test(CSV),'a blank line before the next table');
  ok(/### shooting_home\nNo,Player,Minutes Played,Goals/.test(CSV),'and its header row right under its name');
  eq(CSV.slice(-1),'\n','the file ends on a newline');
});

test('the CSV is the workbook, not a second reading of the match', () => {
  const blocks=CSV.replace(/\n$/,'').split('\n\n');
  eq(blocks.length,SHEETS.length,'one block per sheet');
  blocks.forEach((block,i)=>{
    const lines=block.split('\n');
    eq(lines[0],'### '+SHEETS[i][0],'block '+i+' names its sheet');
    eq(lines.length-1,SHEETS[i][1].aoa.length,'and holds every one of its rows');
    eq(lines[1],SHEETS[i][1].aoa[0].join(','),'starting with that sheet\u2019s header row');
  });
});

/* ================= the two buttons ================= */

const VIEW=readSrc('Stats/stats-view.js');

test('the buttons download those, and nothing else', () => {
  ok(/XLSX\.writeFile\(wb,matchName\(\)\+'_stats\.xlsx'\)/.test(VIEW),
     'one workbook, named for what is in it');
  ok(/a\.download=matchName\(\)\+'_stats\.csv'/.test(VIEW),
     'and one CSV — not one download per sheet');
  ok(/new Blob\(\['\\ufeff'\+buildCsv\(\)\]/.test(VIEW),
     'with the BOM Excel needs to read it as UTF-8');
  notOk(/eventsSheet|passSheet|teamStatsSheet|buildData/.test(VIEW),
     'and the sheets that are no longer exported are no longer built');
});
