/* Attacking direction is one fact about the fixture, not two facts about two teams.

   Two sides cannot both attack the same goal, so home and away always face opposite
   ways. "⇄ Switch Attacking Direction" used to turn only the side on screen: switch
   home from left→right and away stayed left→right too, both attacking the same end,
   and the formation boards, the read-only pitch on the tagging tab and the Stats
   page all went on drawing that impossible fixture.

   Turning a side round is a 180° rotation, the same move swapping ends at half-time
   makes. The switch used to flip x alone, which is a mirror: the zone map rotates
   with the direction, so every wide player came back off the switch on the other
   flank — the right-back re-labelled left-back, the left winger right winger.

   And a side keeps more than its starting XI on that board. Every substitution and
   every red card appends a formation snapshot to lineups.history, held in the very
   same coordinates and read back through the side's CURRENT dir. Turning the XI and
   leaving the snapshots behind stood the goalkeeper in the opponents' box from the
   first substitution on — on the tagging pitch, in Formation by time, on the Stats
   page and in the PDF report.

   So one press, three promises: the two sides stay opposites, every player keeps the
   role he was given, and everything that side has on the board turns together.

   Both editors are covered: the Player lists page and the (twin) copy in index.html. */
const path=require('path'), vm=require('vm');
const {test,eq,ok,deepEq}=require('./tiny-test');
const {grabFunction,loadShared,readSrc,SRC}=require('./harness');

const PL=readSrc(path.join('Player-Lists','index.html'));
const S=loadShared();

/* Centre of a DISPLAY cell — the arithmetic gridHTML lays the squares out with, and
   where arrangeXI parks a lone dot. A dot placed here is already tidy. */
const cell=(row,col)=>({x:(col+0.5)*100/6,y:S.PZ_ROW_TOP[row]+S.PZ_ROW_H[row]/2});
// 100-x lands a bit-or-two off the same square's centre computed forwards; arrangeXI
// already treats anything under 0.01 as "where it belongs", so the tests do too
const near=(a,b,msg)=>ok(Math.abs(a-b)<1e-9,msg+' ('+a+' vs '+b+')');
const dot=(no,rc,dir)=>{const c=cell(rc[0],rc[1]);
  return {no,x:c.x,y:c.y,pos:S.zoneAt(c.x,c.y,dir)};};
/* The same two roles on either board: the keeper, and a right-back out on the flank.
   Attacking left puts them bottom-right of the map, attacking right puts them top-left
   — which is the whole point, and what a mirror gets wrong. */
const GK=dir=>dir==='rl'?[1,5]:[1,0];
const RB=dir=>dir==='rl'?[0,4]:[2,1];
const side=dir=>({roster:[{no:'1',name:'Một'},{no:'9',name:'Chín'},{no:'12',name:'Mười hai'}],
  xi:[dot('1',GK(dir),dir),dot('9',RB(dir),dir)],subs:['12'],dir});

/* A squad, optionally with the formation snapshots a tagged substitution and a tagged
   red card leave behind — one belonging to each side. */
function squad(homeDir,awayDir,withHistory){
  const lu={home:side(homeDir),away:side(awayDir)};
  if(withHistory)lu.history=[
    {t:600,team:'home',subs:['9'],label:'Substitution: 9▼ 12▲',
     xi:[dot('1',GK(homeDir),homeDir),dot('12',RB(homeDir),homeDir)]},
    {t:900,team:'away',subs:[],off:'9',label:'Red card: 9',
     offSpot:cell(RB(awayDir)[0],RB(awayDir)[1]),
     xi:[dot('1',GK(awayDir),awayDir)]}
  ];
  return lu;
}
/* Every dot that side owns, starting XI and its own snapshots alike — the set that has
   to turn as one. Keyed so a role can be compared with itself across the switch. */
function dots(lu,team){
  const out={};
  (lu[team].xi||[]).forEach(x=>{out['xi/'+x.no]=x;});
  (lu.history||[]).filter(h=>h.team===team).forEach((h,i)=>
    (h.xi||[]).forEach(x=>{out['h'+i+'/'+x.no]=x;}));
  return out;
}
const roles=(lu,team)=>{const o={};
  Object.entries(dots(lu,team)).forEach(([k,x])=>{o[k]=x.pos;}); return o;};
