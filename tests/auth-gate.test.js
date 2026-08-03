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
const {test,eq,ok,notOk}=require('./tiny-test');
const {grabConst,grabFunction}=require('./harness');

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
    location:{href:url.href,pathname:url.pathname,search:url.search,hash:url.hash,
              hostname:url.hostname,origin:url.origin,replace(u){nav.replaced=u;}},
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

/* ================= a confirmation link that landed on the wrong page ================= */
test('tokens that land on the app are carried to the auth page, not thrown away', () => {
  // what happens when Supabase falls back to the Site URL because emailRedirectTo was
  // not in the project's Redirect URLs: the confirmation worked, and its tokens must not
  // be lost to a plain "please sign in" bounce
  const hash='#access_token=eyJhbG.fake.jwt&refresh_token=r1&token_type=bearer&type=signup';
  eq(load(LIVE+hash,{}).nav.replaced,LIVE+'auth'+hash,'handed over whole, hash intact');
  eq(load(LIVE+'?code=pkce-abc123',{}).nav.replaced,LIVE+'auth?code=pkce-abc123','PKCE too');
});

test('an expired confirmation link carries its reason across as well', () => {
  const hash='#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid';
  eq(load(LIVE+hash,{}).nav.replaced,LIVE+'auth'+hash,'so the auth page can say what went wrong');
});

