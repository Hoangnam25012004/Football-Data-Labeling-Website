/* The client site's channels: creating one, who runs it, and the rail that
   reaches the three sections.

   supa.js is a plain browser IIFE with no build step, so the whole file runs
   in a sandbox against a stand-in Supabase client that records what was asked
   of it. Nothing here talks to a real database.

   The runner is synchronous (see tiny-test.js), so every scenario is kicked
   off at load and its result recorded in `res`; promise callbacks drain as
   microtasks, which happens before the setImmediate that starts the tests. */
const fs=require('fs'), path=require('path'), vm=require('vm');
const {test,eq,ok,notOk}=require('./tiny-test');

const ROOT=path.join(__dirname,'..');
const page=p=>fs.readFileSync(path.join(ROOT,p),'utf8');

const SUPA=page('client/assets/supa.js');
const APPJS=page('client/assets/app.js');
const APPHTML=page('client/app.html');
const APPCSS=page('client/assets/app.css');
const SQL=page('supabase/migrations/0014_channel_admin.sql');
const YML=page('.github/workflows/deploy.yml');

/* ---------- a Supabase client that answers from a handler ---------- */
function fakeDB(handler){
  const calls=[];
  function chain(state){
    const api={
      select(c){state.cols=c;return api;},
      order(c,o){state.order=[c,o||null];return api;},
      eq(k,v){state.filters.push(['eq',k,v]);return api;},
      is(k,v){state.filters.push(['is',k,v]);return api;},
      in(k,v){state.filters.push(['in',k,v]);return api;},
      single(){state.single=true;return api;},
      then(onOk,onErr){
        calls.push(state);
        let out;
        try{out=handler(state);}
        catch(e){return Promise.reject(e).then(onOk,onErr);}
        return Promise.resolve(out===undefined?{data:null,error:null}:out).then(onOk,onErr);
      }
    };
    return api;
  }
  const client={
    from(table){return {
      select(c){return chain({table,op:'select',cols:c,filters:[]});},
      insert(p){return chain({table,op:'insert',payload:p,filters:[]});},
      update(p){return chain({table,op:'update',payload:p,filters:[]});},
      delete(){return chain({table,op:'delete',filters:[]});}
    };},
    rpc(fn,args){return chain({table:null,op:'rpc',fn,args,filters:[]});},
    auth:{getSession:()=>Promise.resolve({data:{session:null}})}
  };
  return {client,calls};
}

/* Load supa.js the way app.html does, against that client. */
function loadAPI(handler){
  const db=fakeDB(handler||(()=>({data:[],error:null})));
  const win={supabase:{createClient:()=>db.client}};
  const ctx={console,window:win,URLSearchParams,Promise};
  vm.createContext(ctx);
  vm.runInContext(SUPA,ctx,{filename:'client/assets/supa.js'});
  return {api:win.HNA,calls:db.calls};
}
const one=(calls,table,op)=>calls.filter(c=>c.table===table&&(!op||c.op===op))[0];

/* ================= scenarios, kicked off at load ================= */
const res={};

/* creating a channel */
(function(){
  const {api,calls}=loadAPI(s=>{
    if(s.table==='clubs'&&s.op==='insert')
      return {data:Object.assign({id:'c1',created_at:'2026-08-09'},s.payload),error:null};
    return {data:[],error:null};
  });
  res.createCalls=calls;
  api.channels.create({name:'Saint Lucia',sport:'football',country:'Saint Lucia',
                       competition:'FIFA World Cup 26 Qualifying'})
     .then(c=>{res.created=c;},e=>{res.createErr=e;});
})();

/* a name with Vietnamese diacritics */
(function(){
  const {api,calls}=loadAPI(s=>({data:Object.assign({id:'c2'},s.payload),error:null}));
  res.viCalls=calls;
  api.channels.create({name:'Đội Bóng Hà Nội'}).then(c=>{res.viCreated=c;},e=>{res.viErr=e;});
})();

