/* Attacking direction is one fact about the fixture, not two facts about two teams.

   Two sides cannot both attack the same goal, so home and away always face opposite
   ways. "⇄ Switch Attacking Direction" used to turn only the side on screen: switch
   home from left→right and away stayed left→right too, both attacking the same end,
   and the formation boards, the read-only pitch on the tagging tab and the Stats
   page all went on drawing that impossible fixture.

   The switch now turns the side on screen AND points the other side the other way.
   A side already facing correctly is left alone — nothing moves for it — which is
   what brings a pair that had already drifted into agreeing back apart, on the very
   first press, without needing the stored squad repaired behind the user's back.

   Both editors are covered: the Player lists page and the (twin) copy in index.html. */
const fs=require('fs'), path=require('path'), vm=require('vm');
const {test,eq,ok,deepEq}=require('./tiny-test');
const {grabFunction,loadShared,readSrc,SRC}=require('./harness');

const PL=readSrc(path.join('Player-Lists','index.html'));
const S=loadShared();

/* A dot per team, both standing in the middle of the top-left square (the same
   arithmetic gridHTML lays the squares out with), each side facing its own way. */
const CX=(0+0.5)*100/6, CY=S.PZ_ROW_TOP[0]+S.PZ_ROW_H[0]/2;
const squad=(homeDir,awayDir)=>({
  home:{roster:[{no:'2',name:'Hai'}],xi:[{no:'2',x:CX,y:CY,pos:S.zoneAt(CX,CY,homeDir)}],
        subs:[],dir:homeDir},
  away:{roster:[{no:'3',name:'Ba'}],xi:[{no:'3',x:CX,y:CY,pos:S.zoneAt(CX,CY,awayDir)}],
        subs:[],dir:awayDir}
});

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
  vm.runInContext([grabFunction('faceTeam',src,where),grabFunction('luSwitchDir',src,where)].join('\n'),
    ctx,{filename:where+'-dir.js'});
  return {ctx,log};
}
const EDITORS=[['Player-Lists/index.html','lineups'],['index.html','state.lineups']];

EDITORS.forEach(([where])=>{
  test(where+': switching one side turns the other with it', ()=>{
    const {ctx}=editor(where,squad('lr','rl'));
    ctx.luSwitchDir();
    eq(ctx.lineups.home.dir,'rl','the side on screen turned');
    eq(ctx.lineups.away.dir,'lr','and the other side turned the other way');
  });

  test(where+': the two sides never end up attacking the same end', ()=>{
    const {ctx}=editor(where,squad('lr','rl'));
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
    const {ctx}=editor(where,squad('rl','rl'));
    const awayBefore=ctx.lineups.away.xi.map(x=>({...x}));
    ctx.luSwitchDir();
    eq(ctx.lineups.home.dir,'lr','the side on screen turned as always');
    eq(ctx.lineups.away.dir,'rl','the side already facing that way is left alone');
    deepEq(ctx.lineups.away.xi,awayBefore,'so not one of its dots moved');
  });

  test(where+': a turned side takes its dots to the other end', ()=>{
    const {ctx}=editor(where,squad('lr','rl'));
    ctx.luSwitchDir();
    eq(ctx.lineups.home.xi[0].x,100-CX,'home mirrored across the halfway line');
    eq(ctx.lineups.away.xi[0].x,100-CX,'away mirrored with it');
    ctx.lineups.home.xi.concat(ctx.lineups.away.xi).forEach(x=>{
      eq(x.y,CY,'a switch is left-right only — it never moves a dot up or down');
    });
  });

  test(where+': the redraw that follows leaves both sides where the switch put them', ()=>{
    // renderLuPitch tidies each cell through arrangeXI before it draws. A dot mirrored
    // onto the middle of its new square is already where the tidy-up wants it, so the
    // switch survives the re-render instead of being pulled back the moment it lands.
    const {ctx}=editor(where,squad('lr','rl'));
    ctx.luSwitchDir();
    ['home','away'].forEach(t=>{
      const lu=ctx.lineups[t], before=lu.xi.map(x=>({...x}));
      ok(!S.arrangeXI(lu.xi,lu.dir),t+': the board is already tidy');
      deepEq(lu.xi,before,t+': and nothing was nudged');
    });
  });

  test(where+': every dot is re-labelled for the way its own side now faces', ()=>{
    const {ctx}=editor(where,squad('lr','rl'));
    ctx.luSwitchDir();
    ['home','away'].forEach(t=>{
      const lu=ctx.lineups[t], x=lu.xi[0];
      eq(x.pos,S.zoneAt(x.x,x.y,lu.dir),t+': the position matches where the dot stands');
    });
  });

  test(where+': the switch is saved and redrawn, once', ()=>{
    const {ctx,log}=editor(where,squad('lr','rl'));
    ctx.luSwitchDir();
    eq(log.saves,1);
    eq(log.renders,1);
  });

  test(where+': an empty squad switches without complaint', ()=>{
    const {ctx}=editor(where,{home:{roster:[],xi:[],subs:[],dir:'lr'},
                              away:{roster:[],xi:[],subs:[],dir:'rl'}});
    ctx.luSwitchDir();
    eq(ctx.lineups.home.dir,'rl');
    eq(ctx.lineups.away.dir,'lr');
  });
});

/* The two editors are copies of one another; a fix applied to one only would leave the
   tagging tab writing a fixture the Player lists page then has to un-break. */
test('both editors switch by the same rule', ()=>{
  const strip=s=>s.replace(/state\.lineups/g,'lineups').replace(/saveLineups\(\)/g,'save()')
                   .replace(/\s+/g,' ').trim();
  eq(strip(grabFunction('faceTeam',PL,'Player-Lists/index.html')),
     strip(grabFunction('faceTeam',SRC,'index.html')),'faceTeam');
  eq(strip(grabFunction('luSwitchDir',PL,'Player-Lists/index.html')),
     strip(grabFunction('luSwitchDir',SRC,'index.html')),'luSwitchDir');
});

/* The button is still what calls it — a rename on either page would go unnoticed
   otherwise, and the tests above would keep passing over a dead button. */
test('the Switch Attacking Direction button still reaches it', ()=>{
  [['Player-Lists/index.html',PL],['index.html',SRC]].forEach(([where,src])=>{
    ok(/id="luDir"/.test(src),where+': the button is there');
    ok(/\$\('luDir'\)\.onclick=luSwitchDir/.test(src),where+': and it is wired to the switch');
  });
});
