/* ============================================================================
   Stats/stats-view.js — the Stats page, as a thing that can be mounted.

   This file IS the Stats page: the whole of what used to be the inline script
   in Stats/index.html, moved across unchanged except at six points, all of
   them about who owns the data and when the view is drawn. The renderers, the
   maps, the tables and the exports are the same lines they always were — the
   test suite lifts them out of here by name and runs them, so a change to one
   of those bodies fails a test rather than passing quietly.

   Two hosts, one implementation:

     Stats/index.html   keeps its own header and toggles, reads localStorage
                        from the tagging tab, and follows a #match= link into
                        cloud mode. It mounts with {chrome:false, local:true,
                        cloud:true} and behaves exactly as it did before.

     the client site    renders the toolbar this file provides and hands over a
                        published report. It fetches nothing, subscribes to
                        nothing, and touches no localStorage: a mounted view
                        draws what it was given.

   Loaded after shared.js, which it uses throughout ($, esc, computeStats,
   the pitches, the goal mouth). report.js reads the current four values back
   out through PTStats.data().
   ========================================================================== */
window.PTStats = (function () {
'use strict';

/* What a view holds before any data reaches it. loadMeta()/loadRows() read the
   tagging tab's localStorage, which is the one thing a mounted view must not
   do on its own — the Stats page still calls them, through loadLocal(). */
const blankMeta=()=>({home:'Home',away:'Away',sport:'football',
  homeTeamId:null,awayTeamId:null,matchId:null,matchCode:null});
const blankDur=()=>({enabled:false,halfLen:45,h1Start:0,h1End:0,h2Start:0,h2End:0});

let root=null, opts={}, mounted=false;

/* The lineup store is shared by every tab and by every match this browser has ever opened,
   so a stored squad is only ours if its stamp names the match that is actually open. Taking
   it unconditionally is what put a previous match's formation on this page when no match had
   been opened at all. Player-Lists has always checked; this page did not. */
const ourLineups=()=>lineupsAreFor(loadMeta().matchId)?loadLineups():blankLineups();
// no shotHalf any more: the shooting map shows both halves at once, normalised to attack up
let rows=[], meta=blankMeta(), lineups=blankLineups(), statView='overall', statTeam='home', statCat='shooting', defHalf=0, defCat='tackles', othCat='fouls';
let heatHalf=0;   // touch heatmap half filter: 0 = both halves
let distCat='passes', distHalf=0;   // the distribution map: which action, and which half

/* per-category column sets — the wide table split into 4 tabs.
   Defensive = Defensive + Duels; Other = Set Pieces + Discipline. */
const STAT_CATS={
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

/* Three views of the open match, picked by the top row of buttons:
     Overall    both sides at once — the summary timeline, the starting formations
                and the team-vs-team comparison
     Dashboard  one side, one category: the visualizations
     Stats      the same side and category: the per-player table
   Dashboard and Stats are the two halves of what used to be one combined view, so
   they share the side picker and the category tabs and differ only in what they
   render underneath. */
function renderStats(){
  // Film holds a video, an animation loop and a document listener. Whatever is
  // about to be drawn, none of that may survive the redraw.
  filmStop();
  /* No open match -> the notice, not the last match's leftovers. The stores are shared by
     every match this browser has opened, so with none open there is nothing here that can
     be said to belong to anything. A #match= link loads over the cloud and sets meta.matchId
     before it re-renders, so that route lights the page up on its own. */
  const open=!!meta.matchId;
  $('noMatchMsg').style.display=open?'none':'block';
  document.querySelector('.stats-wrap').style.display=open?'':'none';
  $('teamToggle').style.display='none';
  $('catToggle').style.display='none';
  if(!open)return;
  $('viewOverallBtn').className=statView==='overall'?'act-gen':'';
  $('viewDashBtn').className=statView==='dashboard'?'act-gen':'';
  $('viewStatsBtn').className=statView==='stats'?'act-gen':'';
  // a host whose header predates Film simply has no button to light up
  if($('viewFilmBtn'))$('viewFilmBtn').className=statView==='film'?'act-gen':'';
  const perTeam=statView!=='overall'&&statView!=='film';
  $('teamToggle').style.display=perTeam?'flex':'none';
  $('catToggle').style.display=perTeam?'flex':'none';
  $('statHomeBtn').className=statTeam==='home'?'act-home':'';
  $('statAwayBtn').className=statTeam==='away'?'act-away':'';
  $('statHomeBtn').textContent=meta.home;
  $('statAwayBtn').textContent=meta.away;
  document.querySelectorAll('#catToggle button').forEach(b=>b.className=b.dataset.cat===statCat?'act-gen':'');
  const holder=$('statsHolder');
  if(statView==='film'){renderFilm(holder);return;}
  if(!perTeam){renderGeneral();return;}
  // the whole matchday squad, not just the players who happened to be tagged: a
  // substitute who came on without touching the ball still gets his (zero) row
  const P=withSquad(computeStats(rows,statTeam),lineups,statTeam), players=sortedPlayers(P);
  if(!players.length){holder.innerHTML='<div class="stats-empty">No events for this team yet.</div>';return;}
  if(statView==='stats'){holder.innerHTML=statTableHTML(P,players);return;}
  holder.innerHTML=dashboardHTML(statTeam);
  if(statCat==='distribution')heatHover('');   // canvas must exist in the DOM first
}
/* Stats view: the per-player table for the chosen category, and nothing else. */
function statTableHTML(P,players){
  const names=squadNames(lineups,statTeam), cols=STAT_CATS[statCat];
  const head='<th class="no">No</th><th class="pl">Player</th>'+cols.map(c=>`<th>${c[0]}</th>`).join('');
  const body=players.map(no=>'<tr><td class="no">'+esc(no)+'</td>'
    +`<td class="pl">${esc(playerLabel(names,no))}</td>`
    +cols.map(c=>`<td>${c[1](P[no])}</td>`).join('')+'</tr>').join('');
  return `<table class="stats"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}
/* Dashboard view: the visualizations for the chosen category, and nothing else.
   Shooting: donut + shot-location map side by side.
   Distribution: pass matrix on the left, volume/accuracy scatter on its right. */
function dashboardHTML(team){
  let extra='';
  if(statCat==='shooting'){
    /* The three of these hold named places in a grid rather than wrapping as
       they please — the map is far taller than the donut, so a wrapped row
       stranded the ranking below everything. See .sh-grid in stats-view.css. */
    extra=`<div class="chart-row sh-row"><div class="sh-grid">`
      +`${shootingChartHTML(team)}${shotMapHTML(team)}${shotRankHTML(team)}</div></div>`;
  }else if(statCat==='distribution'){
    extra=`<div class="chart-row">${heatMapHTML(team)}</div>`
      +`<div class="chart-row">${distMapHTML(team)}</div>`;
  }else if(statCat==='defensive'){
    extra=`<div class="chart-row">${defMapHTML(team)}</div>`;
  }else if(statCat==='other'){
    const othMap=othCat==='fouls'?foulMapHTML(team)
      :othCat==='foulsWon'?plainEventMapHTML(team,'foul won')
      :plainEventMapHTML(team,'offside');
    extra=`<div class="chart-row">${othMap}</div>`;
  }
  return extra;
}
/* attacking direction for a half — inferred from where this team's shots land
   ('right' if their shots average past midfield, else 'left'); if a half has no
   shots, use the opposite of the other half; sensible default otherwise. */
function attackDir(team,half){
  const shotKinds=new Set(['goal','shot on target','shot off target','blocked shot','miss shot']);
  const meanX=h=>{const xs=rows.filter(r=>r.team===team&&shotKinds.has(r.event)&&r.pXY&&eventHalf(r)===h).map(r=>r.pXY.x);
    return xs.length?xs.reduce((s,v)=>s+v,0)/xs.length:null;};
  let m=meanX(half); if(m==null){const o=meanX(half===1?2:1); if(o!=null)m=100-o;}
  if(m==null)return half===1?'right':'left';
  return m>=50?'right':'left';
}
// attacking-direction arrow drawn near the top of the pitch (viewBox coords)
function dirArrowSVG(dir){
  const W=1050,y=42,off=140,cx=W/2, x0=cx-off, x1=cx+off;
  const sx=dir==='right'?x0:x1, ex=dir==='right'?x1:x0, hd=dir==='right'?-22:22;
  return `<g opacity="0.72"><line x1="${sx}" y1="${y}" x2="${ex}" y2="${y}" stroke="#fff" stroke-width="5"/>`
    +`<polyline points="${ex+hd},${y-12} ${ex},${y} ${ex+hd},${y+12}" fill="none" stroke="#fff" stroke-width="5"/>`
    +`<text x="${cx}" y="${y-16}" text-anchor="middle" font-size="21" fill="#fff">Attacking</text></g>`;
}
/* Defensive-action location map: dropdown picks the action; won/lost split by colour. */
const DEF_CATS={
  tackles:{label:'Tackles',parts:[['tackle success','Won','#39d98a'],['tackle fail','Lost','#f7506b']]},
  interceptions:{label:'Interceptions',parts:[['interception','Interception','#2f81f7']]},
  clearances:{label:'Clearances',parts:[['clearance','Clearance','#2f81f7']]},
  blocks:{label:'Blocks',parts:[['block','Block','#2f81f7']]},
  recoveries:{label:'Recoveries',parts:[['recovery','Recovery','#2f81f7']]},
  ground:{label:'Ground Duels',parts:[['ground duel success','Won','#39d98a'],['ground duel fail','Lost','#f7506b']]},
  aerial:{label:'Aerial Duels',parts:[['aerial duel success','Won','#39d98a'],['aerial duel fail','Lost','#f7506b']]},
  takeOnConcern:{label:'Take-on Concern',parts:[['take-on concern','Take-on Concern','#ff8a3d']]},
  mistakes:{label:'Mistakes',parts:[['mistake','Mistake','#f7b32f']]}
};
/* a value going into an inline handler, fn('…'): escaped for the JS string, then for the
   attribute. split/join rather than a regex literal — the test harness lifts this by
   scanning the source, and its scanner reads a regex's quotes as string quotes. */
const jsArg=s=>esc(String(s==null?'':s).split('\\').join('\\\\').split("'").join("\\'"));
/* hover a ranking row to isolate that player, the way the touch heatmap does.
   Nothing is re-rendered: the whole team's dots are drawn already, and every
   player's bands were worked out alongside them, so this only flips attributes.
   Keyed by shirt number; '' puts the whole team back. */
let _defBands={};
function defHover(p){
  const b=_defBands[p]||_defBands['']||[];
  document.querySelectorAll('.dm-band').forEach((t,i)=>{if(b[i]!=null)t.textContent=b[i];});
  document.querySelectorAll('.dm-dot').forEach(g=>{g.style.display=(!p||g.dataset.p===p)?'':'none';});
  document.querySelectorAll('.dm-rank tbody tr').forEach(tr=>{
    tr.classList.toggle('sel',!!p&&tr.dataset.p===p);
    tr.classList.toggle('dim',!!p&&tr.dataset.p!==p);
  });
}
/* ---- Defensive: one VERTICAL map per action, beside its ranking ----
   The dropdown picks the action and the All / 1st / 2nd buttons pick the period.
   Both halves are normalised so the team always attacks UP, so "All" is one
   picture rather than two behind a toggle. The bands read like the other maps'
   do, turned to match the pitch: down the left = share by third along the pitch
   (attacking third at the top), along the bottom = share by third across it.
   Hovering a player in the ranking narrows the dots AND both sets of bands to him. */
function defMapHTML(team){
  const cat=DEF_CATS[defCat]||DEF_CATS.tackles;
  const opts=Object.entries(DEF_CATS).map(([k,c])=>`<option value="${k}"${k===defCat?' selected':''}>${c.label}</option>`).join('');
  const head=`<div class="chart-head"><div></div>`
    +`<div class="head-ctrls"><select class="def-sel" onchange="setDefCat(this.value)">${opts}</select>`
    +`<div class="half-toggle"><button class="${defHalf===0?'on':''}" onclick="setDefHalf(0)">All</button>`
    +`<button class="${defHalf===1?'on':''}" onclick="setDefHalf(1)">1st</button>`
    +`<button class="${defHalf===2?'on':''}" onclick="setDefHalf(2)">2nd</button></div></div></div>`;
  // the pitch stood on end: the landscape 1050x680 becomes 680 wide x 1050 tall,
  // with a margin down the left for the length bands and one below for the width bands
  const d=PITCH_DIMS.football, PW=d.h, PH=d.w, mL=140, mB=130, W=mL+PW, H=PH+mB;
  const teamColor=team==='home'?'var(--home)':'var(--away)';
  // keyed through evKey: event names come from a user-editable list, so "Take-on Concern"
  // must find the same dots as "take-on concern" (see the evKey note in shared.js)
  const col={}; cat.parts.forEach(([ev,,c])=>col[evKey(ev)]=c);
  const dir={1:attackDir(team,1),2:attackDir(team,2)};
  const acts=rows.filter(r=>r.team===team&&col[evKey(r.event)]&&r.pXY&&(!defHalf||eventHalf(r)===defHalf))
    .map(r=>{
      const flip=dir[eventHalf(r)]==='left';
      const px=flip?100-r.pXY.x:r.pXY.x, py=flip?100-r.pXY.y:r.pXY.y;
      return {x:py/100*PW, y:(100-px)/100*PH,          // attacking right -> attacking up
              c:col[evKey(r.event)], k:evKey(r.event), no:(r.playerFrom||'').toString().trim()};
    });
  /* the ranking: everyone with at least one of these actions. Tackles, Ground Duels and
     Aerial Duels are a won-lost pair, and a pair ranks on how often the player came out
     on top rather than on how often he tried; the rest rank on how many. The pair is
     spotted the way report.js spots it — parts[0] is the winning event — so the dropdown
     stays the single place either of them is described. Ties share a rank and the next
     one skips it, so the numbers stay the positions they name. */
  const succKey=cat.parts.length===2?evKey(cat.parts[0][0]):null;
  const cnt={}, won={};
  acts.forEach(a=>{if(!a.no)return;
    cnt[a.no]=(cnt[a.no]||0)+1; if(a.k===succKey)won[a.no]=(won[a.no]||0)+1;});
  const rateOf=no=>cnt[no]?(won[no]||0)/cnt[no]:0;
  const order=Object.keys(cnt).sort((a,b)=>(succKey?rateOf(b)-rateOf(a):0)||cnt[b]-cnt[a]
    ||((isNaN(+a)||isNaN(+b))?String(a).localeCompare(String(b)):+a-+b));
  // no data -> keep the pitch and the 0% bands, just draw no dots.
  // Every player's bands are worked out here so hovering costs nothing later.
  const bandsOf=list=>{
    const v=[0,0,0], h=[0,0,0];
    list.forEach(a=>{v[Math.min(2,Math.floor(a.y/PH*3))]++;h[Math.min(2,Math.floor(a.x/PW*3))]++;});
    const p=n=>list.length?Math.round(n/list.length*100)+'%':'0%';
    return [p(v[0]),p(v[1]),p(v[2]),p(h[0]),p(h[1]),p(h[2])];
  };
  _defBands={'':bandsOf(acts)};
  order.forEach(no=>{_defBands[no]=bandsOf(acts.filter(a=>a.no===no));});
  const band=_defBands[''];
  const dots=acts.map(a=>{
    const cx=a.x.toFixed(1), cy=a.y.toFixed(1);
    return `<g class="dm-dot" data-p="${esc(a.no)}">`
      +`<circle cx="${cx}" cy="${cy}" r="16" fill="${a.c}" fill-opacity="0.92" stroke="#000000" stroke-width="2"/>`
      +`<text x="${cx}" y="${(+cy+6).toFixed(1)}" text-anchor="middle" font-size="17" font-weight="800" fill="#06281a">${esc(a.no)}</text></g>`;
  }).join('');
  // attacking arrow, stood up inside the centre circle
  const ax=PW/2, ay=PH/2;
  const arrow=`<g opacity="0.5" stroke="#fff" fill="none" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">`
    +`<line x1="${ax}" y1="${ay+54}" x2="${ax}" y2="${ay-54}"/>`
    +`<polyline points="${ax-26},${ay-28} ${ax},${ay-54} ${ax+26},${ay-28}"/></g>`;
  const pitchG=`<g transform="translate(${mL} 0)">`
    +`<rect width="${PW}" height="${PH}" fill="rgba(26,62,32,0.72)"/>`
    +`<g transform="translate(0 ${PH}) rotate(-90)"><g fill="none" stroke="${PITCH_LINE}" stroke-width="3">${pitchFootball(PH,PW,false)}</g></g>`
    +arrow+dots+`</g>`;
  let over='';
  for(let i=0;i<3;i++)
    over+=`<text class="dm-band" x="${(mL/2).toFixed(0)}" y="${((i+0.5)*PH/3+12).toFixed(0)}" text-anchor="middle" font-size="34" font-weight="700" fill="${teamColor}">${band[i]}</text>`;
  [1,2].forEach(i=>over+=`<line x1="12" y1="${i*PH/3}" x2="${mL}" y2="${i*PH/3}" stroke="var(--line)" stroke-width="2"/>`);
  over+=`<text x="${(mL/2).toFixed(0)}" y="${(PH+mB/2+9).toFixed(0)}" text-anchor="middle" font-size="26" fill="var(--mut)">Total</text>`;
  for(let i=0;i<3;i++)
    over+=`<text class="dm-band" x="${(mL+(i+0.5)*PW/3).toFixed(0)}" y="${(PH+mB/2+12).toFixed(0)}" text-anchor="middle" font-size="34" font-weight="700" fill="${teamColor}">${band[3+i]}</text>`;
  [1,2].forEach(i=>over+=`<line x1="${mL+i*PW/3}" y1="${PH+14}" x2="${mL+i*PW/3}" y2="${H-14}" stroke="var(--line)" stroke-width="2"/>`);
  over+=`<line x1="${mL}" y1="12" x2="${mL}" y2="${H-14}" stroke="var(--line)" stroke-width="2"/>`
    +`<line x1="12" y1="${PH}" x2="${W-12}" y2="${PH}" stroke="var(--line)" stroke-width="2"/>`;
  const names=squadNames(lineups,team);
  let prevK=null;
  const rankRows=order.map((no,i)=>{
    const c=cnt[no], s=won[no]||0;
    const k=succKey?c+'/'+s:String(c);          // tied when the figures they are ranked on match
    const rk=k===prevK?'':String(i+1); prevK=k;
    return `<tr data-p="${esc(no)}" onmouseenter="defHover('${jsArg(no)}')" onmouseleave="defHover('')">`
      +`<td class="dm-r">${rk}</td>`
      +`<td><b class="dm-no">${esc(no)}.</b> ${esc(playerLabel(names,no))}</td>`
      +`<td class="dm-c">${c}</td>`
      +(succKey?`<td class="dm-c">${Math.round(s/c*100)}%</td>`:'')
      +`</tr>`;
  }).join('');
  const legend=cat.parts.map(([,l,c])=>`<span class="sm-leg"><span class="leg-dot" style="background:${c}"></span>${l}</span>`).join('');
  return `<div class="chart-card map-card">${head}<div class="dm-flex">`
    +`<div class="dm-map"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto;display:block">`
    +`${pitchG}${over}</svg><div class="shotmap-legend">${legend}</div></div>`
    +`<div class="dm-side"><div class="dm-title">${esc(cat.label)}</div>`
    +`<div class="dm-wrap"><table class="dm-rank">`
    +`<thead><tr><th class="dm-r">Rank</th><th>Name</th><th class="dm-c">Count</th>`
    +(succKey?`<th class="dm-c">Success</th>`:'')+`</tr></thead><tbody>`
    +(rankRows||`<tr><td colspan="${succKey?4:3}" class="dm-empty">No ${esc(cat.label.toLowerCase())} tagged for this period.</td></tr>`)
    +`</tbody></table></div></div></div></div>`;
}
function setDefCat(v){defCat=v;renderStats();}
function setDefHalf(h){defHalf=h;renderStats();}
/* ---- Shooting: donut of Goals / On-target / Off-target+Blocked (image 1) ---- */
function arcPath(cx,cy,rr,a0,a1){
  const p=a=>[cx+rr*Math.cos(a),cy+rr*Math.sin(a)];
  const [x0,y0]=p(a0),[x1,y1]=p(a1), large=(a1-a0)>Math.PI?1:0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${rr} ${rr} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
function shootingChartHTML(team){
  const s=sumTeam(rows,team), total=s.totalShots;
  if(!total)return `<div class="chart-card"><div class="stats-empty">No shots yet.</div></div>`;
  const goals=s.goals, onNon=Math.max(0,s.shotsOn-s.goals), off=s.shotsOff+s.shotsBlocked+s.missShots;
  const segs=[['Goals',goals,'#f7b32f'],['On Target',onNon,'#39d98a'],['Off Target / Blocked / Missed',off,'#8b97a7']];
  const cx=90,cy=90,rr=62,thick=26; let a=-Math.PI/2, ring='';
  segs.forEach(([lbl,val,col])=>{
    if(val<=0)return;
    const frac=val/total, a1=a+frac*2*Math.PI;
    ring += frac>=0.9999
      ? `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="none" stroke="${col}" stroke-width="${thick}"/>`
      : `<path d="${arcPath(cx,cy,rr,a,a1)}" fill="none" stroke="${col}" stroke-width="${thick}"/>`;
    a=a1;
  });
  const svg=`<svg viewBox="0 0 180 180" width="170" height="170">${ring}`
    +`<text x="${cx}" y="${cy-6}" text-anchor="middle" font-size="13" fill="var(--mut)">Goals</text>`
    +`<text x="${cx}" y="${cy+26}" text-anchor="middle" font-size="36" font-weight="800" fill="var(--ink)">${goals}</text></svg>`;
  const legend=
     `<div class="leg-row"><span class="leg-lbl">Total Shots</span><span class="leg-val">${total}</span></div>`
    +`<div class="leg-row"><span class="leg-dot" style="background:#f7b32f"></span><span class="leg-lbl">Goals</span><span class="leg-val">${goals}</span></div>`
    +`<div class="leg-row"><span class="leg-dot" style="background:#39d98a"></span><span class="leg-lbl">On Target</span><span class="leg-val">${pct(s.shotsOn,total)}<span class="leg-sub">${s.shotsOn}/${total}</span></span></div>`
    +`<div class="leg-row"><span class="leg-dot" style="background:#8b97a7"></span><span class="leg-lbl">Off Target / Blocked / Missed</span><span class="leg-val"><span class="leg-sub">${off}/${total}</span></span></div>`;
  return `<div class="chart-card donut-card">`
    +`<div class="donut-wrap"><div class="donut-svg">${svg}</div><div class="donut-legend">${legend}</div></div></div>`;
}
/* ---- Shooting: ONE vertical map of where every shot was taken, and where the ones on
   target crossed the line ----
   The pitch is stood on end and both halves are normalised to attack UP, so the 1st and
   2nd are one picture rather than two behind a toggle — a shot is a shot whichever end
   the team was kicking towards. Standing it up also gives the shots the full width
   instead of half of a landscape pitch, since nearly all of them fall in one third.
   The goal stands on the goal line at the top of that SAME svg, so a marker inside it
   sits directly above the spot on the pitch the shot was struck from. */
function shotMapHTML(team){
  const kinds={'goal':'#f7b32f','shot on target':'#39d98a','shot off target':'#8b97a7','blocked shot':'#8b97a7','miss shot':'#8b97a7'};
  const d=PITCH_DIMS.football, W=d.h, H=d.w;        // vertical: 680 wide x 1050 tall
  // a half that attacked left is turned around, so every shot points the same way
  const dir={1:attackDir(team,1),2:attackDir(team,2)};
  const shots=rows.filter(r=>r.team===team&&kinds[r.event]&&r.pXY).map(r=>{
    const flip=dir[eventHalf(r)]==='left';
    const px=flip?100-r.pXY.x:r.pXY.x, py=flip?100-r.pXY.y:r.pXY.y;
    return {r, vx:py/100*W, vy:(100-px)/100*H};     // attacking right -> attacking up
  });
  // the map is cropped to the attacking half, but never so far that it hides a shot:
  // a strike from deep pushes the bottom edge back to fit it
  const deepest=shots.reduce((m,s)=>Math.max(m,s.vy),0);
  const bottom=Math.min(H,Math.max(H*0.5,deepest+70));
  // sm-dot / data-p: the ranking beside the map hovers on these (see shotHover)
  const dots=shots.map(s=>{
    const cx=s.vx.toFixed(1), cy=s.vy.toFixed(1), col=kinds[s.r.event];
    return `<g class="sm-dot" data-p="${esc(String(s.r.playerFrom||'').trim())}">`
      +`<circle cx="${cx}" cy="${cy}" r="17" fill="${col}" fill-opacity="0.92" stroke="#000000" stroke-width="2.5"/>`
      +`<text x="${cx}" y="${(+cy+6).toFixed(1)}" text-anchor="middle" font-size="17" font-weight="800" fill="#06281a">${s.r.playerFrom||''}</text></g>`;
  }).join('');
  // …and the goal itself, standing on the goal line at the top — its marks are tagged
  // the same way, so isolating a player takes his shots and his goalmouth marks together
  const gm=goalMarks(rows,team,r=>kinds[r.event]
    ?{x:r.gXY.x,y:r.gXY.y,label:r.playerFrom||'',color:kinds[r.event],
      cls:'sm-dot',p:String(r.playerFrom||'').trim()}:null);
  const GW=W*0.54, GH=GW/3, GX=(W-GW)/2, PAD=22;
  // The goal stands clear of the pitch rather than on the goal line. The map is capped at
  // 520 css px across a 680-unit viewBox, so one unit is 520/680 px and a centimetre
  // (37.8 px at 96dpi) is a little over 49 of them — GOAL_GAP is therefore ~1cm at the
  // width the map is normally drawn at, and scales with it below that.
  const CM=49, GOAL_GAP=1*CM;
  const goal=goalMouthG({x:GX,y:-GH-GOAL_GAP,w:GW,h:GH},gm,
    {ink:'#06281a',ring:'#000000',net:'#3b4f5c',frame:'#e6edf3',r:15,noLine:true});
  const arrow=`<g opacity="0.45" stroke="#fff" fill="none" stroke-width="6">`
    +`<line x1="${W/2}" y1="${(bottom*0.94).toFixed(0)}" x2="${W/2}" y2="${(bottom*0.82).toFixed(0)}"/>`
    +`<polyline points="${W/2-15},${(bottom*0.85).toFixed(0)} ${W/2},${(bottom*0.82).toFixed(0)} ${W/2+15},${(bottom*0.85).toFixed(0)}"/></g>`
    +`<text x="${W/2}" y="${(bottom*0.99).toFixed(0)}" text-anchor="middle" font-size="22" fill="#fff" opacity="0.55">Attacking</text>`;
  const top=-(GH+GOAL_GAP+PAD);
  const pitch=`<svg viewBox="0 ${top.toFixed(1)} ${W} ${(bottom-top).toFixed(1)}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto;display:block">`
    +`<rect x="0" y="0" width="${W}" height="${H}" fill="rgba(26,62,32,0.72)"/>`
    +`<g transform="translate(0 ${H}) rotate(-90)"><g fill="none" stroke="${PITCH_LINE}" stroke-width="3">${pitchFootball(H,W,false)}</g></g>`
    +goal+arrow+dots+`</svg>`;
  const note=gm.length?'':`<div class="sm-sub">No shot has been placed in the goal yet — tag a shot on target or a goal and drop the ball where it crossed the line.</div>`;
  const legend=`<span class="sm-leg"><span class="leg-dot" style="background:#f7b32f"></span>Goal</span>`
    +`<span class="sm-leg"><span class="leg-dot" style="background:#39d98a"></span>On target</span>`
    +`<span class="sm-leg"><span class="leg-dot" style="background:#8b97a7"></span>Off / Blocked / Missed</span>`;
  return `<div class="chart-card map-card">`
    +`<div class="shotmap-pitch shotmap-v">${pitch}</div>${note}<div class="shotmap-legend">${legend}</div></div>`;
}
/* hover a row in the shooting ranking to isolate that player — his shots on the pitch
   AND his marks in the goal above it, since both carry the same data-p. Nothing is
   re-rendered: the whole team is drawn already, so this only flips display. */
function shotHover(p){
  document.querySelectorAll('.sm-dot').forEach(g=>{g.style.display=(!p||g.dataset.p===p)?'':'none';});
  document.querySelectorAll('.sr-rank tbody tr').forEach(tr=>{
    tr.classList.toggle('sel',!!p&&tr.dataset.p===p);
    tr.classList.toggle('dim',!!p&&tr.dataset.p!==p);
  });
}
/* ---- Shooting: who took them, beside the map ----
   The same shots the map plots (the located ones), counted per player, most first.
   Ties share a rank and the next one skips it, as in the defensive ranking. */
function shotRankHTML(team){
  const shots=rows.filter(r=>r.team===team&&SHOT_KINDS.has(evKey(r.event))&&r.pXY);
  const cnt={}; shots.forEach(r=>{const no=String(r.playerFrom||'').trim(); if(no)cnt[no]=(cnt[no]||0)+1;});
  const order=Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a]
    ||((isNaN(+a)||isNaN(+b))?String(a).localeCompare(String(b)):+a-+b));
  const names=squadNames(lineups,team);
  let prevC=null;
  const rankRows=order.map((no,i)=>{
    const c=cnt[no], rk=c===prevC?'':String(i+1); prevC=c;
    return `<tr data-p="${esc(no)}" onmouseenter="shotHover('${jsArg(no)}')" onmouseleave="shotHover('')">`
      +`<td class="sr-r">${rk}</td>`
      +`<td><b class="sr-no">${esc(no)}.</b> ${esc(playerLabel(names,no))}</td>`
      +`<td class="sr-c">${c}</td></tr>`;
  }).join('');
  return `<div class="chart-card sr-card"><div class="sr-title">Shots</div>`
    +`<div class="sr-wrap"><table class="sr-rank">`
    +`<thead><tr><th class="sr-r">Rank</th><th>Name</th><th class="sr-c">Count</th></tr></thead><tbody>`
    +(rankRows||`<tr><td colspan="3" class="sr-empty">No shot has been placed on the pitch yet.</td></tr>`)
    +`</tbody></table></div></div>`;
}
/* ---- Distribution: ONE upright map for passes, crosses, take-ons and step-ins ----
   The dropdown picks which, the All / 1st / 2nd buttons pick the period, and the
   ranking beside it says who did most. Both halves are normalised so the team always
   attacks UP, so "All" is one picture rather than two behind a toggle.

   Passes OPEN on an 18-cell grid — the share of the team's passes started in each
   cell — because a whole match of arrows is a thicket you cannot read. The other
   three open on their marks. Hovering a player in the ranking swaps to HIS marks
   either way, and the bands down the left and along the bottom follow him.

   Same won/lost shape as DEF_CATS: two parts means parts[0] is the winning event,
   which is what the ranking's Succ. and % columns count. */
const DIST_CATS={
  passes:{label:'Passes',grid:true,arrow:true,
    parts:[['pass success','Succeeded','#39d98a'],['pass fail','Failed','#f7506b']]},
  crosses:{label:'Crosses',arrow:true,
    parts:[['cross success','Succeeded','#39d98a'],['cross fail','Failed','#f7506b']]},
  takeons:{label:'Take-ons',
    parts:[['take-on succes','Succeeded','#39d98a'],['take-on fail','Failed','#f7506b']]},
  stepins:{label:'Step-ins',
    parts:[['step in','Step-in','#2f81f7']]}
};
let _distBands={};
/* hover a ranking row to isolate that player, as the touch heatmap does. Nothing is
   re-rendered: every mark is drawn already and every player's bands were worked out
   with them, so this only flips attributes. Isolating always shows marks, even in the
   grid mode passes open on; letting go puts the card back to whichever it opened in. */
function distHover(p){
  const card=document.querySelector('.dl-card'); if(!card)return;
  card.dataset.mode=p?'dots':(card.dataset.mode0||'dots');
  const b=_distBands[p]||_distBands['']||[];
  document.querySelectorAll('.dl-band').forEach((t,i)=>{if(b[i]!=null)t.textContent=b[i];});
  document.querySelectorAll('.dl-dot').forEach(g=>{g.style.display=(!p||g.dataset.p===p)?'':'none';});
  document.querySelectorAll('.dl-rank tbody tr').forEach(tr=>{
    tr.classList.toggle('sel',!!p&&tr.dataset.p===p);
    tr.classList.toggle('dim',!!p&&tr.dataset.p!==p);
  });
}
function distMapHTML(team){
  const cat=DIST_CATS[distCat]||DIST_CATS.passes;
  const opts=Object.entries(DIST_CATS).map(([k,c])=>`<option value="${k}"${k===distCat?' selected':''}>${c.label}</option>`).join('');
  const head=`<div class="chart-head"><div></div>`
    +`<div class="head-ctrls"><select class="def-sel" onchange="setDistCat(this.value)">${opts}</select>`
    +`<div class="half-toggle"><button class="${distHalf===0?'on':''}" onclick="setDistHalf(0)">All</button>`
    +`<button class="${distHalf===1?'on':''}" onclick="setDistHalf(1)">1st</button>`
    +`<button class="${distHalf===2?'on':''}" onclick="setDistHalf(2)">2nd</button></div></div></div>`;
  // the pitch on end, with a margin down the left for the length bands and one below
  // for the width bands — the same frame the defensive map uses
  const d=PITCH_DIMS.football, PW=d.h, PH=d.w, mL=140, mB=130, W=mL+PW, H=PH+mB;
  const teamColor=team==='home'?'var(--home)':'var(--away)';
  // keyed through evKey: event names come from a user-editable list (see shared.js)
  const col={}; cat.parts.forEach(([ev,,c])=>col[evKey(ev)]=c);
  const succKey=cat.parts.length===2?evKey(cat.parts[0][0]):null;
  const dir={1:attackDir(team,1),2:attackDir(team,2)};
  const N=(xy,h)=>{const flip=dir[h]==='left';
    const px=flip?100-xy.x:xy.x, py=flip?100-xy.y:xy.y;
    return {x:py/100*PW, y:(100-px)/100*PH};};   // attacking right -> attacking up
  const evs=rows.filter(r=>r.team===team&&col[evKey(r.event)]&&r.pXY&&(!distHalf||eventHalf(r)===distHalf))
    .map(r=>{const h=eventHalf(r);
      return {a:N(r.pXY,h), b:(cat.arrow&&r.rXY&&r.rXY.x!=null)?N(r.rXY,h):null,
              c:col[evKey(r.event)], k:evKey(r.event), no:String(r.playerFrom||'').trim()};});
  // the ranking: ordered on TOTAL, ties sharing a rank and the next one skipping it
  const cnt={}, won={};
  evs.forEach(e=>{if(!e.no)return;
    cnt[e.no]=(cnt[e.no]||0)+1; if(e.k===succKey)won[e.no]=(won[e.no]||0)+1;});
  const order=Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a]||(won[b]||0)-(won[a]||0)
    ||((isNaN(+a)||isNaN(+b))?String(a).localeCompare(String(b)):+a-+b));
  // every player's bands are worked out here so hovering costs nothing later
  const bandsOf=list=>{
    const v=[0,0,0], h=[0,0,0];
    list.forEach(e=>{v[Math.min(2,Math.floor(e.a.y/PH*3))]++;h[Math.min(2,Math.floor(e.a.x/PW*3))]++;});
    const p=n=>list.length?Math.round(n/list.length*100)+'%':'0%';
    return [p(v[0]),p(v[1]),p(v[2]),p(h[0]),p(h[1]),p(h[2])];
  };
  _distBands={'':bandsOf(evs)};
  order.forEach(no=>{_distBands[no]=bandsOf(evs.filter(e=>e.no===no));});
  const band=_distBands[''];
  // arrowheads, one per colour — only for the categories that actually draw arrows,
  // so a dots-only map carries no unused marker of its own colour
  const mkId=c=>'dlm'+c.replace(/[^0-9a-z]/gi,'');
  const defs=cat.arrow?'<defs>'+[...new Set(cat.parts.map(p=>p[2]))].map(c=>
    `<marker id="${mkId(c)}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4"`
    +` orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${c}"/></marker>`).join('')+'</defs>':'';
  const marks=evs.map(e=>{
    const g=`<g class="dl-dot" data-p="${esc(e.no)}">`;
    if(e.b)return g+`<line x1="${e.a.x.toFixed(1)}" y1="${e.a.y.toFixed(1)}" x2="${e.b.x.toFixed(1)}" y2="${e.b.y.toFixed(1)}"`
      +` stroke="${e.c}" stroke-width="3" stroke-opacity="0.85" marker-end="url(#${mkId(e.c)})"/>`
      +`<circle cx="${e.a.x.toFixed(1)}" cy="${e.a.y.toFixed(1)}" r="7" fill="${e.c}"/></g>`;
    return g+`<circle cx="${e.a.x.toFixed(1)}" cy="${e.a.y.toFixed(1)}" r="12" fill="${e.c}" fill-opacity="0.92"`
      +` stroke="#000000" stroke-width="1.5"/></g>`;
  }).join('');
  // the 18 cells: 3 across the width, 6 along the length, each the share of the team's
  // events that STARTED in it. Shown only while nothing is hovered (see distHover).
  const GC=3, GR=6, tot=evs.length;
  const cell=[]; for(let i=0;i<GC*GR;i++)cell.push(0);
  evs.forEach(e=>{const c0=Math.min(GC-1,Math.floor(e.a.x/PW*GC)), r0=Math.min(GR-1,Math.floor(e.a.y/PH*GR));
    cell[r0*GC+c0]++;});
  let grid='';
  for(let i=1;i<GC;i++)grid+=`<line x1="${i*PW/GC}" y1="0" x2="${i*PW/GC}" y2="${PH}" stroke="rgba(255,255,255,0.16)" stroke-width="2"/>`;
  for(let i=1;i<GR;i++)grid+=`<line x1="0" y1="${i*PH/GR}" x2="${PW}" y2="${i*PH/GR}" stroke="rgba(255,255,255,0.16)" stroke-width="2"/>`;
  for(let r0=0;r0<GR;r0++)for(let c0=0;c0<GC;c0++){
    const n=cell[r0*GC+c0], x=((c0+0.5)*PW/GC).toFixed(0), y=(r0+0.5)*PH/GR;
    grid+=`<text x="${x}" y="${(y-4).toFixed(0)}" text-anchor="middle" font-size="30" font-weight="700" fill="${teamColor}">${tot?Math.round(n/tot*1000)/10:0}%</text>`
      +`<text x="${x}" y="${(y+28).toFixed(0)}" text-anchor="middle" font-size="24" fill="var(--mut)">${n} / ${tot}</text>`;
  }
  const ax=PW/2, ay=PH/2;
  const arrow=`<g opacity="0.5" stroke="#fff" fill="none" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">`
    +`<line x1="${ax}" y1="${ay+54}" x2="${ax}" y2="${ay-54}"/>`
    +`<polyline points="${ax-26},${ay-28} ${ax},${ay-54} ${ax+26},${ay-28}"/></g>`;
  const pitchG=`<g transform="translate(${mL} 0)">`
    +`<rect width="${PW}" height="${PH}" fill="rgba(26,62,32,0.72)"/>`
    +`<g transform="translate(0 ${PH}) rotate(-90)"><g fill="none" stroke="${PITCH_LINE}" stroke-width="3">${pitchFootball(PH,PW,false)}</g></g>`
    +arrow+`<g class="dl-grid">${grid}</g>`+marks+`</g>`;
  let over='';
  for(let i=0;i<3;i++)
    over+=`<text class="dl-band" x="${(mL/2).toFixed(0)}" y="${((i+0.5)*PH/3+12).toFixed(0)}" text-anchor="middle" font-size="34" font-weight="700" fill="${teamColor}">${band[i]}</text>`;
  [1,2].forEach(i=>over+=`<line x1="12" y1="${i*PH/3}" x2="${mL}" y2="${i*PH/3}" stroke="var(--line)" stroke-width="2"/>`);
  over+=`<text x="${(mL/2).toFixed(0)}" y="${(PH+mB/2+9).toFixed(0)}" text-anchor="middle" font-size="26" fill="var(--mut)">Total</text>`;
  for(let i=0;i<3;i++)
    over+=`<text class="dl-band" x="${(mL+(i+0.5)*PW/3).toFixed(0)}" y="${(PH+mB/2+12).toFixed(0)}" text-anchor="middle" font-size="34" font-weight="700" fill="${teamColor}">${band[3+i]}</text>`;
  [1,2].forEach(i=>over+=`<line x1="${mL+i*PW/3}" y1="${PH+14}" x2="${mL+i*PW/3}" y2="${H-14}" stroke="var(--line)" stroke-width="2"/>`);
  over+=`<line x1="${mL}" y1="12" x2="${mL}" y2="${H-14}" stroke="var(--line)" stroke-width="2"/>`
    +`<line x1="12" y1="${PH}" x2="${W-12}" y2="${PH}" stroke="var(--line)" stroke-width="2"/>`;
  const names=squadNames(lineups,team);
  let prevK=null;
  const rankRows=order.map((no,i)=>{
    const c=cnt[no], s=won[no]||0;
    const k=succKey?c+'/'+s:String(c);          // tied when the figures they are ranked on match
    const rk=k===prevK?'':String(i+1); prevK=k;
    return `<tr data-p="${esc(no)}" onmouseenter="distHover('${jsArg(no)}')" onmouseleave="distHover('')">`
      +`<td class="dl-r">${rk}</td>`
      +`<td><b class="dl-no">${esc(no)}.</b> ${esc(playerLabel(names,no))}</td>`
      +(succKey?`<td class="dl-c">${s}</td>`:'')
      +`<td class="dl-c">${c}</td>`
      +(succKey?`<td class="dl-c">${Math.round(s/c*100)}%</td>`:'')
      +`</tr>`;
  }).join('');
  const cols=succKey?5:3;
  const legend=cat.parts.map(([,l,c])=>`<span class="sm-leg"><span class="leg-dot" style="background:${c}"></span>${l}</span>`).join('');
  const mode=cat.grid?'grid':'dots';
  return `<div class="chart-card map-card dl-card" data-mode="${mode}" data-mode0="${mode}">${head}<div class="dl-flex">`
    +`<div class="dl-map"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto;display:block">`
    +`${defs}${pitchG}${over}</svg><div class="shotmap-legend">${legend}</div></div>`
    +`<div class="dl-side"><div class="dl-title">${esc(cat.label)}</div>`
    +`<div class="dl-wrap"><table class="dl-rank">`
    +`<thead><tr><th class="dl-r">Rank</th><th>Name</th>`
    +(succKey?`<th class="dl-c">Succ.</th>`:'')+`<th class="dl-c">Total</th>`
    +(succKey?`<th class="dl-c">%</th>`:'')+`</tr></thead><tbody>`
    +(rankRows||`<tr><td colspan="${cols}" class="dl-empty">No ${esc(cat.label.toLowerCase())} tagged for this period.</td></tr>`)
    +`</tbody></table></div></div></div></div>`;
}
function setDistCat(v){distCat=v;renderStats();}
function setDistHalf(h){distHalf=h;renderStats();}
const FOUL_EVENTS=new Set(['foul','foul throw','handball foul']);
/* Other tab: dropdown switches between the foul map, the foul-won map and the offside map */
const OTH_CATS={fouls:'Fouls',foulsWon:'Fouls Won',offsides:'Offsides'};
const othHead=()=>`<div class="chart-head"><div></div>`
  +`<select class="def-sel" onchange="setOthCat(this.value)">`
  +Object.entries(OTH_CATS).map(([k,l])=>`<option value="${k}"${k===othCat?' selected':''}>${l}</option>`).join('')
  +`</select></div>`;
