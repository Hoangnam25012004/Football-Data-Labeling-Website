/* Which team is the client, and the two controls that let an admin say so.

   0018 gives a team a 5-digit code and lets a channel name one. With both
   set, a published match answers "which side is ours" by itself instead of
   trusting matches.our_side, which is set on the tagging side, defaults to
   'home', and has never been checked against the channel a match went to.

   The resolution itself is executed — supa.js runs in a sandbox against a
   stand-in Supabase client, the same way the channel tests do it. The
   migration and the screens are read. */
const fs=require('fs'), path=require('path'), vm=require('vm');
const {test,eq,ok,notOk}=require('./tiny-test');

const ROOT=path.join(__dirname,'..');
const page=p=>fs.readFileSync(path.join(ROOT,p),'utf8');

const SUPA=page('client/assets/supa.js');
const APPJS=page('client/assets/app.js');
const APPCSS=page('client/assets/app.css');
const SQL=page('supabase/migrations/0018_club_team_code.sql');
const SQL02=page('supabase/migrations/0002_match_code.sql');
const bare=s=>s.replace(/--[^\n]*/g,'');

/* ---------- a Supabase client that answers from a handler ---------- */
function fakeDB(handler,session){
  const calls=[];
  function chain(state){
    const api={
      select(c){state.cols=c;return api;},
      order(c,o){state.order=[c,o||null];return api;},
      eq(k,v){state.filters.push(['eq',k,v]);return api;},
      in(k,v){state.filters.push(['in',k,v]);return api;},
      limit(n){state.limit=n;return api;},
      single(){state.single=true;return api;},
      then(onOk,onErr){
        calls.push(state);
        let out;
        try{out=handler(state);}
        catch(e){return Promise.reject(e).then(onOk,onErr);}
        return Promise.resolve(out===undefined?{data:[],error:null}:out).then(onOk,onErr);
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
    auth:{getSession:()=>Promise.resolve({data:{session:session===undefined
      ?{user:{id:'u1',email:'me@club.com'}}:session}})}
  };
  return {client,calls};
}
function loadAPI(handler,session){
  const db=fakeDB(handler||(()=>({data:[],error:null})),session);
  const win={supabase:{createClient:()=>db.client}};
  const ctx={console,window:win,URLSearchParams,Promise,URL};
  vm.createContext(ctx);
  vm.runInContext(SUPA,ctx,{filename:'client/assets/supa.js'});
  return {api:win.HNA,calls:db.calls};
}

/* one fixture per case: who was home, who was away, and what our_side says */
function withMatches(rows,teams,session){
  return loadAPI(s=>{
    if(s.table==='matches')return {data:rows,error:null};
    if(s.table==='teams')  return {data:teams,error:null};
    return {data:[],error:null};
  },session);
}
const MATCH=(o)=>Object.assign({
  id:'m1',code:'10001',home_name:'Stafford Town FC U18',away_name:'Hanley Town FC',
  home_score:1,away_score:2,kickoff:'2026-03-01',competition:'',stage:'',venue:null,
  published:true,lineups:null,config:null,
  home_team_id:'t-stafford',away_team_id:'t-hanley'
},o);
const TEAMS=[{id:'t-stafford',code:'11111'},{id:'t-hanley',code:'24680'}];

/* ================= scenarios, kicked off at load ================= */
const res={};

/* the case from the question: our_side says 'home' (its default) and is wrong */
(function(){
  const {api,calls}=withMatches([MATCH({our_side:'home'})],TEAMS);
  res.fixCalls=calls;
  api.matches('c1','24680').then(r=>{res.fixed=r[0];});
})();
/* the same channel, the same wrong our_side, but no code stated */
(function(){
  const {api,calls}=withMatches([MATCH({our_side:'home'})],TEAMS);
  res.noCodeCalls=calls;
  api.matches('c1',null).then(r=>{res.noCode=r[0];});
})();
/* a code that matches neither side leaves the stored answer alone */
(function(){
  const {api}=withMatches([MATCH({our_side:'away'})],TEAMS);
  api.matches('c1','99999').then(r=>{res.neither=r[0];});
})();
/* a match with no team ids at all — most of the ones already published */
(function(){
  const {api}=withMatches([MATCH({our_side:'away',home_team_id:null,away_team_id:null})],TEAMS);
  api.matches('c1','24680').then(r=>{res.noTeams=r[0];});
})();
/* public.teams is `to authenticated`, so a signed-out visitor reads nothing there */
(function(){
  const {api}=loadAPI(s=>{
    if(s.table==='matches')return {data:[MATCH({our_side:'away'})],error:null};
    if(s.table==='teams')  return {data:null,error:{code:'42501',message:'permission denied'}};
    return {data:[],error:null};
  },null);
  api.matches('c1','24680').then(r=>{res.anon=r[0];});
})();

/* looking a code up before it is saved */
(function(){
  const {api,calls}=loadAPI(s=>s.table==='teams'
    ?{data:[{id:'t1',name:'Hanley Town FC',short_name:'HAN',code:'24680'}],error:null}
    :{data:[],error:null});
  res.lookupCalls=calls;
  api.teamByCode('24680').then(t=>{res.lookup=t;});
  api.teamByCode('nope').then(t=>{res.lookupBad=t;});
})();
(function(){
  const {api}=loadAPI(()=>({data:[],error:null}));
  api.teamByCode('11111').then(t=>{res.lookupNone=t;});
})();

/* creating / editing with a code */
(function(){
  const {api,calls}=loadAPI(s=>({data:Object.assign({id:'c9'},s.payload),error:null}));
  res.createCalls=calls;
  api.channels.create({name:'Hanley Town FC',code:'24680'}).then(()=>{},e=>{res.createErr=e;});
})();
(function(){
  const {api}=loadAPI(()=>({data:[],error:null}));
  api.channels.create({name:'Hanley Town FC',code:'246'}).then(()=>{},e=>{res.shortCode=e;});
})();
(function(){
  const {api,calls}=loadAPI(s=>({data:Object.assign({id:'c1',slug:'hanley'},s.payload),error:null}));
  res.updCalls=calls;
  api.channels.update('c1',{name:'Hanley Town FC',country:'England',code:'24680'})
    .then(c=>{res.updated=c;},e=>{res.updErr=e;});
})();
(function(){
  const {api,calls}=loadAPI(()=>({data:null,error:null}));
  res.delCalls=calls;
  api.channels.remove('c1').then(()=>{res.deleted=true;},e=>{res.delErr=e;});
})();
/* a code that names no team is the database's answer, not the form's */
(function(){
  const {api}=loadAPI(()=>({data:null,error:{code:'23503',
    message:'insert or update on table "clubs" violates foreign key constraint "clubs_team_code_fk"'}}));
  api.channels.update('c1',{name:'X',code:'55555'}).then(()=>{},e=>{res.fkErr=e;});
})();

/* ================= the migration ================= */
test('0018 gives a team the same kind of code a match has had since 0002', () => {
  ok(/alter table public\.teams add column if not exists code text unique/.test(bare(SQL)),
     'the column, unique');
  const gen=/create or replace function public\.gen_team_code\(\)[\s\S]*?\$\$;/.exec(bare(SQL))[0];
  ok(/floor\(random\(\) \* 90000\) \+ 10000/.test(gen),'always five digits');
  ok(/if new\.code is not null then return new; end if;/.test(gen),'a code handed in is kept');
  ok(/exit when not exists \(select 1 from public\.teams where code = c\)/.test(gen),'and unique');
  // the same shape as the match code, so one reads like the other
  ok(/floor\(random\(\) \* 90000\) \+ 10000/.test(bare(SQL02)),'0002 does it the same way');
  ok(/create trigger teams_code before insert on public\.teams/.test(bare(SQL)),'on insert');
  ok(/update public\.teams set code = c where id = r\.id/.test(bare(SQL)),
     'and every team that existed before gets one');
});

test('clubs.code names a team, and the database is what says so', () => {
  ok(/alter table public\.clubs add column if not exists code text/.test(bare(SQL)),'the column');
  notOk(/create trigger clubs_code|gen_club_code/.test(SQL),
        'not generated — only a person knows which team a channel is');
  ok(/foreign key \(code\)\s*references public\.teams \(code\)/.test(bare(SQL).replace(/\s+/g,' ')),
     'a foreign key, so a code that names no team cannot be saved at all');
  ok(/on update cascade on delete set null/.test(bare(SQL)),
     'a re-issued code follows; a deleted team does not take the channel with it');
});

test('0018 changes nothing that already worked', () => {
  notOk(/\bdrop table\b|\btruncate\b|\bdelete from\b/i.test(bare(SQL)),'it drops nothing');
  notOk(/alter table public\.matches|update public\.matches/.test(bare(SQL)),
        'and never touches matches — our_side is left exactly where it is');
  ok(/our_side/.test(SQL),'the file says so out loud');
});

/* ================= resolving the side ================= */
test('a channel that names its team fixes a wrong our_side', () => {
  // Stafford Town FC U18 vs Hanley Town FC, published to the Hanley channel,
  // with our_side left at its default of 'home'
  eq(res.fixed.side,'away','Hanley are the away side, and the match says so');
  eq(res.fixed.opponent,'Stafford Town FC U18');
  eq(res.fixed.result,'W','2-1 to the away side is a win, not a loss');
});

test('with no code stated, our_side is still the answer', () => {
  eq(res.noCode.side,'home','nothing changes for a channel that has not said which team it is');
  eq(res.noCode.result,'L');
  notOk(res.noCodeCalls.some(c=>c.table==='teams'),'and public.teams is not even read');
});

test('only an unambiguous match wins', () => {
  eq(res.neither.side,'away','a code matching neither side leaves our_side alone');
  eq(res.noTeams.side,'away','so does a match with no team ids on it');
});

test('a signed-out visitor on a public channel falls back rather than breaking', () => {
  // public.teams is `to authenticated`; nothing in 0018 opens it to anon
  eq(res.anon.side,'away','our_side answers, as it always did');
  ok(/to authenticated/.test(SQL)&&/anonymous visitor/.test(SQL),'and the migration says why');
});

test('the club code reaches matches() from the channel the app is showing', () => {
  const load=/function loadMatches\(ch\)[\s\S]*?\n  \}/.exec(APPJS)[0];
  ok(/window\.HNA\.matches\(ch\.id, ch\.code\)/.test(load),'both are passed');
  ok(/code: x\.code \|\| null/.test(SUPA),'and a channel carries one');
});

/* ================= looking one up ================= */
test('a typed code says which team it is before anything is saved', () => {
  eq(res.lookup.name,'Hanley Town FC');
  eq(res.lookup.code,'24680');
  eq(res.lookupNone,null,'a code no team has comes back as nothing, not as an error');
  eq(res.lookupBad,null,'and something that is not five digits is not even asked about');
  eq(res.lookupCalls.filter(c=>c.table==='teams').length,1,'so only the real one was a request');
});

test('the form says which team the code matched, in three states', () => {
  const f=/function channelForm\(view, opts\)[\s\S]*?\n  \}/.exec(APPJS)[0];
  ok(/Matches ' \+ t\.name/.test(f),'a code that resolves names the team');
  ok(/No team on the labeling site has that code/.test(f),'one that does not says so');
  ok(/A team code is 5 digits/.test(f),'and a half-typed one is not called wrong');
  ok(/seq !== lookupSeq/.test(f),'a slower lookup cannot overwrite a later keystroke');
});

/* ================= saving ================= */
test('create and update both send the code, and neither invents one', () => {
  eq(res.createCalls[0].payload.code,'24680','create sends it');
  eq(res.updCalls[0].payload.code,'24680','update sends it');
  eq(res.updCalls[0].op,'update');
  eq(JSON.stringify(res.updCalls[0].filters),JSON.stringify([['eq','id','c1']]),'to that channel only');
});

test('a code that is not five digits is refused here, before the round trip', () => {
  ok(/5 digits/.test(res.shortCode.message),'and says what one looks like');
  ok(/Leave it blank/.test(res.shortCode.message),'and that it is optional');
});

test('a code naming no team comes back as a sentence, not a constraint name', () => {
  ok(/No team on the labeling site has that code/.test(res.fkErr.message));
  notOk(/23503|foreign key/.test(res.fkErr.message),'the Postgres wording does not reach the screen');
});

test('renaming a channel never moves it', () => {
  const upd=/update: function \(clubId, fields\)[\s\S]*?\n      \},/.exec(SUPA)[0];
  notOk(/slug/.test(upd),'the slug is not among the fields');
  ok(/slugify/.test(SUPA),'it is still what create uses');
  const edit=/function renderChannelEdit\(view, slug\)[\s\S]*?\n  \}/.exec(APPJS)[0];
  ok(/does not change with its name/.test(edit),'and the screen says so');
});

