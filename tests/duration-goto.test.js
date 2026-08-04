/* ▶ Go to — sends the video to the time a Match duration field holds.

   The reverse of ⏱ Use current, which grabs the video's position into the field. Setting
   the four boundaries meant scrubbing the seek bar to find each one; checking a boundary
   already set meant scrubbing back. This is the same jump the timestamp in an events row
   already does, wired to the four fields.

   Two things it must not become: a seek to 00:00 when the box is empty (parseTime('')
   returns 0, which is indistinguishable from a boundary genuinely set there), and a
   handler that picks up the ⏱ Use current buttons — the two are bound by separate class
   selectors, so they must not share a class. */
const {test,eq,ok,notOk}=require('./tiny-test');
const {SRC}=require('./harness');

const durModal=SRC.slice(SRC.indexOf('id="durModal"'),SRC.indexOf('id="cloudModal"'));
const handler=/document\.querySelectorAll\('\.dur-go'\)[\s\S]*?\};\}\);/.exec(SRC);

test('there is one beside each ⏱ Use current, and only there', () => {
  eq((durModal.match(/class="dur-go"/g)||[]).length,4,'four buttons');
  eq((durModal.match(/class="dur-now"/g)||[]).length,4,'still four Use current');
  ['durH1Start','durH1End','durH2Start','durH2End'].forEach(id=>{
    ok(durModal.includes('data-go="'+id+'"'),id+' has one');
    // right of its own Use current, not somewhere else in the row
    const now=durModal.indexOf('data-now="'+id+'"'), go=durModal.indexOf('data-go="'+id+'"');
    ok(now<go&&go-now<160,id+': the Go to button follows its Use current');
  });
});

test('the two buttons never share a class', () => {
  // both are bound by class; one class on both would make each handler grab the other's
  // buttons, and b.dataset.now / b.dataset.go would be undefined -> $(undefined) -> throw
  notOk(/class="dur-now dur-go"|class="dur-go dur-now"/.test(SRC),'no button carries both');
  ok(/\.dur-now,\.dur-go\{/.test(SRC),'they are styled together instead');
});

test('it seeks to the time in its own field', () => {
  ok(handler,'the handler exists');
  const fn=handler[0];
  ok(/\$\(b\.dataset\.go\)\.value\.trim\(\)/.test(fn),'reads the field it belongs to');
  ok(/video\.currentTime=/.test(fn),'and moves the video');
  ok(/parseTime\(raw\)/.test(fn),'through the same parser the fields are read with');
});

test('an empty field is left alone rather than seeking to zero', () => {
  ok(/if\(!raw\|\|!video\.src\)return;/.test(handler[0]),
     'no value, or no video, and nothing happens');
});

test('a time past the end of the video is clamped, like every other seek', () => {
  ok(/Math\.min\(video\.duration\|\|1e9,Math\.max\(0,parseTime\(raw\)\)\)/.test(handler[0]),
     'same clamp as seekBy');
});

test('it changes nothing about the mapping itself', () => {
  const fn=handler[0];
  notOk(/applyDur\(\)/.test(fn),'going to a time does not re-apply the mapping');
  notOk(/durEnabled/.test(fn),'nor tick the checkbox — only ⏱ Use current does that');
  // …and Use current still does both, as before
  const now=/document\.querySelectorAll\('\.dur-now'\)[\s\S]*?\};\}\);/.exec(SRC)[0];
  ok(/durEnabled'\)\.checked=true/.test(now)&&/applyDur\(\)/.test(now),'Use current is untouched');
});

test('only the Duration modal was widened to fit the extra column', () => {
  ok(/#durModal \.modal\{max-width:580px\}/.test(SRC),'this modal gets 580');
  ok(/\.modal\{[^}]*max-width:520px/.test(SRC),'every other modal keeps 520');
  ok(/grid-template-columns:130px 1fr auto auto/.test(SRC),'and the row has a fourth column');
});