function setOthCat(v){othCat=v;renderStats();}
function foulMapHTML(team){
  const d=PITCH_DIMS.football, PW=d.w, PH=d.h, mT=76, mR2=150, W=PW+mR2, H=PH+mT;
  const teamColor=team==='home'?'var(--home)':'var(--away)', fill=teamColor;
  // no data -> keep the pitch and 0% bands, just draw no dots
  const evs=rows.filter(r=>r.team===team&&FOUL_EVENTS.has(r.event)&&r.pXY);
  const cards=rows.filter(r=>r.team===team&&(r.event==='yellow card'||r.event==='red card')&&r.t!=null);
  const cardFor=f=>{let best=null,bd=90;
    cards.forEach(c=>{
      if(String(c.playerFrom||'').trim()!==String(f.playerFrom||'').trim())return;
      const dd=Math.abs(c.t-f.t); if(dd<=bd){bd=dd;best=c.event;}
    });
    return best;};
  const dir={1:attackDir(team,1),2:attackDir(team,2)};
  const fl=evs.map(r=>{
    const h=eventHalf(r), flip=dir[h]==='left';
    return {x:(flip?100-r.pXY.x:r.pXY.x)/100*PW, y:(flip?100-r.pXY.y:r.pXY.y)/100*PH,
            half:h, no:(r.playerFrom||'').toString().trim(), card:cardFor(r)};
  });
  const oCnt=[0,0,0]; fl.forEach(f=>oCnt[Math.min(2,Math.floor(f.x/PW*3))]++);
  const tCnt=[0,0,0]; fl.forEach(f=>tCnt[Math.min(2,Math.floor(f.y/PH*3))]++);
  const pctL=n=>fl.length?(Math.round(n/fl.length*1000)/10)+'%':'0%';
  let over='';
  for(let i=0;i<3;i++)
    over+=`<text x="${((i+0.5)*PW/3).toFixed(0)}" y="40" text-anchor="middle" font-size="30" font-weight="700" fill="${teamColor}">${pctL(oCnt[i])}</text>`;
  [1,2].forEach(i=>over+=`<line x1="${i*PW/3}" y1="10" x2="${i*PW/3}" y2="${mT-16}" stroke="var(--line)" stroke-width="2"/>`);
  for(let i=0;i<3;i++)
    over+=`<text x="${PW+mR2/2}" y="${(mT+(i+0.5)*PH/3+10).toFixed(0)}" text-anchor="middle" font-size="30" font-weight="700" fill="${teamColor}">${pctL(tCnt[i])}</text>`;
  [1,2].forEach(i=>over+=`<line x1="${PW+18}" y1="${mT+i*PH/3}" x2="${W-18}" y2="${mT+i*PH/3}" stroke="var(--line)" stroke-width="2"/>`);
  const defs='<defs><pattern id="dngPat" width="26" height="26" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">'
    +'<rect width="26" height="26" fill="rgba(247,80,107,0.10)"/><rect width="13" height="26" fill="rgba(247,80,107,0.26)"/></pattern></defs>';
  const dots=fl.map(f=>{
    const ring=f.card?`stroke="${f.card==='red card'?'#e5484d':'#ffd23f'}" stroke-width="5"`:'stroke="#000000" stroke-width="1.5"';
    const shape=f.half===1
      ?`<circle cx="${f.x.toFixed(1)}" cy="${f.y.toFixed(1)}" r="12" fill="${fill}" fill-opacity="0.92" ${ring}/>`
      :`<rect x="${(f.x-11).toFixed(1)}" y="${(f.y-11).toFixed(1)}" width="22" height="22" rx="3" fill="${fill}" fill-opacity="0.92" ${ring}/>`;
    return `<g>${shape}<text x="${f.x.toFixed(1)}" y="${(f.y+4.5).toFixed(1)}" text-anchor="middle" font-size="13" font-weight="800" fill="var(--team-ink)">${f.no}</text></g>`;
  }).join('');
  const pitch=`<g transform="translate(0 ${mT})"><rect width="${PW}" height="${PH}" fill="rgba(26,62,32,0.72)"/>`
    +`<rect width="${PW/3}" height="${PH}" fill="url(#dngPat)"/>`
    +`<g fill="none" stroke="${PITCH_LINE}" stroke-width="3">${pitchFootball(PW,PH,false)}</g>${dirArrowSVG('right')}${dots}</g>`;
  const legend=`<span class="sm-leg"><span class="leg-dot" style="background:${fill}"></span>1st half</span>`
    +`<span class="sm-leg"><span class="leg-dot" style="background:${fill};border-radius:3px"></span>2nd half</span>`
    +`<span class="sm-leg"><span class="leg-dot" style="background:repeating-linear-gradient(45deg,rgba(247,80,107,0.45) 0 4px,rgba(247,80,107,0.12) 4px 8px)"></span>Dangerous zone</span>`
    +`<span class="sm-leg"><span class="leg-dot" style="background:${fill};box-shadow:0 0 0 3px #ffd23f"></span>Led to yellow card</span>`
    +`<span class="sm-leg"><span class="leg-dot" style="background:${fill};box-shadow:0 0 0 3px #e5484d"></span>Led to red card</span>`;
  return `<div class="chart-card oth-card">${othHead()}`
    +`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="width:100%;display:block;max-width:1000px;margin:0 auto">${defs}${over}${pitch}</svg>`
    +`<div class="shotmap-legend">${legend}</div></div>`;
}
/* ---- Other: plain located-event map (offside, foul won…) — every located event of
   that type, both halves normalised to attack RIGHT; circle = 1st half, square = 2nd
   half; ratio bands like the foul map, but no cards / dangerous-zone overlay. */
