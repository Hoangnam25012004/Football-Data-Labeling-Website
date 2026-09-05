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

/* ---- where the four values come from now ----
   rows / meta / lineups / dur used to be globals on the Stats page, and the
   seventy-one uses below read them straight. They live inside PTStats now, so
   they are declared here and refreshed by sync() the moment an export starts.
   Every helper below is an arrow function closing over these bindings, so it
   sees the current match without any of those uses changing. */
let rows=[], meta={home:'Home',away:'Away'},
    lineups={home:{roster:[],xi:[],subs:[]},away:{roster:[],xi:[],subs:[]}},
    dur={enabled:false,halfLen:45,h1Start:0,h1End:0,h2Start:0,h2End:0};

/* ...and the twelve helpers this file CALLS but does not define — the minute a
   video time falls in, which half an event is in, the score, the attacking
   direction and the five drawing helpers the Stats tab already had. They were
   globals for the same reason the four values above were, and went the same
   way when the page became a module: a ⭳ PDF click threw "matchTime is not
   defined" and no page was built. Declared here and bound by sync() from
   PTStats.helpers, so the ninety-odd call sites below still read as bare
   names and none of them changed. */
let matchTime, eventHalf, teamGoals, attackDir, dirArrowSVG, arcPath,
    touchPoints, drawHeat, passTypeData, pdWindows, matchName, DEF_CATS;
const HELPER_NAMES=['matchTime','eventHalf','teamGoals','attackDir','dirArrowSVG',
  'arcPath','touchPoints','drawHeat','passTypeData','pdWindows','matchName','DEF_CATS'];

function sync(){
  const S=window.PTStats;
  const d=S&&S.data&&S.data();
  if(!d)return false;
  rows=d.rows||[]; meta=d.meta||meta; lineups=d.lineups||lineups; dur=d.dur||dur;
  /* A stats-view.js older than this file has no helpers to give — a stale copy
     out of the browser cache is exactly how that happens. Say which names are
     missing rather than letting the first call site fail as "not a function". */
  const h=S.helpers||{};
  const gone=HELPER_NAMES.filter(n=>h[n]==null);
  if(gone.length)throw new Error('the Stats view is out of date — reload the page ('
    +gone.join(', ')+' missing)');
  ({matchTime,eventHalf,teamGoals,attackDir,dirArrowSVG,arcPath,
    touchPoints,drawHeat,passTypeData,pdWindows,matchName,DEF_CATS}=h);
  return true;
}

/* ---- palette: literal colours only — report pages are light-themed and must
   not inherit the app's dark CSS variables ----
   Two entries per team rather than one. The saturated colour fills a bar, a dot,
   a pitch marker; the darker `Ink` one is what that team's NAME is set in. Amber
   at 11px on white is a legibility problem the fill colour cannot solve, and a
   fill dark enough to read as text is no longer recognisably amber — so the two
   jobs were given two colours instead of one compromise. */
const C={
  navy:'#12385c', ink:'#111c2b', mut:'#77839a',
  line:'#e2e8f1', hair:'#eef2f8', panel:'#f7f9fc', band:'#edf3fa',
  home:'#1e63d6', away:'#e0920b',               // home blue / away amber (reference report)
  homeInk:'#1a56b8', awayInk:'#96650a',         // the same two, set as text
  homeRGB:'30,99,214', awayRGB:'224,146,11',
  green:'#17924f', red:'#d93a3f', grey:'#98a0ac', gold:'#e8a817',
  grassA:'#1d6a41', grassB:'#217549',
  /* Black or white — whichever of the two reads on this swatch. A shot's number is
     drawn on gold, on green and on grey; a shirt number on either team's colour, and
     on the won/lost pair of every defensive category. One ink for all of them left
     half of them barely legible at the size these are printed. */
  on(hex){
    if(typeof hex!=='string'||hex.length!==7||hex[0]!=='#')return '#ffffff';
    const v=i=>Math.pow(parseInt(hex.substr(i,2),16)/255,2.2);
    return 0.2126*v(1)+0.7152*v(3)+0.0722*v(5)>0.32?'#152233':'#ffffff';
  }
};
/* Every report page is set in this, not in the app's font: the pages are printed
   through html2canvas, so whatever the browser resolves here is what the PDF gets. */
const FONT='"Segoe UI",Roboto,"Helvetica Neue",Helvetica,Arial,sans-serif';
const TC=t=>t==='home'?C.home:C.away;
/* the same team as TEXT — see the note on C */
const TI=t=>t==='home'?C.homeInk:C.awayInk;
const TRGB=t=>t==='home'?C.homeRGB:C.awayRGB;
const TN=t=>t==='home'?meta.home:meta.away;
/* the line every page carries in its footer: who played, and how it finished */
const matchLine=()=>`${TN('home')} ${teamGoals('home')} – ${teamGoals('away')} ${TN('away')}`;
/* esc() lives in shared.js (loaded first) — both this file and the Stats page need it */
const mmss=s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`;
/* stoppage-time minutes are capped by the half: 45:52 in the 1st half is 45+1',
   95:30 in the 2nd is 90+6' (never 46' / 96') */
const minLbl=(sec,half)=>{const L=+dur.halfLen||45, m=Math.floor(sec/60)+1, cap=(half||2)*L;
  return m>cap?`${cap}+${m-cap}'`:`${m}'`;};
const dotv=v=>v?v:'<span style="color:#bfc8d5">·</span>';
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
  font-family:${FONT};color:${C.ink};position:relative;overflow:hidden;line-height:1.35;
  font-variant-numeric:tabular-nums}
/* ---- page furniture ----------------------------------------------------
   The running foot sits INSIDE the page's bottom padding, absolutely placed:
   the row counts that decide where a table breaks (FIRST/CONT, the timeline
   chunks, the contents budget) are all measured against the flow box, so a
   footer that took height out of it would silently clip the last row of a
   full page — .rp-page is overflow:hidden. Out of flow, it costs nothing. */
.rp-foot{position:absolute;left:50px;right:50px;bottom:16px;display:flex;align-items:center;
  justify-content:space-between;gap:12px;border-top:1px solid ${C.line};padding-top:7px;
  font-size:8px;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;color:${C.mut}}
.rp-footm{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rp-footp{flex:none;color:${C.navy};letter-spacing:0.6px}
.rp-footp em{font-style:normal;font-weight:600;color:${C.mut}}
/* ---- page header: the site's mark, what this document is, what this page is ----
   A full-bleed band pulled up into the page's top padding, for the same reason the
   running foot sits in the bottom one: every row budget in this file (CMP_FILL, the
   contents budget, the shot list's FIRST/CONT, the timeline chunks) is measured
   against the flow box, and a header taking height out of it would move all of them
   at once. Out of that box it costs nothing — measured, it GIVES 31px back: the flow
   used to start at y=96 under .rp-sec and starts at y=65 under this. Every existing
   page therefore has more room than before, never less. */
.rp-head{display:flex;align-items:center;gap:11px;background:${C.panel};
  border-bottom:2px solid ${C.line};margin:-46px -50px 16px;padding:11px 50px 10px;
  box-sizing:border-box}
/* the site red, written out: report pages must not inherit the app's CSS variables */
.rp-logo{flex:none;width:28px;height:28px;border-radius:5px;background:#e03131;
  display:flex;align-items:center;justify-content:center}
.rp-logo svg{display:block}
.rp-htxt{flex:1;min-width:0;display:block}
.rp-hkick{display:block;font-size:8px;font-weight:700;letter-spacing:1.3px;
  text-transform:uppercase;color:${C.mut};line-height:1.15}
.rp-htitle{display:block;font-size:16px;font-weight:800;color:${C.navy};
  letter-spacing:-0.3px;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rp-hteam{flex:none;display:flex;align-items:center;gap:8px;font-size:12px;
  font-weight:800;max-width:250px}
.rp-hteam em{font-style:normal;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rp-hchip{flex:none;width:9px;height:24px;border-radius:3px}
/* ---- section head: an accent bar, the title, and the rule under both ----
   No call site left since the page header above took the job. Kept because the
   suite lifts secTitle out and runs it, and because a stylesheet is the cheapest
   place in this file to leave a rule that costs nothing. */
.rp-sec{display:flex;align-items:center;gap:11px;border-bottom:3px solid ${C.navy};
  padding-bottom:9px;margin-bottom:15px}
.rp-secbar{flex:none;width:5px;height:23px;border-radius:3px;
  background:linear-gradient(180deg,${C.home} 0 50%,${C.away} 50% 100%)}
.rp-sect{flex:1;min-width:0;font-size:19.5px;font-weight:800;color:${C.navy};
  letter-spacing:-0.3px;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rp-sub{font-size:12px;font-weight:800;letter-spacing:1.1px;text-transform:uppercase;margin:6px 0 8px}
.rp-note{font-size:9.5px;color:${C.mut};margin-top:10px}
/* ---- page 1 masthead --------------------------------------------------- */
.rp-mast{display:flex;align-items:center;gap:20px;background:${C.panel};border:1px solid ${C.line};
  border-radius:12px;padding:20px 26px;margin:2px 0 22px}
.rp-mastt{flex:1;min-width:0;font-size:21px;font-weight:800;letter-spacing:-0.3px;line-height:1.25;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rp-mastt u{display:block;height:3px;border-radius:2px;margin-top:7px;text-decoration:none}
.rp-masts{flex:none;font-size:40px;font-weight:800;color:${C.ink};letter-spacing:-1px;line-height:1}
.rp-mastd{color:${C.grey};font-weight:400;padding:0 2px}
/* the fixture under the masthead — pulled up so the two read as one block, and
   absent altogether on a report whose payload never carried any of the five */
/* the fixture, centred under the masthead. Every line WRAPS rather than ellipsing —
   "FIFA World Cup qualification – CONCACAF Second Round" is a real competition name, and
   cutting it here would be the same fault the player tables were fixed for. */
.rp-fix{text-align:center;margin:-4px 0 24px}
.rp-fixl{font-size:13px;font-weight:800;color:${C.navy};line-height:1.35;
  max-width:560px;margin:0 auto}
.rp-fixr{font-size:11.5px;font-weight:700;color:#3d4a5c;line-height:1.4;margin-top:3px}
.rp-fixm{font-size:10px;font-weight:400;color:${C.mut};line-height:1.5}
.rp-fixr+.rp-fixm,.rp-fixl+.rp-fixm{margin-top:7px}
/* ---- contents ---------------------------------------------------------- */
.rp-toch{font-size:26px;font-weight:800;color:${C.navy};letter-spacing:-0.3px;
  border-bottom:3px solid ${C.navy};padding-bottom:10px;margin:4px 0 20px}
.rp-tocrow{display:flex;align-items:flex-end;gap:9px}
.rp-toc1{font-size:12px;font-weight:800;color:${C.navy};letter-spacing:0.5px;text-transform:uppercase;padding:9px 0 5px;
  border-top:1px solid ${C.line}}
.rp-toc2{font-size:10.5px;font-weight:400;color:#5d6a80;padding:3.5px 0 3.5px 22px}
.rp-tocttl{flex:none;max-width:540px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* the leader is a bottom border lifted off the baseline by a margin rather than by
   a transform — html2canvas is what turns these pages into the PDF, and a margin is
   the one of the two it redraws exactly */
.rp-tocgap{flex:1;min-width:14px;border-bottom:1px solid ${C.line};margin-bottom:4px}
.rp-toc1 .rp-tocgap{border-bottom-color:${C.hair}}
.rp-toc2 .rp-tocgap{border-bottom-style:dotted}
.rp-tocpg{flex:none;min-width:22px;text-align:right;font-weight:800}
.rp-toc2 .rp-tocpg{font-weight:600;color:${C.mut}}
/* ---- legends ----------------------------------------------------------- */
.rp-leg{display:flex;justify-content:center;flex-wrap:wrap;gap:8px;margin:0 0 13px}
.rp-leg span{display:inline-flex;align-items:center;gap:7px;background:${C.panel};
  border:1px solid ${C.line};border-radius:20px;padding:4px 12px;font-size:10px;font-weight:700;color:#3d4a5c}
.rp-leg i{width:10px;height:10px;border-radius:50%;display:inline-block;flex:none}
/* ---- team comparison --------------------------------------------------- */
.rp-cmphead{display:flex;align-items:center;gap:9px;background:${C.band};color:${C.navy};
  font-size:9.5px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;
  padding:7px 13px;border-left:4px solid ${C.navy};border-radius:0 5px 5px 0;margin:14px 0 10px}
/* A flex column of bands. Spacing a comparison page out by pushing the rows apart
   left nine bars floating on a white field with nothing holding them together; each
   row is a band of its own height instead, ruled off from the next, so the block
   still reads as one table however much of the page it has to cover. */
.rp-cmpbody{display:flex;flex-direction:column}
.rp-cmprow{display:flex;align-items:center;gap:11px;border-bottom:1px solid ${C.hair}}
.rp-cmpbody .rp-cmprow:last-child{border-bottom:none}
.rp-cv{flex:none;width:58px;font-size:15px;font-weight:800;text-align:right;letter-spacing:-0.4px}
.rp-cl{flex:none;width:158px;text-align:center;font-size:10px;font-weight:700;color:#4c596c;
  letter-spacing:0.9px;text-transform:uppercase}
.rp-track{flex:1;height:16px;background:${C.hair};border-radius:99px;position:relative;overflow:hidden}
.rp-fill{position:absolute;top:0;left:0;height:100%;border-radius:99px}
.rp-fill.rp-fh{left:auto;right:0}
/* ---- tables ------------------------------------------------------------ */
table.rpt{width:100%;border-collapse:collapse;font-size:10.5px}
/* A header is a label, not a paragraph — white-space:nowrap.
   table.rpt is auto-layout at width:100%, so when the columns want more than the 694px
   flow box the browser takes the shortfall out of whichever labels have the most text
   per column, and those wrap. On the widest table — Defensive, 16 columns — the sums
   were: the labels need 674px on one line each, but td.rp-pl asked 96px for the name
   column where its label wanted 40.7px, so 729.5px was wanted and 35.5px was missing.
   It came out of exactly two labels: "Tackle %" (50.8px wanted, 43.7px given) and
   "T-on Con" (53.5px wanted, 35.9px given). Both wrapped, and a wrapped label centred
   in a two-line head reads as a title that has been cut off.
   nowrap makes the whole label the column's minimum; the 2px trimmed off each cell and
   the 16px off the name column is where the room comes from. Measured after: <thead>
   35.3px -> 24.6px, table still exactly 694px, zero horizontal overflow. */
.rpt th{background:${C.navy};color:#fff;font-weight:700;font-size:8.5px;letter-spacing:0.15px;
  line-height:1.25;text-transform:uppercase;padding:7px 3px;text-align:center;white-space:nowrap}
.rpt th:first-child{border-radius:5px 0 0 0}
.rpt th:last-child{border-radius:0 5px 0 0}
.rpt td{padding:4.5px 3px;text-align:center;border-bottom:1px solid ${C.hair};color:#2b384a}
.rpt td.rp-pl{text-align:left;font-weight:600;color:${C.ink};max-width:80px;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap}
.rpt tbody tr:nth-child(even) td{background:${C.panel}}
.rp-rk .rpt td{padding:6px 5px}
.rp-rk-lg .rpt{font-size:11.5px}
.rp-rk-lg .rpt th{font-size:9.5px;padding:9px 5px}
.rp-rk-lg .rpt td{padding:11px 6px}
.rp-pill{display:inline-block;min-width:26px;padding:2px 7px;border-radius:11px;color:#fff;font-weight:800;font-size:10px;box-sizing:border-box}
table.rpt-el td{text-align:left}
.rpt-el th.el-c,.rpt-el td.el-c{text-align:center}
.rp-elidx{display:inline-block;min-width:18px;height:18px;line-height:18px;border-radius:50%;color:#152233;
  font-weight:800;font-size:10px;text-align:center;box-sizing:border-box}
table.rpm{border-collapse:collapse;font-size:10px;width:100%;margin:0 auto}
.rpm th{background:${C.navy};color:#fff;padding:7px 4px;min-width:24px;font-weight:700;font-size:9px;
  letter-spacing:0.4px}
.rpm td{border:1px solid ${C.hair};text-align:center;padding:6.5px 4px;font-weight:600;color:#2b384a}
/* ---- match timeline ---------------------------------------------------- */
.rp-tlwrap{position:relative;padding:2px 0}
.rp-tlspine{position:absolute;left:50%;top:10px;bottom:10px;width:2px;margin-left:-1px;background:${C.line}}
.rp-tlrow{display:flex;align-items:center;padding:3.5px 0;font-size:10.5px;position:relative}
.rp-tlh{flex:1;min-width:0;display:flex;justify-content:flex-end;align-items:center;padding-right:10px}
.rp-tla{flex:1;min-width:0;display:flex;justify-content:flex-start;align-items:center;padding-left:10px}
/* the event sits in a tinted card keyed to its side, so which team an entry
   belongs to is readable before the words are */
.rp-tlcard{display:inline-flex;align-items:center;gap:6px;min-width:0;max-width:100%;
  border:1px solid;border-radius:7px;padding:4px 8px;font-weight:700;box-sizing:border-box}
/* the label carries the player's name now, so it is the part that gives way on a long one */
.rp-tltxt{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rp-tlmin{flex:none;min-width:52px;box-sizing:border-box;text-align:center;background:${C.navy};color:#fff;
  border-radius:15px;border:3px solid #fff;padding:3px 8px;font-size:10px;font-weight:800;
  letter-spacing:0.2px;position:relative}
.rp-tlsc{flex:none;color:#fff;font-weight:800;font-size:9px;background:${C.navy};border-radius:9px;
  padding:2px 7px;letter-spacing:0.4px;white-space:nowrap}
.rp-tlsep{text-align:center;margin:9px 0;position:relative}
.rp-tlsep span{display:inline-block;background:${C.navy};color:#fff;border-radius:15px;
  padding:4px 18px;font-size:8.5px;font-weight:800;letter-spacing:1.6px;position:relative}
.rp-cardi{display:inline-block;width:10px;height:14px;border-radius:2px;border:1px solid rgba(0,0,0,0.2);vertical-align:-2px}
.rp-badge{display:inline-flex;width:16px;height:16px;border-radius:50%;color:#fff;font-size:8px;font-weight:800;align-items:center;justify-content:center;line-height:1}
/* ---- lineups & formation ----------------------------------------------- */
.rp-fgrid{display:flex;flex-wrap:wrap;gap:22px 14px;margin-top:8px}
.rp-fcard{width:calc(50% - 7px);box-sizing:border-box;border:1px solid ${C.line};border-radius:10px;
  padding:12px 9px 14px;text-align:center;background:${C.panel}}
.rp-fttl{font-size:9px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${C.mut};margin-bottom:9px}
.rp-fttl b{color:${C.navy};letter-spacing:0.6px}
.rp-fpitch{position:relative;width:240px;margin:0 auto}
.rp-fdot{position:absolute;transform:translate(-50%,-50%);width:22px;height:22px;border-radius:50%;
  display:flex;align-items:center;justify-content:center;color:#fff;font-size:9.5px;font-weight:800;
  border:2px solid rgba(255,255,255,0.92)}
/* ---- maps -------------------------------------------------------------- */
/* the end-on pitch on a page that carries two of them; capped so a long ranking
   under it still has room, and centred in its column */
.rp-vmap{width:100%;max-width:336px;margin:0 auto 2px}
.rp-vmap.rp-vmap-sm{max-width:298px}
.rp-mapcard{margin-bottom:12px}
.rp-mtitle{font-size:10px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;margin:0 0 8px}
/* which way a team is playing, said beside the map's title rather than across the
   middle of the pitch, where the actions themselves are */
.rp-mdir{float:right;font-weight:700;letter-spacing:0.6px;text-transform:none;color:${C.mut}}
.rp-mleg{display:flex;justify-content:center;flex-wrap:wrap;gap:7px;font-size:9px;color:#3d4a5c;margin-top:8px}
.rp-mleg span{display:inline-flex;align-items:center;background:${C.panel};border:1px solid ${C.line};
  border-radius:16px;padding:3px 9px;font-weight:600}
.rp-mleg i{width:9px;height:9px;border-radius:50%;display:inline-block;margin-right:5px;flex:none}
.rp-mleg i.rp-ring{width:13px;height:13px;border:3px solid;box-sizing:border-box}
/* ---- shots & goals ----------------------------------------------------- */
.rp-sgwrap{display:flex;gap:18px;align-items:flex-start}
.rp-sgleft{width:292px;flex:none}
.rp-sgright{flex:1;min-width:0}
/* the width rp-sgright resolves to beside the map — 794 page less 100 padding,
   less the 292 map column and the 18 gap — so an Event List that runs on to a
   page of its own is drawn at the size it had on the page it came from */
.rp-sgcont{width:384px;margin:0 auto}
.rp-goalmouth{margin:0 0 9px;background:${C.panel};border:1px solid ${C.line};border-radius:8px;padding:11px 10px 7px}
.rp-sgleg{justify-content:flex-start;gap:5px;font-size:8px;margin-top:8px}
.rp-sgleg span{padding:2.5px 7px}
.rp-sgleg i{width:7px;height:7px;margin-right:4px}
/* ---- the keeper's line, at the top of his two pages --------------------
   Not a .rpt: that one is a navy-headed grid of tallies, and this is one sentence about
   one man. A light rule and a wide letter-spaced head, like the reference report. */
.rp-gkrow{width:100%;border-collapse:collapse;font-size:11px;margin:0 0 15px}
.rp-gkrow th{font-size:8px;font-weight:700;letter-spacing:1px;text-transform:uppercase;
  color:${C.mut};padding:0 6px 7px;border-bottom:1px solid ${C.line};text-align:center;white-space:nowrap}
.rp-gkrow th.rp-gkl,.rp-gkrow td.rp-gkl{text-align:left}
.rp-gkrow td{padding:9px 6px;border-bottom:1px solid ${C.hair};text-align:center;
  font-weight:700;color:#2b384a}
.rp-gkrow td b{font-size:13px;font-weight:800;color:${C.navy}}
/* ---- the Details block on the Goalkeeper page -------------------------- */
.rp-gkbody2{display:flex;align-items:flex-start;gap:13px}
.rp-gkring{flex:none;text-align:center;padding-top:6px}
.rp-gkring div{font-size:8px;font-weight:700;letter-spacing:0.9px;text-transform:uppercase;
  color:${C.mut};margin-top:4px}
.rp-dtl{width:100%;border-collapse:collapse;font-size:10.5px}
.rp-dtl td{padding:6px 8px;border-bottom:1px solid ${C.hair};color:#2b384a}
.rp-dtl td:last-child{text-align:right;font-weight:800;color:${C.navy}}
.rp-dtl td.rp-dtlb{padding:0;width:3px;border-bottom:none}
.rp-dtl tr.rp-dtlt td{font-weight:800;color:${C.navy};border-bottom:1px solid ${C.line}}
/* ---- goalkeeper, discipline, donut ------------------------------------- */
.rp-duo{display:flex;gap:14px;margin-bottom:2px}
.rp-gkcard{flex:1;border:1px solid ${C.line};border-radius:10px;padding:13px 15px;background:${C.panel}}
.rp-gkteam{font-size:10px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:8px}
.rp-gkwho{display:flex;align-items:center;gap:7px;margin-bottom:11px}
.rp-gkname{font-size:11px;font-weight:700;color:#3d4a5c;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rp-gkbody{display:flex;align-items:center;gap:13px}
.rp-gkarc{flex:none;text-align:center}
.rp-gkarc svg{display:block;margin:0 auto}
.rp-gkarc div{font-size:8px;font-weight:700;letter-spacing:0.9px;text-transform:uppercase;color:${C.mut};margin-top:3px}
.rp-gkfig{flex:1;display:flex;gap:8px}
.rp-gkstat{flex:1}
.rp-gkstat b{display:block;font-size:19px;font-weight:800;color:${C.navy};line-height:1.15;letter-spacing:-0.5px}
.rp-gkstat span{font-size:8px;font-weight:700;letter-spacing:0.7px;text-transform:uppercase;color:${C.mut};display:block;line-height:1.3;margin-top:2px}
.rp-dcbox{flex:1;border:1px solid ${C.line};border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:9px;background:${C.panel}}
.rp-dcteam{flex:1;font-size:10px;font-weight:800;letter-spacing:1.1px;text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rp-dcv{display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:800;color:${C.navy}}
.rp-dcv em{font-style:normal;font-size:8px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:${C.mut}}
.rp-dcard{flex:1;border:1px solid ${C.line};border-radius:10px;padding:13px;display:flex;gap:14px;align-items:center;background:${C.panel}}
.rp-drows{flex:1;font-size:10.5px}
.rp-drow{display:flex;align-items:center;gap:7px;padding:4px 0;border-bottom:1px solid ${C.line}}
.rp-drow i{width:9px;height:9px;border-radius:50%;display:inline-block;flex:none}
.rp-drow b{margin-left:auto;font-size:11.5px;font-weight:800;color:${C.navy}}
`;
  document.head.appendChild(st);
}

