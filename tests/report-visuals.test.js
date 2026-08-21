/* Match-report visuals: the comparison bars, the timeline labels, the located-action
   maps and the defensive radar. report.js is one IIFE with no exports, so the functions
   under test are lifted out of the source and run against stubs for the drawing helpers —
   a rename or a behaviour change there fails here loudly. */
const fs=require('fs'), path=require('path'), vm=require('vm');
const {test,eq,ok,notOk,deepEq}=require('./tiny-test');
const {grabFunction,grabConst,loadShared}=require('./harness');

const REPORT=fs.readFileSync(path.join(__dirname,'..','Stats','report.js'),'utf8');
const S=loadShared();
const grabR=n=>grabFunction(n,REPORT,'Stats/report.js');
const grabRC=n=>grabConst(n,REPORT,'Stats/report.js');

/* a sandbox holding the shared.js helpers report.js reads as globals, plus stubs for
   the pitch/section chrome (this suite is about the numbers, not the SVG furniture) */
function makeReport(opts,names,src){
  opts=opts||{};
  const ctx={console,
    rows:opts.rows||[], lineups:opts.lineups||{home:{roster:[]},away:{roster:[]}},
    dur:{enabled:false,halfLen:45,h1Start:0,h1End:0,h2Start:0,h2End:0},
    meta:{home:opts.home||'Curacao',away:opts.away||'Saint Lucia'},
    esc:S.esc, numOf:S.numOf, pct:S.pct, evKey:S.evKey, sumTeam:S.sumTeam,
    squadNames:S.squadNames, classifyCards:S.classifyCards,
    PITCH_DIMS:{football:{w:1050,h:680}},
    eventHalf:r=>r.half||1, matchTime:t=>t,
    pitchFootball:()=>'', dirArrowSVG:()=>'', hPitchSVG:(inner)=>`<svg>${inner||''}</svg>`,
    normXY:()=>r=>({a:r.pXY,b:r.rXY}), attackDir:()=>'right',
    DEF_CATS:opts.DEF_CATS||{}};
  // a Stats-page global the report reads: own goals count to the other side
  ctx.teamGoals=team=>{const opp=team==='home'?'away':'home';
    return ctx.rows.filter(r=>r.team===team&&r.event==='goal').length
         + ctx.rows.filter(r=>r.team===opp&&/^own[ -]goal$/.test(r.event)).length;};
  vm.createContext(ctx);
  const consts=['C','TC','TRGB','TN','secTitle','legend','pc0','frac','dotv','mmss'];
  vm.runInContext(consts.map(grabRC).join('\n')
    +'\n'+(names||[]).map(grabR).join('\n')
    +'\n'+(src||'')
    // const/let bindings are not context properties — re-export everything by name so the
    // tests can call the arrow-function helpers (takeOnMapsPage, TAKEON_CAT, …) as well
    +'\n;Object.assign(globalThis,{'+consts.join(',')+'});'
    +'\n;globalThis.exp=name=>eval(name);',ctx,{filename:'report.js-extract.js'});
  return ctx;
}
// bar widths out of one cmpRows() row, in source order [home, away]
const widths=html=>[...html.matchAll(/width:([\d.]+)%/g)].map(m=>+m[1]);

/* ---- 2. team comparison bars: each side's SHARE, as the Stats tab draws them ---- */
test('equal values split the comparison bars down the middle', ()=>{
  const ctx=makeReport({},['cmpRows']);
  deepEq(widths(ctx.cmpRows([['Goals',2,2]])),[50,50]);
});

test('a side that scored everything fills its bar, the other empties', ()=>{
  const ctx=makeReport({},['cmpRows']);
  deepEq(widths(ctx.cmpRows([['Goals',4,0]])),[100,0]);
});

test('a lead no longer pins the leader at max — the bars keep the ratio', ()=>{
  const ctx=makeReport({},['cmpRows']);
  const [h,a]=widths(ctx.cmpRows([['Total Shots',23,5]]));
  eq(h,82.1,'23 of 28 shots');
  eq(a,17.9);
  ok(h<100,'the leader must not touch max');
});