function plainEventMapHTML(team,eventName){
  const d=PITCH_DIMS.football, PW=d.w, PH=d.h, mT=76, mR2=150, W=PW+mR2, H=PH+mT;
  const teamColor=team==='home'?'var(--home)':'var(--away)', fill=teamColor;
  // no data -> keep the pitch and 0% bands, just draw no dots
  const evs=rows.filter(r=>r.team===team&&r.event===eventName&&r.pXY);
  const dir={1:attackDir(team,1),2:attackDir(team,2)};
  const fl=evs.map(r=>{
    const h=eventHalf(r), flip=dir[h]==='left';
    return {x:(flip?100-r.pXY.x:r.pXY.x)/100*PW, y:(flip?100-r.pXY.y:r.pXY.y)/100*PH,
            half:h, no:(r.playerFrom||'').toString().trim()};
  });
  const oCnt=[0,0,0]; fl.forEach(f=>oCnt[Math.min(2,Math.floor(f.x/PW*3))]++);
  const tCnt=[0,0,0]; fl.forEach(f=>tCnt[Math.min(2,Math.floor(f.y/PH*3))]++);
  const pctL=n=>fl.length?(Math.round(n/fl.length*1000)/10)+'%':'0%';
  let over='';
  for(let i=0;i<3;i++)
    over+=`<text x="${((i+0.5)*PW/3).toFixed(0)}" y="40" text-anchor="middle" font-size="30" font-weight="700" fill="${teamColor}">${pctL(oCnt[i])}</text>`;
  [1,2].forEach(i=>over+=`<line x1="${i*PW/3}" y1="10" x2="${i*PW/3}" y2="${mT-16}" stroke="var(--line)" stroke-width="2"/>`);
  for(let i=0;i<3;i++)
    over+=`<text x="${PW+mR2/2}" y="${(mT+(i+0.5)*PH/3+10).toFixed(0)}" text-anchor="middle" font-size="30" font-weight="700" fill="${teamColor}">${pctL(tCnt[i])}</text>`;
  [1,2].forEach(i=>over+=`<line x1="${PW+18}" y1="${mT+i*PH/3}" x2="${W-18}" y2="${mT+i*PH/3}" stroke="var(--line)" stroke-width="2"/>`);
  const dots=fl.map(f=>{
    const shape=f.half===1
      ?`<circle cx="${f.x.toFixed(1)}" cy="${f.y.toFixed(1)}" r="12" fill="${fill}" fill-opacity="0.92" stroke="#000000" stroke-width="1.5"/>`
      :`<rect x="${(f.x-11).toFixed(1)}" y="${(f.y-11).toFixed(1)}" width="22" height="22" rx="3" fill="${fill}" fill-opacity="0.92" stroke="#000000" stroke-width="1.5"/>`;
    return `<g>${shape}<text x="${f.x.toFixed(1)}" y="${(f.y+4.5).toFixed(1)}" text-anchor="middle" font-size="13" font-weight="800" fill="var(--team-ink)">${f.no}</text></g>`;
  }).join('');
  const pitch=`<g transform="translate(0 ${mT})"><rect width="${PW}" height="${PH}" fill="rgba(26,62,32,0.72)"/>`
    +`<g fill="none" stroke="${PITCH_LINE}" stroke-width="3">${pitchFootball(PW,PH,false)}</g>${dirArrowSVG('right')}${dots}</g>`;
  const legend=`<span class="sm-leg"><span class="leg-dot" style="background:${fill}"></span>1st half</span>`
    +`<span class="sm-leg"><span class="leg-dot" style="background:${fill};border-radius:3px"></span>2nd half</span>`;
  return `<div class="chart-card oth-card">${othHead()}`
    +`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="width:100%;display:block;max-width:1000px;margin:0 auto">${over}${pitch}</svg>`
    +`<div class="shotmap-legend">${legend}</div></div>`;
}
/* ---- Distribution: pass-type breakdown table (below the heatmap).
   Distance uses real pitch metres (105x68): short <15m, medium 15-30m, long >30m.
   Direction is the pass angle relative to the attack (halves normalised to
   attack RIGHT): forward within ±45°, backward beyond ±135°, else sideways.
   Area = origin third of the pitch length. Passes missing a tagged origin or
   target can't be classified and are skipped in the affected section. */
