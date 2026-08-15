/* Minutes played — how long each shirt number was actually on the pitch.

   The number is worked out from the formation history, not from the substitution and
   red-card rows: lineups.history holds a SNAPSHOT of the whole XI from each moment on,
   so who was playing is a step function of time and minutes played is the length of the
   stretches a shirt spends inside it. That is what makes it agree with the formation
   board whatever produced the change — two swaps in one entry, a sending-off inside a
   chain, a swap tagged out of order, a period re-tagged afterwards.

   The clock is the MATCH clock: the interval is inside neither half's window, so a swap
   made at half-time is worth 45' to both players, and stoppage time is capped by the
   half, so a man who plays every minute reads 90' and not 96'. */
const {loadShared,loadStats,readSrc}=require('./harness');
const {test,eq,ok,notOk,deepEq}=require('./tiny-test');
const S=loadShared();

/* the fixture the substitution tests use: XI 1/2/4/6/7/8/11/13/14/15/17, bench 3/12/19/20/21 */
const XI=['1','2','4','6','7','8','11','13','14','15','17'];
const BENCH=['3','12','19','20','21'];
/* First half runs to 46:00 of video (so 45+X' exists), the second kicks off at 50:00 and
   is blown at 49:00 of its own — 90+4'. Match second = 2700 + (t - 3000) after the break. */
const DUR={enabled:true,halfLen:45,h1Start:0,h1End:2760,h2Start:3000,h2End:5940};
const v2=m=>3000+(m*60-2700);            // video second at match minute m of the 2nd half

function lineups(over){
  const lu=dir=>({xi:XI.map(no=>({no,x:50,y:50})),subs:BENCH.slice(),dir,
    roster:[...XI,...BENCH].map(no=>({no,name:'P'+no}))});
  return Object.assign({home:lu('lr'),away:lu('rl'),history:[]},over||{});
}
/* A board that writes the same snapshots the tagging app writes: a substitution keeps the
   XI at eleven and puts the outgoing man on the bench, a red card drops it to ten and puts
   him nowhere, a manual save copies whatever is on the pitch. */
function board(team,l){
  l=l||lineups();
  let xi=XI.slice(), subs=BENCH.slice();
  const snap=extra=>Object.assign({t:0,team,xi:xi.map(no=>({no,x:50,y:50})),subs:subs.slice()},extra);
  const api={
    l,
    sub(t,out,inNo){
      xi=xi.filter(n=>n!==out).concat(inNo); subs=subs.filter(n=>n!==inNo).concat(out);
      l.history.push(snap({t,label:'Substitution: '+out+'▼ '+inNo+'▲'}));
      (l[team].subHistory=l[team].subHistory||[]).push({out,in:inNo,t});
      return api;},
    red(t,no){
      xi=xi.filter(n=>n!==no);
      l.history.push(snap({t,off:no,offSpot:{x:50,y:50},label:'Red card: '+no+'🟥'}));
      return api;},
    manual(t){l.history.push(snap({t,label:'Manual @ '+t}));return api;}
  };
  return api;
}
const mins=(l,team,rows)=>S.playedMinutes(l,DUR,team||'home',rows||[]);
const m=(l,no,team)=>{const r=mins(l,team)[String(no)];return r?r.min:null;};
const total=l=>{const P=mins(l);return Object.keys(P).reduce((n,k)=>n+P[k].min,0);};

/* ================= the whole ninety ================= */

test('with nothing tagged after kick-off, every starter reads 90', () => {
  const P=mins(lineups());
  eq(Object.keys(P).length,11,'the eleven, and only the eleven');
  XI.forEach(no=>eq(P[no].min,90,'No.'+no));
  eq(P['7'].h1,2700,'45 minutes of it in the first half');
  eq(P['7'].h2,2700,'and 45 in the second');
  ok(P['7'].exact,'the duration says both halves, so this is not an estimate');
  notOk(P['7'].sentOff);
});

test('substitutes who never came on are not in the answer at all', () => {
  const P=mins(lineups());
  BENCH.forEach(no=>notOk(P[no],'No.'+no+' never played'));
});

