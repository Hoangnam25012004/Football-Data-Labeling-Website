/* The three sections that replaced Discipline in the PDF — Goalkeeper, Set Pieces, Fouls —
   plus the page header every page now carries.

   Unlike report-visuals.test.js, which lifts single functions out of the source and runs
   them against stubs, this file builds the WHOLE report the way the browser does: shared.js
   and stats-view.js into a sandbox, a payload mounted, then report.js's own buildPages().
   That is the only way to check the things this change is actually about — that a section
   exists, that a page is per team, and above all that nothing the deleted pages printed has
   quietly stopped being printed.

   What it cannot check is SIZE. .rp-page is overflow:hidden, so a page that runs past
   1123px is cut off with no error anywhere, and a sandbox has no layout to measure. That
   check is run by hand against a real browser; the numbers it gave are in
   docs/match-report-sections-design.md §9.3 and §5.1. */
const fs=require('fs'), path=require('path'), vm=require('vm');
const {test,eq,ok,notOk}=require('./tiny-test');

const ROOT=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8').replace(/\r\n/g,'\n');
const SHARED=read('shared.js'), VIEW=read('Stats/stats-view.js'), REPORT=read('Stats/report.js');

/* ---------- a DOM just rich enough for buildPages() ---------- */
function makeDom(){
  const styles=[], nodes={}, ids=new Set();
  const mk=tag=>({tag,id:'',style:{},className:'',textContent:'',innerHTML:'',dataset:{},
    onclick:null,children:[],
    querySelector:()=>null,querySelectorAll:()=>[],
    appendChild(c){this.children.push(c);return c;},addEventListener(){},getContext:()=>null});
  const head=mk('head');
  head.appendChild=c=>{if(c.tag==='style'){styles.push(c.textContent);if(c.id)ids.add(c.id);}return c;};
  const document={head,body:mk('body'),
    /* ensureCss() returns early when #rpCss is already there, so that one id has to read
       null until the stylesheet has actually been appended. Everything else auto-creates. */
    getElementById:id=>id==='rpCss'?(ids.has(id)?{id}:null):(nodes[id]||(nodes[id]=mk(id))),
    querySelector:sel=>nodes['sel:'+sel]||(nodes['sel:'+sel]=mk(sel)),
    querySelectorAll:()=>[],
    createElement:t=>mk(t)};
  return {document,styles};
}