/* the table is not there yet — 0014 has not been run */
(function(){
  const {api}=loadAPI(()=>({data:null,error:{code:'42P01',message:'relation "public.clubs" does not exist'}}));
  api.channels.create({name:'Anything'}).then(()=>{},e=>{res.missingTable=e;});
})();

/* the caller is not an admin of the channel */
(function(){
  const {api}=loadAPI(()=>({data:null,error:{code:'42501',message:'new row violates row-level security policy'}}));
  api.channels.invite('c1','someone@club.com','viewer').then(()=>{},e=>{res.notAdmin=e;});
})();

/* a channel must keep an admin */
(function(){
  const {api}=loadAPI(()=>({data:null,error:{message:'A channel must keep at least one admin.'}}));
  api.channels.removeMember('c1','u1').then(()=>{},e=>{res.lastAdmin=e;});
})();

/* invites */
(function(){
  const {api,calls}=loadAPI(s=>({data:Object.assign({id:'i1',created_at:'x'},s.payload),error:null}));
  res.inviteCalls=calls;
  api.channels.invite('c1','  Coach@Club.COM ','analyst').then(i=>{res.invited=i;},e=>{res.inviteErr=e;});
  api.channels.invite('c1','not-an-email','viewer').then(()=>{},e=>{res.badEmail=e;});
})();

/* the members list */
(function(){
  const {api,calls}=loadAPI(s=>{
    if(s.table==='club_members') return {data:[
      {user_id:'u3',role:'viewer',email:'zoe@club.com',display_name:'Zoe',added_at:'2026-01-03T00:00:00Z'},
      {user_id:'u1',role:'admin',email:'nam@club.com',display_name:'Hoang Nam',added_at:'2026-01-01T00:00:00Z'},
      {user_id:'u2',role:'analyst',email:'ana@club.com',display_name:null,added_at:'2026-01-02T00:00:00Z'}
    ],error:null};
    return {data:[],error:null};
  });
  res.memberCalls=calls;
  api.channels.members('c1').then(m=>{res.members=m;},e=>{res.membersErr=e;});
})();

/* the channel list, with the caller's own role merged in */
(function(){
  const {api,calls}=loadAPI(s=>{
    if(s.table==='clubs') return {data:[
      {id:'c1',slug:'saint-lucia',name:'Saint Lucia',crest_text:'SLU',sport:'football',country:'Saint Lucia'},
      {id:'c9',slug:'other',name:'Other Club'}
    ],error:null};
    if(s.table==='club_members') return {data:[{club_id:'c1',role:'admin'}],error:null};
    return {data:[],error:null};
  });
  res.clubCalls=calls;
  api.clubs().then(c=>{res.clubs=c;},e=>{res.clubsErr=e;});
})();

/* the invite-claiming RPC is missing: the app must still open */
(function(){
  const {api}=loadAPI(s=>{
    if(s.op==='rpc') throw new Error('function public.claim_club_invites() does not exist');
    return {data:[],error:null};
  });
  api.channels.claim().then(n=>{res.claimed=n;},e=>{res.claimErr=e;});
})();

/* a name that is all whitespace */
(function(){
  const {api,calls}=loadAPI(()=>({data:{},error:null}));
  res.blankCalls=calls;
  api.channels.create({name:'   '}).then(()=>{},e=>{res.blankErr=e;});
})();

/* matches carry the side's own starting XI */
(function(){
  const {api,calls}=loadAPI(s=>{
    if(s.table==='matches') return {data:[{
      id:'m1',match_code:32746,home_name:'Saint Lucia',away_name:'Barbados',
      home_score:2,away_score:1,kickoff:'2025-06-11',our_side:'home',published:true,
      lineups:{home:{xi:[{no:1,x:5,y:50}],roster:[{no:1,name:'Keeper'}],subs:[7],dir:'lr'},
               away:{xi:[],roster:[],subs:[],dir:'rl'}}
    }],error:null};
    return {data:[],error:null};
  });
  res.matchCalls=calls;
  api.matches('c1').then(m=>{res.matches=m;},e=>{res.matchErr=e;});
})();