const spots=(lu,team)=>{const o={};
  Object.entries(dots(lu,team)).forEach(([k,x])=>{o[k]={x:x.x,y:x.y};}); return o;};

/* Each editor keeps its squad somewhere else (`lineups` here, `state.lineups` there)
   and saves through a different function, so each is lifted with its own wiring. */
function editor(where,lineups,team){
  const log={saves:0,renders:0};
  const ctx={console,log,lineups,lineupTeam:team||'home',
    state:{lineups},
    teamLU(){return ctx.lineups[ctx.lineupTeam];},
    zoneAt:S.zoneAt,
    save(){log.saves++;}, saveLineups(){log.saves++;}, renderLineup(){log.renders++;}};
  vm.createContext(ctx);
  const src=where==='Player-Lists/index.html'?PL:SRC;
  vm.runInContext(['turnXI','faceTeam','luSwitchDir'].map(n=>grabFunction(n,src,where)).join('\n'),
    ctx,{filename:where+'-dir.js'});
  return {ctx,log};
}
const EDITORS=['Player-Lists/index.html','index.html'];

EDITORS.forEach(where=>{
  /* ---- the two sides are opposites ---- */
  test(where+': switching one side turns the other with it', ()=>{
    const {ctx}=editor(where,squad('lr','rl'));
    ctx.luSwitchDir();
    eq(ctx.lineups.home.dir,'rl','the side on screen turned');
    eq(ctx.lineups.away.dir,'lr','and the other side turned the other way');
  });

  test(where+': the two sides never end up attacking the same end', ()=>{
    const {ctx}=editor(where,squad('lr','rl',true));
    for(let i=0;i<5;i++){
      ctx.lineupTeam=i%2?'away':'home';          // switched from either side of the board
      ctx.luSwitchDir();
      ok(ctx.lineups.home.dir!==ctx.lineups.away.dir,'press '+(i+1)+': still opposites');
    }
  });

  test(where+': switching from the away board turns home too', ()=>{
    const {ctx}=editor(where,squad('lr','rl'),'away');
    ctx.luSwitchDir();
    eq(ctx.lineups.away.dir,'lr');
    eq(ctx.lineups.home.dir,'rl');
  });

  test(where+': a pair that had drifted into agreeing comes back apart', ()=>{
    // what the old switch left behind: home turned, away never told
    const {ctx}=editor(where,squad('rl','rl',true));
    const awaySpots=spots(ctx.lineups,'away');
    ctx.luSwitchDir();
    eq(ctx.lineups.home.dir,'lr','the side on screen turned as always');
    eq(ctx.lineups.away.dir,'rl','the side already facing that way is left alone');
    deepEq(spots(ctx.lineups,'away'),awaySpots,'so not one of its dots moved — snapshots too');
  });

  /* ---- a turn is a rotation, so every role survives it ---- */
  test(where+': a turn flips BOTH axes — a mirror would leave y alone', ()=>{
    const {ctx}=editor(where,squad('lr','rl',true));
    const before={home:spots(ctx.lineups,'home'),away:spots(ctx.lineups,'away')};
    ctx.luSwitchDir();
    ['home','away'].forEach(t=>{
      Object.entries(spots(ctx.lineups,t)).forEach(([k,p])=>{
        eq(p.x,100-before[t][k].x,t+' '+k+': across the halfway line');
        eq(p.y,100-before[t][k].y,t+' '+k+': and across the middle of the pitch');
      });
    });
  });

  test(where+': every player keeps the role he was given', ()=>{
    const {ctx}=editor(where,squad('lr','rl',true));
    const before={home:roles(ctx.lineups,'home'),away:roles(ctx.lineups,'away')};
    ok(Object.values(before.home).includes('RB'),'the fixture really has a wide player');
    ctx.luSwitchDir();
    ['home','away'].forEach(t=>
      deepEq(roles(ctx.lineups,t),before[t],t+': no right-back came back a left-back'));
  });

  test(where+': every dot is re-labelled for the way its own side now faces', ()=>{
    const {ctx}=editor(where,squad('lr','rl',true));
    ctx.luSwitchDir();
    ['home','away'].forEach(t=>{
      const dir=ctx.lineups[t].dir;
      Object.entries(dots(ctx.lineups,t)).forEach(([k,x])=>
        eq(x.pos,S.zoneAt(x.x,x.y,dir),t+' '+k+': the position matches where the dot stands'));
    });
  });

  /* ---- the snapshots turn with the side that owns them ---- */
  test(where+': a side takes its formation snapshots round with it', ()=>{
    const {ctx}=editor(where,squad('lr','rl',true));
    ctx.luSwitchDir();
    const h=ctx.lineups.history;
    eq(h.length,2,'both snapshots are still there');
    eq(h[0].team,'home'); eq(h[1].team,'away');
    // the keeper is in each snapshot; after the turn he stands where his side's new
    // direction puts the GK square, not stranded at the other end of the pitch
    [['home',0],['away',1]].forEach(([t,i])=>{
      const dir=ctx.lineups[t].dir, gk=h[i].xi.find(x=>x.no==='1'), c=cell(GK(dir)[0],GK(dir)[1]);
      near(gk.x,c.x,t+': the keeper is back in his square');
      near(gk.y,c.y,t+': at the right height in it');
      eq(gk.pos,'GK',t+': and still reads GK');
    });
  });

  test(where+': a snapshot is turned once, by its own side only', ()=>{
    // both sides turn on one press; a snapshot caught by both filters would come back
    // to where it started and read as a different role entirely
    const {ctx}=editor(where,squad('lr','rl',true));
    const before=ctx.lineups.history.map(h=>h.xi.map(x=>({...x})));
    ctx.luSwitchDir();
    ctx.lineups.history.forEach((h,i)=>h.xi.forEach((x,j)=>{
      eq(x.x,100-before[i][j].x,h.team+' snapshot dot '+x.no+': turned exactly once');
      eq(x.y,100-before[i][j].y);
    }));
  });

  test(where+': a red card remembers where the sent-off player stood, turned too', ()=>{
    // offSpot puts him back if the card is deleted, through the side's dir of the day
    const {ctx}=editor(where,squad('lr','rl',true));
    const before={...ctx.lineups.history[1].offSpot};
    ctx.luSwitchDir();
    const spot=ctx.lineups.history[1].offSpot, dir=ctx.lineups.away.dir;
    eq(spot.x,100-before.x); eq(spot.y,100-before.y);
    eq(S.zoneAt(spot.x,spot.y,dir),'RB','he would come back a right-back, as he left');
  });

  /* ---- the switch survives what happens next ---- */
  test(where+': the redraw that follows leaves both sides where the switch put them', ()=>{
    // renderLuPitch tidies each cell through arrangeXI before it draws, and the modal on
    // the tagging tab does the same to the snapshots. A dot turned onto the middle of its
    // new square is already where the tidy-up wants it, so nothing is pulled back.
    const {ctx}=editor(where,squad('lr','rl',true));
    ctx.luSwitchDir();
    ['home','away'].forEach(t=>{
      const lu=ctx.lineups[t], boards=[lu.xi].concat(
        (ctx.lineups.history||[]).filter(h=>h.team===t).map(h=>h.xi));
      boards.forEach((xi,i)=>{
        const before=xi.map(x=>({...x}));
        ok(!S.arrangeXI(xi,lu.dir),t+' board '+i+': already tidy');
        deepEq(xi,before,t+' board '+i+': and nothing was nudged');
      });
    });
  });

  test(where+': a shared cell keeps its pair, in the order the turn leaves them', ()=>{
    // two centre backs stacked in one square: arrangeXI spaces them 1/3 and 2/3 down it.
    // A 180° turn swaps which of them is higher, and that is the right answer — the pair
    // must still land on those same two spots, or every redraw would shuffle them.
    const lu=squad('lr','rl');
    const c=cell(1,1), h=S.PZ_ROW_H[1];
    lu.home.xi=[{no:'4',x:c.x,y:S.PZ_ROW_TOP[1]+h/3,pos:S.zoneAt(c.x,c.y,'lr')},
                {no:'5',x:c.x,y:S.PZ_ROW_TOP[1]+h*2/3,pos:S.zoneAt(c.x,c.y,'lr')}];
    const {ctx}=editor(where,lu);
    ctx.luSwitchDir();
    const xi=ctx.lineups.home.xi, before=xi.map(x=>({...x}));
    ok(!S.arrangeXI(xi,ctx.lineups.home.dir),'the pair is already evenly spaced');
    deepEq(xi,before,'so neither is nudged');
    ok(xi.find(x=>x.no==='4').y>xi.find(x=>x.no==='5').y,'and the turn swapped which sits higher');
  });

  /* ---- housekeeping ---- */
  test(where+': the switch is saved and redrawn, once', ()=>{
    const {ctx,log}=editor(where,squad('lr','rl',true));
    ctx.luSwitchDir();
    eq(log.saves,1);
    eq(log.renders,1);
  });

  test(where+': an empty squad with no history switches without complaint', ()=>{
    const {ctx}=editor(where,{home:{roster:[],xi:[],subs:[],dir:'lr'},
                              away:{roster:[],xi:[],subs:[],dir:'rl'}});
    ctx.luSwitchDir();
    eq(ctx.lineups.home.dir,'rl');
    eq(ctx.lineups.away.dir,'lr');
  });
});

