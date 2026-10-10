// The traveller: the wanderer. Every night it goes up through its ring of mushrooms to his camp and sits by his fire with him
// (src/creature/visit.ts); it keeps the visit (a line in its diary, how many times, the last time), and speaks of him
// later. Written by whichever side sees it happen: his road when it comes, its own page when it goes. Pure.
import { addDiary, isNightFor } from './life.ts';
import type { Life, Traits } from './life.ts';
import { localHour } from '../sky.ts';

/** How the night went: he woke and sat up with it, or slept on while it kept him company. */
export type Meeting = 'woke' | 'slept';

const LINES: Readonly<Record<Meeting, readonly string[]>> = {
  woke: [
    'I went through to the traveller\'s fire. He woke and sat up, and we watched the embers together. He did not seem surprised.',
    'He woke tonight when I came. He smoked, and I sat close where it was warm. He said something to the fire, not to me.',
    'The one who walks was awake. He moved over a little to make room by the fire. I think he was glad.',
  ],
  slept: [
    'I sat by the traveller\'s fire while he slept. I kept it company until the sky above him began to grey.',
    'He slept the whole time. I watched over him, and his fire, and then I went home.',
    'I curled up by his fire. He did not wake. I hope he dreamt of somewhere warm.',
  ],
};

/**
 * Keeps a visit to the traveller: a diary line, the count, the time. Not twice in one night, nor before the last one
 * kept.
 */
export function travellerCame(life: Life, ms: number, how: Meeting): boolean {
  if (ms - life.traveller.last < 10 * 60000) return false;
  const lines = LINES[how];
  addDiary(life, ms, lines[life.traveller.times % lines.length]);
  life.diary.sort((a, b) => a.t - b.t);
  life.traveller.times++;
  life.traveller.last = ms;
  return true;
}

/** Did it visit him since it last saw you? */
export function cameWhileAway(life: Life, lastSeen: number): boolean {
  return life.traveller.last > lastSeen;
}

/** Whether it is awake at a real time, by its own hours (a night owl stays up later); asleep, it dozes by his fire. */
export function awakeAt(nightOwl: number, ms: number): boolean {
  return !isNightFor({ nightOwl } as Traits, localHour(ms));
}

