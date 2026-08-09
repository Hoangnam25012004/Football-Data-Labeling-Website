/* The shooting map on a client match page.

   It is a PORT of the map in Stats/index.html, not a reuse: that page is part
   of the tagging app, behind the tagging app's sign-in gate and its own
   session, so a club account cannot open it. Ported code drifts, so what has
   to agree with the original is pinned here — the shot kinds, their colours,
   and the normalising that turns two halves into one picture.

   The functions are lifted straight out of client/assets/app.js and run in a
   sandbox, the same trick the rest of the suite uses on index.html. */
const fs=require('fs'), path=require('path'), vm=require('vm');
const {test,eq,ok,notOk}=require('./tiny-test');
const {grabFunction}=require('./harness');

const ROOT=path.join(__dirname,'..');
const page=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const APPJS=page('client/assets/app.js');
const SUPA=page('client/assets/supa.js');
const SHARED=page('shared.js');
const STATS=page('Stats/index.html');
/* comments are stripped before anything is extracted: a stray semicolon in
   one of them would otherwise end a statement halfway through */
const bare=s=>s.replace(/--[^\n]*/g,'');
const viewBody=src=>/create or replace view public\.match_stats as([\s\S]*?);/.exec(bare(src))[1];
const SQL=page('supabase/migrations/0015_match_stats_event_names.sql');
const DICT=JSON.parse(page('pitchtagger_events.json'));

/* `var X = {...};` at one level of indentation inside the app IIFE */
function grabVar(name){
  const m=new RegExp('\\n  var '+name+' = \\{[\\s\\S]*?\\n  \\};').exec(APPJS);
  if(!m)throw new Error('var '+name+' not found in app.js');
  return m[0];
}

const grabString=name=>{
  const m=new RegExp("\\n  var "+name+" =[\\s\\S]*?';\\n").exec(APPJS);
  if(!m)throw new Error('var '+name+' not found in app.js');
  return m[0];
};

const ctx={console};
vm.createContext(ctx);
vm.runInContext([
  grabVar('SHOT_COLORS'), grabVar('SHOT_LABELS'),
  'var PITCH_W = 680, PITCH_H = 1050;',
  grabString('VPITCH_LINES'),
  /* el() is a one-line helper assigned to a var, so it is stubbed rather than
     lifted: the card is built by setting innerHTML, which is what is read */
  'function el(t,c,h){return {tag:t,className:c||"",innerHTML:h==null?"":h};}',
  grabFunction('esc',APPJS,'app.js'),
  grabFunction('num',APPJS,'app.js'),
  grabFunction('eventHalf',APPJS,'app.js'),
  grabFunction('matchMinute',APPJS,'app.js'),
  grabFunction('attackDir',APPJS,'app.js'),
  grabFunction('shotsOf',APPJS,'app.js'),
  grabFunction('shootingCard',APPJS,'app.js'),
  ';globalThis.M={SHOT_COLORS,SHOT_LABELS,eventHalf,matchMinute,attackDir,shotsOf,shootingCard};'
].join('\n'),ctx,{filename:'client/assets/app.js-extract.js'});
const M=ctx.M;

/* the shape renderMatch hands the card */
const MATCH=(dur)=>({side:'home',dur:dur,
  home:{name:'Saint Lucia',score:2},away:{name:'Barbados',score:1}});

const shot=(t,x,y,ev,no)=>({t,team:'home',event:ev||'shot on target',no:String(no||9),pXY:{x,y},gXY:null});
const OFF={enabled:false,halfLen:45,h1Start:0,h1End:0,h2Start:0,h2End:0};
const MAPPED={enabled:true,halfLen:45,h1Start:100,h1End:2900,h2Start:3600,h2End:6400};

/* ================= the port matches its source ================= */
test('the five shot kinds are exactly the ones shared.js counts as a shot', () => {
  const src=/const SHOT_KINDS=new Set\(\[([^\]]*)\]\)/.exec(SHARED)[1];
  const theirs=src.split(',').map(s=>s.trim().replace(/^'|'$/g,'')).sort();
  eq(Object.keys(M.SHOT_COLORS).sort().join(','),theirs.join(','),
     'a kind in one and not the other means a shot drawn on one page and missing on the other');
  eq(Object.keys(M.SHOT_LABELS).sort().join(','),theirs.join(','),'and every one of them is labelled');
});

