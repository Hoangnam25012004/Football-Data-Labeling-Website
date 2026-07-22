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
  duration:'pitchtagger.duration.v1',
  rows:'pitchtagger.rows.v1',
  meta:'pitchtagger.meta.v1'
};
function loadJSON(k,def){try{const s=localStorage.getItem(k);if(s){const o=JSON.parse(s);if(o!=null)return o;}}catch(e){}return def;}
function loadRows(){const r=loadJSON(PT_KEYS.rows,[]);return Array.isArray(r)?r:[];}
const blankTeamLU=dir=>({roster:[],xi:[],subs:[],dir:dir||'lr'});
function loadLineups(){const o=loadJSON(PT_KEYS.lineups,null);return (o&&o.home&&o.away)?o:{home:blankTeamLU('lr'),away:blankTeamLU('rl')};}
function saveLineupsLS(l){try{localStorage.setItem(PT_KEYS.lineups,JSON.stringify(l));}catch(e){}}
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
  'take-on concern':['takeOns'],
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
  'offside':['offsides'],
  'mistake':['mistakes'],
  'save':['saves']
};
const STAT_GROUPS=[['',1],['Shooting',8],['Distribution',10],['Defensive',8],['Duels',4],['Set Pieces',4],['Discipline',3]];
const STAT_HEADERS=['No','Goals','Assists','Total Shots','Shots On Target','Shots Off Target','Blocked Shots','Miss Shots','Shooting Accuracy',
  'Passes','Passes Completed','Pass Accuracy','Crosses','Crosses Completed','Cross Accuracy',
  'Take-ons','Take-ons Won','Take-on Success','Step-ins',
  'Tackles','Tackles Won','Tackle Success','Interceptions','Clearances','Blocks','Recoveries','Mistakes',
  'Ground Duels','Ground Duels Won','Aerial Duels','Aerial Duels Won',
  'Corners','Free-kicks','Throw-ins','Goal Kicks','Fouls','Offsides','Saves'];
function newStat(){return{goals:0,assists:0,keyPasses:0,totalShots:0,shotsOn:0,shotsOff:0,shotsBlocked:0,missShots:0,passes:0,passesComp:0,
  crosses:0,crossesComp:0,takeOns:0,takeOnsWon:0,stepIns:0,tackles:0,tacklesWon:0,interceptions:0,
  clearances:0,blocks:0,recoveries:0,groundDuels:0,groundDuelsWon:0,aerialDuels:0,aerialDuelsWon:0,
  corners:0,freeKicks:0,penalties:0,throwIns:0,goalKicks:0,fouls:0,offsides:0,mistakes:0,saves:0};}
const pct=(n,d)=> (d? (Math.round(n/d*1000)/10).toFixed(1):'0.0')+'%';
function computeStats(rows,team){
  const P={}; const get=n=>{if(!P[n])P[n]=newStat();return P[n];};
  rows.filter(r=>r.team===team).forEach(r=>{
    const a=(r.playerFrom||'').toString().trim(); if(!a)return;
    const inc=EVENT_INC[r.event]; if(inc){const p=get(a);inc.forEach(k=>p[k]++);}
  });
  return P;
}
function statRow(no,s){return[no,s.goals,s.assists,s.totalShots,s.shotsOn,s.shotsOff,s.shotsBlocked,s.missShots,pct(s.shotsOn,s.totalShots),
  s.passes,s.passesComp,pct(s.passesComp,s.passes),s.crosses,s.crossesComp,pct(s.crossesComp,s.crosses),
  s.takeOns,s.takeOnsWon,pct(s.takeOnsWon,s.takeOns),s.stepIns,
  s.tackles,s.tacklesWon,pct(s.tacklesWon,s.tackles),s.interceptions,s.clearances,s.blocks,s.recoveries,s.mistakes,
  s.groundDuels,s.groundDuelsWon,s.aerialDuels,s.aerialDuelsWon,
  s.corners,s.freeKicks,s.throwIns,s.goalKicks,s.fouls,s.offsides,s.saves];}
function sortedPlayers(P){return Object.keys(P).sort((a,b)=>{const na=+a,nb=+b;
  if(!isNaN(na)&&!isNaN(nb))return na-nb; return a.localeCompare(b);});}

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
    ['Mistakes',(s,o)=>s.mistakes]]],
  ['Discipline & GK',[
    ['Goals Conceded',(s,o)=>o.goals],['Saves',(s,o)=>s.saves],['Fouls',(s,o)=>s.fouls],
    ['Offsides',(s,o)=>s.offsides],['Corners',(s,o)=>s.corners],
    ['Free-kicks',(s,o)=>s.freeKicks],['Throw-ins',(s,o)=>s.throwIns],['Goal Kicks',(s,o)=>s.goalKicks],
    ['Penalty Kicks',(s,o)=>s.penalties]]]
];
const numOf=v=>{const m=(''+v).match(/-?\d+(\.\d+)?/);return m?+m[0]:0;};