/* ================= creating a channel ================= */
test('creating a channel writes one clubs row, and the caller never sets the role', () => {
  const ins=one(res.createCalls,'clubs','insert');
  ok(ins,'a clubs insert happened');
  eq(ins.payload.name,'Saint Lucia');
  eq(ins.payload.sport,'football');
  eq(ins.payload.country,'Saint Lucia');
  eq(ins.payload.competition,'FIFA World Cup 26 Qualifying');
  notOk('role' in ins.payload,'the role comes from the database trigger, not from the browser');
  notOk('created_by' in ins.payload,'nor does the browser name the owner — the column defaults to auth.uid()');
  notOk(one(res.createCalls,'club_members','insert'),'and no membership is written from here');
});

test('the slug is url-safe, unique-ish, and survives diacritics', () => {
  ok(/^saint-lucia-[a-z0-9]{4}$/.test(res.created.slug),'got '+res.created.slug);
  ok(/^doi-bong-ha-noi-[a-z0-9]{4}$/.test(res.viCreated.slug),
     'Vietnamese names become ASCII — got '+res.viCreated.slug);
  ok(!/[^a-z0-9-]/.test(res.viCreated.slug),'nothing but letters, digits and hyphens');
});

test('the monogram is taken from the name when none is typed', () => {
  eq(one(res.createCalls,'clubs','insert').payload.crest_text,'SLU','Saint Lucia');
  eq(one(res.viCalls,'clubs','insert').payload.crest_text,'DBO','Đội Bóng Hà Nội');
});

test('a monogram is letters — accents are folded, never dropped mid-word', () => {
  const {api}=loadAPI(()=>({data:[],error:null}));
  // the old class kept only Latin-1, so a tone-marked letter vanished and the
  // monogram was assembled out of the wreckage ("Đội Bóng Hải Phòng" -> IBÓ)
  eq(api.monogram('Đội Bóng Hải Phòng'),'DBO');
  eq(api.monogram('Hải Phòng'),'HPH');
  eq(api.monogram('Curaçao'),'CUR','a Latin-1 name is unchanged');
  eq(api.monogram('Saint Lucia'),'SLU','and so is a plain one');
  eq(api.monogram(''),'???','nothing to work with');
  eq(api.monogram('한국'),'???','a script with no Latin in it is not guessed at');
});

test('a channel with no name is refused before the database is touched', () => {
  eq(res.blankCalls.length,0,'nothing was sent');
  ok(res.blankErr,'and it rejected');
  ok(/name/i.test(res.blankErr.message),'got: '+res.blankErr.message);
});

/* ================= what the person is told when it fails ================= */
test('a database without 0014 says which file to run', () => {
  ok(/0014_channel_admin\.sql/.test(res.missingTable.message),
     'got: '+res.missingTable.message);
});

test('being refused by row-level security is explained as not being an admin', () => {
  eq(res.notAdmin.message,'Your account is not an admin of this channel.');
});

test('the last admin cannot be removed, and the reason survives the trip', () => {
  ok(/must keep at least one admin/i.test(res.lastAdmin.message),'got: '+res.lastAdmin.message);
});

/* ================= invites ================= */
test('an invite is stored lower-cased and trimmed, against the channel', () => {
  eq(res.invited.email,'coach@club.com');
  const ins=res.inviteCalls.filter(c=>c.table==='club_invites'&&c.op==='insert')[0];
  eq(ins.payload.club_id,'c1');
  eq(ins.payload.role,'analyst');
});

test('an address that is not an address never reaches the database', () => {
  ok(/valid email/i.test(res.badEmail.message),'got: '+res.badEmail.message);
  eq(res.inviteCalls.filter(c=>c.table==='club_invites').length,1,'only the good one was sent');
});

