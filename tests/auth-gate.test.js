/* The sign-in gate (auth.js).

   Every page of the site loads auth.js and nothing else has to be remembered: the file
   runs on load and replaces the page with auth.html unless a real account is signed in.
   The whole decision is made synchronously from the session supabase-js persisted, so no
   Supabase client is created on the app pages (a second one would fight cloud-sync.js
   over refreshing the token) and the app never flashes up behind the redirect.

   Two things must never happen, and both are guarded here:
     • the gate and auth.html disagreeing about who is signed in — the app would bounce
       the user to auth.html, which would bounce them straight back, forever;
     • an anonymous session (cloud-sync.js makes one on its own to reach the database)
       being mistaken for an account.
   The rest is the reason the redirect carries the page it turned away: opening a shared
   "…/#match=12345" link signed out must still land on that match afterwards. */
const fs=require('fs'), path=require('path'), vm=require('vm');
const {test,eq,ok,notOk,deepEq}=require('./tiny-test');

const ROOT=path.join(__dirname,'..');
const AUTH_JS=fs.readFileSync(path.join(ROOT,'auth.js'),'utf8');

/* localStorage stand-in: the entries are own enumerable properties, like the real one,
   because the gate finds the token by scanning Object.keys(localStorage). */
function fakeLS(seed){
  const proto={
    getItem(k){return Object.prototype.hasOwnProperty.call(this,k)?this[k]:null;},
    setItem(k,v){this[k]=String(v);},
    removeItem(k){delete this[k];}
  };
  return Object.assign(Object.create(proto),seed||{});
}
const session=(user,extra)=>JSON.stringify(Object.assign({access_token:'jwt',refresh_token:'r',user},extra||{}));
const account={id:'u1',email:'dnam2501@gmail.com',user_metadata:{full_name:'Hoang Nam'}};
const anon={id:'a1',is_anonymous:true,user_metadata:{}};
const b64=s=>'base64-'+Buffer.from(s,'utf8').toString('base64url');

/* Load auth.js the way a page does: `page` is the URL it was opened at, `store` is what
   localStorage already holds, `src` is the tag the page carries — sub-pages reach the same
   file through ../auth.js, which the browser resolves against the page, as here.
   Returns the module plus whatever it redirected to. */
function load(page,store,src){
  const url=new URL(page);
  const nav={replaced:null,events:{}};
  const ctx={
    console,atob,TextDecoder,URL,URLSearchParams,
    localStorage:fakeLS(store),
    document:{currentScript:{src:new URL((src||'auth.js')+'?v=1',url.href).href}},
    location:{href:url.href,pathname:url.pathname,search:url.search,hostname:url.hostname,
              origin:url.origin,replace(u){nav.replaced=u;}},
    window:{addEventListener(t,fn){(nav.events[t]=nav.events[t]||[]).push(fn);}}
  };
  ctx.window.location=ctx.location;
  vm.createContext(ctx);
  vm.runInContext(AUTH_JS,ctx,{filename:'auth.js'});
  return {PTAuth:ctx.window.PTAuth,nav,ls:ctx.localStorage};
}

const LIVE='https://hoangnam25012004.github.io/Football-Data-Labeling-Website/';
const LOCAL='http://localhost:8000/';
const tokenKey='sb-xtzmtdcohoixoxqusyyz-auth-token';

/* ================= who gets in ================= */
test('no session at all: the app page never renders, the auth page opens instead', () => {
  const {nav}=load(LIVE,{});
  eq(nav.replaced,LIVE+'auth','sent to the sign-in screen');
});

test('a signed-in account is let straight through', () => {
  const {nav,PTAuth}=load(LIVE,{[tokenKey]:session(account)});
  eq(nav.replaced,null,'no redirect');
  eq(PTAuth.user().email,'dnam2501@gmail.com');
  eq(PTAuth.displayName(),'Hoang Nam','the name given at sign-up, not the email');
});

test('an anonymous cloud-sync session is not an account', () => {
  const {nav,PTAuth}=load(LIVE,{[tokenKey]:session(anon)});
  eq(PTAuth.user(),null,'is_anonymous never opens the gate');
  eq(nav.replaced,LIVE+'auth','so the visitor still has to sign in');
});

test('displayName falls back to the email when no full name was given', () => {
  const {PTAuth}=load(LIVE,{[tokenKey]:session({id:'u2',email:'coach@club.com',user_metadata:{}})});
  eq(PTAuth.displayName(),'coach');
});

/* ================= reading what supabase-js stored ================= */
test('the session is read whether it is plain JSON, base64 or split in chunks', () => {
  eq(load(LIVE,{[tokenKey]:session(account)}).PTAuth.user().id,'u1','plain JSON');
  eq(load(LIVE,{[tokenKey]:b64(session(account))}).PTAuth.user().id,'u1','base64url-encoded');

  const raw=session(account), half=Math.ceil(raw.length/2);
  const chunked=load(LIVE,{[tokenKey+'.0']:raw.slice(0,half),[tokenKey+'.1']:raw.slice(half)});
  eq(chunked.PTAuth.user().id,'u1','split across .0 / .1');
  eq(chunked.nav.replaced,null,'and let through');
});