test('a first-half whistle past the hour of play is capped, not counted', () => {
  // h1End is 46:00 of video: the 60 seconds of stoppage are 45+1', not a 46th minute
  eq(m(lineups(),'7'),90);
});

/* ================= substitutions ================= */

test('a swap splits the ninety between the two of them', () => {
  const b=board('home').sub(v2(64),'7','3');
  eq(m(b.l,'7'),64,'off at 64');
  eq(m(b.l,'3'),26,'on for the rest');
  eq(total(b.l),990,'and the side still adds up to eleven times ninety');
});

test('a swap made at the interval is 45 and 45', () => {
  // tagged in the break: after the half-time whistle, before the restart. The stretch
  // between the two is in neither window, so neither man is paid for it.
  const b=board('home').sub(2850,'7','3');
  eq(m(b.l,'7'),45); eq(m(b.l,'3'),45);
});

test('a swap tagged a minute after the restart reads as the tag says', () => {
  const b=board('home').sub(v2(46),'7','3');
  eq(m(b.l,'7'),46,'the number follows the moment it was tagged…');
  eq(m(b.l,'3'),44,'…on both sides of it');
});

test('two pairs in one window are two separate splits', () => {
  const l=lineups();
  const b=board('home',l);
  b.sub(v2(64),'7','3'); b.sub(v2(64),'13','21');
  eq(m(l,'7'),64); eq(m(l,'3'),26);
  eq(m(l,'13'),64); eq(m(l,'21'),26);
  eq(total(l),990);
});

test('a substitute taken off later keeps only the stretch he played', () => {
  const b=board('home').sub(v2(46),'7','3');
  b.sub(v2(70),'3','12');
  eq(m(b.l,'7'),46); eq(m(b.l,'3'),24); eq(m(b.l,'12'),20);
  eq(total(b.l),990);
});

test('a man brought on deep in stoppage has played, however little the clock moved', () => {
  const b=board('home').sub(5760,'7','3');     // 90+6' — past the cap on both sides of the swap
  eq(m(b.l,'7'),90,'the man he replaced played every minute there was');
  eq(m(b.l,'3'),1,'and he is not shown as never having been on');
});

/* ================= red cards ================= */

test('a sending-off stops his clock and nobody else’s', () => {
  const b=board('home').red(v2(60),'13');
  const P=mins(b.l);
  eq(P['13'].min,60); ok(P['13'].sentOff,'and it is known to be a sending-off');
  XI.filter(n=>n!=='13').forEach(no=>eq(P[no].min,90,'No.'+no+' plays on'));
  eq(total(b.l),990-30,'the side is short by exactly what he did not play');
});

test('a red card in first-half stoppage is capped at 45', () => {
  const b=board('home').red(2730,'13');        // 45+30" of video, inside the first-half window
  eq(m(b.l,'13'),45);
});

test('two sendings-off take two clocks down', () => {
  const l=lineups(); const b=board('home',l);
  b.red(v2(60),'13'); b.red(v2(75),'14');
  eq(m(l,'13'),60); eq(m(l,'14'),75);
  eq(total(l),990-30-15);
});

test('a red card then a substitution: ten men, and the substitute is paid from his own minute', () => {
  const l=lineups(); const b=board('home',l);
  b.red(v2(60),'13'); b.sub(v2(70),'7','3');
  eq(m(l,'13'),60); eq(m(l,'7'),70); eq(m(l,'3'),20);
  notOk(mins(l)['3'].sentOff,'the substitute was not the one sent off');
});

/* ================= the awkward ways a match gets tagged ================= */

test('snapshots written out of order are read in order', () => {
  // the analyst tagged the late swap first, then rewound for the early one
  const early=board('home').sub(v2(70),'7','3').l;
  early.history.reverse();
  const late=lineups(); const b=board('home',late);
  b.sub(v2(70),'7','3');
  deepEq([m(early,'7'),m(early,'3')],[m(late,'7'),m(late,'3')]);
});

