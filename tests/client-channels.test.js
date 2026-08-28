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
const {readSrc}=require('./harness');

const ROOT=path.join(__dirname,'..');
const page=readSrc;                       // CRLF-folded: see readSrc in harness.js

const SUPA=page('client/assets/supa.js');
const APPJS=page('client/assets/app.js');
const APPHTML=page('client/app.html');
const APPCSS=page('client/assets/app.css');
const SQL=page('supabase/migrations/0014_channel_admin.sql');
const YML=page('.github/workflows/deploy.yml');
const SQL15=page('supabase/migrations/0015_match_stats_event_names.sql');
const DICT=JSON.parse(page('pitchtagger_events.json'));
/* comments stripped before anything is extracted — a stray semicolon in one
   would otherwise end a statement halfway through */
const bare=s=>s.replace(/--[^\n]*/g,'');
const viewBody=src=>/create or replace view public\.match_stats as([\s\S]*?);/.exec(bare(src))[1];

/* ---------- a Supabase client that answers from a handler ---------- */
function fakeDB(handler,session){
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
    // a signed-in caller by default; clubs() needs an id to scope the
    // membership read to. Pass null for a signed-out visitor.
    auth:{getSession:()=>Promise.resolve({data:{session:session===undefined
      ?{user:{id:'u1',email:'me@club.com'}}:session}})}
  };
  return {client,calls};
}

