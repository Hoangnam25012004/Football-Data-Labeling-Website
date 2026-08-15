/* ============================================================================
   shared.js — common data + pitch + stats helpers used by the standalone
   Stats/ and Player-Lists/ pages. All state is read from (and written to)
   localStorage, which is shared across same-origin tabs, so these pages stay
   in sync with the main tagging tab live (see the `storage` listeners on each
   page).
   ========================================================================== */
const $ = id => document.getElementById(id);
// squad names and team names come from user input and land in innerHTML all over both pages
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* localStorage keys — must match the ones the main app (index.html) writes */
const PT_KEYS = {
  events:'pitchtagger.events.v1',
  lineups:'pitchtagger.lineups.v1',
  lineupsMatch:'pitchtagger.lineups.match.v1',
  duration:'pitchtagger.duration.v1',
  rows:'pitchtagger.rows.v1',
  meta:'pitchtagger.meta.v1'
};
function loadJSON(k,def){try{const s=localStorage.getItem(k);if(s){const o=JSON.parse(s);if(o!=null)return o;}}catch(e){}return def;}
function loadRows(){const r=loadJSON(PT_KEYS.rows,[]);return Array.isArray(r)?r:[];}
const blankTeamLU=dir=>({roster:[],xi:[],subs:[],dir:dir||'lr'});
const blankLineups=()=>({home:blankTeamLU('lr'),away:blankTeamLU('rl')});
function loadLineups(){const o=loadJSON(PT_KEYS.lineups,null);return (o&&o.home&&o.away)?o:blankLineups();}

/* ---- which match the stored lineups belong to ----
   A lineup set belongs to exactly ONE match, but localStorage is shared by every tab and
   by every match this browser has ever opened. The stamp records which match the stored
   copy is for: readers check it before trusting the copy, writers set it. Without it a
   window sitting on another match — or on no match at all — wrote its own, usually empty,
   squad over the open match's, in localStorage AND (relayed by the tagging tab) in the
   database, and the lineup + formation that had just been entered simply disappeared. */
const luStamp=()=>{try{const s=localStorage.getItem(PT_KEYS.lineupsMatch);return s==null?null:String(s);}catch(e){return null;}};
const lineupsAreFor=id=>!!id&&luStamp()===String(id);
const teamLUEmpty=t=>!t||(!(t.roster||[]).length&&!(t.xi||[]).length&&!(t.subs||[]).length);
const lineupsEmpty=l=>!l||(teamLUEmpty(l.home)&&teamLUEmpty(l.away)&&!((l.history||[]).length));
/* Stamp FIRST, then the lineups: a tab woken by the lineups event then always reads the
   stamp that goes with the copy it is being handed. A write with no match open is refused
   while the store still holds a real squad — that copy is the only one there is until its
   match is opened again. */
function saveLineupsLS(l,matchId){
  const id=String(matchId||'');
  if(!id&&!lineupsEmpty(loadLineups()))return false;
  try{localStorage.setItem(PT_KEYS.lineupsMatch,id);localStorage.setItem(PT_KEYS.lineups,JSON.stringify(l));}catch(e){}
  return true;
}
// one-off: a store written before the stamp existed belongs to the match the meta store
// still names — the two were only ever written together, for the match that was open.
function migrateLineupStamp(matchId){
  try{if(localStorage.getItem(PT_KEYS.lineupsMatch)==null)
    localStorage.setItem(PT_KEYS.lineupsMatch,String(matchId||''));}catch(e){}
}
function loadMeta(){const m=loadJSON(PT_KEYS.meta,null)||{};return {home:m.home||'Home',away:m.away||'Away',sport:m.sport||'football',
  homeTeamId:m.homeTeamId||null,awayTeamId:m.awayTeamId||null,matchId:m.matchId||null,matchCode:m.matchCode||null};}
/* "← Tagging" must return WITH the match (…/#match=<code>) or the main tab treats the
   bare URL as "no match open" and clears the session. Called on load + meta changes. */
function syncBackLink(meta){
  const a=document.querySelector('.back-link'); if(!a)return;
  const c=(location.hash.match(/match=([0-9a-z-]{5,36})/i)||[])[1]||meta.matchCode||meta.matchId;
  a.href='../'+(c?'#match='+c:'');
}