test('a manual formation save changes nobody’s minutes', () => {
  const b=board('home').manual(v2(30)).manual(v2(80));
  XI.forEach(no=>eq(m(b.l,no),90,'No.'+no));
});

test('a swap whose snapshot was removed by hand still counts', () => {
  const b=board('home').sub(v2(64),'7','3');
  b.l.history=[];                              // the snapshot edited away; subHistory survives
  eq(m(b.l,'7'),64); eq(m(b.l,'3'),26);
});

test('a swap with BOTH a snapshot and a subHistory entry is counted once', () => {
  const b=board('home').sub(v2(64),'7','3');   // board() writes both, as the app does
  b.l.home.subHistory[0].t+=2;                 // within the ±3s that ties a period to its rows
  eq(m(b.l,'7'),64); eq(m(b.l,'3'),26);
  eq(total(b.l),990);
});

test('shirt numbers with stray spaces are the same player', () => {
  const l=lineups();
  l.home.xi=l.home.xi.map(x=>x.no==='7'?{...x,no:' 7 '}:x);
  l.home.subHistory=[{out:' 7 ',in:' 3 ',t:v2(64)}];
  eq(m(l,'7'),64); eq(m(l,'3'),26);
});

test('the two sides are worked out on their own', () => {
  const l=lineups(); board('home',l).sub(v2(64),'7','3');
  eq(m(l,'7','away'),90,'the home swap is not an away substitution');
  eq(m(l,'3','away'),null,'and their No.3 never came on');
});

/* ================= what cannot be worked out ================= */

test('a side with no line-up is null, not a column of zeroes', () => {
  eq(S.playedMinutes(lineups({home:{roster:[],xi:[],subs:[],dir:'lr'}}),DUR,'home',[]),null);
  eq(S.playedMinutes(null,DUR,'home',[]),null);
  eq(S.playedMinutes({},DUR,'home',[]),null);
});

test('a player who is only in the events has no minutes to show', () => {
  notOk(mins(lineups())['99'],'nothing is invented for a shirt no line-up names');
});

test('without the duration boundaries the total is an estimate, and never NaN', () => {
  const off={enabled:false,halfLen:45,h1Start:0,h1End:0,h2Start:0,h2End:0};
  const P=S.playedMinutes(lineups(),off,'home',[{t:3000},{t:5000}]);
  eq(P['7'].min,83,'the video runs to 83:20, and that is what is claimed');
  notOk(P['7'].exact,'and it says of itself that it is not exact');
  Object.keys(P).forEach(no=>ok(isFinite(P[no].min),'No.'+no+' is a number'));
});

test('with only a first half mapped, the video is still one match', () => {
  const half={enabled:true,halfLen:45,h1Start:0,h1End:2760,h2Start:0,h2End:0};
  const P=S.playedMinutes(lineups(),half,'home',[{t:5400}]);
  eq(P['7'].min,90,'capped at the two halves it is supposed to be');
  notOk(P['7'].exact);
});

/* ================= the windows themselves ================= */

test('a half is a window only when its PAIR of boundaries makes one', () => {
  const w=S.matchWindows(DUR,0);
  eq(w.length,2);
  deepEq([w[0].start,w[0].end,w[0].cap],[0,2760,2700]);
  deepEq([w[1].start,w[1].end,w[1].clock0],[3000,5940,2700]);
  ok(w.every(x=>x.exact));
  // a kick-off at 0 is the ordinary case, never a value somebody forgot
  ok(S.matchWindows({enabled:true,halfLen:45,h1Start:0,h1End:2700,h2Start:3000,h2End:5700},0)[0].exact);
});

test('a match with no full-time whistle runs to the last thing tagged', () => {
  const w=S.matchWindows({enabled:true,halfLen:45,h1Start:0,h1End:2760,h2Start:3000,h2End:0},5555);
  eq(w[1].end,5555);
  notOk(w[1].exact,'and says so');
});

/* ================= the column on screen ================= */