/* ================= small building blocks ================= */
/* The title is written into the page in one piece, never split around a tag:
   the section a page belongs to is read back out of this markup (the contents
   page indexes on it, and the suite checks a page named the category it drew),
   so "Defensive — Tackles" has to survive as that exact run of characters.

   The site's mark and the words "Match Report" ride along with it, so EVERY page
   carries them without every builder having to remember to. The mark is the same
   four-dot N drawn in client/app.html and client/index.html, inlined rather than
   loaded: html2canvas turns these pages into the PDF from the DOM, and an <img>
   is one more request that can be slow, blocked or taint the canvas.

   It is written out here rather than lifted into a const of its own on purpose —
   tests/report-visuals.test.js lifts secTitle out by name and runs it against a
   sandbox holding a fixed list of helpers, and a name this expression reaches for
   that the list has not got is a ReferenceError at the first call site.

   `team` is optional. A page about ONE side names it on the right; a page about
   both passes nothing and every existing call site is unchanged. TI/TC are only
   evaluated on that branch, for the same sandbox reason. */
const secTitle=(t,team)=>`<div class="rp-head"><span class="rp-logo">`
  +`<svg width="16" height="16" viewBox="0 0 48 48" fill="#fff">`
  +`<path d="M13 39V11l22 28V11" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>`
  +`<circle cx="13" cy="39" r="5.4"/><circle cx="13" cy="11" r="5.4"/>`
  +`<circle cx="35" cy="39" r="5.4"/><circle cx="35" cy="11" r="5.4"/></svg></span>`
  +`<span class="rp-htxt"><span class="rp-hkick">Match Report</span>`
  +`<span class="rp-htitle">${t}</span></span>`
  +(team?`<span class="rp-hteam" style="color:${TI(team)}"><em>${esc(TN(team))}</em>`
        +`<i class="rp-hchip" style="background:${TC(team)}"></i></span>`:'')
  +`</div>`;
const legend=()=>`<div class="rp-leg"><span><i style="background:${C.home}"></i>${esc(TN('home'))}</span>`
  +`<span><i style="background:${C.away}"></i>${esc(TN('away'))}</span></div>`;
const pill=(no,team)=>`<span class="rp-pill" style="background:${TC(team)};color:${C.on(TC(team))}">${esc(no)}</span>`;
/* the goal marker is the ⚽ glyph rather than a drawn ball; line-height:1 keeps it
   on the row's centre line beside the label it sits with */
const BALL=`<span style="font-size:13px;line-height:1">⚽</span>`;

/* Comparison bars — home fill anchors right (grows toward centre), away anchors left.
   Each side gets its SHARE of the two values, exactly as the Stats tab's General view
   does: 2 goals each reads 50% / 50%. Scaling both against the larger value instead
   pinned whoever led at 100%, so every row the home side won looked maxed out and the
   two bars no longer said anything about how close the contest was. Nothing to compare
   (0 – 0) splits down the middle. */
/* Which side won the row is said by the bars, not by a word: the trailing fill is
   dropped to a third of its weight, so the eye lands on the leader first and the
   row can still be read for its two numbers. A tie leaves both at full strength.

   `fit` is the size the page has worked out for one of its rows — see cmpFit(). A
   block that is only part of a page (the Goalkeeper page's three) is drawn at the
   default and says nothing. */
function cmpRows(rowsArr,fit){
  const f=fit||{track:16,fs:15,row:30,lbl:10};
  const body=rowsArr.map(([lbl,hv,av])=>{
    const hn=numOf(hv), an=numOf(av), tot=hn+an, hp=tot?hn/tot*100:50;
    const barH=an>hn?';opacity:0.32':'', barA=hn>an?';opacity:0.32':'';
    const numH=an>hn?';opacity:0.72':'', numA=hn>an?';opacity:0.72':'';
    const tr=`class="rp-track" style="height:${f.track}px"`;
    const cv=`class="rp-cv" style="font-size:${f.fs}px`;
    const cl=`class="rp-cl" style="font-size:${f.lbl}px"`;
    return `<div class="rp-cmprow" style="min-height:${f.row}px"><span ${cv};color:${C.homeInk}${numH}">${hv}</span>`
      +`<span ${tr}><span class="rp-fill rp-fh" style="width:${hp.toFixed(1)}%;background:${C.home}${barH}"></span></span>`
      +`<span ${cl}>${lbl}</span>`
      +`<span ${tr}><span class="rp-fill" style="width:${(100-hp).toFixed(1)}%;background:${C.away}${barA}"></span></span>`
      +`<span ${cv};color:${C.awayInk};text-align:left${numA}">${av}</span></div>`;
  }).join('');
  return `<div class="rp-cmpbody">${body}</div>`;
}
/* How big one comparison row should be on a page that carries nothing else.
   The three sections are different lengths — nine rows under Attacking, ten under
   Distribution, thirteen under Defensive — and drawn at one fixed size the short
   ones stopped halfway down an A4 page while the long one filled it. Both the bar
   and the air around it come from how much page there is per row, bounded so the
   block can neither crowd nor drift apart. */
const CMP_FILL=840;   // the flow box less a section head, a legend, a section bar and slack
function cmpFit(n){
  const per=Math.min(96,CMP_FILL/Math.max(1,n));
  const track=Math.max(16,Math.min(24,Math.round(per*0.24)));
  const fs=Math.max(15,Math.min(20,Math.round(per*0.20)));
  return {track,fs,row:Math.round(per),lbl:Math.max(10,Math.min(13,Math.round(fs*0.66)))};
}
/* values for one TEAM_SECTIONS section index */
function sectionRows(si){
  const h=sumTeam(rows,'home'), a=sumTeam(rows,'away');
  return TEAM_SECTIONS[si][1].map(([label,fn])=>[label,fn(h,a),fn(a,h)]);
}

/* ---- report pitches (literal colours, striped grass like the reference) ----
   The turf was drawn out four times over — here twice, and again inside the cross
   and foul maps, which build their own SVG around a margin. One helper now, so the
   green is one decision rather than four that can drift apart. `across` stripes the
   short way, for a pitch drawn end-on. */
