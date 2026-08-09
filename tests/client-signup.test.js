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

const ROOT=path.join(__dirname,'..');
const page=p=>fs.readFileSync(path.join(ROOT,p),'utf8');

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

/* ================= styling ================= */
test('the switch is styled with the site-s own tokens', () => {
  const css=APPCSS.replace(/\s*\n\s*/g,'');
  ok(/\.auth-tabs\{[^}]*grid-template-columns:1fr 1fr/.test(css),'two equal halves');
  ok(/\.auth-tabs button\.on\{[^}]*background:var\(--red\)[^}]*color:#fff/.test(css),
     'the live one is the accent, filled, as every other primary control is');
  ok(/\.field-note\{/.test(css),'and the password rules have a style of their own');
});