/* The 15-minute windows each half is cut into, the last slice of a half absorbing any
   stoppage. Nothing on the dashboard reads these any more — the pass-network map they
   were written for is gone — but the PDF report still builds a page per window, so this
   stays here with passTypeData() as one of the helpers Stats/report.js shares. */
function pdWindows(){
  const L=+dur.halfLen||45, w=[];
  for(let h=1;h<=2;h++)for(let s=0;s<L;s+=15){
    const e=Math.min(s+15,L);
    w.push({half:h,s,e,last:e===L,label:`${s+(h-1)*L}' - ${e+(h-1)*L}'${e===L?'+':''}`});
  }
  return w;
}
function passTypeData(team){   // shared with the PDF report (Stats/report.js)
  const evs=rows.filter(r=>r.team===team&&(r.event==='pass success'||r.event==='pass fail'));
  const tot=evs.length, suc=evs.filter(r=>r.event==='pass success').length;
  const dir={1:attackDir(team,1),2:attackDir(team,2)};
  const XM=105, YM=68;
  const mk=labels=>{const o={};labels.forEach(l=>o[l]=[0,0]);return o;};   // label -> [succeeded, count]
  const catD=mk(['Long Passes','Medium Range Passes','Short Passes']);
  const catG=mk(['Passes Forward','Passes Sideways','Passes Backward']);
  const catA=mk(['Passes In Final Third','Passes In Middle Third','Passes In Defensive Third']);
  const add=(cat,k,ok)=>{cat[k][1]++;if(ok)cat[k][0]++;};
  evs.forEach(r=>{
    const ok=r.event==='pass success';
    if(!r.pXY)return;
    const flip=dir[eventHalf(r)]==='left';
    const ax=flip?100-r.pXY.x:r.pXY.x;
    add(catA, ax>=200/3?'Passes In Final Third':ax>=100/3?'Passes In Middle Third':'Passes In Defensive Third', ok);
    if(!r.rXY)return;
    const ay=flip?100-r.pXY.y:r.pXY.y, bx=flip?100-r.rXY.x:r.rXY.x, by=flip?100-r.rXY.y:r.rXY.y;
    const dxM=(bx-ax)/100*XM, dyM=(by-ay)/100*YM, dist=Math.hypot(dxM,dyM);
    add(catD, dist>30?'Long Passes':dist>=15?'Medium Range Passes':'Short Passes', ok);
    const ang=Math.abs(Math.atan2(dyM,dxM))*180/Math.PI;   // 0° = straight forward, 180° = straight back
    add(catG, ang<=45?'Passes Forward':ang>=135?'Passes Backward':'Passes Sideways', ok);
  });
  return {tot,suc,catD,catG,catA};
}
/* ---- Distribution: touch heatmap (every event that has a pitch location).
   Both halves are normalised so the team always attacks RIGHT — events from a
   half where the team attacked left are rotated 180° (x AND y flip) — so the
   'All' view can safely mix the two halves on one pitch. */
function touchPoints(team){
  const dir={1:attackDir(team,1),2:attackDir(team,2)}, out=[];
  rows.forEach(r=>{
    if(r.team!==team)return;
    const h=eventHalf(r), flip=dir[h]==='left';
    const add=(xy,pl)=>{ if(!xy||xy.x==null)return;
      out.push({x:flip?100-xy.x:xy.x, y:flip?100-xy.y:xy.y, half:h, p:(pl==null?'':String(pl).trim())});
    };
    add(r.pXY,r.playerFrom); add(r.rXY,r.playerTo);
  });
  return out;
}
/* Who was on the pitch during ONE half (half 0 = the whole match, i.e. everyone
   who played). The half filter used to list the whole matchday squad either way,
   so a player who only came on after the break sat in the FIRST-half list on 0
   touches as if he had played it.

   A half is bounded by its KICK-OFF and its whistle on the video clock, not by
   eventHalf(): that splits the video at the second-half kick-off alone, which
   leaves the half-time BREAK inside the first half. A substitution made at the
   interval — the most ordinary kind there is — therefore read as a first-half
   change, listing the player who came on among the first-half players and the
   player who went off among the second-half ones, when the truth is the exact
   opposite. Anchored on kick-off, a break change is simply already in force when
   the half starts, so both ends of it land on the right side.

   The XI that walked out for the half is the last formation in force at its
   kick-off (else the starting XI); everyone who came on while it was being played
   shows up in a snapshot inside the half; everyone who went off during it was in
   the XI it started with. eventHalf() is deliberately left alone — the maps, the
   timeline and the report all classify EVENTS with it, and an event can only
   happen while the ball is in play. */
/* the position Player lists put a player in — the zone his dot sits in on the formation
   board, saved with the starting XI. A named substitute has no zone of his own, so he
   reads "subs"; anyone the squad does not place at all reads "–". */
function squadPos(team,no){
  const lu=(lineups&&lineups[team])||null; if(!lu)return '–';
  const k=String(no==null?'':no).trim(); if(!k)return '–';
  const x=(lu.xi||[]).find(p=>p&&String(p.no).trim()===k);
  if(x)return x.pos||'–';
  return (lu.subs||[]).some(s=>String(s==null?'':s).trim()===k)?'subs':'–';
}
/* Reading order for a team sheet: the goalkeeper, then out through the lines to the
   forwards, left to right within each. It is FORMATION_GRID (shared.js) walked from the
   GK's column outward and from the left flank across, so the two stay in step — every
   label that grid can produce is here. A substitute has no place in it and sorts after
   the eleven; anyone the squad does not place at all sorts after him. */
const POS_ORDER=['GK','LB','CB','RB','LWB','CDM','RWB','LM','CM','RM','LW','CAM','RW','LF','CF','RF'];
const POS_RANK={}; POS_ORDER.forEach((p,i)=>{POS_RANK[p]=i;});
const posRank=(team,no)=>{const p=squadPos(team,no);
  return POS_RANK[p]!=null?POS_RANK[p]:(p==='subs'?100:200);};
function squadInHalf(team,half){
  if(!half)return squadOnPitch(lineups,team);
  const lu=(lineups&&lineups[team])||null; if(!lu)return [];
  const out=[], seen=new Set();
  const add=n=>{const s=String(n==null?'':n).trim();
    if(!s||seen.has(s))return; seen.add(s); out.push(s);};
  // With no half-time whistle recorded there is no break to place a change in, and
  // with no second-half kick-off the video is one long half — "2nd half" then just
  // carries the final XI, as it did before.
  const h1s=+dur.h1Start||0, h1e=+dur.h1End||0, h2s=+dur.h2Start||0;
  const ko  = half===1 ? h1s : (h2s>0?h2s:Infinity);
  const end = half===1 ? (h1e>h1s?h1e:(h2s>0?h2s:Infinity)) : Infinity;
  const hist=((lineups&&lineups.history)||[]).filter(h=>h&&h.team===team&&h.xi)
    .slice().sort((a,b)=>(+a.t||0)-(+b.t||0));
  const before=hist.filter(h=>(+h.t||0)<=ko);
  ((before.length?before[before.length-1].xi:lu.xi)||[]).forEach(p=>add(p&&p.no));
  hist.filter(h=>{const t=+h.t||0;return t>ko&&t<=end;})
    .forEach(h=>(h.xi||[]).forEach(p=>add(p&&p.no)));
  // A swap whose snapshot was edited away still counts (same fallback as
  // squadOnPitch) — but only where no snapshot covers it, or a player the lines
  // above correctly left out would be handed straight back. Matched to a snapshot
  // on the same ±3s the events table uses.
  (lu.subHistory||[]).forEach(s=>{
    if(!s)return; const t=+s.t||0;
    if(hist.some(h=>Math.abs((+h.t||0)-t)<=3))return;
    if(t>ko)add(s.out);        // he was on the pitch until the swap
    if(t<=end)add(s.in);       // and the man who replaced him, from it on
  });
  return out;
}
/* Per-player heatmap (like the reference video): the pitch shows the whole
   team's heat plus a marker per player at his average position; hovering a
   marker or a row in the player list isolates that player's heatmap. */
