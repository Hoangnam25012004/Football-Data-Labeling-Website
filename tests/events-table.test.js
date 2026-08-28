/* Events-table rendering: which colour class each event name gets, and that the class
   actually reaches the markup. Goal + every shot type render as a black badge (.shot),
   the duels keep their own colours, everything else stays in the default ink. */
const {makeApp,EVENTS}=require('./harness');
const {test,eq,deepEq,ok}=require('./tiny-test');

const app=makeApp({state:{sport:'football',team:'home',rows:[],pendingDots:[],
  lineups:{home:{xi:[],subs:[],roster:[]},away:{xi:[],subs:[],roster:[]},history:[]},
  duration:{enabled:false,h2Start:0},teamIds:{}}});
const cls=n=>app.k.evtClass(n).trim();

test('goal and every shot type get the black badge', ()=>{
  ['goal','own goal','shot on target','shot off target','blocked shot','miss shot',
   'missed shot','headed shot','Shot On Target'].forEach(n=>eq(cls(n),'shot',n));
});

test('events that merely sound similar are left alone', ()=>{
  ['block','goal kick','save','key pass','assist','clearance','penalty kick','pass success',
   'take-on succes','recovery','free-kick','foul','substitution'].forEach(n=>eq(cls(n),'',n));
});

test('the duel colours are unchanged', ()=>{
  eq(cls('ground duel success'),'duel-ground');
  eq(cls('ground duel fail'),'duel-ground');
  eq(cls('aerial duel success'),'duel-aerial');
  eq(cls('aerial duel fail'),'duel-aerial');
});

test('every configured football event maps to exactly one known class', ()=>{
  const seen={};
  EVENTS.football.forEach(e=>{seen[e.name]=cls(e.name);
    ok(['','shot','duel-ground','duel-aerial','duel-physical','duel-loose'].includes(seen[e.name]),
       e.name+' -> '+seen[e.name]);});
  // own goal joins the black badge without a rule of its own: SHOT_EVENTS has matched
  // /^own goal$/ since long before the dictionary shipped the name
  deepEq(Object.keys(seen).filter(n=>seen[n]==='shot').sort(),
    ['blocked shot','goal','own goal','shot off target','shot on target']);
});

/* The split kinds get their own colour rather than inheriting their parent's, so the
   Events table can be read at a glance for which sort of duel it was. Asserted together
   with the parent so a regex reordered in evtClass cannot quietly hand one name the
   other's colour. */
test('the two split ground duels each have a colour of their own', ()=>{
  eq(cls('physical duel success'),'duel-physical');
  eq(cls('physical duel fail'),'duel-physical');
  eq(cls('loose ball duel success'),'duel-loose');
  eq(cls('loose ball duel fail'),'duel-loose');
  eq(cls('ground duel success'),'duel-ground','the parent name keeps the colour it had');
  eq(cls('Loose Ball Duel Fail'),'duel-loose','the list is user-editable, so match any case');
});

test('a chain row carries the class into the markup, per event', ()=>{
  const html=app.chainHTML([
    {playerFrom:'17',playerTo:'14',event:'cross success'},
    {playerFrom:'14',playerTo:'',event:'shot on target'},
  ],'home');
  ok(html.includes('class="evt home">#cross success</span>'),'ordinary event untouched: '+html);
  ok(html.includes('class="evt home shot">#shot on target</span>'),'shot badged: '+html);
});

test('a goal inside a chain is badged too, and the numbers are not', ()=>{
  const html=app.chainHTML([
    {playerFrom:'9',playerTo:'',event:'ground duel success'},
    {playerFrom:'9',playerTo:'',event:'goal'},
  ],'away');
  ok(html.includes('class="evt away duel-ground">#ground duel success</span>'));
  ok(html.includes('class="evt away shot">#goal</span>'));
  ok(html.includes('<span class="pnum">9</span>'),'player number keeps its own class');
});

test('the .shot rule exists in the stylesheet and paints black', ()=>{
  const css=require('./harness').SRC.match(/\.evt\.shot\{[^}]*\}/)[0].replace(/\s+/g,'');
  ok(css.includes('background:#000'),'black fill: '+css);
  ok(/color:#[0-9a-f]{6}/i.test(css),'and an explicit light label colour: '+css);
});
