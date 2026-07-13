/* ============================================================================
   Stats/report.js — "⭳ PDF" export. Builds a full match report as off-screen
   A4 pages (styled after Result/Hanley_Town_vs_Gornal_Athletic_Match_Report.pdf)
   and prints them into a PDF with html2canvas + jsPDF, both lazy-loaded from
   CDN on first click. Reads the same globals the Stats page renders from
   (rows / meta / lineups / dur + the shared.js helpers), so it works in both
   localStorage mode and standalone cloud mode.
   ========================================================================== */
(function(){
'use strict';

/* ---- palette: literal colours only — report pages are light-themed and must
   not inherit the app's dark CSS variables ---- */
const C={
  navy:'#1d3d5c', ink:'#2a3542', mut:'#8b94a3', line:'#e3e7ee',
  home:'#2f6fd8', away:'#d9a012',               // home blue / away amber (reference report)
  homeRGB:'47,111,216', awayRGB:'217,160,18',
  green:'#2e9e5b', red:'#e5484d', grey:'#9aa0a6', gold:'#e8a817'
};
const TC=t=>t==='home'?C.home:C.away;
const TRGB=t=>t==='home'?C.homeRGB:C.awayRGB;
const TN=t=>t==='home'?meta.home:meta.away;
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const mmss=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`;
const minLbl=sec=>Math.floor(sec/60)+1+"'";
const dotv=v=>v?v:'<span style="color:#c9cfd9">·</span>';
const pc0=(n,d)=>d?Math.round(n/d*100)+'%':'0%';
const frac=(n,d)=>`${n}/${d}`;

/* ---- lazy CDN libs (same pattern as the XLSX script tag, but only on use) ---- */
function loadScript(src){return new Promise((res,rej)=>{
  const s=document.createElement('script'); s.src=src;
  s.onload=res; s.onerror=()=>rej(new Error('Failed to load '+src));
  document.head.appendChild(s);
});}
async function ensureLibs(){
  if(!window.html2canvas)await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
  if(!(window.jspdf&&window.jspdf.jsPDF))await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
}

/* ---- report page stylesheet, injected once (A4 @96dpi = 794x1123 css px) ---- */
function ensureCss(){
  if(document.getElementById('rpCss'))return;
  const st=document.createElement('style'); st.id='rpCss';
  st.textContent=`
.rp-page{width:794px;height:1123px;box-sizing:border-box;background:#fff;padding:46px 50px;
  font-family:Arial,Helvetica,sans-serif;color:${C.ink};position:relative;overflow:hidden;line-height:1.35}
.rp-sec{font-size:20px;font-weight:800;color:${C.navy};padding-bottom:8px;border-bottom:3px solid ${C.navy};margin-bottom:16px}
.rp-sub{font-size:14px;font-weight:800;margin:4px 0 10px}
.rp-note{font-size:9.5px;color:${C.mut};margin-top:10px}
.rp-ins{background:#eef3f9;border-left:4px solid ${C.navy};padding:11px 14px;margin-top:16px;border-radius:0 4px 4px 0}
.rp-ins b{display:block;font-size:11px;color:${C.navy};margin-bottom:5px}
.rp-ins p{margin:0;font-size:11px;line-height:1.55;color:#3d4754}
.rp-leg{display:flex;justify-content:center;gap:26px;font-size:11px;color:#3d4754;margin:2px 0 12px}
.rp-leg span{display:inline-flex;align-items:center;gap:6px}
.rp-leg i{width:12px;height:12px;border-radius:3px;display:inline-block}
.rp-cmphead{background:${C.navy};color:#fff;font-size:12px;font-weight:700;padding:7px 12px;border-radius:4px;margin:12px 0 10px}
.rp-cmprow{display:flex;align-items:center;gap:10px;margin:6px 0}
.rp-cv{flex:none;width:52px;font-size:12px;font-weight:800;text-align:right}
.rp-cl{flex:none;width:150px;text-align:center;font-size:11.5px;font-weight:700}
.rp-track{flex:1;height:11px;background:#e9ecf2;border-radius:6px;position:relative;overflow:hidden}
.rp-fill{position:absolute;top:0;left:0;height:100%;border-radius:6px}
.rp-fill.rp-fh{left:auto;right:0}
table.rpt{width:100%;border-collapse:collapse;font-size:10.5px}
.rpt th{background:${C.navy};color:#fff;font-weight:700;padding:6px 5px;text-align:center;white-space:nowrap}
.rpt td{padding:4.5px 5px;text-align:center;border-bottom:1px solid #eef1f5}
.rpt tr:nth-child(even) td{background:#f6f8fb}
.rp-pill{display:inline-block;min-width:26px;padding:2px 7px;border-radius:11px;color:#fff;font-weight:800;font-size:10px;box-sizing:border-box}
table.rpm{border-collapse:collapse;font-size:9.5px;margin:0 auto}
.rpm th{background:${C.navy};color:#fff;padding:5px 4px;min-width:24px;font-weight:700}
.rpm td{border:1px solid #f0f2f6;text-align:center;padding:5px 4px;font-weight:600}
.rp-tlrow{display:flex;align-items:center;border-bottom:1px solid #f0f2f6;padding:3.5px 0;font-size:11px}
.rp-tlh{flex:1;display:flex;justify-content:flex-end;align-items:center;gap:6px;font-weight:700;padding-right:12px}
.rp-tla{flex:1;display:flex;justify-content:flex-start;align-items:center;gap:6px;font-weight:700;padding-left:12px}
.rp-pillt{flex:none;background:${C.navy};color:#fff;border-radius:11px;padding:3px 14px;font-size:10.5px;font-weight:800}
.rp-cardi{display:inline-block;width:9px;height:13px;border-radius:2px;border:1px solid rgba(0,0,0,0.25);vertical-align:-2px}
.rp-badge{display:inline-flex;width:16px;height:16px;border-radius:50%;color:#fff;font-size:8px;font-weight:800;align-items:center;justify-content:center;line-height:1}
.rp-fgrid{display:flex;flex-wrap:wrap;gap:12px}
.rp-fcard{width:calc(50% - 6px);box-sizing:border-box;border:1px solid ${C.line};border-radius:8px;padding:9px 9px 11px;text-align:center}
.rp-fttl{font-size:11.5px;color:#5b6572;margin-bottom:7px}
.rp-fttl b{color:${C.ink}}
.rp-fpitch{position:relative;width:186px;margin:0 auto}
.rp-fdot{position:absolute;transform:translate(-50%,-50%);width:22px;height:22px;border-radius:50%;
  display:flex;align-items:center;justify-content:center;color:#fff;font-size:9.5px;font-weight:800;
  border:2px solid rgba(255,255,255,0.9);box-shadow:0 1px 2px rgba(0,0,0,0.35)}
.rp-mapcard{margin-bottom:12px}
.rp-mtitle{font-size:13px;font-weight:800;margin:0 0 7px}
.rp-mleg{display:flex;justify-content:center;flex-wrap:wrap;gap:16px;font-size:10px;color:#3d4754;margin-top:6px}
.rp-mleg i{width:10px;height:10px;border-radius:50%;display:inline-block;margin-right:5px;vertical-align:-1px}
.rp-donuts{display:flex;gap:14px;margin-bottom:4px}
.rp-dcard{flex:1;border:1px solid ${C.line};border-radius:8px;padding:12px;display:flex;gap:14px;align-items:center}
.rp-drows{flex:1;font-size:10.5px}
.rp-drow{display:flex;align-items:center;gap:6px;padding:3.5px 0;border-bottom:1px solid #f0f2f6}
.rp-drow i{width:9px;height:9px;border-radius:50%;display:inline-block}
.rp-drow b{margin-left:auto;font-size:11px}
`;
  document.head.appendChild(st);
}

/* ================= small building blocks ================= */
const secTitle=t=>`<div class="rp-sec">${t}</div>`;
const insight=t=>t?`<div class="rp-ins"><b>◆ Analyst Insight</b><p>${t}</p></div>`:'';
const legend=()=>`<div class="rp-leg"><span><i style="background:${C.home}"></i>${esc(TN('home'))}</span>`
  +`<span><i style="background:${C.away}"></i>${esc(TN('away'))}</span></div>`;
const pill=(no,team)=>`<span class="rp-pill" style="background:${TC(team)}">${esc(no)}</span>`;
const BALL=`<svg width="13" height="13" viewBox="0 0 20 20" style="vertical-align:-2px"><circle cx="10" cy="10" r="9" fill="#fff" stroke="#333" stroke-width="1.6"/><polygon points="10,5.5 13.8,8.3 12.4,12.8 7.6,12.8 6.2,8.3" fill="#333"/></svg>`;

/* comparison bars — home fill anchors right (grows toward centre), away anchors left */
function cmpRows(rowsArr){
  return rowsArr.map(([lbl,hv,av])=>{
    const hn=numOf(hv), an=numOf(av), mx=Math.max(hn,an)||1;
    return `<div class="rp-cmprow"><span class="rp-cv" style="color:${C.home}">${hv}</span>`
      +`<span class="rp-track"><span class="rp-fill rp-fh" style="width:${(hn/mx*100).toFixed(1)}%;background:${C.home}"></span></span>`
      +`<span class="rp-cl">${lbl}</span>`
      +`<span class="rp-track"><span class="rp-fill" style="width:${(an/mx*100).toFixed(1)}%;background:${C.away}"></span></span>`
      +`<span class="rp-cv" style="color:${C.away};text-align:left">${av}</span></div>`;
  }).join('');
}
/* values for one TEAM_SECTIONS section index */
function sectionRows(si){
  const h=sumTeam(rows,'home'), a=sumTeam(rows,'away');
  return TEAM_SECTIONS[si][1].map(([label,fn])=>[label,fn(h,a),fn(a,h)]);
}

/* ---- report pitches (literal colours, striped grass like the reference) ---- */
function hPitchSVG(inner){
  const d=PITCH_DIMS.football, W=d.w, H=d.h;
  let g='';
  for(let i=0;i<7;i++)g+=`<rect x="${(i*W/7).toFixed(1)}" y="0" width="${(W/7).toFixed(1)}" height="${H}" fill="${i%2?'#2a733f':'#2e7d46'}"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block;border-radius:6px">${g}`
    +`<g fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="3">${pitchFootball(W,H,false)}</g>`
    +dirArrowSVG('right')+(inner||'')+'</svg>';
}
function vPitchSVG(){
  const d=PITCH_DIMS.football, W=d.h, H=d.w;   // vertical: 680 wide x 1050 tall
  let g='';
  for(let i=0;i<7;i++)g+=`<rect x="0" y="${(i*H/7).toFixed(1)}" width="${W}" height="${(H/7).toFixed(1)}" fill="${i%2?'#2a733f':'#2e7d46'}"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block;border-radius:6px">${g}`
    +`<g transform="translate(0 ${H}) rotate(-90)"><g fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="4">${pitchFootball(H,W,false)}</g></g></svg>`;
}
/* both-halves normalisation: flip events from a half where the team attacked left */
function normXY(team){
  const dir={1:attackDir(team,1),2:attackDir(team,2)};
  return r=>{
    const flip=dir[eventHalf(r)]==='left';
    const f=p=>p?{x:flip?100-p.x:p.x, y:flip?100-p.y:p.y}:null;
    return {a:f(r.pXY), b:f(r.rXY)};
  };
}

/* ---- formation string from XI board coords (canonical = attacking per lu.dir) ---- */
function formationOf(xi,dir){
  if(!xi||xi.length<3)return '';
  const gi=xi.findIndex(p=>p.pos==='GK');
  let xs=xi.map(p=>dir==='rl'?100-p.x:p.x);
  if(gi>=0)xs=xs.filter((_,i)=>i!==gi).sort((a,b)=>a-b);   // tagged keeper dropped
  else xs=xs.sort((a,b)=>a-b).slice(1);                    // otherwise deepest = GK
  const lines=[]; let cur=[xs[0]];
  for(let i=1;i<xs.length;i++){
    const mean=cur.reduce((s,v)=>s+v,0)/cur.length;
    if(xs[i]-cur[cur.length-1]>8&&xs[i]-mean>11){lines.push(cur);cur=[xs[i]];}
    else cur.push(xs[i]);
  }
  lines.push(cur);
  return lines.map(l=>l.length).join('-');
}
/* formation periods: starting XI + every lineups.history snapshot of this team */
function teamPeriods(team){
  const lu=lineups[team]; if(!lu||!lu.xi||!lu.xi.length)return [];
  const dir=lu.dir||'lr';
  const hist=(lineups.history||[]).filter(h=>h.team===team&&h.xi&&h.xi.length).sort((a,b)=>a.t-b.t);
  const ps=[{t:0,xi:lu.xi},...hist.map(h=>({t:matchTime(h.t),xi:h.xi}))];
  const evEnd=rows.filter(r=>r.t!=null).map(r=>matchTime(r.t));
  const end=Math.max((+dur.halfLen||45)*120, ...(evEnd.length?evEnd:[0]));
  return ps.map((p,i)=>({start:p.t, end:i+1<ps.length?ps[i+1].t:end, xi:p.xi, dir,
                         f:formationOf(p.xi,dir)}));
}

/* ================= PAGE 1 — header + match timeline ================= */
function headerBlock(){
  const fH=formationOf((lineups.home||{}).xi,(lineups.home||{}).dir||'lr');
  const fA=formationOf((lineups.away||{}).xi,(lineups.away||{}).dir||'rl');
  return `<div style="text-align:center;font-size:12px;color:${C.mut};letter-spacing:0.4px;margin:4px 0 24px">Performance Analysis · Full Match Report</div>`
    +`<div style="display:flex;align-items:center;justify-content:center;gap:24px;margin-bottom:12px">`
    +`<span style="flex:1;text-align:right;font-size:23px;font-weight:800;color:${C.home}">${esc(meta.home)}</span>`
    +`<span style="flex:none;font-size:42px;font-weight:800;color:${C.ink}">${teamGoals('home')} <span style="color:${C.grey};font-weight:400">–</span> ${teamGoals('away')}</span>`
    +`<span style="flex:1;text-align:left;font-size:23px;font-weight:800;color:${C.away}">${esc(meta.away)}</span></div>`
    +`<div style="text-align:center;font-size:11.5px;color:${C.mut};margin-bottom:18px">`
    +`Home (Blue)${fH?' '+fH:''} · Away (Amber)${fA?' '+fA:''}</div>`;
}
function timelineEvents(){
  const evs=[], yc={};
  const sorted=rows.filter(r=>r.t!=null).slice().sort((a,b)=>a.t-b.t);
  const assists=sorted.filter(r=>r.event==='assist');
  // a penalty followed by the same player's goal collapses into one "Goal #n (Penalty)" row
  const pens=sorted.filter(r=>r.event==='penalty kick');
  const mergedPens=new Set(), penGoals=new Set();
  sorted.forEach(r=>{
    if(r.event!=='goal')return;
    const pen=pens.find(p=>!mergedPens.has(p)&&p.team===r.team
      &&String(p.playerFrom||'').trim()===String(r.playerFrom||'').trim()
      &&Math.abs(p.t-r.t)<=60);
    if(pen){mergedPens.add(pen);penGoals.add(r);}
  });
  sorted.forEach(r=>{
    const sec=matchTime(r.t), no=esc(String(r.playerFrom||'').trim()), team=r.team;
    const push=(kind,html)=>evs.push({sec,team,kind,html});
    if(r.event==='goal'){
      let as=assists.find(x=>x.team===team&&x.grp!=null&&x.grp===r.grp);
      if(!as)as=assists.filter(x=>x.team===team&&Math.abs(x.t-r.t)<=45)
        .sort((x,y)=>Math.abs(x.t-r.t)-Math.abs(y.t-r.t))[0];
      const an=as?String(as.playerFrom||'').trim():'';
      const tags=[];
      if(penGoals.has(r))tags.push('Penalty');
      if(an)tags.push('A #'+esc(an));
      push('goal',`Goal #${no}${tags.length?` <span style="color:${C.mut};font-weight:600;font-size:10px">(${tags.join(' · ')})</span>`:''}`);
    }
    else if(r.event==='own goal'||r.event==='own-goal')push('og',`Own Goal #${no}`);
    else if(r.event==='penalty kick'){if(!mergedPens.has(r))push('pen',`Penalty #${no}`);}
    else if(r.event==='yellow card'){
      const k=team+'#'+no; yc[k]=(yc[k]||0)+1;
      if(yc[k]===2)push('y2',`2nd Yellow → Red #${no}`); else push('yc',`Yellow #${no}`);
    }
    else if(r.event==='red card')push('rc',`Red #${no}`);
  });
  ['home','away'].forEach(team=>{
    (((lineups[team]||{}).subHistory)||[]).forEach(s=>
      evs.push({sec:matchTime(s.t),team,kind:'sub',html:`Sub #${esc(s.in)} ⟵ #${esc(s.out)}`}));
  });
  return evs.sort((a,b)=>a.sec-b.sec);
}
function tlIcon(e){
  if(e.kind==='goal')return BALL;
  if(e.kind==='og')return `<span class="rp-badge" style="background:${C.red}">OG</span>`;
  if(e.kind==='pen')return `<span class="rp-badge" style="background:#c47f17">P</span>`;
  if(e.kind==='sub')return `<span class="rp-badge" style="background:#e8862f;font-size:11px">⇄</span>`;
  if(e.kind==='yc')return `<span class="rp-cardi" style="background:#f5c518"></span>`;
  if(e.kind==='rc')return `<span class="rp-cardi" style="background:${C.red}"></span>`;
  return `<span class="rp-cardi" style="background:#f5c518"></span><span class="rp-cardi" style="background:${C.red};margin-left:-4px"></span>`;
}
function tlRow(e){
  const item=`${tlIcon(e)}<span style="color:${TC(e.team)}">${e.html}</span>`;
  return `<div class="rp-tlrow"><div class="rp-tlh">${e.team==='home'?item:''}</div>`
    +`<span class="rp-pillt">${minLbl(e.sec)}</span>`
    +`<div class="rp-tla">${e.team==='away'?item:''}</div></div>`;
}
function timelinePages(){
  const evs=timelineEvents(), chunks=[];
  if(evs.length){chunks.push(evs.slice(0,26)); for(let i=26;i<evs.length;i+=34)chunks.push(evs.slice(i,i+34));}
  else chunks.push(null);
  return chunks.map((ch,ci)=>
    (ci===0?headerBlock():'')
    +secTitle('Match Timeline'+(ci?' (continued)':''))
    +legend()
    +(ch?`<div>${ch.map(tlRow).join('')}</div>`
        :`<div class="rp-note" style="text-align:center;padding:26px 0;font-size:11px">No goals, cards or substitutions tagged yet.</div>`));
}

/* ================= lineups & formation pages ================= */
function fmCard(p,team){
  const dots=p.xi.map(q=>{
    let x=+q.x, y=+q.y; if(p.dir==='rl'){x=100-x;y=100-y;}      // normalise to attacking RIGHT
    const left=y, top=100-x;                                     // rotate 90° CCW → attacking UP
    return `<div class="rp-fdot" style="left:${left.toFixed(1)}%;top:${top.toFixed(1)}%;background:${TC(team)}">${esc(q.no)}</div>`;
  }).join('');
  return `<div class="rp-fcard"><div class="rp-fttl"><b>${mmss(p.start)}–${mmss(p.end)}</b> · ${p.f||'—'}</div>`
    +`<div class="rp-fpitch">${vPitchSVG()}${dots}</div></div>`;
}
function formationPages(team){
  const ps=teamPeriods(team), pages=[];
  const side=team==='home'?'Home':'Away';
  if(!ps.length)return [secTitle(`Lineups &amp; Formation — ${esc(TN(team))} (${side})`)
    +`<div class="rp-note" style="font-size:11px">No starting lineup set for this team (see Player lists).</div>`];
  for(let i=0;i<ps.length;i+=6){
    let b=secTitle(`Lineups &amp; Formation — ${esc(TN(team))} (${side})${i?' — cont.':''}`);
    b+=`<div class="rp-sub" style="color:${TC(team)}">${esc(TN(team))}${ps[0].f?' — '+ps[0].f:''}</div>`;
    b+=`<div class="rp-fgrid">${ps.slice(i,i+6).map(p=>fmCard(p,team)).join('')}</div>`;
    b+=`<div class="rp-note">Pitch shown vertically, team attacking upward. One card per formation period (start – end of the period in match time).</div>`;
    pages.push(b);
  }
  return pages;
}

/* ================= attacking ================= */
function donutCard(team){
  const s=sumTeam(rows,team), total=s.totalShots;
  const goals=s.goals, onNon=Math.max(0,s.shotsOn-s.goals), off=s.shotsOff+s.shotsBlocked;
  const cx=70,cy=70,rr=52,thick=22; let a=-Math.PI/2, ring=`<circle cx="${cx}" cy="${cy}" r="${rr}" fill="none" stroke="#d9dde3" stroke-width="${thick}"/>`;
  if(total)[[goals,C.gold],[onNon,C.green],[off,C.grey]].forEach(([val,col])=>{
    if(val<=0)return;
    const a1=a+val/total*2*Math.PI;
    ring+=val>=total?`<circle cx="${cx}" cy="${cy}" r="${rr}" fill="none" stroke="${col}" stroke-width="${thick}"/>`
      :`<path d="${arcPath(cx,cy,rr,a,a1)}" fill="none" stroke="${col}" stroke-width="${thick}"/>`;
    a=a1;
  });
  const svg=`<svg viewBox="0 0 140 140" width="132" height="132">${ring}`
    +`<text x="${cx}" y="${cy-4}" text-anchor="middle" font-size="11" fill="${C.mut}">Goals</text>`
    +`<text x="${cx}" y="${cy+22}" text-anchor="middle" font-size="27" font-weight="800" fill="${C.ink}">${goals}</text></svg>`;
  const row=(dot,lbl,val)=>`<div class="rp-drow">${dot?`<i style="background:${dot}"></i>`:''}<span>${lbl}</span><b>${val}</b></div>`;
  return `<div class="rp-dcard">${svg}<div class="rp-drows">`
    +`<div style="font-size:12.5px;font-weight:800;color:${TC(team)};margin-bottom:4px">${esc(TN(team))}</div>`
    +row('','Total Shots',total)
    +row(C.gold,'Goals',goals)
    +row(C.green,'On Target',`${pc0(s.shotsOn,total)} <span style="color:${C.mut};font-weight:400">${frac(s.shotsOn,total)}</span>`)
    +row(C.grey,'Off Target / Blocked',frac(off,total))
    +'</div></div>';
}
function attInsight(){
  const h=sumTeam(rows,'home'), a=sumTeam(rows,'away');
  const conv=s=>s.totalShots?Math.round(s.goals/s.totalShots*100):0;
  let t=`${esc(TN('home'))} produced ${h.totalShots} shots (${pct(h.shotsOn,h.totalShots)} on target, ${conv(h)}% conversion) against ${esc(TN('away'))}'s ${a.totalShots} (${pct(a.shotsOn,a.totalShots)} on target, ${conv(a)}% conversion).`;
  const gh=teamGoals('home'), ga=teamGoals('away');
  if(gh!==ga){
    const L=gh>ga?'home':'away', O=L==='home'?'away':'home';
    const ls=L==='home'?h:a, os=L==='home'?a:h;
    t+=os.totalShots>ls.totalShots
      ?` ${esc(TN(O))} generated more volume, but ${esc(TN(L))} converted at the higher rate — chance quality, not quantity, decided the scoreline.`
      :` ${esc(TN(L))} led on both volume and efficiency in front of goal.`;
  }else t+=' Neither side found a decisive edge in front of goal.';
  return t;
}
function attackingPage(){
  return secTitle('Attacking')
    +`<div class="rp-donuts">${donutCard('home')}${donutCard('away')}</div>`
    +legend()
    +`<div class="rp-cmphead">Attacking</div>`+cmpRows(sectionRows(0))
    +insight(attInsight());
}
/* shot maps — both halves on one pitch, normalised to attack RIGHT */
function shotMapsPage(){
  const kinds={'goal':C.gold,'shot on target':C.green,'shot off target':'#aeb4bc','blocked shot':'#aeb4bc'};
  let any=false;
  const teamMap=team=>{
    const N=normXY(team), d=PITCH_DIMS.football;
    const shots=rows.filter(r=>r.team===team&&kinds[r.event]&&r.pXY);
    if(!shots.length)return `<div class="rp-note" style="font-size:11px">No located shots for ${esc(TN(team))}.</div>`;
    any=true;
    const dots=shots.map(r=>{
      const p=N(r).a, x=p.x/100*d.w, y=p.y/100*d.h, col=kinds[r.event];
      const no=esc(String(r.playerFrom||'').trim());
      const shape=eventHalf(r)===1
        ?`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="14" fill="${col}" stroke="#fff" stroke-width="2.5"/>`
        :`<rect x="${(x-12).toFixed(1)}" y="${(y-12).toFixed(1)}" width="24" height="24" rx="4" fill="${col}" stroke="#fff" stroke-width="2.5"/>`;
      return `<g>${shape}<text x="${x.toFixed(1)}" y="${(y+5).toFixed(1)}" text-anchor="middle" font-size="14" font-weight="800" fill="#fff">${no}</text></g>`;
    }).join('');
    return `<div style="width:620px;margin:0 auto">${hPitchSVG(dots)}</div>`;
  };
  const card=team=>`<div class="rp-mapcard"><div class="rp-mtitle" style="color:${TC(team)}">${esc(TN(team))} · Shot Locations</div>${teamMap(team)}</div>`;
  const body=secTitle('Attacking — Shot Maps')+card('home')+card('away')
    +`<div class="rp-mleg"><span><i style="background:${C.gold}"></i>Goal</span><span><i style="background:${C.green}"></i>On target</span>`
    +`<span><i style="background:#aeb4bc"></i>Off target / blocked</span><span><i style="background:#fff;border:1.5px solid #98a0aa"></i>Circle = 1st half</span>`
    +`<span><i style="background:#fff;border:1.5px solid #98a0aa;border-radius:2px"></i>Square = 2nd half</span></div>`
    +`<div class="rp-note">Both halves are normalised so the team attacks to the right.</div>`;
  return any?body:null;
}

/* ================= player stat tables (chunked over pages) ================= */
function teamTable(team,headers,rowFor){
  const P=computeStats(rows,team), list=sortedPlayers(P);
  if(!list.length)return {rows:0,html:`<div class="rp-note" style="font-size:11px">No events for ${esc(TN(team))} yet.</div>`};
  const body=list.map(no=>`<tr><td>${pill(no,team)}</td>${rowFor(P[no],no,team).map(c=>`<td>${c}</td>`).join('')}</tr>`).join('');
  return {rows:list.length,
    html:`<div class="rp-sub" style="color:${TC(team)}">${esc(TN(team))}</div>`
      +`<table class="rpt"><thead><tr><th>No</th>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`};
}
function playerStatPages(title,headers,rowFor){
  const h=teamTable('home',headers,rowFor), a=teamTable('away',headers,rowFor);
  if(h.rows+a.rows<=30)
    return [secTitle(title)+h.html+'<div style="height:16px"></div>'+a.html];
  return [secTitle(title)+h.html, secTitle(title+' — cont.')+a.html];
}
function cardCounts(team){
  const out={};
  rows.forEach(r=>{
    if(r.team!==team)return;
    const no=String(r.playerFrom||'').trim(); if(!no)return;
    const o=out[no]=out[no]||{yc:0,rc:0};
    if(r.event==='yellow card')o.yc++; else if(r.event==='red card')o.rc++;
  });
  return out;
}
const attackingPlayerPages=()=>playerStatPages('Attacking — Player Stats',
  ['Goals','Assists','Shots','On Target','Off Target','Blocked','Shoot Acc','Offsides','Freekicks','Corners'],
  s=>[dotv(s.goals),dotv(s.assists),dotv(s.totalShots),dotv(s.shotsOn),dotv(s.shotsOff),dotv(s.shotsBlocked),
      pc0(s.shotsOn,s.totalShots),dotv(s.offsides),dotv(s.freeKicks),dotv(s.corners)]);
const distributionPlayerPages=()=>playerStatPages('Distribution — Player Stats',
  ['Passes','Pass Acc','Crosses','Cross Acc','Take-Ons','Step-ins'],
  s=>[frac(s.passesComp,s.passes),pc0(s.passesComp,s.passes),frac(s.crossesComp,s.crosses),
      pc0(s.crossesComp,s.crosses),frac(s.takeOnsWon,s.takeOns),dotv(s.stepIns)]);
function defensivePlayerPages(){
  const cards={home:cardCounts('home'),away:cardCounts('away')};
  return playerStatPages('Defensive — Player Stats',
    ['Tackles','Tackle %','Intercept','Clear','Blocks','Recover','Aerial','Ground','Fouls','Mistakes','YC','RC'],
    (s,no,team)=>{
      const c=cards[team][no]||{yc:0,rc:0};
      return [frac(s.tacklesWon,s.tackles),pc0(s.tacklesWon,s.tackles),dotv(s.interceptions),dotv(s.clearances),
        dotv(s.blocks),dotv(s.recoveries),frac(s.aerialDuelsWon,s.aerialDuels),frac(s.groundDuelsWon,s.groundDuels),
        dotv(s.fouls),dotv(s.mistakes),dotv(c.yc),dotv(c.rc)];
    });
}

/* ================= distribution ================= */
function distInsight(){
  const h=sumTeam(rows,'home'), a=sumTeam(rows,'away');
  if(!h.passes&&!a.passes)return '';
  const posH=h.passes+a.passes?h.passes/(h.passes+a.passes)*100:50;
  const L=posH>=50?'home':'away', O=L==='home'?'away':'home';
  const ls=L==='home'?h:a, os=L==='home'?a:h;
  let t=`${esc(TN(L))} dominated the ball (${pct(ls.passes,ls.passes+os.passes)} possession) with ${pct(ls.passesComp,ls.passes)} pass accuracy vs ${pct(os.passesComp,os.passes)}.`;
  if(ls.crosses||os.crosses)t+=` Wide play: ${ls.crosses} crosses to ${os.crosses}.`;
  t+=` ${esc(TN(O))}'s lower completion suggests longer, more contested passes under pressure.`;
  return t;
}
const distributionPage=()=>secTitle('Distribution')+legend()
  +`<div class="rp-cmphead">Distribution</div>`+cmpRows(sectionRows(1))+insight(distInsight());

/* pass-network map — nodes at average involvement, arrows = completed passes.
   `filter` restricts the passes (used for the 15-minute windows); `idSuffix`
   keeps SVG marker ids unique when several networks share one page. */
function netMapSVG(team,filter,idSuffix){
  const N=normXY(team), d=PITCH_DIMS.football, R=17;
  const passes=rows.filter(r=>r.team===team&&(r.event==='pass success'||r.event==='pass fail')&&(!filter||filter(r)));
  if(!passes.length)return null;
  const pos={};
  const addP=(p,pt)=>{p=String(p||'').trim(); if(!p||!pt)return; (pos[p]=pos[p]||[]).push(pt);};
  passes.forEach(r=>{
    const n=N(r);
    addP(r.playerFrom,n.a);
    if(r.event==='pass success')addP(r.playerTo,n.b);
  });
  const nodes={};
  Object.entries(pos).forEach(([p,a])=>{
    nodes[p]={x:a.reduce((s,v)=>s+v.x,0)/a.length/100*d.w, y:a.reduce((s,v)=>s+v.y,0)/a.length/100*d.h};
  });
  const edges={};
  passes.forEach(r=>{
    if(r.event!=='pass success')return;
    const f=String(r.playerFrom||'').trim(), t=String(r.playerTo||'').trim();
    if(!f||!t||f===t||!nodes[f]||!nodes[t])return;
    edges[f+'>'+t]=(edges[f+'>'+t]||0)+1;
  });
  const mk='rpNet'+team+(idSuffix||'');
  let seg='';
  Object.entries(edges).forEach(([k,n])=>{
    const [f,t]=k.split('>'), a=nodes[f], b=nodes[t];
    const dx=b.x-a.x, dy=b.y-a.y, dd=Math.hypot(dx,dy)||1, ux=dx/dd, uy=dy/dd;
    seg+=`<line x1="${(a.x+ux*R).toFixed(1)}" y1="${(a.y+uy*R).toFixed(1)}" x2="${(b.x-ux*(R+7)).toFixed(1)}" y2="${(b.y-uy*(R+7)).toFixed(1)}"`
      +` stroke="#f2f5f9" stroke-opacity="0.85" stroke-width="${Math.min(7,1.2+n*0.7).toFixed(1)}" marker-end="url(#${mk})"/>`;
  });
  const dots=Object.entries(nodes).map(([p,n])=>
    `<g><circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${R}" fill="${TC(team)}" stroke="rgba(255,255,255,0.92)" stroke-width="2.5"/>`
    +`<text x="${n.x.toFixed(1)}" y="${(n.y+5).toFixed(1)}" text-anchor="middle" font-size="15" font-weight="800" fill="#fff">${esc(p)}</text></g>`).join('');
  const defs=`<defs><marker id="${mk}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#f2f5f9"/></marker></defs>`;
  return defs+seg+dots;
}
function netMapsPage(){
  const h=netMapSVG('home'), a=netMapSVG('away');
  if(!h&&!a)return null;
  const card=(team,svg)=>`<div class="rp-mapcard"><div class="rp-mtitle" style="color:${TC(team)}">${esc(TN(team))} · Pass Network</div>`
    +(svg?`<div style="width:620px;margin:0 auto">${hPitchSVG(svg)}</div>`
         :`<div class="rp-note" style="font-size:11px">No passes for ${esc(TN(team))}.</div>`)+'</div>';
  return secTitle('Distribution — Pass Networks')+card('home',h)+card('away',a)
    +`<div class="rp-note">Nodes sit at each player's average pass-involvement position (both halves normalised to attack right); arrow thickness = completed passes along that link.</div>`;
}

/* pass networks per 15-minute window — same windows as the Stats-tab dropdown
   (pdWindows(): each half cut into 15' slices, the last slice of a half absorbs
   the remainder plus stoppage time). Two windows per page, one run per team. */
function winFilter(w,L){
  return r=>{
    if(r.t==null||eventHalf(r)!==w.half)return false;
    const ms=matchTime(r.t)-(w.half-1)*L*60;   // seconds inside this half
    return ms>=w.s*60&&(w.last||ms<w.e*60);
  };
}
function netWindowPages(team){
  const L=+dur.halfLen||45, wins=pdWindows();
  const isPass=r=>r.event==='pass success'||r.event==='pass fail';
  const all=rows.filter(r=>r.team===team&&isPass(r));
  if(!all.length)return [];
  const opp=team==='home'?'away':'home';
  const cards=wins.map((w,i)=>{
    const f=winFilter(w,L), winP=all.filter(f);
    let body;
    if(!winP.length)body=`<div class="rp-note" style="font-size:11px;padding:6px 0 16px">No passes in ${w.label}.</div>`;
    else{
      const suc=winP.filter(r=>r.event==='pass success').length;
      const oppWin=rows.filter(r=>r.team===opp&&isPass(r)&&f(r)).length;
      body=`<div style="width:620px;margin:0 auto">${hPitchSVG(netMapSVG(team,f,'w'+i)||'')}</div>`
        +`<div style="display:flex;justify-content:center;gap:38px;font-size:10px;color:${C.mut};margin-top:5px">`
        +`<span>Passes <b style="color:${C.ink}">${winP.length} / ${all.length}</b></span>`
        +`<span>Pass Accuracy <b style="color:${C.ink}">${pct(suc,winP.length)}</b></span>`
        +`<span>Possession <b style="color:${C.ink}">${pct(winP.length,winP.length+oppWin)}</b></span></div>`;
    }
    return `<div class="rp-mapcard"><div class="rp-mtitle" style="color:${TC(team)}">${esc(TN(team))} · Pass Network ${w.label}</div>${body}</div>`;
  });
  const pages=[];
  for(let i=0;i<cards.length;i+=2){
    pages.push(secTitle(`Distribution — Pass Networks by Interval — ${esc(TN(team))}${i?' (cont.)':''}`)
      +cards.slice(i,i+2).join('')
      +(i+2>=cards.length?`<div class="rp-note">15-minute windows within each half; the last window of a half absorbs the remainder plus stoppage time. Nodes sit at each player's average pass-involvement position in the window; arrow thickness = completed passes.</div>`:''));
  }
  return pages;
}

/* passing profile — per-player volume vs accuracy scatter, one panel per team */
function scatterPanel(team){
  const P=computeStats(rows,team), players=sortedPlayers(P).filter(n=>P[n].passes>0);
  if(!players.length)return `<div class="rp-note" style="font-size:11px">No passes for ${esc(TN(team))}.</div>`;
  const W=640,H=270,mL=14,mR=14,mT=14,mB=14, maxV=Math.max(...players.map(n=>P[n].passes));
  const X=acc=>mL+acc/100*(W-mL-mR), Y=v=>H-mB-(maxV?v/maxV:0)*(H-mT-mB);
  const pts=players.map(no=>({no, rr:9+(P[no].passes/maxV)*7, cx:X(P[no].passes?P[no].passesComp/P[no].passes*100:0), cy:Y(P[no].passes)}));
  for(let it=0;it<80;it++){                       // relax overlaps so every number stays readable
    let moved=false;
    for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++){
      const p=pts[i],q=pts[j];
      let dx=q.cx-p.cx, dy=q.cy-p.cy, dd=Math.hypot(dx,dy);
      const min=p.rr+q.rr+2;
      if(dd<min){if(!dd){dx=1;dy=0;dd=1;}
        const push=(min-dd)/2;
        p.cx-=dx/dd*push;p.cy-=dy/dd*push;q.cx+=dx/dd*push;q.cy+=dy/dd*push;moved=true;}
    }
    pts.forEach(p=>{p.cx=Math.max(mL+p.rr,Math.min(W-mR-p.rr,p.cx));p.cy=Math.max(mT+p.rr,Math.min(H-mB-p.rr,p.cy));});
    if(!moved)break;
  }
  let g=`<rect x="0.5" y="0.5" width="${W-1}" height="${H-1}" fill="#fdfdfe" stroke="${C.line}"/>`;
  g+=`<line x1="${X(50)}" y1="0" x2="${X(50)}" y2="${H}" stroke="${C.line}" stroke-dasharray="4 4"/>`;
  g+=`<line x1="0" y1="${H/2}" x2="${W}" y2="${H/2}" stroke="${C.line}" stroke-dasharray="4 4"/>`;
  g+=pts.map(p=>`<g><circle cx="${p.cx.toFixed(1)}" cy="${p.cy.toFixed(1)}" r="${p.rr.toFixed(1)}" fill="${TC(team)}" stroke="#fff" stroke-width="1.5"/>`
    +`<text x="${p.cx.toFixed(1)}" y="${(p.cy+3.5).toFixed(1)}" text-anchor="middle" font-size="9.5" font-weight="800" fill="#fff">${esc(p.no)}</text></g>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block">${g}</svg>`
    +`<div style="display:flex;justify-content:space-between;font-size:10px;color:${C.mut};padding:4px 2px 0">`
    +`<span>0%</span><span>Pass Accuracy →</span><span>100%</span></div>`;
}
function scatterInsight(){
  const top=team=>{
    const P=computeStats(rows,team), ps=sortedPlayers(P).filter(n=>P[n].passes>0);
    if(!ps.length)return null;
    const no=ps.reduce((b,n)=>P[n].passes>P[b].passes?n:b,ps[0]);
    return `#${esc(no)} leads ${esc(TN(team))} with ${P[no].passes} passes at ${pct(P[no].passesComp,P[no].passes)}`;
  };
  const th=top('home'), ta=top('away');
  return `Top-right = high volume + high accuracy (reliable circulators); isolated bottom-left dots are low-volume wide or substitute players.`
    +(th||ta?` ${[th,ta].filter(Boolean).join('; ')}.`:'')
    +` Use this to spot over-reliance on single nodes and players who break rhythm with low completion.`;
}
function scatterPage(){
  const card=team=>`<div class="rp-mapcard"><div class="rp-mtitle" style="color:${TC(team)}">${esc(TN(team))} · Passes by Volume &amp; Accuracy</div>${scatterPanel(team)}</div>`;
  return secTitle('Distribution — Passing Profile')+card('home')+card('away')+insight(scatterInsight());
}

/* pass heatmap matrix (From → To) — one page per team */
function matrixPage(team){
  const {players,mtx}=passMatrix(rows,team);
  let b=secTitle('Distribution — Pass Heatmap (From → To)')
    +`<div class="rp-sub" style="color:${TC(team)}">${esc(TN(team))}</div>`;
  if(!players.length)return b+`<div class="rp-note" style="font-size:11px">No completed passes for this team yet.</div>`;
  let max=0; players.forEach(f=>players.forEach(t=>{if(f!==t)max=Math.max(max,(mtx[f]&&mtx[f][t])||0);}));
  const shade=v=>v?`background:rgba(${TRGB(team)},${(0.10+0.55*v/(max||1)).toFixed(3)})`:'';
  let head=`<th style="min-width:52px">From \\ To</th>`+players.map(p=>`<th>${esc(p)}</th>`).join('')+'<th>Σ</th>';
  const colSum={}; let grand=0, body='';
  players.forEach(f=>{
    let rowSum=0, cells='';
    players.forEach(t=>{
      if(f===t){cells+=`<td style="color:#c9cfd9">–</td>`;return;}
      const v=(mtx[f]&&mtx[f][t])||0; rowSum+=v; colSum[t]=(colSum[t]||0)+v; grand+=v;
      cells+=`<td style="${shade(v)}">${v||'<span style="color:#c9cfd9">0</span>'}</td>`;
    });
    body+=`<tr><th>${esc(f)}</th>${cells}<td style="color:${C.navy};font-weight:800">${rowSum}</td></tr>`;
  });
  body+=`<tr><th>Σ recv</th>${players.map(p=>`<td style="color:${C.navy};font-weight:800">${colSum[p]||0}</td>`).join('')}<td></td></tr>`;
  // strongest link + busiest distributor for the insight line
  let bf='',bt='',bv=0; players.forEach(f=>players.forEach(t=>{const v=(mtx[f]&&mtx[f][t])||0; if(f!==t&&v>bv){bv=v;bf=f;bt=t;}}));
  let hub='',hv=-1; players.forEach(f=>{const s=players.reduce((sum,t)=>sum+(f!==t?((mtx[f]&&mtx[f][t])||0):0),0); if(s>hv){hv=s;hub=f;}});
  return b+`<table class="rpm"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
    +insight(`Darker cells = more completed passes along that lane. The strongest link is #${esc(bf)} → #${esc(bt)} (${bv} passes); `
      +`#${esc(hub)} is the busiest distributor (Σ ${hv}). High column totals mark the team's favourite outlets/receivers.`);
}

/* touch heatmaps — canvas drawn after the page is mounted (see buildPages) */
function heatPage(){
  const card=team=>{
    const pts=touchPoints(team);
    if(!pts.length)return `<div class="rp-mapcard"><div class="rp-mtitle" style="color:${TC(team)}">${esc(TN(team))} · Touch Heatmap</div>`
      +`<div class="rp-note" style="font-size:11px">No located events.</div></div>`;
    return `<div class="rp-mapcard"><div class="rp-mtitle" style="color:${TC(team)}">${esc(TN(team))} · Touch Heatmap`
      +` <span style="color:${C.mut};font-weight:400;font-size:10px">(${pts.length} located touches)</span></div>`
      +`<div style="position:relative;width:620px;margin:0 auto">${hPitchSVG('')}`
      +`<canvas class="rp-heat" data-team="${team}" width="1050" height="680" style="position:absolute;left:0;top:0;width:100%;height:100%"></canvas></div></div>`;
  };
  return secTitle('Distribution — Touch Heatmaps')+card('home')+card('away')
    +`<div class="rp-mleg"><span>Low</span><span style="width:130px;height:10px;border-radius:5px;display:inline-block;`
    +`background:linear-gradient(90deg,rgba(0,60,255,0.55),#00c8ff,#39ff54,#ffe12b,#ff2b1e)"></span><span>High</span></div>`
    +`<div class="rp-note">Every located event of the team (both halves normalised so the team attacks right).</div>`;
}

/* pass-type breakdown (distance / direction / area) — reuses passTypeData() from the Stats page */
function passTypesPage(){
  const card=team=>{
    const D=passTypeData(team);
    if(!D.tot)return `<div style="flex:1"><div class="rp-mtitle" style="color:${TC(team)}">${esc(TN(team))}</div>`
      +`<div class="rp-note" style="font-size:11px">No passes yet.</div></div>`;
    const rate=(n,d)=>d?(Math.round(n/d*1000)/10).toFixed(1)+'%':'–';
    const section=(title,cat)=>{
      const base=Object.values(cat).reduce((s,v)=>s+v[1],0);
      return `<tr><th colspan="4" style="text-align:left">${title}</th></tr>`
        +Object.entries(cat).map(([lbl,[s,n]])=>
          `<tr><td style="text-align:left;font-weight:700;color:${TC(team)}">${lbl}</td><td>${frac(s,n)}</td><td>${rate(s,n)}</td><td>${rate(n,base)}</td></tr>`).join('');
    };
    return `<div style="flex:1"><div class="rp-mtitle" style="color:${TC(team)}">${esc(TN(team))}`
      +` <span style="color:${C.mut};font-weight:400;font-size:10px">${D.suc}/${D.tot} · ${rate(D.suc,D.tot)}</span></div>`
      +`<table class="rpt" style="font-size:9.5px"><thead><tr><th style="text-align:left">Passes</th><th>Made</th><th>Success</th><th>Ratio</th></tr></thead>`
      +`<tbody>${section('Pass Distance',D.catD)}${section('Pass Direction',D.catG)}${section('Area',D.catA)}</tbody></table></div>`;
  };
  return secTitle('Distribution — Pass Types')
    +`<div style="display:flex;gap:18px">${card('home')}${card('away')}</div>`
    +`<div class="rp-note">Distance in real pitch metres (105×68): short &lt;15m, medium 15–30m, long &gt;30m. Direction relative to the attack: forward within ±45°, backward beyond ±135°. Area = origin third of the pitch. Passes without the needed tagged locations are skipped in the affected section.</div>`;
}

/* cross maps — origin→target arrows + zone-ratio bands, one pitch per team */
function crossMapSVG(team){
  const N=normXY(team), d=PITCH_DIMS.football, PW=d.w, PH=d.h, mT=76, mR2=150, W=PW+mR2, H=PH+mT;
  const evs=rows.filter(r=>r.team===team&&(r.event==='cross success'||r.event==='cross fail')&&r.pXY);
  if(!evs.length)return null;
  const cr=evs.map(r=>{const n=N(r); return {a:{x:n.a.x/100*PW,y:n.a.y/100*PH}, b:n.b?{x:n.b.x/100*PW,y:n.b.y/100*PH}:null, ok:r.event==='cross success'};});
  const oCnt=[0,0,0]; cr.forEach(c=>oCnt[Math.min(2,Math.floor(c.a.x/PW*3))]++);
  const tgt=cr.filter(c=>c.b), tCnt=[0,0,0]; tgt.forEach(c=>tCnt[Math.min(2,Math.floor(c.b.y/PH*3))]++);
  const pctL=(n,dd)=>dd?(Math.round(n/dd*1000)/10)+'%':'–';
  let over='';
  for(let i=0;i<3;i++)over+=`<text x="${((i+0.5)*PW/3).toFixed(0)}" y="42" text-anchor="middle" font-size="30" font-weight="700" fill="${TC(team)}">${pctL(oCnt[i],cr.length)}</text>`;
  [1,2].forEach(i=>over+=`<line x1="${i*PW/3}" y1="10" x2="${i*PW/3}" y2="${mT-16}" stroke="${C.line}" stroke-width="2"/>`);
  for(let i=0;i<3;i++)over+=`<text x="${PW+mR2/2}" y="${(mT+(i+0.5)*PH/3+10).toFixed(0)}" text-anchor="middle" font-size="30" font-weight="700" fill="${TC(team)}">${pctL(tCnt[i],tgt.length)}</text>`;
  [1,2].forEach(i=>over+=`<line x1="${PW+18}" y1="${mT+i*PH/3}" x2="${W-18}" y2="${mT+i*PH/3}" stroke="${C.line}" stroke-width="2"/>`);
  const okId='rpCmOk'+team, noId='rpCmNo'+team;
  const seg=cr.map(c=>{
    const col=c.ok?'#39d98a':'#f7506b';
    let s=`<circle cx="${c.a.x.toFixed(1)}" cy="${c.a.y.toFixed(1)}" r="9" fill="${col}" stroke="#fff" stroke-width="1.5"/>`;
    if(c.b)s+=`<line x1="${c.a.x.toFixed(1)}" y1="${c.a.y.toFixed(1)}" x2="${c.b.x.toFixed(1)}" y2="${c.b.y.toFixed(1)}"`
      +` stroke="${col}" stroke-width="4" stroke-dasharray="9 8" marker-end="url(#${c.ok?okId:noId})" opacity="0.9"/>`;
    return s;
  }).join('');
  const defs=`<defs><marker id="${okId}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#39d98a"/></marker>`
    +`<marker id="${noId}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#f7506b"/></marker></defs>`;
  let grass=''; for(let i=0;i<7;i++)grass+=`<rect x="${(i*PW/7).toFixed(1)}" y="0" width="${(PW/7).toFixed(1)}" height="${PH}" fill="${i%2?'#2a733f':'#2e7d46'}"/>`;
  const pitch=`<g transform="translate(0 ${mT})">${grass}`
    +`<g fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="3">${pitchFootball(PW,PH,false)}</g>${dirArrowSVG('right')}${seg}</g>`;
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block">${defs}${over}${pitch}</svg>`;
}
function crossMapsPage(){
  const h=crossMapSVG('home'), a=crossMapSVG('away');
  if(!h&&!a)return null;
  const card=(team,svg)=>`<div class="rp-mapcard"><div class="rp-mtitle" style="color:${TC(team)}">${esc(TN(team))} · Cross Map</div>`
    +(svg?`<div style="width:660px;margin:0 auto">${svg}</div>`
         :`<div class="rp-note" style="font-size:11px">No crosses for ${esc(TN(team))}.</div>`)+'</div>';
  return secTitle('Distribution — Cross Maps')+card('home',h)+card('away',a)
    +`<div class="rp-mleg"><span><i style="background:#39d98a"></i>Cross success</span><span><i style="background:#f7506b"></i>Cross fail</span></div>`
    +`<div class="rp-note">Top band: share of crosses by origin third of the pitch length. Right band: share of located cross targets by height third. Both halves normalised to attack right.</div>`;
}

/* ================= defensive ================= */
function defInsight(){
  const h=sumTeam(rows,'home'), a=sumTeam(rows,'away');
  const wl=(h.recoveries+h.clearances)>=(a.recoveries+a.clearances)?'home':'away', ol=wl==='home'?'away':'home';
  const ws=wl==='home'?h:a, os=wl==='home'?a:h;
  let t=`${esc(TN(wl))} did more defensive work out of possession — ${ws.recoveries} recoveries and ${ws.clearances} clearances vs ${os.recoveries} / ${os.clearances}.`;
  if(h.tackles&&a.tackles)t+=` In the tackle: ${esc(TN('home'))} ${pct(h.tacklesWon,h.tackles)} success vs ${pct(a.tacklesWon,a.tackles)}.`;
  if(h.aerialDuels||a.aerialDuels)t+=` Aerial duels won: ${h.aerialDuelsWon} – ${a.aerialDuelsWon}.`;
  return t;
}
const defensivePage=()=>secTitle('Defensive')+legend()
  +`<div class="rp-cmphead">Defensive</div>`+cmpRows(sectionRows(2))+insight(defInsight());

/* defensive action maps — one page per action type, mirroring the Stats-tab
   dropdown (DEF_CATS from the Stats page: Tackles, Interceptions, Clearances,
   Blocks, Recoveries, Ground Duels, Aerial Duels). Categories with no located
   event on either side are skipped. */
function defCategoryPages(){
  const pages=[];
  Object.values(DEF_CATS).forEach(cat=>{
    const col={}; cat.parts.forEach(([ev,,c])=>col[ev]=c);
    const acts=team=>rows.filter(r=>r.team===team&&col[r.event]&&r.pXY);
    const hA=acts('home'), aA=acts('away');
    if(!hA.length&&!aA.length)return;
    const card=(team,list)=>{
      let inner;
      if(!list.length)inner=`<div class="rp-note" style="font-size:11px">No located ${cat.label.toLowerCase()} for ${esc(TN(team))}.</div>`;
      else{
        const N=normXY(team), d=PITCH_DIMS.football;
        const dots=list.map(r=>{
          const p=N(r).a, x=p.x/100*d.w, y=p.y/100*d.h;
          return `<g><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="12" fill="${col[r.event]}" fill-opacity="0.92" stroke="#fff" stroke-width="2"/>`
            +`<text x="${x.toFixed(1)}" y="${(y+4.5).toFixed(1)}" text-anchor="middle" font-size="13" font-weight="800" fill="#fff">${esc(String(r.playerFrom||'').trim())}</text></g>`;
        }).join('');
        inner=`<div style="width:620px;margin:0 auto">${hPitchSVG(dots)}</div>`;
      }
      return `<div class="rp-mapcard"><div class="rp-mtitle" style="color:${TC(team)}">${esc(TN(team))} · ${cat.label}</div>${inner}</div>`;
    };
    const legend=cat.parts.map(([,lbl,c])=>`<span><i style="background:${c}"></i>${lbl}</span>`).join('');
    pages.push(secTitle(`Defensive — ${cat.label}`)+card('home',hA)+card('away',aA)
      +`<div class="rp-mleg">${legend}</div>`
      +`<div class="rp-note">Both halves normalised so the team attacks right (own goal on the left).</div>`);
  });
  return pages;
}

/* defensive profile radar — min-max normalised against the higher of the two teams */
function radarPage(){
  const axes=[['Tackles Won','tacklesWon'],['Interceptions','interceptions'],['Recoveries','recoveries'],
    ['Clearances','clearances'],['Blocks','blocks'],['Aerial Won','aerialDuelsWon'],['Ground Won','groundDuelsWon']];
  const h=sumTeam(rows,'home'), a=sumTeam(rows,'away');
  const W=694,H=560,cx=W/2,cy=290,R=185,Nn=axes.length;   // full content width so edge labels never clip
  const ang=i=>-Math.PI/2+i*2*Math.PI/Nn;
  const pt=(i,f)=>[cx+R*f*Math.cos(ang(i)),cy+R*f*Math.sin(ang(i))];
  let g='';
  for(let k=1;k<=4;k++){
    const p=axes.map((_,i)=>pt(i,k/4).map(v=>v.toFixed(1)).join(',')).join(' ');
    g+=`<polygon points="${p}" fill="${k===4?'#f2f4f8':'none'}" stroke="#d7dde6" stroke-width="1"/>`;
  }
  axes.forEach((_,i)=>{const [x,y]=pt(i,1);g+=`<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#d7dde6" stroke-dasharray="4 4"/>`;});
  const poly=(s,rgb)=>{
    const p=axes.map(([,k],i)=>{
      const mx=Math.max(h[k],a[k]);
      return pt(i,mx?Math.max(0.04,s[k]/mx):0.04).map(v=>v.toFixed(1)).join(',');
    }).join(' ');
    return `<polygon points="${p}" fill="rgba(${rgb},0.28)" stroke="rgb(${rgb})" stroke-width="2.5"/>`
      +axes.map(([,k],i)=>{const mx=Math.max(h[k],a[k]);const [x,y]=pt(i,mx?Math.max(0.04,s[k]/mx):0.04);
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="rgb(${rgb})"/>`;}).join('');
  };
  g+=poly(a,C.awayRGB)+poly(h,C.homeRGB);
  axes.forEach(([lbl,k],i)=>{
    const [x,y]=pt(i,1), lx=cx+(R+38)*Math.cos(ang(i)), ly=cy+(R+38)*Math.sin(ang(i));
    const anch=Math.abs(Math.cos(ang(i)))<0.3?'middle':(Math.cos(ang(i))>0?'start':'end');
    g+=`<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anch}" font-size="13" font-weight="800" fill="${C.ink}">${lbl}</text>`
      +`<text x="${lx.toFixed(1)}" y="${(ly+15).toFixed(1)}" text-anchor="${anch}" font-size="10.5" fill="${C.mut}">${h[k]} · ${a[k]}</text>`;
  });
  // each side's strongest axes (largest normalised lead) for the insight line
  const lead=s=>{const o=s===h?a:h;
    return axes.map(([lbl,k])=>({lbl,d:(s[k]-o[k])/Math.max(1,Math.max(h[k],a[k]))}))
      .sort((x,y)=>y.d-x.d).filter(x=>x.d>0).slice(0,2).map(x=>x.lbl.toLowerCase());};
  const lh=lead(h), la=lead(a);
  let ins='The radar exposes each side\'s defensive identity.';
  if(lh.length)ins+=` ${esc(TN('home'))} pulls toward ${lh.join(' and ')}.`;
  if(la.length)ins+=` ${esc(TN('away'))} stretches the shape toward ${la.join(' and ')}.`;
  return secTitle('Defensive — Profile Radar')+legend()
    +`<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block;margin:0 auto">${g}</svg>`
    +`<div class="rp-note" style="text-align:center">Each axis is min-max normalised against the higher of the two teams (outer ring = match-high). Raw values shown beside each axis as Home · Away.</div>`
    +insight(ins);
}

/* foul maps — halves normalised, card halos, hatched own defensive third */
const RP_FOULS=new Set(['foul','foul throw','handball foul']);
function foulMapsPage(){
  let any=false;
  const card=team=>{
    const N=normXY(team), d=PITCH_DIMS.football, PW=d.w, PH=d.h, mT=76, mR2=150, W=PW+mR2, H=PH+mT;
    const evs=rows.filter(r=>r.team===team&&RP_FOULS.has(r.event)&&r.pXY);
    let inner;
    if(!evs.length)inner=`<div class="rp-note" style="font-size:11px">No located fouls for ${esc(TN(team))}.</div>`;
    else{
      any=true;
      const cards=rows.filter(r=>r.team===team&&(r.event==='yellow card'||r.event==='red card')&&r.t!=null);
      const cardFor=f=>{let best=null,bd=90;
        cards.forEach(c=>{
          if(String(c.playerFrom||'').trim()!==String(f.playerFrom||'').trim())return;
          const dd=Math.abs(c.t-f.t); if(dd<=bd){bd=dd;best=c.event;}
        });
        return best;};
      const fl=evs.map(r=>{const p=N(r).a;
        return {x:p.x/100*PW, y:p.y/100*PH, half:eventHalf(r), no:esc(String(r.playerFrom||'').trim()), card:cardFor(r)};});
      const oCnt=[0,0,0]; fl.forEach(f=>oCnt[Math.min(2,Math.floor(f.x/PW*3))]++);
      const tCnt=[0,0,0]; fl.forEach(f=>tCnt[Math.min(2,Math.floor(f.y/PH*3))]++);
      const pctL=n=>(Math.round(n/fl.length*1000)/10)+'%';
      let over='';
      for(let i=0;i<3;i++)over+=`<text x="${((i+0.5)*PW/3).toFixed(0)}" y="42" text-anchor="middle" font-size="30" font-weight="700" fill="${TC(team)}">${pctL(oCnt[i])}</text>`;
      [1,2].forEach(i=>over+=`<line x1="${i*PW/3}" y1="10" x2="${i*PW/3}" y2="${mT-16}" stroke="${C.line}" stroke-width="2"/>`);
      for(let i=0;i<3;i++)over+=`<text x="${PW+mR2/2}" y="${(mT+(i+0.5)*PH/3+10).toFixed(0)}" text-anchor="middle" font-size="30" font-weight="700" fill="${TC(team)}">${pctL(tCnt[i])}</text>`;
      [1,2].forEach(i=>over+=`<line x1="${PW+18}" y1="${mT+i*PH/3}" x2="${W-18}" y2="${mT+i*PH/3}" stroke="${C.line}" stroke-width="2"/>`);
      const patId='rpDng'+team;
      const defs=`<defs><pattern id="${patId}" width="26" height="26" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">`
        +`<rect width="26" height="26" fill="rgba(247,80,107,0.10)"/><rect width="13" height="26" fill="rgba(247,80,107,0.26)"/></pattern></defs>`;
      const dots=fl.map(f=>{
        const ring=f.card?`stroke="${f.card==='red card'?C.red:'#f5c518'}" stroke-width="5"`:'stroke="#fff" stroke-width="2"';
        const shape=f.half===1
          ?`<circle cx="${f.x.toFixed(1)}" cy="${f.y.toFixed(1)}" r="12" fill="${TC(team)}" fill-opacity="0.92" ${ring}/>`
          :`<rect x="${(f.x-11).toFixed(1)}" y="${(f.y-11).toFixed(1)}" width="22" height="22" rx="3" fill="${TC(team)}" fill-opacity="0.92" ${ring}/>`;
        return `<g>${shape}<text x="${f.x.toFixed(1)}" y="${(f.y+4.5).toFixed(1)}" text-anchor="middle" font-size="13" font-weight="800" fill="#fff">${f.no}</text></g>`;
      }).join('');
      let grass=''; for(let i=0;i<7;i++)grass+=`<rect x="${(i*PW/7).toFixed(1)}" y="0" width="${(PW/7).toFixed(1)}" height="${PH}" fill="${i%2?'#2a733f':'#2e7d46'}"/>`;
      const pitch=`<g transform="translate(0 ${mT})">${grass}<rect width="${PW/3}" height="${PH}" fill="url(#${patId})"/>`
        +`<g fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="3">${pitchFootball(PW,PH,false)}</g>${dirArrowSVG('right')}${dots}</g>`;
      inner=`<div style="width:660px;margin:0 auto"><svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block">${defs}${over}${pitch}</svg></div>`;
    }
    return `<div class="rp-mapcard"><div class="rp-mtitle" style="color:${TC(team)}">${esc(TN(team))} · Foul Map</div>${inner}</div>`;
  };
  const body=secTitle('Discipline — Foul Maps')+card('home')+card('away')
    +`<div class="rp-mleg"><span><i style="background:#98a0aa"></i>Circle = 1st half</span><span><i style="background:#98a0aa;border-radius:2px"></i>Square = 2nd half</span>`
    +`<span><i style="background:repeating-linear-gradient(45deg,rgba(247,80,107,0.45) 0 4px,rgba(247,80,107,0.12) 4px 8px);border-radius:2px"></i>Dangerous zone (own third)</span>`
    +`<span><i style="background:#98a0aa;box-shadow:0 0 0 2.5px #f5c518"></i>Led to yellow</span><span><i style="background:#98a0aa;box-shadow:0 0 0 2.5px ${C.red}"></i>Led to red</span></div>`;
  return any?body:null;
}

/* ================= goalkeeper + discipline ================= */
function gkNo(team){
  const lu=lineups[team]; if(!lu||!lu.xi||!lu.xi.length)return null;
  const gk=lu.xi.find(p=>p.pos==='GK'); if(gk)return gk.no;
  const dir=lu.dir||'lr';
  return lu.xi.reduce((b,p)=>{const x=dir==='rl'?100-p.x:p.x; return (!b||x<b.x)?{no:p.no,x}:b;},null).no;
}
function gkPage(){
  const h=sumTeam(rows,'home'), a=sumTeam(rows,'away');
  const gcH=teamGoals('away'), gcA=teamGoals('home');
  const rateH=h.saves+gcH?Math.round(h.saves/(h.saves+gcH)*100):0;
  const rateA=a.saves+gcA?Math.round(a.saves/(a.saves+gcA)*100):0;
  const card=(team,s,gc,rate)=>{
    const no=gkNo(team);
    const big=(v,l)=>`<div style="flex:1;text-align:center"><div style="font-size:26px;font-weight:800;color:${C.navy}">${v}</div><div style="font-size:10px;color:${C.mut}">${l}</div></div>`;
    return `<div style="flex:1;border:1px solid ${C.line};border-radius:8px;padding:14px;text-align:center">`
      +`<div style="font-size:13px;font-weight:800;color:${TC(team)};margin-bottom:6px">${esc(TN(team))}</div>`
      +(no!=null?`<div style="margin-bottom:10px"><span class="rp-pill" style="background:${TC(team)}">GK #${esc(no)}</span></div>`:'')
      +`<div style="display:flex">${big(s.saves,'Saves')}${big(gc,'Goals Conceded')}${big(rate+'%','Save Rate')}</div></div>`;
  };
  let ins=`${esc(TN('home'))}'s keeper made ${h.saves} save${h.saves===1?'':'s'} and conceded ${gcH}; ${esc(TN('away'))}'s made ${a.saves} and conceded ${gcA}.`;
  if(rateH!==rateA){
    const L=rateH>rateA?'home':'away';
    ins+=` The ${rateH>rateA?rateH:rateA}% save rate favours ${esc(TN(L))} — the other keeper's number reflects the volume and quality of chances faced rather than pure shot-stopping.`;
  }
  return secTitle('Goalkeeper &amp; Discipline')+legend()
    +`<div class="rp-cmphead">Goalkeeper — Comparison</div>`
    +cmpRows([['Saves',h.saves,a.saves],['Goals Conceded',gcH,gcA],['Save Rate',rateH+'%',rateA+'%']])
    +`<div style="display:flex;gap:14px;margin-top:8px">${card('home',h,gcH,rateH)}${card('away',a,gcA,rateA)}</div>`
    +insight(ins)
    +`<div class="rp-cmphead">Discipline &amp; Set Pieces</div>`+cmpRows(sectionRows(3).filter(([l])=>l!=='Goals Conceded'&&l!=='Saves'));
}

/* ================= assembly + export ================= */
function buildPages(host){
  ensureCss();
  const list=[
    ...timelinePages(),
    ...formationPages('home'),
    ...formationPages('away'),
    attackingPage(),
    shotMapsPage(),
    ...attackingPlayerPages(),
    distributionPage(),
    netMapsPage(),
    ...netWindowPages('home'),
    ...netWindowPages('away'),
    scatterPage(),
    matrixPage('home'),
    matrixPage('away'),
    heatPage(),
    passTypesPage(),
    crossMapsPage(),
    ...distributionPlayerPages(),
    defensivePage(),
    ...defCategoryPages(),
    radarPage(),
    ...defensivePlayerPages(),
    foulMapsPage(),
    gkPage()
  ].filter(Boolean);
  const els=list.map(html=>{
    const d=document.createElement('div');
    d.className='rp-page'; d.innerHTML=html;
    host.appendChild(d);
    return d;
  });
  // heatmap canvases can only be painted once they are in the DOM
  host.querySelectorAll('canvas.rp-heat').forEach(cv=>drawHeat(touchPoints(cv.dataset.team),cv));
  return els;
}

let exporting=false;   // silent re-entry guard — the button keeps its normal look while the export runs
async function exportPdf(){
  if(exporting)return;
  if(!rows.length){alert('No data yet.');return;}
  exporting=true;
  const host=document.createElement('div');
  host.style.cssText='position:fixed;left:-9999px;top:0;width:794px;background:#fff;z-index:-1';
  try{
    await ensureLibs();
    document.body.appendChild(host);
    const pages=buildPages(host);
    const pdf=new window.jspdf.jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
    for(let i=0;i<pages.length;i++){
      const cv=await window.html2canvas(pages[i],{scale:2,backgroundColor:'#ffffff',logging:false});
      if(i)pdf.addPage();
      pdf.addImage(cv.toDataURL('image/jpeg',0.92),'JPEG',0,0,210,297);
    }
    pdf.save(matchName().replace(/[^\w-]+/g,'_')+'_Match_Report.pdf');
  }catch(e){
    console.error('PDF export failed:',e);
    alert('PDF export failed: '+((e&&e.message)||e));
  }finally{
    host.remove();
    exporting=false;
  }
}

$('expPdf').onclick=exportPdf;
window.PTReport={buildPages,exportPdf};   // exposed for testing/debugging
})();
