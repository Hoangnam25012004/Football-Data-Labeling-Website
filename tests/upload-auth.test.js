/* Who may get an R2 upload URL.

   The Worker used to sign for anyone whose request carried
   Origin: https://hoangnams.com — a header curl will send for anybody. These
   tests drive the real r2-presign.js (aws4fetch stubbed, Supabase faked) and
   pin that only a signed-in, non-anonymous staff account gets a URL, and that
   the tagging app sends the token that proves it. */
const {execFileSync}=require('child_process');
const {test,eq,ok}=require('./tiny-test');
const {readSrc,repoPath}=require('./harness');

const WORKER=readSrc('services/edge-worker/r2-presign.js');
const SYNC=readSrc('apps/tagger/cloud-sync.js');

/* The Worker is async and tiny-test is not, so the scenarios run to completion
   in a child process and come back as JSON. */
const driver=`
const fs=require('fs'), vm=require('vm');
let src=fs.readFileSync(process.argv[1],'utf8').replace(/\\r\\n/g,'\\n');
src=src.replace(/^import .*$/m,'').replace('export default','globalThis.W =');
const STAFF='11111111-1111-4111-8111-111111111111', NOBODY='22222222-2222-4222-8222-222222222222';
const users={'tok-staff':{id:STAFF},'tok-viewer':{id:NOBODY},'tok-anon':{id:STAFF,is_anonymous:true}};
const seen=[];
async function fakeFetch(url,init){
  seen.push(url);
  const auth=(init&&init.headers&&init.headers.authorization)||'';
  if(/\\/auth\\/v1\\/user$/.test(url)){
    const u=users[auth.replace('Bearer ','')];
    return {ok:!!u,json:async()=>u||{}};
  }
  if(/\\/rest\\/v1\\/staff/.test(url)) return {ok:true,json:async()=>url.indexOf(STAFF)>=0?[{user_id:STAFF}]:[]};
  throw new Error('unexpected fetch '+url);
}
class AwsClient{async sign(u){return {url:u+'&X-Amz-Signature=x'};}}
const ctx={fetch:fakeFetch,AwsClient,Response,JSON,String,Array,Date,URL,console,globalThis:null};
ctx.globalThis=ctx; vm.createContext(ctx); vm.runInContext(src,ctx);
const env={ALLOW_ORIGIN:'https://hoangnams.com',SUPABASE_URL:'https://x.supabase.co',SUPABASE_SERVICE_KEY:'svc',
  R2_ACCOUNT_ID:'a',R2_BUCKET:'b',R2_PUBLIC_BASE:'https://pub.example'};
const MATCH='33333333-3333-4333-8333-333333333333';
function req(token,body,method){
  const h={'Origin':'https://hoangnams.com','content-type':'application/json'};
  if(token)h.Authorization='Bearer '+token;
  return new Request('https://w.example/',{method:method||'POST',headers:h,body:method==='OPTIONS'?undefined:JSON.stringify(body||{matchId:MATCH,filename:'a b.mp4'})});
}
(async()=>{
  const out={};
  const run=async(name,r,e)=>{const res=await ctx.W.fetch(r,e||env);out[name]={status:res.status,body:await res.text(),allow:res.headers.get('Access-Control-Allow-Headers')};};
  await run('noToken',req(null));
  await run('anon',req('tok-anon'));
  await run('viewer',req('tok-viewer'));
  await run('forged',req('tok-forged'));
  await run('staff',req('tok-staff'));
  await run('badMatch',req('tok-staff',{matchId:'../../etc',filename:'x.mp4'}));
  await run('noSecrets',req('tok-staff'),{...env,SUPABASE_SERVICE_KEY:''});
  await run('preflight',req(null,null,'OPTIONS'));
  console.log(JSON.stringify(out));
})().catch(e=>{console.log(JSON.stringify({crash:String(e&&e.stack||e)}));});
`;
const R=JSON.parse(execFileSync(process.execPath,['-e',driver,repoPath('services/edge-worker/r2-presign.js')],{encoding:'utf8'}).trim().split('\n').pop());

test('the worker scenarios ran', () => { ok(!R.crash, R.crash); });

test('no token, no URL', () => {
  eq(R.noToken.status,401,'an Origin header alone no longer buys an upload');
  ok(!/uploadUrl/.test(R.noToken.body),'and nothing signed comes back');
});

test('an anonymous session is not an account', () => {
  eq(R.anon.status,401,'is_anonymous is refused even when its id is a staff id');
});

test('a signed-in account that is not staff is refused', () => {
  eq(R.viewer.status,401,'a club viewer cannot write into the bucket');
  eq(R.forged.status,401,'and a token Supabase does not recognise is refused');
});

test('staff get a signed URL under their match', () => {
  eq(R.staff.status,200);
  const b=JSON.parse(R.staff.body);
  ok(/^https:\/\/a\.r2\.cloudflarestorage\.com\/b\/matches\/33333333-3333-4333-8333-333333333333\/\d+-a_b\.mp4\?/.test(b.uploadUrl),b.uploadUrl);
  ok(b.publicUrl.indexOf('https://pub.example/matches/')===0,'and the public URL to save on the match');
});

test('matchId has to be a uuid, because it becomes a path segment', () => {
  eq(R.badMatch.status,400);
});

test('missing Supabase secrets fail closed', () => {
  eq(R.noSecrets.status,401,'a Worker deployed without SUPABASE_SERVICE_KEY signs for nobody');
});

test('the preflight lets the browser send its token', () => {
  ok(/authorization/i.test(R.preflight.allow),'Access-Control-Allow-Headers names authorization');
});

test('the tagging app sends its access token to the Worker', () => {
  const fn=/async function uploadToR2[\s\S]*?\n  \}/.exec(SYNC)[0];
  ok(/sb\.auth\.getSession\(\)/.test(fn),'it reads the current session');
  ok(/authorization: 'Bearer ' \+ /.test(fn),'and puts the access token on the presign request');
  ok(/'content-type': 'application\/json'/.test(fn),'beside the content type it always sent');
});
