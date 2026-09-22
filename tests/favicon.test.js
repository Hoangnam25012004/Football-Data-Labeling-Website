/* The tab icon.

   Every page carries the same mark the site's own header draws and the same one
   Google now shows on its consent screen, so the tab, the consent screen and the
   page header cannot drift apart.

   It is a data URI rather than a favicon.svg, and that is a decision about THIS
   repo rather than a preference. deploy.yml turns one repository into two layouts
   — client/ becomes the site root, the whole tagging app moves under /tagger/ —
   so one file would need two copies at two different relative depths, and a file
   missing from deploy.yml's cp list is a 404 on the live site while the build
   still goes green. A data URI has no path, so the same tag works at every depth,
   in the repo and on the deployed site, with nothing to copy and no ?v= to keep
   in step. */
const {test,eq,ok,notOk}=require('./tiny-test');
const {readSrc}=require('./harness');

/* every page someone can land on, both halves of the deployed site */
const PAGES=['client/index.html','client/app.html','client/login.html',
             'client/guide.html','client/privacy.html',
             'index.html','auth.html','Stats/index.html','Player-Lists/index.html'];

const iconOf=src=>{
  const m=/<link rel="icon" href="([^"]*)">/.exec(src);
  return m?m[1]:null;
};

test('every page has one', () => {
  const missing=PAGES.filter(p=>!iconOf(readSrc(p)));
  eq(missing.join(', '),'','these pages still show the browser-s blank globe');
});

test('and it is the SAME one everywhere, so the tab cannot drift page to page', () => {
  const seen={};
  PAGES.forEach(p=>{ (seen[iconOf(readSrc(p))]=seen[iconOf(readSrc(p))]||[]).push(p); });
  eq(Object.keys(seen).length,1,
     'more than one icon in the repo —\n      '+
     Object.keys(seen).map(k=>seen[k].join(', ')+'\n        '+k.slice(0,80)).join('\n      '));
});

const ICON=iconOf(readSrc('client/index.html'));

test('it needs no file, so deploy.yml has nothing to copy and nothing to forget', () => {
  ok(/^data:image\/svg\+xml,/.test(ICON),'inline, not a path');
  const yml=readSrc('.github/workflows/deploy.yml');
  notOk(/favicon/i.test(yml),'no cp line to leave out by accident');
  // and no ?v= to bump — the manifest test scans these same pages for versioned refs
  notOk(/\?v=/.test(ICON),'nothing here for the cache-busting manifest to track');
});

test('the # in the brand red is escaped — raw, it silently becomes a fragment', () => {
  // href="data:…fill='#E0122B'…" stops at the #, the browser fetches a truncated
  // document, and the tab quietly keeps the blank globe with no error anywhere
  notOk(ICON.includes('#'),'no bare # survives in the href');
  ok(ICON.includes('%23E0122B'),'the brand red is there, encoded');
  ok(ICON.includes('%23fff'),'and so is the white');
});

test('it draws the same mark the page header draws', () => {
  // the header's inline <svg>, in client/login.html and everywhere else
  const header=readSrc('client/login.html');
  ok(/d="M13 39V11l22 28V11"/.test(header),'the header path is what it always was');
  ok(ICON.includes("d='M13 39V11l22 28V11'"),'and the icon carries the same path');
  [['13','39'],['13','11'],['35','39'],['35','11']].forEach(([cx,cy])=>
    ok(ICON.includes("cx='"+cx+"' cy='"+cy+"' r='5.4'"),'the dot at '+cx+','+cy));
  ok(ICON.includes("stroke-width='3.6'"),'same weight, so it reads as the same mark');
});

test('adding it did not push auth.js behind the CDN bundles', () => {
  /* The gate has to run before a visitor with no account downloads anything else,
     and auth-gate.test.js asserts that ordering. A <link> dropped into the head in
     the wrong place is exactly how it would quietly stop being true. */
  [['index.html','auth.js'],['Stats/index.html','../auth.js'],
   ['Player-Lists/index.html','../auth.js']].forEach(([f,src])=>{
    const html=readSrc(f);
    ok(html.indexOf(src)<html.indexOf('cdn.jsdelivr.net'),f+' still loads the gate first');
  });
});

/* ================= it is the header's chip, to the number =================
   The tab used to draw the mark edge to edge on a square corner while the header
   drew it at 15/26 inside a 3px-rounded chip, so the two read as different logos
   at a glance. These derive the icon's numbers from the CSS the header actually
   uses, which means the icon cannot drift from it without this going red. */