function grassSVG(W,H,across){
  let g='';
  for(let i=0;i<7;i++)g+=across
    ?`<rect x="0" y="${(i*H/7).toFixed(1)}" width="${W}" height="${(H/7).toFixed(1)}" fill="${i%2?C.grassA:C.grassB}"/>`
    :`<rect x="${(i*W/7).toFixed(1)}" y="0" width="${(W/7).toFixed(1)}" height="${H}" fill="${i%2?C.grassA:C.grassB}"/>`;
  /* a dark inset edge: printed small, a pitch with no frame bleeds into the white
     page and the touchline reads as the boundary it is not */
  return g+`<rect x="1.5" y="1.5" width="${(W-3).toFixed(1)}" height="${(H-3).toFixed(1)}" fill="none" stroke="rgba(0,0,0,0.22)" stroke-width="3"/>`;
}
function hPitchSVG(inner,dir){   // dir: attacking direction arrow, defaults to right
  const d=PITCH_DIMS.football, W=d.w, H=d.h;
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block;border-radius:7px">${grassSVG(W,H,false)}`
    +`<g fill="none" stroke="rgba(255,255,255,0.88)" stroke-width="3">${pitchFootball(W,H,false)}</g>`
    +dirArrowSVG(dir||'right')+(inner||'')+'</svg>';
}
function vPitchSVG(inner){   // `inner` is drawn in vertical coords, on top of the markings
  const d=PITCH_DIMS.football, W=d.h, H=d.w;   // vertical: 680 wide x 1050 tall
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block;border-radius:7px">${grassSVG(W,H,true)}`
    +`<g transform="translate(0 ${H}) rotate(-90)"><g fill="none" stroke="rgba(255,255,255,0.88)" stroke-width="4">${pitchFootball(H,W,false)}</g></g>`
    +(inner||'')+'</svg>';
}
// "Attacking ↑" marker for the vertical shot map
function vUpArrowSVG(){
  const d=PITCH_DIMS.football, W=d.h, H=d.w, cx=W/2;
  return `<g opacity="0.5" stroke="#fff" fill="none" stroke-width="7">`
    +`<line x1="${cx}" y1="${(H*0.72).toFixed(0)}" x2="${cx}" y2="${(H*0.55).toFixed(0)}"/>`
    +`<polyline points="${cx-17},${(H*0.588).toFixed(0)} ${cx},${(H*0.55).toFixed(0)} ${cx+17},${(H*0.588).toFixed(0)}"/></g>`
    +`<text x="${cx}" y="${(H*0.762).toFixed(0)}" text-anchor="middle" font-size="26" fill="#fff" opacity="0.6">Attacking</text>`;
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

/* formation periods: starting XI + every lineups.history snapshot of this team */
function teamPeriods(team){
  const lu=lineups[team]; if(!lu||!lu.xi||!lu.xi.length)return [];
  const dir=lu.dir||'lr';
  const hist=(lineups.history||[]).filter(h=>h.team===team&&h.xi&&h.xi.length).sort((a,b)=>a.t-b.t);
  const ps=[{t:0,xi:lu.xi},...hist.map(h=>({t:matchTime(h.t),xi:h.xi}))];
  const evEnd=rows.filter(r=>r.t!=null).map(r=>matchTime(r.t));
  const end=Math.max((+dur.halfLen||45)*120, ...(evEnd.length?evEnd:[0]));
  return ps.map((p,i)=>({start:p.t, end:i+1<ps.length?ps[i+1].t:end, xi:p.xi, dir}));
}

/* ================= PAGE 1 — header + match timeline ================= */
// Just the teams and the score. The shape of each side is the subject of its own
// "Lineups & Formation" page, so the formation summary that used to sit under the
// score is gone; the score block carries the spacing it used to add.
function headerBlock(){
  /* the score is one text run — "5 – 2" with its spaces intact — because that is
     how the suite reads the result back off the page */
  return `<div class="rp-mast">`
    +`<div class="rp-mastt" style="text-align:right;color:${C.homeInk}">${esc(meta.home)}`
    +`<u style="background:${C.home};margin-left:auto;width:54px"></u></div>`
    +`<div class="rp-masts">${teamGoals('home')} <span class="rp-mastd">–</span> ${teamGoals('away')}</div>`
    +`<div class="rp-mastt" style="text-align:left;color:${C.awayInk}">${esc(meta.away)}`
    +`<u style="background:${C.away};width:54px"></u></div></div>`;
}
/* ---- the fixture, as the channel has it on file ----
   A date is built from its parts rather than through toLocaleDateString(): the
   analyst's browser and the club's would otherwise put two different strings into
   two copies of the same report, and neither would be wrong. */
const RP_MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fixtureDate(v){
  const s=String(v==null?'':v).trim(); if(!s)return '';
  const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if(!m)return s;                       // whatever it is, print it rather than nothing
  const mo=+m[2];
  return (mo>=1&&mo<=12)?`${+m[3]} ${RP_MONTHS[mo-1]} ${m[1]}`:s;
}
/* Date · League · Season · Round · Venue. Every part is dropped when empty and the
   whole block when all five are, which is what a report published before these
   travelled in the payload prints: exactly what it printed before, nothing. They are
   not in the tagging app's local meta store either, so an analyst working a match
   that was never opened on the cloud sees no block — and that is honest, because
   that session genuinely does not know which league it was. */
/* Set as a centred stack, not as five labelled boxes. Five boxes gave every part the same
   weight and the same width, so a competition name three lines long sat in a cell the size
   of "2026/27", and each one needed its own caption to be read at all. Stacked, the reading
   order does the captioning: what the match was, then which round of it, then when and
   where. Any part that is missing simply is not a line. */
function fixtureBlock(){
  const v=x=>String(x==null?'':x).trim();
  const league=v(meta.league), season=v(meta.season), round=v(meta.round),
        date=fixtureDate(meta.date), venue=v(meta.venue);
  if(!(league||season||round||date||venue))return '';
  // the round is the line under the competition, the way the reference report sets it;
  // the season joins it there rather than taking a line of its own
  const mid=[round,season].filter(Boolean).join(' · ');
  return `<div class="rp-fix">`
    +(league?`<div class="rp-fixl">${esc(league)}</div>`:'')
    +(mid?`<div class="rp-fixr">${esc(mid)}</div>`:'')
    +(date?`<div class="rp-fixm">${esc(date)}</div>`:'')
    +(venue?`<div class="rp-fixm">${esc(venue)}</div>`:'')
    +`</div>`;
}
/* "#9 Bacuna" — the shirt number always, plus the registered name when Player lists has
   one for it. playerLabel() would fall back to "Player 9", which only repeats the number,
   so an unregistered shirt stays bare. */
const tlNames={};
function tlWho(team,no){
  const n=String(no==null?'':no).trim(); if(!n)return '';
  const names=tlNames[team]||(tlNames[team]=squadNames(lineups,team)||{});
  return `#${esc(n)}${names[n]?' '+esc(names[n]):''}`;
}
function timelineEvents(){
  const evs=[];
  // a 2nd yellow already reads as "2nd Yellow → Red"; classifyCards drops a redundant
  // explicit red for the same dismissal so it isn't listed twice
  const cardKind=classifyCards(rows);
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
  /* Who the timeline credits with the assist for a goal, as a shirt number.
     Normally the assist tagged in the goal's own chain entry, else the nearest one within
     45s. A converted penalty is different: under the Laws the assist belongs to the player
     who WON the spot-kick, and that is tagged at the foul ("7 #foul won #assist") — often a
     minute or more before the kick is taken, well outside the 45s window, so a penalty goal
     came out with no assist at all. For one, find the "foul won" that produced it and take
     the assist tagged alongside it.
     An assist is only ever one the tagger entered: a bare "foul won" with no #assist on it
     is NOT turned into one, however the penalty ends up. */
  const foulsWon=sorted.filter(r=>evKey(r.event)==='foul won');
  const PEN_ASSIST_BACK=180;   // how far back the foul that won the spot-kick may sit
  const penAssist=r=>{
    const fw=foulsWon.filter(x=>x.team===r.team&&x.t<=r.t&&r.t-x.t<=PEN_ASSIST_BACK)
      .sort((x,y)=>y.t-x.t)[0];
    if(!fw)return null;
    return assists.find(x=>x.team===fw.team&&x.grp!=null&&x.grp===fw.grp)
      ||assists.find(x=>x.team===fw.team&&Math.abs(x.t-fw.t)<=3)
      ||null;
  };
  sorted.forEach(r=>{
    const sec=matchTime(r.t), team=r.team, half=eventHalf(r), who=tlWho(team,r.playerFrom);
    const push=(kind,html)=>evs.push({sec,team,kind,half,html});
    if(r.event==='goal'){
      const isPen=penGoals.has(r);
      let as=assists.find(x=>x.team===team&&x.grp!=null&&x.grp===r.grp);
      if(!as&&isPen)as=penAssist(r);
      if(!as)as=assists.filter(x=>x.team===team&&Math.abs(x.t-r.t)<=45)
        .sort((x,y)=>Math.abs(x.t-r.t)-Math.abs(y.t-r.t))[0];
      // the taker cannot assist himself — a penalty tagged "20 #penalty kick #assist #goal"
      // would otherwise read "Goal #20 (Penalty · A #20)"
      if(as&&String(as.playerFrom||'').trim()===String(r.playerFrom||'').trim())as=null;
      const an=as?tlWho(team,as.playerFrom):'';
      const tags=[];
      if(isPen)tags.push('Penalty');
      if(an)tags.push('A '+an);
      push('goal',`Goal ${who}${tags.length?` <span style="color:${C.mut};font-weight:600;font-size:10px">(${tags.join(' · ')})</span>`:''}`);
    }
    else if(r.event==='own goal'||r.event==='own-goal')push('og',`Own Goal ${who}`);
    else if(r.event==='yellow card')
      push(cardKind.get(r),cardKind.get(r)==='y2'?`2nd Yellow → Red ${who}`:`Yellow Card ${who}`);
    else if(r.event==='red card'){ if(cardKind.get(r)==='rc')push('rc',`Red Card ${who}`); }
    // substitutions are intentionally left off the report timeline
  });
  // half first, then time: first-half stoppage (45+X') overlaps the opening
  // second-half minutes in match seconds, so a plain sec sort put 46' before 45+1'
  return evs.sort((a,b)=>a.half-b.half||a.sec-b.sec);
}
function tlIcon(e){
  if(e.kind==='goal')return BALL;
  if(e.kind==='og')return `<span class="rp-badge" style="background:${C.red}">OG</span>`;
  if(e.kind==='yc')return `<span class="rp-cardi" style="background:#f5c518"></span>`;
  if(e.kind==='rc')return `<span class="rp-cardi" style="background:${C.red}"></span>`;
  return `<span class="rp-cardi" style="background:#f5c518"></span><span class="rp-cardi" style="background:${C.red};margin-left:-4px"></span>`;
}
function tlRow(e,score){
  const item=`<span class="rp-tlcard" style="border-color:rgba(${TRGB(e.team)},0.45);background:rgba(${TRGB(e.team)},0.08)">`
    +`${tlIcon(e)}<span class="rp-tltxt" style="color:${TI(e.team)}">${e.html}</span>`
    +(score?`<span class="rp-tlsc">${score}</span>`:'')+`</span>`;
  return `<div class="rp-tlrow"><div class="rp-tlh">${e.team==='home'?item:''}</div>`
    +`<span class="rp-tlmin">${minLbl(e.sec,e.half)}</span>`
    +`<div class="rp-tla">${e.team==='away'?item:''}</div></div>`;
}
/* rows + KICK-OFF / HALF-TIME / FULL-TIME separator chips on a central spine;
   goals and own goals carry the running score */
function timelineItems(){
  const evs=timelineEvents();
  if(!evs.length)return null;
  const sep=lbl=>`<div class="rp-tlsep"><span>${lbl}</span></div>`;
  const sc={home:0,away:0};
  const items=[sep('KICK-OFF')];
  let curHalf=1;
  evs.forEach(e=>{
    if(e.half===2&&curHalf===1){curHalf=2;items.push(sep(`HALF-TIME&nbsp;&nbsp;${sc.home} – ${sc.away}`));}
    let score=null;
    if(e.kind==='goal'){sc[e.team]++;score=`${sc.home} – ${sc.away}`;}
    else if(e.kind==='og'){sc[e.team==='home'?'away':'home']++;score=`${sc.home} – ${sc.away}`;}
    items.push(tlRow(e,score));
  });
  items.push(sep(`FULL-TIME&nbsp;&nbsp;${teamGoals('home')} – ${teamGoals('away')}`));
  return items;
}
/* How many entries fit on a page is a question of height, not of count: an event
   row and a HALF-TIME chip do not cost the same, and page one gives its top to the
   masthead. The fixed 22-then-30 this replaces was measured against neither, so a
   match with more than about fifty goals and cards ran off the bottom of a page
   that cannot scroll — .rp-page is overflow:hidden, and the entries simply went
   missing. Costs are the rendered heights of .rp-tlrow and .rp-tlsep; the budgets
   are what is left of the 1031px flow box under each page's own heading. */
const TL_ROW=34, TL_SEP=42, TL_FIRST=830, TL_REST=935;
function timelineChunks(items){
  const out=[]; let cur=[], h=0, budget=TL_FIRST;
  items.forEach(it=>{
    const c=it.indexOf('rp-tlsep')>=0?TL_SEP:TL_ROW;
    if(h+c>budget&&cur.length){out.push(cur); cur=[]; h=0; budget=TL_REST;}
    cur.push(it); h+=c;
  });
  if(cur.length)out.push(cur);
  return out;
}
function timelinePages(){
  const items=timelineItems(), chunks=[];
  if(items)timelineChunks(items).forEach(c=>chunks.push(c));
  else chunks.push(null);
  /* The header band is pulled up INTO the page's top padding (see .rp-head), so it
     has to be the first thing on the page — put after the masthead it would be
     dragged over the top of it. Page 1 therefore reads band, masthead, fixture,
     timeline; every other page reads band, timeline. */
  return chunks.map((ch,ci)=>
    secTitle('Match Timeline')
    +(ci===0?headerBlock()+fixtureBlock():'')
    +legend()
    +(ch?`<div class="rp-tlwrap"><div class="rp-tlspine"></div>${ch.join('')}</div>`
        :`<div class="rp-note" style="text-align:center;padding:26px 0;font-size:11px">No goals or cards tagged yet.</div>`));
}

/* ================= lineups & formation pages ================= */
function fmCard(p,team){
  const dots=p.xi.map(q=>{
    let x=+q.x, y=+q.y; if(p.dir==='rl'){x=100-x;y=100-y;}      // normalise to attacking RIGHT
    const left=y, top=100-x;                                     // rotate 90° CCW → attacking UP
    return `<div class="rp-fdot" style="left:${left.toFixed(1)}%;top:${top.toFixed(1)}%;background:${TC(team)};color:${C.on(TC(team))}">${esc(q.no)}</div>`;
  }).join('');
  return `<div class="rp-fcard"><div class="rp-fttl"><b>${mmss(p.start)}–${mmss(p.end)}</b></div>`
    +`<div class="rp-fpitch">${vPitchSVG()}${dots}</div></div>`;
}
function formationPages(team){
  const ps=teamPeriods(team), pages=[];
  /* One title, carried by every page of the section. The side is named in the header's
     own team slot rather than folded into the title — the shape every other per-side page
     uses — and again as the sub-heading over the cards, where the reader is looking. */
  const title='Lineups &amp; Formation';
  if(!ps.length)return [secTitle(title,team)
    +`<div class="rp-note" style="font-size:11px">No starting lineup set for this team (see Player lists).</div>`];
  for(let i=0;i<ps.length;i+=4){
    let b=secTitle(title,team);
    b+=`<div class="rp-sub" style="color:${TI(team)}">${esc(TN(team))}</div>`;
    b+=`<div class="rp-fgrid">${ps.slice(i,i+4).map(p=>fmCard(p,team)).join('')}</div>`;
    pages.push(b);
  }
  return pages;
}

/* ================= attacking ================= */
function donutCard(team){
  const s=sumTeam(rows,team), total=s.totalShots;
  const goals=s.goals, onNon=Math.max(0,s.shotsOn-s.goals), off=s.shotsOff+s.shotsBlocked+s.missShots;
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
    +`<div style="font-size:10px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:${TI(team)};margin-bottom:6px">${esc(TN(team))}</div>`
    +row('','Total Shots',total)
    +row(C.gold,'Goals',goals)
    +row(C.green,'On Target',`${pc0(s.shotsOn,total)} <span style="color:${C.mut};font-weight:400">${frac(s.shotsOn,total)}</span>`)
    +row(C.grey,'Off Target / Blocked / Missed',frac(off,total))
    +'</div></div>';
}
/* Attacking — team comparison on its own page (the donuts now live on each team's
   own "Shots & Goals" page, so this one is purely the head-to-head bars). */
function attackingComparisonPage(){
  const r=sectionRows(0);
  return secTitle('Attacking — Team Comparison')
    +legend()
    +`<div class="rp-cmphead">Attacking</div>`+cmpRows(r,cmpFit(r.length));
}
/* ---- "Shots & Goals" — ONE page per team: the shot map on the left, the summary donut
   and the shot-by-shot Event List on the right. Map markers carry the same number as the
   list row, so the two read together. Both halves are normalised to attack UP. ---- */
const SHOT_MAP_COLORS={'goal':C.gold,'shot on target':C.green,
  'shot off target':'#a9b3c0','blocked shot':'#a9b3c0','miss shot':'#a9b3c0'};
/* The number a shot carries is the same number in the goal, on the pitch and in the
   list, so it is drawn in the same colour in all three. shared.js keeps a palette of
   its own for the Stats tab, which is dark, and taking the list's marker from there
   left it a different green from the dot it points at. */
const shotInk=e=>SHOT_MAP_COLORS[evKey(e)]||'#a9b3c0';
function shotDotsV(team){
  const N=normXY(team), d=PITCH_DIMS.football, W=d.h, H=d.w;
  // same filter + order as shotList(), so index N on the map is row N in the list
  return rows.filter(r=>r.team===team&&SHOT_KINDS.has(r.event)&&r.t!=null)
    .sort((a,b)=>a.t-b.t)
    .map((r,i)=>{
      if(!r.pXY)return '';                       // no location tagged -> list only
      const p=N(r).a;
      // horizontal (attacking right) -> vertical (attacking up): left = y, top = 100 - x
      const vx=p.y/100*W, vy=(100-p.x)/100*H, col=SHOT_MAP_COLORS[r.event]||'#a9b3c0';
      /* One shape for both halves. The circle/square split had the marker carrying two
         readings at once — what happened, and when — and the colour already answers the
         first. Which half a shot was in is on its row of the Event List beside the map,
         where a minute can be read rather than inferred from a corner radius. */
      const shape=`<circle cx="${vx.toFixed(1)}" cy="${vy.toFixed(1)}" r="18" fill="${col}" stroke="#fff" stroke-width="3"/>`;
      return `<g>${shape}<text x="${vx.toFixed(1)}" y="${(vy+6.5).toFixed(1)}" text-anchor="middle" `
        +`font-size="18" font-weight="800" fill="${C.on(col)}">${i+1}</text></g>`;
    }).join('');
}
/* The same filter and order as shotDotsV, so a shot keeps ONE number across the goal
   mouth, the pitch map and the Event List. Only the ones that were given a spot appear —
   off target, blocked and missed never cross the line. */
function goalMarksV(team){
  return rows.filter(r=>r.team===team&&SHOT_KINDS.has(r.event)&&r.t!=null)
    .sort((a,b)=>a.t-b.t)
    // no `square`: the goal mouth marks one shot one way, like the pitch map beside it
    .map((r,i)=>r.gXY?{x:r.gXY.x,y:r.gXY.y,label:i+1,
      color:SHOT_MAP_COLORS[r.event]||'#a9b3c0'}:null)
    .filter(Boolean);
}
function shotsAndGoalsPages(team){
  const list=shotList(rows,team), names=squadNames(lineups,team);
  const tr=s=>`<tr><td class="el-c"><span class="rp-elidx" style="background:${shotInk(s.event)};color:${C.on(shotInk(s.event))}">${s.idx}</span></td>`
    +`<td class="el-c">${esc(minLbl(matchTime(s.t),eventHalf({t:s.t})))}</td>`
    +`<td>${esc(s.no)}. ${esc(playerLabel(names,s.no))}</td>`
    +`<td>${s.bodyPart?esc(s.bodyPart):'<span style="color:#c9cfd9">–</span>'}</td></tr>`;
  const table=slice=>`<table class="rpt rpt-el"><thead><tr><th class="el-c">#</th><th class="el-c">Time</th>`
    +`<th>Player</th><th>Body Part</th></tr></thead><tbody>${slice.map(tr).join('')}</tbody></table>`;
  /* The side is named in the header's own team slot, not folded into the title — the
     shape every other per-side page in the report uses. A title that carried the team
     made two pages of one section read as two sections. */
  const title='Attacking — Shots &amp; Goals';
  // where the on-target ones crossed the line. Numbered and coloured exactly like the map
  // and the Event List, so #7 in the goal is #7 on the pitch is #7 in the table.
  const gm=goalMarksV(team);
  const left=`<div class="rp-sgleft"><div class="rp-mtitle" style="color:${TI(team)}">Shots</div>`
    +`<div class="rp-goalmouth">${goalMouthSVG(gm,{net:'#c7d0dc',frame:'#8f99a6',ink:'#152233',ring:'#fff'})}</div>`
    +vPitchSVG(vUpArrowSVG()+shotDotsV(team))
    +`<div class="rp-mleg rp-sgleg"><span><i style="background:${C.gold}"></i>Goal</span>`
    +`<span><i style="background:${C.green}"></i>On target</span>`
    +`<span><i style="background:#a9b3c0"></i>Off / blocked / missed</span></div></div>`;
  // 26 rows exactly fill the column beside the map/summary (measured against the 1123px
  // page); 25 leaves a row of headroom for a long team name wrapping in the donut card.
  // A continuation page is title + table only, so it takes 33 of the ~28px rows.
  const FIRST=25, CONT=33;
  const right=`<div class="rp-sgright"><div class="rp-mtitle">Summary</div>${donutCard(team)}`
    +`<div class="rp-mtitle" style="margin-top:13px">Event List</div>`
    +(list.length?table(list.slice(0,FIRST)):`<div class="rp-note">No shots recorded.</div>`)
    +`</div>`;
  /* The rest of the SAME table, so it is drawn at the width it had beside the map
     rather than stretched across the page: left to itself a table fills its parent,
     and four columns 694px wide read as a different table from the four 384px ones
     the reader has just come off. Centred — there is no map beside it to sit against. */
  const cont=slice=>`<div class="rp-sgcont"><div class="rp-mtitle">Event List</div>${table(slice)}</div>`;
  const pages=[secTitle(title,team)+`<div class="rp-sgwrap">${left}${right}</div>`];
  for(let i=FIRST;i<list.length;i+=CONT)
    pages.push(secTitle(title,team)+cont(list.slice(i,i+CONT)));
  return pages;
}

/* ================= player stat tables (chunked over pages) ================= */
function teamTable(team,headers,rowFor){
  // the whole matchday squad (same as the Stats page): a substitute who came on and
  // never touched the ball still belongs in the report, with his zeroes
  const P=withSquad(computeStats(rows,team),lineups,team), list=sortedPlayers(P);
  if(!list.length)return {rows:0,html:`<div class="rp-note" style="font-size:11px">No events for ${esc(TN(team))} yet.</div>`};
  const names=squadNames(lineups,team);
  /* Minutes played beside the name on every player page, the way the Stats tab carries
     it: the columns after it are tallies, and a tally is read against the time on the
     pitch that produced it. "Min" rather than the full label — these tables are wide,
     and it sits among Shoot Acc / Intercept / T-on Con, which are abbreviated too. */
  const mins=playedMinutes(lineups,dur,team,rows);
  const minOf=no=>{const m=mins&&mins[String(no==null?'':no).trim()];return m?dotv(m.min):dotv(0);};
  const body=list.map(no=>`<tr><td>${pill(no,team)}</td><td class="rp-pl">${esc(playerLabel(names,no))}</td>`
    +`<td>${minOf(no)}</td>`
    +`${rowFor(P[no],no,team).map(c=>`<td>${c}</td>`).join('')}</tr>`).join('');
  return {rows:list.length,
    html:`<div class="rp-sub" style="color:${TI(team)}">${esc(TN(team))}</div>`
      +`<table class="rpt"><thead><tr><th>No</th><th>Player</th><th>Min</th>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`};
}
function playerStatPages(title,headers,rowFor){
  const h=teamTable('home',headers,rowFor), a=teamTable('away',headers,rowFor);
  if(h.rows+a.rows<=30)
    return [secTitle(title)+h.html+'<div style="height:16px"></div>'+a.html];
  // split, so each page is about one side and its header says which — the same slot every
  // other per-side page in the report names its team in. Both on one page names neither.
  return [secTitle(title,'home')+h.html, secTitle(title,'away')+a.html];
}
function cardCounts(team){
  const out={};
  rows.forEach(r=>{
    if(r.team!==team)return;
    const no=String(r.playerFrom||'').trim(); if(!no)return;
    const o=out[no]=out[no]||{yc:0,rc:0}, e=evKey(r.event);
    if(e==='yellow card')o.yc++; else if(e==='red card')o.rc++;
  });
  return out;
}
/* Shooting only. Offsides, Freekicks and Corners used to sit on the end of this table and
   have moved out rather than been dropped: Offsides is on Fouls — Player Stats, Freekicks
   and Corners on Set Pieces — Player Stats, each beside the columns that explain them. A
   figure printed in the one place it belongs is a figure two pages cannot disagree about. */
const attackingPlayerPages=()=>playerStatPages('Attacking — Player Stats',
  ['Goals','Assists','Shots','On Target','Off Target','Blocked','Missed','Shoot Acc'],
  s=>[dotv(s.goals),dotv(s.assists),dotv(s.totalShots),dotv(s.shotsOn),dotv(s.shotsOff),dotv(s.shotsBlocked),
      dotv(s.missShots),pc0(s.shotsOn,s.totalShots)]);
const distributionPlayerPages=()=>playerStatPages('Distribution — Player Stats',
  ['Passes','Pass Acc','Crosses','Cross Acc','Take-Ons','Step-ins'],
  s=>[frac(s.passesComp,s.passes),pc0(s.passesComp,s.passes),frac(s.crossesComp,s.crosses),
      pc0(s.crossesComp,s.crosses),frac(s.takeOnsWon,s.takeOns),dotv(s.stepIns)]);
/* Cards, fouls given and fouls won all live on Fouls — Player Stats now, which splits the
   fouls into the three kinds this table could only ever total. Nothing is lost by their
   going: Total Fouls there IS the Fouls column that used to be here. */
function defensivePlayerPages(){
  return playerStatPages('Defensive — Player Stats',
    /* "Physical" and "Loose" where one "Ground" column used to be — the two kinds a duel
       on the floor is now tagged as, matching the Stats tab and the team comparison.
       A plain frac(), like Aerial beside it: a match tagged before the split reads 0/0,
       the same 0 the tables print for it. */
    /* No Tackle % column: "3/5" already IS the rate, at the width of two characters, and a
       percentage beside it is the same fact read twice. The Defensive comparison keeps its
       Tackle Success row — that one has no fraction beside it to make it redundant. */
    ['Tackles','Intercept','Clear','Blocks','Recover','Aerial','Physical','Loose','T-on Con','Mistakes'],
    s=>[frac(s.tacklesWon,s.tackles),dotv(s.interceptions),dotv(s.clearances),
      dotv(s.blocks),dotv(s.recoveries),frac(s.aerialDuelsWon,s.aerialDuels),
      frac(s.physicalDuelsWon,s.physicalDuels),
      frac(s.looseBallDuelsWon,s.looseBallDuels),
      dotv(s.takeOnConcerns),dotv(s.mistakes)]);
}

/* ---- the three sections whose tables are one page PER SIDE ----
   Column LABELS for A4, and nothing else. The numbers still come from PLAYER_CATS in
   shared.js, so this table cannot make one of them disagree with the Stats tab or with
   the client site's Data page; a column added there and forgotten here still prints,
   under its own name. It is only wide.

   How wide is not a guess. Measured at the 694px flow box, in the header's own font:
   PLAYER_CATS.goalkeeper wants 1411px of label on 18 columns and PLAYER_CATS.setPieces
   wants 1128px on 14, against 694px of page — four and three lines of wrapped header.
   Through this map they want 657px and 661px, on one line each. */
const RPT_ABBR={
  'Save Standing':'Stand',            'Save Collapse':'Collapse',
  'Save Diving':'Diving',             'Save Kneeling':'Kneel',
  'Save Overhead':'Overhd',           'Goals Conceded':'Conceded',
  'Freekicks':'FK',                   'Freekicks: Shots Off Target':'FK Sh Off',
  'Freekicks: Shots On Target':'FK Sh On',
  'Freekicks: Crosses':'FK Cross',    'Freekicks: Crosses Succeeded':'FK Cr Succ',
  'Penalty Kicks':'Pens',             'Throw-Ins':'Throw-in',
  'Goal Kicks':'Goal Kick',
  'Set Piece Shot':'SP Shots',        'Set Piece Goal':'SP Goals',
  'Handball Foul':'Handball',         'Yellow Cards':'Yellow',
  'Red Cards':'Red'
};
/* 13 columns for A4 — the ONE set here that does not read PLAYER_CATS straight through.
   PLAYER_CATS.goalkeeper carries three Success / Fail / % triples, and the Fail side is
   the remainder of the total, never a counter of its own (shared.js:510 says so). Printing
   all three is printing one number twice, on the widest table in the report. Each function
   below reads exactly the counters PLAYER_CATS.goalkeeper reads — no new counter, no new
   arithmetic — so the pairs still agree with the Stats tab, column by column.

   Saves is the NARROW reading (catches+parries), matching PLAYER_CATS. The keeper row at
   the top of the Goalkeeper — Saves page uses the broad one (s.saves, which also carries
   the retired `save` event) and says so on the page. Two questions, two answers, both
   already shipping. */
const RPT_GK_COLS=[
  ['Saves',   s=>s.catches+s.parries],
  ['Catch',   s=>s.catches],          ['Parry',    s=>s.parries],
  ['Stand',   s=>s.saveStanding],     ['Collapse', s=>s.saveCollapse],
  ['Diving',  s=>s.saveDiving],       ['Kneel',    s=>s.saveKneeling],
  ['Overhd',  s=>s.saveOverhead],
  /* "2/3" and nothing beside it. The percentage columns that used to follow each of these
     said the same thing the fraction says, at three characters instead of two — the same
     trade Tackle % lost on the Defensive table. */
  ['DLS',     s=>frac(s.defLineSupportsWon,s.defLineSupports)],
  ['Aer Ctrl',s=>frac(s.aerialControlsWon,s.aerialControls)],
  ['Conceded',s=>s.goalsConceded]
];
/* One page per side, always — which is what these three sections were asked for, and
   what playerStatPages() above deliberately does not do (it packs both sides onto one
   page when they fit, and the three older sections still want that).

   26 rows is the page: header band 65px + a one-line thead 25px + 26 x 27px = 792 of the
   1031px flow box, with the rest left for the sub-heading and slack. A squad longer than
   that runs on to a second page under the same title. */
const RPT_TEAM_ROWS=26;
/* `only` narrows the squad to the shirts a table is about. The keeper table is the one
   that needs it, and the Stats tab already does exactly this (catPlayers, stats-view.js:131):
   on an outfield player every goalkeeping column is a zero that says nothing, and twenty-two
   of those is a page of noise. Left out, a table lists the whole matchday squad, which is
   what the other two want. */
function teamPlayerPages(title,cols,only){
  const headers=cols.map(c=>RPT_ABBR[c[0]]||c[0]);
  const out=[];
  ['home','away'].forEach(team=>{
    const P=withSquad(computeStats(rows,team),lineups,team);
    const keep=only?only(team):null;
    const list=sortedPlayers(P).filter(no=>!keep||keep.has(String(no==null?'':no).trim()));
    const names=squadNames(lineups,team);
    const mins=playedMinutes(lineups,dur,team,rows);
    const minOf=no=>{const m=mins&&mins[String(no==null?'':no).trim()];return m?dotv(m.min):dotv(0);};
    const sub=`<div class="rp-sub" style="color:${TI(team)}">${esc(TN(team))}</div>`;
    if(!list.length){
      // a narrowed table that came back empty is a different sentence from a side with no
      // events at all: nobody kept goal on paper, and nobody was tagged doing it either
      out.push(secTitle(title,team)+sub
        +`<div class="rp-note" style="font-size:11px">`
        +(keep?`No goalkeeper is named in ${esc(TN(team))}'s line-up, and none of its shirts was `
              +`tagged with a goalkeeping event.`
             :`No events for ${esc(TN(team))} yet.`)
        +`</div>`);
      return;
    }
    const tr=no=>`<tr><td>${pill(no,team)}</td><td class="rp-pl">${esc(playerLabel(names,no))}</td>`
      +`<td>${minOf(no)}</td>`
      // a number gets the middle dot a zero is drawn as here; a rate or a frac is a
      // string already and is printed as it comes
      +cols.map(c=>{const v=c[1](P[no]);return `<td>${typeof v==='number'?dotv(v):v}</td>`;}).join('')
      +`</tr>`;
    for(let i=0;i<list.length;i+=RPT_TEAM_ROWS)
      out.push(secTitle(title,team)+sub
        +`<table class="rpt"><thead><tr><th>No</th><th>Player</th><th>Min</th>`
        +headers.map(h=>`<th>${h}</th>`).join('')+`</tr></thead><tbody>`
        +list.slice(i,i+RPT_TEAM_ROWS).map(tr).join('')+`</tbody></table>`);
  });
  return out;
}

/* ================= distribution ================= */
const distributionPage=()=>{
  const r=sectionRows(1);
  return secTitle('Distribution')+legend()
    +`<div class="rp-cmphead">Distribution</div>`+cmpRows(r,cmpFit(r.length));
};

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
  const nodes={}, flip=team==='away';   // away mirrored to attack LEFT
  Object.entries(pos).forEach(([p,a])=>{
    let mx=a.reduce((s,v)=>s+v.x,0)/a.length, my=a.reduce((s,v)=>s+v.y,0)/a.length;
    if(flip){mx=100-mx;my=100-my;}
    nodes[p]={x:mx/100*d.w, y:my/100*d.h};
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
      +` stroke="#ffffff" stroke-opacity="0.9" stroke-width="${Math.min(8,1.6+n*0.8).toFixed(1)}" marker-end="url(#${mk})"/>`;
  });
  const dots=Object.entries(nodes).map(([p,n])=>
    `<g><circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${R}" fill="${TC(team)}" stroke="rgba(255,255,255,0.92)" stroke-width="2.5"/>`
    +`<text x="${n.x.toFixed(1)}" y="${(n.y+5).toFixed(1)}" text-anchor="middle" font-size="15" font-weight="800" fill="${C.on(TC(team))}">${esc(p)}</text></g>`).join('');
  const defs=`<defs><marker id="${mk}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#ffffff"/></marker></defs>`;
  return defs+seg+dots;
}
function netMapsPage(){
  const h=netMapSVG('home'), a=netMapSVG('away');
  if(!h&&!a)return null;
  const card=(team,svg)=>`<div class="rp-mapcard"><div class="rp-mtitle" style="color:${TI(team)}">${esc(TN(team))} · Pass Network</div>`
    +`<div style="width:620px;margin:0 auto">${hPitchSVG(svg||'',team==='away'?'left':'right')}</div></div>`;
  return secTitle('Distribution — Pass Networks')+card('home',h)+card('away',a);
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
function netWindowPages(){
  const L=+dur.halfLen||45, wins=pdWindows();
  const isPass=r=>r.event==='pass success'||r.event==='pass fail';
  const all={home:rows.filter(r=>r.team==='home'&&isPass(r)),
             away:rows.filter(r=>r.team==='away'&&isPass(r))};
  if(!all.home.length&&!all.away.length)return [];
  // one column of the interval row: team name, network pitch, stats line
  const half=(team,w,f,i)=>{
    const winP=all[team].filter(f), opp=team==='home'?'away':'home';
    const head=`<div class="rp-mtitle" style="color:${TI(team)};font-size:11px;margin-bottom:4px">${esc(TN(team))}</div>`;
    // an empty window keeps the pitch; the stats line reads 0 / 0%
    const suc=winP.filter(r=>r.event==='pass success').length;
    const oppWin=all[opp].filter(f).length;
    const st=(l,v)=>`<span>${l}<br><b style="color:${C.ink};font-size:9.5px">${v}</b></span>`;
    return `<div style="flex:1;min-width:0">${head}${hPitchSVG(netMapSVG(team,f,team+'w'+i)||'',team==='away'?'left':'right')}`
      +`<div style="display:flex;justify-content:space-between;font-size:8.5px;color:${C.mut};margin-top:4px;text-align:left">`
      +st('Count / Total Pass Count',`${winP.length} / ${all[team].length}`)
      +st('Pass Accuracy',pct(suc,winP.length))
      +st('Possession',pct(winP.length,winP.length+oppWin))+`</div></div>`;
  };
  // one row per interval: centred interval label, home network left, away right
  const blocks=wins.map((w,i)=>{
    const f=winFilter(w,L);
    return `<div class="rp-mapcard"><div style="text-align:center;font-size:13.5px;font-weight:800;color:${C.navy};margin:2px 0 7px">${w.label}</div>`
      +`<div style="display:flex;gap:18px">${half('home',w,f,i)}${half('away',w,f,i)}</div></div>`;
  });
  const pages=[];
  for(let i=0;i<blocks.length;i+=2){
    pages.push(secTitle('Distribution : Passes ( 15 Minute Intervals )')
      +blocks.slice(i,i+2).join(''));
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
    +`<text x="${p.cx.toFixed(1)}" y="${(p.cy+3.5).toFixed(1)}" text-anchor="middle" font-size="9.5" font-weight="800" fill="${C.on(TC(team))}">${esc(p.no)}</text></g>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block">${g}</svg>`
    +`<div style="display:flex;justify-content:space-between;font-size:10px;color:${C.mut};padding:4px 2px 0">`
    +`<span>0%</span><span>Pass Accuracy →</span><span>100%</span></div>`;
}
function scatterPage(){
  const card=team=>`<div class="rp-mapcard"><div class="rp-mtitle" style="color:${TI(team)}">${esc(TN(team))} · Passes by Volume &amp; Accuracy</div>${scatterPanel(team)}</div>`;
  return secTitle('Distribution — Passing Profile')+card('home')+card('away');
}

/* pass heatmap matrix (From → To) — one page per team */
function matrixPage(team){
  const {players,mtx}=passMatrix(rows,team);
  let b=secTitle('Distribution — Pass Heatmap (From → To)',team)
    +`<div class="rp-sub" style="color:${TI(team)}">${esc(TN(team))}</div>`;
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
  return b+`<table class="rpm"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/* touch heatmaps — canvas drawn after the page is mounted (see buildPages) */
function heatPage(){
  const card=team=>{
    const pts=touchPoints(team);   // 0 touches -> empty pitch, blank canvas
    return `<div class="rp-mapcard"><div class="rp-mtitle" style="color:${TI(team)}">${esc(TN(team))} · Touch Heatmap`
      +` <span style="color:${C.mut};font-weight:400;font-size:10px">(${pts.length} located touches)</span></div>`
      +`<div style="position:relative;width:620px;margin:0 auto">${hPitchSVG('',team==='away'?'left':'right')}`
      +`<canvas class="rp-heat" data-team="${team}" width="1050" height="680" style="position:absolute;left:0;top:0;width:100%;height:100%"></canvas></div></div>`;
  };
  return secTitle('Distribution — Touch Heatmaps')+card('home')+card('away')
    +`<div class="rp-mleg"><span>Low</span><span style="width:130px;height:10px;border-radius:5px;display:inline-block;`
    +`background:linear-gradient(90deg,rgba(0,60,255,0.55),#00c8ff,#39ff54,#ffe12b,#ff2b1e)"></span><span>High</span></div>`;
}

/* pass-type breakdown (distance / direction / area) — reuses passTypeData() from the Stats page */
function passTypesPage(){
  const card=team=>{
    const D=passTypeData(team);
    if(!D.tot)return `<div style="flex:1"><div class="rp-mtitle" style="color:${TI(team)}">${esc(TN(team))}</div>`
      +`<div class="rp-note" style="font-size:11px">No passes yet.</div></div>`;
    const rate=(n,d)=>d?(Math.round(n/d*1000)/10).toFixed(1)+'%':'–';
    const section=(title,cat)=>{
      const base=Object.values(cat).reduce((s,v)=>s+v[1],0);
      return `<tr><th colspan="4" style="text-align:left">${title}</th></tr>`
        +Object.entries(cat).map(([lbl,[s,n]])=>
          `<tr><td style="text-align:left;font-weight:700;color:${TI(team)}">${lbl}</td><td>${frac(s,n)}</td><td>${rate(s,n)}</td><td>${rate(n,base)}</td></tr>`).join('');
    };
    return `<div style="flex:1"><div class="rp-mtitle" style="color:${TI(team)}">${esc(TN(team))}`
      +` <span style="color:${C.mut};font-weight:400;font-size:10px">${D.suc}/${D.tot} · ${rate(D.suc,D.tot)}</span></div>`
      +`<table class="rpt" style="font-size:9.5px"><thead><tr><th style="text-align:left">Passes</th><th>Made</th><th>Success</th><th>Ratio</th></tr></thead>`
      +`<tbody>${section('Pass Distance',D.catD)}${section('Pass Direction',D.catG)}${section('Area',D.catA)}</tbody></table></div>`;
  };
  return secTitle('Distribution — Pass Types')
    +`<div style="display:flex;gap:18px">${card('home')}${card('away')}</div>`;
}

/* cross maps — origin→target arrows + zone-ratio bands, one pitch per team */
function crossMapSVG(team){
  const N=normXY(team), d=PITCH_DIMS.football, PW=d.w, PH=d.h, mT=76, mR2=150, W=PW+mR2, H=PH+mT;
  const evs=rows.filter(r=>r.team===team&&(r.event==='cross success'||r.event==='cross fail')&&r.pXY);
  // home shown attacking RIGHT, away mirrored to attack LEFT (ratio bands follow the flipped
  // points); a side with no crosses keeps the empty pitch and 0% bands
  const flip=team==='away', F=p=>p?{x:(flip?100-p.x:p.x)/100*PW, y:(flip?100-p.y:p.y)/100*PH}:null;
  const cr=evs.map(r=>{const n=N(r); return {a:F(n.a), b:F(n.b), ok:r.event==='cross success'};});
  const oCnt=[0,0,0]; cr.forEach(c=>oCnt[Math.min(2,Math.floor(c.a.x/PW*3))]++);
  const tgt=cr.filter(c=>c.b), tCnt=[0,0,0]; tgt.forEach(c=>tCnt[Math.min(2,Math.floor(c.b.y/PH*3))]++);
  const pctL=(n,dd)=>dd?(Math.round(n/dd*1000)/10)+'%':'0%';
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
  const grass=grassSVG(PW,PH,false);
  const pitch=`<g transform="translate(0 ${mT})">${grass}`
    +`<g fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="3">${pitchFootball(PW,PH,false)}</g>${dirArrowSVG(flip?'left':'right')}${seg}</g>`;
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block">${defs}${over}${pitch}</svg>`;
}
function crossMapsPage(){
  const isCross=r=>(r.event==='cross success'||r.event==='cross fail')&&r.pXY;
  if(!rows.some(isCross))return null;   // page skipped only when NEITHER team crossed
  const card=team=>`<div class="rp-mapcard"><div class="rp-mtitle" style="color:${TI(team)}">${esc(TN(team))} · Cross Map</div>`
    +`<div style="width:660px;margin:0 auto">${crossMapSVG(team)}</div></div>`;
  return secTitle('Distribution — Cross Maps')+card('home')+card('away')
    +`<div class="rp-mleg"><span><i style="background:#39d98a"></i>Cross success</span><span><i style="background:#f7506b"></i>Cross fail</span></div>`;
}

/* ================= defensive ================= */
const defensivePage=()=>{
  const r=sectionRows(2);
  return secTitle('Defensive')+legend()
    +`<div class="rp-cmphead">Defensive</div>`+cmpRows(r,cmpFit(r.length));
};

/* Top-5 player ranking printed under a map. `rk` describes what to count and how to order:
     {events:[…]}            Rank · Player · Total, most events first
     {events:[…],succ:ev}    …plus Succ. · Success Rate, `succ` naming the successful event
     {…,by:'rate'}           ordered on that success rate instead of on the total
     {…,label:'Take-ons'}    a caption above the table, for pages with more than one
   Counts ALL events of the type, located on the pitch or not. Ties (identical totals AND
   successes) share a rank shown blank, like the reference report. */
function rankTable(team,rk,big){
  const want={}; rk.events.forEach(ev=>want[evKey(ev)]=1);
  const okEv=rk.succ?evKey(rk.succ):null, two=!!okEv;
  const counts={};
  rows.forEach(r=>{
    if(r.team!==team||!want[evKey(r.event)])return;
    const no=String(r.playerFrom||'').trim(); if(!no)return;
    const o=counts[no]=counts[no]||{t:0,s:0}; o.t++; if(evKey(r.event)===okEv)o.s++;
  });
  const rate=c=>c.t?c.s/c.t:0;
  const list=Object.entries(counts).sort((x,y)=>
    (rk.by==='rate'?rate(y[1])-rate(x[1]):0)
    ||y[1].t-x[1].t||y[1].s-x[1].s||(+x[0]||1e9)-(+y[0]||1e9)).slice(0,5);
  /* A page that carries ONE ranking draws it as a block rather than as a footnote:
     it has the room the two-ranking pages do not, and the ranking is the answer the
     map above it was asked for. */
  const cls=big?'rp-rk rp-rk-lg':'rp-rk';
  const cap=rk.label?`<div style="font-size:10.5px;font-weight:800;color:${C.navy};margin:9px 0 2px">${rk.label}`
    +(rk.by==='rate'?`<span style="color:${C.mut};font-weight:600"> · ranked by success rate</span>`:'')
    +'</div>':'';
  const header=`${cap}<table class="rpt" style="font-size:10px;margin-top:${rk.label?'2px':'10px'}"><thead><tr><th>Rank</th>`
    +`<th style="text-align:left">Player</th><th>Total</th>${two?'<th>Succ.</th><th>Success Rate</th>':''}</tr></thead>`;
  if(!list.length){   // no data -> dashed placeholder rows, like the reference
    let h='';
    for(let i=1;i<=5;i++)h+=`<tr><td style="color:${C.mut}">${i}</td><td style="text-align:left;color:#c9cfd9">–</td>`
      +`<td style="color:#c9cfd9">–</td>${two?'<td style="color:#c9cfd9">–</td><td style="color:#c9cfd9">–</td>':''}</tr>`;
    return `<div class="${cls}">`+header+`<tbody>${h}</tbody></table></div>`;
  }
  const roster=(lineups[team]&&lineups[team].roster)||[];
  const nameOf=no=>{const p=roster.find(q=>String(q.no)===String(no));return p&&p.name?p.name:'Player '+no;};
  /* The top of the ranking is what the page was asked for, so it is set apart —
     tinted and in the section's own navy. Carried on the cells rather than on the
     row: the suite reads these tables back by matching a bare <tr>, and a class
     there would hide the very row the ordering tests are about. */
  let prev=null;
  const trs=list.map(([no,c],i)=>{
    const tied=prev&&prev.t===c.t&&prev.s===c.s; prev=c;
    const hi=i===0?`background:${C.band};color:${C.navy};font-weight:800;`:'';
    return `<tr><td style="${hi}color:${i===0?C.navy:C.mut}">${tied?'':i+1}</td>`
      +`<td style="${hi}text-align:left">${esc(no)}.&nbsp;${esc(nameOf(no))}</td><td style="${hi}">${c.t}</td>`
      +(two?`<td style="${hi}">${c.s}</td><td style="${hi}">${pc0(c.s,c.t)}</td>`:'')+'</tr>';
  }).join('');
  return `<div class="${cls}">`+header+`<tbody>${trs}</tbody></table></div>`;
}
/* One located-action map page for a category of events: home and away pitches side by
   side (home attacks RIGHT, away mirrored LEFT), one colour per event type, marker shape
   by half, and one or more rankings under each map. `cat` is a Stats-tab DEF_CATS entry —
   {label, parts:[[event, legend, colour], …]} — so the pages that use this stay in step
   with the dropdown. Returns null when neither side has a located event.
   `ranks` overrides what is tabulated (see rankTable); by default the whole category is
   ranked as one table, with Succ. + Success Rate for a won/lost pair. */
function actionMapsPage(cat,title,ranks){
  // keyed through evKey: the event dictionary is user-editable, so "Take-on Concern"
  // has to find the same rows as "take-on concern" (see the evKey note in shared.js)
  const col={}; cat.parts.forEach(([ev,,c])=>col[evKey(ev)]=c);
  const evs=cat.parts.map(p=>p[0]);
  const rk=ranks||[{events:evs,succ:cat.parts.length===2?cat.parts[0][0]:null}];
  const acts=team=>rows.filter(r=>r.team===team&&col[evKey(r.event)]&&r.pXY);
  const hA=acts('home'), aA=acts('away');
  if(!hA.length&&!aA.length)return null;
  /* Side-by-side row, both sides drawn END-ON and attacking UP.
     These two pitches share the page's width, so landscape gave each of them 219px
     of a 1031px page — the maps were postage stamps with unreadable shirt numbers,
     and the page ran half empty under them. End-on, the same column is 500px tall:
     the page fills, the markers double, and the two sides line up goal-to-goal so a
     defensive shape can be compared directly rather than through a mirror. It is the
     orientation the Shots & Goals maps already use, so the rule across the report is
     simply that a pitch drawn at half-width is drawn end-on.
     One marker shape for both halves, colour = the event's part; a side with no data
     keeps the empty pitch. */
  const card=(team,list)=>{
    const N=normXY(team), d=PITCH_DIMS.football, W=d.h, H=d.w;
    const dots=list.map(r=>{
      // normXY leaves both halves attacking RIGHT; end-on that is across = y, up = 100 - x
      const p=N(r).a, x=p.y/100*W, y=(100-p.x)/100*H, c=col[evKey(r.event)];
      // one shape for both halves — see shotDotsV. Colour says which action it was; the
      // shirt number inside says who, and those are the two questions this map is asked.
      const shape=`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="16" fill="${c}" fill-opacity="0.94" stroke="#fff" stroke-width="2.5"/>`;
      return `<g>${shape}<text x="${x.toFixed(1)}" y="${(y+5.5).toFixed(1)}" text-anchor="middle" font-size="16" font-weight="800" fill="${C.on(c)}">${esc(String(r.playerFrom||'').trim())}</text></g>`;
    }).join('');
    const map=`<div class="rp-vmap${rk.length>1?' rp-vmap-sm':''}">${vPitchSVG(dots)}</div>`;
    return `<div style="flex:1;min-width:0"><div class="rp-mtitle" style="color:${team==='home'?C.homeInk:C.awayInk}">`
      +`${esc(TN(team))}<span class="rp-mdir">▲ attacking</span></div>`
      +map+rk.map(one=>rankTable(team,one,rk.length===1)).join('')+'</div>';
  };
  const legend=cat.parts.map(([,lbl,c])=>`<span><i style="background:${c}"></i>${lbl}</span>`).join('');
  return secTitle(title)
    +`<div class="rp-mleg" style="margin:0 0 10px">${legend}</div>`
    +`<div style="display:flex;gap:18px;align-items:flex-start">${card('home',hA)}${card('away',aA)}</div>`;
}
/* one page per defensive action type, mirroring the Stats-tab dropdown (DEF_CATS:
   Tackles, Interceptions, Clearances, Blocks, Recoveries, Physical / Loose Ball /
   Aerial Duels, Take-on Concern, Mistakes). Types with no located event on either side
   are skipped, so the two floor-duel pages simply do not appear on a report for a match
   tagged before the split. */
function defCategoryPages(){
  return Object.values(DEF_CATS)
    .map(cat=>({sub:cat.label,html:actionMapsPage(cat,`Defensive — ${cat.label}`)}))
    .filter(c=>c.html);
}
/* Where a team took defenders on and where it stepped in — the three events share ONE map
   per side, told apart by colour. They are two different actions though, so they are
   ranked apart: take-ons on how often the player beat his man (success / attempted),
   step-ins simply on how many. Ranking the three together compared unlike things and hid
   who was actually winning his duels. */
const TAKEON_CAT={label:'Take-ons & Step-ins',parts:[
  ['take-on success','Take-on success','#39d98a'],
  ['take-on fail','Take-on fail','#f7506b'],
  ['step in','Step-in','#2f81f7']]};
const TAKEON_RANKS=[
  {label:'Take-ons',events:['take-on success','take-on fail'],succ:'take-on success',by:'rate'},
  {label:'Step-ins',events:['step in']}];
const takeOnMapsPage=()=>actionMapsPage(TAKEON_CAT,'Distribution — Take-ons &amp; Step-ins',TAKEON_RANKS);

/* Defensive profile radar — each axis normalised against the higher of the two teams,
   then scaled into RMAX so the leader stops short of the outer ring. Mapping the leader
   straight onto 1.0 pinned it to the edge on EVERY axis it led, which read as a maxed-out
   shape rather than a lead, and left the two polygons touching the grid and the labels.
   RMIN keeps a zero visible as a dot on the axis instead of collapsing into the centre. */
const RADAR_MAX=0.82;
const RADAR_MIN=0.05;
function radarPage(){
  /* Eight axes, not seven: "Ground Won" split into the two kinds it is now tagged as.
     Every axis is normalised against the higher of the two sides, so a match tagged
     before the split leaves both new axes at zero for BOTH teams — the scale is a
     comparison, and two zeroes compare to nothing rather than to a wrong shape. */
  const axes=[['Tackles Won','tacklesWon'],['Interceptions','interceptions'],['Recoveries','recoveries'],
    ['Clearances','clearances'],['Blocks','blocks'],['Aerial Won','aerialDuelsWon'],
    ['Physical Won','physicalDuelsWon'],['Loose Ball Won','looseBallDuelsWon']];
  const h=sumTeam(rows,'home'), a=sumTeam(rows,'away');
  const axFrac=(s,k)=>{const mx=Math.max(h[k],a[k]);
    return mx?Math.max(RADAR_MIN,s[k]/mx*RADAR_MAX):RADAR_MIN;};
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
    const p=axes.map(([,k],i)=>pt(i,axFrac(s,k)).map(v=>v.toFixed(1)).join(',')).join(' ');
    return `<polygon points="${p}" fill="rgba(${rgb},0.17)" stroke="rgb(${rgb})" stroke-width="3"/>`
      +axes.map(([,k],i)=>{const [x,y]=pt(i,axFrac(s,k));
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="rgb(${rgb})"/>`;}).join('');
  };
  g+=poly(a,C.awayRGB)+poly(h,C.homeRGB);
  axes.forEach(([lbl,k],i)=>{
    const [x,y]=pt(i,1), lx=cx+(R+38)*Math.cos(ang(i)), ly=cy+(R+38)*Math.sin(ang(i));
    const anch=Math.abs(Math.cos(ang(i)))<0.3?'middle':(Math.cos(ang(i))>0?'start':'end');
    g+=`<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anch}" font-size="13" font-weight="800" fill="${C.ink}">${lbl}</text>`
      +`<text x="${lx.toFixed(1)}" y="${(ly+15).toFixed(1)}" text-anchor="${anch}" font-size="11" font-weight="700">`
      +`<tspan fill="${C.homeInk}">${h[k]}</tspan><tspan fill="${C.mut}" font-weight="400"> · </tspan>`
      +`<tspan fill="${C.awayInk}">${a[k]}</tspan></text>`;
  });
  return secTitle('Defensive — Profile Radar')+legend()
    +`<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block;margin:0 auto">${g}</svg>`;
}

/* foul maps — halves normalised, card halos, hatched own defensive third.
   The three names ARE the total: `fouls` in shared.js counts all three (EVENT_INC), and
   the Fouls comparison prints them as Total = Fouls + Handball + Foul Throw. Looked up
   through evKey like actionMapsPage does, not against the raw name: the event dictionary
   is user-editable, so a "Foul" typed with a capital would otherwise silently count zero
   and the map would quietly stop being the total it says it is. */
const RP_FOULS=new Set(['foul','foul throw','handball foul']);
const RP_CARDS=new Set(['yellow card','red card']);
function foulMapsPage(){
  let any=false;
  const card=team=>{
    // home shown attacking RIGHT, away mirrored to attack LEFT
    const N=normXY(team), d=PITCH_DIMS.football, PW=d.w, PH=d.h, mT=76, mR2=150, W=PW+mR2, H=PH+mT, flip=team==='away';
    const evs=rows.filter(r=>r.team===team&&RP_FOULS.has(evKey(r.event))&&r.pXY);
    // a side with no located fouls keeps the empty pitch and 0% bands
    let inner;
    if(evs.length)any=true;
    {
      const cards=rows.filter(r=>r.team===team&&RP_CARDS.has(evKey(r.event))&&r.t!=null);
      const cardFor=f=>{let best=null,bd=90;
        cards.forEach(c=>{
          if(String(c.playerFrom||'').trim()!==String(f.playerFrom||'').trim())return;
          const dd=Math.abs(c.t-f.t); if(dd<=bd){bd=dd;best=evKey(c.event);}
        });
        return best;};
      const fl=evs.map(r=>{const p=N(r).a;
        return {x:(flip?100-p.x:p.x)/100*PW, y:(flip?100-p.y:p.y)/100*PH, half:eventHalf(r), no:esc(String(r.playerFrom||'').trim()), card:cardFor(r)};});
      const oCnt=[0,0,0]; fl.forEach(f=>oCnt[Math.min(2,Math.floor(f.x/PW*3))]++);
      const tCnt=[0,0,0]; fl.forEach(f=>tCnt[Math.min(2,Math.floor(f.y/PH*3))]++);
      const pctL=n=>fl.length?(Math.round(n/fl.length*1000)/10)+'%':'0%';
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
        // one shape for both halves, like every other map in the report. The ring is the
        // one thing this marker still says twice over, and that is a card, not a clock.
        const shape=`<circle cx="${f.x.toFixed(1)}" cy="${f.y.toFixed(1)}" r="12" fill="${TC(team)}" fill-opacity="0.92" ${ring}/>`;
        return `<g>${shape}<text x="${f.x.toFixed(1)}" y="${(f.y+4.5).toFixed(1)}" text-anchor="middle" font-size="14" font-weight="800" fill="${C.on(TC(team))}">${f.no}</text></g>`;
      }).join('');
      const grass=grassSVG(PW,PH,false);
      // dangerous zone = own defensive third: left when attacking right, right when mirrored
      const pitch=`<g transform="translate(0 ${mT})">${grass}<rect x="${flip?(2*PW/3).toFixed(1):0}" width="${PW/3}" height="${PH}" fill="url(#${patId})"/>`
        +`<g fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="3">${pitchFootball(PW,PH,false)}</g>${dirArrowSVG(flip?'left':'right')}${dots}</g>`;
      inner=`<div style="width:660px;margin:0 auto"><svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block">${defs}${over}${pitch}</svg></div>`;
    }
    return `<div class="rp-mapcard"><div class="rp-mtitle" style="color:${TI(team)}">${esc(TN(team))} · Foul Map</div>${inner}</div>`;
  };
  const body=secTitle('Fouls — Foul Maps')+card('home')+card('away')
    +`<div class="rp-mleg">`
    +`<span><i style="background:rgba(247,80,107,0.3);border:1px solid rgba(247,80,107,0.55);border-radius:2px"></i>Dangerous zone (own third)</span>`
    +`<span><i class="rp-ring" style="background:#98a0aa;border-color:#f5c518"></i>Led to yellow</span>`
    +`<span><i class="rp-ring" style="background:#98a0aa;border-color:${C.red}"></i>Led to red</span></div>`;
  return any?body:null;
}