/* ---- sport-accurate pitches/courts (copied from the main app) ---- */
const PITCH_DIMS={
  football:{w:1050,h:680}, football7:{w:600,h:400}, futsal:{w:800,h:400}, basketball:{w:840,h:450}
};
const PITCH_LINE='rgba(255,255,255,0.85)';
const _spot=(x,y)=>'<circle cx="'+x+'" cy="'+y+'" r="3.5" fill="#fff" stroke="none"/>';
function pitchFootball(W,H,small){
  const s=10,cx=W/2,cy=H/2,I=6;
  const paD=small?9*s:16.5*s, paW=small?20*s:40.32*s, gaD=small?0:5.5*s, gaW=small?0:18.32*s;
  const cr=small?6*s:9.15*s, ps=small?9*s:11*s, arc=small?0:9.15*s;
  let m=`<rect x="${I}" y="${I}" width="${W-2*I}" height="${H-2*I}"/><line x1="${cx}" y1="${I}" x2="${cx}" y2="${H-I}"/><circle cx="${cx}" cy="${cy}" r="${cr}"/>`+_spot(cx,cy);
  [true,false].forEach(left=>{const gx=left?I:W-I, dir=left?1:-1;
    m+=`<rect x="${left?gx:gx-paD}" y="${cy-paW/2}" width="${paD}" height="${paW}"/>`;
    if(gaD)m+=`<rect x="${left?gx:gx-gaD}" y="${cy-gaW/2}" width="${gaD}" height="${gaW}"/>`;
    m+=_spot(gx+dir*ps,cy);
    if(arc){const ex=gx+dir*paD, dx=Math.abs(ex-(gx+dir*ps)), dy=Math.sqrt(Math.max(0,arc*arc-dx*dx));
      m+=`<path d="M ${ex} ${cy-dy} A ${arc} ${arc} 0 0 ${left?1:0} ${ex} ${cy+dy}"/>`;}
  });
  return m;
}
function courtFutsal(W,H){
  const s=20,cx=W/2,cy=H/2,I=6,cr=3*s,R=6*s,ps=6*s,ps2=10*s;
  let m=`<rect x="${I}" y="${I}" width="${W-2*I}" height="${H-2*I}"/><line x1="${cx}" y1="${I}" x2="${cx}" y2="${H-I}"/><circle cx="${cx}" cy="${cy}" r="${cr}"/>`+_spot(cx,cy);
  [true,false].forEach(left=>{const gx=left?I:W-I, dir=left?1:-1;
    m+=`<path d="M ${gx} ${cy-R} A ${R} ${R} 0 0 ${left?1:0} ${gx} ${cy+R}"/>`+_spot(gx+dir*ps,cy)+_spot(gx+dir*ps2,cy);
  });
  return m;
}
function courtBasketball(W,H){
  const s=30,cx=W/2,cy=H/2,I=6,cc=1.8*s,laneW=4.9*s,laneL=5.8*s,ftr=1.8*s,tpr=6.75*s,basket=1.575*s,corner=0.9*s;
  let m=`<rect x="${I}" y="${I}" width="${W-2*I}" height="${H-2*I}"/><line x1="${cx}" y1="${I}" x2="${cx}" y2="${H-I}"/><circle cx="${cx}" cy="${cy}" r="${cc}"/>`+_spot(cx,cy);
  [true,false].forEach(left=>{const bx=left?I:W-I, dir=left?1:-1, cxb=bx+dir*basket;
    m+=`<rect x="${left?bx:bx-laneL}" y="${cy-laneW/2}" width="${laneL}" height="${laneW}"/>`;
    m+=`<circle cx="${bx+dir*laneL}" cy="${cy}" r="${ftr}"/>`;
    m+=`<line x1="${bx+dir*1.2*s}" y1="${cy-0.9*s}" x2="${bx+dir*1.2*s}" y2="${cy+0.9*s}"/><circle cx="${cxb}" cy="${cy}" r="${0.45*s}"/>`;
    const off=Math.min(H/2-I-corner, tpr-1), mx=cxb+dir*Math.sqrt(Math.max(0,tpr*tpr-off*off));
    m+=`<line x1="${bx}" y1="${cy-off}" x2="${mx}" y2="${cy-off}"/><line x1="${bx}" y1="${cy+off}" x2="${mx}" y2="${cy+off}"/>`;
    m+=`<path d="M ${mx} ${cy-off} A ${tpr} ${tpr} 0 0 ${left?1:0} ${mx} ${cy+off}"/>`;
  });
  return m;
}
function pitchSVG(sport){
  const d=PITCH_DIMS[sport]||PITCH_DIMS.football, W=d.w, H=d.h;
  const bg=sport==='basketball'?'rgba(120,74,42,0.62)':'rgba(26,62,32,0.72)';
  const marks=sport==='basketball'?courtBasketball(W,H):sport==='futsal'?courtFutsal(W,H):pitchFootball(W,H,sport==='football7');
  return '<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;display:block">'
    +'<rect x="0" y="0" width="'+W+'" height="'+H+'" fill="'+bg+'"/>'
    +'<g fill="none" stroke="'+PITCH_LINE+'" stroke-width="3">'+marks+'</g><g id="pv-dots"></g></svg>';
}

/* ---- position-zone grid (6 cols x 3 rows). Canonical: attacking LEFT, GK right ---- */
const FORMATION_GRID=[
  ['RF','RW','RM','RWB','RB',''],
  ['CF','CAM','CM','CDM','CB','GK'],
  ['LF','LW','LM','LWB','LB','']
];
const PZ_COLORS=['green','green','green','green','green','green']; // single grass-green zones
// switching attacking direction rotates the whole map 180°, so BOTH axes flip:
// columns (GK side) AND rows (which flank is the Right side). Flipping only columns
// left R/L on the same screen half, so a right-back showed as a left-back when the
// team attacked the other way.
const effCol=(col,dir)=>dir==='lr'?5-col:col;
const effRow=(row,dir)=>dir==='lr'?2-row:row;
/* row heights: top 25% / middle (GK..CF) 50% / bottom 25% */
const PZ_ROW_TOP=[0,25,75], PZ_ROW_H=[25,50,25];
function zoneAt(x,y,dir){
  const col=Math.max(0,Math.min(5,Math.floor(x/100*6))), row=y<25?0:(y<75?1:2);
  return FORMATION_GRID[effRow(row,dir)][effCol(col,dir)]||'';
}
function gridHTML(dir){
  let h='';
  for(let row=0;row<3;row++)for(let col=0;col<6;col++){
    const ec=effCol(col,dir), lbl=FORMATION_GRID[effRow(row,dir)][ec], color=lbl?PZ_COLORS[ec]:'none';
    h+=`<div class="pz ${color}" style="left:${col*100/6}%;top:${PZ_ROW_TOP[row]}%;width:${100/6}%;height:${PZ_ROW_H[row]}%">${lbl}</div>`;
  }
  h+=`<div class="pz-arrow">${dir==='lr'?'▶':'◀'}</div>`;
  return h;
}
/* the cell a dot is standing in, in DISPLAY coordinates (the same split zoneAt uses) */
function cellAt(x,y){return {row:y<25?0:(y<75?1:2),col:Math.max(0,Math.min(5,Math.floor(x/100*6)))};}
/* Centre of one CANONICAL grid cell, as pitch percentages. FORMATION_GRID is canonical
   (attacking left, GK right) while the grid is drawn in display coordinates, so the row
   and column go through the same effRow/effCol the label lookup does. */