/* Load supa.js the way app.html does, against that client. */
function loadAPI(handler,session){
  const db=fakeDB(handler||(()=>({data:[],error:null})),session);
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

/* the channel list, with the caller's own role merged in.

   club_members answers the way the database does: club_members_read lets a
   member read EVERY membership row of a channel they are in, so an unfiltered
   read gets somebody else's role too — and it is deliberately returned last,
   which is what the old unfiltered loop kept. Drop the .eq('user_id') from
   clubs() and the caller comes back a viewer. */
(function(){
  const {api,calls}=loadAPI(s=>{
    if(s.table==='clubs') return {data:[
      {id:'c1',slug:'saint-lucia',name:'Saint Lucia',crest_text:'SLU',sport:'football',country:'Saint Lucia'},
      {id:'c9',slug:'other',name:'Other Club'}
    ],error:null};
    if(s.table==='club_members'){
      const all=[{club_id:'c1',user_id:'u1',role:'admin'},
                 {club_id:'c1',user_id:'u2',role:'viewer'}];
      const f=s.filters.filter(x=>x[1]==='user_id')[0];
      return {data:f?all.filter(r=>r.user_id===f[2]):all,error:null};
    }
    return {data:[],error:null};
  });
  res.clubCalls=calls;
  api.clubs().then(c=>{res.clubs=c;},e=>{res.clubsErr=e;});
})();

/* the same list for a signed-out visitor, who is reading a public channel */
(function(){
  const {api,calls}=loadAPI(s=>{
    if(s.table==='clubs') return {data:[{id:'c1',slug:'open',name:'Open',is_public:true}],error:null};
    return {data:[],error:null};
  },null);
  res.anonCalls=calls;
  api.clubs().then(c=>{res.anonClubs=c;},e=>{res.anonErr=e;});
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

/* A match as the tagging app actually leaves one: no scoreline on the row and
   no kickoff, because nothing over there writes either — the date went in as
   0011's match_date and the goals are in the events. Two matches, so the
   ordering has something to do; m3 is the one with no date at all. */
(function(){
  const {api,calls}=loadAPI(s=>{
    if(s.table==='matches') return {data:[
      {id:'m3',code:'44686',home_name:'C',away_name:'D',
       home_score:null,away_score:null,kickoff:null,match_date:null,
       our_side:'home',published:true},
      {id:'m2',code:'44685',home_name:'Stafford Town FC U18',away_name:'Hanley Town FC',
       home_score:null,away_score:null,kickoff:null,match_date:'2026-08-09',
       our_side:'away',published:true}
    ],error:null};
    /* either name: which of the two views is read is decided by the session,
       and public-channels.test.js is where that choice is checked */
    if(/match_stats$/.test(s.table||'')) return {data:[
      {match_id:'m2',team:'home',goals:1,shots:6,events_tagged:400},
      {match_id:'m2',team:'away',goals:3,shots:9,events_tagged:520},
      /* m3 was tagged for one side only — the other has no row at all */
      {match_id:'m3',team:'home',goals:0,shots:2,events_tagged:80}
    ],error:null};
    return {data:[],error:null};
  });
  res.taggedCalls=calls;
  api.matches('c1').then(m=>{res.tagged=m;},e=>{res.taggedErr=e;});
})();

/* the same two matches, with a scoreline typed onto the row by hand */
(function(){
  const {api}=loadAPI(s=>{
    if(s.table==='matches') return {data:[{
      id:'m2',code:'44685',home_name:'Stafford Town FC U18',away_name:'Hanley Town FC',
      home_score:2,away_score:3,kickoff:null,match_date:'2026-08-09',
      our_side:'away',published:true
    }],error:null};
    if(/match_stats$/.test(s.table||'')) return {data:[
      {match_id:'m2',team:'home',goals:1,shots:6,events_tagged:400},
      {match_id:'m2',team:'away',goals:3,shots:9,events_tagged:520}
    ],error:null};
    return {data:[],error:null};
  });
  api.matches('c1').then(m=>{res.corrected=m;},e=>{res.correctedErr=e;});
})();

/* a match nobody has tagged: published, but not one event on it */
(function(){
  const {api}=loadAPI(s=>{
    if(s.table==='matches') return {data:[{
      id:'m4',code:'44687',home_name:'E',away_name:'F',
      home_score:null,away_score:null,kickoff:null,match_date:'2026-08-10',
      our_side:'home',published:true
    }],error:null};
    return {data:[],error:null};
  });
  api.matches('c1').then(m=>{res.untagged=m;},e=>{res.untaggedErr=e;});
})();

/* ================= creating a channel ================= */
test('creating a channel writes one clubs row, and the caller never sets the role', () => {
  const ins=one(res.createCalls,'clubs','insert');
  ok(ins,'a clubs insert happened');
  eq(ins.payload.name,'Saint Lucia');
  eq(ins.payload.sport,'football');
  eq(ins.payload.country,'Saint Lucia');
  notOk('role' in ins.payload,'the role comes from the database trigger, not from the browser');
  notOk('created_by' in ins.payload,'nor does the browser name the owner — the column defaults to auth.uid()');
  notOk(one(res.createCalls,'club_members','insert'),'and no membership is written from here');
});

test('the insert asks for nothing back, or it refuses itself', () => {
  // INSERT ... RETURNING makes Postgres apply the SELECT policy to the new
  // row before handing it over. clubs_read asks is_club_member(), and the
  // membership comes from clubs_creator_admin — an AFTER INSERT trigger, so
  // it fires at the END of the statement. The row is therefore refused by
  // the statement that creates it (42501) for everyone whose is_staff() is
  // false, which is every client account. A .select() here is that bug.
  const ins=one(res.createCalls,'clubs','insert');
  notOk(ins.cols,'no column list, so PostgREST sends no RETURNING');
  notOk(ins.single,'and nothing asks for the single row back');
  eq(res.created.slug,ins.payload.slug,'the caller is handed the slug it generated');
  ok(/c\.slug === created\.slug/.test(APPJS),'and app.js finds the new channel by that slug');
  notOk(/insert\(row\)\s*\.select/.test(SUPA),'the insert is not re-decorated with one');
});

test('a channel carries no competition and no stage', () => {
  // a club plays in several over a season — a qualifying campaign, a league, a
  // cup — so one of each pinned to the channel is wrong from the second one on.
  // They belong to the match, and the fixture list already reads them there.
  const ins=one(res.createCalls,'clubs','insert');
  notOk('competition' in ins.payload,'not sent, even though one was passed in');
  notOk('stage' in ins.payload,'nor a stage');
  notOk(/id="ncComp"|id="ncStage"/.test(APPJS),'and the form does not ask for them');
  // the fixture list no longer has a Details column to print them in, but they
  // are still read off the match rather than the channel, which is the point
  ok(/competition: m\.competition \|\| ''/.test(SUPA)&&/stage: m\.stage \|\| ''/.test(SUPA),
     'each match still carries its own');
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

test('the API offers exactly what a screen calls, and nothing spare', () => {
  const {api}=loadAPI(()=>({data:[],error:null}));
  const surface=Object.keys(api.channels).sort().join(',');
  eq(surface,'claim,create,invite,invites,members,remove,removeMember,revokeInvite,setPublic,setRole,update');
  // every one of them is reached from a screen
  Object.keys(api.channels).forEach(fn=>{
    ok(new RegExp('channels\\.'+fn+'\\(').test(APPJS),'channels.'+fn+' is called by the app');
  });
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

test('and it is the CALLER-s role, not whichever member came back last', () => {
  // club_members_read lets anyone in a channel read every membership row of it,
  // so an unfiltered read answers with other people's roles as well and the last
  // one wins — with no ORDER BY, an arbitrary one. An admin shown as a viewer
  // loses the invite form and the public switch, both gated on this value.
  const read=one(res.clubCalls,'club_members','select');
  ok(read,'the membership read happened');
  const f=read.filters.filter(x=>x[1]==='user_id')[0];
  ok(f,'it is scoped to a user_id');
  eq(f[2],'u1','and that user is the signed-in caller');
  eq(res.clubs.filter(c=>c.slug==='saint-lucia')[0].role,'admin',
     'the viewer row returned after it did not overwrite the answer');
});

test('a signed-out visitor gets channels with no role, and no membership read', () => {
  // a public channel (0017) is readable without a session; there is no
  // membership to look up and asking would only return nothing
  eq(res.anonClubs.length,1,'the channel still comes back');
  eq(res.anonClubs[0].role,null,'with no role');
  notOk(one(res.anonCalls,'club_members'),'and club_members was never asked');
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

/* ================= the score and the date on a real fixture =================
   Nothing in the tagging app writes matches.home_score / away_score, and the
   date it does write is 0011's match_date while this file was reading only
   0013's kickoff. So every fixture a club had tagged read "Date not set" and
   "– : –", and with no score there was no W/D/L — which took Data's record,
   its goals for and against and its Recent results down with it. */
test('a fixture with no scoreline on the row still shows the goals that were tagged', () => {
  notOk(res.taggedErr,'the call resolved');
  const m=res.tagged.filter(x=>x.id==='44685')[0];
  ok(m,'the match came back');
  eq(m.home.score,1,'home goals off match_stats');
  eq(m.away.score,3,'away goals off match_stats');
  eq(m.result,'W','and the club is the away side, so 3–1 is a win');
});

test('a scoreline someone typed in is not overruled by the rollup', () => {
  // the columns are there to be corrected in; a derived figure winning would
  // make the correction pointless
  const m=res.corrected[0];
  eq(m.home.score,2,'the row said 2, not the 1 the events add up to');
  eq(m.away.score,3);
  eq(m.result,'W');
});

test('a side that was never tagged is 0, and a match nobody tagged has no score', () => {
  const m3=res.tagged.filter(x=>x.id==='44686')[0];
  eq(m3.home.score,0,'the side with a row');
  eq(m3.away.score,0,'and the side without one — the match WAS tagged, just not for them');
  eq(m3.result,'D');
  const m4=res.untagged[0];
  eq(m4.home.score,null,'no stats at all is not 0–0');
  eq(m4.result,null,'and a match with no score has no result');
});

test('the date the tagging app writes is the date the channel shows', () => {
  ok(/match_date/.test(one(res.taggedCalls,'matches','select').cols),'match_date is asked for');
  const m=res.tagged.filter(x=>x.id==='44685')[0];
  eq(m.date,'2026-08-09','it falls back to match_date where kickoff is empty');
  eq(m.dateLabel,'Sunday, 9 August 2026','and the row says so rather than "Date not set"');
  const m3=res.tagged.filter(x=>x.id==='44686')[0];
  eq(m3.dateLabel,'Date not set','a match with neither still says so');
});

test('and the list is ordered by it, with the undated ones last', () => {
  // Postgres ordered on kickoff alone, which left everything tagged here in
  // whatever order it came back in — m3 arrived first and stayed first
  eq(res.tagged.map(m=>m.id).join(','),'44685,44686');
});

/* ================= the columns actually exist =================
   Postgres fails the WHOLE select when one column in it is not there, so a
   single wrong name returns no rows at all rather than a row with a gap —
   which is exactly how `match_code` (the trigger function's name; the column
   is `code`) left every live channel showing "nothing published yet" while
   the seed channel carried on looking fine. */
const MIG=path.join(ROOT,'supabase','migrations');
const sqlFiles=fs.readdirSync(MIG).filter(f=>f.endsWith('.sql')).sort();
/* whole-line AND trailing comments: 0001 declares "x real, y real," with the
   comment on the same line, and a stray semicolon in one would end a
   statement halfway through */
const noComments=s=>s.replace(/--[^\n]*/g,'');

function columnsOf(table){
  const cols=new Set();
  sqlFiles.forEach(f=>{
    const sql=noComments(fs.readFileSync(path.join(MIG,f),'utf8'));
    const ct=new RegExp('create table if not exists public\\.'+table+'\\s*\\(([\\s\\S]*?)\\n\\);').exec(sql);
    if(ct) ct[1].split('\n').forEach(line=>{
      const m=/^\s*([a-z_]+)\s+[a-z]/i.exec(line);
      if(m&&!/^(primary|unique|foreign|check|constraint)$/i.test(m[1])) cols.add(m[1]);
    });
    const alt=new RegExp('alter table public\\.'+table+'\\b([\\s\\S]*?);','g');
    for(let a;(a=alt.exec(sql));){
      const add=/add column if not exists\s+([a-z_]+)/g;
      for(let c;(c=add.exec(a[1]));) cols.add(c[1]);
    }
  });
  return cols;
}

function matchStatsColumns(){
  const sql=noComments(fs.readFileSync(path.join(MIG,'0013_client_channels.sql'),'utf8'));
  const view=/create or replace view public\.match_stats as([\s\S]*?);/.exec(sql)[1];
  const cols=new Set(['match_id','team']);
  const re=/count\(\*\)[^\n]*?\bas\s+([a-z_]+)/g;
  for(let m;(m=re.exec(view));) cols.add(m[1]);
  return cols;
}

test('every column the client asks matches for is one the schema has', () => {
  const have=columnsOf('matches');
  ok(have.has('code'),'sanity: 0002 adds public.matches.code');
  notOk(have.has('match_code'),'sanity: and never a match_code');
  const asked=/from\('matches'\)[\s\S]*?\.select\('([^']+)'\)/.exec(SUPA)[1].split(',');
  asked.forEach(c=>ok(have.has(c.trim()),'matches has no column '+c.trim()));
});

test('and every field it reads off match_stats is one the view produces', () => {
  const have=matchStatsColumns();
  ok(have.has('passes_done'),'sanity: the view rolls up completed passes');
  const body=/function statsFromView\([\s\S]*?\n  \}/.exec(SUPA)[0];
  const re=/\br\.([a-z_]+)/g;
  const asked=new Set();
  for(let m;(m=re.exec(body));) asked.add(m[1]);
  ok(asked.size>10,'sanity: it reads a good many of them — got '+asked.size);
  asked.forEach(c=>ok(have.has(c),'match_stats has no column '+c));
});

test('the code column is what the share link and the tagger both use', () => {
  // Stats/ and cloud-sync.js look a match up by the same 5-digit code, so the
  // slug the client builds has to be that code and not something of its own
  ok(/slug: String\(m\.code \|\| m\.id\)/.test(SUPA),'the slug is the share code');
  const tagger=page('cloud-sync.js')+page('Stats/stats-view.js');
  ok(/\/\^\\d\{5\}\$\/\.test\([a-z]+\) \? 'code' : 'id'/.test(tagger)||
     /\/\^\\d\{5\}\$\/\.test\([a-z]+\)\?'code':'id'/.test(tagger),
     'and the tagger side resolves that same code column');
});

/* ================= no sample channel ================= */
test('there is no seed channel left to fall back on', () => {
  notOk(/HNA_SEED|seedChannel|\.seed\b/.test(APPJS),'app.js holds no seed');
  notOk(fs.existsSync(path.join(ROOT,'client/assets/data.js')),'and the file that carried it is gone');
  notOk(/data\.js/.test(APPHTML),'app.html does not load it');
  notOk(/cp client\/assets\/data\.js/.test(YML),'nor does the deploy copy it');
});

test('an app with no channel says which of the two reasons it is', () => {
  // signed out is not the same problem as signed in without a membership,
  // and neither is the same as an empty channel
  const fn=/function noChannel\(\)[\s\S]*?\n  \}/.exec(APPJS)[0];
  ok(/if \(!state\.user\)/.test(fn),'it checks which');
  ok(/Not signed in/.test(fn)&&/login\.html/.test(fn),'signed out gets a way in');
  ok(/No channel yet/.test(fn)&&/invite this email address/.test(fn),'signed in gets told what to ask for');
  ['renderMatches','renderData','renderPlayers'].forEach(v=>{
    const body=new RegExp('function '+v+'\\(view\\) \\{\\n    if \\(!state\\.channel\\)').test(APPJS);
    ok(body,v+' checks for a channel before it reads one');
  });
});

test('nothing still promises a sample channel to a visitor', () => {
  ['client/index.html','client/login.html','client/app.html'].forEach(f=>
    notOk(/sample channel/i.test(page(f)),f+' still offers one'));
});

test('the strip of running totals is gone from the bar', () => {
  notOk(/chan-sum|chanSum/.test(APPHTML),'the element is not in the page');
  notOk(/renderSummary|chanSum/.test(APPJS),'nothing builds it');
  notOk(/\.chan-sum/.test(APPCSS),'and its styling went with it');
  // the same numbers are still a section of their own, so nothing was lost
  ok(/tstat\('Total'/.test(APPJS)&&/tstat\('Win'/.test(APPJS),'Data still counts them');
  // the difference the strip used to show is on the Goals against tile now —
  // the Team stats card gave its fourth slot to the discipline pair
  ok(/goal difference/.test(APPJS),'and the difference is still stated somewhere');
});

test('no monogram anywhere on the site — a club is its name', () => {
  const SITECSS=page('client/assets/site.css');
  notOk(/class="crest/.test(APPJS),'no badge is drawn beside a team or a channel');
  notOk(/chanCrest|crestPrev|ncCrest|crest-pick/.test(APPJS+APPHTML),
        'the bar, the form preview and the field it previewed are all gone');
  notOk(/\.crest[\s{,.:]/.test(APPCSS+SITECSS),'and their styling went with them');
  // the names the badge sat beside are untouched — they were always the real label
  ok(/esc\(m\.home\.name\)/.test(APPJS)&&/esc\(m\.away\.name\)/.test(APPJS),
     'a fixture still says who played whom');
  ok(/esc\(c\.name\)/.test(APPJS),'and the switcher still says which channel is open');
  /* supa.js is left alone on purpose: clubs.crest_text is a database column with
     rows already in it, and the seed writes one. Nothing READS it here any more. */
  ok(/crest_text/.test(SUPA),'the column is still written, so existing rows stay consistent');
});

/* The five tracks read as a mirror about the score. A fixed 92px result column
   against a 1.1fr date column was not one, and it put the scoreline 143px right
   of the middle of the row: the void after the date came out half as wide again
   as the void before the result, which is the lopsidedness you could see. */
test('the Matches row is a mirror about the score, so the scoreline is centred', () => {
  const css=APPCSS.replace(/\s*\n\s*/g,'');
  const cols=/--m-cols:([^;}]+)/.exec(css);
  ok(cols,'the five tracks are named once, for the heading and the rows alike');
  // minmax(a,b) has a comma in it, so the tracks are split on the top level only
  const tracks=cols[1].trim().split(/\s+(?![^(]*\))/);
  eq(tracks.length,5,'date, home, score, away, result');
  eq(tracks[0],tracks[4],'date and result are the same track');
  eq(tracks[1],tracks[3],'home and away are the same track');
  ok(/^\d+px$/.test(tracks[2]),'and the score is a fixed width in the middle of them');
  // both the heading and the rows have to read from it, or they drift apart
  ok(/\.mlist-h,\.mrow\{--m-cols:/.test(css),'the heading and the row take the same tracks');
  ok((css.match(/grid-template-columns:var\(--m-cols\)/g)||[]).length===2,
     'and neither states its own');

  // left-aligning both put the home name a column's width from the score and
  // the away name hard against it — 253px of gap on one side, 30 on the other
  ok(/\.m-home\{[^}]*justify-content:flex-end/.test(css)&&/\.m-home\{[^}]*text-align:right/.test(css),
     'home reads right, into the score');
  ok(/\.m-away\{[^}]*justify-content:flex-start/.test(css)&&/\.m-away\{[^}]*text-align:left/.test(css),
     'away reads left, out of it');
  // the narrow layout stacks the fixture on its own line; it must not flip away
  // back to the right, which would point both names the same way
  const narrow=/@media \(max-width:820px\)\{[\s\S]*?\n\}/.exec(APPCSS)[0].replace(/\s*\n\s*/g,'');
  ok(/\.m-away\{grid-area:away\}/.test(narrow),'and stays that way when the row folds');
  // each heading over the edge its column reads from
  const head=/list\.appendChild\(el\('div', 'mlist-h',[\s\S]*?\)\);/.exec(APPJS)[0];
  ok(/style="text-align:right">Home/.test(head),'the Home heading ends where the home name ends');
  ok(/<span>Away<\/span>/.test(head),'and Away starts where the away name starts');
});

/* ================= the match page ================= */
test('a match is one page — the analysis, and the way back', () => {
  notOk(/matchHead/.test(APPJS),'no fixture heading repeating the row you came from');
  notOk(/matchTabs|renderMatch\b/.test(APPJS),'no Overview to cross to, so no tabs either');
  notOk(/fillBars/.test(APPJS),'and the bars that only Overview drew are gone with it');
  const stats=/function renderMatchStats\(view, slug\)[\s\S]*?\n  \}/.exec(APPJS)[0];
  ok(/All matches/.test(stats),'the way back is still there');
  ok(/PTStats\.mount/.test(stats),'and the analysis is what the page is');
});

test('every route into a match lands on that one page', () => {
  const r=/function route\(\)[\s\S]*?\n  \}/.exec(APPJS)[0];
  ok(/parts\[0\] === 'match' && parts\[1\]/.test(r)&&/return renderMatchStats\(view, slug\)/.test(r),
     'one destination, whatever the URL says');
  ok(/\/stats is kept as a suffix/.test(r),'and a link made while there were two tabs still works');
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

/* ---- the rail's width ---- */
test('the rail pulls in to a strip of marks and back out again', () => {
  const css=APPCSS.replace(/\s*\n\s*/g,'');
  // one number drives the track, so the two states cannot disagree about it
  const out=/body\.app\{--rail:(\d+)px\}/.exec(css), inn=/body\.app\.rail-in\{--rail:(\d+)px\}/.exec(css);
  ok(out&&inn,'both widths are stated as --rail');
  ok(+inn[1]<+out[1],'pulled in is the narrower of the two');
  ok(/\.app-body\{[^}]*grid-template-columns:var\(--rail\)/.test(css),
     'and the grid track is that number, not a second copy of it');
  ok(/\.app-body\{[^}]*transition:grid-template-columns/.test(css),'the width slides rather than jumps');

  // the handle
  ok(/id="railToggle"/.test(APPHTML),'there is a handle on the rail');
  ok(/aria-controls="side"/.test(APPHTML)&&/id="side"/.test(APPHTML),'it says what it opens');
  ok(/setRail\(!document\.body\.classList\.contains\('rail-in'\)\)/.test(APPJS),'clicking it flips the state');
  ok(/aria-expanded'?,\s*pulledIn \? 'false' : 'true'/.test(APPJS),'and the button says which way it is');

  // pulled in, a name is only its mark — so every entry has to carry one
  ['data-view="home"','data-view="channel"','data-view="data"','class="side-out"'].forEach(sel=>{
    const a=new RegExp('<a[^>]*'+sel.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'[^>]*>([\\s\\S]*?)</a>').exec(APPHTML);
    ok(a,sel+' is on the rail');
    ok(a&&/<i>[\s\S]*<svg/.test(a[1]),sel+' carries a mark of its own');
    ok(a&&/<span>[^<]+<\/span>/.test(a[1]),sel+' keeps its name in a span, so it can be taken away');
  });
  ok(/body\.rail-in \.side a span\{display:none\}/.test(css),'pulled in, the names go');
  ok(/if \(named\) s\.parentNode\.title/.test(APPJS),'and the name moves into the tooltip');
});

test('the pulled-in rail is a desktop state only, and it outlives the page', () => {
  const css=APPCSS.replace(/\s*\n\s*/g,'');
  /* Under 861px the rail is already a row across the top with no width to give
     back. A state left over from a desktop visit must not reach it and strip
     the names off it, so every rail-in rule sits behind the same query. */
  const wide=/@media \(min-width:861px\)\{[\s\S]*?\n\}/.exec(APPCSS);
  ok(wide,'there is a min-width:861px block');
  ok(wide&&/body\.rail-in \.side a span\{display:none\}/.test(wide[0]),'the names are taken away inside it');
  ok(wide&&!/body\.rail-in \.side/.test(APPCSS.replace(wide[0],'')),
     'and no rail-in rule for the rail is left outside it');
  ok(/railWide *= *window\.matchMedia\('\(min-width:861px\)'\)/.test(APPJS),
     'the script reads the same breakpoint, so the tooltips follow the names');
  // the handle disappears with the rail it belongs to
  ok(/@media \(max-width:860px\)\{[\s\S]*?\.side-grp\{display:none\}/.test(APPCSS),
     'the MENU line, and the handle on it, are gone on a phone');
  ok(APPCSS.indexOf('.side-grp{\n  display:flex')<APPCSS.indexOf('.side-grp{display:none}'),
     'and stated before that, or display:flex would win it back');

  ok(/localStorage\.setItem\(RAIL_KEY/.test(APPJS)&&/localStorage\.getItem\(RAIL_KEY/.test(APPJS),
     'which way the rail is set outlives the page');
  ok(/try \{ localStorage/.test(APPJS),'and storage being refused is not fatal');
  /* restored as the script runs, not on DOMContentLoaded: waiting would paint
     the wide rail first and snap it in */
  const wiring=APPJS.indexOf("document.addEventListener('DOMContentLoaded'");
  ok(APPJS.indexOf('\n  restoreRail();')<wiring&&APPJS.indexOf('\n  restoreRail();')>0,
     'and restored before the wiring, so the page never paints the other one');
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

test('the two pages that share an asset ask for the same copy of it', () => {
  // an unbumped ?v= leaves a returning browser on the old file; a HALF-bumped one
  // is worse, because the two pages then disagree about which file they are on
  const login=page('client/login.html');
  const ver=(src,name)=>(new RegExp(name.replace('.','\\.')+'\\?v=(\\d+)').exec(src)||[])[1];
  ['supa.js','app.css'].forEach(a=>{
    const inApp=ver(APPHTML,a), inLogin=ver(login,a);
    ok(inApp,'app.html versions '+a);
    eq(inLogin,inApp,'login.html loads '+a+' too, so it must be bumped in step');
  });
  ok(+ver(APPHTML,'app.js')>=3,'app.js has been bumped for the channel and shooting work');
});


/* ================= the view that was counting nothing ================= */
test('0015 stops match_stats looking for a hash that is never stored', () => {
  const view=viewBody(SQL15);
  notOk(/'#/.test(view),"no pattern still starts with a '#' — event_name never carries one");
  ok(/lower\(trim\(event_name\)\)/.test(view),'and the name is folded before it is matched');
});

test('every name it matches on is a name the shipped dictionary actually has', () => {
  const view=viewBody(SQL15);
  const known=new Set((DICT.football||[]).map(e=>String(e.name||e).trim().toLowerCase()));
  /* The one name the dictionary does not ship, and the story behind it.

     The view matches BOTH spellings of the take-on, which is what makes its list of
     names longer than the dictionary rather than shorter. For a while this file
     believed the direction had flipped — that the dictionary now shipped the
     corrected 'take-on success' and the view was keeping the misspelling for
     history. It had not. That correction only ever existed in
     pitchtagger_events.json; it was never pushed anywhere, because
     applyEventTypes() overwrites the local list with the cloud's on every load, so
     every match went on being tagged 'take-on succes'. The dictionary was synced to
     the live project on 2026-08-28 and says the misspelling again.

     So the CORRECTED spelling is the one nothing is called — kept in the view on
     purpose, so that fixing the typo one day does not silently zero the column. */
  const allowed=new Set(['take-on success']);
  const used=new Set();
  const re=/'([a-z0-9 \-]+)'/g;
  for(let m;(m=re.exec(view));) used.add(m[1]);
  ok(used.size>15,'sanity: it matches on a good many names — got '+used.size);
  used.forEach(n=>ok(known.has(n)||allowed.has(n),'match_stats counts "'+n+'", which no event is called'));
});

test('the columns of the view are unchanged, which is what lets it be REPLACEd', () => {
  const old=viewBody(page('supabase/migrations/0013_client_channels.sql'));
  const names=v=>{const out=[];const re=/\bas\s+([a-z_]+)\s*(?:,|\n)/g;
    for(let m;(m=re.exec(v));) out.push(m[1]); return out;};
  const before=names(old), after=names(viewBody(SQL15));
  eq(after.join(','),before.join(','),
     'CREATE OR REPLACE VIEW refuses a changed column list — this would have to be a DROP');
});

test('the dictionary names the client depends on are still spelt that way', () => {
  // if one of these is renamed in pitchtagger_events.json the view goes quietly
  // to zero for that column, so the spelling is pinned here on purpose
  const known=new Set((DICT.football||[]).map(e=>String(e.name||e).trim().toLowerCase()));
  ['goal','shot on target','shot off target','blocked shot','pass success','pass fail',
   'cross success','cross fail','tackle success','tackle fail','interception','clearance',
   'aerial duel success','aerial duel fail','step in','offside','foul']
    .forEach(n=>ok(known.has(n),'the dictionary no longer ships "'+n+'"'));
});