test('the three colours are the ones the Stats map and its legend use', () => {
  eq(M.SHOT_COLORS['goal'],'#f7b32f');
  eq(M.SHOT_COLORS['shot on target'],'#39d98a');
  ['shot off target','blocked shot','miss shot'].forEach(k=>eq(M.SHOT_COLORS[k],'#8b97a7',k));
  // the same three appear in Stats/index.html's own kinds map
  ok(/'goal'\s*:\s*'#f7b32f'\s*,\s*'shot on target'\s*:\s*'#39d98a'/.test(STATS),
     'Stats still uses this pair — change one, change both');
});

/* ================= both halves become one picture ================= */
test('a half spent attacking left is turned around, so the two land together', () => {
  // 1st half attacking right: struck at x=80 (near the right goal), left of centre
  // 2nd half attacking left: the mirror of that is x=20, y mirrored too
  const rows=[shot(60,80,30), shot(4000,20,70)];
  const out=M.shotsOf(rows,'home',MAPPED);
  eq(out.length,2);
  eq(Math.round(out[0].vx),Math.round(out[1].vx),'same place across the pitch');
  eq(Math.round(out[0].vy),Math.round(out[1].vy),'and the same distance from goal');
});

test('attacking right becomes attacking up', () => {
  const near=M.shotsOf([shot(60,95,50)],'home',OFF)[0];   // almost on the goal line
  const deep=M.shotsOf([shot(60,55,50)],'home',OFF)[0];   // just past halfway
  ok(near.vy<deep.vy,'the closer shot is nearer the top of the picture');
  eq(Math.round(near.vy),Math.round((100-95)/100*1050));
  eq(Math.round(near.vx),Math.round(50/100*680),'and the pitch width comes from y');
});

test('the direction of a half is read off where that team shoots', () => {
  const right=[shot(60,80,50),shot(70,72,40)];
  eq(M.attackDir(right,'home',1,OFF),'right');
  const left=[shot(60,20,50),shot(70,28,40)];
  eq(M.attackDir(left,'home',1,OFF),'left');
});

test('a half with no shots borrows the other one, reversed', () => {
  const rows=[shot(60,80,50)];                 // 1st half only, attacking right
  eq(M.attackDir(rows,'home',1,MAPPED),'right');
  eq(M.attackDir(rows,'home',2,MAPPED),'left','the sides are swapped at half time');
});

test('a match with no placed shot at all still answers, rather than throwing', () => {
  eq(M.attackDir([],'home',1,OFF),'right');
  eq(M.attackDir([],'home',2,OFF),'left');
  eq(M.shotsOf([],'home',OFF).length,0);
});

test('only this team, only shots, and only the ones that were placed', () => {
  const rows=[
    shot(10,80,50),                                        // ours
    {t:20,team:'away',event:'goal',no:'7',pXY:{x:80,y:50}}, // theirs
    {t:30,team:'home',event:'pass success',no:'8',pXY:{x:50,y:50}},
    {t:40,team:'home',event:'goal',no:'9',pXY:null}         // never placed on the pitch
  ];
  const out=M.shotsOf(rows,'home',OFF);
  eq(out.length,1);
  eq(out[0].r.t,10);
});

test('shots come back in the order they were taken', () => {
  const out=M.shotsOf([shot(300,70,40),shot(60,80,50),shot(180,75,60)],'home',OFF);
  eq(out.map(s=>s.r.t).join(','),'60,180,300');
});

/* ================= the minute ================= */
test('a video time is only called a minute when the halves were mapped', () => {
  eq(M.matchMinute(600,OFF),null,'unmapped: the page says so instead of guessing');
  eq(M.matchMinute(100,MAPPED),1,'kick-off');
  eq(M.matchMinute(700,MAPPED),11,'ten minutes of football later');
  eq(M.matchMinute(3600,MAPPED),46,'the second half starts at 45+1, not at the video time');
  eq(M.matchMinute(null,MAPPED),null,'an event with no time is not placed');
});