/* plain located-event maps (offside, foul won…) — home and away side by side (home
   attacks RIGHT, away mirrored LEFT), marker shape = half, with a top-5 ranking under
   each map. `title` names the section; `eventName` is the event filtered on. */
function eventMapsPage(eventName,title){
  const want=evKey(eventName);
  const evs=team=>rows.filter(r=>r.team===team&&evKey(r.event)===want&&r.pXY);
  const hA=evs('home'), aA=evs('away');
  if(!hA.length&&!aA.length)return null;
  const top5=team=>{
    const counts={};
    rows.forEach(r=>{
      if(r.team!==team||evKey(r.event)!==want)return;
      const no=String(r.playerFrom||'').trim(); if(!no)return;
      counts[no]=(counts[no]||0)+1;
    });
    const list=Object.entries(counts)
      .sort((x,y)=>y[1]-x[1]||(+x[0]||1e9)-(+y[0]||1e9)).slice(0,5);
    const header=`<table class="rpt" style="margin-top:10px"><thead><tr><th>Rank</th>`
      +`<th style="text-align:left">Player</th><th>Total</th></tr></thead>`;
    if(!list.length){   // no data -> dashed placeholder rows, like the reference
      let h='';
      for(let i=1;i<=5;i++)h+=`<tr><td style="color:${C.mut}">${i}</td>`
        +`<td style="text-align:left;color:#c9cfd9">–</td><td style="color:#c9cfd9">–</td></tr>`;
      return `<div class="rp-rk rp-rk-lg">`+header+`<tbody>${h}</tbody></table></div>`;
    }
    const roster=(lineups[team]&&lineups[team].roster)||[];
    const nameOf=no=>{const p=roster.find(q=>String(q.no)===String(no));return p&&p.name?p.name:'Player '+no;};
    let prev=null;
    const trs=list.map(([no,t],i)=>{
      const tied=prev===t; prev=t;
      const hi=i===0?`background:${C.band};color:${C.navy};font-weight:800;`:'';
      return `<tr><td style="${hi}color:${i===0?C.navy:C.mut}">${tied?'':i+1}</td>`
        +`<td style="${hi}text-align:left">${esc(no)}.&nbsp;${esc(nameOf(no))}</td><td style="${hi}">${t}</td></tr>`;
    }).join('');
    return `<div class="rp-rk rp-rk-lg">`+header+`<tbody>${trs}</tbody></table></div>`;
  };
  // a side with no data keeps the empty pitch; drawn end-on and attacking UP, for the
  // same reason the defensive category maps are (see actionMapsPage)
  const card=(team,list)=>{
    const N=normXY(team), d=PITCH_DIMS.football, W=d.h, H=d.w;
    const dots=list.map(r=>{
      const p=N(r).a, x=p.y/100*W, y=(100-p.x)/100*H;
      // one shape for both halves, like every other map in the report — the shirt number
      // inside is what this marker is for, and the ranking under it is where the rest is
      const shape=`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="16" fill="${TC(team)}" fill-opacity="0.94" stroke="#fff" stroke-width="2.5"/>`;
      return `<g>${shape}<text x="${x.toFixed(1)}" y="${(y+5.5).toFixed(1)}" text-anchor="middle" font-size="16" font-weight="800" fill="${C.on(TC(team))}">${esc(String(r.playerFrom||'').trim())}</text></g>`;
    }).join('');
    const map=`<div class="rp-vmap">${vPitchSVG(dots)}</div>`;
    return `<div style="flex:1;min-width:0"><div class="rp-mtitle" style="color:${TI(team)}">`
      +`${esc(TN(team))}<span class="rp-mdir">▲ attacking</span></div>${map}${top5(team)}</div>`;
  };
  // no legend: one marker shape, and the number in it is the shirt that did it
  return secTitle(title)
    +`<div style="display:flex;gap:18px;align-items:flex-start">${card('home',hA)}${card('away',aA)}</div>`;
}
const offsideMapsPage=()=>eventMapsPage('offside','Fouls — Offsides');
const foulWonMapsPage=()=>eventMapsPage('foul won','Fouls — Fouls Won');

