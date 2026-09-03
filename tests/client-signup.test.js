/* The client site's sign-in page, now that it can also create an account.

   auth.html does the same job for the tagging app and learned several things
   the hard way — two separate forms so a password manager can tell them
   apart, a settle before navigating away, and password rules stated up front.
   This page has to hold the same line, so a good deal of what is below pins
   one file against the other rather than against a value written twice.

   supa.js's signUp() is executed, against the same stand-in Supabase client
   the channel tests use. Nothing here talks to a real database. */
const fs=require('fs'), path=require('path'), vm=require('vm');
const {test,eq,ok,notOk}=require('./tiny-test');
const {readSrc}=require('./harness');

const ROOT=path.join(__dirname,'..');
/* through harness's one door, so a working copy git has rewritten with CRLF
   still matches the patterns below — every one of them is written against the
   LF the repository stores. See the note over readSrc in harness.js. */
const page=readSrc;

const LOGIN=page('client/login.html');
const SUPA=page('client/assets/supa.js');
const APPCSS=page('client/assets/app.css');
const AUTH_HTML=page('auth.html');

/* the page's own script, without the markup above it */
const SCRIPT=/<script>\n\(function \(\)[\s\S]*?<\/script>/.exec(LOGIN)[0];
const handler=id=>{
  const at=SCRIPT.indexOf("$('"+id+"').addEventListener('submit'");
  return SCRIPT.slice(at,SCRIPT.indexOf('\n  });',at));
};

/* ---------- a Supabase auth client that records what it was asked ---------- */
function loadAPI(authImpl){
  const calls=[];
  const auth=Object.assign({
    getSession:()=>Promise.resolve({data:{session:null}}),
    signUp(a){calls.push(['signUp',a]);return Promise.resolve({data:{session:null,user:{id:'u9'}},error:null});}
  },authImpl||{});
  const win={supabase:{createClient:()=>({from:()=>({}),auth})}};
  const ctx={console,window:win,URLSearchParams,Promise,URL};
  vm.createContext(ctx);
  vm.runInContext(SUPA,ctx,{filename:'client/assets/supa.js'});
  return {api:win.HNA,calls};
}

const res={};
(function(){
  const {api,calls}=loadAPI();
  res.upCalls=calls;
  api.auth.signUp('coach@club.com','Passw0rd!','Ada Coach')
    .then(d=>{res.up=d;},e=>{res.upErr=e;});
})();
(function(){
  const {api}=loadAPI({signUp:()=>Promise.resolve({data:null,error:{message:'User already registered'}})});
  api.auth.signUp('taken@club.com','Passw0rd!','X').then(()=>{},e=>{res.taken=e;});
})();

/* ================= supa.js ================= */
test('signUp sends the name, and a confirmation link back to this site', () => {
  const [, arg]=res.upCalls[0];
  eq(arg.email,'coach@club.com');
  eq(arg.password,'Passw0rd!');
  eq(arg.options.data.full_name,'Ada Coach','the name is stored on the account');
  ok(/login\.html$/.test(arg.options.emailRedirectTo),
     'a club confirming its email lands back on the club site, not on the tagger');
  ok(res.up&&res.up.user,'and what came back is handed on');
});

test('signUp joins no channel — that is an admin-s decision', () => {
  const fn=/signUp: function \(email, password, name\)[\s\S]*?\n      \},/.exec(SUPA)[0];
  notOk(/club_members|clubs|insert/.test(fn),'it writes to no channel table');
  // the reason sits in the comment immediately above it
  const doc=SUPA.slice(SUPA.lastIndexOf('/*',SUPA.indexOf('signUp: function')),SUPA.indexOf('signUp: function'));
  ok(/by invitation/.test(doc),'and says so, next to the code');
});

test('a rejected sign-up rejects, with what the server said', () => {
  ok(/already registered/i.test(res.taken.message),'the message survives');
});

