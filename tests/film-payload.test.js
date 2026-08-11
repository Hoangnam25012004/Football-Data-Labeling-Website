/* Film — the video that reaches the club, and the way the view lets go of it.

   Two halves to this file.

   The payload: Submit Analysis freezes the video URL beside the mapping that
   carves it into halves. It has to be frozen rather than read live — the key an
   upload lands on carries a timestamp, so re-uploading a match does not replace
   the old object, and a report reading the CURRENT url would quietly start
   drawing dots against a different file's clock. A match tagged from a local
   file has no url at all and must come through as nothing to play, not as a
   broken player.

   The teardown: Film is the only view here that holds anything open — a video
   fetch, an animation loop, and a keydown listener on the document. That last
   one is the dangerous one: left behind, it would go on eating ← and → on every
   other tab in the app. */
const {grabFunction,STATS,CLOUD}=require('./harness');
const {test,eq,ok,notOk}=require('./tiny-test');

const buildReport=grabFunction('buildReport',CLOUD,'cloud-sync.js');
const setData=grabFunction('setData',STATS,'Stats/stats-view.js');
const renderStats=grabFunction('renderStats',STATS,'Stats/stats-view.js');
const filmStop=grabFunction('filmStop',STATS,'Stats/stats-view.js');
const filmKeys=grabFunction('filmKeys',STATS,'Stats/stats-view.js');
const filmStart=grabFunction('filmStart',STATS,'Stats/stats-view.js');
const renderFilm=grabFunction('renderFilm',STATS,'Stats/stats-view.js');

/* ================= what Submit Analysis freezes ================= */
test('the report carries the video, beside the mapping it belongs to', () => {
  ok(/video:\s*m\.video_url/.test(buildReport),'read off the match row');
  ok(/url:\s*m\.video_url/.test(buildReport),'the link itself');
  ok(/frozenAt/.test(buildReport),'and when it was frozen');
  // dur and video are frozen in the same object, which is the whole point: a url
  // without the boundaries it was mapped with is a video nobody can cut
  ok(buildReport.indexOf('dur:')<buildReport.indexOf('video:'),'both in the one payload');
});

test('a match with no shared video freezes null, not a guess', () => {
  ok(/m\.video_url[\s\S]{0,400}?:\s*null/.test(buildReport),
     'the local-file case is an explicit null');
  notOk(/video_url\s*\|\|\s*['"]/.test(buildReport),'never a placeholder string');
});

test('it is read out of the database, like everything else in the report', () => {
  // buildReport already re-reads the match row; the url must come from THERE and
  // not from whatever this browser tab happens to be holding
  notOk(/video:\s*[\s\S]{0,60}PT\(\)/.test(buildReport),'not out of the tagging tab');
});

/* ================= what the view does with it ================= */
test('setData takes the video from the payload, and tolerates its absence', () => {
  ok(/videoSrc=\(d\.video&&d\.video\.url\)\?\{url:d\.video\.url\}:null/.test(setData),
     'present -> a source; absent -> none, which is what an old report is');
});

test('handing over a match resets what belonged to the last one', () => {
  ['filmHalf=1','filmFilter=','filmResume=null'].forEach(s=>
    ok(setData.includes(s),'setData clears '+s));
});

/* ================= letting go ================= */
test('every redraw tears the player down first', () => {
  ok(/^\s*filmStop\(\);/m.test(renderStats),'renderStats stops Film before it draws');
  // …and before the no-match early return, or leaving a match open would leak
  ok(renderStats.indexOf('filmStop()')<renderStats.indexOf('const open='),
     'ahead of every return in the function');
});

test('the document listener goes when Film goes', () => {
  ok(/document\.addEventListener\('keydown',filmKeys\)/.test(filmStart),'added by name');
  ok(/document\.removeEventListener\('keydown',filmKeys\)/.test(filmStop),'and taken off by name');
  // a bound arrow function could not be removed — the reference has to be stable
  notOk(/addEventListener\('keydown',\s*(?:\(|function)/.test(filmStart),
        'no inline handler: it could never be removed again');
});

test('the loop and the fetch are let go of too', () => {
  ok(/cancelAnimationFrame/.test(filmStop),'the animation loop is cancelled');
  ok(/removeAttribute\('src'\)/.test(filmStop),'and the video stops downloading');
  ok(/film=null/.test(filmStop),'nothing is left pointing at it');
});

test('where it left off survives a redraw, but not a change of half', () => {
  ok(/filmResume=\{half:f\.win\.half/.test(filmStop),'the half is remembered with the time');
  ok(/filmResume&&filmResume\.half===win\.half/.test(filmStart),
     'and only honoured for the same half — switching starts at the kick-off');
});

/* ================= the keys ================= */
test('the arrow keys step the video, and nothing else does', () => {
  ok(/e\.key==='ArrowRight'\)filmSeekBy\(FILM_STEP\)/.test(filmKeys),'right goes forward');
  ok(/e\.key==='ArrowLeft'\)filmSeekBy\(-FILM_STEP\)/.test(filmKeys),'left goes back');
  ok(/else return;/.test(filmKeys),'any other key is left entirely alone');
});

test('the keys keep out of the way of the filters', () => {
  // the three selects are right there beside the video; arrowing through one of
  // them must change the option, not scrub the film
  ['INPUT','SELECT','TEXTAREA'].forEach(t=>ok(filmKeys.includes(t),t+' is exempt'));
  ok(/isContentEditable/.test(filmKeys),'and anything editable');
  ok(/altKey\|\|e\.ctrlKey\|\|e\.metaKey/.test(filmKeys),'modified arrows belong to the browser');
});

test('the handler does nothing at all once Film has been left', () => {
  ok(/^function filmKeys\(e\)\{\s*if\(!film/m.test(filmKeys),'guarded on the first line');
});

/* ================= a match with no shared video ================= */
test('no video is a sentence, not an empty player', () => {
  ok(/if\(!src\)/.test(renderFilm),'the source is checked before anything is built');
  ok(/stats-empty/.test(renderFilm),'and the view says so in the ordinary way');
  ok(renderFilm.indexOf('if(!src)')<renderFilm.indexOf('filmStart('),
     'nothing is started for a match that cannot be played');
});

/* ================= the other tabs ================= */
test('Film is a fourth view, and does not turn into a per-team one', () => {
  ok(/statView!=='overall'&&statView!=='film'/.test(renderStats),
     'the side picker and the category tabs stay hidden on Film');
  ok(/if\(statView==='film'\)\{renderFilm\(holder\);return;\}/.test(renderStats),
     'and it returns before the per-team work');
  // Overall must still be reached the way it always was
  ok(/if\(!perTeam\)\{renderGeneral\(\);return;\}/.test(renderStats),'Overall is untouched');
});

test('a host whose header predates Film is not reached into', () => {
  ok(/if\(\$\('viewFilmBtn'\)\)/.test(renderStats),'the button is checked for before it is styled');
});
