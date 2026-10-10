// The creature's things, drawn by hand at its scale (it is 23 px tall): what grows and stands round its home (ferns, a
// bush in berry, glowing mushrooms, a stone and a stump to sit on, a pond, reeds, a snowdrift, its cairn), what it eats,
// plays with and carries (five foods, the glowing toy, a find, a stone, its lantern), the small signs above its head
// (hearts, notes, sleep, ? and !, sparks, dirt, drops, a falling star), and the small lives about it (butterflies,
// moths, a frog, a hare, an owl, and the tall one that walks through the dark). Legend in ../legend.ts.
import { unit } from '../../../src/noise.ts';
import type { Sheet } from '../legend.ts';

type Tag = Sheet['tags'][number];
const one = (name: string, rows: readonly string[], ms = 1000): Tag => ({ name, ms, frames: [rows] });
/** A sheet whose rows are padded with clear pixels to its width (the drawings leave trailing clear off). */
const sheet = (name: string, w: number, h: number, tags: readonly Tag[]): Sheet => ({
  name,
  w,
  h,
  tags: tags.map((t) => ({ ...t, frames: t.frames.map((rows) => rows.map((r) => r.padEnd(w, '.').slice(0, w))) })),
});

// ── Props ──────────────────────────────────────────────────────────────────

const FERN = sheet('fern', 16, 12, [
  one('a', [
    '.......7........',
    '...7...M7...7...',
    '..7M7..YM..7M...',
    '...YM7.YM.7MY...',
    '....YM.YM.MY..7.',
    '.7...YMYMMY..7M.',
    '.M7...MYMY..7MY.',
    '..YM7.MYYM.7MY..',
    '...YMMMYYMMMY...',
    '....YYMVVMYY....',
    '.....VVVVVV.....',
    '......V..V......',
  ]),
  one('b', [
    '................',
    '..........7.....',
    '....7....7M.....',
    '...7M...7MY..7..',
    '...MY7.7MY..7M..',
    '....YM7MY..7MY..',
    '.7..YMMY..7MY...',
    '.M7..YMYM7MY....',
    '..YM7YMYMMY.....',
    '...YMMYVMY......',
    '....VVVVV.......',
    '.....V..V.......',
  ]),
]);

const BUSH = sheet('bush', 24, 16, [
  one('berries', [
    '.........MYY7...........',
    '......MMYY77YM..........',
    '....MYYY7Y77YYM.MY7.....',
    '...MY7YY+YY7YYMMYY77M...',
    '..MYY77YYYY+Y7YYYYY7YM..',
    '..MY7YY&YY7YYY7Y+YYYYM..',
    '.MYYY7YYYY77Y&YYYY77YYM.',
    '.MY+YY77YYYYYYY7YYYY+YM.',
    'MYYY7YYY&YYYY7YYY7YYYYYM',
    'MYY7YYYYYY+YYYYYYYY&YYYM',
    'MMYYYY7YYYYYYY&YYYY7YYMM',
    '.MMYYYYYY+YYYYYYYYYYYMM.',
    '..MMMYYYYYYYYYYY+YYMMM..',
    '...VMMMMYYYYYYYYMMMMV...',
    '....VVVMMMMMMMMMMVVV....',
    '......VVV..)(..VVV......',
  ]),
]);

const SHROOMS = sheet('shrooms', 10, 9, [
  one('a', [
    '...$$$....',
    '..$@@@$...',
    '..#@@@#.$.',
    '....U..$@$',
    '....U...U.',
    '..$.U...U.',
    '.#@#U...U.',
    '..U.U..U..',
    '..U.U..U..',
  ]),
  one('b', [
    '..........',
    '.....$$...',
    '....$@@$..',
    '.$..#@@#..',
    '$@$..UU...',
    '#@#..U....',
    '.U...U..$.',
    '.U..U..#@#',
    '.U..U...U.',
  ]),
]);

const MUSHROOMS = sheet('mushrooms', 10, 7, [
  one('a', [
    '..DDD.....',
    '.DEEED....',
    'CDDDDDC.D.',
    '...U..DED.',
    '...U..CDC.',
    '...U...U..',
    '..UUU.UU..',
  ]),
]);