/* ---------- a match with something of everything in it ---------- */
function payload(o){
  o=o||{};
  const rows=[]; let id=0;
  const push=r=>{rows.push(Object.assign({id:'r'+(++id),rt:null,teamName:'',action:'',raw:'',
    grp:null,ord:0,pXY:null,rXY:null,gXY:null},r));return rows[rows.length-1];};
  const xy=(x,y)=>({x,y});
  ['home','away'].forEach((team,ti)=>{
    const base=ti*3;
    // open play, so every side has passes and a squad worth listing
    for(let i=0;i<12;i++)push({t:10+i*5,team,event:i%2?'pass success':'pass fail',
      playerFrom:String(1+i%11),playerTo:String(1+(i+2)%11),pXY:xy(40,40),rXY:xy(60,50)});
    // three kinds of foul, one of them typed in capitals — the evKey fix
    push({t:200+base,team,event:'FOUL',playerFrom:'4',pXY:xy(30,40)});
    push({t:205+base,team,event:'foul',playerFrom:'5',pXY:xy(35,45)});
    push({t:210+base,team,event:'Handball Foul',playerFrom:'6',pXY:xy(40,50)});
    push({t:215+base,team,event:'foul throw',playerFrom:'7',pXY:xy(45,55)});
    push({t:220+base,team,event:'foul won',playerFrom:'8',pXY:xy(50,60)});
    push({t:225+base,team,event:'offside',playerFrom:'9',pXY:xy(70,40)});
    push({t:230+base,team,event:'Yellow Card',playerFrom:'4'});
    // the keeper's own work
    push({t:300+base,team,event:'catch',playerFrom:'1',pXY:xy(6,50),grp:'k'+ti,ord:0});
    push({t:300+base,team,event:'save diving',playerFrom:'1',grp:'k'+ti,ord:1});
    push({t:320+base,team,event:'parry',playerFrom:'1',pXY:xy(8,45)});
    // a goal kick that found a team-mate, and one that did not
    push({t:400+base,team,event:'goal kick',playerFrom:'1',pXY:xy(6,50),grp:'g'+ti,ord:0});
    push({t:400+base,team,event:'pass success',playerFrom:'1',playerTo:'6',
      pXY:xy(6,50),rXY:xy(55,50),grp:'g'+ti,ord:1});
    push({t:420+base,team,event:'goal kick',playerFrom:'1',pXY:xy(6,50),grp:'h'+ti,ord:0});
    push({t:420+base,team,event:'pass fail',playerFrom:'1',playerTo:'',
      pXY:xy(6,50),rXY:xy(18,50),grp:'h'+ti,ord:1});
    // a free-kick chain, a corner chain, and a corner typed on its own (no grp at all)
    push({t:500+base,team,event:'free-kick',playerFrom:'10',pXY:xy(70,20),grp:'f'+ti,ord:0});
    push({t:500+base,team,event:'cross success',playerFrom:'10',playerTo:'9',
      pXY:xy(70,20),rXY:xy(88,50),grp:'f'+ti,ord:1});
    push({t:520+base,team,event:'corner-kick',playerFrom:'11',pXY:xy(99,1),grp:'c'+ti,ord:0});
    push({t:520+base,team,event:'shot off target',playerFrom:'9',pXY:xy(90,45),grp:'c'+ti,ord:1});
    push({t:540+base,team,event:'corner-kick',playerFrom:'11',pXY:xy(99,99)});   // grp null
    // a shot on target with a spot in the goal, so the other side's keeper has something
    push({t:600+base,team,event:'shot on target',playerFrom:'9',pXY:xy(85,50),gXY:xy(30,40)});
    push({t:620+base,team,event:'goal',playerFrom:'9',pXY:xy(88,50),gXY:xy(70,60)});
  });
  if(o.ownGoal)push({id:'og',t:700,team:'home',event:'own goal',playerFrom:'3',
    pXY:xy(10,50),rXY:null,gXY:xy(50,20),grp:null,ord:0,rt:null,teamName:'',action:'',raw:''});
  const squad=off=>{
    const roster=[],xi=[],subs=[];
    for(let i=0;i<14;i++){const no=String(1+i);
      roster.push({no,name:'Name '+(off+i)});
      if(i<11)xi.push({no,name:'Name '+(off+i),x:10+(i%4)*22,y:12+Math.floor(i/4)*28,pos:i===0?'GK':''});
      else subs.push({no,name:'Name '+(off+i)});}
    return {roster,xi,subs,dir:'lr'};
  };
  const home=squad(0), away=squad(20); away.dir='rl';
  return {meta:Object.assign({home:'Curacao',away:'Saint Lucia',sport:'football',
      matchId:'m1',matchCode:'32746'},o.meta||{}),
    lineups:{home,away,history:[]},
    dur:{enabled:true,halfLen:45,h1Start:0,h1End:2700,h2Start:2800,h2End:5500},
    rows};
}

function build(o){
  const {document}=makeDom();
  const win={};
  const ctx={console,window:win,document,
    localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
    location:{hash:'',search:''},
    setTimeout,clearTimeout,Math,JSON,Date,
    alert:m=>{throw new Error('unexpected alert: '+m);}};
  ctx.globalThis=ctx;
  vm.createContext(ctx);
  vm.runInContext(SHARED,ctx,{filename:'shared.js'});
  vm.runInContext(VIEW,ctx,{filename:'Stats/stats-view.js'});
  win.PTStats.mount(null,payload(o),{chrome:false});
  vm.runInContext(REPORT,ctx,{filename:'Stats/report.js'});
  const pages=win.PTReport.buildPages(document.createElement('div')).map(p=>p.innerHTML);
  const title=h=>{const m=/<span class="rp-htitle">([\s\S]*?)<\/span>/.exec(h);return m?m[1]:'';};
  return {pages,titles:pages.map(title),ctx,win,
    of:t=>pages.filter((p,i)=>title(pages[i])===t),
    first:t=>pages[pages.map(title).indexOf(t)]};
}
const text=h=>String(h).replace(/<[^>]*>/g,' ')
  .replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')
  .replace(/\s+/g,' ').trim();
