/* The five matches this account opened last, listed under the Match ID box in ⚽ Match.

   Kept per user id rather than per browser: two people sharing a machine never see each
   other's matches, and signing out does not wipe the list — signing back in finds it
   again. It is a shortcut, not a record. What is stored is only enough to draw the card
   and re-open the match; clicking one goes down the ordinary openMatch path, which loads
   everything fresh from the database.

   It is browser-local, so it does not follow the account to another machine. Doing that
   would mean a visits table in the database, which is a migration the project owner has
   to run. */
const fs=require('fs'), path=require('path'), vm=require('vm');
const {test,eq,ok,notOk,deepEq}=require('./tiny-test');
const {grabFunction,grabConst,SRC,CLOUD}=require('./harness');

/* the store, lifted out of index.html and run against a stubbed localStorage + account */
function makeStore(userId,seed){
  const map=new Map(Object.entries(seed||{}));
  const ctx={console,JSON,Date,Array,Object,String,
    localStorage:{getItem:k=>map.has(k)?map.get(k):null,
                  setItem(k,v){map.set(k,String(v));},removeItem(k){map.delete(k);}},
    window:{PTAuth:{user:()=>userId?{id:userId}:null}}};
  vm.createContext(ctx);
  vm.runInContext([grabConst('RECENT_KEY'),grabConst('recentUser'),
    grabFunction('recentAll'),grabFunction('recentMatches'),grabFunction('rememberMatch'),
    ';globalThis.API={recentMatches,rememberMatch,RECENT_MAX};'].join('\n'),ctx,{filename:'recent.js'});
  return Object.assign({raw:()=>map.get('pitchtagger.recent.v1')},ctx.API);
}
const row=(n,extra)=>Object.assign({id:'id-'+n,code:String(10000+n),
  home_name:'Home '+n,away_name:'Away '+n,match_date:'2026-06-0'+((n%9)+1)},extra||{});

/* ================= what it keeps ================= */
test('the five most recent, newest first', () => {
  const s=makeStore('u1');
  for(let n=1;n<=7;n++)s.rememberMatch(row(n));
  eq(s.recentMatches().length,5,'capped at five');
  deepEq(s.recentMatches().map(m=>m.code),['10007','10006','10005','10004','10003'],
    'newest first, and the two oldest have fallen off');
});

test('opening the same match again moves it up instead of repeating it', () => {
  const s=makeStore('u1');
  [1,2,3].forEach(n=>s.rememberMatch(row(n)));
  s.rememberMatch(row(1));
  deepEq(s.recentMatches().map(m=>m.code),['10001','10003','10002'],'one entry, now at the top');
  eq(s.recentMatches().length,3,'and nothing was duplicated');
});

test('a card carries what it needs to be drawn and re-opened', () => {
  const s=makeStore('u1');
  s.rememberMatch(row(1,{home_name:'Hanley Town',away_name:'Gornal Athletic',match_date:'2026-06-01'}));
  const m=s.recentMatches()[0];
  eq(m.home,'Hanley Town'); eq(m.away,'Gornal Athletic');
  eq(m.date,'2026-06-01'); eq(m.code,'10001'); eq(m.id,'id-1');
  ok(m.at>0,'and when it was opened, which is what the order is built on');
});

test('a match with no date or code still lands', () => {
  const s=makeStore('u1');
  s.rememberMatch({id:'bare-id',home_name:'A',away_name:'B'});
  const m=s.recentMatches()[0];
  eq(m.code,null,'no 5-digit code yet'); eq(m.date,null);
  eq(m.id,'bare-id','the id is what re-opens it');
});

/* ================= whose list it is ================= */
test('each account has its own, and cannot see another\'s', () => {
  const seed={};
  const mine=makeStore('user-A'); [1,2].forEach(n=>mine.rememberMatch(row(n)));
  const theirs=makeStore('user-B',{'pitchtagger.recent.v1':mine.raw()});
  eq(theirs.recentMatches().length,0,'a different account starts empty');
  theirs.rememberMatch(row(9));
  deepEq(theirs.recentMatches().map(m=>m.code),['10009'],'and keeps its own');
  // …without disturbing the first
  const back=makeStore('user-A',{'pitchtagger.recent.v1':theirs.raw()});
  deepEq(back.recentMatches().map(m=>m.code),['10002','10001'],'the first list is untouched');
});

test('signed out, nothing is kept and nothing is shown', () => {
  const s=makeStore(null);
  s.rememberMatch(row(1));
  eq(s.recentMatches().length,0,'no account, no list');
  eq(s.raw(),undefined,'and nothing written');
});

test('a corrupt store is treated as empty rather than thrown on', () => {
  eq(makeStore('u1',{'pitchtagger.recent.v1':'{not json'}).recentMatches().length,0);
  eq(makeStore('u1',{'pitchtagger.recent.v1':'"a string"'}).recentMatches().length,0);
  eq(makeStore('u1',{'pitchtagger.recent.v1':'{"u1":"not an array"}'}).recentMatches().length,0);
});

/* ================= how it reaches the screen ================= */
test('it is recorded at the one place every route into a match passes', () => {
  const open=/async function openMatchRow\(row\) \{[\s\S]*?\n    if \(row\.config\)/.exec(CLOUD)[0];
  ok(/PT\(\)\.rememberMatch\(row\)/.test(open),'openMatchRow records the visit');
  // a typed code, the preview card, a #match= link and a fresh match all funnel through it
  ok(/await openMatchRow\(data\)/.test(CLOUD),'…which openByInput calls');
  ok(/rememberMatch/.test(SRC)&&/renderRecentMatches/.test(SRC),'both halves live in index.html');
  ok(/renderMatchPreview, rememberMatch, renderRecentMatches\}/.test(SRC),'and are on the PT bridge');
});

test('the list sits under the Match ID box, inside ⚽ Match', () => {
  const hub=SRC.slice(SRC.indexOf('id="matchHub"'),SRC.indexOf('</div>\n</div>',SRC.indexOf('id="matchHub"')));
  ok(hub.includes('id="recentMatches"')&&hub.includes('id="recentList"'),'both elements are in that modal');
  ok(hub.indexOf('id="cloudMatchId"')<hub.indexOf('id="recentMatches"'),'below the search box');
  ok(/id="recentMatches" style="display:none"/.test(hub),'hidden until there is something in it');
});

test('opening ⚽ Match redraws it', () => {
  ok(/\$\('matchBtn'\)\.addEventListener\('click',renderRecentMatches\)/.test(SRC),
     'a listener, so cloud-sync keeps its own onclick on that button');
});

test('team names are escaped on the way into the card', () => {
  const fn=grabFunction('renderRecentMatches');
  ['m.home','m.away','code','disp'].forEach(v=>
    ok(fn.includes('escHtml('+v+')'),v+' goes through escHtml'));
  notOk(/\$\{m\.home\}|\$\{m\.away\}/.test(fn),'nothing interpolated raw');
  ok(/const escHtml=/.test(SRC),'and the helper is defined in this page — shared.js is not loaded here');
});

test('cloud-sync.js is re-fetched, not served from cache', () => {
  const v=/cloud-sync\.js\?v=(\d+)/.exec(SRC);
  ok(+v[1]>=45,'bumped past 44, which shipped without rememberMatch — got '+v[1]);
});