test('the site root is read off this script, not off whatever page loaded it', () => {
  // supa.js is on both login.html and app.html; location would be either
  ok(/document\.currentScript\.src/.test(SUPA),'the URL comes from the script tag');
  ok(/new URL\('\.\.\/'/.test(SUPA),'assets/ is one level under the site root');
  ok(/return '';/.test(SUPA),'and nothing throws where there is no document at all');
});

/* ================= two forms, not one ================= */
test('sign in and sign up are separate forms', () => {
  ok(/<form id="loginForm"/.test(LOGIN)&&/<form id="signupForm"/.test(LOGIN),'both are real forms');
  // a password manager reads form.elements, never the screen: one form holding
  // both a current-password and a new-password is read as a sign-up, and those
  // are not offered the login you saved. auth.html learned this first.
  const signIn=/<form id="loginForm"[\s\S]*?<\/form>/.exec(LOGIN)[0];
  const signUp=/<form id="signupForm"[\s\S]*?<\/form>/.exec(LOGIN)[0];
  ok(/autocomplete="username"/.test(signIn)&&/autocomplete="current-password"/.test(signIn),
     'sign-in is username + current-password and nothing else');
  notOk(/new-password|name="name"/.test(signIn),'with no new-password or name field in it');
  ok(/autocomplete="new-password"/.test(signUp)&&/autocomplete="name"/.test(signUp),
     'sign-up is unmistakably a sign-up');
  ok(/A password manager reads/.test(LOGIN),'and the reason is written down');
});

test('neither form reads the other-s boxes', () => {
  /* reads only — `$('email').value = email` is a WRITE, and the one the
     sign-up handler makes on purpose: after an account that needs confirming,
     the credentials are put into the sign-in form ready for afterwards. */
  const reads=s=>[...s.matchAll(/\$\('([A-Za-z]+)'\)\.value(?! *=)/g)].map(m=>m[1]);
  const signIn=reads(handler('loginForm')), signUp=reads(handler('signupForm'));
  ['suName','suEmail','suPassword','suConfirm'].forEach(i=>notOk(signIn.includes(i),'sign-in ignores '+i));
  ['email','password'].forEach(i=>notOk(signUp.includes(i),'sign-up ignores '+i));
});

test('the strength rules are checked on sign-up only', () => {
  notOk(/pwProblem/.test(handler('loginForm')),
        'an account made before the rule tightened must still be able to get in');
  ok(/pwProblem/.test(handler('signupForm')),'a new password is held to it');
  ok(/do not match/.test(handler('signupForm')),'and confirmed');
});

test('the rules are the same three auth.html states', () => {
  const rules=s=>[...s.matchAll(/'(at least 6 characters|one capital letter \(A–Z\)|one special character \(! \? @ # …\))'/g)]
    .map(m=>m[1]).sort();
  eq(JSON.stringify(rules(LOGIN)),JSON.stringify(rules(AUTH_HTML)),
     'two sign-up pages, one standard for a password');
  ok(/class="field-note"/.test(LOGIN),'and they are stated under the box, not only on rejection');
});

/* ================= the switch ================= */
test('the tabs swap the forms and say what the page is for', () => {
  ok(/id="tabIn"/.test(LOGIN)&&/id="tabUp"/.test(LOGIN),'there are two tabs');
  const set=/function setMode\(m\)[\s\S]*?\n  \}/.exec(SCRIPT)[0];
  ok(/\$\('loginForm'\)\.hidden = up;/.test(set)&&/\$\('signupForm'\)\.hidden = !up;/.test(set),
     'exactly one form is on screen');
  ok(/aria-selected/.test(set),'and the tab says which');
  ok(/if \(from\.value && !to\.value\) to\.value = from\.value;/.test(set),
     'switching after a typo does not cost the address already typed');
  ok(/if \(up\) \$\('suName'\)\.focus\(\);/.test(set),
     'and focus is never stolen on the sign-in form, where a saved fill is in flight');
});

test('a new account is told it still needs an invitation', () => {
  ok(/invites this email address to it|invitation to its club/.test(LOGIN),
     'otherwise a fresh account hits "No channel yet" with no idea why');
});