/* ================= the settings menu ================= */
test('Settings is on the channel, and only for an admin', () => {
  const one=/function renderChannelOne\(view, slug\)[\s\S]*?\n    var membersCard/.exec(APPJS)[0];
  ok(/if \(isAdmin\) \{[\s\S]{0,160}settingsMenu\(ch\)/.test(one),'the menu is behind the admin check');
  const menu=/function settingsMenu\(ch\)[\s\S]*?\n  \}/.exec(APPJS)[0];
  ok(/'menu-opt', 'Edit/.test(menu)&&/'menu-opt danger', 'Delete/.test(menu),'two options');
  ok(/aria-haspopup/.test(menu)&&/aria-expanded/.test(menu),'and it says what it is');
  ok(/\/edit'/.test(menu),'Edit is a route, so it can be linked and gone back from');
});

test('the menu takes its click listener off the document with it', () => {
  const menu=/function settingsMenu\(ch\)[\s\S]*?\n  \}/.exec(APPJS)[0];
  ok(/if \(!wrap\.isConnected\) document\.removeEventListener\('click', away\)/.test(menu),
     'the Channel view is redrawn often; a listener left behind keeps a dead node alive');
});

test('deleting asks for the name, and says what survives', () => {
  const del=/function deleteChannel\(ch\)[\s\S]*?\n  \}/.exec(APPJS)[0];
  ok(/prompt\(/.test(del),'a click alone is not enough');
  ok(/typed\.trim\(\) !== ch\.name/.test(del),'the name has to match');
  ok(/if \(typed == null\) return;/.test(del),'and Cancel is not an empty answer');
  ok(/loses access immediately/.test(del),'it says who loses what');
  ok(/stay in the database/.test(del),'and what does not go');
  // set null, not cascade — the matches outlive the channel
  ok(/on delete set null/.test(page('supabase/migrations/0013_client_channels.sql')),
     'matches.club_id is ON DELETE SET NULL, which is why that is true');
});