function cellCentre(cRow,cCol,dir){
  const row=effRow(cRow,dir), col=effCol(cCol,dir);
  return {x:(col+0.5)*100/6, y:PZ_ROW_TOP[row]+PZ_ROW_H[row]/2};
}
/* Where a player joins the pitch when his position is not known yet: the empty square
   beside the goalkeeper — the one next to LB for the home side, next to RB for the away
   side. It is a staging square, not a position (zoneAt returns '' there), so a whole
   squad added at once simply stacks on the same spot until the dots are dragged out. */
const BENCH_CELL={home:[2,5],away:[0,5]};
function benchSpot(team,dir){
  const c=BENCH_CELL[team==='away'?'away':'home'];
  return cellCentre(c[0],c[1],dir);
}
/* Space the dots inside each POSITION cell evenly down it, so a cell holding two centre
   backs reads as a tidy pair instead of a pile: one sits in the middle, two at 1/3 and
   2/3, three at 1/4·1/2·3/4, four at 1/5…4/5 — n dots at (i+1)/(n+1) of the cell. They
   keep the order they were already stacked in, and stay centred across the cell.
   The staging square is deliberately skipped: that is the one place dots may overlap.
   Returns true when something actually moved, so the caller can persist it. */
function arrangeXI(xi,dir){
  const cells=new Map();
  (xi||[]).forEach(x=>{
    const c=cellAt(x.x,x.y);
    if(!FORMATION_GRID[effRow(c.row,dir)][effCol(c.col,dir)])return;   // staging square
    const k=c.row+','+c.col;
    if(!cells.has(k))cells.set(k,[]);
    cells.get(k).push(x);
  });
  let moved=false;
  cells.forEach((list,k)=>{
    const row=+k.split(',')[0], col=+k.split(',')[1];
    const cx=(col+0.5)*100/6, top=PZ_ROW_TOP[row], h=PZ_ROW_H[row];
    list.sort((a,b)=>a.y-b.y||String(a.no).localeCompare(String(b.no)));
    list.forEach((x,i)=>{
      const nx=cx, ny=top+h*(i+1)/(list.length+1);
      if(Math.abs(x.x-nx)>0.01||Math.abs(x.y-ny)>0.01){x.x=nx; x.y=ny; moved=true;}
      x.pos=zoneAt(x.x,x.y,dir);
    });
  });
  return moved;
}
const MAX_XI={football:11,football7:7,futsal:5,basketball:5};

/* ===================== PLAYER STATS ===================== */
const EVENT_INC={
  'goal':['goals','totalShots','shotsOn'],
  'assist':['assists'],
  'key pass':['keyPasses'],
  'shot on target':['totalShots','shotsOn'],
  'shot off target':['totalShots','shotsOff'],
  'blocked shot':['totalShots','shotsBlocked'],
  'miss shot':['totalShots','missShots'],
  'pass success':['passes','passesComp'],
  'pass fail':['passes'],
  'cross success':['crosses','crossesComp'],
  'cross fail':['crosses'],
  'take-on succes':['takeOns','takeOnsWon'],
  'take-on fail':['takeOns'],
  // a take-on the defender made uncomfortable: still one of this player's take-ons
  // (Distribution), and counted on its own under Defensive
  'take-on concern':['takeOns','takeOnConcerns'],
  'step in':['stepIns'],
  'tackle success':['tackles','tacklesWon'],
  'tackle fail':['tackles'],
  'interception':['interceptions'],
  'clearance':['clearances'],
  'block':['blocks'],
  'recovery':['recoveries'],
  'ground duel success':['groundDuels','groundDuelsWon'],
  'ground duel fail':['groundDuels'],
  'aerial duel success':['aerialDuels','aerialDuelsWon'],
  'aerial duel fail':['aerialDuels'],
  'corner-kick':['corners'],
  'free-kick':['freeKicks'],
  'penalty kick':['penalties'],
  'throw-ins':['throwIns'],'throw-in':['throwIns'],
  'goal kick':['goalKicks'],
  'foul':['fouls'],'foul throw':['fouls'],'handball foul':['fouls'],
  'foul won':['foulsWon'],
  'offside':['offsides'],
  'mistake':['mistakes'],
  'save':['saves']
};
const STAT_GROUPS=[['',1],['Shooting',8],['Distribution',10],['Defensive',9],['Duels',4],['Set Pieces',4],['Discipline',4]];
const STAT_HEADERS=['No','Goals','Assists','Total Shots','Shots On Target','Shots Off Target','Blocked Shots','Miss Shots','Shooting Accuracy',
  'Passes','Passes Completed','Pass Accuracy','Crosses','Crosses Completed','Cross Accuracy',
  'Take-ons','Take-ons Won','Take-on Success','Step-ins',
  'Tackles','Tackles Won','Tackle Success','Interceptions','Clearances','Blocks','Recoveries','Take-on Concerns','Mistakes',
  'Ground Duels','Ground Duels Won','Aerial Duels','Aerial Duels Won',
  'Corners','Free-kicks','Throw-ins','Goal Kicks','Fouls','Fouls Won','Offsides','Saves'];