const ROCK = sheet('rock', 16, 9, [
  one('a', [
    '.....nNN?.......',
    '...nnNNN??N.....',
    '..nnNNNN?NNN....',
    '.nnnNNNNNNNNN...',
    '"nnnnNNNNNNNNN..',
    '"nnnnnNNNNNNNNN.',
    '""nnnnnnNNNNNNN.',
    '""nnnnnnnnnNNNn.',
    '.""""""nnnnnnn..',
  ]),
]);

const STUMP = sheet('stump', 14, 11, [
  one('a', [
    '...TTTTTTT....',
    '..TyyTTTyyT...',
    '.)TTyyyyyTT[..',
    '.)(TTTTTTT[[..',
    '.)()))[[[[][..',
    '.)()))[[[][[..',
    '.)())[[[[][[..',
    '.)()))[[[[][..',
    '))())[[[[[][].',
    ')()))[[[[[][[]',
    '((())))[[[[[[[',
  ]),
]);

const SNOWDRIFT = sheet('drift', 22, 8, [
  one('a', [
    '........}||}..........',
    '.....}}}}|||||}.......',
    '...{}}}}}}||||||}.....',
    '..{{}}}}}}}}||||||}...',
    '.{{{}}}}}}}}}}||||||}.',
    '{{{{{}}}}}}}}}}}|||}}}',
    '{{{{{{}}}}}}}}}}}}}}}{',
    '.{{{{{{{{{{{{{{{{{{{{.',
  ]),
]);

const REEDS = sheet('reeds', 12, 18, [
  one('a', [
    '..-.........',
    '..-.....-...',
    '.__..-..-...',
    '.__..-..__..',
    '.__..-..__..',
    '..9..__.__..',
    '..9..__..9..',
    '..9...9..9..',
    '.9....9..9.9',
    '.9...9...9.9',
    '.9...9..9..9',
    '.9...9..9.9.',
    '9...9...9.9.',
    '9...9..9..9.',
    '9..9...9.9..',
    '0..9..0..9..',
    '0.0..0..0...',
    '00.00..00...',
  ]),
]);

/** A pond: an oval of water darkest at its far edge, a rim of grass behind and stones at the near side. */
function pond(): string[] {
  const W = 46;
  const H = 10;
  const out: string[] = [];
  for (let y = 0; y < H; y++) {
    let row = '';
    for (let x = 0; x < W; x++) {
      const dx = (x - W / 2 + 0.5) / (W / 2);
      const dy = (y - H / 2 + 0.5) / (H / 2);
      const d = dx * dx + dy * dy;
      if (d > 1) row += '.';
      else if (d > 0.78) row += dy < 0 ? (unit(x, 0x90d) > 0.5 ? '9' : '0') : unit(x * 3 + y, 0x90e) > 0.55 ? 'n' : '"';
      else if (dy < -0.35) row += '`';
      else if (dy < 0.15) row += unit(x * 5 + y, 0x90f) > 0.82 ? 'P' : "'";
      else row += unit(x * 7 + y, 0x910) > 0.7 ? 'Q' : 'P';
    }
    out.push(row);
  }
  return out;
}
const POND = sheet('pond', 46, 10, [one('a', pond())]);

/** The cairn with n stones (1–9): each a little smaller than the one below, set a little off true. */
function cairn(n: number): string[] {
  const W = 14;
  const H = 30;
  const g = Array.from({ length: H }, () => new Array<string>(W).fill('.'));
  let base = H;
  for (let i = 0; i < n; i++) {
    const w = Math.max(4, 12 - i);
    const h = i < 3 ? 4 : 3;
    const off = Math.round((unit(i, 0xca1) - 0.5) * 2);
    const x0 = Math.round((W - w) / 2) + off;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const corner = (y === 0 || y === h - 1) && (x === 0 || x === w - 1);
        if (corner) continue;
        const lit = x > w * 0.55 || y === 0;
        g[base - h + y][x0 + x] = y === h - 1 ? '"' : lit ? (unit(x + i * 17, 0xca2) > 0.6 ? '?' : 'N') : 'n';
      }
    base -= h;
  }
  return g.map((r) => r.join(''));
}
const CAIRN = sheet('cairn', 14, 30, Array.from({ length: 9 }, (_, i) => one(String(i + 1), cairn(i + 1))));