// every number in one cmpRows() block, in source order: [home, away, home, away, …]
const cmpVals=h=>[...h.matchAll(/class="rp-cv"[^>]*>([^<]*)</g)].map(m=>m[1].trim());

/* ================= A. the shape of the report ================= */
test('Discipline is gone, and nothing still calls a page by that name', () => {
  const {titles}=build();
  titles.forEach(t=>notOk(/Discipline/.test(t),'a page is still titled '+t));
  notOk(/Goalkeeper &amp; Discipline|Goalkeeper & Discipline/.test(titles.join('|')),
    'and the combined page is gone too');
});

test('the three sections are there, in the order they were asked for', () => {
  const {titles}=build();
  const at=re=>titles.findIndex(t=>re.test(t));
  const gk=at(/^Goalkeeper — /), sp=at(/^Set Pieces — /), f=at(/^Fouls — /);
  ok(gk>0&&sp>gk&&f>sp,'Goalkeeper -> Set Pieces -> Fouls, got '+[gk,sp,f].join(','));
});

test('each section carries its comparison, its maps and its player pages', () => {
  const {titles}=build();
  ['Goalkeeper — Team Comparison','Goalkeeper — Saves','Goalkeeper — Player Stats',
   'Set Pieces — Team Comparison','Set Pieces — Goal Kicks','Set Pieces — Free-kicks',
   'Set Pieces — Corners','Set Pieces — Player Stats',
   'Fouls — Team Comparison','Fouls — Foul Maps','Fouls — Fouls Won','Fouls — Offsides',
   'Fouls — Player Stats'].forEach(t=>ok(titles.includes(t),'missing page: '+t));
});

test('a player-stats page is one page per side, never both on one', () => {
  const b=build();
  ['Goalkeeper — Player Stats','Set Pieces — Player Stats','Fouls — Player Stats']
    .forEach(t=>{
      const ps=b.of(t);
      eq(ps.length,2,t+' should be two pages, got '+ps.length);
      ok(/Curacao/.test(ps[0])&&!/Saint Lucia/.test(ps[0]),t+': page 1 is the home side only');
      ok(/Saint Lucia/.test(ps[1])&&!/>Curacao</.test(ps[1]),t+': page 2 is the away side only');
    });
});

test('a per-side page names its side in the header, and a shared one does not', () => {
  const b=build();
  ok(/rp-hteam[\s\S]*?Curacao/.test(b.of('Goalkeeper — Saves')[0]),'the Saves page names the side');
  notOk(/rp-hteam/.test(b.first('Fouls — Team Comparison')),'a comparison page names neither');
});

/* ================= B. the page header ================= */
test('every page carries the mark, the words Match Report, and its own title', () => {
  const {pages,titles}=build();
  pages.forEach((p,i)=>{
    ok(/class="rp-head"/.test(p),'page '+(i+1)+' has no header band');
    ok(/class="rp-logo"/.test(p)&&/<svg /.test(p),'page '+(i+1)+' has no mark');
    ok(/class="rp-hkick">Match Report</.test(p),'page '+(i+1)+' does not say Match Report');
    ok(titles[i],'page '+(i+1)+' has no title');
  });
});

test('the band is the first thing on the page, or its negative margin lands on the wrong thing', () => {
  const {pages}=build();
  pages.forEach((p,i)=>ok(/^\s*<div class="rp-head"/.test(p),
    'page '+(i+1)+' does not open with the header'));
});

test('the mark is drawn, not fetched — an <img> would be one more thing to fail', () => {
  const p=build().pages[0];
  ok(/class="rp-logo"><svg /.test(p),'the logo is inline SVG in the page it draws');
  notOk(/<img/.test(p),'and nothing on the page is fetched');
  ok(/const secTitle=\(t,team\)=>/.test(REPORT),'secTitle is still one expression the suite can lift');
});

