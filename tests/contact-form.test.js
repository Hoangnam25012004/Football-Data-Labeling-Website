/* The landing page's contact form, and the Worker behind it.

   "Email us" was a mailto:, which opens nothing at all on a machine with no
   mail client registered — and the page cannot detect that, so those visitors
   had no way through. The form is the way through. What is pinned here is
   mostly the ways it could quietly stop being one:

     • the mailto: fallback still being there when the JavaScript is not,
     • the handler being registered BEFORE the canvas early-return,
     • a failure telling the visitor where else to go,
     • and, on the Worker side, the lead being saved before the mail is sent
       so a bad send never costs an enquiry.

   worker/contact.js is executed, in a vm sandbox, against stubs for fetch and
   crypto. Nothing here talks to Supabase, Resend or Cloudflare. */
const fs=require('fs'), path=require('path'), vm=require('vm');
const {test,eq,ok,notOk}=require('./tiny-test');
const {readSrc}=require('./harness');

const LANDING=readSrc('client/index.html');
const CLOUD=readSrc('cloud-sync.js');
const ROUTER=readSrc('worker/index.js');
const PRESIGN=readSrc('worker/r2-presign.js');
const TOML=readSrc('worker/wrangler.toml');
const SQL=readSrc('supabase/migrations/0019_leads.sql');
const CONTACT=readSrc('worker/contact.js');
const YML=readSrc('.github/workflows/deploy.yml');

