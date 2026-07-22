/* A ~50-line test runner, so the suite needs no dependencies and no install step.
   Tests register themselves and run once the requiring file has finished loading. */
const tests=[];
let scheduled=false;

function test(name,fn){
  tests.push({name,fn});
  if(!scheduled){scheduled=true;setImmediate(run);}
}
class Fail extends Error{}
function fail(msg){throw new Fail(msg)}

function eq(actual,expected,why){
  if(actual!==expected)
    fail((why?why+': ':'')+'expected '+JSON.stringify(expected)+', got '+JSON.stringify(actual));
}
function deepEq(actual,expected,why){
  const a=JSON.stringify(actual), e=JSON.stringify(expected);
  if(a!==e)fail((why?why+': ':'')+'expected '+e+', got '+a);
}
function ok(v,why){if(!v)fail((why||'expected a truthy value')+' — got '+JSON.stringify(v))}
function notOk(v,why){if(v)fail((why||'expected a falsy value')+' — got '+JSON.stringify(v))}

function run(){
  let passed=0; const failures=[];
  tests.forEach(t=>{
    try{t.fn();passed++;console.log('  ✓ '+t.name);}
    catch(e){
      failures.push({name:t.name,err:e});
      console.log('  ✗ '+t.name+'\n      '+(e instanceof Fail?e.message:(e&&e.stack||e)));
    }
  });
  console.log('\n'+passed+'/'+tests.length+' passed'+(failures.length?', '+failures.length+' FAILED':''));
  process.exitCode=failures.length?1:0;
}

module.exports={test,eq,deepEq,ok,notOk,fail,run};