/* ================= C. nothing the old pages printed was lost ================= */
test('the cards land on Fouls — Team Comparison, counted as they always were', () => {
  const b=build();
  const t=text(b.first('Fouls — Team Comparison'));
  ok(/Yellow Cards/.test(t)&&/Red Cards/.test(t),'both rows are there: '+t.slice(0,200));
  // one yellow a side in the fixture above
  const vals=cmpVals(b.first('Fouls — Team Comparison'));
  const rows=text(b.first('Fouls — Team Comparison'));
  ok(/1 YELLOW CARDS 1/i.test(rows.replace(/\s+/g,' ')),'one each, home and away: '+rows);
  ok(vals.length>=16,'eight rows, two numbers each — got '+vals.length);
});

test('every figure the deleted Goalkeeper & Discipline page printed still appears', () => {
  const b=build();
  const gk=text(b.first('Goalkeeper — Team Comparison'));
  ['Goals Conceded','Saves','Catches','Parries'].forEach(k=>ok(gk.includes(k),'GK: '+k));
  const sp=text(b.first('Set Pieces — Team Comparison'));
  ['Corners','Free-kicks','Penalty Kicks','Throw-ins','Goal Kicks'].forEach(k=>ok(sp.includes(k),'SP: '+k));
  const f=text(b.first('Fouls — Team Comparison'));
  ['Fouls Won','Offsides'].forEach(k=>ok(f.includes(k),'Fouls: '+k));
});

test('Total Fouls is the three kinds added up, on both sides', () => {
  const v=cmpVals(build().first('Fouls — Team Comparison'));
  // TEAM_SECTIONS[5] order: Total, Fouls, Handball, Foul Throw, …
  const n=i=>[+v[i*2],+v[i*2+1]];
  const tot=n(0), pl=n(1), hb=n(2), ft=n(3);
  [0,1].forEach(s=>eq(tot[s],pl[s]+hb[s]+ft[s],
    'side '+s+': '+tot[s]+' != '+pl[s]+'+'+hb[s]+'+'+ft[s]));
  eq(tot[0],4,'two fouls (one of them typed FOUL) + a handball + a foul throw');
});

test('a foul typed in capitals is still on the map — the whole point of evKey', () => {
  const b=build();
  const map=b.first('Fouls — Foul Maps');
  ok(map,'the foul map page was built');
  // shirts 4, 5, 6 and 7 committed the four fouls; all four must be drawn
  ['>4<','>5<','>6<','>7<'].forEach(s=>ok(map.includes(s),'shirt missing from the map: '+s));
});

/* ================= D. the goalkeeper page reads the other side ================= */
test('the goal mouth is filled from the OPPOSITION-s shots, not from the keeper-s events', () => {
  const b=build();
  const home=b.of('Goalkeeper — Saves')[0];
  // away had one shot on target (green) and one goal (red) — both with a spot
  const marks=[...home.matchAll(/<circle cx="[\d.]+" cy="[\d.]+" r="17"/g)];
  ok(marks.length>=2,'two marks in the mouth, got '+marks.length);
  ok(home.includes('#17924f')&&home.includes('#d93a3f'),'one saved and one conceded');
});

test('an own goal counts against the side that scored it, and is drawn square', () => {
  const b=build({ownGoal:true});
  const home=b.of('Goalkeeper — Saves')[0];
  ok(/<rect[^>]*fill="#d93a3f"/.test(home),'the own goal is a red square in home-s own goal');
  ok(text(home).includes('own goal'),'and the event list says which one it was');
});

test('the keeper line names every shirt the board ever put in goal', () => {
  const b=build();
  const p=b.of('Goalkeeper — Saves')[0];
  ok(/Goal Kick Success Rate/.test(p),'the row asks for it');
  ok(/Minutes Played/.test(p)&&/Save Rate/.test(p),'and for the other two');
  ok(text(p).includes('Name 0'),'the keeper is named, not just numbered');
});

test('…and it appears there ONLY — Goal Kicks is a page about goal kicks', () => {
  const b=build();
  b.of('Set Pieces — Goal Kicks').forEach(p=>{
    notOk(/class="rp-gkrow"/.test(p),'the keeper line is still at the top of Goal Kicks');
    notOk(/Save Rate/.test(p),'and so is Save Rate, which is not a fact about a goal kick');
  });
  // the one figure of it that IS about goal kicks is the Total row of the distance table
  ok(/Total/.test(text(b.of('Set Pieces — Goal Kicks')[0])),'the Total row still answers it');
});