const CATS=['shooting','distribution','defensive','other'];
// statCat/statTeam are declared on one shared `let` line in the view, so they come in as
// globals rather than as lifted consts (see loadStats in harness.js)
const NAMES={funcs:['statTableHTML','minsCell'],consts:['STAT_CATS']};
const view=(cat,l,rows,dur)=>loadStats({rows:rows||[],lineups:l,dur:dur||DUR,
  meta:{home:'H',away:'A',sport:'football'},globals:{statCat:cat,statTeam:'home'}},NAMES);
function tableHTML(cat,l,players){
  const P=view(cat,l);
  const stats={}; players.forEach(no=>{stats[no]=S.newStat();});
  return P.statTableHTML(stats,players);
}

CATS.forEach(cat=>{
  test('the '+cat+' table carries Minutes Played, right of the player', () => {
    const b=board('home').sub(v2(64),'7','3');
    const html=tableHTML(cat,b.l,['3','7','9']);
    ok(html.includes('<th class="mn">Minutes Played</th>'),'the column is there');
    ok(html.indexOf('class="pl">Player')<html.indexOf('class="mn"'),'after the name');
    ok(html.indexOf('class="mn"')<html.indexOf('</tr></thead>'),'and before the category’s own columns');
    ok(/<td class="mn"[^>]*>64'<\/td>/.test(html),"the man who went off at 64 reads 64'");
    ok(/<td class="mn"[^>]*>26'<\/td>/.test(html),'and his replacement 26');
    ok(html.includes('<td class="mn">—</td>'),'a player no line-up names reads —, not 0');
  });
});

test('an estimate is marked as one, and says why on hover', () => {
  const P=view('shooting',lineups(),[{t:5000}],
    {enabled:false,halfLen:45,h1Start:0,h1End:0,h2Start:0,h2End:0});
  const html=P.statTableHTML({'7':S.newStat()},['7']);
  ok(/<td class="mn"[^>]*>~83'<\/td>/.test(html),'the ~ says the boundaries are missing');
  ok(/title="approximate/.test(html),'and the tooltip says what to do about it');
});

/* ================= the spreadsheet and the report ================= */

const VIEW=readSrc('Stats/stats-view.js'), REPORT=readSrc('Stats/report.js');

test('the XLSX (and so the CSV) sheet carries the same column, in the same place', () => {
  const fn=/function statsSheet\(team\)\{[\s\S]*?\n\}/.exec(VIEW)[0];
  ok(/const headers=\[STAT_HEADERS\[0\],'Player','Minutes Played',\.\.\.STAT_HEADERS\.slice\(1\)\]/.test(fn),
     'third column, straight after the name');
  ok(/span=i===0\?g\[1\]\+2:g\[1\]/.test(fn),
     'the unnamed first group spans No + Player + Minutes Played, or every band above is one out');
  ok(/\{s:\{r:0,c:2\},e:\{r:1,c:2\}\}/.test(fn),'and its header is merged down like the other two');
  ok(/minOf\(no\)/.test(fn)&&/return m\?m\.min:''/.test(fn),
     'a bare number a spreadsheet can sort and add up, blank when there is nothing to say');
});

test('the PDF player tables carry it too', () => {
  const fn=/function teamTable\(team,headers,rowFor\)\{[\s\S]*?\n\}/.exec(REPORT)[0];
  ok(/<th>No<\/th><th>Player<\/th><th>Min<\/th>/.test(fn),'header, right of the player');
  ok(/<td>\$\{minOf\(no\)\}<\/td>/.test(fn),'and a cell per row');
  ok(/playedMinutes\(lineups,dur,team,rows\)/.test(fn),'off the same engine as the table');
});

test('STAT_HEADERS and statRow are untouched, so nothing else moved a column', () => {
  // the sheet inserts its own cell; adding one HERE would silently shift the XLSX bands
  // and every other reader of statRow (see squad.test.js: one cell per header)
  eq(S.STAT_HEADERS.length,S.statRow('7',S.newStat()).length);
  eq(S.STAT_HEADERS.length,S.STAT_GROUPS.reduce((n,g)=>n+g[1],0),'group spans still cover the headers');
  notOk(S.STAT_HEADERS.includes('Minutes Played'));
});