/* ---- Fouls: the comparison, and the cards coming home ----
   TEAM_SECTIONS[5] is 'Fouls & Discipline' (shared.js:943): Total Fouls, the three kinds
   that make it up, Fouls Won, Yellow, Red, Offsides.

   Yellow and Red matter here beyond being two more rows. The page they used to be on —
   'Goalkeeper & Discipline' — was the ONLY place in the whole PDF that printed a card,
   and it is gone. These two rows are where they land, counted by the same classifyCards()
   the old box counted them with (through computeStats -> cardFold), so the number did not
   change; only the page it is on. The per-player split is on Fouls — Player Stats, which
   the report never had at all. */
const foulComparisonPage=()=>{
  const r=sectionRows(5);
  return secTitle('Fouls — Team Comparison')+legend()
    +`<div class="rp-cmphead">Fouls &amp; Discipline</div>`+cmpRows(r,cmpFit(r.length));
};
const foulPlayerPages=()=>teamPlayerPages('Fouls — Player Stats',PLAYER_CATS.fouls);

/* ================= set-piece chains (read-only) =================
   Every chain of this team that a set piece of `kind` OPENS, with the rows it led to.

   Deliberately NOT setPieceFold() (shared.js:370). That one credits the player who
   FINISHED, asks only "is a set piece somewhere in this chain", cannot tell a corner from
   a goal kick, and counts no passes at all. It also feeds the Stats table AND the client
   site's whole-season Data page, so changing it changes a season of numbers on a screen
   this file has no business touching.

   `ord` is what makes "opens" answerable: the position of a row within the entry it was
   typed in (index.html:2710). It has been on every row since chains existed and nothing
   has ever read it. A set piece typed AFTER the shot it supposedly created did not cause
   it, and this is the only field that can say so.

   A set piece typed on its own has grp === null and therefore no chain — a group id is
   only minted for an entry of two events or more. Those count in `taken` and never in
   `chains`. The gap between the two is itself the answer to "how much of this was
   tagged", so both numbers are printed and neither is derived from the other. */