/* Every square on the board, both ways round, in both editors — the turn is only right
   if it is right everywhere. A square keeps its position through the turn because the
   zone map rotates by exactly the same amount; the staging squares keep their blank for
   the same reason, swapping with each other rather than with a position. This is what
   the mirror could never do: it got every lettered square off the centre row wrong. */
test('every square on the board keeps its position through a turn', ()=>{
  EDITORS.forEach(where=>['lr','rl'].forEach(dir=>{
    for(let row=0;row<3;row++)for(let col=0;col<6;col++){
      const p=cell(row,col), before=S.zoneAt(p.x,p.y,dir);
      const lu=squad(dir,dir==='lr'?'rl':'lr');
      lu.home.xi=[{no:'7',x:p.x,y:p.y,pos:before}];
      const {ctx}=editor(where,lu);
      ctx.luSwitchDir();
      const x=ctx.lineups.home.xi[0], at=where+' '+dir+' ['+row+','+col+']';
      eq(x.pos,before,at+': the same position after the turn');
      eq(S.zoneAt(x.x,x.y,ctx.lineups.home.dir),before,at+': and the square he stands in agrees');
    }
  }));
});

/* A player ticked into the squad but not yet placed parks on the staging square beside
   his OWN keeper, and the two sides' staging squares sit in opposite corners. A turn is
   the rotation that carries each side's square onto itself; the old mirror walked a home
   player onto the away square — no position either way, so nothing complained. */
