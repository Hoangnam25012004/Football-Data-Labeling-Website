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

test('it sits with the title, where a head is read', () => {
  PAGES.forEach(p=>{
    const html=readSrc(p);
    ok(/<\/title>\r?\n<link rel="icon"/.test(html),p+' has it straight after the title');
  });
});