function spChains(team,kind){
  const want=evKey(kind), mine=rows.filter(r=>r.team===team);
  const taken=mine.filter(r=>evKey(r.event)===want).length;
  const byGrp=new Map();
  mine.forEach(r=>{if(r.grp!=null){
    const g=byGrp.get(r.grp); if(g)g.push(r); else byGrp.set(r.grp,[r]);}});
  const chains=[];
  byGrp.forEach(list=>{
    const ordOf=r=>+r.ord||0;
    const sps=list.filter(r=>SET_PIECE_EVENTS.has(evKey(r.event))).sort((a,b)=>ordOf(a)-ordOf(b));
    if(!sps.length||evKey(sps[0].event)!==want)return;   // a different set piece opened it
    const sp=sps[0], o=ordOf(sp);
    chains.push({sp,out:list.filter(r=>r!==sp&&ordOf(r)>o).sort((a,b)=>ordOf(a)-ordOf(b))});
  });
  return {taken,chains};
}
/* What one row of a chain says happened. Anything else in the entry — a body part, a
   card, a duel — is not an outcome and answers null. `goal` sits with `shot on target`
   because EVENT_INC already counts it as one (shared.js:192); that is the repo's
   convention, not a decision taken here. */
const SP_OUT={'pass success':{kind:'pass',ok:true},   'pass fail':{kind:'pass',ok:false},
  'cross success':{kind:'cross',ok:true},             'cross fail':{kind:'cross',ok:false},
  'shot on target':{kind:'shot',ok:true},             'goal':{kind:'shot',ok:true},
  'shot off target':{kind:'shot',ok:false}};
/* Where each set piece of this kind went, in normalised pitch percentages.

   ⚠️ The arrow is drawn from the row that says what HAPPENED, never from the set-piece
   row. No set-piece event is one of TRANSFER_EVENTS (index.html:2463), and rXY only lands
   on the last transfer of an entry — so a set-piece row keeps an rXY only when it happens
   to be the final key of the entry and nothing was passed. Drawn from there, this map
   would be a picture of the tagger's typing habits rather than of the match.

   A row with no destination is a dot, never an invented line. A chain that produced
   nothing tagged falls back to the set piece's own rXY, which is exactly the one case
   where that field means what it looks like it means. */
function spSegments(team,kind){
  const N=normXY(team), out=[];
  /* A chain that produced nothing tagged draws NOTHING. It used to leave a grey dot for
     "taken, outcome unknown", which put a third reading on a map that answers one question —
     did it come off — and, for a corner or a goal kick, marked a spot that is the definition
     of the set piece rather than a fact about the match. Nothing is lost by dropping it:
     spChains().taken still counts every one of them, tagged or not, and the player tables
     print that count. */
  spChains(team,kind).chains.forEach(c=>{
    const sn=N(c.sp);
    c.out.forEach(r=>{
      const o=SP_OUT[evKey(r.event)]; if(!o)return;
      const rn=N(r), a=rn.a||sn.a; if(!a)return;
      /* `from` is the shirt that played the ball, and it is written INTO the dot on every
         set-piece map. Off the outcome row rather than off the set-piece row: they are the
         same man on a goal kick, but on a corner swung in and headed on they are not, and
         the dot marks where the ball was struck. Falls back to the taker when the outcome
         row was typed without a number. */
      out.push({a:a, b:rn.b||null, kind:o.kind, ok:o.ok,
        to:String(r.playerTo||'').trim(),
        from:String(r.playerFrom||c.sp.playerFrom||'').trim()});
    });
  });
  return out;
}
// green succeeded / red failed, exactly as the cross map reads
const spCol=s=>s.ok?'#39d98a':'#f7506b';

/* ================= goalkeeper ================= */
/* save-rate ring (grey track + coloured arc, % in the middle). Unchanged from the page
   this section replaces — it was the one part of it worth keeping. */
function gkArcSVG(rate,col){
  const cx=33,cy=33,r=25,w=7, a0=-Math.PI/2;
  let ring=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e6eaf0" stroke-width="${w}"/>`;
  if(rate!=null&&rate>0)ring+=rate>=100
    ?`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="${w}"/>`
    :`<path d="${arcPath(cx,cy,r,a0,a0+rate/100*2*Math.PI)}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`;
  return `<svg viewBox="0 0 66 66" width="66" height="66">${ring}`
    +`<text x="${cx}" y="${cy+5}" text-anchor="middle" font-size="15" font-weight="800" fill="${C.navy}">`
    +`${rate==null?'–':rate+'%'}</text></svg>`;
}
/* The on-target shots this team's keeper faced, in the goal's own frame.

   ⚠️ THE ONLY function in this file that filters r.team !== team. Every map above opens
   with `r.team===team`; this one has to read the OTHER side, because gXY is written on
   three events only — shot on target, goal, own goal (index.html:1354) — and all three
   belong to whoever struck the ball. A keeper's own events (catch, parry, goal conceded)
   carry a pitch spot and nothing in the goal at all. This is not a bug. Do not "fix" it.

   ⚠️ goalMarksV() above is not a substitute: it filters SHOT_KINDS, which does not carry
   'own goal' (shared.js:605), so a ball put through your own net — which IS a goal past
   this keeper and does carry gXY — would be silently dropped. */
function gkFaced(team){
  const opp=team==='home'?'away':'home';
  return rows.filter(r=>{
      if(!r.gXY||r.t==null)return false;
      const e=evKey(r.event);
      if(r.team===opp)return e==='shot on target'||e==='goal';
      return r.team===team&&e==='own goal';
    })
    .sort((a,b)=>a.t-b.t)
    .map((r,i)=>{
      const e=evKey(r.event), own=e==='own goal', conceded=own||e==='goal';
      return {idx:i+1,t:r.t,row:r,own,conceded,team:r.team,
        x:r.gXY.x,y:r.gXY.y,color:conceded?C.red:C.green,square:own};
    });
}
/* Every goal this team let in, spot or no spot: the opposition's goals plus its own
   players' own goals — the same sum teamGoals() takes for the other side. Not read off
   gkFaced(): that one needs a gXY, and a keeper's record should not depend on whether
   somebody placed the ball in the goal mouth. */
