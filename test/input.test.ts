import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InputState, parseKeys, readDetection } from '../src/input.ts';

const keys = (text: string): string[] =>
  parseKeys(text).events.map((e) => `${e.key}:${e.type}${e.shift ? ':shift' : ''}`);

test('held-key reporting: a letter is pressed, repeats and is released', () => {
  assert.deepEqual(keys('\x1b[119u\x1b[119;1:2u\x1b[119;1:3u'), ['w:press', 'w:repeat', 'w:release']);
});

test('held-key reporting: Shift, Ctrl-C, Esc, and caps lock ignored', () => {
  assert.deepEqual(keys('\x1b[57441;2u\x1b[100;2u\x1b[57441;1:3u'), ['shift:press:shift', 'd:press:shift', 'shift:release']);
  assert.deepEqual(keys('\x1b[99;5u'), ['ctrl-c:press']);
  assert.deepEqual(keys('\x1b[27u'), ['escape:press']);
  assert.deepEqual(keys('\x1b[119;65u'), ['w:press']);
});

test('held-key reporting: arrows with and without modifiers', () => {
  assert.deepEqual(keys('\x1b[A\x1b[1;1:2A\x1b[1;1:3A\x1b[1;2C'), ['up:press', 'up:repeat', 'up:release', 'right:press:shift']);
});

test('plain terminals: letters, shifted letters, arrows, Ctrl-C and Esc', () => {
  assert.deepEqual(keys('wW\x1b[D\x1b[1;2B\x03'), ['w:press', 'w:press:shift', 'left:press', 'down:press:shift', 'ctrl-c:press']);
  assert.deepEqual(keys('\x1b'), ['escape:press']);
  assert.deepEqual(keys('\x1bOA'), ['up:press']);
});

test('alt+key is not escape', () => {
  assert.deepEqual(keys('\x1bw'), []);
});

test('two escapes in one read are two escapes', () => {
  assert.deepEqual(keys('\x1b\x1b'), ['escape:press', 'escape:press']);
});

test('query replies are not keys', () => {
  assert.deepEqual(keys('\x1b[?1u\x1b[?62;22c'), []);
});

test('an unfinished sequence waits for the next read', () => {
  const r = parseKeys('w\x1b[11');
  assert.deepEqual(r.events.map((e) => e.key), ['w']);
  assert.equal(r.rest, '\x1b[11');
  const input = new InputState(true);
  input.feed('\x1b[11', 0);
  input.feed('9u', 0);
  assert.equal(input.intent(1).dy, -1);
});

test('held keys move you until released (held-key reporting)', () => {
  const input = new InputState(true);
  input.feed('\x1b[119u', 0);
  assert.deepEqual(input.intent(5000), { dx: 0, dy: -1, run: false, fastTime: false });
  input.feed('\x1b[119;1:3u', 5000);
  assert.equal(input.intent(5001).dy, 0);
});

test('Shift runs while held, and T speeds up time while held', () => {
  const input = new InputState(true);
  input.feed('\x1b[57441;2u\x1b[116u', 0);
  assert.equal(input.intent(10).run, true);
  assert.equal(input.intent(10).fastTime, true);
  input.feed('\x1b[57441;1:3u\x1b[116;1:3u', 20);
  assert.equal(input.intent(30).run, false);
  assert.equal(input.intent(30).fastTime, false);
});

test('opposite keys cancel out', () => {
  const input = new InputState(true);
  input.feed('\x1b[119u\x1b[115u\x1b[100u', 0);
  assert.deepEqual(input.intent(1), { dx: 1, dy: 0, run: false, fastTime: false });
});

test('plain terminals: held for 550 ms after a press and 120 ms after each repeat', () => {
  const input = new InputState(false);
  input.feed('d', 0);
  assert.equal(input.intent(549).dx, 1);
  assert.equal(input.intent(551).dx, 0);
  input.feed('d', 1000); // a new press: held until 1550
  input.feed('d', 1400); // auto-repeat starts
  input.feed('d', 1490); // held until 1610
  assert.equal(input.intent(1600).dx, 1);
  assert.equal(input.intent(1611).dx, 0);
});

test('plain terminals: a shifted letter runs, an unshifted one walks', () => {
  const input = new InputState(false);
  input.feed('D', 0);
  assert.equal(input.intent(10).run, true);
  input.feed('d', 20);
  assert.equal(input.intent(30).run, false);
});

test('quit and status-bar actions', () => {
  const plain = new InputState(false);
  plain.feed('q', 0);
  assert.deepEqual(plain.takeActions(), ['quit']);
  assert.deepEqual(plain.takeActions(), []);
  plain.feed('h', 0);
  plain.feed('h', 400); // auto-repeat of the same press: no second toggle
  assert.deepEqual(plain.takeActions(), ['toggleHud']);
  const kitty = new InputState(true);
  kitty.feed('\x1b[104u\x1b[104;1:2u\x1b[104;1:3u\x1b[104u', 0);
  assert.deepEqual(kitty.takeActions(), ['toggleHud', 'toggleHud']);
  kitty.feed('\x1b[27u\x1b[99;5u', 0);
  assert.deepEqual(kitty.takeActions(), ['quit', 'quit']);
});

test('detection replies', () => {
  assert.equal(readDetection(''), 'waiting');
  assert.equal(readDetection('\x1b[?'), 'waiting');
  assert.equal(readDetection('\x1b[?1u'), 'supported');
  assert.equal(readDetection('\x1b[?0u\x1b[?62;22c'), 'supported');
  assert.equal(readDetection('\x1b[?62;22c'), 'unsupported');
  assert.equal(readDetection('\x1b[?62;22c\x1b[?1u'), 'unsupported');
});

test('in kitty mode, plain text never holds a key for good', () => {
  const input = new InputState(true);
  input.feed('w', 0); // pasted or plain text: no release will ever come
  assert.equal(input.intent(10).dy, -1);
  assert.equal(input.intent(600).dy, 0);
  input.feed('D', 1000);
  assert.equal(input.intent(1010).run, true);
  assert.equal(input.intent(1600).run, false);
  input.feed('h', 2000);
  assert.deepEqual(input.takeActions(), ['toggleHud']);
  input.feed('\x1b[104u', 2700); // a real press after the guessed hold has lapsed toggles again
  assert.deepEqual(input.takeActions(), ['toggleHud']);
});