test('the player table is keepers only, the way the Stats tab draws it', () => {
  const b=build();
  const p=b.of('Goalkeeper — Player Stats')[0];
  const shirts=[...p.matchAll(/class="rp-pill"[^>]*>(\d+)</g)].map(m=>m[1]);
  eq(shirts.join(','),'1','only the keeper, not the whole squad — got '+shirts.join(','));
});

/* ================= E. set pieces ================= */
test('a set piece typed on its own draws nothing — it produced nothing that was tagged', () => {
  const b=build();
  const p=b.of('Set Pieces — Corners')[0];
  /* Two corners in the fixture, one of them with no grp at all. The one with a chain is a
     shot off target: one hollow triangle. The lone one leaves no mark — it used to leave a
     grey "no outcome tagged" dot, which for a corner marked the corner flag, i.e. the
     definition of the thing rather than a fact about the match. */
  const tri=[...p.matchAll(/<polygon /g)].length;
  const dot=[...p.matchAll(/<circle cx="[\d.]+" cy="[\d.]+" r="13"/g)].length;
  eq(tri,1,'the chain-bearing corner is the one shot drawn');
  eq(dot,0,'and nothing is drawn for the corner that said no more');
  notOk(/No outcome tagged/.test(p),'the legend for it is gone too');
});

test('a chain a set piece did NOT open is not counted as one', () => {
  const b=build();
  // the free-kick chain is one cross; the corner chain is one shot. Neither may leak
  // into the other's page.
  const fk=b.of('Set Pieces — Free-kicks')[0];
  eq([...fk.matchAll(/stroke-dasharray="9 8"/g)].length,1,'one cross, from the one free-kick');
  eq([...fk.matchAll(/<polygon /g)].length,0,'and the corner-s shot did not leak in');
});

test('the set-piece pages carry no tagging arithmetic on their face', () => {
  const b=build();
  ['Set Pieces — Corners','Set Pieces — Free-kicks','Set Pieces — Goal Kicks'].forEach(t=>
    b.of(t).forEach(p=>{
      notOk(/taken/.test(text(p)),t+' still says "taken"');
      notOk(/tagged outcome/.test(text(p)),t+' still says "tagged outcome"');
      notOk(/An arrow is drawn/.test(text(p)),t+' still carries the arrow footnote');
    }));
});

test('the goal-kick bands are the same three passTypeData uses', () => {
  const b=build();
  const t=text(b.of('Set Pieces — Goal Kicks')[0]);
  ok(/Long \[ > 30m \]/.test(t),'Long: '+t.slice(0,200));
  ok(/Medium \[ 15 - 30m \]/.test(t),'Medium');
  ok(/Short \[ < 15m \]/.test(t),'Short');
});

test('a goal kick that found nobody is a fail, and one that did is a receiver', () => {
  const b=build();
  const p=b.of('Set Pieces — Goal Kicks')[0], t=text(p);
  ok(/Player Receiving Passes/.test(t),'the receiver table is drawn');
  ok(/6\. Name 5/.test(t),'the shirt the successful kick reached');
  ok(/Total 50% 1 2/.test(t),'one of the two kicks came off: '+t.slice(0,400));
});

/* ================= F. the tables fit ================= */
test('a wide header is one line — nowrap, and the room to honour it', () => {
  /* Sliced by hand rather than by a brace-matching regex: these rules interpolate
     ${C.navy}, whose own } ends any [^}]* bracket early. */
  const rule=n=>{const i=REPORT.indexOf(n);return REPORT.slice(i,REPORT.indexOf('\n.',i));};
  const th=rule('.rpt th{');
  ok(/white-space:nowrap/.test(th),'a label may not wrap');
  ok(/padding:7px 3px/.test(th),'and the cell gives back the 2px that makes it fit');
  ok(/max-width:80px/.test(rule('.rpt td.rp-pl{')),'the name column gives back 16px more');
});

