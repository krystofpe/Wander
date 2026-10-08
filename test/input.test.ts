import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InputParser, parseInput } from '../src/input.ts';
import type { InputEvent } from '../src/input.ts';

const show = (events: InputEvent[]): string[] =>
  events.map((e) => {
    if (e.type === 'char') return `char:${e.ch}`;
    if (e.type === 'key') return `key:${e.key}`;
    if (e.type === 'focus') return `focus:${e.on}`;
    return `mouse:${e.action}:${e.button}@${e.col},${e.row}`;
  });

test('text keeps its case and any script, one event per character', () => {
  assert.deepEqual(show(parseInput('Hi Kryštof!').events), ['char:H', 'char:i', 'char: ', 'char:K', 'char:r', 'char:y', 'char:š', 'char:t', 'char:o', 'char:f', 'char:!']);
});

test('enter, backspace, tab and the control keys', () => {
  assert.deepEqual(show(parseInput('\r\n\x7f\b\t\x03\x15\x17\x1a').events), [
    'key:enter', 'key:enter', 'key:backspace', 'key:backspace', 'key:tab', 'key:ctrl-c', 'key:ctrl-u', 'key:ctrl-w', 'key:ctrl-z',
  ]);
});

test('arrows in both forms, delete, a lone Esc, and Alt+key ignored', () => {
  assert.deepEqual(show(parseInput('\x1b[A\x1bOB\x1b[1;2C\x1b[3~').events), ['key:up', 'key:down', 'key:right', 'key:delete']);
  assert.deepEqual(show(parseInput('\x1b').events), ['key:escape']);
  assert.deepEqual(show(parseInput('\x1b\x1b').events), ['key:escape', 'key:escape']);
  assert.deepEqual(show(parseInput('\x1bx').events), []);
});

test('SGR mouse: press, motion and release, 0-based; the wheel is dropped', () => {
  assert.deepEqual(show(parseInput('\x1b[<0;10;5M\x1b[<35;11;6M\x1b[<0;10;5m\x1b[<64;3;3M').events), [
    'mouse:press:0@9,4',
    'mouse:move:3@10,5',
    'mouse:release:0@9,4',
  ]);
});

test('focus in and out', () => {
  assert.deepEqual(show(parseInput('\x1b[I\x1b[O').events), ['focus:true', 'focus:false']);
});

test('a sequence split across reads waits for its end', () => {
  const p = new InputParser();
  assert.deepEqual(show(p.feed('a\x1b[<0;1')), ['char:a']);
  assert.deepEqual(show(p.feed('2;3M')), ['mouse:press:0@11,2']);
  assert.deepEqual(show(p.feed('\x1bO')), []);
  assert.deepEqual(show(p.feed('A')), ['key:up']);
});