test('a player still on the staging square turns onto the same square', ()=>{
  ['home','away'].forEach(team=>['lr','rl'].forEach(dir=>{
    const from=S.benchSpot(team,dir), to=S.benchSpot(team,dir==='lr'?'rl':'lr');
    near(100-from.x,to.x,team+'/'+dir+': the turn lands on the staging square');
    near(100-from.y,to.y,team+'/'+dir+': at the same height in it');
  }));
});

/* The two editors are copies of one another; a fix applied to one only would leave the
   tagging tab writing a fixture the Player lists page then has to un-break. */
test('both editors switch by the same rule', ()=>{
  const strip=s=>s.replace(/state\.lineups/g,'lineups').replace(/saveLineups\(\)/g,'save()')
                   .replace(/\s+/g,' ').trim();
  ['turnXI','faceTeam','luSwitchDir'].forEach(n=>
    eq(strip(grabFunction(n,PL,'Player-Lists/index.html')),
       strip(grabFunction(n,SRC,'index.html')),n));
});

/* The button is still what calls it — a rename on either page would go unnoticed
   otherwise, and the tests above would keep passing over a dead button. */
test('the Switch Attacking Direction button still reaches it', ()=>{
  [['Player-Lists/index.html',PL],['index.html',SRC]].forEach(([where,src])=>{
    ok(/id="luDir"/.test(src),where+': the button is there');
    ok(/\$\('luDir'\)\.onclick=luSwitchDir/.test(src),where+': and it is wired to the switch');
  });
});
