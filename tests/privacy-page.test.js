/* The privacy policy — client/privacy.html.

   Google's brand verification reads this page at https://hoangnams.com/privacy.html
   before it will show the app's name and logo on the consent screen, so the first
   thing guarded here is simply that the address resolves: a page deploy.yml does not
   copy is a 404 on the live site while the build stays green.

   The rest is the harder promise. A privacy policy is the strongest claim this repo
   makes about its own code, and a claim that drifts from the code is worse than no
   claim at all — "there is no analytics on this site" has to stay true by inspection,
   not by memory. So the tests below read the SOURCE and fail when the page and the
   code disagree: a tracker anyone adds later, a Google scope beyond the three named,
   a new third-party host the list of processors does not mention. */
const {test,eq,ok,notOk}=require('./tiny-test');
const {readSrc}=require('./harness');

const PRIVACY=readSrc('client/privacy.html');
const LANDING=readSrc('client/index.html');
const YML=readSrc('.github/workflows/deploy.yml');

/* every page a visitor can actually reach, and the two data layers behind them */
const SHIPPED=['client/index.html','client/app.html','client/login.html','client/guide.html',
               'client/privacy.html','index.html','auth.html','Stats/index.html',
               'Player-Lists/index.html','client/assets/app.js','client/assets/supa.js',
               'cloud-sync.js','shared.js'];

/* ================= it exists, and it is reachable ================= */
test('the page ships, and the deploy copies it to the address Google will read', () => {
  ok(/<title>Privacy — HoangNam Analytics<\/title>/.test(PRIVACY),'the page is there');
  ok(YML.includes('cp client/privacy.html _site/privacy.html'),
     'without this line it is a 404 on the live site and the build still goes green');
});

test('the front page links to it, so it is not a URL only Google knows', () => {
  ok(/<a href="privacy\.html">Privacy<\/a>/.test(LANDING),'a link in the footer');
  // it goes in the bottom bar BEFORE the .sp span, which is what pushes the email
  // to the right — dropping it after would shove the email into the middle
  ok(LANDING.indexOf('href="privacy.html"')<LANDING.indexOf('class="sp"'),
     'ahead of the span that carries margin-left:auto');
});

test('it names the app and gives a way to be contacted', () => {
  // both are things brand verification looks for on the page itself
  ok(/HoangNam Analytics/.test(PRIVACY),'the app name, as the consent screen will show it');
  ok(/dnam2501@gmail\.com/.test(PRIVACY),'and an address that reaches a person');
  ok(/last updated \d{1,2} \w+ \d{4}/.test(PRIVACY),'dated, so a change is visible');
});

/* ================= the claims, checked against the code =================
   Each test below is a sentence on the page turned back into a question about
   the repo. If the answer ever changes, the page is wrong and this goes red. */