test('nothing to compare (0 – 0) still splits down the middle', ()=>{
  const ctx=makeReport({},['cmpRows']);
  deepEq(widths(ctx.cmpRows([['Miss Shots',0,0]])),[50,50]);
});

test('percentage rows compare on their numbers, not their text', ()=>{
  const ctx=makeReport({},['cmpRows']);
  const [h,a]=widths(ctx.cmpRows([['Possession %','55.3%','44.7%']]));
  eq(h,55.3); eq(a,44.7);
});

test('the printed values are untouched by the new scaling', ()=>{
  const ctx=makeReport({},['cmpRows']);
  const html=ctx.cmpRows([['Shooting Accuracy','39.1%','20.0%']]);
  ok(html.includes('39.1%')&&html.includes('20.0%'));
});

/* ---- the report header: teams and score only ---- */
test('the header prints the teams and the score, and no formation summary', ()=>{
  const rows=[{t:100,half:1,team:'home',event:'goal',playerFrom:'9'},
              {t:200,half:1,team:'away',event:'goal',playerFrom:'6'},
              {t:300,half:2,team:'away',event:'goal',playerFrom:'6'}];
  const lineups={home:{roster:[],xi:[{no:'1',x:92,y:50,pos:'GK'},{no:'2',x:70,y:20},{no:'3',x:70,y:50},
                                     {no:'4',x:70,y:80},{no:'5',x:40,y:50}],dir:'lr'},
                 away:{roster:[],xi:[],dir:'rl'}};
  const ctx=makeReport({rows,lineups,home:'Saint Lucia',away:'Aruba'},['headerBlock']);
  const text=ctx.headerBlock().replace(/<[^>]*>/g,'');
  ok(text.includes('Saint Lucia')&&text.includes('Aruba'),'both teams: '+text);
  ok(text.includes('1 – 2'),'the score: '+text);
  notOk(/Home \(Blue\)|Away \(Amber\)/.test(text),'the formation line is gone: '+text);
  notOk(/\d-\d/.test(text),'no formation string left: '+text);
});

/* ---- 1. timeline labels carry the player's name next to the shirt number ---- */
const LU={
  home:{roster:[{no:'9',name:'Bacuna'},{no:'8',name:'Room'},{no:'7',name:'Floranus'}]},
  away:{roster:[{no:'6',name:'Thomas'}]}
};
const tlRows=[
  {t:2220,half:1,team:'home',event:'goal',playerFrom:'9',grp:'g1'},
  {t:2220,half:1,team:'home',event:'assist',playerFrom:'8',grp:'g1'},
  {t:5400,half:2,team:'away',event:'yellow card',playerFrom:'6'},
  {t:5500,half:2,team:'home',event:'own goal',playerFrom:'7'},
  {t:5600,half:2,team:'home',event:'red card',playerFrom:'9'}
];
const timelineFns=['tlWho','timelineEvents'];
const withNames=()=>makeReport({rows:tlRows,lineups:LU},timelineFns,grabRC('tlNames'))
  .timelineEvents().map(e=>e.html);

test('a goal names the scorer and the assist, both with their shirt numbers', ()=>{
  const html=withNames()[0];
  ok(html.includes('Goal #9 Bacuna'),'scorer: '+html);
  ok(html.includes('A #8 Room'),'assist: '+html);
});

test('own goals, yellow cards and red cards name the player too', ()=>{
  const [,yc,og,rc]=withNames();
  ok(yc.includes('Yellow Card #6 Thomas'),yc);
  ok(og.includes('Own Goal #7 Floranus'),og);
  ok(rc.includes('Red Card #9 Bacuna'),rc);
});