/* the page's own script, without the markup above it */
const SCRIPT=/<script>\n\(function \(\)[\s\S]*?<\/script>/.exec(LANDING)[0];
/* the submit handler on its own */
const HANDLER=(function(){
  const at=SCRIPT.indexOf("cForm.addEventListener('submit'");
  return SCRIPT.slice(at,SCRIPT.indexOf('\n    });',at));
})();

/* ================= the form is really a form ================= */
test('the CTA carries a real form, not a link dressed as one', () => {
  ok(/<form class="cta-form" id="contactForm" novalidate>/.test(LANDING),'the form element is there');
  ok(/<button class="btn btn-primary" id="cfSend" type="submit">/.test(LANDING),'with a submit button');
});

test('every field the design asked for is present, and named', () => {
  [['cfName','name'],['cfEmail','email'],['cfClub','club'],['cfRole','role'],
   ['cfCountry','country'],['cfVideo','videoUrl'],['cfMessage','message']].forEach(([id,name])=>{
    ok(new RegExp('id="'+id+'" name="'+name+'"').test(LANDING),id+' is on the page as name="'+name+'"');
  });
});

test('the four that decide are required, and email is typed as one', () => {
  const req=id=>new RegExp('id="'+id+'"[^>]*required').test(LANDING);
  ['cfName','cfEmail','cfClub','cfMessage'].forEach(id=>ok(req(id),id+' is required'));
  ok(/id="cfEmail"[^>]*type="email"/.test(LANDING),'the keyboard on a phone follows from this');
  // and the two optional ones are NOT — asking a club for a video link it does
  // not have yet is how you lose the enquiry
  ['cfCountry','cfVideo'].forEach(id=>notOk(req(id),id+' is optional'));
});

test('the role options are the people who actually decide', () => {
  ['Head coach','Assistant coach','Technical / sporting director',
   'Performance analyst','Academy director','Other'].forEach(r=>
    ok(LANDING.includes('<option>'+r+'</option>'),r+' is offered'));
});

/* ================= the honeypot ================= */
test('the honeypot is hidden by CSS and is NOT type=hidden', () => {
  ok(/id="cfWebsite" name="website" type="text"/.test(LANDING),'it is an ordinary text input');
  notOk(/id="cfWebsite"[^>]*type="hidden"/.test(LANDING),
    'a bot skips the fields a form marks hidden — the trick only works on one it can read');
  ok(/\.cf-hp\{position:absolute; left:-9999px/.test(LANDING),'and it is off-screen in CSS');
  ok(/id="cfWebsite"[^>]*tabindex="-1"/.test(LANDING),'no one reaches it by tab');
  ok(/<div class="cf-hp" aria-hidden="true">/.test(LANDING),'and a screen reader is not read it either');
});

/* ================= the fallback that must survive ================= */
test('the mailto: and the copy button are still there', () => {
  // this form is an ADDITION. With the JavaScript broken or blocked, the page
  // has to go on offering the address, which is the whole of the JS-off path.
  ok(/href="mailto:dnam2501@gmail\.com\?subject=/.test(LANDING),'the mailto: button survives');
  ok(/class="mail-copy" id="mailCopy" data-mail="dnam2501@gmail\.com"/.test(LANDING),'so does copy-the-address');
});

test('a failure names the address; a blank field does not', () => {
  const fail=/function cFail\(text\) \{[\s\S]*?\n    \}/.exec(SCRIPT)[0];
  ok(/\+ MAIL \+/.test(fail),'when it is our fault, the visitor is told where else to go');
  ok(/var MAIL = 'dnam2501@gmail\.com'/.test(SCRIPT),'and MAIL is the same address the page shows');
  // a field the visitor has not filled in is not a dead end, and saying
  // "email us instead" there would be nonsense
  ok(/return cSay\('Please tell us your name\.', true\)/.test(HANDLER),'a blank name just says so');
  notOk(/cFail\('Please/.test(SCRIPT),'no validation message routes through cFail');
});

/* ================= where the handler sits ================= */
test('the form is wired up BEFORE the canvas early-return', () => {
  // the IIFE ends with `if (!cv) return;` and the tactical canvas after it.
  // Registered below that line, the form would be dead on any page without
  // the canvas — and dead silently.
  const form=SCRIPT.indexOf("document.getElementById('contactForm')");
  const bail=SCRIPT.indexOf('if (!cv) return;');
  ok(form>-1&&bail>-1,'both are in the script');
  ok(form<bail,'the form is wired up first');
});

test('the endpoint is the Worker the tagging app already uses', () => {
  const ep=/var CONTACT_ENDPOINT = '([^']+)'/.exec(SCRIPT)[1];
  ok(/^https:\/\//.test(ep),'https, so the clipboard and fetch both work');
  ok(/\/contact$/.test(ep),'and it is the /contact path');
  const r2=/workerUrl: '([^']+)'/.exec(CLOUD)[1];
  eq(new URL(ep).host,new URL(r2).host,
     'one Worker, two paths — if it moves, both move together');
});

test('sending disables the button and failing gives it back', () => {
  ok(/cBtn\.disabled = true;\n      cBtn\.textContent = 'Sending…';/.test(HANDLER),'it locks while in flight');
  const fail=/function cFail\(text\) \{[\s\S]*?\n    \}/.exec(SCRIPT)[0];
  ok(/cBtn\.disabled = false;/.test(fail)&&/cBtn\.textContent = 'Send';/.test(fail),
     'and a failed send can be retried rather than stranding the visitor');
  ok(/\.catch\(function \(\) \{ cFail\('We could not reach the server\.'\); \}\)/.test(HANDLER),
     'a dead network lands in the same place as a refused one');
});

test('the elapsed time is a duration, not a clock reading', () => {
  ok(/elapsed: Date\.now\(\) - shownAt/.test(HANDLER),
     'both readings come from the visitor-s own clock, so a wrong one costs nothing');
  notOk(/t: Date\.now\(\)/.test(HANDLER),'no timestamp is compared against the server-s clock');
});

/* ================= it ships ================= */
test('the form needs no new file staged for GitHub Pages', () => {
  // CSS and script are inline in client/index.html on purpose: site.css is
  // loaded by all three client pages, so touching it would mean bumping ?v=
  // in three places. index.html already has its cp line.
  ok(YML.includes('cp client/index.html'),'the page itself is copied');
  notOk(/assets\/contact/.test(LANDING),'and nothing new is loaded from assets/');
});

/* ================= the router ================= */
test('/contact is the only path taken off presign', () => {
  ok(/pathname === '\/contact'/.test(ROUTER),'the contact path is matched');
  ok(/return presign\.fetch\(request, env, ctx\);/.test(ROUTER),'and everything else falls through');
  // cloud-sync.js posts to the bare Worker URL, so the root has to go on
  // meaning presign for every copy of the tagging app already in a browser
  ok(/fetch\(R2\.workerUrl, \{/.test(CLOUD),'cloud-sync.js still posts to the bare URL');
});

test('r2-presign.js was not touched to make room for this', () => {
  ok(/export default \{/.test(PRESIGN)&&/async fetch\(request, env\) \{/.test(PRESIGN),'it still exports its own fetch');
  ok(/if \(request\.method === 'OPTIONS'\) return new Response\(null, \{ headers \}\);/.test(PRESIGN),
     'it still answers its own preflight');
  ok(/uploadUrl: signed\.url/.test(PRESIGN),'and still returns what cloud-sync.js reads');
  notOk(/contact|leads|resend/i.test(PRESIGN),'nothing about the form leaked into it');
});

test('the deployed Worker URL does not move', () => {
  ok(/^name = "r2-presign"$/m.test(TOML),'the name is the URL, and it is unchanged');
  ok(/^main = "index\.js"$/m.test(TOML),'only the entry file moved');
});

/* ================= worker/contact.js, executed ================= */
const ORIGIN='https://hoangnam25012004.github.io';
const ENV={
  ALLOW_ORIGIN:ORIGIN, SUPABASE_URL:'https://db.example.co',
  SUPABASE_SERVICE_KEY:'SERVICE-ROLE-SECRET', RESEND_API_KEY:'RESEND-SECRET',
  RESEND_FROM:'from@example.co', CONTACT_TO:'dnam2501@gmail.com', IP_SALT:'pepper'
  /* no CONTACT_KV: the rate limiter has to be optional, or `wrangler dev`
     would need a KV namespace before it would run at all */
};
const GOOD={name:'Ada Coach',email:'ada@club.com',club:'Saint Lucia FA',role:'Head coach',
  country:'Saint Lucia',videoUrl:'https://x.co/m.mp4',message:'Please look at our qualifier.',
  website:'',elapsed:45000};

const reply=(status,body)=>({ok:status>=200&&status<300,status,
  json:()=>Promise.resolve(body),text:()=>Promise.resolve(JSON.stringify(body))});

function callContact(body,o){
  o=o||{};
  const calls=[];
  const ctx={
    console, URL, TextEncoder, Uint8Array, ArrayBuffer, Response,
    /* a stub, so the digest settles on the microtask queue and the results are
       all in hand before tiny-test runs — the real one may not */
    crypto:{subtle:{digest:()=>Promise.resolve(new ArrayBuffer(32))}},
    fetch:(url,init)=>{
      calls.push({url:String(url),init:init||{}});
      if(/\/rest\/v1\/leads\?/.test(String(url)))return Promise.resolve(reply(200,[{}]));
      if(/\/rest\/v1\/leads/.test(String(url)))
        return Promise.resolve(o.insertFails?reply(500,{message:'nope'}):reply(201,[{id:'lead-1'}]));
      if(/api\.resend\.com/.test(String(url)))
        return Promise.resolve(o.mailFails?reply(422,{message:'no'}):reply(200,{id:'m1'}));
      return Promise.resolve(reply(404,{}));
    }
  };
  vm.createContext(ctx);
  vm.runInContext(CONTACT.replace(/^export default /m,'globalThis.__contact = '),ctx,
    {filename:'worker/contact.js'});

  const head={origin:'origin' in o?o.origin:ORIGIN,'cf-connecting-ip':'203.0.113.9','user-agent':'UA'};
  const request={
    method:o.method||'POST',
    headers:{get:h=>head[String(h).toLowerCase()]!==undefined?head[String(h).toLowerCase()]:null},
    json:()=>o.badJson?Promise.reject(new Error('bad')):Promise.resolve(body)
  };
  return ctx.__contact.fetch(request,ENV)
    .then(r=>r.json().then(data=>({status:r.status,data,calls})));
}

const w={};
const done=Promise.all([
  callContact(GOOD).then(r=>{w.good=r;}),
  callContact(Object.assign({},GOOD,{website:'http://spam.example'})).then(r=>{w.pot=r;}),
  callContact(Object.assign({},GOOD,{elapsed:400})).then(r=>{w.fast=r;}),
  callContact(Object.assign({},GOOD,{name:''})).then(r=>{w.noName=r;}),
  callContact(Object.assign({},GOOD,{email:'not-an-email'})).then(r=>{w.badMail=r;}),
  callContact(Object.assign({},GOOD,{club:''})).then(r=>{w.noClub=r;}),
  callContact(Object.assign({},GOOD,{message:'   '})).then(r=>{w.noMsg=r;}),
  callContact(GOOD,{origin:'https://evil.example'}).then(r=>{w.origin=r;}),
  callContact(GOOD,{method:'GET'}).then(r=>{w.get=r;}),
  callContact(GOOD,{badJson:true}).then(r=>{w.junk=r;}),
  callContact(GOOD,{insertFails:true}).then(r=>{w.dbDown=r;}),
  callContact(GOOD,{mailFails:true}).then(r=>{w.mailDown=r;})
]);

/* Registered only once every call above has settled. tiny-test schedules its
   run on the first test() it sees, and a test registered after that run has
   started is skipped in silence — which would look exactly like passing. */
done.then(()=>{

test('a good enquiry is saved and then mailed, in that order', () => {
  eq(w.good.status,200);
  eq(w.good.data.ok,true);
  const hits=w.good.calls.map(c=>c.url);
  const db=hits.findIndex(u=>/\/rest\/v1\/leads$/.test(u));
  const mail=hits.findIndex(u=>/api\.resend\.com/.test(u));
  ok(db>-1,'the lead is written');
  ok(mail>-1,'and the mail goes out');
  ok(db<mail,'saved BEFORE mailed — a lead is worth more than the notification about it');
});

test('the lead carries what the club actually told us', () => {
  const row=JSON.parse(w.good.calls.find(c=>/\/rest\/v1\/leads$/.test(c.url)).init.body);
  eq(row.name,'Ada Coach'); eq(row.club,'Saint Lucia FA'); eq(row.role,'Head coach');
  eq(row.video_url,'https://x.co/m.mp4'); eq(row.source,'landing');
  eq(row.email,'ada@club.com','and the address is folded to lower case');
});

test('the caller-s IP is hashed, never stored', () => {
  const row=JSON.parse(w.good.calls.find(c=>/\/rest\/v1\/leads$/.test(c.url)).init.body);
  ok(row.ip_hash,'a hash is recorded');
  notOk(/203\.0\.113\.9/.test(JSON.stringify(row)),'the address itself is nowhere in the row');
  ok(/crypto\.subtle\.digest\('SHA-256'/.test(CONTACT),'and it is a real digest, not a truncation');
});

test('Reply in the inbox answers the club, not the Worker', () => {
  const mail=JSON.parse(w.good.calls.find(c=>/api\.resend\.com/.test(c.url)).init.body);
  eq(mail.reply_to,'ada@club.com','which is the entire point of the notification');
  eq(mail.to,'dnam2501@gmail.com');
  ok(mail.subject.includes('Saint Lucia FA'),'and the subject names the club');
});

test('the honeypot answers success and writes nothing', () => {
  eq(w.pot.status,200); eq(w.pot.data.ok,true,'a bot is told nothing it can learn from');
  eq(w.pot.calls.length,0,'and no row, no mail, no spend');
});

test('a form filled in faster than a person could read it goes the same way', () => {
  eq(w.fast.status,200); eq(w.fast.data.ok,true);
  eq(w.fast.calls.length,0,'nothing written');
});

test('the four required fields are checked again on this side', () => {
  [['noName','name'],['badMail','email'],['noClub','club'],['noMsg','message']].forEach(([k,what])=>{
    eq(w[k].status,400,what+' is refused by the server, not only by the page');
    ok(w[k].data.error,'with a sentence a person can act on');
    eq(w[k].calls.length,0,'and nothing is written on the way to refusing');
  });
});

test('the door is shut to other origins, other methods and junk', () => {
  eq(w.origin.status,403,'another origin is refused');
  eq(w.get.status,405,'GET is refused');
  eq(w.junk.status,400,'a body that is not JSON is refused');
});

test('a database that will not take the lead is an error the visitor sees', () => {
  eq(w.dbDown.status,502);
  ok(/email us directly/i.test(w.dbDown.data.error),'and it points at the address on the page');
  notOk(w.dbDown.calls.some(c=>/api\.resend\.com/.test(c.url)),'no mail about a lead that was not saved');
});

test('a mail that will not send does NOT cost the enquiry', () => {
  eq(w.mailDown.status,200);
  eq(w.mailDown.data.ok,true,'the visitor is told it arrived, because it did');
  const patch=w.mailDown.calls.find(c=>/\/rest\/v1\/leads\?id=eq\./.test(c.url));
  ok(patch,'the row is marked instead');
  const body=JSON.parse(patch.init.body);
  eq(body.email_sent,false);
  ok(body.email_error,'with the reason, so it is not lost in silence');
});

test('no reply ever carries a secret back to the browser', () => {
  ['good','dbDown','mailDown','noName','origin','junk'].forEach(k=>{
    const s=JSON.stringify(w[k].data);
    notOk(s.includes('SERVICE-ROLE-SECRET'),k+' leaks the service role key');
    notOk(s.includes('RESEND-SECRET'),k+' leaks the Resend key');
  });
});

test('the rate limiter is optional, not required', () => {
  // every call above ran with no CONTACT_KV binding and still worked
  eq(w.good.data.ok,true);
  ok(/if \(!kv\) return \{ allowed: true, mayMail: true \};/.test(CONTACT),
     'so wrangler dev needs no KV namespace before it will run');
});

/* ================= 0019_leads.sql ================= */
test('the migration only adds', () => {
  notOk(/drop table|truncate|delete from/i.test(SQL),'nothing is dropped or emptied');
  ok(/create table if not exists public\.leads/.test(SQL),'and it can be run twice');
});

test('nothing served to a browser can read or write public.leads', () => {
  ok(/alter table public\.leads enable row level security;/.test(SQL),'RLS is on');
  // THE test of this file. The anon key is committed to this repo and served
  // in the JavaScript of a static site; a policy for anon here would publish
  // every club that ever wrote to us, or hand the internet a writable table.
  notOk(/on public\.leads[\s\S]*?to anon/.test(SQL),'there is no policy for anon');
  notOk(/create policy[^;]*on public\.leads for insert/i.test(SQL),
     'and no INSERT policy at all — the Worker writes with the service role key');
});

test('staff read it, by the same rule as everything else', () => {
  ok(/create policy leads_staff_read on public\.leads for select to authenticated\s*\n\s*using \(public\.is_staff\(\)\);/.test(SQL),
     'is_staff() from 0013 is reused rather than re-invented');
});

});