let _heatBy={}, _heatOrder=[];   // points grouped by player, built in heatMapHTML
function heatMapHTML(team){
  const fill=team==='home'?'var(--home)':'var(--away)';
  const head=`<div class="chart-head"><div></div>`
    +`<div class="half-toggle"><button class="${heatHalf===0?'on':''}" onclick="setHeatHalf(0)">All</button>`
    +`<button class="${heatHalf===1?'on':''}" onclick="setHeatHalf(1)">1st</button>`
    +`<button class="${heatHalf===2?'on':''}" onclick="setHeatHalf(2)">2nd</button></div></div>`;
  // no data -> keep the pitch, just no heat/markers
  const all=touchPoints(team);                                        // both halves
  const pts=all.filter(t=>!heatHalf||t.half===heatHalf);              // the one on screen
  _heatBy={}; pts.forEach(t=>{const k=t.p; (_heatBy[k]=_heatBy[k]||[]).push(t);});
  /* The SAME names are listed whichever half is on screen: the whole matchday squad
     Player lists named, plus anyone with a touch in either half. Nothing here reads
     heatHalf, so the list cannot change under you — a player with no located touch in
     the half being shown simply has no marker and reads faded, rather than vanishing.
     A touch always counts on its own: it proves he was on, lineups or not. */
  const lu=(lineups&&lineups[team])||null;
  squadInHalf(team,0)
    .concat(((lu&&lu.xi)||[]).map(p=>p&&p.no), (lu&&lu.subs)||[], all.map(t=>t.p))
    .forEach(no=>{const k=String(no==null?'':no).trim(); if(k&&!_heatBy[k])_heatBy[k]=[];});
  // read down the team sheet, not up the shirt numbers: goalkeeper first, then out
  // through the lines to the forwards, left to right within each. Substitutes come
  // after the eleven, and anyone the squad does not place at all after them.
  _heatOrder=Object.keys(_heatBy).filter(p=>p!=='')
    .sort((a,b)=>{const ra=posRank(team,a), rb=posRank(team,b); if(ra!==rb)return ra-rb;
      const na=+a,nb=+b;return(!isNaN(na)&&!isNaN(nb))?na-nb:String(a).localeCompare(String(b));});
  const markers=_heatOrder.filter(p=>_heatBy[p].length).map(p=>{
    const a=_heatBy[p];
    const mx=a.reduce((s,t)=>s+t.x,0)/a.length, my=a.reduce((s,t)=>s+t.y,0)/a.length;
    return `<div class="hm-mark" data-p="${p}" style="left:${mx.toFixed(1)}%;top:${my.toFixed(1)}%;background:${fill}"`
      +` onmouseenter="heatHover('${p}')" onmouseleave="heatHover('')">${p}</div>`;
  }).join('');
  const names=squadNames(lineups,team);
  // shirt number, name and the position Player lists put him in. No touch tally: a player
  // with none located in this half is the one that reads faded (hm-off)
  const list=_heatOrder.map(p=>{
    const n=_heatBy[p].length;
    return `<div class="hm-row${n?'':' hm-off'}" data-p="${p}" onmouseenter="heatHover('${p}')" onmouseleave="heatHover('')">`
      +`<span class="hm-no" style="background:${fill}">${esc(p)}</span>`
      +`<span class="hm-name" title="${esc(playerLabel(names,p))}">${esc(playerLabel(names,p))}</span>`
      +`<span class="hm-pos">${esc(squadPos(team,p))}</span></div>`;
  }).join('');
  const d=PITCH_DIMS.football;
  const pitch=pitchSVG('football').replace('</svg>', dirArrowSVG('right')+'</svg>');
  const legend=`<span class="sm-leg">Low</span>`
    +`<span style="display:inline-block;width:130px;height:10px;border-radius:5px;margin:0 4px;`
    +`background:linear-gradient(90deg,rgba(0,60,255,0.55),#00c8ff,#39ff54,#ffe12b,#ff2b1e)"></span>`
    +`<span class="sm-leg">High</span>`;
  return `<div class="chart-card map-card">${head}<div class="hm-flex">`
    +`<div><div class="shotmap-pitch" id="hmPitch">${pitch}`
    +`<canvas id="heatCv" width="${d.w}" height="${d.h}"></canvas>${markers}</div>`
    +`<div class="shotmap-legend">${legend}</div></div>`
    +`<div class="hm-list">${list}</div></div></div>`;
}
/* hover with '' restores the whole-team heatmap */
function heatHover(p){
  const pts=p?(_heatBy[p]||[]):[].concat(...Object.values(_heatBy));
  drawHeat(pts);
  document.querySelectorAll('.hm-mark,.hm-row').forEach(el=>{
    el.classList.toggle('sel',!!p&&el.dataset.p===p);
    el.classList.toggle('dim',!!p&&el.dataset.p!==p);
  });
}
function drawHeat(pts,cv){   // cv defaults to the Stats-tab canvas; the PDF report passes its own
  cv=cv||$('heatCv'); if(!cv)return;
  const W=cv.width, H=cv.height;
  // grayscale density buffer: one soft radial blob per touch, stacked alpha
  const off=document.createElement('canvas'); off.width=W; off.height=H;
  const c=off.getContext('2d'), R=54;
  // per-point weight shrinks with volume so a full-match team map doesn't saturate
  const A=Math.max(0.10,Math.min(0.40,45/(pts.length||1))).toFixed(3);
  pts.forEach(t=>{
    const x=t.x/100*W, y=t.y/100*H;
    const g=c.createRadialGradient(x,y,0,x,y,R);
    g.addColorStop(0,`rgba(0,0,0,${A})`); g.addColorStop(1,'rgba(0,0,0,0)');
    c.fillStyle=g; c.fillRect(x-R,y-R,2*R,2*R);
  });
  // 256-entry colour LUT: blue → cyan → green → yellow → red
  const pc=document.createElement('canvas'); pc.width=256; pc.height=1;
  const pg=pc.getContext('2d'), lg=pg.createLinearGradient(0,0,256,0);
  [[0.08,'#0028ff'],[0.35,'#00c8ff'],[0.55,'#39ff54'],[0.75,'#ffe12b'],[1,'#ff2b1e']]
    .forEach(([s,col])=>lg.addColorStop(s,col));
  pg.fillStyle=lg; pg.fillRect(0,0,256,1);
  const lut=pg.getImageData(0,0,256,1).data;
  const img=c.getImageData(0,0,W,H), dta=img.data;
  for(let i=0;i<dta.length;i+=4){
    const a=dta[i+3]; if(!a)continue;
    dta[i]=lut[a*4]; dta[i+1]=lut[a*4+1]; dta[i+2]=lut[a*4+2];
    dta[i+3]=Math.min(235,a*1.6);
  }
  const g2=cv.getContext('2d'); g2.clearRect(0,0,W,H); g2.putImageData(img,0,0);
}
function setHeatHalf(h){heatHalf=h;renderStats();}
function renderGeneral(){
  const h=sumTeam(rows,'home'), a=sumTeam(rows,'away');
  let html=`<div class="gen-wrap">`;
  TEAM_SECTIONS.forEach(sec=>{
    html+=`<div class="gen-sec">${sec[0]}</div>`;
    sec[1].forEach(([label,fn])=>{
      const hv=fn(h,a), av=fn(a,h);
      const hnum=numOf(hv), anum=numOf(av), tot=hnum+anum;
      const hp=tot?Math.round(hnum/tot*100):50;
      html+=`<div class="gen-row"><span class="vh">${hv}</span>`+
            `<div class="gen-bar lbar"><div class="bh" style="width:${hp}%"></div></div>`+
            `<span class="lbl">${label}</span>`+
            `<div class="gen-bar rbar"><div class="ba" style="width:${100-hp}%"></div></div>`+
            `<span class="va">${av}</span></div>`;
    });
  });
  html+='</div>';
  $('statsHolder').innerHTML=matchSummaryHTML()
    +`<div class="gen-layout">${formationSideHTML('home')}<div class="gen-center">${html}</div>${formationSideHTML('away')}</div>`;
}
/* goals scored by a team = its own 'goal' events + opponent own goals */
function teamGoals(team){
  const opp=team==='home'?'away':'home';
  return rows.filter(r=>r.team===team&&r.event==='goal').length
       + rows.filter(r=>r.team===opp&&(r.event==='own goal'||r.event==='own-goal')).length;
}
/* the minute a marker is labelled with. Stoppage time is capped by the half, so a
   45:52 first-half goal is 45+1' and a 95:30 second-half one is 90+6' (never 46' / 96').
   Takes {sec,half} as subMarkers() and the timeline both build them. */
function markMin(e){
  const halfMin=(+dur.halfLen||45), m=Math.floor(e.sec/60)+1, cap=e.half*halfMin;
  return m>cap?`${cap}+${m-cap}'`:`${m}'`;
}
/* ---- Overall: each side's substitutions, listed beside the score ----
   The minute, then who came on (green ▲) and who went off (red ▼). Reads the same
   subMarkers() the timeline does, so the panel and the timeline cannot disagree —
   including the grouping that makes several swaps in one minute a single entry. */
function subsPanelHTML(team){
  const names=squadNames(lineups,team);
  const nm=no=>{const k=String(no==null?'':no).trim();
    return k?k+'. '+playerLabel(names,k):'—';};
  const line=(dir,cls,min,no)=>`<div class="sp-row"><span class="${cls}">${dir}</span>`
    +`<span class="sp-min">${min}</span><span class="sp-nm">${esc(nm(no))}</span></div>`;
  const out=[];
  subMarkers().filter(m=>m.team===team).sort((a,b)=>a.half-b.half||a.sec-b.sec)
    .forEach(m=>{const min=markMin(m);
      m.pairs.forEach(p=>{out.push(line('▲','sp-on',min,p.on));out.push(line('▼','sp-off',min,p.off));});});
  return `<div class="sb-subs">`
    +(out.length?out.join(''):`<div class="sp-empty">No substitutions</div>`)+`</div>`;
}
function scoreBarHTML(){
  return `<div class="score-bar">${subsPanelHTML('home')}`
    +`<span class="sb-name home">${meta.home}</span>`
    +`<span class="sb-score">${teamGoals('home')}<i>:</i>${teamGoals('away')}</span>`
    +`<span class="sb-name away">${meta.away}</span>`
    +`${subsPanelHTML('away')}</div>`;
}
/* ---- General: horizontal match-summary timeline (goals / own goals / cards / subs).
   Home events sit above the axis, away events below; stacked when they collide. */
const SUMMARY_EVENTS={'goal':'goal','own goal':'og','own-goal':'og','yellow card':'yc','red card':'rc'};
/* Substitution markers. Swaps made at the same moment are ONE marker badged x2 / x3
   instead of a row of identical arrows: the pairs of a single entry ("38sub6*27sub43")
   share a group id and always land together, and separate entries join them when they
   fall in the same minute of the same half. Reads the event rows (playerFrom = off,
   playerTo = on), so a substitution deleted in the events table leaves the timeline. */
function subMarkers(){
  const list=rows.filter(r=>r&&r.t!=null&&evKey(r.event)==='substitution'
      &&(r.team==='home'||r.team==='away'))
    .slice().sort((a,b)=>a.t-b.t);
  const minuteKey=r=>r.team+'#'+eventHalf(r)+'#'+Math.floor(matchTime(r.t)/60);
  const grpKey=new Map();   // every pair of one entry follows its FIRST pair's bucket
  list.forEach(r=>{if(r.grp!=null&&!grpKey.has(r.grp))grpKey.set(r.grp,minuteKey(r));});
  const byKey=new Map(), out=[];
  list.forEach(r=>{
    const k=(r.grp!=null&&grpKey.has(r.grp))?grpKey.get(r.grp):minuteKey(r);
    let m=byKey.get(k);
    if(!m){m={team:r.team,no:'',kind:'sub',sec:matchTime(r.t),half:eventHalf(r),pairs:[]};
      byKey.set(k,m); out.push(m);}
    m.sec=Math.min(m.sec,matchTime(r.t));   // the marker sits at the first swap of the window
    m.pairs.push({off:String(r.playerFrom||'').trim(),on:String(r.playerTo||'').trim()});
  });
  return out;
}
function matchSummaryHTML(){
  // cards: a 2nd yellow shows as one "yellow+red" marker; the redundant explicit red
  // for that same dismissal is dropped so 61' isn't two markers (see classifyCards)
  const cardKind=classifyCards(rows);
  const evs=rows.filter(r=>r.t!=null&&SUMMARY_EVENTS[r.event]).sort((x,y)=>x.t-y.t)
    .map(r=>{
      const base={team:r.team,no:(r.playerFrom||'').toString().trim(),sec:matchTime(r.t),half:eventHalf(r)};
      const e=(r.event||'').toString().trim().toLowerCase();
      if(e==='yellow card'||e==='red card'){
        const k=cardKind.get(r); return k?{...base,kind:k}:null;   // null -> suppressed
      }
      return {...base,kind:SUMMARY_EVENTS[r.event]};
    }).filter(Boolean);
  // half first, then match seconds: first-half stoppage overlaps the opening second-half
  // minutes, and the marks are laid out left to right in this order
  const all=evs.concat(subMarkers()).sort((a,b)=>a.half-b.half||a.sec-b.sec);
  if(!all.length)return `<div class="chart-card sum-card">${scoreBarHTML()}<div class="stats-empty">No goals, cards or substitutions yet.</div></div>`;
  // wide, flat viewBox keeps the card short when the SVG scales to full width
  const W=1500,H=138,mL=104,mR=30,axisY=66,hl=(+dur.halfLen||45)*60;
  // the axis uses the REAL length of each half (incl. stoppage): HT sits at the
  // half-time whistle and FT at the full-time whistle (from the Duration settings
  // when set, else stretched to the half's last event), so 45+X' events stay
  // before HT and 90+X' before FT whatever the configured minutes-per-half.
  const maxSec=h=>Math.max(0,...all.filter(e=>e.half===h).map(e=>e.sec));
  const H1=Math.max(hl,(dur.h2Start>0&&dur.h1End>dur.h1Start)?dur.h1End-dur.h1Start:0,maxSec(1)?maxSec(1)+30:0);
  const H2=Math.max(hl,(dur.h2Start>0&&dur.h2End>dur.h2Start)?dur.h2End-dur.h2Start:0,maxSec(2)?maxSec(2)-hl+30:0);
  const total=H1+H2;
  const pos=e=>e.half===1?e.sec:H1+(e.sec-hl);   // piecewise: half-2 seconds resume at the HT tick
  const X=s=>mL+s/total*(W-mL-mR);
  let g=`<line x1="${mL}" y1="${axisY}" x2="${W-mR}" y2="${axisY}" stroke="var(--line)" stroke-width="4" stroke-linecap="round"/>`;
  [[0,"0'"],[H1,'HT'],[total,'FT']].forEach(([s,lb])=>{
    g+=`<line x1="${X(s)}" y1="${axisY-7}" x2="${X(s)}" y2="${axisY+7}" stroke="var(--mut)" stroke-width="2"/>`
      +`<text x="${X(s)}" y="${axisY+22}" text-anchor="middle" font-size="12" fill="var(--mut)">${lb}</text>`;
  });
  // full team names, word-wrapped onto up to 3 lines in the left margin
  const wrapName=n=>{const words=String(n).split(/\s+/),lines=[];let cur='';
    words.forEach(w=>{if(cur&&(cur+' '+w).length>14){lines.push(cur);cur=w;}else cur=cur?cur+' '+w:w;});
    if(cur)lines.push(cur); return lines.slice(0,3);};
  const nameText=(n,col,above)=>{const ls=wrapName(n), lh=12;
    const y0=above?axisY-24-(ls.length-1)*lh:axisY+28;
    return `<text x="8" font-size="11" font-weight="700" fill="${col}">`
      +ls.map((l,i)=>`<tspan x="8" y="${y0+i*lh}">${l}</tspan>`).join('')+'</text>';};
  g+=nameText(meta.home,'var(--home)',true)+nameText(meta.away,'var(--away)',false);
  const cardRect=(col,x)=>`<rect x="${x}" y="-8" width="10" height="16" rx="2" fill="${col}" stroke="#000000"/>`;
  // substitution: the player going off (red ▼) beside the one coming on (green ▲)
  const subIcon=`<g stroke-linecap="round">`
    +`<line x1="-5.5" y1="-7" x2="-5.5" y2="1.4" stroke="#f7506b" stroke-width="2.6"/>`
    +`<polygon points="-5.5,8 -9.4,1.4 -1.6,1.4" fill="#f7506b"/>`
    +`<line x1="5.5" y1="7" x2="5.5" y2="-1.4" stroke="#39d98a" stroke-width="2.6"/>`
    +`<polygon points="5.5,-8 1.6,-1.4 9.4,-1.4" fill="#39d98a"/></g>`;
  const icon=k=>k==='goal'?'<text text-anchor="middle" font-size="17" y="6">⚽</text>'
    :k==='og'?'<circle r="10" fill="#f7506b"/><text text-anchor="middle" font-size="9" font-weight="800" fill="#fff" y="3.5">OG</text>'
    :k==='sub'?subIcon
    :k==='y2'?cardRect('#ffd23f',-9.5)+cardRect('#e5484d',-0.5)   // 2nd yellow → red: both cards
    :cardRect(k==='yc'?'#ffd23f':'#e5484d',-5);
  // stoppage-time minutes are capped by the half: a 45:52 first-half goal is
  // 45+1', a 95:30 second-half goal is 90+6' (never 46' / 96')
  const minLbl=markMin;
  // every event sits on one lane per team — home above the axis, away below;
  // near-simultaneous events of the same team are nudged right so icons never overlap
  const lastX={home:-1e9,away:-1e9};
  const marks=all.map(e=>{
    const x=Math.max(X(pos(e)),lastX[e.team]+24), up=e.team==='home', col=up?'var(--home)':'var(--away)';
    lastX[e.team]=x;
    const y=up?axisY-26:axisY+32;
    // a substitution names no single player, so its badge slot carries x2 / x3 when the
    // moment swapped more than one; who went off for whom is spelled out on hover
    const badge=e.kind==='sub'
      ? (e.pairs.length>1?`<text text-anchor="middle" y="${up?-20:30}" font-size="11" font-weight="800" fill="${col}">x${e.pairs.length}</text>`:'')
      : (e.no?`<circle cy="${up?-24:26}" r="9.5" fill="${col}" stroke="rgba(255,255,255,0.85)" stroke-width="1.5"/>`
        +`<text text-anchor="middle" y="${up?-20.5:29.5}" font-size="10" font-weight="800" fill="var(--team-ink)">${e.no}</text>`:'');
    const tip=e.kind==='sub'
      ? `<title>${esc(minLbl(e)+' '+e.pairs.map(p=>(p.off||'?')+' ▼ '+(p.on||'?')+' ▲').join(' · '))}</title>`:'';
    // a substitution made at the break lands ON the HT tick, and its "46'" was printing
    // over the word HT. Standing in line with the tick already says when it happened,
    // so that one carries no minute — the hover still spells it out.
    const atBreak=e.kind==='sub'&&Math.abs(pos(e)-H1)<1;
    const min=atBreak?'':`<text text-anchor="middle" y="${up?20:-16}" font-size="10" fill="var(--mut)">${minLbl(e)}</text>`;
    return `<g transform="translate(${x.toFixed(1)} ${y})">${tip}${icon(e.kind)}${badge}${min}</g>`;
  }).join('');
  return `<div class="chart-card sum-card">${scoreBarHTML()}<div class="sum-wrap">`
    +`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="width:100%;min-width:900px">${g}${marks}</svg></div></div>`;
}
/* ---- General: starting formation, vertical pitch, always attacking UP ---- */
function pitchSVGV(){
  const d=PITCH_DIMS.football;
  return `<svg viewBox="0 0 ${d.h} ${d.w}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;display:block">`
    +`<rect width="${d.h}" height="${d.w}" fill="rgba(26,62,32,0.72)"/>`
    +`<g transform="translate(0 ${d.w}) rotate(-90)"><g fill="none" stroke="${PITCH_LINE}" stroke-width="3">${pitchFootball(d.w,d.h,false)}</g></g></svg>`;
}
function formationSideHTML(team){
  const lu=(lineups&&lineups[team])||blankTeamLU('lr');
  let pitch;
  if(!lu.xi||!lu.xi.length){
    pitch=`<div class="stats-empty">No starting lineup yet — set it in Player lists.</div>`;
  }else{
    const dots=lu.xi.map(p=>{
      let x=p.x, y=p.y;
      if((lu.dir||'lr')==='rl'){x=100-x;y=100-y;}          // normalise board coords to attacking RIGHT
      const left=y, top=100-x;                             // then rotate 90° CCW → vertical, attacking UP
      const pl=(lu.roster||[]).find(r=>String(r.no)===String(p.no));
      return `<div class="gf-dot ${team}" style="left:${left.toFixed(1)}%;top:${top.toFixed(1)}%">`
        +`<span class="gf-no">${p.no}</span><span class="gf-nm">${pl&&pl.name?pl.name:'P. '+p.no}</span></div>`;
    }).join('');
    pitch=`<div class="gf-pitch">${pitchSVGV()}${dots}<div class="gf-arrow">▲ Attacking</div></div>`;
  }
  return `<div class="gen-form">${pitch}${benchListHTML(team)}</div>`;
}
/* ---- General: the named bench under each formation. This is the squad as it was
   NAMED before kick-off (lineups[team].subs), to match the starting XI drawn above it —
   not the live bench, which substitutions rewrite as the match goes on. ---- */
