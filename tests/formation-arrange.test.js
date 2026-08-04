/* Where a dot lands on the formation board, and how a cell shares itself out.

   Adding a player used to deal him down the middle of the pitch — x=50, y stepping 12, 20,
   28… — so an unknown position was dropped somewhere between LM and RM as if it meant
   something. It now goes to the staging square beside the goalkeeper: the empty cell next
   to LB for the home side, next to RB for the away side. That square carries no position,
   and a squad added in one go stacks on the very same spot on purpose — it is where you
   sort them out from, not a place to be clever about free space.

   Everywhere else the opposite holds: the dots in a position cell share it evenly, n of
   them at (i+1)/(n+1) down the cell, so two centre backs read as a pair and four read as a
   column instead of a pile. */
const fs=require('fs'), path=require('path');
const {loadShared}=require('./harness');
const {test,eq,deepEq,ok,notOk}=require('./tiny-test');

const S=loadShared();
const DIRS=['lr','rl'];
// centre of a DISPLAY cell — the same arithmetic gridHTML lays the squares out with
const centre=(row,col)=>({x:(col+0.5)*100/6,y:S.PZ_ROW_TOP[row]+S.PZ_ROW_H[row]/2});
const near=(a,b)=>Math.abs(a-b)<1e-9;
const PL=fs.readFileSync(path.join(__dirname,'..','Player-Lists','index.html'),'utf8');

/* ================= the staging square ================= */
test('an unknown position parks beside the keeper, not out on the pitch', () => {
  DIRS.forEach(dir=>['home','away'].forEach(team=>{
    const s=S.benchSpot(team,dir);
    eq(S.zoneAt(s.x,s.y,dir),'',team+'/'+dir+': the square carries no position');
    const c=S.cellAt(s.x,s.y);
    // the goalkeeper shares its column — the square sits directly above (or below) him
    const gk=centre(1,c.col);
    eq(S.zoneAt(gk.x,gk.y,dir),'GK',team+'/'+dir+': GK is in the same column');
    // and the full-back is its only neighbour along the row
    const flank=[c.col-1,c.col+1].filter(n=>n>=0&&n<=5)
      .map(n=>centre(c.row,n)).map(p=>S.zoneAt(p.x,p.y,dir)).filter(Boolean);
    deepEq(flank,[team==='home'?'LB':'RB'],team+'/'+dir+': it is the square beside the back');
  }));
});

test('the square is the same one whichever way the team attacks', () => {
  // the direction arrow moves the whole map, so the spot moves with it — what stays
  // fixed is WHICH square it is, and that is what the rule is about
  ['home','away'].forEach(team=>{
    const a=S.benchSpot(team,'lr'), b=S.benchSpot(team,'rl');
    ok(a.x!==b.x,team+': it follows the flip across the pitch');
    eq(S.zoneAt(a.x,a.y,'lr'),'');
    eq(S.zoneAt(b.x,b.y,'rl'),'');
  });
});

test('a whole squad added at once stacks on that one spot', () => {
  const dir='lr';
  const xi=Array.from({length:6},(_,i)=>{
    const s=S.benchSpot('home',dir);
    return {no:String(i+1),x:s.x,y:s.y,pos:S.zoneAt(s.x,s.y,dir)};
  });
  ok(xi.every(x=>near(x.x,xi[0].x)&&near(x.y,xi[0].y)),'all six on the same spot');
  // …and the arranger leaves them there: overlapping is the point of that square
  notOk(S.arrangeXI(xi,dir),'nothing to tidy');
  ok(xi.every(x=>near(x.x,xi[0].x)&&near(x.y,xi[0].y)),'still stacked after arranging');
  ok(xi.every(x=>x.pos===''),'and none of them claims a position');
});

/* ================= sharing a position cell ================= */
// n dots dropped roughly into one cell, deliberately untidy
const dropped=(row,col,n)=>Array.from({length:n},(_,i)=>{
  const p=centre(row,col);
  return {no:String(i+1),x:p.x+(i%2?1.2:-0.8),y:p.y+(i-(n-1)/2)*1.5};
});

