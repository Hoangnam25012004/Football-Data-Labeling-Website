/* The popped-out video window: right-click must do nothing, in every case.

   Reported: open the video window, close it with the OS "X", open it again — now
   right-clicking the video brings up Chrome's media menu (Loop, Show all controls,
   Save video frame as…).

   Cause: the video is ONE node moved between the two windows with adoptNode, and it
   carries its listeners with it. Closing the window destroys that document, and that
   wipes every listener on the nodes inside it — re-adopting does not bring them back.
   The video came home mute, so the next window had no right-click block. The clock,
   the seek bar, the play/pause glyph and the click-to-pause suppression went with it.

   Two defences, and this file guards that both stay wired:
     1. the node is brought home on pagehide/beforeunload, while that document is still
        alive, so nothing is ever lost;
     2. the window's own document blocks contextmenu — created fresh every time, so it
        cannot be lost, and it covers the whole window rather than the video surface.
   The teardown itself needs a real browser; what is checkable here is the wiring and
   the handlers' own behaviour. */
const {grabConst,SRC}=require('./harness');
const {test,eq,ok,notOk}=require('./tiny-test');
const vm=require('vm');

// the guard handlers are plain functions — lift and exercise them directly
const ctx={};
vm.createContext(ctx);
vm.runInContext(['blockEvent','blockNonLeft'].map(n=>grabConst(n)).join('\n')
  +'\n;globalThis.H={blockEvent,blockNonLeft};',ctx,{filename:'guards.js'});
const H=ctx.H;
const ev=button=>{const e={button,prevented:false,stopped:false,
  preventDefault(){e.prevented=true},stopPropagation(){e.stopped=true}};return e;};

/* ================= the handlers ================= */
test('blockEvent kills the event outright', () => {
  const e=ev(2); H.blockEvent(e);
  ok(e.prevented,'default prevented — no context menu');
  ok(e.stopped,'and it goes no further');
});

test('blockNonLeft blocks right and middle, leaves left alone', () => {
  const right=ev(2), middle=ev(1), left=ev(0);
  H.blockNonLeft(right); H.blockNonLeft(middle); H.blockNonLeft(left);
  ok(right.prevented,'right button blocked');
  ok(middle.prevented,'middle button blocked');
  notOk(left.prevented,'left button still works — it is how dots and controls are used');
});

/* ================= the wiring ================= */
const fn=name=>new RegExp('function '+name+'\\(([\\s\\S]*?)\\n}').exec(SRC)[1];

test('the video node still carries its own guards, re-bindably', () => {
  const b=fn('bindVideoGuards');
  ['contextmenu','auxclick'].forEach(t=>ok(b.includes(t),t+' blocked on the video'));
  ok(/blockNonLeft/.test(b),'and the non-left mouse buttons');
  // stable references, or re-running would stack a second copy of every listener
  notOk(/addEventListener\([^)]*=>/.test(b),'no inline arrow handlers — references must be stable');
});

test('the video window blocks contextmenu on its OWN document', () => {
  const b=fn('openVideoWindow');
  ok(/d\.addEventListener\('contextmenu'/.test(b),'on the window document, not just the video');
  ok(/d\.addEventListener\('contextmenu'[\s\S]{0,120}?true\)/.test(b),'in the capture phase');
  ok(/d\.addEventListener\('contextmenu'[\s\S]{0,90}?preventDefault/.test(b),'and prevented');
});

test('the video is brought home before that document is destroyed', () => {
  const b=fn('openVideoWindow');
  ok(/pagehide/.test(b)&&/beforeunload/.test(b),'both close signals are hooked');
  ok(/returnVideo\(\)/.test(b),'and they dock the video');
  ok(/vidWatch=setInterval/.test(b),'the poll stays as the fallback for a close we miss');
});

test('docking re-binds the guards, in case the window went without warning', () => {
  ok(/bindVideoGuards\(\)/.test(fn('returnVideo')));
});

test('the guards are bound once at load too', () => {
  ok(/\nbindVideoGuards\(\);/.test(SRC),'not only from returnVideo');
});
