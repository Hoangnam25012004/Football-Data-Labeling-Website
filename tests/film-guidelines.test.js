/* Guidelines — the one line under the transport bar, and the page it opens.

   The feature is deliberately the smallest thing that could work: a plain <a>
   written into the markup filmHTML() already builds, shown only to a host that
   passed opts.guide, and hidden by one CSS rule in full screen. There is no
   handler, no state and nothing for filmStop() to release — so most of this
   file is about proving the ABSENCE of things.

   Two long-standing defects are fixed alongside it and are tested here too:
   leaving a match now tears the player down (it used to keep playing where
   nobody could see it), and "Copy a link to this moment" now writes `t` into
   the real query string instead of into the middle of the hash route.

   As everywhere else in this repo: no build step and no jsdom, so what cannot
   be run is asserted against the shape of the real source. */
const {grabFunction,grabConst,STATS,readSrc}=require('./harness');
const {test,eq,ok,notOk}=require('./tiny-test');
const vm=require('vm');

const F=n=>grabFunction(n,STATS,'Stats/stats-view.js');
const G=n=>grabConst(n,STATS,'Stats/stats-view.js');

const CSS   =readSrc('Stats/stats-view.css');
const APP   =readSrc('client/assets/app.js');
const TOOLS =readSrc('client/assets/film-tools.js');
const PAGE  =readSrc('client/guide.html');
const GUIDE =readSrc('client/assets/guide.js');
const TAGGER=readSrc('Stats/index.html');

/* ================= filmHTML, actually run ================= */
/* Only as much of the module as the markup needs. The slicers, the pitch and
   the rows are all replaced by empty strings: this file is about one anchor,
   and stubbing the rest keeps a failure here from being about anything else. */
function html(opts){
  const ctx={console};
  vm.createContext(ctx);
  vm.runInContext([
    'var opts='+JSON.stringify(opts||{})+';',
    'var meta={sport:"football"};',
    'function esc(s){return String(s==null?"":s).replace(/[&<>"\']/g,function(c){',
    '  return {"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","\'":"&#39;"}[c];});}',
    'function pitchSVG(){return "<svg id=\\"pv\\"></svg>";}',
    'function filmSlicers(){return [];}',
    'function filmSlicerHTML(){return "";}',
    'function filmRowsHTML(){return "";}',
    G('FM_FULL_D'),G('filmFullIcon'),G('filmFullOK'),G('filmGuideOK'),
    F('filmHTML'),
    'var W=[{half:1,label:"1st Half",start:0,end:100}];',
    ';globalThis.OUT=filmHTML(W,W[0],[],{});'
  ].join('\n'),ctx,{filename:'film-guidelines.js'});
  return ctx.OUT;
}

test('a host that did not ask gets no link at all', () => {
  const out=html({});
  notOk(/film-guide/.test(out),'no class');
  notOk(/<a[\s>]/.test(out),'and no anchor of any kind in the Film markup');
});

test('the tagging app is exactly one of those hosts', () => {
  const m=/PTStats\.mount\([^)]*\)/.exec(TAGGER);
  ok(m,'Stats/index.html still mounts the view');
  notOk(/guide\s*:/.test(m[0]),
    'and it passes no guide, so filmGuideOK() is false there and nothing is drawn');
});

test('the channel asks, and keeps what it was already asking for', () => {
  const m=/PTStats\.mount\(holder,\s*rep\.payload,[\s\S]{0,140}?\)/.exec(APP);
  ok(m,'client/assets/app.js still mounts the report');
  ok(/fullscreen:\s*true/.test(m[0]),'full screen is untouched');
  ok(/guide:\s*'guide\.html'/.test(m[0]),'and the guide is asked for beside it');
});

test('asked for, it is one anchor that says Guidelines', () => {
  const out=html({guide:'guide.html'});
  eq(out.split('class="film-guide"').length-1,1,'exactly one');
  ok(/<span class="fg-txt">Guidelines<\/span>/.test(out),'and the word on it is the word');
  ok(/href="guide\.html"/.test(out),'pointing where the host said');
});

test('an empty or blank guide is the same as no guide', () => {
  notOk(/film-guide/.test(html({guide:''})),'empty string');
  notOk(/film-guide/.test(html({guide:'   '})),'whitespace only');
  notOk(/film-guide/.test(html({guide:null})),'null');
});