test('which half an event is in comes from where the second one starts', () => {
  eq(M.eventHalf({t:3599},MAPPED),1);
  eq(M.eventHalf({t:3600},MAPPED),2);
  eq(M.eventHalf({t:9999},OFF),1,'with no mapping everything is one half');
});

/* ================= the card that gets drawn ================= */
const CARD_ROWS=[
  shot(700,88,46,'goal',9), shot(900,74,62,'shot on target',10),
  shot(1500,68,30,'shot off target',7), shot(2400,80,70,'blocked shot',11),
  shot(3900,26,55,'shot on target',9), shot(4600,14,40,'goal',7),
  {t:2000,team:'away',event:'goal',no:'5',pXY:{x:20,y:50},gXY:null},
  {t:1200,team:'home',event:'pass success',no:'6',pXY:{x:50,y:50},gXY:null}
];

test('the card counts only this side-s shots, and says how many were scored', () => {
  const html=M.shootingCard(MATCH(MAPPED),CARD_ROWS).innerHTML;
  ok(/Saint Lucia · 6 shots, 2 scored/.test(html),'got: '+(/<span class="right">([^<]*)/.exec(html)||[])[1]);
});

test('every shot becomes a dot carrying the shirt number that took it', () => {
  const html=M.shootingCard(MATCH(MAPPED),CARD_ROWS).innerHTML;
  const dots=html.match(/<circle cx="[\d.]+" cy="[\d.]+" r="17"/g)||[];
  eq(dots.length,6,'six dots for six shots');
  const nums=(html.match(/font-weight="800"[^>]*>(\d+)</g)||[]).map(s=>/>(\d+)</.exec(s)[1]);
  eq(nums.join(','),'9,10,7,11,9,7','in the order they were taken');
  eq((html.match(/fill="#f7b32f"/g)||[]).length,2,'the two goals are gold');
});

test('the goal a dot sits nearest is the top of the picture, in both halves', () => {
  const html=M.shootingCard(MATCH(MAPPED),CARD_ROWS).innerHTML;
  const ys=(html.match(/cy="([\d.]+)" r="17"/g)||[]).map(s=>+/cy="([\d.]+)"/.exec(s)[1]);
  ys.forEach(y=>ok(y<PITCHHALF,'a shot at '+y+' should be in the attacking half, above '+PITCHHALF));
});
const PITCHHALF=525;

test('the list gives the minute once the halves are mapped, and says so when not', () => {
  const on=M.shootingCard(MATCH(MAPPED),CARD_ROWS).innerHTML;
  ok(/<span class="sl-t">11'<\/span>/.test(on),'the first shot is on 11 minutes');
  // t=3900 is 5 minutes into a second half that starts at 3600, so 45+5+1
  ok(/<span class="sl-t">51'<\/span>/.test(on),'and a second-half shot counts on from 45, not from the video');
  eq(M.matchMinute(3600,MAPPED),46,'the whistle for the second half is 46, not 45');
  notOk(/not shown/.test(on),'no apology needed');

  const off=M.shootingCard(MATCH(OFF),CARD_ROWS).innerHTML;
  ok(/<span class="sl-t">—<\/span>/.test(off),'unmapped: a dash, not a video time dressed as a minute');
  ok(/Minutes are not shown/.test(off),'and the page says why');
});

test('a match with shots but none placed says so instead of drawing an empty pitch', () => {
  const html=M.shootingCard(MATCH(MAPPED),[{t:10,team:'home',event:'goal',no:'9',pXY:null,gXY:null}]).innerHTML;
  ok(/No shot in this match carries a position/.test(html));
  notOk(/<svg/.test(html),'and no pitch is drawn');
});

test('nothing a person typed reaches the page unescaped', () => {
  const nasty=[{t:10,team:'home',event:'goal',no:'<img src=x onerror=alert(1)>',pXY:{x:80,y:50},gXY:null}];
  const html=M.shootingCard(MATCH(MAPPED),nasty).innerHTML;
  notOk(/<img/.test(html),'the shirt number is escaped');
  ok(/&lt;img/.test(html),'and shown as text');
});

/* ================= what the client asks the database for ================= */
const MIG=path.join(ROOT,'supabase','migrations');
function columnsOf(table){
  const cols=new Set();
  fs.readdirSync(MIG).filter(f=>f.endsWith('.sql')).forEach(f=>{
    const sql=bare(fs.readFileSync(path.join(MIG,f),'utf8'));
    const ct=new RegExp('create table if not exists public\\.'+table+'\\s*\\(([\\s\\S]*?)\\n\\);').exec(sql);
    /* split on commas, not lines: 0001 declares "x real, y real," on one line */
    if(ct) ct[1].split(',').forEach(part=>{
      const m=/^\s*([a-z_]+)\s+[a-z]/i.exec(part);
      if(m&&!/^(primary|unique|foreign|check|constraint|references|default)$/i.test(m[1])) cols.add(m[1]);
    });
    const alt=new RegExp('alter table public\\.'+table+'\\b([\\s\\S]*?);','g');
    for(let a;(a=alt.exec(sql));){
      const add=/add column if not exists\s+([a-z_]+)/g;
      for(let c;(c=add.exec(a[1]));) cols.add(c[1]);
    }
  });
  return cols;
}

test('every column the events call asks for is one the schema has', () => {
  const have=columnsOf('events');
  ok(have.has('goal_x'),'sanity: 0012 adds where the ball crossed the line');
  const asked=/from\('events'\)[\s\S]*?\.select\('([^']+)'\)/.exec(SUPA)[1].split(',');
  asked.forEach(c=>ok(have.has(c.trim()),'events has no column '+c.trim()));
});

test('a tagged match is paged through, not cut off at the first thousand', () => {
  const fn=/events: function \(matchUuid\)[\s\S]*?\n    \}/.exec(SUPA)[0];
  ok(/\.range\(from, from \+ PAGE - 1\)/.test(fn),'it asks for a window');
  ok(/got\.length === PAGE \? page\(from \+ PAGE\)/.test(fn),'and asks again while the window comes back full');
  ok(/catch\(function \(\) \{ return \[\]; \}\)/.test(fn),'and a failure leaves the rest of the page standing');
});