test('a shirt with no registered name stays a bare number, not "Player 9"', ()=>{
  const html=makeReport({rows:tlRows,lineups:{home:{roster:[]},away:{roster:[]}}},
    timelineFns,grabRC('tlNames')).timelineEvents().map(e=>e.html);
  ok(/^Goal #9\s*(<|$)/.test(html[0]),'no name appended: '+html[0]);
  ok(html[0].includes('(A #8)'),'the assist stays a bare number too: '+html[0]);
  notOk(html.join(' ').includes('Player 9'),'the placeholder never reaches the timeline');
});

/* A converted penalty is credited to whoever won it. The "foul won"/"assist" pair is
   tagged at the foul, a minute or more before the kick — the old ±45s window around the
   goal never reached it, so the penalty goal printed with no assist at all. */
const penRows=(gap,extra)=>[
  {t:2429.23,half:1,team:'away',event:'foul won',playerFrom:'7',grp:'f1'},
  {t:2429.25,half:1,team:'away',event:'assist',playerFrom:'7',grp:'f1'},
  {t:2429.29,half:1,team:'home',event:'foul',playerFrom:'14',grp:'f2'},
  {t:2429.23+gap,half:1,team:'away',event:'penalty kick',playerFrom:'20',grp:'g1'},
  {t:2429.23+gap,half:1,team:'away',event:'goal',playerFrom:'20',grp:'g1'},
  ...(extra||[])];
const AWAY_LU={home:{roster:[{no:'14',name:'Elva'}]},
  away:{roster:[{no:'7',name:'Rua'},{no:'20',name:'Marselia'},{no:'21',name:'Perret Gentil'}]}};
const penGoalHtml=rows=>makeReport({rows,lineups:AWAY_LU},timelineFns,grabRC('tlNames'))
  .timelineEvents().find(e=>e.kind==='goal').html;

test('a scored penalty credits the player who won it, however late the kick is taken', ()=>{
  const html=penGoalHtml(penRows(98.23));   // the reported case: foul 40:29, kick 42:07
  ok(html.includes('Goal #20 Marselia'),html);
  ok(html.includes('Penalty'),'still flagged as a penalty');
  ok(html.includes('A #7 Rua'),'the fouled player gets the assist: '+html);
});

test('an assist is only ever one the tagger entered', ()=>{
  // a bare "foul won" with no #assist on it is never turned into one
  const rows=penRows(98.23).filter(r=>r.event!=='assist');
  const html=penGoalHtml(rows);
  ok(html.includes('Penalty'),'still a penalty: '+html);
  notOk(html.includes('A #'),'no assist invented from the foul won: '+html);
});

test('a foul won far too early is not turned into a penalty assist', ()=>{
  ok(!penGoalHtml(penRows(600)).includes('A #'),'10 minutes earlier is a different phase');
});

test('the opponent who committed the foul is never credited', ()=>{
  const html=penGoalHtml(penRows(98.23));
  notOk(html.includes('#14'),'no.14 conceded the penalty: '+html);
});

test('the penalty taker cannot assist himself', ()=>{
  const rows=[{t:1000,half:1,team:'away',event:'penalty kick',playerFrom:'20',grp:'g1'},
              {t:1000,half:1,team:'away',event:'assist',playerFrom:'20',grp:'g1'},
              {t:1000,half:1,team:'away',event:'goal',playerFrom:'20',grp:'g1'}];
  const html=penGoalHtml(rows);
  ok(html.includes('Penalty'));
  notOk(html.includes('A #20'),'a self-assist is dropped: '+html);
});

test('an open-play goal still takes the assist from its own chain', ()=>{
  const rows=[{t:1260,half:1,team:'away',event:'assist',playerFrom:'21',grp:'g0'},
              {t:1260,half:1,team:'away',event:'goal',playerFrom:'8',grp:'g0'},
              {t:1100,half:1,team:'away',event:'foul won',playerFrom:'7',grp:'f9'}];
  const html=makeReport({rows,lineups:{home:{roster:[]},
      away:{roster:[{no:'8',name:'Bennett'},{no:'21',name:'Perret Gentil'}]}}},
    timelineFns,grabRC('tlNames')).timelineEvents()[0].html;
  ok(html.includes('Goal #8 Bennett'),html);
  ok(html.includes('A #21 Perret Gentil'),html);
  notOk(html.includes('Penalty'),'not a penalty, and no foul-won credit: '+html);
});

test('a 2nd yellow reads as one sending-off, with the name', ()=>{
  const rows=[{t:1000,half:1,team:'home',event:'yellow card',playerFrom:'9'},
              {t:2000,half:1,team:'home',event:'yellow card',playerFrom:'9'},
              {t:2000,half:1,team:'home',event:'red card',playerFrom:'9'}];
  const html=makeReport({rows,lineups:LU},timelineFns,grabRC('tlNames'))
    .timelineEvents().map(e=>e.html);
  eq(html.length,2,'the explicit red is still folded into the 2nd yellow');
  ok(html[1].includes('2nd Yellow → Red #9 Bacuna'),html[1]);
});

/* ---- 3 + 4. located-action maps, shared by the defensive pages and the new one ---- */
const mapFns=['rankTable','actionMapsPage'];
const takeOnSrc=()=>grabRC('TAKEON_CAT')+'\n'+grabRC('TAKEON_RANKS')+'\n'+grabRC('takeOnMapsPage');
const at=(team,event,x,y,no,half)=>({team,event,playerFrom:no,half:half||1,pXY:{x,y}});
// the ranking tables under one team's map, as {caption, header, rows[]}
function tables(html,team){
  const side=html.split('<div style="flex:1;min-width:0">')[team==='home'?1:2]||'';
  return side.split('<table class="rpt"').slice(1).map((t,i,all)=>{
    const before=side.split('<table class="rpt"')[i];
    const cap=(/margin:9px 0 2px">([^<]*)/.exec(before)||[])[1]||'';
    return {cap,
      cols:[...t.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map(m=>m[1]),
      rows:[...t.split('<tbody>')[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
        .map(m=>[...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
          .map(c=>c[1].replace(/&nbsp;/g,' ').replace(/<[^>]*>/g,'').trim()))};
  });
}

test('the take-on / step-in page puts all three event types on one map', ()=>{
  const rows=[at('home','take-on succes',60,40,'7'),at('home','take-on fail',70,30,'7'),
              at('home','step in',50,50,'10'),at('away','take-on succes',40,60,'14')];
  const ctx=makeReport({rows,lineups:LU},mapFns,takeOnSrc());
  const html=ctx.exp('takeOnMapsPage')();
  ok(html.includes('Distribution — Take-ons'),'section title');
  ['#39d98a','#f7506b','#2f81f7'].forEach(c=>ok(html.includes(c),'colour '+c+' is drawn'));
  ok(html.includes('Take-on success')&&html.includes('Take-on fail')&&html.includes('Step-in'),'legend');
});

test('take-ons and step-ins are ranked in two separate tables', ()=>{
  const rows=[at('home','take-on succes',60,40,'7'),at('home','step in',50,50,'10')];
  const ctx=makeReport({rows,lineups:LU},mapFns,takeOnSrc());
  const t=tables(ctx.exp('takeOnMapsPage')(),'home');
  eq(t.length,2,'one table per action');
  eq(t[0].cap,'Take-ons');
  eq(t[1].cap,'Step-ins');
});

test('the take-on ranking is ordered on success / attempted, not on volume', ()=>{
  // 10: 8 of 10 (80%) · 7: 3 of 3 (100%) · 9: 1 of 4 (25%)
  const rows=[];
  const add=(no,ok_,n)=>{for(let i=0;i<n;i++)rows.push(at('home',i<ok_?'take-on succes':'take-on fail',60,40,no));};
  add('10',8,10); add('7',3,3); add('9',1,4);
  const ctx=makeReport({rows,lineups:LU},mapFns,takeOnSrc());
  const t=tables(ctx.exp('takeOnMapsPage')(),'home')[0];
  deepEq(t.cols,['Rank','Player','Total','Succ.','Success Rate']);
  deepEq(t.rows.map(r=>[r[1],r[2],r[3],r[4]]),
    [['7. Floranus','3','3','100%'],['10. Player 10','10','8','80%'],['9. Bacuna','4','1','25%']],
    'best rate first, even on the fewest attempts');
});

test('the take-on rate ignores step-ins and take-on concerns', ()=>{
  const rows=[at('home','take-on succes',60,40,'7'),at('home','take-on fail',61,41,'7'),
              at('home','step in',50,50,'7'),at('home','take-on concern',52,52,'7')];
  const ctx=makeReport({rows,lineups:LU},mapFns,takeOnSrc());
  const [to,si]=tables(ctx.exp('takeOnMapsPage')(),'home');
  deepEq(to.rows[0].slice(1),['7. Floranus','2','1','50%'],'1 of 2 take-ons — the other two do not count');
  deepEq(si.rows[0].slice(1),['7. Floranus','1'],'step-ins counted on their own, Total only');
  deepEq(si.cols,['Rank','Player','Total'],'no success rate for a step-in');
});

test('a side with no take-ons still prints both tables, dashed', ()=>{
  const rows=[at('away','take-on succes',40,60,'14')];
  const ctx=makeReport({rows,lineups:LU},mapFns,takeOnSrc());
  const t=tables(ctx.exp('takeOnMapsPage')(),'home');
  eq(t.length,2);
  eq(t[0].rows.length,5,'five placeholder rows');
  deepEq(t[0].rows[0],['1','–','–','–','–']);
});

test('a won/lost category still ranks with Succ. and Success Rate', ()=>{
  const cat={label:'Tackles',parts:[['tackle success','Won','#39d98a'],['tackle fail','Lost','#f7506b']]};
  const rows=[at('home','tackle success',60,40,'7'),at('home','tackle fail',62,42,'7')];
  const ctx=makeReport({rows,lineups:LU},mapFns);
  const html=ctx.actionMapsPage(cat,'Defensive — Tackles');
  ok(html.includes('Success Rate'));
  ok(html.includes('50%'),'1 of 2 tackles won');
});

test('a category nobody located is skipped instead of printing an empty page', ()=>{
  const ctx=makeReport({rows:[{team:'home',event:'take-on succes',playerFrom:'7'}],lineups:LU},
    mapFns,takeOnSrc());
  eq(ctx.exp('takeOnMapsPage')(),null,'an event with no pitch dot cannot be mapped');
});

test('the maps find their events whatever case the tagger typed', ()=>{
  const cat={label:'Take-on Concern',parts:[['take-on concern','Take-on Concern','#ff8a3d']]};
  const ctx=makeReport({rows:[at('home','Take-On Concern',60,40,'7')],lineups:LU},mapFns);
  const html=ctx.actionMapsPage(cat,'Defensive — Take-on Concern');
  ok(html,'the page is built');
  ok(html.includes('#ff8a3d'),'the dot is drawn');
});

test('every Stats-tab defensive category, take-on concern included, gets a report page', ()=>{
  const DEF_CATS=statsDefCats();
  ok(DEF_CATS.takeOnConcern,'the dropdown gained the category');
  eq(DEF_CATS.takeOnConcern.parts[0][0],'take-on concern');
  const rows=Object.values(DEF_CATS).map((c,i)=>at('home',c.parts[0][0],50+i,50,'7'));
  const ctx=makeReport({rows,lineups:LU,DEF_CATS},mapFns,grabR('defCategoryPages'));
  const pages=ctx.defCategoryPages();
  eq(pages.length,Object.keys(DEF_CATS).length,'one page per category');
  // each page names the category it drew, so the contents page can list it
  ok(pages.some(p=>p.html.includes('Defensive — Take-on Concern')),'including the new one');
  ok(pages.every(p=>p.sub),'and none of them is anonymous');
});
// DEF_CATS lives in the Stats page; lift it out so the two stay in step
function statsDefCats(){
  const src=fs.readFileSync(path.join(__dirname,'..','Stats','stats-view.js'),'utf8');
  const ctx={};vm.createContext(ctx);
  vm.runInContext(grabConst('DEF_CATS',src,'Stats/stats-view.js')+'\n;globalThis.d=DEF_CATS;',ctx);
  return ctx.d;
}

/* ---- 3. the counter behind the new column ---- */
const concern=n=>{const r=[];for(let i=0;i<n;i++)r.push({team:'home',event:'take-on concern',playerFrom:'7'});return r;};

test('a take-on concern counts as its own stat AND as one of the take-ons', ()=>{
  const P=S.computeStats(concern(3).concat([{team:'home',event:'take-on succes',playerFrom:'7'}]),'home');
  eq(P['7'].takeOnConcerns,3);
  eq(P['7'].takeOns,4,'Distribution still sees all four take-ons');
  eq(P['7'].takeOnsWon,1,'a concern is not a win');
});

test('the new column keeps the stat table, its groups and the export in step', ()=>{
  eq(S.STAT_HEADERS.length,S.STAT_GROUPS.reduce((n,g)=>n+g[1],0),'group spans cover the headers');
  eq(S.statRow('7',S.newStat()).length,S.STAT_HEADERS.length,'one cell per header');
  const i=S.STAT_HEADERS.indexOf('Take-on Concerns');
  ok(i>0,'the header exists');
  const s=S.newStat(); s.takeOnConcerns=5;
  eq(S.statRow('7',s)[i],5,'the cell lines up with its header');
});

test('the team comparison lists take-on concerns under Defensive', ()=>{
  const def=S.STAT_GROUPS&&S.TEAM_SECTIONS.find(sec=>sec[0]==='Defensive Stats');
  ok(def,'the Defensive section exists');
  const row=def[1].find(r=>r[0]==='Take-on Concerns');
  ok(row,'the row exists');
  const s=S.newStat(); s.takeOnConcerns=4;
  eq(row[1](s,S.newStat()),4);
});

/* ---- 5. radar normalisation ---- */
const MAX=+/=\s*([\d.]+)/.exec(grabRC('RADAR_MAX'))[1];
const MIN=+/=\s*([\d.]+)/.exec(grabRC('RADAR_MIN'))[1];
const radarSrc=()=>grabRC('RADAR_MAX')+'\n'+grabRC('RADAR_MIN')+'\n'+grabR('radarPage');
// every plotted vertex as a distance from the centre, as a fraction of the outer radius
function radarFracs(rows){
  const svg=makeReport({rows},[],radarSrc()).radarPage();
  const cx=347, cy=290, R=185;
  return [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="4"/g)]
    .map(m=>Math.hypot(+m[1]-cx,+m[2]-cy)/R);
}
const defRows=(team,event,n)=>{const r=[];for(let i=0;i<n;i++)r.push({team,event,playerFrom:'7'});return r;};

test('the radar leader stops short of the outer ring', ()=>{
  ok(MAX<1,'RADAR_MAX leaves headroom');
  const fr=radarFracs(defRows('home','recovery',68).concat(defRows('away','recovery',59)));
  const top=Math.max(...fr);
  ok(Math.abs(top-MAX)<0.01,'the leading axis sits at RADAR_MAX, got '+top.toFixed(3));
  ok(top<0.999,'and never touches the grid');
});

test('the shape still keeps the ratio between the two teams', ()=>{
  // only the recoveries axis is fed, so the two vertices above the floor are its own
  const fr=radarFracs(defRows('home','recovery',100).concat(defRows('away','recovery',50)))
    .filter(f=>f>MIN+0.005).sort((x,y)=>x-y);
  eq(fr.length,2,'one vertex per team on the axis that has data');
  ok(Math.abs(fr[1]-MAX)<0.01,'leader at RADAR_MAX, got '+fr[1].toFixed(3));
  ok(Math.abs(fr[0]/fr[1]-0.5)<0.02,'half the recoveries -> half the reach, got '+(fr[0]/fr[1]).toFixed(3));
});

test('an axis neither team touched collapses to the floor, not the centre', ()=>{
  const fr=radarFracs([]);
  ok(fr.length,'dots are still drawn');
  ok(fr.every(f=>Math.abs(f-MIN)<0.005),'every axis sits on RADAR_MIN');
});