function benchListHTML(team){
  const lu=(lineups&&lineups[team])||null;
  const bench=(((lu&&lu.subs)||[]).map(n=>String(n==null?'':n).trim())).filter(Boolean);
  const names=squadNames(lineups,team);
  const list=bench.length
    ? bench.map(no=>`<span class="gf-sub ${team}"><span class="gf-sno">${esc(no)}</span>`
        +`<span class="gf-snm">${esc(names[no]||'')}</span></span>`).join('')
    : `<span class="gf-bempty">No substitutes named.</span>`;
  return `<div class="gf-bench"><div class="gf-btitle">Substitutes`
    +(bench.length?`<span class="gf-bcnt">${bench.length}</span>`:'')
    +`</div><div class="gf-blist">${list}</div></div>`;
}

/* ---- exports (full workbook: events + stats + pass distribution) ---- */
let dur=blankDur();
function fmt(t){const m=Math.floor(t/60),s=Math.floor(t%60),cs=Math.floor((t%1)*100);return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;}
function matchTime(vt){const d=dur; if(!d.enabled)return vt; const off=(+d.halfLen||45)*60;
  if(d.h2Start>0 && vt>=d.h2Start) return off+(vt-d.h2Start); return Math.max(0, vt-(d.h1Start||0));}
function eventHalf(r){const h2=dur.h2Start; return (h2>0 && r.t>=h2)?2:1;}
function buildData(half){
  const rs=rows.filter(r=>r.t!=null).sort((a,b)=>a.t-b.t).filter(r=>!half||eventHalf(r)===half);
  return rs.map((r,i)=>({no:i+1,timecode:fmt(matchTime(r.t)),match_seconds:+matchTime(r.t).toFixed(2),
    video_seconds:+(+r.t).toFixed(2),team:r.team,team_name:r.teamName||(r.team==='home'?meta.home:meta.away),event:r.event,
    player_from:r.playerFrom,player_x:r.pXY?+r.pXY.x.toFixed(1):'',player_y:r.pXY?+r.pXY.y.toFixed(1):'',
    player_to:r.playerTo,receiver_x:r.rXY?+r.rXY.x.toFixed(1):'',receiver_y:r.rXY?+r.rXY.y.toFixed(1):'',
    action_code:r.action,raw_input:r.raw}));
}
function eventsSheet(half){
  const ws=XLSX.utils.json_to_sheet(buildData(half));
  ws['!cols']=[{wch:5},{wch:10},{wch:13},{wch:13},{wch:7},{wch:14},{wch:14},{wch:11},{wch:8},{wch:8},{wch:9},{wch:9},{wch:9},{wch:9},{wch:16}];
  return ws;
}
function passSheet(team){
  const {players,mtx}=passMatrix(rows,team);
  const aoa=[['From \\ To',...players,'Σ']]; const colSum={}; let grand=0;
  players.forEach(f=>{let rowSum=0; const row=[f];
    players.forEach(t=>{if(f===t){row.push('–');return;}
      const v=(mtx[f]&&mtx[f][t])||0; rowSum+=v; colSum[t]=(colSum[t]||0)+v; grand+=v; row.push(v);});
    row.push(rowSum); aoa.push(row);});
  aoa.push(['Σ recv',...players.map(p=>colSum[p]||0),grand]);
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols']=aoa[0].map((h,i)=>({wch:i===0?9:Math.max(4,String(h).length+1)}));
  return ws;
}
function buildSheets(){
  return [['events_1st_half',eventsSheet(1)],['events_2nd_half',eventsSheet(2)],
          ['stats_home',statsSheet('home')],['stats_away',statsSheet('away')],
          ['pass_home',passSheet('home')],['pass_away',passSheet('away')],
          ['team_stats',teamStatsSheet()]];
}
function statsSheet(team){
  // same squad padding + name column as the on-screen table, so the export matches it
  const P=withSquad(computeStats(rows,team),lineups,team), players=sortedPlayers(P);
  const names=squadNames(lineups,team);
  const headers=[STAT_HEADERS[0],'Player',...STAT_HEADERS.slice(1)];
  const h1=new Array(headers.length).fill(''); const merges=[];
  let c=0; STAT_GROUPS.forEach((g,i)=>{const span=i===0?g[1]+1:g[1];   // 'No' group also holds 'Player'
    if(g[0]){h1[c]=g[0]; if(span>1)merges.push({s:{r:0,c},e:{r:0,c:c+span-1}});} c+=span;});
  merges.push({s:{r:0,c:0},e:{r:1,c:0}},{s:{r:0,c:1},e:{r:1,c:1}});
  const aoa=[h1,headers,...players.map(no=>{const r=statRow(no,P[no]);
    return [r[0],playerLabel(names,no),...r.slice(1)];})];
  const ws=XLSX.utils.aoa_to_sheet(aoa); ws['!merges']=merges;
  ws['!cols']=headers.map((h,i)=>({wch:i===0?5:i===1?18:Math.max(7,h.length)}));
  return ws;
}
function teamStatsSheet(){
  const h=sumTeam(rows,'home'), a=sumTeam(rows,'away');
  const aoa=[[meta.home,'Team Comparison',meta.away]];
  TEAM_SECTIONS.forEach(sec=>{
    aoa.push([sec[0],'','']);
    sec[1].forEach(([label,fn])=>aoa.push([fn(h,a),label,fn(a,h)]));
    aoa.push(['','','']);
  });
  const ws=XLSX.utils.aoa_to_sheet(aoa); ws['!cols']=[{wch:14},{wch:20},{wch:14}];
  return ws;
}
const matchName=()=>(meta.home||'Home')+'_vs_'+(meta.away||'Away');


/* ============================================================================
   Film — the tagged match played back over the video it was tagged against.

   Nothing is cut. The four Duration boundaries already describe both halves in
   the video file's own clock, so a half is a WINDOW the player is held inside:
   currentTime is clamped to it, and the bar underneath is drawn in match time
   rather than file time. One object in storage, two halves on screen.

   The overlay is driven by a cursor walking the events in t order. Each event
   holds the screen for a stretch rather than a frame — half a second before its
   dot and two and a half after the last one — because one frame at playback
   speed is not long enough to read.

   A match tagged from a local file has no shared URL and so has nothing to
   play: the club's browser cannot reach the analyst's disk. Film says that
   plainly instead of offering a dead player.
   ========================================================================== */
const FILM_LEAD=0.05;                              // an event lands this long before its moment
const FILM_HOLD=0.05;                              // …and leaves this long after its last dot
const FILM_STEP=2;                                 // what ← and → are worth
let filmHalf=1;                                    // which window is showing
let film=null;                                     // the live player, while Film is on screen
let filmResume=null;                               // {half,t} — a redraw must not rewind the video
let filmFilter={team:'',player:'',event:''};
let videoSrc=null;                                 // {url}: frozen in the report, or the match row

const filmClock=t=>fmt(Math.max(0,t)).slice(0,5);   // mm:ss — centiseconds are noise here

/* A half is a window only when its two boundaries make one. h1Start is allowed
   to be 0: a file that opens on the kick-off is the ordinary case, not a value
   somebody forgot, so the test is always on the pair and never on the start. */
function filmWindows(){
  const d=dur, out=[];
  const s1=+d.h1Start||0, e1=+d.h1End||0, s2=+d.h2Start||0, e2=+d.h2End||0;
  if(e1>s1)out.push({half:1,label:'1st Half',start:s1,end:e1});
  if(s2>0&&e2>s2)out.push({half:2,label:'2nd Half',start:s2,end:e2});
  if(!out.length)out.push({half:0,label:'Full Match',start:0,end:Infinity});
  return out;
}

/* The events of one half, in CLOCK order, each with the stretch it owns and its
   place in that order. This is the playhead's view and nothing else reorders it:
   the cursor only works while `in` climbs.

   Which half an event is in is eventHalf()'s answer and not the playback bounds'.
   The two are not the same question, and reading membership off the bounds lost
   events: a dot placed as the ball was struck can land a fraction BEFORE the
   kick-off boundary set afterwards — the opening pass of Saint Lucia v Barbados
   sat at 517.09 against an h1Start of 517.25 — and matchTime() clamps anything
   at or before the kick-off to 00:00.00. So the tagging table, Stats and the
   exports all showed it at 00:00 in the first half, and only Film left it out.

   The bounds go on doing what they are for: holding the player inside the half.
   An event outside them is still listed, and seeking to it lands on the nearest
   edge — which for a kick-off tagged early is the kick-off itself. */
function filmCues(win){
  return rows.filter(r=>r.t!=null&&(!win.half||eventHalf(r)===win.half))
    .sort((a,b)=>a.t-b.t)
    .map((r,i)=>{
      const t=+r.t, rt=(r.rt==null||!isFinite(+r.rt))?null:+r.rt;
      return {i:i,r:r,t:t,rt:rt,in:t-FILM_LEAD,out:Math.max(t,rt==null?t:rt)+FILM_HOLD};
    });
}

/* …and the reading view: the order the analyst typed, not the order the dots
   were placed.

   One entry writes several rows, and each carries the time of ITS OWN dot — an
   event tagged without one carries the moment Enter was pressed instead. Sorted
   by t alone, "17 #recovery #cross success #key pass 14 #shot on target
   #right foot" came back as key pass, recovery, cross success: the same touches,
   in an order nobody typed and nobody can read.

   So a chain (rows sharing a grp) moves as one block, sits at its earliest
   touch, and keeps its typed order inside. Twin of the sort in renderTable() in
   index.html — the events table has always read this way, and the two must not
   drift. */
function filmOrdered(cues){
  const first={};
  cues.forEach(c=>{const g=c.r.grp;
    if(g!=null)first[g]=Math.min(c.t,first[g]==null?Infinity:first[g]);});
  const keyT=c=>(c.r.grp!=null?first[c.r.grp]:c.t);
  return cues.slice().sort((a,b)=>{
    const ka=keyT(a),kb=keyT(b); if(ka!==kb)return ka-kb;
    const ga=a.r.grp==null?'':String(a.r.grp), gb=b.r.grp==null?'':String(b.r.grp);
    if(ga!==gb)return ga<gb?-1:1;                  // rows of one chain, together
    return (a.r.ord||0)-(b.r.ord||0);              // and in the order they were typed
  });
}

function filmMatches(r){
  const f=filmFilter;
  if(f.team&&r.team!==f.team)return false;
  if(f.event&&r.event!==f.event)return false;
  if(f.player&&String(r.playerFrom||'').trim()!==f.player
             &&String(r.playerTo||'').trim()!==f.player)return false;
  return true;
}

function filmChoices(cues){
  const players={},events={};
  cues.forEach(c=>{
    [c.r.playerFrom,c.r.playerTo].forEach(n=>{n=String(n==null?'':n).trim(); if(n)players[n]=1;});
    if(c.r.event)events[c.r.event]=1;
  });
  return {players:Object.keys(players).sort((a,b)=>(+a||0)-(+b||0)),
          events:Object.keys(events).sort()};
}

