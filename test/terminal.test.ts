import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { ENTER, LEAVE, Terminal } from '../src/terminal.ts';

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

test('open enters full screen with mouse and focus reports, in raw mode', () => {
  const { stdin, stdout, term } = fake();
  term.open();
  assert.equal(stdout.written, ENTER);
  assert.ok(ENTER.includes('\x1b[?1003h') && ENTER.includes('\x1b[?1006h') && ENTER.includes('\x1b[?1004h'));
  assert.deepEqual(stdin.raw, [true]);
  assert.equal(term.cols, 100);
  assert.equal(term.rows, 30);
});

test('restore runs once and turns everything back off', () => {
  const { stdin, stdout, term } = fake();
  term.open();
  term.restore();
  term.restore();
  assert.equal(stdout.written.split(LEAVE).length - 1, 1);
  assert.ok(LEAVE.includes('\x1b[?1003l') && LEAVE.includes('\x1b[?1006l') && LEAVE.includes('\x1b[?1004l'));
  assert.deepEqual(stdin.raw, [true, false]);
  term.write('late frame');
  assert.ok(stdout.written.endsWith(LEAVE), 'nothing is drawn after restoring');
});

test('a kill signal restores the terminal and exits with 143', () => {
  const { stdout, proc, term } = fake();
  term.open();
  proc.emit('SIGTERM');
  assert.ok(stdout.written.endsWith(LEAVE));
  assert.deepEqual(proc.codes, [143]);
});

test('a crash restores the terminal, reports the error and exits with 1', () => {
  const { stdout, stderr, proc, term } = fake();
  term.open();
  proc.emit('uncaughtException', new Error('boom'));
  assert.ok(LEAVE.startsWith('\x1b[?2026l'), 'a half-sent frame is ended');
  assert.ok(stdout.written.endsWith(LEAVE));
  assert.match(stderr.written, /boom/);
  assert.deepEqual(proc.codes, [1]);
});

test('leaving through process exit restores the terminal', () => {
  const { stdin, stdout, proc, term } = fake();
  term.open();
  proc.emit('exit', 0);
  assert.ok(stdout.written.endsWith(LEAVE));
  assert.deepEqual(stdin.raw, [true, false]);
});

test('a terminal that disappears ends the game quietly', () => {
  const { stdout, proc, term } = fake();
  term.open();
  stdout.write = () => {
    throw new Error('EIO');
  };
  term.write('frame');
  assert.deepEqual(proc.codes, [0]);
  term.restore(); // nothing left to restore, and it must not throw
});
