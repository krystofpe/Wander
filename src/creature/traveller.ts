// The traveller: the wanderer, when his road passes the creature's hollow (one world, two lives). He sits by its door a
// while and smokes; it keeps the visit (a line in its diary, how many times, the last time), and speaks of him later.
// Written by whichever side sees it happen: his page when he sits there, the hollow when he comes by. Pure.
import { addDiary, isNightFor } from './life.ts';
import type { Life, Traits } from './life.ts';
import { localHour } from '../sky.ts';

/**
 * How it was when they met: it sat with him by day, watched him from the dark doorway, or slept through it (at its
 * door); or it went up to sit by his fire on the road in the evening.
 */
export type Meeting = 'day' | 'night' | 'asleep' | 'fire';

const LINES: Readonly<Record<Meeting, readonly string[]>> = {
  day: [
    'The traveller in the long coat came by. He sat by my door and smoked, and did not say much. Neither did I.',
    'He came again, the one who walks. We sat on the root together until his smoke was gone.',
    'The traveller stopped at my door. He smelled of rain and far places. I sat with him.',
  ],
  night: [
    'Someone sat by my door in the dark and smoked. I watched him from inside. He knew I was there.',
    'The traveller came in the night. I stayed in the doorway. He nodded at the dark, at me.',
  ],
  asleep: [
    'In the morning there was ash on the root by my door. He came while I slept.',
    'Someone sat at my door in the night. I only found the ash.',
  ],
  fire: [
    'I went up through my door and sat across his fire. He did not say much. Neither did I. It was warm.',
    'Tonight I found his fire on the road and sat with him. He smoked. I watched the sparks go up.',
    'I kept his fire company while he slept. Then I came home before the dark got deep.',
  ],
};

/** Whether it is awake at a real time, by its own hours (a night owl stays up later): it only visits awake. */
export function awakeAt(nightOwl: number, ms: number): boolean {
  return !isNightFor({ nightOwl } as Traits, localHour(ms));
}

/**
 * Keeps a visit from the traveller: a diary line, the count, the time. Not twice for the same sitting, nor before the
 * last one kept; one found later (he came while the window was closed) goes into the diary where it happened.
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

/** Did he come since it last saw you? */
export function cameWhileAway(life: Life, lastSeen: number): boolean {
  return life.traveller.last > lastSeen;
}