test('the app’s own #match= link is not mistaken for one', () => {
  eq(load(LIVE+'#match=12345',{}).nav.replaced,LIVE+'auth?next=%23match%3D12345',
     'still the ordinary "come back here after signing in" path');
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
  ['siEmail','siPassword','suName','suEmail','suPassword','suConfirm']
    .forEach(id=>ok(html.includes('id="'+id+'"'),id+' field'));
  ok(/signInWithPassword/.test(html),'email + password sign-in');
  ok(/signUp\(/.test(html)&&/full_name/.test(html),'sign-up stores the full name on the account');
});

test('no handler reaches for a field that no longer exists', () => {
  const html=page('auth.html');
  // splitting the form renamed every input; a missed $('password') would throw on submit
  ['email','password','confirm','fullName','submitBtn','authForm','pwRules','fldName','fldConfirm']
    .forEach(id=>notOk(new RegExp("\\$\\('"+id+"'\\)").test(html),"nothing still calls $('"+id+"')"));
});

test('Google sign-in is gone, and takes every reference with it', () => {
  const html=page('auth.html');
  notOk(/signInWithOAuth|provider/i.test(html),'no OAuth call left behind');
  // the one that bites: working() touched $('googleBtn') on EVERY submit, so a leftover
  // reference to a button that no longer exists would kill Sign in and Create account
  notOk(/googleBtn/.test(html),'nothing still reaches for the button');
  notOk(/\.google\b|accounts\.google/.test(html),'and its styling and logo are gone too');
});

/* ================= what a new password has to be ================= */
const AUTH_HTML=page('auth.html');
const pwCtx={};
vm.createContext(pwCtx);
vm.runInContext([grabConst('PW_RULES',AUTH_HTML,'auth.html'),
                 grabFunction('pwProblem',AUTH_HTML,'auth.html'),
                 ';globalThis.pwProblem=pwProblem;'].join('\n'),pwCtx,{filename:'auth.html-pw.js'});
const pwProblem=pwCtx.pwProblem;

test('a new password needs 6 characters, a capital and a special character', () => {
  eq(pwProblem('Abcde!'),null,'exactly six, with both — the shortest thing that passes');
  eq(pwProblem('Str0ng!Pass'),null,'a longer one too');
  eq(pwProblem('Abc1!'),'Password needs at least 6 characters.','five is one short');
  eq(pwProblem('abcdef!'),'Password needs one capital letter (A–Z).','no capital');
  eq(pwProblem('Abcdefg'),'Password needs one special character (! ? @ # …).','letters and digits only');
  eq(pwProblem('Abcdef1'),'Password needs one special character (! ? @ # …).','a digit is not a special character');
});

test('everything missing is said at once, not one round at a time', () => {
  eq(pwProblem('abc'),'Password needs at least 6 characters, one capital letter (A–Z), '
    +'one special character (! ? @ # …).');
  eq(pwProblem(''),'Password needs at least 6 characters, one capital letter (A–Z), '
    +'one special character (! ? @ # …).');
});

const handler=id=>new RegExp("\\$\\('"+id+"'\\)\\.addEventListener\\('submit'[\\s\\S]*?\\n  \\}\\);").exec(AUTH_HTML)[0];

test('signing in is not held to the rule — an older account must still get in', () => {
  const signIn=handler('signInForm');
  notOk(/pwProblem/.test(signIn),'no strength check when signing in');
  ok(/!pw\b/.test(signIn),'just "type something"');
  ok(/pwProblem/.test(handler('signUpForm')),'while sign-up does run it');
});

// what each handler READS is everything up to the point it starts talking to Supabase
const readsOf=id=>handler(id).split('working(true')[0];

test('each form reads its own fields, and only its own', () => {
  const signIn=readsOf('signInForm'), signUp=readsOf('signUpForm');
  ['suName','suPassword','suConfirm','suEmail'].forEach(id=>notOk(signIn.includes(id),'sign-in ignores '+id));
  ['siEmail','siPassword'].forEach(id=>notOk(signUp.includes(id),'sign-up ignores '+id));
  ok(/siEmail[\s\S]{0,120}siPassword/.test(signIn),'sign-in takes the pair it owns');
  ok(/suName[\s\S]{0,200}suEmail[\s\S]{0,200}suPassword[\s\S]{0,200}suConfirm/.test(signUp),'sign-up takes all four');
});

test('a new account is handed to the sign-in form ready to go', () => {
  // confirmation is on, so sign-up ends on the sign-in tab — with both boxes already filled
  const signUp=handler('signUpForm');
  ok(/setMode\('in'\)/.test(signUp),'switches tab');
  ok(/\$\('siEmail'\)\.value = email/.test(signUp)&&/\$\('siPassword'\)\.value = pw/.test(signUp),
     'and carries the pair over, so nothing is retyped');
});

/* ================= staying signed in, and the browser keeping the password ================= */
test('a session already past its access-token expiry still opens the gate', () => {
  // the refresh token outlives it, and cloud-sync.js renews on load — turning the machine
  // off for a week must not log anyone out. Only signing out ends a session.
  const stale=session(account,{expires_at:Math.floor(Date.now()/1000)-99999});
  const {nav,PTAuth}=load(LIVE,{[tokenKey]:stale});
  eq(nav.replaced,null,'let straight in');
  eq(PTAuth.user().email,'dnam2501@gmail.com');
});

/* The sign-in form must look like nothing but a sign-in form. A password manager reads
   form.elements and ignores CSS, so when the two lived in ONE form the new-password and
   confirm boxes were in it whether or not they were on screen — and Chrome reads a form
   holding both a current-password and a new-password as a sign-up or change-password
   form, which it does not fill a saved login into. That is why they are split. */
const formOf=id=>new RegExp('<form id="'+id+'"[\\s\\S]*?</form>').exec(page('auth.html'))[0];

test('the sign-in form holds a username and a password, and nothing else', () => {
  const f=formOf('signInForm');
  ok(/id="siEmail"[^>]*autocomplete="username"/.test(f),'username field marked as such');
  ok(/id="siPassword"[^>]*autocomplete="current-password"/.test(f),'and the password field');
  eq((f.match(/<input/g)||[]).length,2,'exactly two inputs');
  notOk(/new-password/.test(f),'no new-password in it — that is what made Chrome misread it');
  notOk(/autocomplete="name"/.test(f),'and no name field either');
});

test('the sign-up form asks for all four, and never offers the old password', () => {
  const f=formOf('signUpForm');
  eq((f.match(/<input/g)||[]).length,4,'name, email, password, confirm');
  eq((f.match(/autocomplete="new-password"/g)||[]).length,2,'both password boxes are new-password');
  notOk(/current-password/.test(f),'never the saved one');
  ok(/id="suEmail"[^>]*autocomplete="username"/.test(f),'so the manager knows what to file it under');
});

test('and the browser is asked outright as well', () => {
  const html=page('auth.html');
  ok(/name="email"/.test(html)&&/name="password"/.test(html),'named too, for older heuristics');
  ok(/navigator\.credentials\.store/.test(html)&&/PasswordCredential/.test(html),
     'Chrome is asked to save rather than left to guess from the redirect');
  ok(/await remember\(/.test(html),'and it is awaited, so the prompt is up before we navigate');
  notOk(/\$\('siEmail'\)\.focus\(\)/.test(html),'nothing grabs focus mid-autofill');
});

/* ================= the site speaks English ================= */
const VIETNAMESE=/[ăâđêôơưĂÂĐÊÔƠƯàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụỳýỷỹỵ]/;

test('the sign-in screen is in English, all of it', () => {
  const html=page('auth.html');
  notOk(VIETNAMESE.test(html),'no Vietnamese left, in the page or its comments');
});

test('so is everything the gate added to the main tab', () => {
  const html=page('index.html');
  ok(html.includes('title="Sign out of this account"'),'the sign-out tooltip');
  ok(/confirm\('Sign out of '/.test(html),'and the prompt it raises');
  notOk(/Đăng xuất|tài khoản này/.test(html),'no Vietnamese left in the sign-out control');
});

/* ================= the ▾ Other menu ================= */
test('the account lives in ▾ Other, to the left of Event', () => {
  const html=page('index.html');
  const other=html.indexOf('id="otherBtn"'), event=html.indexOf('id="eventBtn"');
  ok(other>-1,'the button is there');
  ok(other<event,'and it comes before Event on the bar');
  // the two things it holds, in the order asked for
  const who=html.indexOf('id="otherWho"'), out=html.indexOf('id="signOutBtn"');
  ok(who>-1&&out>who,'the account name first, Sign out under it');
  ok(html.indexOf('id="otherMenu"')<who&&who<html.indexOf('</header>'),'both inside the menu, in the header');
});

test('nothing is left loose on the bar', () => {
  const html=page('index.html');
  notOk(/whoami/.test(html),'the old name chip is gone, with no dangling reference');
  const bar=html.slice(html.indexOf('<header>'),html.indexOf('</header>'));
  // Sign out may only appear inside the menu now, never as a sibling of the other buttons
  notOk(/class="ev-btn" id="signOutBtn"/.test(bar),'and the old header button with it');
  ok(/class="other-item" id="signOutBtn"/.test(bar),'it is a menu row instead');
});

test('the menu opens, closes, and gets out of the way', () => {
  const src=page('index.html');
  const menu=/---- ▾ Other[\s\S]*?\n\}\)\(\);/.exec(src)[0];
  ok(/stopPropagation\(\)[\s\S]{0,40}setOpen\(!isOpen\(\)\)/.test(menu),
     'its own click does not immediately close it again');
  ok(/document\.addEventListener\('click'[\s\S]{0,90}!menu\.contains\(e\.target\)[\s\S]{0,20}setOpen\(false\)/.test(menu),
     'a click anywhere else closes it');
  ok(/Escape[\s\S]{0,80}setOpen\(false\)[\s\S]{0,40}\},true\)/.test(menu),
     'Escape closes it, in the capture phase so it lands before the tagging shortcuts');
  ok(/if\(isOpen\(\)/.test(menu)&&/e\.key==='Escape'&&isOpen\(\)/.test(menu),
     'and both only act while it is open, so the modals keep their own Escape');
  ok(/\$\('signOutBtn'\)\.onclick[\s\S]{0,60}setOpen\(false\)/.test(menu),'signing out shuts it too');
});

/* Every file that is actually served. The alerts, toasts, tooltips and hints across the
   Cloud modal, the new-match dialog and the substitution flow were Vietnamese; they are
   English now, and this keeps them that way — including in the comments, so the next
   person reading the source is not switching languages either. */
test('and so is the rest of the site, file by file', () => {
  ['index.html','cloud-sync.js','auth.html','auth.js','shared.js','shared.css',
   'Stats/index.html','Stats/report.js','Player-Lists/index.html'].forEach(f=>{
    const lines=page(f).split(/\r?\n/);
    const bad=lines.map((l,i)=>VIETNAMESE.test(l)?(i+1)+': '+l.trim().slice(0,70):null).filter(Boolean);
    eq(bad.length,0,f+' has Vietnamese left —\n      '+bad.join('\n      '));
  });
});

test('the new files are staged for GitHub Pages', () => {
  const yml=page('.github/workflows/deploy.yml');
  // the site is assembled from an explicit list — a file left out of it is a 404, not a bug you see locally
  ['auth.js','auth.html'].forEach(f=>ok(yml.includes('cp '+f+' _site/'+f),f+' is copied into _site'));
});