function newStat(){return{goals:0,assists:0,keyPasses:0,totalShots:0,shotsOn:0,shotsOff:0,shotsBlocked:0,missShots:0,passes:0,passesComp:0,
  crosses:0,crossesComp:0,takeOns:0,takeOnsWon:0,takeOnConcerns:0,stepIns:0,tackles:0,tacklesWon:0,interceptions:0,
  clearances:0,blocks:0,recoveries:0,groundDuels:0,groundDuelsWon:0,aerialDuels:0,aerialDuelsWon:0,
  corners:0,freeKicks:0,penalties:0,throwIns:0,goalKicks:0,fouls:0,foulsWon:0,offsides:0,mistakes:0,saves:0};}
const pct=(n,d)=> (d? (Math.round(n/d*1000)/10).toFixed(1):'0.0')+'%';
/* Event names come from a user-editable list, so the spelling of a type is whatever the
   tagger typed ("throw-Ins", "Goal"). Every lookup against a fixed dictionary here goes
   through evKey, or an event tagged with different capitalisation silently counts zero. */
const evKey=e=>String(e==null?'':e).trim().toLowerCase();
function computeStats(rows,team){
  const P={}; const get=n=>{if(!P[n])P[n]=newStat();return P[n];};
  rows.filter(r=>r.team===team).forEach(r=>{
    const a=(r.playerFrom||'').toString().trim(); if(!a)return;
    const inc=EVENT_INC[evKey(r.event)]; if(inc){const p=get(a);inc.forEach(k=>p[k]++);}
  });
  return P;
}
function statRow(no,s){return[no,s.goals,s.assists,s.totalShots,s.shotsOn,s.shotsOff,s.shotsBlocked,s.missShots,pct(s.shotsOn,s.totalShots),
  s.passes,s.passesComp,pct(s.passesComp,s.passes),s.crosses,s.crossesComp,pct(s.crossesComp,s.crosses),
  s.takeOns,s.takeOnsWon,pct(s.takeOnsWon,s.takeOns),s.stepIns,
  s.tackles,s.tacklesWon,pct(s.tacklesWon,s.tackles),s.interceptions,s.clearances,s.blocks,s.recoveries,s.takeOnConcerns,s.mistakes,
  s.groundDuels,s.groundDuelsWon,s.aerialDuels,s.aerialDuelsWon,
  s.corners,s.freeKicks,s.throwIns,s.goalKicks,s.fouls,s.foulsWon,s.offsides,s.saves];}
function sortedPlayers(P){return Object.keys(P).sort((a,b)=>{const na=+a,nb=+b;
  if(!isNaN(na)&&!isNaN(nb))return na-nb; return a.localeCompare(b);});}

/* ---- the player table, cut into the four tabs it is read in ----
   The wide STAT_HEADERS row split by subject: Defensive = Defensive + Duels,
   Other = Set Pieces + Discipline. Two places draw from this and neither owns
   it — the Stats tab's per-player table for one match (Stats/stats-view.js),
   and a player's whole campaign on the client site's Data page. Kept here so
   they cannot drift: a column added for one of them appears in both.

   Each column is [label, fn] and fn takes ONE stat object, so it works the same
   on a match's figures and on figures added up over a season — which is what
   makes the percentages come out as a ratio of the totals rather than as a mean
   of per-match ratios. */
const PLAYER_CATS={
  shooting:[
    ['Goals',s=>s.goals],['Assists',s=>s.assists],['Key Passes',s=>s.keyPasses],
    ['Total Shots',s=>s.totalShots],['Shots On Target',s=>s.shotsOn],['Shots Off Target',s=>s.shotsOff],
    ['Blocked Shots',s=>s.shotsBlocked],['Miss Shots',s=>s.missShots],
    ['Shooting Accuracy',s=>pct(s.shotsOn,s.totalShots)]],
  distribution:[
    ['Passes',s=>s.passes],['Passes Completed',s=>s.passesComp],['Pass Accuracy',s=>pct(s.passesComp,s.passes)],
    ['Crosses',s=>s.crosses],['Crosses Completed',s=>s.crossesComp],['Cross Accuracy',s=>pct(s.crossesComp,s.crosses)],
    ['Take-ons',s=>s.takeOns],['Take-ons Won',s=>s.takeOnsWon],['Take-on Success',s=>pct(s.takeOnsWon,s.takeOns)],
    ['Step-ins',s=>s.stepIns]],
  defensive:[
    ['Tackles',s=>s.tackles],['Tackles Won',s=>s.tacklesWon],['Tackle Success',s=>pct(s.tacklesWon,s.tackles)],
    ['Interceptions',s=>s.interceptions],['Clearances',s=>s.clearances],['Blocks',s=>s.blocks],['Recoveries',s=>s.recoveries],
    ['Ground Duels',s=>s.groundDuels],['Ground Duels Won',s=>s.groundDuelsWon],
    ['Aerial Duels',s=>s.aerialDuels],['Aerial Duels Won',s=>s.aerialDuelsWon],
    ['Take-on Concerns',s=>s.takeOnConcerns],['Mistakes',s=>s.mistakes]],
  other:[
    ['Corners',s=>s.corners],['Free-kicks',s=>s.freeKicks],['Penalty Kicks',s=>s.penalties],
    ['Throw-ins',s=>s.throwIns],['Goal Kicks',s=>s.goalKicks],
    ['Fouls',s=>s.fouls],['Fouls Won',s=>s.foulsWon],['Offsides',s=>s.offsides],['Saves',s=>s.saves]]
};

/* ---- and the goalkeeper's own, which the four above cannot hold ----
   Two arguments, not one. Everything past Saves needs the match around him: newStat()
   counts what a player DID, and a goal conceded is something that happened to the team
   behind him. `g` is {conceded, clean, known} — every field of it adds up, so a whole
   campaign is these same functions run on the summed pair, and Save Rate comes out as
   one ratio of the totals rather than a mean of per-match ratios.

   `known` counts the matches whose line-ups could answer the question at all. 0 means
   nothing can be said, and "—" is what says so — never 0, which would claim a clean
   sheet nobody recorded. */