test('after a delete the app lands somewhere that exists', () => {
  const del=/function deleteChannel\(ch\)[\s\S]*?\n  \}/.exec(APPJS)[0];
  ok(/state\.channel = state\.channels\[0\] \|\| null/.test(del),'whatever is left, or nothing');
  ok(/renderShell\(\)/.test(del),'the top bar is redrawn');
  ok(/route\(\);/.test(del),'and the view, since the hash may not have changed');
});

/* ================= one form, two screens ================= */
test('creating and editing a channel are the same form', () => {
  ok(/function channelForm\(view, opts\)/.test(APPJS),'there is one builder');
  ['renderChannelNew','renderChannelEdit'].forEach(fn=>{
    const body=new RegExp('function '+fn+'\\([\\s\\S]*?\\n  \\}').exec(APPJS)[0];
    ok(/channelForm\(view, \{/.test(body),fn+' uses it');
  });
  // and nothing builds a second copy of the fields
  eq((APPJS.match(/id="ncName"/g)||[]).length,1,'the markup exists once');
  const f=/function channelForm\(view, opts\)[\s\S]*?\n  \}/.exec(APPJS)[0];
  ['ncName','ncSport','ncCountry','ncCode'].forEach(i=>ok(f.includes(i),f+' has '+i));
  notOk(/ncCrest|crestPrev/.test(f),'and no monogram field — nothing on the site shows one');
});

test('the code field is styled, and its answer is readable either way', () => {
  const css=APPCSS.replace(/\s*\n\s*/g,'');
  ok(/\.field-note\.ok\{color:var\(--green\)\}/.test(css),'a match reads as one');
  ok(/\.field-note\.err\{color:var\(--red\)\}/.test(css),'and a miss as one');
  ok(/\.menu-wrap\{position:relative/.test(css)&&/\.menu-wrap\.open \.menu\{display:block\}/.test(css),
     'the menu opens under its button');
  ok(/\.menu-opt\.danger:hover\{[^}]*var\(--red\)/.test(css),'and Delete looks like what it is');
});