function gkConcededRows(team){
  const opp=team==='home'?'away':'home';
  return rows.filter(r=>{
    if(r.t==null)return false;
    const e=evKey(r.event);
    return (r.team===opp&&e==='goal')||(r.team===team&&e==='own goal');
  });
}
/* One keeper's line at the top of his two pages.

   `saves` is s.saves — the BROAD reading, which counts catch, parry and the retired
   `save` name (shared.js:262). It is the figure the report has always printed here. The
   Goalkeeper — Player Stats table uses the narrow catches+parries that PLAYER_CATS
   defines, and the page says so under the Details table rather than leaving a reader to
   find the difference.

   Conceded is split between two keepers by who was on the pitch when the ball went in
   (onPitchAt, shared.js:863). With one keeper there is nothing to split and the team's
   total is his, which also keeps a match with no formation board from reading 0. */
function gkRow(team,no,keepers){
  const key=String(no==null?'':no).trim();
  const P=computeStats(rows,team), s=P[key]||newStat();
  const mins=playedMinutes(lineups,dur,team,rows);
  const m=mins&&mins[key];
  const gcRows=gkConcededRows(team);
  const conceded=(keepers&&keepers.length>1)
    ? gcRows.filter(r=>onPitchAt(lineups,team,r.t).has(key)).length
    : gcRows.length;
  const faced=s.saves+conceded;
  // a goal kick answers "did it find a team-mate" only when the entry said what happened
  const gk=spChains(team,'goal kick');
  let gkOk=0, gkAns=0;
  gk.chains.forEach(c=>{
    if(String(c.sp.playerFrom||'').trim()!==key)return;
    const t=c.out.map(r=>SP_OUT[evKey(r.event)]).filter(o=>o&&(o.kind==='pass'||o.kind==='cross'))[0];
    if(t){gkAns++; if(t.ok)gkOk++;}
  });
  return {no:key, name:playerLabel(squadNames(lineups,team),key),
    min:m?m.min:null, saves:s.saves, conceded, faced,
    rate:faced?Math.round(s.saves/faced*100):null,
    gkOk, gkAns, gkRate:gkAns?Math.round(gkOk/gkAns*100):null};
}
/* The keeper line, one row per shirt gkShirts() finds — it walks lineups.history as well
   as the starting XI, so a side that changed keeper gets two rows and never one blurred
   average. A board with no GK filled in gives an empty set, and the table says that in a
   sentence rather than printing a row of zeroes about nobody. */
function gkRowsHTML(team){
  const keepers=[...gkShirts(lineups,team)];
  const pcs=v=>v==null?'<span style="color:#c9cfd9">–</span>':v.toFixed(1)+'%';
  if(!keepers.length)
    return `<div class="rp-note" style="font-size:11px;margin:0 0 14px">`
      +`No keeper is marked GK in ${esc(TN(team))}'s line-up, so no keeper can be named here. `
      +`The maps below still show every save and every goal this side's goal let in.</div>`;
  const tr=no=>{const g=gkRow(team,no,keepers);
    return `<tr><td class="rp-gkl">${pill(g.no,team)}</td>`
      +`<td class="rp-gkl">${esc(g.name)}</td>`
      +`<td>${g.min==null?'<span style="color:#c9cfd9">–</span>':esc(g.min)+"'"}</td>`
      +`<td><b>${g.rate==null?'–':pcs(g.rate)}</b></td>`
      +`<td><b>${g.gkRate==null?'–':pcs(g.gkRate)}</b></td></tr>`;};
  return `<table class="rp-gkrow"><thead><tr><th class="rp-gkl">Num.</th><th class="rp-gkl">Name</th>`
    +`<th>Minutes Played</th><th>Save Rate (%)</th><th>Goal Kick Success Rate</th></tr></thead>`
    +`<tbody>${keepers.map(tr).join('')}</tbody></table>`;
}
/* The keeper's own event names — no longer drawn on the map, but still the fallback
   gkPlayerPages() uses to find which shirt kept goal when no formation board named one.
   Unchanged from when this list also coloured the pitch dots. */
const GK_EV={'catch':1,'parry':1,'save':1,'goal conceded':1,'own goal':1};
/* The shots this keeper faced, on a pitch stood on its end with HIS goal at the top,
   plotted where each was STRUCK FROM — the opposition player's ground, not the keeper's.
   Same rows as the goal mouth above (gkFaced), so a dot on the grass and its mark in the
   mouth carry the same number: struck from here, ended up there. Every other vertical map
   in this file attacks UP; this one is that view turned through 180°, because the question
   about a keeper is what happened in front of his goal. normXY has put the team attacking
   right, so x=0 is his own goal line — the line every one of these was aimed at — and
   (100-y, x) stands the pitch on end facing it. Colour = outcome (saved / conceded), the
   own goal a square, exactly as in the mouth. */
function gkPitchDots(team){
  const N=normXY(team), d=PITCH_DIMS.football, W=d.h, H=d.w;
  return gkFaced(team).filter(f=>f.row.pXY)
    .map(f=>{
      const p=N(f.row).a;
      const vx=(100-p.y)/100*W, vy=p.x/100*H;
      // one shape for both halves, like the shooting and defensive maps
      const shape=f.square
        ? `<rect x="${(vx-17).toFixed(1)}" y="${(vy-17).toFixed(1)}" width="34" height="34" rx="4" fill="${f.color}" stroke="#fff" stroke-width="3"/>`
        : `<circle cx="${vx.toFixed(1)}" cy="${vy.toFixed(1)}" r="17" fill="${f.color}" stroke="#fff" stroke-width="3"/>`;
      return `<g>${shape}<text x="${vx.toFixed(1)}" y="${(vy+6).toFixed(1)}" `
        +`text-anchor="middle" font-size="17" font-weight="800" fill="${C.on(f.color)}">${f.idx}</text></g>`;
    }).join('');
}
// "Defending ↓" marker: the twin of vUpArrowSVG, pointing at the goal this page is about
function vDownArrowSVG(){
  const d=PITCH_DIMS.football, W=d.h, H=d.w, cx=W/2;
  return `<g opacity="0.5" stroke="#fff" fill="none" stroke-width="7">`
    +`<line x1="${cx}" y1="${(H*0.28).toFixed(0)}" x2="${cx}" y2="${(H*0.45).toFixed(0)}"/>`
    +`<polyline points="${cx-17},${(H*0.412).toFixed(0)} ${cx},${(H*0.45).toFixed(0)} ${cx+17},${(H*0.412).toFixed(0)}"/></g>`
    +`<text x="${cx}" y="${(H*0.238).toFixed(0)}" text-anchor="middle" font-size="26" fill="#fff" opacity="0.6">Defending</text>`;
}
function gkSavesPage(team){
  const s=sumTeam(rows,team), faced=gkFaced(team);
  const conceded=gkConcededRows(team).length;
  const rate=(s.saves+conceded)?Math.round(s.saves/(s.saves+conceded)*100):null;
  const names=squadNames(lineups,team==='home'?'away':'home');
  const ourNames=squadNames(lineups,team);
  const marks=faced.map(f=>({x:f.x,y:f.y,label:f.idx,color:f.color,square:f.square}));
  /* The map — mouth and grass alike — is the opposition's on-target shots now, not the
     keeper's own events, so the key reads by OUTCOME: a saved shot, a goal, an own goal. */
  const left=`<div class="rp-sgleft"><div class="rp-mtitle" style="color:${TI(team)}">Event Map</div>`
    +`<div class="rp-mleg rp-sgleg"><span><i style="background:${C.green}"></i>Saved</span>`
    +`<span><i style="background:${C.red}"></i>Goal</span>`
    +`<span><i style="background:${C.red};border-radius:2px"></i>Own goal</span></div>`
    +`<div class="rp-goalmouth">${goalMouthSVG(marks,{net:'#c7d0dc',frame:'#8f99a6',ink:'#152233',ring:'#fff'})}</div>`
    +vPitchSVG(vDownArrowSVG()+gkPitchDots(team))+`</div>`;
  const own=faced.filter(f=>f.own).length;
  const dtl=[['Total',faced.length,null],['Catches',s.catches,C.green],['Parries',s.parries,'#2f81f7'],
    ['Goals Conceded',conceded,C.red],['Own Goals',own,C.red]];
  const dtlHTML=`<table class="rp-dtl"><tbody>`
    +dtl.map((d,i)=>`<tr${i?'':' class="rp-dtlt"'}><td class="rp-dtlb"${d[2]?` style="background:${d[2]}"`:''}></td>`
      +`<td>${d[0]}</td><td>${d[1]}</td></tr>`).join('')+`</tbody></table>`;
  const tr=f=>{const r=f.row, no=String(r.playerFrom||'').trim();
    return `<tr><td class="el-c"><span class="rp-elidx" style="background:${f.color};color:${C.on(f.color)}">${f.idx}</span></td>`
      +`<td class="el-c">${esc(no)}</td>`
      +`<td class="el-c">${esc(minLbl(matchTime(r.t),eventHalf(r)))}</td>`
      +`<td>${esc(playerLabel(f.own?ourNames:names,no))}${f.own?' <em style="font-style:normal;color:'+C.mut+'">(own goal)</em>':''}</td>`
      +`<td>${shotBodyPart(rows,r)?esc(shotBodyPart(rows,r)):'<span style="color:#c9cfd9">–</span>'}</td></tr>`;};
  const table=slice=>`<table class="rpt rpt-el"><thead><tr><th class="el-c">#</th><th class="el-c">Num</th>`
    +`<th class="el-c">Time</th><th>Opponent</th><th>Body Part</th></tr></thead>`
    +`<tbody>${slice.map(tr).join('')}</tbody></table>`;
  const FIRST=18, CONT=33;
  const right=`<div class="rp-sgright"><div class="rp-mtitle">Details</div>`
    +`<div class="rp-gkbody2"><div class="rp-gkring">${gkArcSVG(rate,TC(team))}<div>Save rate</div></div>`
    /* Saves here is the broad reading (s.saves, which also carries the retired `save`
       event) while Goalkeeper — Player Stats prints the narrow catches+parries that
       PLAYER_CATS defines. The footnote that used to say so on the page is gone — this is
       a document a club reads, not a tagging manual — so the difference is recorded here
       and in docs/match-report-sections-design.md §6.2 instead. */
    +`<div style="flex:1;min-width:0">${dtlHTML}</div></div>`
    +`<div class="rp-mtitle" style="margin-top:13px">Event List</div>`
    +(faced.length?table(faced.slice(0,FIRST))
      :`<div class="rp-note">No shots on target faced.</div>`)
    +`</div>`;
  const title='Goalkeeper — Saves';
  const pages=[secTitle(title,team)+gkRowsHTML(team)+`<div class="rp-sgwrap">${left}${right}</div>`];
  for(let i=FIRST;i<faced.length;i+=CONT)
    pages.push(secTitle(title,team)
      +`<div class="rp-sgcont"><div class="rp-mtitle">Event List</div>${table(faced.slice(i,i+CONT))}</div>`);
  return pages;
}
/* TEAM_SECTIONS[3] is 'Goalkeeper Stats' (shared.js:927). Reached by index like the three
   above it, and appended rather than inserted for exactly that reason — see the note on
   TEAM_SECTIONS. Nothing in shared.js changes; this only reads one more of them. */
const gkComparisonPage=()=>{
  const r=sectionRows(3);
  return secTitle('Goalkeeper — Team Comparison')+legend()
    +`<div class="rp-cmphead">Goalkeeper</div>`+cmpRows(r,cmpFit(r.length));
};
/* Keepers only, the same set the Stats tab's Goalkeeper table draws. A side whose board
   names no GK gets the shirts that were actually tagged doing a keeper's job instead, so a
   match with no line-up still says something rather than printing an empty table. */
const gkPlayerPages=()=>teamPlayerPages('Goalkeeper — Player Stats',RPT_GK_COLS,team=>{
  const s=gkShirts(lineups,team);
  if(s.size)return s;
  const out=new Set();
  rows.forEach(r=>{if(r.team===team&&GK_EV[evKey(r.event)]&&evKey(r.event)!=='own goal'){
    const no=String(r.playerFrom||'').trim(); if(no)out.add(no);}});
  return out;
});

/* ================= set pieces ================= */
/* Goal kicks: where they went, how far, and who received them. The keeper line from the
   Saves page is repeated at the top, because a goal kick is the keeper's ball. */
function goalKickPage(team){
  const N=normXY(team), d=PITCH_DIMS.football, W=d.h, H=d.w;
  const {taken,chains}=spChains(team,'goal kick');
  const segs=spSegments(team,'goal kick');
  // the same metres and the same three bands passTypeData() uses for every other pass in
  // the report, so one kick can never be Long on one page and Medium on another
  const XM=105, YM=68;
  const band=s=>{
    if(!s.b)return null;
    const dx=(s.b.x-s.a.x)/100*XM, dy=(s.b.y-s.a.y)/100*YM, m=Math.hypot(dx,dy);
    return m>30?0:(m>=15?1:2);
  };
  const rowsD=[[0,0],[0,0],[0,0]];
  segs.forEach(s=>{if(s.ok==null)return; const b=band(s); if(b==null)return;
    rowsD[b][1]++; if(s.ok)rowsD[b][0]++;});
  const tot=rowsD.reduce((a,b)=>[a[0]+b[0],a[1]+b[1]],[0,0]);
  const dRow=(lbl,rng,p)=>`<tr><td style="text-align:left"><b>${lbl}</b>`
    +`<span style="color:${C.mut};font-weight:400"> ${rng}</span></td>`
    +`<td>${pc0(p[0],p[1])}</td><td>${p[0]}</td><td>${p[1]}</td></tr>`;
  const dist=`<table class="rpt"><thead><tr><th style="text-align:left">Distance</th>`
    +`<th>Success Rate</th><th>Succeeded</th><th>Total</th></tr></thead><tbody>`
    +dRow('Long','[ &gt; 30m ]',rowsD[0])+dRow('Medium','[ 15 - 30m ]',rowsD[1])
    +dRow('Short','[ &lt; 15m ]',rowsD[2])
    +`<tr><td style="text-align:left;font-weight:800;color:${C.navy}">Total</td>`
    +`<td style="font-weight:800;color:${C.navy}">${pc0(tot[0],tot[1])}</td>`
    +`<td style="font-weight:800;color:${C.navy}">${tot[0]}</td>`
    +`<td style="font-weight:800;color:${C.navy}">${tot[1]}</td></tr></tbody></table>`;
  // who the ball reached, off playerTo of the row that says it arrived
  const rec={};
  segs.forEach(s=>{if(s.ok&&s.to)rec[s.to]=(rec[s.to]||0)+1;});
  const names=squadNames(lineups,team);
  const list=Object.entries(rec).sort((a,b)=>b[1]-a[1]||(+a[0]||1e9)-(+b[0]||1e9)).slice(0,8);
  const recHTML=`<table class="rpt" style="margin-top:8px"><thead><tr><th>Rank</th>`
    +`<th style="text-align:left">Player</th><th>Count</th></tr></thead><tbody>`
    +(list.length?list.map((p,i)=>{
        const hi=i===0?`background:${C.band};color:${C.navy};font-weight:800;`:'';
        return `<tr><td style="${hi}color:${i===0?C.navy:C.mut}">${i+1}</td>`
          +`<td style="${hi}text-align:left">${esc(p[0])}.&nbsp;${esc(playerLabel(names,p[0]))}</td>`
          +`<td style="${hi}">${p[1]}</td></tr>`;}).join('')
      :[1,2,3,4,5].map(i=>`<tr><td style="color:${C.mut}">${i}</td>`
        +`<td style="text-align:left;color:#c9cfd9">–</td><td style="color:#c9cfd9">–</td></tr>`).join(''))
    +`</tbody></table>`;
  // the map: the kick, and the arrow to wherever the entry said the ball went
  /* The line is drawn under every dot, and every dot carries the shirt that played the
     ball. Goal kicks all start within a couple of metres of each other, so the markers
     overlap: drawing all the lines first keeps a line from being laid across the number of
     the kick beside it. r=15 rather than 12 is the room two digits need at this scale. */
  const arrows=segs.map(s=>{
    if(!s.b)return '';
    const col=spCol(s), ax=(s.a.y)/100*W, ay=(100-s.a.x)/100*H;
    const bx=(s.b.y)/100*W, by=(100-s.b.x)/100*H;
    return `<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" `
      +`stroke="${col}" stroke-width="5" stroke-dasharray="11 9" opacity="0.9" marker-end="url(#rpGkA${team}${s.ok?'y':'n'})"/>`;
  }).join('')
  +segs.map(s=>{
    const col=spCol(s), ax=(s.a.y)/100*W, ay=(100-s.a.x)/100*H;
    return `<g><circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="15" fill="${col}" stroke="#fff" stroke-width="2.5"/>`
      +(s.from?`<text x="${ax.toFixed(1)}" y="${(ay+5).toFixed(1)}" text-anchor="middle" font-size="15" `
        +`font-weight="800" fill="${C.on(col)}">${esc(s.from)}</text>`:'')+`</g>`;
  }).join('');
  const defs=`<defs>`
    +[['y','#39d98a'],['n','#f7506b']].map(m=>`<marker id="rpGkA${team}${m[0]}" viewBox="0 0 10 10" refX="8" refY="5" `
      +`markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${m[1]}"/></marker>`).join('')
    +`</defs>`;
  const map=`<div class="rp-vmap">`
    +`<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block;border-radius:7px">${defs}`
    +`${grassSVG(W,H,true)}<g transform="translate(0 ${H}) rotate(-90)">`
    +`<g fill="none" stroke="rgba(255,255,255,0.88)" stroke-width="4">${pitchFootball(H,W,false)}</g></g>`
    +vUpArrowSVG()+arrows+`</svg></div>`;
  const left=`<div class="rp-sgleft"><div class="rp-mtitle" style="color:${TI(team)}">Event Map</div>`
    +`<div class="rp-mleg rp-sgleg"><span><i style="background:#39d98a"></i>Succeeded</span>`
    +`<span><i style="background:#f7506b"></i>Fail</span></div>${map}</div>`;
  const right=`<div class="rp-sgright"><div class="rp-mtitle">Details</div>${dist}`
    +`<div class="rp-mtitle" style="margin-top:13px">Player Receiving Passes</div>${recHTML}</div>`;
  /* No keeper line here. It says the same five things it says at the top of Goalkeeper —
     Saves, and Save Rate is not a fact about a goal kick; the one figure of it that IS —
     Goal Kick Success Rate — is the Total row of the Distance table on this very page.
     Goalkeeper — Saves keeps the line, which is where a reader asks about the keeper. */
  return secTitle('Set Pieces — Goal Kicks',team)
    +`<div class="rp-sgwrap">${left}${right}</div>`;
}
/* Free-kicks and corners: one pitch per side, the same shape the cross map draws — home
   attacking RIGHT, away mirrored LEFT, thirds of the pitch read across the top for where
   it was taken and down the side for where it arrived.

   Colour says succeeded or failed; SHAPE says which of the four things it was. Two
   readings on one picture, and neither colour nor shape carrying two jobs. */