test('a token we cannot read counts as signed out — never as signed in', () => {
  const {nav,PTAuth}=load(LIVE,{[tokenKey]:'{not json at all'});
  eq(PTAuth.user(),null);
  eq(nav.replaced,LIVE+'auth','auth.html re-checks with the SDK and sends a real session back');
});

test('unrelated localStorage keys are not mistaken for a session', () => {
  const {nav}=load(LIVE,{'pitchtagger.rows.v1':'[]','pitchtagger.cloud.cfg':'{}'});
  eq(nav.replaced,LIVE+'auth');
});

/* ================= where the auth page lives ================= */
test('the deployed site uses the extension-less /auth, local copies the real file', () => {
  eq(load(LIVE,{}).nav.replaced,LIVE+'auth','GitHub Pages serves auth.html at /auth');
  eq(load(LOCAL,{}).nav.replaced,LOCAL+'auth.html','python -m http.server / file:// need the name');
});

test('the auth page itself is never gated — that is the loop the whole design avoids', () => {
  eq(load(LIVE+'auth',{}).nav.replaced,null,'the pretty URL');
  eq(load(LOCAL+'auth.html',{}).nav.replaced,null,'and the file name');
});

test('a sub-page finds the site root through its own ../auth.js', () => {
  eq(load(LIVE+'Stats/',{},'../auth.js').nav.replaced,LIVE+'auth?next=Stats%2F','not Stats/auth');
  eq(load(LIVE+'Player-Lists/',{},'../auth.js').nav.replaced,LIVE+'auth?next=Player-Lists%2F');
});

/* ================= coming back to where you were ================= */
test('the page you were turned away from is remembered, hash and all', () => {
  eq(load(LIVE+'#match=12345',{}).nav.replaced,LIVE+'auth?next=%23match%3D12345',
     'a shared match link survives the detour');
  eq(load(LIVE+'Stats/#match=12345',{},'../auth.js').nav.replaced,LIVE+'auth?next=Stats%2F%23match%3D12345');
});

test('nextUrl sends you back there, and to the app when there is nothing to go back to', () => {
  const at=q=>load(LIVE+'auth'+q,{}).PTAuth.nextUrl();
  eq(at('?next=%23match%3D12345'),LIVE+'#match=12345','back to the match');
  eq(at('?next=Stats%2F'),LIVE+'Stats/','back to the sub-page');
  eq(at(''),LIVE,'no next: the main tab');
});

test('nextUrl refuses to be an open redirect', () => {
  const at=q=>load(LIVE+'auth'+q,{}).PTAuth.nextUrl();
  eq(at('?next=https%3A%2F%2Fevil.com'),LIVE,'absolute URL off the site');
  eq(at('?next=%2F%2Fevil.com'),LIVE,'protocol-relative');
  eq(at('?next=javascript%3Aalert(1)'),LIVE,'javascript: URL');
  eq(at('?next=%2Fsomewhere-else'),LIVE,'another path on the same host, outside the site');
  eq(at('?next=auth'),LIVE,'and never the auth page itself — that would loop');
});

/* ================= signing out ================= */
test('signing out in one tab shuts the gate in the others', () => {
  const {nav,ls}=load(LIVE,{[tokenKey]:session(account)});
  eq(nav.replaced,null,'in at first');
  const onStorage=nav.events.storage;
  ok(onStorage&&onStorage.length===1,'the app page listens for the token going away');

  ls.removeItem(tokenKey);                       // what the other tab's sign-out does
  onStorage[0]({key:tokenKey});
  eq(nav.replaced,LIVE+'auth','this tab follows it out');
});

test('another tab writing unrelated keys does not sign you out', () => {
  const {nav}=load(LIVE,{[tokenKey]:session(account)});
  nav.events.storage[0]({key:'pitchtagger.rows.v1'});
  eq(nav.replaced,null,'the app keeps running while the tagging stores sync between tabs');
});

/* ================= the wiring the site depends on ================= */
const page=p=>fs.readFileSync(path.join(ROOT,p),'utf8');

test('every page of the site is gated', () => {
  [['index.html','auth.js'],['Stats/index.html','../auth.js'],['Player-Lists/index.html','../auth.js']]
    .forEach(([f,src])=>{
      const html=page(f);
      ok(html.includes('<script src="'+src+'?v=1"></script>'),f+' loads the gate');
      // ahead of the CDN bundles: a visitor with no account should not download them at all
      ok(html.indexOf(src)<html.indexOf('cdn.jsdelivr.net'),f+' loads it first');
    });
});

test('the sign-in screen ships, and asks for the fields it should', () => {
  const html=page('auth.html');
  ['fullName','email','password','confirm'].forEach(id=>ok(html.includes('id="'+id+'"'),id+' field'));
  ok(/signInWithPassword/.test(html),'email + password sign-in');
  ok(/signUp\(/.test(html)&&/full_name/.test(html),'sign-up stores the full name on the account');
  ok(/signInWithOAuth[\s\S]{0,80}google/.test(html),'and Google');
});

test('the new files are staged for GitHub Pages', () => {
  const yml=page('.github/workflows/deploy.yml');
  // the site is assembled from an explicit list — a file left out of it is a 404, not a bug you see locally
  ['auth.js','auth.html'].forEach(f=>ok(yml.includes('cp '+f+' _site/'+f),f+' is copied into _site'));
});