test('the abbreviations are labels only — every number still comes from PLAYER_CATS', () => {
  const b=build();
  const setp=b.of('Set Pieces — Player Stats')[0];
  ok(/>FK Sh On</.test(setp)&&/>SP Goals</.test(setp),'the short labels are printed');
  notOk(/Freekicks: Shots On Target/.test(setp),'and the long ones are not');
  // the source reads the shared list rather than restating its columns
  ok(/teamPlayerPages\('Set Pieces — Player Stats',PLAYER_CATS\.setPieces\)/.test(REPORT));
  ok(/teamPlayerPages\('Fouls — Player Stats',PLAYER_CATS\.fouls\)/.test(REPORT));
});

/* ================= F2. one marker for both halves ================= */
test('shooting, distribution and defensive maps draw one shape, not two', () => {
  const b=build();
  const pages=b.pages.filter((p,i)=>
    /^(Shots & Goals|Distribution|Defensive)/.test(b.titles[i].replace(/&amp;/g,'&')));
  ok(pages.length>=8,'there are a good few of them — got '+pages.length);
  pages.forEach((p,i)=>{
    notOk(/Circle = 1st half|Square = 2nd half/.test(p),
      'the half legend is still on '+b.titles[b.pages.indexOf(p)]);
  });
  // the shot map: circles only, no square markers. The title carries &amp; as written.
  const shots=b.of('Shots &amp; Goals — Curacao')[0];
  ok(shots,'the home Shots & Goals page was built');
  ok(/<circle [^>]*r="18"/.test(shots),'the shot markers are drawn');
  notOk(/<rect [^>]*width="32"/.test(shots),'and none of them is a square');
});

test('the source no longer branches a marker on which half it was', () => {
  ['shotDotsV','gkPitchDots'].forEach(n=>{
    const i=REPORT.indexOf('function '+n+'(');
    ok(i>0,n+' is still there');
    const body=REPORT.slice(i,REPORT.indexOf('\nfunction ',i+1));
    notOk(/eventHalf\(r\)===1\s*\n?\s*\?/.test(body),n+' still picks a shape by half');
  });
});

/* ================= F3. the columns that moved out ================= */
test('Attacking — Player Stats is shooting only', () => {
  const b=build();
  const p=b.of('Attacking — Player Stats')[0];
  ['Goals','Assists','Shots','On Target','Shoot Acc'].forEach(h=>
    ok(p.includes('<th>'+h+'</th>'),'missing column '+h));
  ['Offsides','Freekicks','Corners'].forEach(h=>
    notOk(p.includes('<th>'+h+'</th>'),h+' is still on the attacking table'));
});

test('Defensive — Player Stats leaves the fouls to the Fouls section', () => {
  const b=build();
  const p=b.of('Defensive — Player Stats')[0];
  ['Tackles','Intercept','Aerial','Mistakes'].forEach(h=>
    ok(p.includes('<th>'+h+'</th>'),'missing column '+h));
  ['Fouls','F.Won'].forEach(h=>
    notOk(p.includes('<th>'+h+'</th>'),h+' is still on the defensive table'));
  // and they are still printed, on the page that now owns them
  const f=b.of('Fouls — Player Stats')[0];
  ok(f.includes('<th>Total Fouls</th>')&&f.includes('<th>Fouls Won</th>'),
     'the Fouls table carries them');
});

test('Tackle % goes from the player table but stays on the comparison', () => {
  const b=build();
  const p=b.of('Defensive — Player Stats')[0];
  notOk(p.includes('<th>Tackle %</th>'),'the column is gone');
  ok(/<td>\d+\/\d+<\/td>/.test(p),'and "won/attempted" is still printed, which IS the rate');
  // TEAM_SECTIONS[2] carries Tackle Success, and that row has no fraction beside it
  ok(text(b.first('Defensive')).includes('Tackle Success'),
     'the Defensive comparison keeps its own rate row');
});