test('the href is escaped, so a host cannot break out of the attribute', () => {
  const out=html({guide:'g.html?a="b"&c=<d>'});
  ok(/href="g\.html\?a=&quot;b&quot;&amp;c=&lt;d&gt;"/.test(out),'quoted and entity-escaped');
  notOk(/href="g\.html\?a="b"/.test(out),'the raw quote does not survive');
});

test('it opens a tab of its own, and cannot reach back into this one', () => {
  const out=html({guide:'guide.html'});
  ok(/target="_blank"/.test(out),'a new tab keeps the reader’s place in the match');
  ok(/rel="noopener noreferrer"/.test(out),'and window.opener is not handed over');
});

test('it sits under the transport bar, outside the picture', () => {
  const out=html({guide:'guide.html'});
  const stage=out.indexOf('id="fmStage"');
  const bar=out.indexOf('class="film-bar"');
  const link=out.indexOf('class="film-guide"');
  const side=out.indexOf('class="film-side"');
  ok(stage<bar,'the picture comes first, as it always did');
  ok(bar<link,'the link is after the transport bar');
  ok(link<side,'and still inside the main column, not in the list beside it');
  const stageEnd=out.indexOf('class="film-bar"');   // the bar is the stage's next sibling
  ok(link>stageEnd,'never inside #fmStage, where the toolkit’s pointer handlers live');
});

/* ================= and nothing else moved ================= */
test('nothing binds it, so nothing has to release it', () => {
  notOk(/film-guide/.test(F('filmStart')),'filmStart knows nothing about it');
  notOk(/film-guide/.test(F('filmStop')),'and filmStop has nothing to undo');
  notOk(/film-guide/.test(TOOLS),'the analyst toolkit has never heard of it either');
});

test('filmStop still lets go of everything it always let go of', () => {
  const stop=F('filmStop');
  ['keydown','click','fullscreenchange','webkitfullscreenchange'].forEach(ev=>
    ok(stop.indexOf("removeEventListener('"+ev+"'")>=0,'still releases '+ev));
  ok(/cancelAnimationFrame/.test(stop),'still cancels the loop');
  ok(/filmTools\.detach\(\)/.test(stop),'still detaches the companion');
});

test('full screen never shows it, and never lands on it with Tab', () => {
  ok(/\.film-full \.film-guide\{display:none\}/.test(CSS),
    'one override, in the block where every rule is an override');
  const block=CSS.indexOf('Film, full screen');
  ok(block>=0&&CSS.indexOf('.film-full .film-guide')>block,
    'and it is inside that block, not an edit of a rule above it');
});

test('the line is a row of the column, not something floating over it', () => {
  const rule=CSS.slice(CSS.indexOf('.film-guide{'),CSS.indexOf('.film-guide:hover'));
  notOk(/position\s*:\s*absolute|position\s*:\s*fixed|float\s*:/.test(rule),
    'nothing that could sit on top of the frame');
  ok(/align-self:flex-start/.test(rule),'and the hit area is the width of the words');
});

/* ================= the page ================= */
const IDS=['s-quick','s-screen','s-play','s-halves','s-filters','s-list','s-pitch','s-full',
           's-tools','s-draw','s-time','s-clips','s-export','s-keys','s-help','s-limits'];

test('the page has the sixteen sections, under the ids links are sent as', () => {
  const found=(PAGE.match(/<section id="([^"]+)"/g)||[]).map(s=>/id="([^"]+)"/.exec(s)[1]);
  eq(found.length,16,'sixteen sections');
  IDS.forEach(id=>ok(found.indexOf(id)>=0,id+' is on the page'));
});

test('the contents and the page agree, in both directions', () => {
  const hrefs=(PAGE.match(/href="#s-[^"]+"/g)||[]).map(h=>h.slice(7,-1));
  hrefs.forEach(id=>ok(IDS.indexOf(id)>=0,'the contents link to #'+id+' and it exists'));
  IDS.forEach(id=>ok(hrefs.indexOf(id)>=0,'#'+id+' is reachable from the contents'));
});

test('a demo costs nothing until somebody presses play', () => {
  ok(/preload\s*=\s*'none'/.test(GUIDE),
    'thirteen clips asking for metadata on load would be thirteen unasked-for requests');
  ok(/v\.controls\s*=\s*true/.test(GUIDE),'the reader drives it');
  ok(/v\.poster\s*=/.test(GUIDE),'and there is something to look at before they do');
  notOk(/autoplay/i.test(GUIDE+PAGE),'nothing plays by itself');
  notOk(/\bv\.loop\b|loop\s*=\s*true/.test(GUIDE),'and nothing loops');
});

test('every clip the page names is one the manifest can address', () => {
  const named=(PAGE.match(/data-clip="([^"]+)"/g)||[]).map(s=>/"([^"]+)"/.exec(s)[1]);
  const manifest=GUIDE.slice(GUIDE.indexOf('clips: {'),GUIDE.indexOf('};',GUIDE.indexOf('clips: {')));
  ok(named.length>=13,'the page shows the demos it promises');
  named.forEach(k=>ok(new RegExp('[\'"]?'+k+'[\'"]?\\s*:').test(manifest),
    'the manifest knows '+k));
  (manifest.match(/^\s*"?([a-z]+)"?\s*:\s*\{/gm)||[]).forEach(line=>{
    const k=/"?([a-z]+)"?\s*:/.exec(line)[1];
    ok(named.indexOf(k)>=0,'nothing is downloaded that the page never shows: '+k);
  });
});

test('documentation opens when the rest of the app cannot', () => {
  notOk(/supa\.js|supabase|assets\/app\.js/.test(PAGE),
    'no auth, no database, no channel — this has to open with the session expired');
  ok(/assets\/guide\.js\?v=\d+/.test(PAGE),'only its own script');
  ok(/assets\/guide\.css\?v=\d+/.test(PAGE),'and its own stylesheet');
});

/* ================= the toolkit speaks the reader's language ================= */
const VIETNAMESE=/[ăâđêôơưĂÂĐÊÔƠƯàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/;

test('the analyst menu is in the language the rest of the channel is in', () => {
  notOk(VIETNAMESE.test(TOOLS),'no Vietnamese left in the toolkit the client sees');
  ok(/'Spotlight here'/.test(TOOLS),'the menu is there, in English');
  ok(/'Clip around this event/.test(TOOLS),'including the item with the parenthesis');
});

/* ================= leaving a match lets go of the player ================= */
/* Reported by reading the code: route() emptied #view and nothing else, so the
   video went on playing detached, Space on the next page was still swallowed,
   and four listeners on `document` accumulated one set per match opened. */
test('leaving a match tears the player down before the page is emptied', () => {
  const route=grabFunction('route',APP,'client/assets/app.js');
  ok(/PTStats\.destroy\(\)/.test(route),'destroy() is called on the way out');
  ok(route.indexOf('PTStats.destroy()')<route.indexOf("view.innerHTML = ''"),
    'and before the elements go, while there is still something to stop');
  ok(/\$\('\.pt-stats'\)/.test(route),
    'guarded on the holder, so a route with no stats view mounted is a no-op');
});

/* ================= a link to a moment, in a page addressed by its hash ================= */
function link(href,t){
  const ctx={console,location:{href:href}};
  vm.createContext(ctx);
  vm.runInContext(
    grabFunction('momentLink',TOOLS,'client/assets/film-tools.js')
    +';globalThis.OUT=momentLink('+t+');',ctx,{filename:'moment.js'});
  return ctx.OUT;
}

test('t goes in the query string, ahead of the hash — never inside it', () => {
  eq(link('https://x.com/app.html#/match/SLB01',742.1),
     'https://x.com/app.html?t=742.10#/match/SLB01',
     'the hash route is left clean, so route() still reads the slug SLB01');
  eq(link('https://x.com/app.html?club=slu#/match/SLB01',742.1),
     'https://x.com/app.html?club=slu&t=742.10#/match/SLB01',
     'and the query that picks the channel survives instead of being thrown away');
});

/* The old expression is still IN the file, in the comment above momentLink that
   explains what it got wrong — so this asks the menu item itself, which is the
   thing that actually runs. */
test('the menu item asks for the link instead of assembling one', () => {
  const item=TOOLS.slice(TOOLS.indexOf("label: 'Copy a link to this moment'"),
                         TOOLS.indexOf("label: 'Exit full screen'"));
  ok(item.length>0,'the item is still on the menu');
  ok(/var u = momentLink\(t\);/.test(item),'it asks momentLink for the URL');
  notOk(/split\('\?'\)/.test(item),'and no longer builds one inline');
});

test('copying twice does not stack a second t', () => {
  eq(link('https://x.com/app.html?t=10.00#/match/A',20),
     'https://x.com/app.html?t=20.00#/match/A','the old one is replaced');
  eq(link('https://x.com/app.html?club=a&t=10.00&b=1#/m',20),
     'https://x.com/app.html?club=a&b=1&t=20.00#/m','and only the old one');
});

test('a page with no hash and no query still gets a usable link', () => {
  eq(link('https://x.com/app.html',5),'https://x.com/app.html?t=5.00');
});

test('the moment a ?t= link names is opened on Film, not on the default tab', () => {
  const r=grabFunction('renderMatchStats',APP,'client/assets/app.js');
  ok(/\[\?&\]t=/.test(r),'the URL is read');
  ok(/viewFilmBtn/.test(r),'and the view is changed through the button mount() drew');
  ok(r.indexOf('PTStats.mount')<r.indexOf('viewFilmBtn'),
    'after the mount, because the button does not exist before it');
});