test('1 to 4 dots in a cell come out evenly spaced down it', () => {
  [[0,2],[1,3],[2,4]].forEach(([row,col])=>{     // a top, a middle and a bottom cell
    for(let n=1;n<=4;n++){
      const xi=dropped(row,col,n);
      ok(S.arrangeXI(xi,'rl'),'n='+n+' at ['+row+','+col+'] moved');
      const top=S.PZ_ROW_TOP[row], h=S.PZ_ROW_H[row], cx=(col+0.5)*100/6;
      xi.forEach((x,i)=>{
        ok(near(x.x,cx),'n='+n+' dot '+i+' is centred across the cell');
        ok(near(x.y,top+h*(i+1)/(n+1)),'n='+n+' dot '+i+' sits at '+(i+1)+'/'+(n+1));
      });
    }
  });
});

test('one dot sits dead centre', () => {
  const xi=dropped(1,3,1);
  S.arrangeXI(xi,'rl');
  const c=centre(1,3);
  ok(near(xi[0].x,c.x)&&near(xi[0].y,c.y),'centre of the cell');
});

test('two share it at a third and two thirds, four at a fifth apart', () => {
  const two=dropped(1,4,2); S.arrangeXI(two,'rl');
  deepEq(two.map(x=>x.y),[25+50/3,25+100/3],'CB cell: 1/3 and 2/3');
  const four=dropped(1,4,4); S.arrangeXI(four,'rl');
  deepEq(four.map(x=>x.y),[35,45,55,65],'CB cell: 1/5, 2/5, 3/5, 4/5');
});

test('arranging never pushes a dot out of its own cell', () => {
  DIRS.forEach(dir=>{
    for(let row=0;row<3;row++)for(let col=0;col<6;col++){
      const before=S.zoneAt(centre(row,col).x,centre(row,col).y,dir);
      if(!before)continue;                       // staging square — not arranged
      for(let n=1;n<=4;n++){
        const xi=dropped(row,col,n);
        S.arrangeXI(xi,dir);
        xi.forEach(x=>{
          eq(S.zoneAt(x.x,x.y,dir),before,dir+' ['+row+','+col+'] n='+n+' stays put');
          eq(x.pos,before,'and its stored position agrees');
        });
      }
    }
  });
});

test('the dots keep the order they were stacked in', () => {
  const xi=dropped(1,3,4);
  xi.forEach((x,i)=>x.y=centre(1,3).y+(3-i));    // 4,3,2,1 down the cell
  S.arrangeXI(xi,'rl');
  const byY=xi.slice().sort((a,b)=>a.y-b.y).map(x=>x.no);
  deepEq(byY,['4','3','2','1'],'whoever was highest stays highest');
});

test('each cell is arranged on its own', () => {
  const xi=dropped(1,4,2).concat(dropped(0,2,3)).concat(dropped(2,1,1));
  S.arrangeXI(xi,'rl');
  deepEq(xi.slice(0,2).map(x=>x.y),[25+50/3,25+100/3],'the pair');
  deepEq(xi.slice(2,5).map(x=>x.y),[6.25,12.5,18.75],'the three');
  eq(xi[5].y,87.5,'the single one');
});

test('a tidy board reports no change — the render-time call cannot loop', () => {
  const xi=dropped(1,4,3).concat(dropped(0,0,2));
  ok(S.arrangeXI(xi,'rl'),'first pass tidies');
  notOk(S.arrangeXI(xi,'rl'),'second pass has nothing to do');
  notOk(S.arrangeXI(xi,'rl'),'and stays settled');
});

test('an empty or absent lineup is not a crash', () => {
  notOk(S.arrangeXI([],'rl'));
  notOk(S.arrangeXI(null,'rl'));
  notOk(S.arrangeXI(undefined,'lr'));
});

/* ================= wired into the page ================= */
test('Player lists parks new players on the square instead of dealing them out', () => {
  const fn=/function addToLineup\(no\)\{[\s\S]*?\n\}/.exec(PL)[0];
  ok(/benchSpot\(lineupTeam,t\.dir\)/.test(fn),'it asks for the staging square');
  notOk(/12\+t\.xi\.length\*8/.test(fn),'the old LM-to-RM ladder is gone');
  notOk(/const x=50/.test(fn),'and so is the fixed centre column');
});

test('and tidies the board on every route in', () => {
  const fn=/function renderLuPitch\(\)\{[\s\S]*?\n\}/.exec(PL)[0];
  ok(/if\(arrangeXI\(t\.xi,t\.dir\)\)save\(\)/.test(fn),
     'arranged before drawing, and persisted only when it changed something');
  // the drag handler still writes the dropped position — the arranger tidies it after
  ok(/x\.pos=zoneAt\(x\.x,x\.y,dir\)/.test(PL),'dragging still sets the position it landed in');
});
