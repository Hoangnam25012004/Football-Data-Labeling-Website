/* Cache-busting: the ?v= on every shared asset, pinned to what that asset holds.

   This site has no build step. A file is shared by several pages, and the only
   thing telling a returning browser to fetch it again is the ?v= in the URL each
   page carries. Change the file, leave the number, and every browser that has
   been here before goes on running the old copy — for as long as its cache says
   it may. Nothing fails, nothing logs; the feature is simply not there.

   That has now happened twice, and both times the shape was the same: the file
   was changed, one of the places loading it was bumped, and another was not.

   So: a manifest of (file -> version, hash). Change the file and the hash moves;
   if the version did not move with it, this fails and says which pages to edit.
   The manifest is regenerated deliberately, as part of bumping:

       node tests/asset-versions.test.js --update

   It also checks the two things that go wrong beside it — the same file carrying
   different versions on different pages, and a versioned file that deploy.yml
   never copies (which 404s on the live site while the build stays green).       */
const fs=require('fs'), path=require('path'), crypto=require('crypto');
const {test,eq,ok}=require('./tiny-test');
const {readSrc}=require('./harness');

const ROOT=path.join(__dirname,'..');
const MANIFEST=path.join(__dirname,'asset-versions.json');

/* Pages carry their references as markup. app.js issues its own at runtime —
   it pulls the tagging app's assets in the first time somebody opens a match —
   so it is scanned as well, with its refs resolved against the deployed root
   rather than against its own folder (see taggerRoot() in that file). */
const PAGES=['index.html','auth.html','Stats/index.html','Player-Lists/index.html',
             'client/index.html','client/app.html','client/login.html'];
/* file -> the bases its refs may resolve against, in order.
   app.js addresses two different places. Refs into the tagging app are written
   against the deployed root, where this site sits and the tagger is moved under
   /tagger, so they resolve against the repo root. Refs to the files that ship
   beside it are written against the PAGE that loads it — client/app.html — so
   they resolve against client/. The first base the file actually exists under
   wins; a ref matching none falls back to the first, so a genuine typo still
   fails the test below. */
const LOADERS={'client/assets/app.js':['.','client']};

const isExternal=u=>/^(?:https?:)?\/\//.test(u);
const posix=p=>p.split(path.sep).join('/');

/* every (file, version, where it was written) in the repo */
function references(){
  const out=[];
  PAGES.forEach(page=>{
    const src=readSrc(page), base=path.posix.dirname(posix(page));
    let m; const re=/(?:src|href)="([^"]+?)\?v=(\d+)"/g;
    while((m=re.exec(src))){
      if(isExternal(m[1]))return;
      out.push({file:path.posix.normalize(path.posix.join(base,m[1])),v:+m[2],from:page});
    }
  });
  Object.keys(LOADERS).forEach(loader=>{
    const src=readSrc(loader), bases=[].concat(LOADERS[loader]);
    let m; const re=/'([^']+?)\?v=(\d+)'/g;
    while((m=re.exec(src))){
      if(isExternal(m[1]))continue;
      const tries=bases.map(b=>path.posix.normalize(path.posix.join(b,m[1])));
      const hit=tries.filter(f=>fs.existsSync(path.join(ROOT,f)))[0];
      out.push({file:hit||tries[0],v:+m[2],from:loader});
    }
  });
  return out;
}

/* Hash what git stores, not what is on disk: text folded to LF, binaries raw.
   Otherwise the manifest would flip every time core.autocrlf rewrote a file. */
const BINARY=/\.(png|jpe?g|gif|webp|ico|woff2?|mp4)$/i;
function hash(file){
  const abs=path.join(ROOT,file);
  const buf=BINARY.test(file)?fs.readFileSync(abs):Buffer.from(readSrc(file),'utf8');
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0,16);
}

/* file -> the one version it is loaded with (the consistency test owns the case
   where that is a lie) */
function current(){
  const byFile={};
  references().forEach(r=>{(byFile[r.file]=byFile[r.file]||{versions:{},files:[]});
    byFile[r.file].versions[r.v]=(byFile[r.file].versions[r.v]||[]).concat(r.from);});
  return byFile;
}

/* ---- regeneration, when a bump is deliberate ---- */
if(require.main===module&&process.argv.includes('--update')){
  const out={};
  Object.keys(current()).sort().forEach(f=>{
    out[f]={v:+Object.keys(current()[f].versions)[0],sha256:hash(f)};
  });
  fs.writeFileSync(MANIFEST,JSON.stringify(out,null,2)+'\n');
  console.log('asset-versions.json rewritten with '+Object.keys(out).length+' assets');
  process.exit(0);
}

const pinned=JSON.parse(readSrc(MANIFEST));
const live=current();

/* ================= the reference itself ================= */
test('every ?v= points at a file that is actually in the repo', () => {
  Object.keys(live).forEach(f=>
    ok(fs.existsSync(path.join(ROOT,f)),f+' is loaded by '+live[f].files.concat(
      Object.values(live[f].versions)[0]).join(', ')+' but does not exist'));
});

test('a file carries the SAME version everywhere it is loaded', () => {
  Object.keys(live).forEach(f=>{
    const vs=Object.keys(live[f].versions);
    ok(vs.length===1, f+' is loaded as v'+vs.join(' and v')+' — '
      +vs.map(v=>'v'+v+' by '+live[f].versions[v].join(', ')).join('; ')
      +'. Half a bump is worse than none: the pages that were not bumped keep serving the old copy.');
  });
});

/* ================= the version against the content ================= */
test('changing a shared asset moves its version with it', () => {
  Object.keys(live).sort().forEach(f=>{
    const was=pinned[f], now={v:+Object.keys(live[f].versions)[0],sha256:hash(f)};
    ok(was, f+' is newly versioned and not in the manifest yet — '
      +'run: node tests/asset-versions.test.js --update');
    if(!was)return;
    if(was.sha256===now.sha256&&was.v===now.v)return;               // untouched
    ok(was.sha256!==now.sha256||was.v!==now.v,'unreachable');
    ok(was.v!==now.v,
      f+' changed but is still served as ?v='+now.v+'. Bump it in '
      +live[f].versions[now.v].join(' and ')
      +', then: node tests/asset-versions.test.js --update');
    ok(was.sha256!==now.sha256,
      f+' was bumped to v'+now.v+' without changing — either the bump is stray, '
      +'or the manifest is stale: node tests/asset-versions.test.js --update');
  });
});

test('the manifest names nothing that is no longer versioned', () => {
  Object.keys(pinned).forEach(f=>
    ok(live[f], f+' is in the manifest but nothing loads it with a ?v= any more — '
      +'run: node tests/asset-versions.test.js --update'));
});

/* ================= and it has to be on the live site ================= */
test('every versioned asset is one the deploy actually copies', () => {
  const yml=readSrc('.github/workflows/deploy.yml');
  const copied=new Set();
  let m; const re=/^\s*cp\s+(\S+)\s+\S+/gm;
  while((m=re.exec(yml)))copied.add(path.posix.normalize(m[1]));
  Object.keys(live).forEach(f=>
    ok(copied.has(f), f+' is loaded with a ?v= but has no cp line in deploy.yml — '
      +'it will 404 on the live site while the build stays green'));
});