// ── Food, the toy, what it carries ─────────────────────────────────────────

const FOOD = sheet('food', 5, 5, [
  one('berry', ['.....', '..&+.', '.%&+.', '.%%&.', '.....']),
  one('dewdrop', ['..Q..', ".'Q'.", ".'PQ.", "..'..", '.....']),
  one('starcrumb', ['.....', '..!..', '.!!!.', '..!..', '.....']),
  one('seedcake', ['.....', '.-_-.', '_-_-_', 'tttt.', '.....']),
  one('moonpear', ['..k..', '.U,..', 'U,UU.', 'UU,U.', '.UU..']),
]);

const TOY = sheet('toy', 6, 6, [
  {
    name: 'glow',
    ms: [500, 500],
    frames: [
      ['.~~~..', '~^^~~.', '~^~~~.', '~~~~~.', '.~~~..', '......'],
      ['.~~~..', '~~^^~.', '~~^~~.', '~~~~~.', '.~~~..', '......'],
    ],
  },
]);

const CARRY = sheet('carry', 5, 7, [
  one('find', ['.....', '..!..', '.!!!.', '!!!!!', '.!!!.', '..!..', '.....']),
  one('stone', ['.....', '.....', '.....', '.nN?.', 'nnNN?', '"nnN.', '.....']),
  one('lantern', ['.ZZ..', '.S...', 'SZZS.', 'SgiS.', 'SigS.', 'SZZS.', '.SS..']),
  one('dark', ['.ZZ..', '.S...', 'SZZS.', 'SGGS.', 'SGGS.', 'SZZS.', '.SS..']),
]);

// ── Signs ──────────────────────────────────────────────────────────────────

const SIGNS = sheet('signs', 5, 5, [
  one('heart', ['<<.<<', '<<<<<', '.<<<.', '..<..', '.....']),
  one('note', ['..>>>', '..>.>', '..>..', '>>>..', '>>>..']),
  one('z', ['.....', 'www..', '.w...', 'www..', '.....']),
  one('Z', ['wwww.', '..w..', '.w...', 'wwww.', '.....']),
  one('ask', ['UUU..', '..U..', '.UU..', '.....', '.U...']),
  one('bang', ['.U...', '.U...', '.U...', '.....', '.U...']),
  one('dots', ['.....', '.....', '.....', '.....', 'U.U.U']),
  one('spark', ['.....', '..!..', '.!!!.', '..!..', '.....']),
  one('dirt', ['.....', '.....', '..aA.', '...a.', '.....']),
  one('drop', ['.....', ".'...", '.Q...', '.....', '.....']),
]);

const STREAK = sheet('streak', 12, 5, [one('a', ['!...........', '.!!.........', '...!!!......', '......!!!...', '.........!!!'])]);

// ── Small lives ────────────────────────────────────────────────────────────

const BUTTERFLY = sheet('butterfly', 5, 4, [
  {
    name: 'fly',
    ms: [140, 140],
    frames: [
      [',;.;,', ',;o;,', '.:o:.', '.....'],
      ['.....', '.;o;.', '.:o:.', '..:..'],
    ],
  },
]);

const MOTH = sheet('moth', 5, 4, [
  {
    name: 'fly',
    ms: [90, 90],
    frames: [
      ['ww.ww', 'wvovw', '.vov.', '.....'],
      ['.....', '.wov.', '.vov.', '..v..'],
    ],
  },
]);

const FROG = sheet('frog', 8, 6, [
  {
    name: 'sit',
    ms: [1600, 200],
    frames: [
      ['........', '..U..U..', '.YMYYMY.', 'MYY7YYYM', 'M7YYYY7M', '.MM..MM.'],
      ['........', '..M..M..', '.YMYYMY.', 'MYY7YYYM', 'M7YYYY7M', '.MM..MM.'],
    ],
  },
  {
    name: 'hop',
    ms: 160,
    frames: [
      ['..U..U..', '.YMYYMY.', 'MYY7YYYM', '.M7YY7M.', 'M.M..M.M', '........'],
      ['........', '..U..U..', '.YMYYMYM', 'MYY7YYM.', 'MM....MM', '........'],
    ],
  },
]);