const GK_COLS=[
  ['Saves',          (s,g)=>s.saves],
  ['Conceded',       (s,g)=>g.known?g.conceded:'—'],
  ['On Target Faced',(s,g)=>g.known?s.saves+g.conceded:'—'],
  ['Save Rate',      (s,g)=>g.known?pct(s.saves,s.saves+g.conceded):'—'],
  ['Clean Sheets',   (s,g)=>g.known?g.clean:'—'],
  ['Goal Kicks',     (s,g)=>s.goalKicks]
];

/* ---- shots + body part (Event List) ----
   Every shot attempt is one of these events. The body part it was taken with is a
   separate event tagged in the SAME chain entry ("2 free-kick shot-on-target left-foot"),
   so it is looked up by the shot's group id, falling back to the nearest same-player one. */
const SHOT_KINDS=new Set(['goal','shot on target','shot off target','blocked shot','miss shot']);
const BODY_PARTS={'right foot':'Right Foot','left foot':'Left Foot','head':'Header',
  'upper body':'Upper Body','lower body':'Lower Body'};
function shotBodyPart(rows,shot){
  const bp=r=>BODY_PARTS[evKey(r.event)];
  if(shot.grp!=null){const g=rows.find(r=>r.grp===shot.grp&&bp(r)); if(g)return bp(g);}
  const eq=(a,b)=>String(a==null?'':a).trim()===String(b==null?'':b).trim();
  const same=rows.filter(r=>bp(r)&&r.team===shot.team&&eq(r.playerFrom,shot.playerFrom))
    .sort((a,b)=>Math.abs((a.t||0)-(shot.t||0))-Math.abs((b.t||0)-(shot.t||0)));
  return same.length?bp(same[0]):'';
}
// time-ordered list of a team's shots (or both teams when team==null), numbered from 1
function shotList(rows,team){
  return rows.filter(r=>SHOT_KINDS.has(evKey(r.event))&&(team==null||r.team===team)&&r.t!=null)
    .sort((a,b)=>a.t-b.t)
    .map((r,i)=>({idx:i+1,t:r.t,team:r.team,no:String(r.playerFrom||'').trim(),
      event:r.event,bodyPart:shotBodyPart(rows,r)}));
}
// dot colour by shot outcome — matches the donut / shot-map legend
const SHOT_COLOR={'goal':'#f7b32f','shot on target':'#39d98a'};
const shotColor=e=>SHOT_COLOR[evKey(e)]||'#8b97a7';

/* ---- the goal mouth, for the shooting maps ----
   A shot on target or a goal tagged on the main tab also carries gXY: where the ball
   crossed the line, normalised to the mouth itself (x 0 = left post → 100 = right post,
   y 0 = crossbar → 100 = the goal line). Drawing that beside the pitch map is what turns
   "where it was struck from" into "…and where it ended up". It needs no mirroring for
   half or attacking direction — it is already in the goal's own frame, not the pitch's.

   `marks` are {x,y,label,color,square}; `o` themes it, since the Stats tab is dark and
   the printed report is light. */
const GOAL_MAP={w:640,h:232,x:70,y:30,mw:500,mh:167};
function goalMarks(rows,team,pick){
  return (rows||[]).filter(r=>(team==null||r.team===team)&&r.gXY&&SHOT_KINDS.has(evKey(r.event)))
    .map(pick).filter(Boolean);
}
/* The mouth as a bare <g>, drawn into whatever rectangle the caller hands it. The Stats
   map stands it on the goal line of its own vertical pitch — one SVG, so a marker in the
   goal lines up over the pitch beneath it — while the report draws it on its own. */
function goalMouthG(box,marks,o){
  o=o||{};
  const x1=box.x, y1=box.y, x2=box.x+box.w, y2=box.y+box.h;
  const T=o.post||9, R=o.r==null?17:o.r;
  const net=o.net||'#2a3542', frame=o.frame||'#e6edf3', ink=o.ink||'#fff', ring=o.ring||'#0d1117';
  let grid='';
  for(let i=1;i<16;i++){const vx=(x1+i*box.w/16).toFixed(1);
    grid+='<line x1="'+vx+'" y1="'+y1.toFixed(1)+'" x2="'+vx+'" y2="'+y2.toFixed(1)+'"/>';}
  for(let i=1;i<8;i++){const vy=(y1+i*box.h/8).toFixed(1);
    grid+='<line x1="'+x1.toFixed(1)+'" y1="'+vy+'" x2="'+x2.toFixed(1)+'" y2="'+vy+'"/>';}
  const dots=(marks||[]).map(m=>{
    const cx=x1+m.x/100*box.w, cy=y1+m.y/100*box.h;
    const shape=m.square
      ?'<rect x="'+(cx-R).toFixed(1)+'" y="'+(cy-R).toFixed(1)+'" width="'+(R*2)+'" height="'+(R*2)
        +'" rx="4" fill="'+m.color+'" stroke="'+ring+'" stroke-width="2.5"/>'
      :'<circle cx="'+cx.toFixed(1)+'" cy="'+cy.toFixed(1)+'" r="'+R+'" fill="'+m.color
        +'" stroke="'+ring+'" stroke-width="2.5"/>';
    // optional cls / p: the Stats shooting map tags each mark with the player who took
    // the shot, so hovering its ranking can isolate him in the goal as well as on the pitch
    return '<g'+(m.cls?' class="'+m.cls+'"':'')+(m.p==null?'':' data-p="'+esc(m.p)+'"')+'>'
      +shape+'<text x="'+cx.toFixed(1)+'" y="'+(cy+R*0.38).toFixed(1)
      +'" text-anchor="middle" font-size="'+Math.round(R*1.1)+'" font-weight="800" fill="'+ink+'">'
      +(m.label==null?'':m.label)+'</text></g>';
  }).join('');
  return '<g stroke="'+net+'" stroke-width="'+(o.netW||1)+'" fill="none">'+grid+'</g>'
    // the goal line either side of the posts — skipped when the pitch already draws one
    +(o.noLine?'':'<line x1="'+(x1-46)+'" y1="'+y2.toFixed(1)+'" x2="'+(x2+46)+'" y2="'+y2.toFixed(1)
      +'" stroke="'+net+'" stroke-width="2"/>')
    +'<path d="M '+(x1-T/2).toFixed(1)+' '+y2.toFixed(1)+' V '+(y1-T/2).toFixed(1)+' H '+(x2+T/2).toFixed(1)
    +' V '+y2.toFixed(1)+'" fill="none" stroke="'+frame+'" stroke-width="'+T
    +'" stroke-linecap="round" stroke-linejoin="round"/>'
    +dots;
}
function goalMouthSVG(marks,o){
  const G=GOAL_MAP;
  return '<svg viewBox="0 0 '+G.w+' '+G.h+'" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto;display:block">'
    +goalMouthG({x:G.x,y:G.y,w:G.mw,h:G.mh},marks,o)+'</svg>';
}