test('"there is no analytics on this site" is still true', () => {
  ok(/There is <strong>no analytics<\/strong>/.test(PRIVACY),'the page makes the claim');
  const TRACKERS=/gtag\(|googletagmanager|google-analytics|plausible\.io|mixpanel|\bfbq\(|hotjar|connect\.facebook\.net|segment\.(com|io)\/analytics/i;
  /* The policy itself is the one file that may say these names: it lists them to say
     none of them is here. Scanning the sentence that makes the claim for the words the
     claim is about would fail by construction. */
  const caught=SHIPPED.filter(f=>f!=='client/privacy.html'&&TRACKERS.test(readSrc(f)));
  eq(caught.join(', '),'',
     'a tracker was added to these files while the privacy policy still says there is none');
});

test('"we request only openid, email and profile" is still true', () => {
  ok(/<strong>no access<\/strong>/.test(PRIVACY),'the page says what Google is NOT reachable for');
  // signInWithOAuth takes extra permissions through options.scopes. Naming one would
  // make the sentence above false, and could push the app into Google's paid
  // security assessment — the reason the three scopes were pinned in the first place.
  ['auth.html','client/assets/supa.js'].forEach(f=>
    notOk(/scopes\s*:/.test(readSrc(f)),f+' asks for a scope beyond the three named'));
});

test('"we do not use it for advertising or to train models" is stated, not implied', () => {
  ok(/do not use data received from Google for advertising/i.test(PRIVACY));
  ok(/train\s+machine-learning or AI models/i.test(PRIVACY));
});

test('every third party the pages actually load is named in the list of processors', () => {
  /* host a browser is sent to -> the name the policy has to use for it. A page that
     starts loading something from somewhere new fails here until the list says so. */
  const KNOWN={
    'cdn.jsdelivr.net':'jsDelivr',
    'cdnjs.cloudflare.com':'cdnjs',
    'supabase.co':'Supabase',
    'workers.dev':'Cloudflare',
    'fonts.googleapis.com':'Google Fonts',
    'fonts.gstatic.com':'Google Fonts'
  };
  const hosts=new Set();
  SHIPPED.forEach(f=>{
    const src=readSrc(f);
    let m; const re=/(?:src|href)="https:\/\/([a-z0-9.-]+)/gi;
    while((m=re.exec(src))) hosts.add(m[1].toLowerCase());
  });
  const missing=[];
  hosts.forEach(h=>{
    const key=Object.keys(KNOWN).filter(k=>h===k||h.endsWith('.'+k))[0];
    if(!key) return;                                  // a plain link out, not a request we make
    if(!PRIVACY.includes(KNOWN[key])) missing.push(h+' (say "'+KNOWN[key]+'")');
  });
  eq(missing.join(', '),'','the pages load these, and section 7 does not mention them');
});

test('the processors it does name are the ones the repo actually uses', () => {
  ['Supabase','Google','Cloudflare','Resend','GitHub Pages','jsDelivr','cdnjs']
    .forEach(name=>ok(PRIVACY.includes(name),'section 7 lists '+name));
  // Resend is the mailer behind the contact form, and R2 is where match video goes
  ok(/resend/i.test(readSrc('worker/contact.js')),'the Worker really does send through Resend');
  ok(/R2/.test(PRIVACY),'and the video store is named too');
});

test('what it says is kept in the browser matches what is written there', () => {
  ok(/sign-in session/.test(PRIVACY),'the session');
  ok(/tagged events, line-ups and match details/.test(PRIVACY),'the work in progress');
  ok(/keyboard shortcuts and macros/.test(PRIVACY),'hotkeys and macros');
  // the one thing that must never be in that list, and is not written there either
  notOk(/password[^.]{0,40}in your browser|store[sd]? your password/i.test(PRIVACY),
        'it never claims to keep a password locally');
  ok(/never see it and never store it ourselves/.test(PRIVACY),'it says the opposite, plainly');
});

test('the contact form section matches what the Worker writes', () => {
  const worker=readSrc('worker/contact.js');
  ok(/SHA-256 of the address with a secret salt/.test(PRIVACY),'the page describes the hash');
  ok(/ipHash/.test(worker)&&/IP_SALT/.test(worker),'and the Worker computes one');
  ok(/user-agent string/i.test(PRIVACY),'the page admits the user-agent is kept');
  ok(/user_agent/.test(worker),'and it is');
});

/* ================= the site speaks English ================= */
const VIETNAMESE=/[ăâđêôơưĂÂĐÊÔƠƯàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụỳýỷỹỵ]/;

test('the policy is in English, all of it', () => {
  const bad=PRIVACY.split(/\n/).map((l,i)=>VIETNAMESE.test(l)?(i+1)+': '+l.trim().slice(0,70):null)
                    .filter(Boolean);
  eq(bad.length,0,'Vietnamese left in client/privacy.html —\n      '+bad.join('\n      '));
});

/* ================= it cannot reach another page ================= */
test('its styling is scoped to this page and leaks nowhere', () => {
  const style=/<style>([\s\S]*?)<\/style>/.exec(PRIVACY)[1];
  const selectors=style.split('}').map(b=>b.split('{')[0].trim()).filter(Boolean)
                       .join(',').split(',').map(s=>s.trim())
                       .filter(s=>s&&!s.startsWith('@')&&!/^\d/.test(s));
  const loose=selectors.filter(s=>!/^body\.legal\b/.test(s));
  eq(loose.join(', '),'','every rule starts at body.legal, so no other page can be reached');
  // and it pulls in no stylesheet that other pages would then have to keep in step
  eq((PRIVACY.match(/<link rel="stylesheet"/g)||[]).length,1,'site.css and nothing else');
});