const CSS=readSrc('client/assets/site.css');
const brandMark=/\.brand-mark\{([\s\S]*?)\}/.exec(CSS)[1];
const px=(prop)=>{
  const m=new RegExp(prop+'\\s*:\\s*([0-9.]+)px').exec(brandMark);
  if(!m) throw new Error('.brand-mark has no '+prop);
  return parseFloat(m[1]);
};
const r3=n=>Math.round(n*1000)/1000;

test('the icon is the header chip, scaled — derived from site.css, not typed in', () => {
  const chip=px('width'), radius=px('border-radius');
  const mark=parseFloat(/<svg width="([0-9.]+)" height="[0-9.]+" viewBox="0 0 48 48"/
                        .exec(readSrc('client/login.html'))[1]);
  eq(chip,26,'the chip the header draws');
  eq(mark,15,'and the mark inside it');

  const scale=mark/chip, rx=radius/chip*48, off=(48-48*scale)/2;
  ok(ICON.includes("rx='"+r3(rx)+"'"),
     'corner is '+r3(radius/chip*100)+'% of the chip, as the header is — expected rx='+r3(rx));
  ok(ICON.includes("scale("+r3(scale)+")"),
     'mark fills '+r3(scale*100)+'% of the chip, as the header does');
  ok(ICON.includes("translate("+r3(off)+" "+r3(off)+")"),'and is centred in it');
});

test('the chip is filled, so the corner is a corner and not a hole', () => {
  ok(/<rect width='48' height='48' rx='[0-9.]+' fill='%23E0122B'\/%3E/.test(ICON)
     ||ICON.includes("rect width='48' height='48'"),'a red rect under the mark');
  // scaling the group scales its stroke with it: 3.6 x 0.577 = 2.08 of 48 = 4.3%,
  // which is the same 1.125px of 26px the header draws. Left unscaled it was 7.5%.
  ok(/transform='translate\([0-9.]+ [0-9.]+\) scale\([0-9.]+\)'/.test(ICON),
     'one transform carries size, position and stroke weight together');
});

/* ================= one red, everywhere =================
   The PDF report carried #e03131 for a while — close enough to look right on its
   own and wrong beside the site, so every report a club received had a different
   red on it than the page they downloaded it from. */
test('every brand surface uses the one red', () => {
  const RED=/#E0122B/i;
  const WRONG=/#e0313[0-9a-f]|#e11d48|#dc2626|#ef4444/i;   // the near-misses
  [['client/assets/site.css','--red'],
   ['Stats/stats-view.css','--accent'],
   ['Stats/report.js','.rp-logo'],
   ['auth.html','--accent']].forEach(([f,what])=>{
    const src=readSrc(f);
    ok(RED.test(src),f+' states the brand red for '+what);
  });
  const rp=/\.rp-logo\{[^}]*\}/.exec(readSrc('Stats/report.js'))[0];
  ok(/background:#E0122B/.test(rp),'the report chip is the brand red');
  notOk(WRONG.test(rp),'and not a near-miss of it');
  ok(ICON.includes('%23E0122B'),'and so is the tab');
});

/* ================= the app is called Tagger ================= */
test('the tagging app is Tagger, and the old name is gone from every title', () => {
  const titleOf=f=>/<title>([^<]*)<\/title>/.exec(readSrc(f))[1];
  eq(titleOf('index.html'),'Tagger — Sports Event Labeler');
  eq(titleOf('auth.html'),'Sign in — Tagger');
  eq(titleOf('Stats/index.html'),'Stats — Tagger');
  eq(titleOf('Player-Lists/index.html'),'Player lists — Tagger');
});

test('and the rename did NOT reach the storage keys', () => {
  /* pitchtagger.rows.v1 and its fifteen siblings name what is already written in
     every browser that has ever opened the app. Renaming one orphans that store:
     the events, the line-ups and the macros are still there and the app no longer
     looks for them. This is the guard on a rename that only ever meant the title. */
  const keys=new Set();
  ['index.html','shared.js','cloud-sync.js','auth.js','auth.html',
   'Stats/index.html','Player-Lists/index.html'].forEach(f=>{
    const src=readSrc(f);
    let m; const re=/'(pitchtagger\.[a-z0-9._]+)'/g;
    while((m=re.exec(src))) keys.add(m[1]);
  });
  ok(keys.size>=14,'the stores are still named what they were — found '+keys.size);
  ['pitchtagger.rows.v1','pitchtagger.macros.v2','pitchtagger.recent.v1',
   'pitchtagger.hotkeys.v1','pitchtagger.lineups.v1']
    .forEach(k=>ok(keys.has(k),k+' is still spelled that way'));
});

test('it sits with the title, where a head is read', () => {
  PAGES.forEach(p=>{
    const html=readSrc(p);
    ok(/<\/title>\r?\n<link rel="icon"/.test(html),p+' has it straight after the title');
  });
});