/* ================= the view that was counting nothing ================= */
test('0015 stops match_stats looking for a hash that is never stored', () => {
  const view=viewBody(SQL);
  notOk(/'#/.test(view),"no pattern still starts with a '#' — event_name never carries one");
  ok(/lower\(trim\(event_name\)\)/.test(view),'and the name is folded before it is matched');
});

test('every name it matches on is a name the shipped dictionary actually has', () => {
  const view=viewBody(SQL);
  const known=new Set((DICT.football||[]).map(e=>String(e.name||e).trim().toLowerCase()));
  // the two the dictionary does not ship: a kind a tagger may add, and the
  // corrected spelling of one the dictionary gets wrong
  const allowed=new Set(['miss shot','take-on success']);
  const used=new Set();
  const re=/'([a-z0-9 \-]+)'/g;
  for(let m;(m=re.exec(view));) used.add(m[1]);
  ok(used.size>15,'sanity: it matches on a good many names — got '+used.size);
  used.forEach(n=>ok(known.has(n)||allowed.has(n),'match_stats counts "'+n+'", which no event is called'));
});

test('the columns of the view are unchanged, which is what lets it be REPLACEd', () => {
  const old=viewBody(page('supabase/migrations/0013_client_channels.sql'));
  const names=v=>{const out=[];const re=/\bas\s+([a-z_]+)\s*(?:,|\n)/g;
    for(let m;(m=re.exec(v));) out.push(m[1]); return out;};
  const before=names(old), after=names(viewBody(SQL));
  eq(after.join(','),before.join(','),
     'CREATE OR REPLACE VIEW refuses a changed column list — this would have to be a DROP');
});

test('the dictionary names the client depends on are still spelt that way', () => {
  // if one of these is renamed in pitchtagger_events.json the view goes quietly
  // to zero for that column, so the spelling is pinned here on purpose
  const known=new Set((DICT.football||[]).map(e=>String(e.name||e).trim().toLowerCase()));
  ['goal','shot on target','shot off target','blocked shot','pass success','pass fail',
   'cross success','cross fail','tackle success','tackle fail','interception','clearance',
   'aerial duel success','aerial duel fail','step in','offside','foul']
    .forEach(n=>ok(known.has(n),'the dictionary no longer ships "'+n+'"'));
});