/* ================= what happens after ================= */
test('a sign-up that has to be confirmed hands over to the sign-in form', () => {
  const up=handler('signupForm');
  ok(/if \(!data \|\| !data\.session\)/.test(up),'no session means Supabase wants a confirmation first');
  ok(/setMode\('in'\)/.test(up)&&/\$\('email'\)\.value = email;/.test(up),
     'the credentials are waiting on the other tab for afterwards');
  ok(/confirmation link/.test(up),'and the message says what to do');
});

test('nothing navigates away before the browser can offer to save', () => {
  ok(/setTimeout\(function \(\) \{ location\.replace\('app\.html'\); \}, 700\);/.test(SCRIPT),
     'the same wait auth.html takes, for the same reason');
  ok(/password manager/.test(SCRIPT),'which is written down here too');
});

test('a confirmation link that landed here is finished, and a dead one explained', () => {
  ok(/HNA\.auth\.session\(\)[\s\S]{0,120}location\.replace\('app\.html'\)/.test(SCRIPT),
     'tokens in the URL become a signed-in browser');
  ok(/error_description=/.test(SCRIPT),'and an expired link says so instead of showing a blank form');
});

test('Supabase-s wording is turned into something a coach can act on', () => {
  const ex=/function explain\(err\)[\s\S]*?\n  \}/.exec(SCRIPT)[0];
  ['invalid login','email not confirmed','already registered','rate limit']
    .forEach(k=>ok(ex.includes(k),'it handles '+k));
});

/* ================= Continue with Google =================
   One button doing the work of both tabs, because an OAuth provider has no separate
   sign-up. The rules it is held to are the ones auth.html paid for: it stays outside
   both forms, and working() is never told it exists. */
test('supa.js can start a Google sign-in, and joins no channel doing it', () => {
  const fn=/signInWithGoogle: function \(\)[\s\S]*?\n      \},/.exec(SUPA)[0];
  ok(/provider: 'google'/.test(fn),'the provider is named');
  ok(/ROOT \+ 'login\.html'/.test(fn),'home is this site’s own sign-in page, not the tagger’s');
  ok(/skipBrowserRedirect: true/.test(fn),'the page navigates, not the library');
  ok(/prompt: 'select_account'/.test(fn),'the account chooser');
  notOk(/club_members|clubs|insert/.test(fn),'it writes to no channel table');
});

test('the Google button is outside both forms here too', () => {
  const signIn=/<form id="loginForm"[\s\S]*?<\/form>/.exec(LOGIN)[0];
  const signUp=/<form id="signupForm"[\s\S]*?<\/form>/.exec(LOGIN)[0];
  [signIn,signUp].forEach(f=>notOk(/googleBtn/.test(f),'not inside a form'));
  ok(/<button type="button" class="btn btn-google" id="googleBtn">/.test(LOGIN),
     'type=button, so it cannot submit one by accident');
  const working=/function working\(on, label\)[\s\S]*?\n  \}/.exec(SCRIPT)[0];
  notOk(/googleBtn/.test(working),'working() is untouched — auth.html learned this the hard way');
  ok(/function gWorking\(on\)/.test(SCRIPT),'the button has a switch of its own');
});

test('a project with Google switched off does not strand a club on a JSON page', () => {
  ok(/function alive\(url\)/.test(SCRIPT),'the destination is asked about before we go');
  ok(/PREFLIGHT_MS/.test(SCRIPT)&&/Promise\.race/.test(SCRIPT),'and the asking is capped');
  const ex=/function explain\(err\)[\s\S]*?\n  \}/.exec(SCRIPT)[0];
  ['unsupported provider','access_denied','bad_oauth_state','already linked']
    .forEach(k=>ok(ex.includes(k),'it handles '+k));
});

test('a club is told what Google does, and does not do, about their channel', () => {
  ok(/Google creates your account the first time/.test(LOGIN),'no separate sign-up to look for');
  ok(/invitation to your\s+club/.test(LOGIN),'and it still waits for an invitation');
});