/* The passer's number, then his events, then the receiver's — the same shape the
   events table in the tagging app prints, so a caption here reads as the row it
   came from.

   Every number carries its OWN side's colour rather than the strip's. What is on
   screen at one moment is regularly both teams at once — a tackle answering the
   pass it broke up — and a single colour across the line would hand the tackle
   to the side that had just lost the ball. Same reason a run stops at a change
   of team: two players wearing 13 are two players, so the number is reprinted.  */
function filmChainHTML(list){
  let html='',printed=null,i=0;
  const chip=(n,team)=>`<span class="fm-no ${team==='away'?'away':'home'}">${esc(n)}</span>`;
  while(i<list.length){
    const team=list[i].team, from=String(list[i].playerFrom||'');
    const run=[];
    while(i<list.length&&list[i].team===team&&String(list[i].playerFrom||'')===from){run.push(list[i]);i++;}
    if(from&&team+':'+from!==printed){html+=(html?' ':'')+chip(from,team);printed=team+':'+from;}
    let to=null;
    run.forEach(r=>{html+=` <span class="fm-ev">#${esc(r.event)}</span>`; if(r.playerTo)to=String(r.playerTo);});
    if(to){html+=' '+chip(to,team);printed=team+':'+to;}
  }
  return html;
}

function filmRowsHTML(cues){
  const html=filmOrdered(cues).filter(c=>filmMatches(c.r)).map(c=>
    `<div class="fm-row" data-t="${c.t}" data-i="${c.i}">`
    +`<span class="fm-t">${filmClock(matchTime(c.t))}</span>`
    +`<span class="fm-lbl">${filmChainHTML([c.r])}</span></div>`).join('');
  return html||'<div class="fm-none">No events match this filter.</div>';
}

function filmHTML(wins,win,cues,choices){
  const halves=wins.length>1
    ? '<div class="half-toggle film-halves">'+wins.map(w=>
        `<button type="button" class="${w.half===win.half?'on':''}" data-half="${w.half}">${w.label}</button>`
      ).join('')+'</div>'
    : '';
  const pick=(id,all,list,val)=>`<select class="fm-sel" id="${id}"><option value="">${all}</option>`
    +list.map(v=>`<option value="${esc(v)}"${v===val?' selected':''}>${esc(v)}</option>`).join('')+'</select>';
  return `<div class="film">${halves}<div class="film-grid">`
    +'<div class="film-main">'
      +'<div class="film-stage" id="fmStage">'
        +'<video id="fmVideo" playsinline preload="metadata"></video>'
        +'<div class="film-cap" id="fmCap"></div>'
      +'</div>'
      +'<div class="film-bar">'
        +'<button type="button" class="fm-play" id="fmPlay">&#9654;</button>'
        +'<div class="fm-track" id="fmTrack"><div class="fm-rail"></div>'
          +'<div class="fm-fill" id="fmFill"></div><div class="fm-knob" id="fmKnob"></div></div>'
        +'<span class="fm-tc" id="fmTc">00:00 / 00:00</span>'
      +'</div>'
    +'</div>'
    +'<div class="film-side">'
      +`<div class="film-pitch" id="fmPitch">${pitchSVG(meta.sport||'football')}</div>`
      +'<div class="film-filters">'
        +`<select class="fm-sel" id="fmTeam"><option value="">Both teams</option>`
        +`<option value="home"${filmFilter.team==='home'?' selected':''}>${esc(meta.home)}</option>`
        +`<option value="away"${filmFilter.team==='away'?' selected':''}>${esc(meta.away)}</option></select>`
        +pick('fmPlayer','All players',choices.players,filmFilter.player)
        +pick('fmEvent','All events',choices.events,filmFilter.event)
        +'<button type="button" class="fm-next" id="fmNext" title="Next clip">&#9197;</button>'
      +'</div>'
      +`<div class="film-list" id="fmList">${filmRowsHTML(cues)}</div>`
    +'</div></div></div>';
}

function renderFilm(holder){
  const src=(videoSrc&&videoSrc.url)||'';
  if(!src){
    holder.innerHTML='<div class="stats-empty">No video for this match.</div>';
    return;
  }
  const wins=filmWindows();
  if(!wins.some(w=>w.half===filmHalf))filmHalf=wins[0].half;
  const win=wins.filter(w=>w.half===filmHalf)[0];
  const cues=filmCues(win);
  holder.innerHTML=filmHTML(wins,win,cues,filmChoices(cues));
  filmStart(win,cues,src);
}

function filmStart(win,cues,src){
  const v=$('fmVideo'); if(!v)return;
  const pitch=$('fmPitch');
  film={video:v,win:win,cues:cues,cursor:0,active:[],balls:[],last:-1,raf:0,tcTxt:'',
        dots:pitch?pitch.querySelector('#pv-dots'):null,
        cap:$('fmCap'),fill:$('fmFill'),knob:$('fmKnob'),tc:$('fmTc'),play:$('fmPlay'),
        list:$('fmList'),rowEls:[],rowFor:null,curRow:null};
  filmIndexRows();

  // a redraw (a live event, a lineup edit) must not send the video back to the
  // kick-off; a change of half must
  const resume=(filmResume&&filmResume.half===win.half
    &&filmResume.t>=win.start&&filmResume.t<=win.end)?filmResume.t:win.start;
  filmResume=null;

  /* Every handler below asks first whether this video is still THE video. A
     switch of half replaces the node, and the one being thrown away goes on
     firing pause and seeked on its way out — unguarded, those late events would
     reach in and stop the loop of the player that had just replaced it. */
  const mine=()=>!!film&&film.video===v;
  v.addEventListener('loadedmetadata',()=>{if(mine())filmSeek(resume);});
  v.addEventListener('play',()=>{if(mine())filmLoop();});
  v.addEventListener('pause',()=>{
    if(!mine())return;
    if(film.raf)cancelAnimationFrame(film.raf);
    film.raf=0; filmFrame();
  });
  v.addEventListener('seeked',()=>{if(mine()&&v.paused)filmFrame();});
  v.src=src;

  /* The video surface itself takes no click. Reading the frame means the pointer
     is over it, and a stray click stopping the match mid-move is the one thing
     that costs the viewer their place. Space does play/pause; the button beside
     the bar is the mouse's way in, and it hands focus straight back so the next
     Space is not swallowed re-pressing it. */
  $('fmPlay').onclick=()=>{filmToggle();$('fmPlay').blur();};

  const track=$('fmTrack');
  const drop=e=>{
    const box=track.getBoundingClientRect(); if(!box.width||!film)return;
    const k=Math.min(1,Math.max(0,(e.clientX-box.left)/box.width));
    filmSeek(win.start+k*(filmEnd()-win.start));
  };
  track.addEventListener('pointerdown',e=>{
    e.preventDefault(); track.setPointerCapture(e.pointerId); drop(e);
    const move=ev=>drop(ev);
    const up=()=>{track.removeEventListener('pointermove',move);track.removeEventListener('pointerup',up);};
    track.addEventListener('pointermove',move); track.addEventListener('pointerup',up);
  });

  document.querySelectorAll('.film-halves button').forEach(b=>b.onclick=()=>{
    const h=+b.dataset.half;
    if(h!==filmHalf){filmHalf=h;renderStats();}
  });

  const setFilter=(key,el)=>{el.onchange=()=>{filmFilter[key]=el.value;filmRelist();};};
  setFilter('team',$('fmTeam')); setFilter('player',$('fmPlayer')); setFilter('event',$('fmEvent'));

  // delegated once, so relisting under a new filter leaves it wired
  film.list.onclick=e=>{
    const row=e.target&&e.target.closest?e.target.closest('.fm-row'):null;
    if(row)filmSeek(+row.dataset.t);
  };
  $('fmNext').onclick=()=>{
    if(!film)return;
    const next=film.cues.filter(c=>filmMatches(c.r)&&c.t>film.video.currentTime+0.25)[0];
    if(!next)return;
    filmSeek(next.t-FILM_STEP);
    filmPlay();
    $('fmNext').blur();
  };

  /* ← / → step two seconds, Space plays and pauses. Bound on the document,
     because with no native controls there is nothing here to focus; taken off
     again by filmStop(), or Film would go on swallowing those keys — Space above
     all — long after it has been left. */
  document.addEventListener('keydown',filmKeys);
}

/* Everything Film holds open — the fetch, the loop, the document listener —
   let go of. Called before every redraw and by destroy(), so leaving the view
   by any route leaves nothing behind. */
function filmStop(){
  const f=film; if(!f)return;
  filmResume={half:f.win.half,t:(f.video&&f.video.currentTime)||0};
  if(f.raf)cancelAnimationFrame(f.raf);
  document.removeEventListener('keydown',filmKeys);
  try{f.video.pause();f.video.removeAttribute('src');f.video.load();}catch(e){}
  film=null;
}

function filmKeys(e){
  if(!film||e.altKey||e.ctrlKey||e.metaKey)return;
  const t=e.target,tag=(t&&t.tagName)||'';
  if(tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA'||(t&&t.isContentEditable))return;
  if(e.key==='ArrowRight')filmSeekBy(FILM_STEP);
  else if(e.key==='ArrowLeft')filmSeekBy(-FILM_STEP);
  else if(e.key===' '||e.key==='Spacebar')filmToggle();
  else return;
  e.preventDefault();          // Space would scroll the page, arrows the list
}

const filmEnd=()=>{const f=film,e=f.win.end;return isFinite(e)?e:(f.video.duration||f.win.start);};
function filmSeek(t){
  const f=film; if(!f)return;
  f.video.currentTime=Math.min(filmEnd(),Math.max(f.win.start,t));
  if(f.video.paused)filmFrame();
}
function filmSeekBy(d){if(film)filmSeek(film.video.currentTime+d);}
function filmPlay(){const p=film&&film.video.play();if(p&&p.catch)p.catch(()=>{});}
function filmToggle(){
  const f=film; if(!f||!f.video.src)return;
  f.video.paused?filmPlay():f.video.pause();
}

function filmLoop(){if(!film)return;filmFrame();film.raf=requestAnimationFrame(filmLoop);}

/* One frame: hold the player inside the window, move the cursor, then paint.
   The dots are only rebuilt when the set of live events changes; the ball and
   the bar move every frame, by attribute. */
function filmFrame(){
  const f=film; if(!f)return;
  const v=f.video, now=v.currentTime;
  if(now>filmEnd()+0.05){v.pause();v.currentTime=filmEnd();return;}
  if(now<f.win.start-0.05){v.currentTime=f.win.start;return;}
  if(now<f.last)filmRewind(now); else filmAdvance(now);
  f.last=now;
  filmBall(now);
  filmBar(now);
}

function filmAdvance(now){
  const f=film; let moved=false;
  while(f.cursor<f.cues.length&&f.cues[f.cursor].in<=now){f.active.push(f.cues[f.cursor++]);moved=true;}
  const keep=f.active.filter(c=>c.out>now);
  if(keep.length!==f.active.length){f.active=keep;moved=true;}
  if(moved)filmDraw();
}
function filmRewind(now){
  const f=film; let i=0;
  while(i<f.cues.length&&f.cues[i].in<=now)i++;
  f.cursor=i;
  f.active=f.cues.slice(0,i).filter(c=>c.out>now);
  filmDraw();
}

const SVGNS='http://www.w3.org/2000/svg';
function filmDot(x,y,no,col,r){
  const g=document.createElementNS(SVGNS,'g');
  const c=document.createElementNS(SVGNS,'circle');
  c.setAttribute('cx',x.toFixed(1)); c.setAttribute('cy',y.toFixed(1)); c.setAttribute('r',r);
  c.setAttribute('fill',col); c.setAttribute('stroke','#000000'); c.setAttribute('stroke-width',2);
  g.appendChild(c);
  const n=String(no==null?'':no).trim();
  if(n){
    const t=document.createElementNS(SVGNS,'text');
    t.setAttribute('x',x.toFixed(1)); t.setAttribute('y',(y+r*0.37).toFixed(1));
    t.setAttribute('text-anchor','middle'); t.setAttribute('font-size',Math.round(r*1.05));
    t.setAttribute('font-weight','800'); t.setAttribute('fill','#14100F');
    t.textContent=n; g.appendChild(t);
  }
  return g;
}

function filmDraw(){
  const f=film; if(!f)return;
  filmCaption();
  if(!f.dots)return;
  const d=PITCH_DIMS[meta.sport]||PITCH_DIMS.football;
  const R=Math.round(d.h*0.028);
  f.dots.textContent=''; f.balls=[];
  f.active.forEach(c=>{
    const r=c.r, col=r.team==='away'?'#FFFF66':'#EEEEEE';
    const p=r.pXY?{x:r.pXY.x/100*d.w,y:r.pXY.y/100*d.h}:null;
    const q=r.rXY?{x:r.rXY.x/100*d.w,y:r.rXY.y/100*d.h}:null;
    if(p&&q){
      const ln=document.createElementNS(SVGNS,'line');
      ln.setAttribute('x1',p.x.toFixed(1)); ln.setAttribute('y1',p.y.toFixed(1));
      ln.setAttribute('x2',q.x.toFixed(1)); ln.setAttribute('y2',q.y.toFixed(1));
      ln.setAttribute('stroke',col); ln.setAttribute('stroke-width',4);
      ln.setAttribute('stroke-opacity','0.6'); ln.setAttribute('stroke-dasharray','14 9');
      f.dots.appendChild(ln);
    }
    if(p)f.dots.appendChild(filmDot(p.x,p.y,r.playerFrom,col,R));
    if(q)f.dots.appendChild(filmDot(q.x,q.y,r.playerTo,col,R));
    // the ball only runs where there are two dots and two times to run between
    if(p&&q&&c.rt!=null&&c.rt>c.t){
      const b=document.createElementNS(SVGNS,'circle');
      b.setAttribute('r',Math.round(R*0.45)); b.setAttribute('fill','#f7b32f');
      b.setAttribute('stroke','#14100F'); b.setAttribute('stroke-width',2);
      f.dots.appendChild(b);
      f.balls.push({el:b,x1:p.x,y1:p.y,x2:q.x,y2:q.y,t0:c.t,t1:c.rt});
    }
  });
  filmBall(f.video.currentTime);
}

function filmBall(now){
  const f=film; if(!f)return;
  f.balls.forEach(b=>{
    const k=Math.min(1,Math.max(0,(now-b.t0)/Math.max(0.001,b.t1-b.t0)));
    b.el.setAttribute('cx',(b.x1+(b.x2-b.x1)*k).toFixed(1));
    b.el.setAttribute('cy',(b.y1+(b.y2-b.y1)*k).toFixed(1));
  });
}

/* The strip under the frame reads as two halves: home from the left edge, away
   from the right. A moment regularly holds both teams — a tackle answering the
   pass it broke up — and side-by-side they had to be read before it was clear
   which was whose. Split, the edge answers that before the words are read.

   Nothing to do with the pitch beside it: the dots stay where they were tagged,
   in the video's own frame, and no direction of attack is consulted here. */
function filmCaption(){
  const f=film; if(!f||!f.cap)return;
  if(!f.active.length){f.cap.className='film-cap';f.cap.innerHTML='';return;}
  const list=filmOrdered(f.active).map(c=>c.r);   // read in the order it was typed
  const side=t=>filmChainHTML(list.filter(r=>r.team===t));
  f.cap.className='film-cap on';   // the colour is on each number, not on the strip
  // both sides are always written, empty or not: with two children the strip's
  // space-between is what pins each of them to its own edge
  f.cap.innerHTML='<span class="fm-side home">'+side('home')+'</span>'
                 +'<span class="fm-side away">'+side('away')+'</span>';
}

function filmBar(now){
  const f=film, end=filmEnd(), span=Math.max(0.001,end-f.win.start);
  const k=Math.min(1,Math.max(0,(now-f.win.start)/span))*100;
  f.fill.style.width=k.toFixed(3)+'%';
  f.knob.style.left=k.toFixed(3)+'%';
  const lbl=filmClock(matchTime(now))+' / '+filmClock(matchTime(end));
  if(lbl!==f.tcTxt){f.tc.textContent=lbl;f.tcTxt=lbl;}
  f.play.innerHTML=f.video.paused?'&#9654;':'&#10074;&#10074;';
  filmMark();
}

/* Which row is lit. The list reads in entry order, so it can run backwards in
   time inside a chain — walking the rows and stopping at the first one past the
   playhead would stop halfway through a move. The cursor already holds the
   answer in clock terms (it advances on exactly `t - LEAD <= now`), and rowFor
   turns that into a row, so this stays O(1) on a 1300-event half. */
function filmMark(){
  const f=film;
  const sel=(f.cursor>0&&f.rowFor)?(f.rowFor[f.cursor-1]||null):null;
  if(sel===f.curRow)return;
  if(f.curRow)f.curRow.classList.remove('on');
  f.curRow=sel;
  if(!sel)return;
  sel.classList.add('on');
  /* The moment being played goes to the TOP of the list, and everything after
     it reads downwards — which is the question the list is there to answer.
     Centring it, and only when it had already fallen off the edge, meant the
     list sat still through a dozen events and then jumped half a screen.

     Measured off the two rectangles rather than offsetTop: this scroller is
     not a positioned element, so offsetTop is counted from whatever the host
     page happens to have positioned above it, which is how the jump got its
     size. clientTop takes the border off. Only reached when the lit row
     changes, so the forced layout is a few times a second at most. */
  const box=f.list;
  box.scrollTop+=sel.getBoundingClientRect().top-box.getBoundingClientRect().top-box.clientTop;
}

/* cue index -> the row to light up for it: its own, or the nearest listed one
   before it when a filter has hidden it. Built once per listing so the frame
   loop is a lookup rather than a scan. */
function filmIndexRows(){
  const f=film;
  f.rowEls=[].slice.call(f.list.querySelectorAll('.fm-row'));
  const at={}; f.rowEls.forEach(el=>{at[+el.dataset.i]=el;});
  const back=new Array(f.cues.length); let last=null;
  for(let i=0;i<f.cues.length;i++){ if(at[i])last=at[i]; back[i]=last; }
  f.rowFor=back; f.curRow=null;
}

function filmRelist(){
  const f=film; if(!f)return;
  f.list.innerHTML=filmRowsHTML(f.cues);
  filmIndexRows();
  filmMark();
}


/* The toolbar. Bound by mount(), because the buttons belong to whichever page
   is hosting the view — the Stats page keeps them in its own header, the client
   site gets the set this file renders. Same ids either way. */
function bindControls(){
  if(!$('viewOverallBtn'))return;   // a host that renders no toolbar
  $('expXlsx').onclick=()=>{
    if(!rows.length){alert('No data yet.');return;}
    const wb=XLSX.utils.book_new();
    buildSheets().forEach(([name,ws])=>XLSX.utils.book_append_sheet(wb,ws,name));
    XLSX.writeFile(wb,matchName()+'_events.xlsx');
  };
  // CSV can't hold multiple sheets -> download one .csv per sheet
  $('expCsv').onclick=()=>{
    if(!rows.length){alert('No data yet.');return;}
    buildSheets().forEach(([name,ws],i)=>{
      const csv=XLSX.utils.sheet_to_csv(ws);
      const blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'});
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
      a.download=matchName()+'_'+name+'.csv';
      setTimeout(()=>{a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);},i*300);
    });
  };

  $('viewOverallBtn').onclick=()=>{statView='overall';renderStats();};
  $('viewDashBtn').onclick=()=>{statView='dashboard';renderStats();};
  $('viewStatsBtn').onclick=()=>{statView='stats';renderStats();};
  if($('viewFilmBtn'))$('viewFilmBtn').onclick=()=>{statView='film';renderStats();};
  $('statHomeBtn').onclick=()=>{statTeam='home';renderStats();};
  $('statAwayBtn').onclick=()=>{statTeam='away';renderStats();};
  document.querySelectorAll('#catToggle button').forEach(b=>b.onclick=()=>{statCat=b.dataset.cat;renderStats();});
}


