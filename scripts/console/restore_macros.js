/* Khoi phuc 40 macro da moi ra tu localStorage cua origin cu (hoangnam25012004.github.io).
   Dan NGUYEN file nay vao Console cua https://hoangnams.com/tagger/ roi Enter.

   Ghi thang vao store moi (v2, theo user id) va dong dau thoi gian, de ban sao nay
   MOI HON hang tren server — neu khong, lan ket noi ke tiep se lay ban rong tren cloud
   ghi de len 40 macro vua khoi phuc. */
(function(){
  var MACROS = {"football":[{"key":"qqs","events":["recovery","pass success"]},{"key":"qqss","events":["recovery","pass fail"]},{"key":"bs","events":["aerial duel success","pass success"]},{"key":"bss","events":["aerial duel success","pass fail"]},{"key":"g","events":["goal kick","pass success"]},{"key":"gg","events":["goal kick","pass fail"]},{"key":"t","events":["throw-Ins","pass success"]},{"key":"tt","events":["throw-Ins","pass fail"]},{"key":"xa","events":["ground duel success","tackle success"]},{"key":"xxaa","events":["ground duel fail","tackle fail"]},{"key":"qs","events":["interception","pass success"]},{"key":"qss","events":["interception","pass fail"]},{"key":"dr","events":["shot off target","right foot"]},{"key":"dl","events":["shot off target","left foot"]},{"key":"dh","events":["shot off target","head"]},{"key":"bdh","events":["aerial duel success","shot off target","head"]},{"key":"bddh","events":["aerial duel success","shot on target","head"]},{"key":"bgh","events":["aerial duel success","goal","head"]},{"key":"gr","events":["goal","right foot"]},{"key":"gl","events":["goal","left foot"]},{"key":"gh","events":["goal","head"]},{"key":"ddh","events":["shot on target","head"]},{"key":"ddr","events":["shot on target","right foot"]},{"key":"ddl","events":["shot on target","left foot"]},{"key":"ks","events":["free-kick","pass success"]},{"key":"kss","events":["free-kick","pass fail"]},{"key":"kc","events":["free-kick","cross success"]},{"key":"kcc","events":["free-kick","cross fail"]},{"key":"jc","events":["corner-kick","cross success"]},{"key":"jcc","events":["corner-kick","cross fail"]},{"key":"js","events":["corner-kick","pass success"]},{"key":"jss","events":["corner-kick","pass fail"]},{"key":"sz","events":["pass success","key pass"]},{"key":"szz","events":["pass success","key pass","assist"]},{"key":"cz","events":["cross success","key pass"]},{"key":"czz","events":["cross success","key pass","assist"]},{"key":"fy","events":["foul","yellow card"]},{"key":"fyr","events":["foul","yellow card","red card"]},{"key":"fr","events":["foul","red card"]},{"key":"aaer","events":["tackle fail","take-on concern"]}],"football7":[],"futsal":[],"basketball":[]};
  var u = (window.PTAuth && window.PTAuth.user()) || {};
  var uid = u.id || 'local';
  function read(k){ try { return JSON.parse(localStorage.getItem(k)) || {}; } catch(e){ return {}; } }
  var all = read('pitchtagger.macros.v2'); all[uid] = MACROS;
  localStorage.setItem('pitchtagger.macros.v2', JSON.stringify(all));
  var at = read('pitchtagger.prefs.at.v1'); at[uid] = Date.now();
  localStorage.setItem('pitchtagger.prefs.at.v1', JSON.stringify(at));
  console.log('Restored ' + (MACROS.football || []).length + ' macros for ' + (u.email || uid));
  location.reload();
})();