/* ================= F4. the Fouls maps join the rest ================= */
test('the foul, fouls-won and offside maps draw one shape too', () => {
  const b=build();
  ['Fouls — Foul Maps','Fouls — Fouls Won','Fouls — Offsides'].forEach(t=>{
    const p=b.first(t);
    ok(p,t+' was not built');
    notOk(/Circle = 1st half|Square = 2nd half/.test(p),t+' still explains a shape by half');
    notOk(/<rect [^>]*rx="[35]"[^>]*fill-opacity/.test(p),t+' still draws a square marker');
  });
});

test('the card ring survives — it is the one thing that marker says twice, and it is a card', () => {
  const b=build();
  const p=b.first('Fouls — Foul Maps');
  ok(/stroke="#f5c518" stroke-width="5"/.test(p),'a foul that led to a yellow keeps its ring');
  ok(/Led to yellow/.test(p)&&/Dangerous zone/.test(p),'and the legend that explains it');
});

/* ================= F5. set-piece dots carry a shirt ================= */
test('every dot on a set-piece map says which shirt played the ball', () => {
  const b=build();
  const pages=[].concat(b.of('Set Pieces — Goal Kicks'),b.of('Set Pieces — Free-kicks'),
                        b.of('Set Pieces — Corners'));
  let dots=0, texts=0;
  pages.forEach(p=>{
    dots+=[...p.matchAll(/<circle cx="[\d.]+" cy="[\d.]+" r="1[35]"/g)].length
         +[...p.matchAll(/<polygon /g)].length;
    // the numbers drawn inside them — the map's own <text>, not the tables around it
    texts+=[...p.matchAll(/text-anchor="middle" font-size="1[45]" font-weight="800"/g)].length;
  });
  ok(dots>0,'there are markers to check — got '+dots);
  eq(texts,dots,'every marker carries a number: '+texts+' numbers for '+dots+' markers');
});

test('the number is the shirt that played the ball, not always the taker', () => {
  const b=build();
  // the corner is taken by 11 and the shot that came off it is 9's, so 9 is on the marker
  const p=b.of('Set Pieces — Corners')[0];
  ok(/<polygon[\s\S]{0,200}?>9</.test(p),'the shooter-s shirt is in the triangle: '+
     (/<polygon[\s\S]{0,220}/.exec(p)||[''])[0].slice(0,200));
});

/* ================= G. the fixture on the cover ================= */
test('the cover prints what the channel knows about the fixture', () => {
  const b=build({meta:{date:'2026-08-15',league:'CONCACAF Nations League',
    season:'2026/27',round:'Matchday 4',venue:'Ergilio Hato'}});
  const t=text(b.pages[0]);
  ['CONCACAF Nations League','Matchday 4','2026/27','15 Aug 2026','Ergilio Hato']
    .forEach(s=>ok(t.includes(s),'cover is missing '+s));
  /* Set as a centred stack, not five captioned boxes: the reading order says which part is
     which, so the captions are gone with the boxes. Checked on the markup rather than on
     the text — "League" is a word inside a real competition name. */
  const p=b.pages[0];
  notOk(/class="rp-fixi"/.test(p),'the five boxes are still being drawn');
  notOk(/>Date<|>League<|>Season<|>Round<|>Venue</.test(p),'a caption is still printed');
  ok(/Matchday 4 · 2026\/27/.test(t),'the round and the season share a line');
});

test('a report that never carried them prints no block at all, not five empty boxes', () => {
  const b=build();
  notOk(/class="rp-fix"/.test(b.pages[0]),'an empty fixture block was drawn anyway');
});

test('a part nobody filled in is not a line, and the rest still prints', () => {
  const b=build({meta:{venue:'Ergilio Hato',league:'CONCACAF Nations League'}});
  const p=b.pages[0], t=text(p);
  ok(t.includes('Ergilio Hato')&&t.includes('CONCACAF Nations League'),'the two that were filled in');
  notOk(/rp-fixr/.test(p),'no round/season line, because neither was given');
  eq([...p.matchAll(/class="rp-fixm"/g)].length,1,'and one grey line, not two');
});

test('the date is built from its parts, so two machines print the same string', () => {
  // the one mention left is the comment explaining why it is never called
  const code=REPORT.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
  notOk(/toLocale/.test(code),'no locale formatting anywhere in the report');
  ok(/const RP_MONTHS=\[/.test(REPORT),'the month names are the report-s own');
});