/* live sync with the main tagging tab (ignored while cloud mode owns the data) */
function watchLocalStorage(){
  window.addEventListener('storage',e=>{
    if(cloudMode)return;
    if(e.key===PT_KEYS.rows){rows=loadRows();renderStats();}
    // the match itself can change under us — the squad on screen has to change with it
    else if(e.key===PT_KEYS.meta){meta=loadMeta();lineups=ourLineups();renderStats();}
    else if(e.key===PT_KEYS.duration){dur=loadJSON(PT_KEYS.duration,dur);renderStats();}
    // lineups feed the General formation AND the per-player tables / heatmap squad, so
    // a lineup edit in the main tab has to re-render whatever is on screen
    else if(e.key===PT_KEYS.lineups||e.key===PT_KEYS.lineupsMatch){lineups=ourLineups();renderStats();}
  });
}


/* ===== standalone cloud mode =====
   Opening …/Stats/#match=<code> directly (without the main tagging tab) used to
   show nothing: this page only read localStorage, which only the main tab fills.
   With a #match code in the URL we now load the match read-only from Supabase
   (source of truth) and subscribe to live changes. localStorage is never written,
   so the main tab's session is untouched; if the cloud is unreachable the page
   silently keeps the localStorage-driven view above. */
const SB_CONFIG={   // public values — keep in sync with CONFIG in ../cloud-sync.js
  url:'https://xtzmtdcohoixoxqusyyz.supabase.co',
  anonKey:'sb_publishable_ZcIbdPmEdfW0POArBW_eNg_aZbc-lFa'
};
let cloudMode=false;
function dbToRow(d){
  const a=d.attributes||{};
  return {id:d.id, t:d.t_seconds, rt:a.rt??null, team:d.team,
    teamName:a.team_name||d.team, event:d.event_name,
    playerFrom:d.player_from!=null?String(d.player_from):'',
    playerTo:d.player_to!=null?String(d.player_to):'',
    action:d.action_code||'', raw:a.raw||'', grp:a.grp||null, ord:a.ord??0,
    pXY:d.x!=null?{x:d.x,y:d.y}:null, rXY:d.rx!=null?{x:d.rx,y:d.ry}:null,
    // where the ball crossed the line, for a shot on target / goal. This page loads its
    // events from Supabase itself rather than through cloud-sync.js, so it needs its own
    // copy of this line — leaving it out dropped every goal spot on the way in, and the
    // shooting map stayed empty however many were tagged. The twin in cloud-sync.js is
    // pinned to this one by a test.
    gXY:d.goal_x!=null?{x:d.goal_x,y:d.goal_y}:null};
}
async function statsCloud(){
  const m=location.hash.match(/match=([0-9a-z-]{5,36})/i);
  if(!m||!window.supabase)return;
  const saved=loadJSON('pitchtagger.cloud.cfg',{});
  const url=saved.url||SB_CONFIG.url, key=saved.key||SB_CONFIG.anonKey;
  if(!url||!key)return;
  try{
    const sb=window.supabase.createClient(url,key,{realtime:{params:{eventsPerSecond:20}}});
    const {data:{session}}=await sb.auth.getSession();
    if(!session){const {error}=await sb.auth.signInAnonymously(); if(error)throw error;}
    const code=m[1], col=/^\d{5}$/.test(code)?'code':'id';
    const {data:match,error}=await sb.from('matches').select('*').eq(col,code).maybeSingle();
    if(error||!match){if(error)console.warn('Stats cloud: match lookup failed —',error.message);return;}
    const applyMatch=row=>{
      meta={...meta, home:row.home_name||meta.home, away:row.away_name||meta.away,
        homeTeamId:row.home_team_id||null, awayTeamId:row.away_team_id||null,
        matchId:row.id, matchCode:row.code||null};
      if(row.config&&Object.keys(row.config).length)
        dur=Object.assign({enabled:false,halfLen:45,h1Start:0,h1End:0,h2Start:0,h2End:0},row.config);
      if(row.lineups&&row.lineups.home&&row.lineups.away)lineups=row.lineups;
      // the shared video, if the match has one — a local-file match has null here
      videoSrc=row.video_url?{url:row.video_url}:null;
    };
    applyMatch(match);
    // page through ALL events — a single select caps at 1000 rows
    const PAGE=1000, all=[];
    for(let from=0;;from+=PAGE){
      const {data,error:e2}=await sb.from('events').select('*')
        .eq('match_id',match.id).order('t_seconds').range(from,from+PAGE-1);
      if(e2){console.warn('Stats cloud: events load failed —',e2.message);break;}
      all.push(...(data||[]));
      if(!data||data.length<PAGE)break;
    }
    cloudMode=true;                 // from here on, ignore main-tab localStorage events
    rows=all.map(dbToRow);
    renderStats();
    // live updates: events stream + match row (names / duration / lineups)
    let t=null; const rerender=()=>{clearTimeout(t);t=setTimeout(renderStats,120);};
    sb.channel('stats:'+match.id)
      .on('postgres_changes',{event:'*',schema:'public',table:'events',filter:'match_id=eq.'+match.id},p=>{
        if(p.eventType==='INSERT'||p.eventType==='UPDATE'){
          const r=dbToRow(p.new), i=rows.findIndex(x=>x.id===r.id);
          if(i>=0)rows[i]=r; else rows.push(r);
        }else if(p.eventType==='DELETE'){
          const i=rows.findIndex(x=>x.id===p.old.id); if(i>=0)rows.splice(i,1);
        }
        rerender();
      })
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'matches',filter:'id=eq.'+match.id},p=>{
        if(p.new){applyMatch(p.new);rerender();}
      })
      .subscribe();
  }catch(e){console.warn('Stats cloud load failed — using local data:',(e&&e.message)||e);}
}


/* ============================================================================
   The public surface
   ========================================================================== */

/* The chrome a host gets when it does not bring its own. Same ids as the ones
   in Stats/index.html, because every renderer above reaches for them by id. */
const CHROME =
  '<div class="pt-stats-bar">'+
    '<div class="stats-toggle pt-views">'+
      '<button id="viewOverallBtn" type="button">Overall</button>'+
      '<button id="viewDashBtn" type="button">Dashboard</button>'+
      '<button id="viewStatsBtn" type="button">Stats</button>'+
      '<button id="viewFilmBtn" type="button">Film</button>'+
    '</div>'+
    '<div class="exports pt-exports">'+
      '<button id="expXlsx" type="button">&#11015; XLSX</button>'+
      '<button id="expCsv" type="button">&#11015; CSV</button>'+
      '<button id="expPdf" type="button">&#11015; PDF</button>'+
    '</div>'+
  '</div>'+
  '<div id="noMatchMsg" style="display:none;padding:32px 20px;text-align:center">Nothing to report on.</div>'+
  '<div class="stats-toggle sub-row sub-team" id="teamToggle" style="display:none">'+
    '<button id="statHomeBtn" type="button"></button>'+
    '<button id="statAwayBtn" type="button"></button>'+
  '</div>'+
  '<div class="stats-toggle sub-row" id="catToggle" style="display:none">'+
    '<button type="button" data-cat="shooting">Shooting</button>'+
    '<button type="button" data-cat="distribution">Distribution</button>'+
    '<button type="button" data-cat="defensive">Defensive</button>'+
    '<button type="button" data-cat="other">Other</button>'+
  '</div>'+
  '<div class="stats-wrap"><div id="statsHolder"></div></div>';

/* Read the tagging tab's stores. Only the Stats page does this — the client
   site has no such stores, and a club's browser never will. */
function loadLocal(){
  rows=loadRows();
  meta=loadMeta();
  lineups=ourLineups();
  dur=loadJSON(PT_KEYS.duration,blankDur());
  // the tagging tab holds its video in the page, never in a store — a shared URL
  // only reaches this page through the cloud (statsCloud) or a published report
  videoSrc=null;
}

/* A published report, as Submit Analysis froze it. Missing parts fall back to
   blanks rather than throwing: an old snapshot is still a snapshot. */
function setData(d){
  if(!d)return;
  rows=Array.isArray(d.rows)?d.rows:[];
  meta=Object.assign(blankMeta(),d.meta||{});
  lineups=(d.lineups&&d.lineups.home&&d.lineups.away)?d.lineups:blankLineups();
  dur=Object.assign(blankDur(),d.dur||{});
  // a report published before Film carries no video block, and a match tagged
  // from a local file carries none either — both land here as nothing to play
  videoSrc=(d.video&&d.video.url)?{url:d.video.url}:null;
  // the filters and the resume point belonged to the match being handed away
  filmHalf=1; filmFilter={team:'',player:'',event:''}; filmResume=null;
}

function mount(el,data,options){
  opts=options||{};
  root=el||null;
  if(root&&opts.chrome!==false)root.innerHTML=CHROME;
  if(opts.local)loadLocal();
  if(data)setData(data);
  bindControls();
  if(opts.local)watchLocalStorage();
  renderStats();
  if(opts.cloud)statsCloud();
  mounted=true;
  return API;
}

/* Hand over a different match without tearing the view down. The view state —
   which of the three views, which side, which category — is deliberately kept:
   someone comparing two matches on the Dashboard should stay on the Dashboard. */
function update(data){
  setData(data);
  renderStats();
  return API;
}

function destroy(){
  filmStop();
  if(root)root.innerHTML='';
  root=null; opts={}; mounted=false;
  rows=[]; meta=blankMeta(); lineups=blankLineups(); dur=blankDur();
  videoSrc=null; filmHalf=1; filmFilter={team:'',player:'',event:''}; filmResume=null;
  return API;
}

/* What report.js exports, and what a host can save. Copies of the arrays are
   not made: this is the same data the view is drawing. */
function data(){return {rows:rows,meta:meta,lineups:lineups,dur:dur};}

/* ---- the ten names that must stay global ----
   The three maps draw their own controls as markup:
   onclick="setHeatHalf(1)", onmouseenter="shotHover(...)". An inline handler
   is compiled against the GLOBAL scope, never against this closure, so wrapping
   the file up without publishing these would leave every half toggle and every
   hover on the Defensive, Distribution and Heatmap views dead — silently, with
   nothing in the console. Listed one by one on purpose: the module is not
   exposed wholesale, and a new inline handler has to be added here or it will
   be caught by the test that reads these names back out of the markup. */
window.setDefHalf=setDefHalf;   window.setDefCat=setDefCat;
window.setDistHalf=setDistHalf; window.setDistCat=setDistCat;
window.setHeatHalf=setHeatHalf; window.setOthCat=setOthCat;
window.defHover=defHover;       window.distHover=distHover;
window.heatHover=heatHover;     window.shotHover=shotHover;

/* ---- the twelve names Stats/report.js calls but does not define ----
   The report was written when this file WAS the Stats page's inline script and
   these were plain globals it could reach. Wrapping the file up left every one
   of them undefined on the far side, which is the "matchTime is not defined"
   a ⭳ PDF click threw — on this page and on the client site alike.

   Handed over rather than published to window: the module still does not leak
   (the test above reads that list back), and report.js binds them in its own
   sync(), beside the four values it already takes from data(). They read this
   closure's rows / lineups / dur, which is the match the view is drawing —
   the same match report.js synced from, so the two cannot disagree. */
const HELPERS={
  matchTime:matchTime, eventHalf:eventHalf, teamGoals:teamGoals,
  attackDir:attackDir, dirArrowSVG:dirArrowSVG, arcPath:arcPath,
  touchPoints:touchPoints, drawHeat:drawHeat, passTypeData:passTypeData,
  pdWindows:pdWindows, matchName:matchName, DEF_CATS:DEF_CATS
};

const API={mount:mount,update:update,destroy:destroy,data:data,
  render:renderStats,isMounted:function(){return mounted;},
  helpers:HELPERS,schema:1};
return API;
})();