/* ---- cards on the match timeline ----
   A player's 2nd yellow IS a sending-off and reads as "2nd Yellow → Red". When the tagger
   ALSO tags an explicit red card for that same dismissal, the two describe one event — the
   timeline was listing it twice (a "2nd Yellow → Red" line AND a "Red Card" line, and two
   markers on the Stats timeline). classifyCards() decides, per card row, what to show:
     'yc' first yellow · 'y2' second yellow → red · 'rc' a red that is NOT a 2nd-yellow red
   and OMITS an explicit red for a player who already has two yellows (that dismissal is
   already shown as 'y2'). Returns a Map keyed by the row object. Total yellows are counted
   up front, so two cards tagged in the same second are handled whatever order they sort in. */
function classifyCards(rows){
  const out=new Map(), yc={}, total={};
  const key=r=>r.team+'#'+String(r.playerFrom==null?'':r.playerFrom).trim();
  (rows||[]).forEach(r=>{if(evKey(r.event)==='yellow card')total[key(r)]=(total[key(r)]||0)+1;});
  (rows||[]).filter(r=>r&&r.t!=null).slice().sort((a,b)=>a.t-b.t).forEach(r=>{
    const e=evKey(r.event), k=key(r);
    if(e==='yellow card'){yc[k]=(yc[k]||0)+1; out.set(r, yc[k]>=2?'y2':'yc');}
    else if(e==='red card'){ if((total[k]||0)<2)out.set(r,'rc'); }   // else: same as the 2nd-yellow red
  });
  return out;
}

/* ---- who actually took the pitch ----
   computeStats() only ever hears about players with a tagged event, so a substitute
   who came on and never touched the ball vanished from every table and from the
   heatmap — as if he had not played. These read the squad from the lineups instead:
   the starting XI plus everyone who shows up in a later formation snapshot or as the
   incoming side of a substitution. */
function squadOnPitch(lineups,team){
  const out=[], seen=new Set();
  const add=n=>{const s=String(n==null?'':n).trim();
    if(!s||seen.has(s))return; seen.add(s); out.push(s);};
  const lu=(lineups&&lineups[team])||null; if(!lu)return out;
  (lu.xi||[]).forEach(p=>add(p&&p.no));                       // starting XI
  ((lineups&&lineups.history)||[]).filter(h=>h&&h.team===team)
    .slice().sort((a,b)=>(a.t||0)-(b.t||0))
    .forEach(h=>(h.xi||[]).forEach(p=>add(p&&p.no)));         // every later period
  (lu.subHistory||[]).forEach(s=>add(s&&s.in));               // and every player brought on
  return out;
}
// shirt number -> registered name (Player lists); missing when the squad has no name
function squadNames(lineups,team){
  const m={}, lu=(lineups&&lineups[team])||null; if(!lu)return m;
  (lu.roster||[]).forEach(p=>{const k=String(p&&p.no==null?'':p.no).trim();
    if(k&&p&&p.name)m[k]=String(p.name).trim();});
  return m;
}
/* shirt number -> the players row this squad entry was picked from, where there is one.
   The twin of squadNames(): the same roster, its other column. It is what says that the
   14 of one window and the 9 of the next are the same man — a call-up renumbers a squad,
   and a shirt number is a fact about a match rather than about a person. A squad typed
   in by hand instead of picked from the team's list carries no pid and answers nothing,
   which is why nothing may depend on this alone. */
function squadIds(lineups,team){
  const m={}, lu=(lineups&&lineups[team])||null; if(!lu)return m;
  (lu.roster||[]).forEach(p=>{const k=String(p&&p.no==null?'':p.no).trim();
    if(k&&p&&p.pid)m[k]=String(p.pid);});
  return m;
}
/* Which shirt numbers kept goal, for one side of one match: the GK square of the
   formation board, read off the starting XI and off every later snapshot, so a keeper
   who came on from the bench counts as well. FORMATION_GRID holds exactly one such
   square and every dot's `pos` is written from it (zoneAt), so this is where the analyst
   PUT somebody — not a guess about who stood deepest. */
function gkShirts(lineups,team){
  const out=new Set(), lu=(lineups&&lineups[team])||null; if(!lu)return out;
  const take=xi=>(xi||[]).forEach(p=>{if(p&&p.pos==='GK'){
    const k=String(p.no==null?'':p.no).trim(); if(k)out.add(k);}});
  take(lu.xi);
  ((lineups&&lineups.history)||[]).filter(h=>h&&h.team===team).forEach(h=>take(h.xi));
  return out;
}
// label for a shirt number: the registered name, else the old "Player 7" placeholder
const playerLabel=(names,no)=>{const k=String(no==null?'':no).trim();
  if(!k)return '';
  return (names&&names[k])||(isNaN(+k)?k:'Player '+k);};