test('inviting sends no mail — it only writes a row', () => {
  // the wording the UI shows has to keep saying so, because nothing here can send one
  ok(/Nothing is emailed from here/.test(APPJS),'the invite card says so');
  notOk(/inviteUserByEmail|resend|sendEmail/i.test(SUPA),'and no mail API is called');
});

/* ================= reading ================= */
test('the members list is admins first, and shows people rather than uuids', () => {
  eq(res.members.map(m=>m.role).join(','),'admin,analyst,viewer');
  eq(res.members[0].name,'Hoang Nam');
  eq(res.members[0].email,'nam@club.com');
  eq(res.members[1].name,'','a member with no name recorded is left blank, not invented');
});

test('the channel list carries the role the caller holds in each', () => {
  eq(res.clubs.length,2);
  eq(res.clubs.filter(c=>c.slug==='saint-lucia')[0].role,'admin');
  eq(res.clubs.filter(c=>c.slug==='other')[0].role,null,'no membership row means no role');
});

test('clubs is read with select(*) so a database without 0014 still answers', () => {
  eq(one(res.clubCalls,'clubs','select').cols,'*',
     'naming sport/country would fail the whole query where those columns do not exist');
});

test('a missing claim function is survivable — the app still opens', () => {
  eq(res.claimed,0);
  notOk(res.claimErr,'it never rejects');
});

test('a match brings the starting XI of the channel-s own side', () => {
  ok(/lineups/.test(one(res.matchCalls,'matches','select').cols),'lineups is asked for');
  eq(res.matches[0].lineup.xi.length,1,'the home XI, because our_side is home');
  eq(res.matches[0].lineup.dir,'lr');
});

/* ================= the rail ================= */
const rail=/<nav class="side"[\s\S]*?<\/nav>/.exec(APPHTML)[0];

test('the rail is Home, Channel, Data — in that order', () => {
  const views=[], re=/data-view="([a-z]+)"/g;
  for (let m; (m=re.exec(rail)); ) views.push(m[1]);
  eq(views.join(','),'home,channel,data');
  ok(/data-view="home"[^>]*class="on"|class="on"[^>]*data-view="home"/.test(rail),'Home starts lit');
});

test('About Hoang Nam sits at the foot and leaves the app', () => {
  const about=/<div class="side-foot">[\s\S]*?<\/div>/.exec(rail);
  ok(about,'there is a foot section');
  ok(about[0].includes('https://hoangnam25012004.github.io/Football-Data-Labeling-Website/index.html'),
     'and it points at the public site');
  notOk(/data-view/.test(about[0]),'it is not a route — a data-view would be hijacked by the router');
  ok(rail.indexOf('side-foot')>rail.lastIndexOf('data-view'),'and it comes after the three sections');
});

test('only the routed links are hijacked, so About navigates normally', () => {
  ok(/querySelectorAll\('\.side a\[data-view\]'\)[\s\S]{0,200}preventDefault/.test(APPJS),
     'the click handler is bound to [data-view] only');
  notOk(/querySelectorAll\('\.side a'\)/.test(APPJS),'and never to every link on the rail');
});

test('the foot is pinned to the bottom on the rail and folded away on a phone', () => {
  ok(/\.side\{[^}]*flex-direction:column/.test(APPCSS.replace(/\s*\n\s*/g,'')),'the rail is a column');
  ok(/\.side-foot\{[^}]*margin-top:auto/.test(APPCSS.replace(/\s*\n\s*/g,'')),'so the foot drops to the bottom');
  ok(/@media \(max-width:860px\)[\s\S]*?\.side-foot\{[^}]*margin-left:auto/.test(APPCSS),
     'and moves to the end of the row when the rail turns horizontal');
});

/* ================= routing ================= */
test('the old #/matches still lands somewhere — it is now Home', () => {
  ok(/parts\[0\] === 'matches'[\s\S]{0,80}location\.replace\('#\/home'\)/.test(APPJS),
     'bookmarks and old links are redirected rather than left blank');
});