test('the two sign-in pages offer the same provider', () => {
  ok(/Continue with Google/.test(LOGIN)&&/Continue with Google/.test(AUTH_HTML),
     'one label, two pages');
});

/* ================= tokens that came home to the wrong door =================
   Supabase honours redirectTo only if it is in the project's Redirect URLs; otherwise
   it falls back to the Site URL, which is the landing page — and that page loads no
   Supabase client at all, so without this the sign-in would succeed and look like
   nothing happened. The tagging app has auth.js for this; the client site has these. */
const LANDING=page('client/index.html');

test('both sign-in pages leave a breadcrumb before they go to Google', () => {
  ok(/hna\.oauth\.home/.test(SCRIPT)&&/'login\.html'/.test(SCRIPT),'the club site says so');
  ok(/hna\.oauth\.home/.test(AUTH_HTML)&&/'tagger\/auth'/.test(AUTH_HTML),'and the tagger');
  // the hash says nothing about which door it came from: an OAuth callback has no type=
  ok(/setItem\('hna\.oauth\.home'/.test(SCRIPT),'written before the browser leaves');
});

test('the landing page hands the tokens to whichever page started the trip', () => {
  ok(/getItem\('hna\.oauth\.home'\)/.test(LANDING),'it reads the breadcrumb');
  ok(/removeItem\('hna\.oauth\.home'\)/.test(LANDING),'once — a stale one would misroute the next');
  ok(/var home = 'tagger\/auth'/.test(LANDING),
     'and with no breadcrumb it is an emailed confirmation link, which went there before');
  ok(/location\.replace\(home \+ location\.search \+ location\.hash\)/.test(LANDING),
     'the whole callback is handed over, not a summary of it');
});

/* ================= the picture Google hands over ================= */
const APPJS=page('client/assets/app.js');

test('an account signed in with Google shows its picture, one made with a password its initial', () => {
  const fn=/function showAvatar\(user\)[\s\S]*?\n  \}/.exec(APPJS)[0];
  ok(/meta\.avatar_url \|\| meta\.picture/.test(fn),'both keys Google can use');
  ok(/if \(!photo\)[\s\S]{0,120}av\.textContent = initial/.test(fn),
     'no picture is the other half of the design, not a failure');
  // the URL arrives from a provider; parsing it as markup is how a provider writes script
  ok(/img\.src = photo/.test(fn),'set as a property');
  notOk(/innerHTML/.test(fn),'never through innerHTML');
  ok(/addEventListener\('error'/.test(fn),'and one Google will not serve falls back to the initial');
});

test('signing out takes the picture with it', () => {
  const shell=/function renderShell\(\)[\s\S]*?\n  \}/.exec(APPJS)[0];
  ok(/showAvatar\(state\.user\)/.test(shell),'signed in: the chip is rendered from the account');
  ok(/classList\.remove\('has-photo'\)[\s\S]{0,80}textContent = '\?'/.test(shell),
     'signed out: back to the question mark, with no photo class left behind');
});

/* ================= styling ================= */
test('the switch is styled with the site-s own tokens', () => {
  const css=APPCSS.replace(/\s*\n\s*/g,'');
  ok(/\.auth-tabs\{[^}]*grid-template-columns:1fr 1fr/.test(css),'two equal halves');
  ok(/\.auth-tabs button\.on\{[^}]*background:var\(--red\)[^}]*color:#fff/.test(css),
     'the live one is the accent, filled, as every other primary control is');
  ok(/\.field-note\{/.test(css),'and the password rules have a style of their own');
});

test('the Google button and the avatar are styled with the site-s own sheet', () => {
  const css=APPCSS.replace(/\s*\n\s*/g,'');
  ok(/\.auth-or\{[^}]*display:flex/.test(css),'the divider is a rule, not a one-off');
  ok(/\.btn-google\{[^}]*background:#fff/.test(css),
     'Google’s own light button, kept as they specify it rather than restyled in the red');
  ok(/\.avatar img\{[^}]*border-radius:50%/.test(css),'the picture fills the round chip');
});