// pad a computeStats() result with a zero row for everyone who played but never
// appeared in an event, so the tables list the whole matchday squad
function withSquad(P,lineups,team){
  squadOnPitch(lineups,team).forEach(no=>{if(!P[no])P[no]=newStat();});
  return P;
}

/* ---- minutes played ----
   lineups.history is a list of SNAPSHOTS, not of changes: each one is the whole XI
   from its own moment on (effectiveLU() in index.html reads it that way), so who was
   on the pitch is a step function of time and minutes played is the length of the
   stretches a shirt number spends inside it. Working from the snapshots rather than
   replaying the substitution and red-card rows is what makes the number agree with
   the formation board whatever produced the change: two swaps in one entry, a
   sending-off inside a chain (13f*yc*rc), a swap tagged out of order, a period
   re-tagged or deleted afterwards. None of that is this function's business.

   Measured on the MATCH clock, not the video's: the stretch between the half-time
   whistle and the second-half kick-off is inside neither window, so a swap made at
   the interval is worth 45' to both players without a special case. Stoppage time is
   capped by the half exactly as the minute labels cap it, so a man who plays every
   minute reads 90' and not 96'. */
const clockAt=(vt,w)=>Math.min(w.clock0+Math.max(0,Math.min(vt,w.end)-w.start),w.cap);
/* The windows a match is actually played in, as {half,start,end,clock0,cap} in video
   seconds. A half is a window only when its PAIR of boundaries makes one — h1Start is
   allowed to be 0, a video that opens on the kick-off is the ordinary case. With no
   second-half kick-off to split on, the video is one long half (the same reading
   squadInHalf() takes) and the answer says of itself that it is not exact. */
function matchWindows(dur,lastT){
  const d=dur||{}, L=(+d.halfLen||45)*60, end=Math.max(0,+lastT||0);
  const s1=+d.h1Start||0, e1=+d.h1End||0, s2=+d.h2Start||0, e2=+d.h2End||0;
  if(!d.enabled||!(s2>s1))
    return [{half:1,start:d.enabled?s1:0,end:Math.max(s1,e1,end),clock0:0,cap:2*L,exact:false}];
  return [{half:1,start:s1,end:e1>s1?e1:s2,clock0:0,cap:L,exact:e1>s1},
          {half:2,start:s2,end:e2>s2?e2:Math.max(s2,end),clock0:L,cap:2*L,exact:e2>s2}];
}
/* How long each shirt number was on the pitch, for one side:
     {'7':{min,sec,h1,h2,sentOff,exact}}   — min is whole minutes, for display
   null when the side has no line-up at all: nothing can be said then, and a column of
   zeroes would say something false. `rows` is read for one thing only — the last
   tagged moment, which stands in for the full-time whistle when Duration has none. */
function playedMinutes(lineups,dur,team,rows){
  const lu=(lineups&&lineups[team])||null;
  const hist=((lineups&&lineups.history)||[]).filter(h=>h&&h.team===team&&h.xi)
    .slice().sort((a,b)=>(+a.t||0)-(+b.t||0));
  const xi0=(lu&&lu.xi)||[];
  if(!xi0.length&&!hist.length)return null;
  const key=n=>String(n==null?'':n).trim();
  const setOf=xi=>{const s=new Set();(xi||[]).forEach(p=>{const k=key(p&&p.no);if(k)s.add(k);});return s;};

  /* Walk the snapshots, opening a stretch when a shirt appears and closing it when it
     goes. -Infinity / Infinity stand for "since the kick-off" / "until the whistle";
     the windows clip them, so a match whose boundaries were never set still adds up. */
  const iv={}, open={};
  const close=(no,t,red)=>{if(!(no in open))return;
    (iv[no]=iv[no]||[]).push({from:open[no],to:t,red:!!red}); delete open[no];};
  setOf(xi0).forEach(no=>{open[no]=-Infinity;});
  hist.forEach(h=>{
    const t=+h.t||0, next=setOf(h.xi), off=key(h.off);
    Object.keys(open).forEach(no=>{if(!next.has(no))close(no,t,!!off&&off===no);});
    next.forEach(no=>{if(!(no in open))open[no]=t;});
  });
  /* A swap whose snapshot was edited away still counts — the same fallback
     squadOnPitch() and squadInHalf() make, matched to a snapshot on the ±3s the events
     table ties a period to its rows with, so a swap that HAS one is never counted twice. */
  ((lu&&lu.subHistory)||[]).forEach(s=>{
    if(!s)return; const t=+s.t||0;
    if(hist.some(h=>Math.abs((+h.t||0)-t)<=3))return;
    const out=key(s.out), inNo=key(s.in);
    if(out)close(out,t,false);                                  // he was on until the swap
    if(!inNo)return;
    const first=(iv[inNo]||[])[0];                              // …and his replacement from it on
    if(inNo in open)open[inNo]=Math.min(open[inNo],t);
    else if(first)first.from=Math.min(first.from,t);
    else open[inNo]=t;
  });
  Object.keys(open).forEach(no=>close(no,Infinity,false));

  const most=a=>a.reduce((m,v)=>v>m?v:m,0);
  const wins=matchWindows(dur,Math.max(most((rows||[]).map(r=>+(r&&r.t)||0)),
                                       most(hist.map(h=>+h.t||0))));
  const exact=wins.every(w=>w.exact);
  const out={};
  Object.keys(iv).forEach(no=>{
    let sec=0,h1=0,h2=0,played=false;
    wins.forEach(w=>iv[no].forEach(s=>{
      const from=Math.max(s.from===-Infinity?w.start:s.from,w.start);
      const to=Math.min(s.to===Infinity?w.end:s.to,w.end);
      if(to<=from)return;                       // this stretch is not inside this half
      played=true;
      const d=clockAt(to,w)-clockAt(from,w);    // capped: stoppage does not run the total past 90
      sec+=d; if(w.half===2)h2+=d; else h1+=d;
    }));
    // a man brought on deep in stoppage has played, however little the capped clock moved
    out[no]={sec,h1,h2,exact,sentOff:iv[no].some(s=>s.red),
      min:sec>0?Math.max(1,Math.round(sec/60)):(played?1:0)};
  });
  return out;
}

