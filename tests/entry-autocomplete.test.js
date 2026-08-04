/* The Enter event box must not carry the browser's own suggestion dropdown.

   Reported: left-clicking it brought up a list of previously typed entries — "1s2",
   "2sub3", "10qq", "v", "t" — sitting over the events table while tagging.

   Nothing in the app draws that: index.html has no <form>, no <datalist>, and no
   suggestion code. It is Chrome's form-history autofill, which keys off the field and
   offers back everything ever typed into it. A tagger types into this one box hundreds
   of times a match, so it filled up fast, and nothing in the page can dismiss a native
   dropdown. The box had gone without autocomplete since the first commit; the fix is the
   attribute the rest of the page's inputs already carry. */
const fs=require('fs'), path=require('path');
const {test,eq,ok,notOk}=require('./tiny-test');
const {SRC}=require('./harness');

const tagOf=id=>(SRC.match(new RegExp('<input[^>]*id="'+id+'"[^>]*>'))||[])[0]||'';

test('the event box tells the browser to keep nothing', () => {
  const tag=tagOf('playerInput');
  ok(tag,'the box is still there');
  ok(/autocomplete="off"/.test(tag),'autocomplete="off" — got: '+tag);
});

test('the app was never the one suggesting', () => {
  // so nobody goes looking for app code to fix the next time this is reported
  eq((SRC.match(/<datalist/g)||[]).length,0,'no datalist anywhere');
  eq((SRC.match(/<form/g)||[]).length,0,'and no form for the browser to record on submit');
});

test('nothing else about the box changed', () => {
  const tag=tagOf('playerInput');
  ok(/autofocus/.test(tag),'it still takes focus on load — tagging starts by typing');
  ok(/class="txt"/.test(tag),'same styling');
  ok(/placeholder="e\.g\. 1s2/.test(tag),'same placeholder');
  notOk(/name=/.test(tag),'still unnamed, which is one less thing for autofill to key on');
});

test('the boxes that already had it still do', () => {
  ['cloudMatchId','nmHome','nmAway'].forEach(id=>
    ok(/autocomplete="off"/.test(tagOf(id)),id+' keeps autocomplete="off"'));
});