const HARE = sheet('hare', 14, 11, [
  {
    name: 'sit',
    ms: [1800, 300, 1400],
    frames: [
      ['..........34..', '..........34..', '..........23..', '.........2334.', '.........23U3.', '...2233332333.', '..23333333332.', '.4233333333..', '.12333333331..', '..1222222221..', '...11....11...'],
      ['...........34.', '..........34..', '..........23..', '.........2334.', '.........23U3.', '...2233332333.', '..23333333332.', '.4233333333..', '.12333333331..', '..1222222221..', '...11....11...'],
      ['..........34..', '..........34..', '..........23..', '.........2334.', '.........2333.', '...2233332333.', '..23333333332.', '.4233333333..', '.12333333331..', '..1222222221..', '...11....11...'],
    ],
  },
  {
    name: 'hop',
    ms: 120,
    frames: [
      ['..............', '...........34.', '..........34..', '.........2334.', '........23U33.', '..223333323333', '.2333333333333', '42333333333...', '1233333331....', '.11......11...', '..............'],
      ['..............', '..............', '...........34.', '..........234.', '.........23U3.', '..22333333333.', '.2333333333332.', '4233333333..1.', '.123333331....', '1........11...', '..............'].map((r) => r.slice(0, 14)),
    ],
  },
]);

const OWL = sheet('owl', 9, 12, [
  {
    name: 'perch',
    ms: [2600, 150, 1800, 1400],
    frames: [
      ['..1...1..', '.12...21.', '.1233321.', '12e323e21', '1233U3321', '.1234321.', '.1243421.', '.1234321.', '..14341..', '..12321..', '.kkKKKkk.', '...1.1...'],
      ['..1...1..', '.12...21.', '.1233321.', '123333321', '1233U3321', '.1234321.', '.1243421.', '.1234321.', '..14341..', '..12321..', '.kkKKKkk.', '...1.1...'],
      ['..1...1..', '.12...21.', '.1233321.', '1233e3e21', '12333U321', '.1234321.', '.1243421.', '.1234321.', '..14341..', '..12321..', '.kkKKKkk.', '...1.1...'],
      ['..1...1..', '.12...21.', '.1233321.', '12e3e3321', '123U33321', '.1234321.', '.1243421.', '.1234321.', '..14341..', '..12321..', '.kkKKKkk.', '...1.1...'],
    ],
  },
]);

/** The tall one: a gaunt shape, long-limbed, walking slowly; nothing of it but its outline in the dark. */
function visitor(step: number): string[] {
  const W = 12;
  const H = 46;
  const g = Array.from({ length: H }, () => new Array<string>(W).fill('.'));
  const put = (x: number, y: number, c = 'h'): void => {
    if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = c;
  };
  // Head, small and high; shoulders narrow; a long body; long legs in a slow stride.
  for (let y = 0; y < 5; y++) for (let x = 4; x < 7; x++) put(x, y);
  put(5, 5);
  for (let y = 6; y < 26; y++) for (let x = 3; x < 8 - (y > 18 ? 1 : 0); x++) put(x, y, x === 3 ? 'o' : 'h');
  const sway = step === 0 ? 1 : -1;
  for (let y = 7; y < 30; y++) {
    put(2 - (y > 20 && sway > 0 ? 1 : 0), y, 'o');
    put(8 + (y > 20 && sway < 0 ? 1 : 0), y);
  }
  for (let y = 26; y < H; y++) {
    const t = (y - 26) / (H - 26);
    put(Math.round(4 - sway * t * 2), y);
    put(Math.round(6 + sway * t * 2), y);
  }
  return g.map((r) => r.join(''));
}
const VISITOR = sheet('visitor', 12, 46, [{ name: 'walk', ms: 900, frames: [visitor(0), visitor(1)] }]);

export const SHEET = FERN;
export const MORE: readonly Sheet[] = [BUSH, SHROOMS, MUSHROOMS, ROCK, STUMP, SNOWDRIFT, REEDS, POND, CAIRN, FOOD, TOY, CARRY, SIGNS, STREAK, BUTTERFLY, MOTH, FROG, HARE, OWL, VISITOR];