const SP_KIND={'free-kick':'Free-kicks','corner-kick':'Corners'};
function spArrowSVG(team,kind){
  const d=PITCH_DIMS.football, PW=d.w, PH=d.h, mT=76, mR2=150, W=PW+mR2, H=PH+mT;
  const flip=team==='away';
  const F=p=>p?{x:(flip?100-p.x:p.x)/100*PW, y:(flip?100-p.y:p.y)/100*PH}:null;
  // `from` travels with the point: it is the number drawn inside the marker
  const segs=spSegments(team,kind).map(s=>({a:F(s.a),b:F(s.b),kind:s.kind,ok:s.ok,from:s.from}));
  const oCnt=[0,0,0]; segs.forEach(s=>oCnt[Math.min(2,Math.floor(s.a.x/PW*3))]++);
  const tgt=segs.filter(s=>s.b), tCnt=[0,0,0];
  tgt.forEach(s=>tCnt[Math.min(2,Math.floor(s.b.y/PH*3))]++);
  const pctL=(n,dd)=>dd?(Math.round(n/dd*1000)/10)+'%':'0%';
  let over='';
  for(let i=0;i<3;i++)over+=`<text x="${((i+0.5)*PW/3).toFixed(0)}" y="42" text-anchor="middle" font-size="30" font-weight="700" fill="${TC(team)}">${pctL(oCnt[i],segs.length)}</text>`;
  [1,2].forEach(i=>over+=`<line x1="${i*PW/3}" y1="10" x2="${i*PW/3}" y2="${mT-16}" stroke="${C.line}" stroke-width="2"/>`);
  for(let i=0;i<3;i++)over+=`<text x="${PW+mR2/2}" y="${(mT+(i+0.5)*PH/3+10).toFixed(0)}" text-anchor="middle" font-size="30" font-weight="700" fill="${TC(team)}">${pctL(tCnt[i],tgt.length)}</text>`;
  [1,2].forEach(i=>over+=`<line x1="${PW+18}" y1="${mT+i*PH/3}" x2="${W-18}" y2="${mT+i*PH/3}" stroke="${C.line}" stroke-width="2"/>`);
  const id=n=>'rpSp'+kind.replace(/[^a-z]/g,'')+team+n;
  // two arrowheads, because there are two outcomes: it came off, or it did not
  const defs=`<defs>`+[['y','#39d98a'],['n','#f7506b']].map(m=>
    `<marker id="${id(m[0])}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.5" markerHeight="4.5" `
    +`orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${m[1]}"/></marker>`).join('')+`</defs>`;
  /* Lines first, markers over them, so no arrow is laid across the shirt number of the
     set piece beside it. Every marker carries that number — a triangle at 60% of its height
     is as wide as the circle is, which is where two digits go. */
  const num=(s,x,y,col)=>s.from
    ?`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" font-size="14" `
      +`font-weight="800" fill="${col}">${esc(s.from)}</text>`:'';
  const seg=segs.map(s=>{
    if(s.kind==='shot'||!s.b)return '';
    const col=spCol(s), mk=id(s.ok?'y':'n');
    return `<line x1="${s.a.x.toFixed(1)}" y1="${s.a.y.toFixed(1)}" x2="${s.b.x.toFixed(1)}" y2="${s.b.y.toFixed(1)}" `
      +`stroke="${col}" stroke-width="4"${s.kind==='cross'?' stroke-dasharray="9 8"':''} opacity="0.9" marker-end="url(#${mk})"/>`;
  }).join('')
  +segs.map(s=>{
    const col=spCol(s);
    if(s.kind==='shot'){
      // a shot has no destination — it is drawn where it was struck, filled when on target
      const x=s.a.x, y=s.a.y;
      const p=`${x.toFixed(1)},${(y-19).toFixed(1)} ${(x-18).toFixed(1)},${(y+13).toFixed(1)} ${(x+18).toFixed(1)},${(y+13).toFixed(1)}`;
      return `<g>`+(s.ok?`<polygon points="${p}" fill="${col}" stroke="#fff" stroke-width="2"/>`
                        :`<polygon points="${p}" fill="none" stroke="${col}" stroke-width="5"/>`)
        +num(s,x,y+10,s.ok?C.on(col):col)+`</g>`;
    }
    return `<g><circle cx="${s.a.x.toFixed(1)}" cy="${s.a.y.toFixed(1)}" r="13" fill="${col}" stroke="#fff" stroke-width="1.5"/>`
      +num(s,s.a.x,s.a.y+4.8,C.on(col))+`</g>`;
  }).join('');
  const pitch=`<g transform="translate(0 ${mT})">${grassSVG(PW,PH,false)}`
    +`<g fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="3">${pitchFootball(PW,PH,false)}</g>`
    +`${dirArrowSVG(flip?'left':'right')}${seg}</g>`;
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block">${defs}${over}${pitch}</svg>`;
}
function spArrowPage(team,kind){
  const label=SP_KIND[kind]||kind;
  return secTitle('Set Pieces — '+label,team)
    +`<div class="rp-mapcard"><div class="rp-mtitle" style="color:${TI(team)}">${esc(TN(team))} · ${label}</div>`
    +`<div style="width:660px;margin:0 auto">${spArrowSVG(team,kind)}</div></div>`
    +`<div class="rp-mleg"><span><i style="background:#39d98a"></i>Succeeded</span>`
    +`<span><i style="background:#f7506b"></i>Failed</span>`
    +`<span><i style="background:#98a0aa"></i>Solid line = pass</span>`
    +`<span><i style="background:#98a0aa;border-radius:1px"></i>Dashed line = cross</span>`
    +`<span><i style="background:#98a0aa;border-radius:50% 50% 2px 2px"></i>Triangle = shot</span></div>`;
}
const setPieceComparisonPage=()=>{
  const r=sectionRows(4);
  return secTitle('Set Pieces — Team Comparison')+legend()
    +`<div class="rp-cmphead">Set Pieces</div>`+cmpRows(r,cmpFit(r.length));
};
const setPiecePlayerPages=()=>teamPlayerPages('Set Pieces — Player Stats',PLAYER_CATS.setPieces);

/* ================= table of contents ================= */
/* Every page joins the report under the section it belongs to and, where a section
   has several parts, under which part — the team, or which of its views. The
   contents page is built from those two names: consecutive pages carrying the same
   pair are one entry, so a section that runs over three pages is listed once, at
   the page it opens on.

   It sits after the timeline, which pushes everything behind it down by however
   many pages the contents itself takes. That count is knowable before the numbers
   are — it falls out of the entries, and an entry knows only which page of the
   un-numbered report it opens — so the entries are gathered, split into pages, and
   only then numbered. */
const TOC_H1=31.5, TOC_H2=21.5;   // what a row of each level costs, in page px
const TOC_BUDGET=950;             // what one contents page has left for them under the heading

function tocEntries(pages){
  const out=[]; let sec=null, sub=null;
  pages.forEach((p,i)=>{
    if(p.sec!==sec){out.push({lvl:1,label:p.sec,at:i}); sec=p.sec; sub=null;}
    if(p.sub&&p.sub!==sub){out.push({lvl:2,label:p.sub,at:i}); sub=p.sub;}
  });
  return out;
}
function tocChunks(entries){
  const out=[]; let cur=[], h=0;
  entries.forEach(e=>{
    const eh=e.lvl===1?TOC_H1:TOC_H2;
    if(h+eh>TOC_BUDGET&&cur.length){out.push(cur);cur=[];h=0;}
    cur.push(e); h+=eh;
  });
  if(cur.length)out.push(cur);
  return out;
}
/* `lead` is how many pages come before the contents; a page at or after it is
   numbered past however many pages the contents runs to. */
function contentsPages(pages,lead){
  const entries=tocEntries(pages);
  if(!entries.length)return [];
  const chunks=tocChunks(entries), n=chunks.length;
  const row=e=>{
    const no=e.at<lead?e.at+1:e.at+n+1;
    return `<div class="rp-tocrow rp-toc${e.lvl}"><span class="rp-tocttl">${esc(e.label)}</span>`
      +`<span class="rp-tocgap"></span><span class="rp-tocpg">${no}</span></div>`;
  };
  // the same page header every other page carries — .rp-toch's own heading would be
  // a second title under the first, saying the same thing twice
  return chunks.map(ch=>secTitle('Table of Contents')+ch.map(row).join(''));
}

/* ================= assembly + export ================= */
function buildPages(host){
  sync();
  ensureCss();
  /* Pages are gathered as (section, part, html) rather than as bare html: those two
     names are what the contents page indexes on, so a page cannot join the report
     without saying where it belongs, and cannot go unlisted. A part left null means
     the section has only the one. */
  const P=(sec,sub,pages)=>[].concat(pages).filter(Boolean).map(html=>({html,sec,sub:sub||null}));
  const HOME=TN('home'), AWAY=TN('away');
  const opening=P('Match Timeline',null,timelinePages());
  const body=[
    ...P('Lineups & Formation',HOME,formationPages('home')),
    ...P('Lineups & Formation',AWAY,formationPages('away')),
    /* Shots & Goals is a part of Attacking, not a section beside it: it answers the same
       question the comparison and the player table answer, at a third scale. Three parts,
       in the order a reader wants them — both sides at once, then each side's shots, then
       the men who took them. */
    ...P('Attacking','Team Comparison',attackingComparisonPage()),
    ...P('Attacking','Shots & Goals',shotsAndGoalsPages('home')),
    ...P('Attacking','Shots & Goals',shotsAndGoalsPages('away')),
    ...P('Attacking','Player Stats',attackingPlayerPages()),
    ...P('Distribution','Team Comparison',distributionPage()),
    ...P('Distribution','Pass Networks',netMapsPage()),
    ...P('Distribution','Passes ( 15 Minute Intervals )',netWindowPages()),
    ...P('Distribution','Passing Profile',scatterPage()),
    ...P('Distribution','Pass Heatmap — '+HOME,matrixPage('home')),
    ...P('Distribution','Pass Heatmap — '+AWAY,matrixPage('away')),
    ...P('Distribution','Touch Heatmaps',heatPage()),
    ...P('Distribution','Pass Types',passTypesPage()),
    ...P('Distribution','Cross Maps',crossMapsPage()),
    ...P('Distribution','Take-ons & Step-ins',takeOnMapsPage()),
    ...P('Distribution','Player Stats',distributionPlayerPages()),
    ...P('Defensive','Team Comparison',defensivePage()),
    ...defCategoryPages().reduce((a,c)=>a.concat(P('Defensive',c.sub,c.html)),[]),
    ...P('Defensive','Profile Radar',radarPage()),
    ...P('Defensive','Player Stats',defensivePlayerPages()),
    /* ---- Goalkeeper ----------------------------------------------------
       Where 'Discipline' and 'Goalkeeper & Discipline' used to be. Nothing those two
       printed has been dropped: the keeper's figures are on the comparison below, the
       set pieces on their own comparison, and the cards — which that page was the ONLY
       place in the report to print — are on Fouls — Team Comparison, counted the same
       way, plus a per-player column the report never had. */
    ...P('Goalkeeper','Team Comparison',gkComparisonPage()),
    ...P('Goalkeeper',HOME,gkSavesPage('home')),
    ...P('Goalkeeper',AWAY,gkSavesPage('away')),
    ...P('Goalkeeper','Player Stats',gkPlayerPages()),
    /* ---- Set Pieces ---------------------------------------------------- */
    ...P('Set Pieces','Team Comparison',setPieceComparisonPage()),
    ...P('Set Pieces','Goal Kicks',[goalKickPage('home'),goalKickPage('away')]),
    ...P('Set Pieces','Free-kicks',[spArrowPage('home','free-kick'),spArrowPage('away','free-kick')]),
    ...P('Set Pieces','Corners',[spArrowPage('home','corner-kick'),spArrowPage('away','corner-kick')]),
    ...P('Set Pieces','Player Stats',setPiecePlayerPages()),
    /* ---- Fouls --------------------------------------------------------- */
    ...P('Fouls','Team Comparison',foulComparisonPage()),
    ...P('Fouls','Foul Maps',foulMapsPage()),
    ...P('Fouls','Fouls Won',foulWonMapsPage()),
    ...P('Fouls','Offsides',offsideMapsPage()),
    ...P('Fouls','Player Stats',foulPlayerPages())
  ];
  const list=opening.map(p=>p.html)
    .concat(contentsPages(opening.concat(body),opening.length))
    .concat(body.map(p=>p.html));
  /* Every page says which page it is and which match it belongs to. The contents
     page has always printed page numbers; until now no page printed its own, so
     the one thing the contents was for could not be acted on. Written here rather
     than by each builder — a page's number is a fact about the report, not about
     the section — and out of the flow box, so no builder's row count moves. */
  const line=matchLine(), total=list.length;
  const els=list.map((html,i)=>{
    const d=document.createElement('div');
    d.className='rp-page'; d.innerHTML=html;
    const f=document.createElement('div');
    f.className='rp-foot';
    f.innerHTML=`<span class="rp-footm">${esc(line)}</span>`
      +`<span class="rp-footp">${i+1}<em> / ${total}</em></span>`;
    d.appendChild(f);
    host.appendChild(d);
    return d;
  });
  // heatmap canvases can only be painted once they are in the DOM;
  // away touches are rotated 180° so the away heatmap reads attacking LEFT
  host.querySelectorAll('canvas.rp-heat').forEach(cv=>{
    let pts=touchPoints(cv.dataset.team);
    if(cv.dataset.team==='away')pts=pts.map(t=>Object.assign({},t,{x:100-t.x,y:100-t.y}));
    drawHeat(pts,cv);
  });
  return els;
}

let exporting=false;   // re-entry guard — the button shows live % progress while the export runs
async function exportPdf(){
  if(exporting)return;
  /* Before the guard is set and the button is taken over: sync() is the one
     step that can fail with nothing built yet, and an async function that
     rejects here would do it silently. */
  try{sync();}
  catch(e){console.error('PDF export failed:',e);alert('PDF export failed: '+((e&&e.message)||e));return;}
  if(!rows.length){alert('No data yet.');return;}
  exporting=true;
  const btn=$('expPdf'), orig=btn.textContent;
  const setPct=p=>{btn.textContent='⭳ PDF '+p+'%';};
  btn.disabled=true; setPct(0);
  const host=document.createElement('div');
  host.style.cssText='position:fixed;left:-9999px;top:0;width:794px;background:#fff;z-index:-1';
  try{
    await ensureLibs(); setPct(3);
    document.body.appendChild(host);
    const pages=buildPages(host); setPct(8);
    const pdf=new window.jspdf.jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
    // page rendering is ~all the work: 8% -> 98% spread over the pages
    for(let i=0;i<pages.length;i++){
      const cv=await window.html2canvas(pages[i],{scale:2,backgroundColor:'#ffffff',logging:false});
      if(i)pdf.addPage();
      pdf.addImage(cv.toDataURL('image/jpeg',0.92),'JPEG',0,0,210,297);
      setPct(8+Math.round((i+1)/pages.length*90));
    }
    setPct(100);
    pdf.save(matchName().replace(/[^\w-]+/g,'_')+'_Match_Report.pdf');
  }catch(e){
    console.error('PDF export failed:',e);
    alert('PDF export failed: '+((e&&e.message)||e));
  }finally{
    host.remove();
    btn.disabled=false; btn.textContent=orig;
    exporting=false;
  }
}

/* The button belongs to whichever page is hosting the view. On the Stats page
   it is in the header and is there before this file runs; on the client site
   PTStats renders it at mount time, which happens later — so binding is a
   function the host can call again rather than something done once on load. */
function bind(){const b=$('expPdf'); if(b)b.onclick=exportPdf; return !!b;}
bind();
window.PTReport={buildPages,exportPdf,bind};   // exposed for testing/debugging
})();
