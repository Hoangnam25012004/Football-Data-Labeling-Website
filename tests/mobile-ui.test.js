/* The phone layout of the client app, and the fences that keep it there.

   client/assets/app-mobile.css exists so the app can be redrawn for a phone
   WITHOUT any of it reaching a desktop, the marketing site, the sign-in page or
   the tagging app. That is not a property of the rules it happens to contain
   today; it is a property of three fences, and the point of this file is that a
   later edit cannot quietly take one of them down:

     nạp     only client/app.html links it;
     media   every rule sits inside the one @media (max-width:720px);
     scope   every selector starts body.app, which only app.html carries.

   Designed in docs/mobile-ui-design.md, which also holds the measurements.     */
const {test,eq,ok,notOk}=require('./tiny-test');
const {readSrc}=require('./harness');

const MOB     =readSrc('client/assets/app-mobile.css');
const APPCSS  =readSrc('client/assets/app.css');
const APPHTML =readSrc('client/app.html');
const SHARED  =readSrc('shared.css');
const SVCSS   =readSrc('Stats/stats-view.css');

/* the one media block, and whatever is left when it is taken out */
const QUERY='@media (max-width:720px){';
const noComments=s=>s.replace(/\/\*[\s\S]*?\*\//g,'');

/* Every selector in a sheet, one per entry, commas split. Same shape as the
   scanner in stats-view.test.js — kept local because that one is not exported. */
function selectors(src){
  const out=[];
  noComments(src).replace(/@[a-z-]+[^{]*\{/gi,'')      // media/container openers
    .replace(/\}/g,'\n')
    .split('\n').forEach(line=>{
      const i=line.indexOf('{');
      if(i<0)return;
      line.slice(0,i).split(',').forEach(s=>{s=s.trim(); if(s)out.push(s);});
    });
  return out;
}

/* ================= fence 2: the media query ================= */
test('every rule in the mobile sheet is inside the one phone query', () => {
  const src=noComments(MOB);
  eq((src.match(/@media/g)||[]).length,1,'one @media, and only one');
  ok(src.indexOf(QUERY)>=0,'and it is the phone one');
  /* everything between the opener and the file's last } is the block; what is
     left over is a rule that would reach a desktop */
  const open=src.indexOf(QUERY), close=src.lastIndexOf('}');
  const outside=(src.slice(0,open)+src.slice(close+1)).trim();
  eq(outside,'','a rule outside the query would reach the desktop: '+outside.slice(0,120));
  notOk(/@container/.test(src),'and nothing here asks a container instead — that is app.css\'s job');
});

/* ================= fence 3: the scope ================= */
test('every selector is scoped to the app shell', () => {
  const bad=selectors(MOB).filter(s=>!/^body\.app[\s>]/.test(s));
  eq(bad.join(', '),'','these could reach a page that is not app.html');
});

/* ================= fence 1: who loads it ================= */
test('the sheet is loaded by app.html and by nothing else', () => {
  ok(/<link[^>]+assets\/app-mobile\.css\?v=\d+"/.test(APPHTML),'app.html links it, versioned');
  /* last in the head: app.css is what it overrides, and a tie has to go to it */
  ok(APPHTML.indexOf('app-mobile.css')>APPHTML.indexOf('app.css?v='),
     'and after app.css, so an equal-specificity rule wins the tie');
  ['client/index.html','client/login.html','client/guide.html','index.html',
   'Stats/index.html','Player-Lists/index.html','auth.html',
   'client/assets/app.js','client/assets/site.css']
    .forEach(f=>notOk(/app-mobile/.test(readSrc(f)),f+' must not reach for it'));
});

test('the deploy copies it, or it 404s on the live site', () => {
  ok(/cp client\/assets\/app-mobile\.css/.test(readSrc('.github/workflows/deploy.yml')));
});

/* ================= what it actually does ================= */
test('the rail becomes a bar at the foot with all four entries on screen', () => {
  const css=MOB.replace(/\s*\n\s*/g,'');
  ok(/body\.app \.side\{[^}]*position:fixed/.test(css),'fixed to the screen');
  ok(/body\.app \.side\{[^}]*bottom:0/.test(css),'at the foot of it');
  ok(/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/.test(css),
     'four equal cells — Home, Channel, Data and the About link that used to scroll off');
  /* the page has to end above the bar, or the last row is under it */
  ok(/body\.app \.view\{padding-bottom:calc\(74px \+ env\(safe-area-inset-bottom/.test(css));
  /* the lit edge points at the content, which at the foot of the screen is up */
  ok(/body\.app \.side a\.on\{[^}]*border-top-color:var\(--red\)/.test(css));
  /* and the 860px row it overrides is still there for 721-860px */
  ok(/@media \(max-width:860px\)[\s\S]*?\.side-foot\{[^}]*margin-left:auto/.test(APPCSS),
     'the tablet row is overridden, not deleted');
});

test('the ⋯ menu opens over the bar rather than under it', () => {
  ok(/body\.app \.menu\{z-index:70\}/.test(MOB.replace(/\s*\n\s*/g,'')),
     'the bar is 45; a menu on the last row has to clear it');
  /* and .mlist must not be sealed into a stacking context where the phone is,
     or z-index:70 would be measured against its siblings and lose */
  ok(/@media \(min-width:721px\)\{ ?\.mlist\{container-type:inline-size\}/.test(APPCSS),
     'container-type is guarded to 721px and up for exactly that reason');
});

test('one column of the wide table is frozen again on a phone', () => {
  const css=MOB.replace(/\s*\n\s*/g,'');
  ok(/body\.app table\.stbl \.c-opp\{position:sticky; ?left:0/.test(css),'the opposing team names the row');
  ok(/body\.app table\.stbl \.c-pl\{position:sticky; ?left:0/.test(css),'and the player names his');
  ok(/body\.app table\.stbl tfoot \.c-opp\{position:sticky/.test(css),'the campaign row freezes with it');
  ok(/\.c-opp::after, ?body\.app table\.stbl \.c-pl::after\{display:block\}/.test(css),
     'and the edge those columns are read against comes back');
  /* app.css is overridden, not edited — three test files pin that text */
  ok(/@media \(max-width:720px\)\{table\.stbl \.c-date, table\.stbl \.c-opp\{position:static\}/
      .test(APPCSS.replace(/\s*\n\s*/g,'')),'the rule it overrides is untouched');
});

test('the desktop floors of the tagging app are released, not edited', () => {
  const css=MOB.replace(/\s*\n\s*/g,'');
  /* each of these is a number written for a window twice the width of a phone.
     Where it still lives is where it has to keep living: the tagging app's own
     Stats page reads the same two files. */
  ok(/\.gen-center\{flex:1;min-width:420px\}/.test(SVCSS),'stats-view.css keeps its 420');
  ok(/\.oth-card\{flex:1;min-width:420px\}/.test(SVCSS));
  ok(/\.hm-flex>div:first-child\{flex:1;min-width:340px\}/.test(SVCSS));
  ok(/\.donut-legend\{[^}]*min-width:240px/.test(SHARED),'shared.css keeps its 240');
  ok(/\.scatter-card,\.map-card\{flex:1;min-width:360px\}/.test(SHARED));
  /* and each is released here, once */
  ['gen-center','oth-card','donut-card','donut-legend','gen-form','hm-list']
    .forEach(c=>ok(new RegExp('body\\.app \\.'+c+'\\{').test(css),'.'+c+' is released'));
  ok(/body\.app \.scatter-card, ?body\.app \.map-card\{min-width:0/.test(css));
  ok(/body\.app \.hm-flex > div:first-child\{min-width:0/.test(css));
});

test('nothing a thumb has to hit is left under 24px', () => {
  const css=MOB.replace(/\s*\n\s*/g,'');
  /* 23px chips and 26px view buttons were what shipped. 44 for the primary
     controls, 40 for the two rows of chips — see Q5 in the design. */
  [['.chan','44'],['.app-top .btn','44'],['.dtab','44'],['.pt-views button','44']]
    .forEach(([sel,px])=>ok(new RegExp('body\\.app '+sel.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+
      '\\{[^}]*min-height:'+px+'px').test(css),sel+' is at least '+px+'px'));
  [['.chip','40'],['.pt-exports button','40'],['.sub-row button','40']]
    .forEach(([sel,px])=>ok(new RegExp('body\\.app '+sel.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+
      '\\{[^}]*min-height:'+px+'px').test(css),sel+' is at least '+px+'px'));
  ok(/body\.app \.mrow-more\{width:44px; ?height:44px/.test(css),'and the ⋯ is a 44px square');
});

test('a text box is 16px, so Safari does not zoom the page on focus', () => {
  const css=MOB.replace(/\s*\n\s*/g,'');
  ok(/body\.app \.field input,[^{]*\{font-size:16px\}/.test(css));
  ['.form-card select','.inv-form input[type=email]','.rsel']
    .forEach(s=>ok(css.indexOf('body.app '+s)>=0,s+' is in that list'));
});

/* ================= the fold, asked of the column ================= */
test('the fixture row folds when its COLUMN is too narrow, not just its window', () => {
  const css=APPCSS.replace(/\s*\n\s*/g,'');
  /* The row's own minimum: six floors plus five gaps, plus the ⋯ beside it.
     Read out of --m-cols rather than written down twice. */
  const tracks=/--m-cols:([^;}]+)/.exec(css)[1].trim().split(/\s+(?![^(]*\))/);
  const floor=t=>/^(\d+)px$/.test(t)?+RegExp.$1:+(/^minmax\((\d+(?:\.\d+)?)px,/.exec(t)[1]);
  /* the row's own side padding counts: the tracks sit inside it, and leaving it
     out is an 8px error that puts the fold on the wrong side of the boundary */
  const pad=+(/\.mrow\{[^}]*padding:\d+px (\d+)px/.exec(css)||[,0])[1];
  const need=tracks.reduce((a,t)=>a+floor(t),0)+5*14+34+2*pad;
  const at=+/@container \(max-width:(\d+)px\)/.exec(APPCSS)[1];
  ok(at<need,'the fold is asked for BEFORE the row runs out of room: '+at+' < '+need);
  ok(need-at<40,'and not so early that a row which would have fitted is folded: '+(need-at));

  /* the folded layout is the same one the 820px block draws */
  const cont=/@container \(max-width:\d+px\)\{[\s\S]*?\n\}/.exec(APPCSS)[0].replace(/\s*\n\s*/g,'');
  ['.m-date{grid-area:date}','.m-end{grid-area:end}','.m-home{grid-area:home}',
   '.m-sc{grid-area:score}','.m-away{grid-area:away}','.mlist-h{display:none'
  ].forEach(r=>ok(cont.indexOf(r)>=0,'the container fold carries '+r));
  ok(/grid-template-areas:"date date end" "home score away" "det det det"/.test(cont),
     'and the same three lines');

  /* it must not have become a seventh track or a second --m-cols */
  eq((css.match(/grid-template-columns:var\(--m-cols\)/g)||[]).length,2,
     'still only the heading and the wide row read --m-cols');
  eq((css.match(/--m-cols:/g)||[]).length,1,'and it is declared once');
});