/* Who was on the pitch for `team` at video-second t. lineups.history is a list of whole
   SNAPSHOTS rather than of changes, so the answer is the last one taken before that
   moment — the reading effectiveLU() takes in the tagging app and playedMinutes() takes
   above. It is what turns "a goal went in" into "a goal went in past THIS keeper", and
   it needs no special case for a substitution, a sending-off or a swap tagged out of
   order: whatever produced the snapshot, the snapshot is the answer. */
function onPitchAt(lineups,team,t){
  const out=new Set(), lu=(lineups&&lineups[team])||null; if(!lu)return out;
  const hist=((lineups&&lineups.history)||[]).filter(h=>h&&h.team===team&&h.xi&&(+h.t||0)<=t)
    .slice().sort((a,b)=>(+a.t||0)-(+b.t||0));
  const xi=hist.length?hist[hist.length-1].xi:(lu.xi||[]);
  (xi||[]).forEach(p=>{const k=String(p&&p.no==null?'':p.no).trim(); if(k)out.add(k);});
  return out;
}

/* ---- pass distribution matrix ---- */
const PASS_EVENTS=new Set(['pass success','cross success']);
function passMatrix(rows,team){
  const mtx={}, pset=new Set();
  rows.forEach(r=>{
    if(r.team!==team||!PASS_EVENTS.has(r.event))return;
    const f=(r.playerFrom||'').toString().trim(), t=(r.playerTo||'').toString().trim();
    if(!f||!t)return;
    pset.add(f);pset.add(t); (mtx[f]=mtx[f]||{})[t]=((mtx[f]||{})[t]||0)+1;
  });
  const players=[...pset].sort((a,b)=>{const na=+a,nb=+b;return(!isNaN(na)&&!isNaN(nb))?na-nb:(''+a).localeCompare(b);});
  return {players,mtx};
}

/* ---- team totals + General comparison ---- */
function sumTeam(rows,team){
  const P=computeStats(rows,team), t=newStat();
  Object.values(P).forEach(s=>{for(const k in t)t[k]+=s[k];});
  return t;
}
const TEAM_SECTIONS=[
  ['Attacking Stats',[
    ['Goals',(s,o)=>s.goals],['Assists',(s,o)=>s.assists],['Key Passes',(s,o)=>s.keyPasses],['Total Shots',(s,o)=>s.totalShots],
    ['Shots On Target',(s,o)=>s.shotsOn],['Shots Off Target',(s,o)=>s.shotsOff],
    ['Blocked Shots',(s,o)=>s.shotsBlocked],['Miss Shots',(s,o)=>s.missShots],
    ['Shooting Accuracy',(s,o)=>pct(s.shotsOn,s.totalShots)]]],
  ['Distribution Stats',[
    ['Possession %',(s,o)=>pct(s.passes,s.passes+o.passes)],['Passes',(s,o)=>s.passes],
    ['Passes Completed',(s,o)=>s.passesComp],['Pass Accuracy',(s,o)=>pct(s.passesComp,s.passes)],
    ['Crosses',(s,o)=>s.crosses],['Crosses Completed',(s,o)=>s.crossesComp],
    ['Take-ons',(s,o)=>s.takeOns],['Take-ons Won',(s,o)=>s.takeOnsWon],
    ['Take-on Success',(s,o)=>pct(s.takeOnsWon,s.takeOns)],['Step-ins',(s,o)=>s.stepIns]]],
  ['Defensive Stats',[
    ['Tackles',(s,o)=>s.tackles],['Tackles Won',(s,o)=>s.tacklesWon],
    ['Tackle Success',(s,o)=>pct(s.tacklesWon,s.tackles)],['Interceptions',(s,o)=>s.interceptions],
    ['Recoveries',(s,o)=>s.recoveries],['Clearances',(s,o)=>s.clearances],['Blocks',(s,o)=>s.blocks],
    ['Aerial Duels',(s,o)=>s.aerialDuels],['Aerial Duels Won',(s,o)=>s.aerialDuelsWon],
    ['Ground Duels',(s,o)=>s.groundDuels],['Ground Duels Won',(s,o)=>s.groundDuelsWon],
    ['Take-on Concerns',(s,o)=>s.takeOnConcerns],['Mistakes',(s,o)=>s.mistakes]]],
  ['Discipline & GK',[
    ['Goals Conceded',(s,o)=>o.goals],['Saves',(s,o)=>s.saves],['Fouls',(s,o)=>s.fouls],
    ['Offsides',(s,o)=>s.offsides],['Corners',(s,o)=>s.corners],
    ['Free-kicks',(s,o)=>s.freeKicks],['Throw-ins',(s,o)=>s.throwIns],['Goal Kicks',(s,o)=>s.goalKicks],
    ['Penalty Kicks',(s,o)=>s.penalties]]]
];
const numOf=v=>{const m=(''+v).match(/-?\d+(\.\d+)?/);return m?+m[0]:0;};