test('a match and the players list keep Home lit, and every section routes', () => {
  ok(/'match' \|\| parts\[0\] === 'players'\) \? 'home'/.test(APPJS),'the rail stays on Home');
  ['channel','data','players','match'].forEach(v=>{
    ok(new RegExp("parts\\[0\\] === '"+v+"'").test(APPJS),v+' is routed');
  });
});

test('Players is gone from the rail but not from the app', () => {
  notOk(/data-view="players"/.test(APPHTML),'no rail entry');
  ok(/function renderPlayers/.test(APPJS),'the view is still there');
  ok(/parts\[0\] === 'players'/.test(APPJS),'and still reachable at #/players');
});

/* ================= the migration ================= */
test('0014 adds what running a channel needs', () => {
  ok(/create table if not exists public\.club_invites/.test(SQL),'an invites table');
  ok(/create trigger clubs_creator_admin/.test(SQL),'the creator becomes admin');
  ok(/create or replace function public\.claim_club_invites/.test(SQL),'invites turn into memberships');
  ok(/club_members_keep_admin_del/.test(SQL)&&/club_members_keep_admin_upd/.test(SQL),
     'and a channel cannot be left without an admin, by deletion or by demotion');
  ok(/add column if not exists sport/.test(SQL)&&/add column if not exists country/.test(SQL),
     'the fields the create form asks for');
});

test('the membership-testing helpers are SECURITY DEFINER', () => {
  // a policy on club_members that plainly selects from club_members recurses for ever
  ['is_club_member','is_club_admin'].forEach(fn=>{
    const body=new RegExp('function public\\.'+fn+'\\([\\s\\S]*?\\$\\$;').exec(SQL);
    ok(body,fn+' is defined');
    ok(/security definer/.test(body[0]),fn+' bypasses RLS, or the policy using it recurses');
  });
});

test('creating is open, changing a channel stays with its admins', () => {
  ok(/create policy clubs_insert[\s\S]{0,140}created_by = auth\.uid\(\)/.test(SQL),'anyone signed in may create one');
  ok(/create policy clubs_update[\s\S]{0,200}is_club_admin/.test(SQL),'only its admins may change it');
  ok(/create policy club_members_modify[\s\S]{0,200}is_club_admin/.test(SQL),'and only they manage members');
});

test('the migration leaves the tagging app alone', () => {
  // matches / events / teams / players are what the labeling site reads and writes;
  // a policy dropped here would take the tagger down with it
  ['matches','events','teams','players','event_types'].forEach(t=>{
    notOk(new RegExp('(drop|create) policy[^\\n]*on public\\.'+t+'\\b').test(SQL),
      'no policy on public.'+t+' is touched');
    notOk(new RegExp('alter table public\\.'+t+'\\b[^\\n]*enable row level security').test(SQL),
      'and RLS on public.'+t+' is not re-armed');
  });
  notOk(/drop table|truncate|delete from/i.test(SQL),'nothing is dropped or emptied');
});

/* ================= shipping ================= */
test('every asset the client pages load is staged for GitHub Pages', () => {
  ['client/index.html','client/app.html','client/login.html'].forEach(f=>{
    (page(f).match(/assets\/([a-z0-9.\-]+)\?/g)||[]).forEach(ref=>{
      const name=ref.replace(/^assets\//,'').replace(/\?$/,'');
      ok(YML.includes('cp client/assets/'+name),f+' loads '+name+', which deploy.yml must copy');
    });
  });
});

test('the pages that changed ask for a fresh copy of what changed', () => {
  // an unbumped ?v= leaves a returning browser on the old file, and the old file
  // has no channel API at all
  ok(/app\.js\?v=2/.test(APPHTML),'app.js is bumped');
  ok(/supa\.js\?v=2/.test(APPHTML),'supa.js is bumped');
  ok(/app\.css\?v=2/.test(APPHTML),'app.css is bumped');
  const login=page('client/login.html');
  ok(/supa\.js\?v=2/.test(login)&&/app\.css\?v=2/.test(login),
     'login.html loads both of those too, so it is bumped in step');
});

