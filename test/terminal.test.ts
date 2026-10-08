import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { ENTER, LEAVE, POP_KEYS, PUSH_KEYS, QUERY, Terminal } from '../src/terminal.ts';

class FakeIn extends EventEmitter {
  raw: boolean[] = [];
  setRawMode(on: boolean): void {
    this.raw.push(on);
  }
  setEncoding(): void {}
  resume(): void {}
  pause(): void {}
}

class FakeOut extends EventEmitter {
  written = '';
  columns = 100;
  rows = 30;
  write(text: string): boolean {
    this.written += text;
    return true;
  }
}

class FakeProc extends EventEmitter {
  codes: number[] = [];
  exit(code: number): void {
    this.codes.push(code);
  }
}

function fake() {
  const stdin = new FakeIn();
  const stdout = new FakeOut();
  const stderr = new FakeOut();
  const proc = new FakeProc();
  return { stdin, stdout, stderr, proc, term: new Terminal({ stdin, stdout, stderr, proc }) };
}

test('open enters full screen, asks about held keys and turns them on when supported', async () => {
  const { stdin, stdout, term } = fake();
  const opening = term.open(500);
  stdin.emit('data', '\x1b[?0u\x1b[?62;22c');
  await opening;
  assert.equal(term.kitty, true);
  assert.equal(stdout.written, ENTER + QUERY + PUSH_KEYS);
  assert.deepEqual(stdin.raw, [true]);
  assert.equal(term.cols, 100);
  assert.equal(term.rows, 30);
});

test('a device-attributes reply alone means no held-key support', async () => {
  const { stdin, stdout, term } = fake();
  const opening = term.open(500);
  stdin.emit('data', '\x1b[?62;22c');
  await opening;
  assert.equal(term.kitty, false);
  assert.equal(stdout.written, ENTER + QUERY);
});

test('no reply at all falls back after the timeout', async () => {
  const { term } = fake();
  await term.open(20);
  assert.equal(term.kitty, false);
});

test('a reply split across reads is still understood', async () => {
  const { stdin, term } = fake();
  const opening = term.open(500);
  stdin.emit('data', '\x1b[?');
  stdin.emit('data', '1u');
  await opening;
  assert.equal(term.kitty, true);
});

test('restore runs once and puts everything back', async () => {
  const { stdin, stdout, term } = fake();
  const opening = term.open(500);
  stdin.emit('data', '\x1b[?1u');
  await opening;
  term.restore();
  term.restore();
  assert.equal(stdout.written.split(LEAVE).length - 1, 1);
  assert.ok(stdout.written.endsWith(POP_KEYS + LEAVE));
  assert.deepEqual(stdin.raw, [true, false]);
  term.write('late frame');
  assert.ok(stdout.written.endsWith(LEAVE), 'nothing is drawn after restoring');
});

test('a kill signal restores the terminal and exits with 143', async () => {
  const { stdin, stdout, proc, term } = fake();
  const opening = term.open(500);
  stdin.emit('data', '\x1b[?62c');
  await opening;
  proc.emit('SIGTERM');
  assert.ok(stdout.written.endsWith(LEAVE));
  assert.deepEqual(proc.codes, [143]);
});

test('a crash while waiting for the reply restores the terminal and exits with 1', async () => {
  const { stdout, stderr, proc, term } = fake();
  const opening = term.open(30);
  proc.emit('uncaughtException', new Error('boom'));
  assert.ok(LEAVE.startsWith('\x1b[?2026l'), 'a half-sent frame is ended');
  assert.ok(stdout.written.endsWith(LEAVE));
  assert.match(stderr.written, /boom/);
  assert.deepEqual(proc.codes, [1]);
  await opening;
});

test('leaving through process exit restores the terminal', async () => {
  const { stdin, stdout, proc, term } = fake();
  const opening = term.open(500);
  stdin.emit('data', '\x1b[?62c');
  await opening;
  proc.emit('exit', 0);
  assert.ok(stdout.written.endsWith(LEAVE));
  assert.deepEqual(stdin.raw, [true, false]);
});

test('a terminal that disappears ends the game quietly', async () => {
  const { stdin, stdout, proc, term } = fake();
  const opening = term.open(500);
  stdin.emit('data', '\x1b[?62c');
  await opening;
  stdout.write = () => {
    throw new Error('EIO');
  };
  term.write('frame');
  assert.deepEqual(proc.codes, [0]);
  term.restore(); // nothing left to restore, and it must not throw
});
