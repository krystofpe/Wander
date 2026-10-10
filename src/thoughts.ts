// His thoughts when no Claude is there to think them: lines for the place, the hour, the weather, what he is
// doing and what he left behind. Pure: the same context and random numbers give the same line.
import { hash2, rng } from './noise.ts';

export type DayPhase = 'dawn' | 'morning' | 'noon' | 'afternoon' | 'golden' | 'dusk' | 'blue' | 'night' | 'late';
export type Sky = 'clear' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm';
export type Doing = 'walking' | 'looking' | 'sitting' | 'smoking' | 'sheltering' | 'camp' | 'waking';

/** What is around him when a thought comes. */
export type ThoughtContext = {
  /** The journey's seed: it fixes the people and places he left. */
  readonly seed: number;
  /** The biome he is mostly in, by id (see biomes.ts). */
  readonly biome: string;
  readonly phase: DayPhase;
  readonly sky: Sky;
  readonly windy: boolean;
  readonly cold: boolean;
  readonly doing: Doing;
  /** A landmark in sight, by kind, or null. */
  readonly near: string | null;
  /** Days on the road, from 1. */
  readonly day: number;
  /** Cigarettes smoked since `since`. */
  readonly cigarettes: number;
  /** The last place worth naming that he passed ("the river"), or null. */
  readonly since: string | null;
  /** 0 new moon … 0.5 full … 1 new again. */
  readonly moon: number;
};

type Person = { readonly name: string; readonly who: string; readonly sub: string; readonly obj: string; readonly pos: string };

const SHE = { sub: 'she', obj: 'her', pos: 'her' } as const;
const HE = { sub: 'he', obj: 'him', pos: 'his' } as const;

const PEOPLE: readonly Person[] = [
  { name: 'Mara', who: 'my sister', ...SHE },
  { name: 'Ilse', who: 'my mother', ...SHE },
  { name: 'Vera', who: 'the woman I lived with', ...SHE },
  { name: 'Hana', who: 'an old friend', ...SHE },
  { name: 'Lida', who: 'the girl next door, years ago', ...SHE },
  { name: 'Agnes', who: 'my grandmother', ...SHE },
  { name: 'Nora', who: 'the woman from the ferry office', ...SHE },
  { name: 'Rosa', who: 'my aunt', ...SHE },
  { name: 'Tomas', who: 'my brother', ...HE },
  { name: 'Anton', who: 'my father', ...HE },
  { name: 'Jonah', who: 'an old friend', ...HE },
  { name: 'Marek', who: 'the man who taught me to fish', ...HE },
  { name: 'Karel', who: 'my uncle', ...HE },
  { name: 'Teo', who: 'the boy I grew up with', ...HE },
  { name: 'Elias', who: 'the night porter at the hotel', ...HE },
  { name: 'Petr', who: 'my oldest friend', ...HE },
];

const PLACES: readonly string[] = [
  'the flat above the bakery',
  'the town by the reservoir',
  'the house on Linden Street',
  'the harbour town',
  'the farm past the quarry',
  "my grandmother's house",
  'the room with the green curtains',
  'the street where the trams turned',
  'the village with one bus a day',
  'the house by the railway',
  'the flat on the ninth floor',
  'the town with the broken clock',
];

const KEEPSAKES: readonly string[] = [
  'the lighter',
  'a letter I never sent',
  'a photograph gone soft at the corners',
  'the key to the old flat',
  'a stone from the beach',
  'a train ticket, used',
];

/** Small habits of the people he left; a memory can come back as any of them. */
const HABITS: readonly string[] = [
  'leave the radio on all night',
  'set out two cups out of habit',
  'read the paper aloud to nobody',
  'feed the pigeons from the window',
  'whistle the same four notes',
  'fall asleep in the chair with the light on',
  'count the trains going past',
  'keep the good plates for guests who never came',
  'hum while washing up',
  'mend things that were not broken',
  'save string in a kitchen drawer',
  'write lists and lose them',
  'talk to the cat like a person',
  'check the locks twice',
  'leave notes on the table instead of saying things',
  'walk down to the river on Sundays',
  'laugh at the wrong part of films',
  'warm their hands on the kettle',
];

/** What carries at night, far off. */
const NIGHT_SOUNDS: readonly string[] = [
  'An owl',
  'A fox',
  'A branch giving way',
  'Water running',
  'The wind in the rocks',
  'Something in the grass',
  'A stone falling',
  'A bird I do not know',
];

const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];

/** The life he left: fixed by the journey's seed, so the same people come back to him. */
export type Past = { readonly people: readonly Person[]; readonly places: readonly string[]; readonly keepsake: string };

export function pastOf(seed: number): Past {
  const random = rng(hash2(seed, 0x9a57, 0x7e11));
  const pick = <T>(from: readonly T[], n: number): T[] => {
    const pool = [...from];
    const out: T[] = [];
    for (let i = 0; i < n && pool.length > 0; i++) out.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
    return out;
  };
  // Three people, never two with the same part in his life.
  const people: Person[] = [];
  for (const p of pick(PEOPLE, PEOPLE.length)) {
    if (people.length < 3 && !people.some((q) => q.who === p.who)) people.push(p);
  }
  return { people, places: pick(PLACES, 2), keepsake: pick(KEEPSAKES, 1)[0] };
}

type When = (c: ThoughtContext) => boolean;
type Group = { readonly when: When; readonly weight: number; readonly lines: readonly string[] };

const night = (c: ThoughtContext): boolean => c.phase === 'night' || c.phase === 'late';
const wet = (c: ThoughtContext): boolean => c.sky === 'rain' || c.sky === 'storm';

const GROUPS: readonly Group[] = [
  // ── The road ──
  {
    when: (c) => c.doing === 'walking',
    weight: 1,
    lines: [
      'I keep thinking the next rise will show me something. It shows me the next rise.',
      'Nobody knows where I am. I used to think that was the point.',
      'Some days the walking does the thinking for me.',
      'I counted steps for a while. Lost count somewhere before the last hill.',
      "{person} would have wanted to stop by now. {Sub} always knew when to stop.",
      '{person} walked too fast. I fell behind on purpose, to watch {obj} go on ahead.',
      'Day {day}. Or {dayBefore}. I stopped being sure.',
      'My shadow and I agree on the direction, at least.',
      'The road bends like it has somewhere better to be.',
      'I have stopped expecting to arrive. It helps.',
      'A little further. I have been saying that for {day} days.',
      'There are places I only know from walking past them. That is most places now.',
      'When I stop, the quiet catches up with me.',
      'I used to know what day of the week it was. It never mattered as much as I thought.',
      'If someone asked where I was going I would have to make something up.',
      "I walk the way {person} taught me. Heel first, eyes up, never on the boots.",
    ],
  },
  // ── People and places left behind ──
  {
    when: () => true,
    weight: 1.4,
    lines: [
      '{person} used to hum when the kettle was on. I cannot remember the tune now.',
      'I left {place} with a window open. I wonder if anyone closed it.',
      '{person} said I would be back within a month. That was a long month ago.',
      'The last thing {person} said to me was about the weather. It should have been something else.',
      'I still have {keepsake}. I never know whether to keep it or leave it on a stone somewhere.',
      'There was a dog in {place} that followed me to the station. I did not look back. I should have.',
      'I could still find my way around {place} in the dark. It does not help out here.',
      '{who} would know the name of that bird.',
      '{person2} owes me a book. I owe {person2obj} a letter. Neither of us will pay.',
      'I dreamt of {place} again. Everyone was there, and nobody turned round.',
      '{person} kept every bus ticket. I thought it was foolish. I would like one of them now.',
      'Sometimes I talk to {person} in my head. {Sub} is kinder there than {sub} ever was.',
      "I can't remember if I told {person} I was going. I think I did. I think I said it badly.",
      'The kitchen in {place} smelled of oranges in winter. Strange what stays.',
      '{who} used to say a man should know where he sleeps tonight. I never do.',
      'Somebody else lives in {place} now. Their furniture, their arguments.',
      "{person} wrote {pos} number on my hand once. It washed off before I'd decided anything.",
      'I am older now than {who} was when I left.',
      'If I wrote to {person}, I would not know what address to put on the back.',
      'I keep meaning to forget {place}. It keeps not happening.',
      '{person} and I sat like this once, on the harbour wall. We did not say much then either.',
      'Every lit window I remember looks like the one in {place}.',
    ],
  },
  // ── Habits: any of his people, any small thing they did ──
  {
    when: () => true,
    weight: 1.2,
    lines: [
      '{anyone} used to {habit}. I did not know I would miss that.',
      'In {place}, {anyone} would {habit}. Odd what comes back out here.',
      'I caught myself about to {habit}, like {anyone}. Out here, of all places.',
    ],
  },
  {
    when: night,
    weight: 0.8,
    lines: ['{sound}, far off. Then nothing.', '{sound} somewhere behind me. I do not turn round.'],
  },
  // ── Dawn and morning ──
  {
    when: (c) => c.phase === 'dawn',
    weight: 2,
    lines: [
      'First light. The cold is worst just before it.',
      'The birds start before the sun. They always know first.',
      'Mornings I can almost believe I am going somewhere.',
      'The light comes back the same way every morning. Grey, then less grey.',
      'Another night got through. That counts for something.',
      'Dew on everything. Even my sleeve.',
      '{person} hated mornings. I would bring {obj} tea and {sub} would pretend to be asleep.',
    ],
  },
  {
    when: (c) => c.phase === 'morning' || c.phase === 'noon',
    weight: 1,
    lines: [
      'The sun is up and nobody has asked anything of me yet.',
      'A whole day ahead and nothing in it but road.',
      'By noon everything looks flat and honest.',
      'Warm on one side, cold on the other. Like most of my life.',
    ],
  },
  {
    when: (c) => c.phase === 'afternoon',
    weight: 1,
    lines: [
      'Afternoons are the longest part of a day. Nobody warned me.',
      "The light's getting heavier. A few hours yet.",
      'This is the hour {place} went quiet, when everyone was at work but me.',
    ],
  },
  {
    when: (c) => c.phase === 'golden',
    weight: 2,
    lines: [
      'Everything looks like it is remembering something in this light.',
      'Long shadows. Mine is taller than I ever was.',
      'This light makes even the thistles look important.',
      '{person} would have stopped to take a picture. I just stand here.',
      'The sun is low enough to look at the land sideways.',
    ],
  },
  {
    when: (c) => c.phase === 'dusk',
    weight: 2,
    lines: [
      'Should find somewhere to stop before the light goes.',
      'The sky does this every evening and there is nobody to see it but me.',
      'The colour goes out of the grass first, then out of everything.',
      'In {place} they would be turning the lamps on about now.',
      'One more hill, then I look for wood.',
    ],
  },
  {
    when: (c) => c.phase === 'blue',
    weight: 2,
    lines: [
      'That blue between the sun and the dark. {person} had a name for it.',
      'Everything goes the colour of cold water.',
      'The first star, or a plane. Out here I let it be a star.',
      'Blue hour. The quietest the world gets before it gets darker.',
    ],
  },
  {
    when: night,
    weight: 1.6,
    lines: [
      'The stars are the same ones I saw from {place}. That is something.',
      'So quiet I can hear my own blood.',
      'Somewhere a fox is barking at nothing. Or at me.',
      'The dark here is a different dark than in towns. It goes all the way down.',
      'I used to be afraid of nights like this. Now they are the only company that stays.',
      'I can see further at night than in the day. Just not anything close.',
      '{person} is asleep somewhere under this same sky. Or awake. I would not know.',
    ],
  },
  {
    when: (c) => c.phase === 'late',
    weight: 1.6,
    lines: [
      "Can't sleep. Can't think of anything worth staying awake for either.",
      'The worst hour. Too late for yesterday, too early for tomorrow.',
      'Every sound at this hour sounds like someone coming.',
    ],
  },
  {
    when: (c) => night(c) && c.sky === 'clear' && c.moon > 0.4 && c.moon < 0.6,
    weight: 3,
    lines: [
      'Full moon. Bright enough to read by, if I had anything to read.',
      'The moon is so bright tonight it throws my shadow.',
      'Under a moon like this {place} looked like an old photograph.',
    ],
  },
  {
    when: (c) => night(c) && c.sky === 'clear' && (c.moon < 0.08 || c.moon > 0.92),
    weight: 3,
    lines: [
      'No moon. The stars come right down to the ground.',
      'So many stars. Most of them are probably gone already.',
      'Dark of the moon. I can barely see my own hands.',
    ],
  },
  // ── Weather ──
  {
    when: wet,
    weight: 2.4,
    lines: [
      'Rain finds its way through everything. Even this coat, eventually.',
      'The rain sounds different on every kind of ground.',
      "I'll wait it out. The road isn't going anywhere.",
      'Wet to the knees. The rest of me is thinking about it.',
      'Rain like this, {person} would put the radio on and not listen to it.',
      'Everything smells of wet stone and old leaves.',
      'The rain makes the world smaller. Just me and the next few trees.',
    ],
  },
  {
    when: (c) => c.sky === 'storm',
    weight: 3,
    lines: [
      'Thunder far off. Counting the seconds like when I was a boy.',
      'The sky is having the argument I never had.',
      'Lightning. For a second I could see the whole valley, and nobody in it.',
    ],
  },
  {
    when: (c) => c.sky === 'fog',
    weight: 3,
    lines: [
      "Can't see more than thirty steps. Doesn't change much.",
      'In fog every tree looks like someone waiting.',
      'The fog swallows the sound of my boots. I could be anyone.',
      'Somewhere in this fog there is a road I am supposed to be on.',
      'Fog like the mornings in {place}, when the ferry horn went and went.',
    ],
  },
  {
    when: (c) => c.sky === 'snow',
    weight: 3,
    lines: [
      'Snow makes it so quiet I can hear the cigarette burn.',
      'My footprints fill in behind me. Nobody could follow if they tried.',
      'Snow on my sleeves. It does not melt anymore. That is probably a bad sign.',
      '{person} would have made me stop and look at it. All right. I am looking.',
    ],
  },
  {
    when: (c) => c.windy,
    weight: 1.6,
    lines: [
      'The wind keeps trying to turn me around.',
      'Wind in the coat like a hand on my back. Or a push.',
      'The wind comes from somewhere I have already been.',
    ],
  },
  {
    when: (c) => c.cold && !wet(c),
    weight: 1.2,
    lines: [
      'Cold in the fingers first, then in the thoughts.',
      'My breath goes ahead of me like it knows the way.',
      'Cold enough that the ground rings under my boots.',
    ],
  },
  {
    when: (c) => c.sky === 'clear' && !night(c) && !c.cold,
    weight: 0.8,
    lines: ['Not a cloud. The sky looks rinsed.', 'A good day for walking. I am not sure I have earned it.'],
  },
  // ── What he is doing ──
  {
    when: (c) => c.doing === 'smoking',
    weight: 3,
    lines: [
      '{Ordinal} cigarette since {since}. I keep promising myself fewer, and then promising again.',
      '{person} made me smoke by the window. I still lean towards one that is not there.',
      'The smoke goes wherever the wind goes. It makes it look easy.',
      'One more, then I walk on.',
      'A few left. I could ration them. I probably will not.',
      'The lighter still works. Some things just keep going.',
      'Smoke and breath, the same grey out here.',
      'I started smoking to have something to do with my hands in {place}.',
    ],
  },
  {
    when: (c) => c.doing === 'sitting',
    weight: 2.2,
    lines: [
      'Sitting still, the land stops moving too.',
      'My legs are glad. The rest of me is not sure.',
      'If I sit long enough maybe something will happen. It has not yet.',
      'This is a good place to sit. Maybe nobody ever sat here before me.',
    ],
  },
  {
    when: (c) => c.doing === 'looking',
    weight: 2.2,
    lines: [
      'From here I can see where I will be tomorrow.',
      'All that land and not one road I know.',
      'I should remember this. I will not, but I should.',
      'A view like this ought to mean something. Maybe it means itself.',
      '{person} would have said something about the light. I just look at it.',
    ],
  },
  {
    when: (c) => c.doing === 'sheltering',
    weight: 2.6,
    lines: [
      'Under here the rain is just a sound.',
      'Dry, more or less. I will take more or less.',
      'Waiting is a skill. I am getting good at it.',
    ],
  },
  {
    when: (c) => c.doing === 'camp',
    weight: 2.6,
    lines: [
      'A fire makes a room out of nothing.',
      'The fire is the only thing out here that answers.',
      'Dry wood for once.',
      'Tomorrow I walk until the land changes again.',
      'Sparks go up and keep going. I watch until I lose them.',
      '{person} could sit by a fire for hours and not say a word. I understand that now.',
      'The dark comes right up to the edge of the light and waits.',
      'My boots are steaming. That is as close to home as it gets.',
    ],
  },
  {
    when: (c) => c.doing === 'waking',
    weight: 3,
    lines: [
      'Ashes, and the cold back in my knees. Morning, then.',
      'Dreamt of {place}. Woke up here. Both felt real for a while.',
      'Packed in a minute. Everything I own is easy to carry.',
    ],
  },
  // ── Biomes ──
  { when: (c) => c.biome === 'pine', weight: 2, lines: ['Smells of resin and old rain.', 'Needles under my boots. Soft as a held breath.', 'The pines keep their own counsel.', 'Under the pines it is evening all day.'] },
  { when: (c) => c.biome === 'birch', weight: 2, lines: ['White trunks in the dark. Like people standing very still.', 'Birches peel like old paint on a door.', 'The birch leaves talk all the time and never say anything.'] },
  { when: (c) => c.biome === 'meadow', weight: 2, lines: ['Nothing but grass and the sound of it.', 'A whole field and not one fence.', 'The grass leans over to see who is passing.'] },
  { when: (c) => c.biome === 'autumn', weight: 2, lines: ['Everything here is letting go of something.', "The leaves are the colour of {person}'s old coat.", 'Leaves underfoot. Every step says it out loud.'] },
  { when: (c) => c.biome === 'plateau', weight: 2, lines: ['Up here the sky does most of the talking.', 'Flat for miles. I am the tallest thing on it.', 'So much sky it makes my coat feel thin.'] },
  { when: (c) => c.biome === 'pass', weight: 2, lines: ['The air is thin. Every thought takes longer to finish.', 'Scree all the way down. The mountain is coming apart slowly, like everything.', 'The mountains do not care who crosses. That is almost a comfort.'] },
  { when: (c) => c.biome === 'coast', weight: 2, lines: ['The sea keeps saying the same thing. Maybe it has to.', 'Salt on my lips. Like the summer in {place}.', 'Waves coming in, one after another, as if they were sent.'] },
  { when: (c) => c.biome === 'desert', weight: 2, lines: ['Nothing grows tall enough here to sit in its shade.', 'The mesas look like the ruins of something too big to remember.', 'Sand in my boots. It has come a long way to be there.'] },
  { when: (c) => c.biome === 'tundra', weight: 2, lines: ['White everywhere. Hard to tell how far anything is.', 'The snow creaks. It is the only thing out here that complains.', 'Out here the horizon is the only landmark.'] },
  { when: (c) => c.biome === 'swamp', weight: 2, lines: ["The ground isn't sure it is ground here.", 'Frogs, then nothing, then frogs again.', 'Dead trees standing in the water like they are waiting for a boat.'] },
  { when: (c) => c.biome === 'saltflat', weight: 2, lines: ['Walking on the floor of a sea that left.', 'White to the edge of the world, and my shadow the only thing on it.', 'The salt cracks into the same shapes everywhere. As if it were trying to remember one.'] },
  { when: (c) => c.biome === 'stones', weight: 2, lines: ['The ice brought every stone here and went away. Nobody came for them either.', 'Every stone on this moor came from somewhere else. I know how that is.', 'Old stones, older than any name for them.'] },
  // ── Landmarks ──
  { when: (c) => c.near === 'skeleton', weight: 5, lines: ['Whatever it was, it was big, and it lay down here, and that was that.', 'Bones as tall as a house. I am glad I never met it.', 'Nobody came to bury it. Nobody comes out here for anything.'] },
  { when: (c) => c.near === 'lonetree', weight: 5, lines: ['One tree, on its own up there. It has had a long time to get used to that.', 'Everything that grew beside that tree is gone. It puts out leaves anyway.', '{person} would have climbed it. I just want to sit under it until I am as old as it is.'] },
  { when: (c) => c.near === 'arch', weight: 5, lines: ['The rain wore a hole through the hill. It had all the time in the world.', 'Sky through the stone. I stand and look at it the way {person} looked at windows.', 'It took ten thousand years to make that, and nobody here to see it done.'] },
  { when: (c) => c.near === 'erratic', weight: 5, lines: ['The ice carried that stone a hundred miles and left it. It has been waiting ever since.', 'A boulder the size of a house, alone in the grass. Lichen on the cold side, warmth on the other.', 'It came a long way to be left. So did I.'] },
  { when: (c) => c.near === 'fallen', weight: 5, lines: ['A hundred years to grow and one night to fall. I wonder if anything heard it.', 'Its roots in the air, holding on to the earth they pulled up. I know the feeling.', 'Moss and ferns growing all along it. Even lying down it is doing better than me.'] },
  { when: (c) => c.near === 'tor', weight: 5, lines: ['Stone stacked on stone, and nobody stacked it. The weather took away everything else.', 'A heap of old rock, the bones of a hill. The wind comes round it and keeps going.', 'One stone balanced on another for a thousand years. It makes my own troubles look light.'] },
  { when: (c) => c.near === 'waterfall', weight: 5, lines: ['The water goes over the edge as if it had decided to. It does not look back.', 'All that noise, and none of it meant for anyone.', '{person} would have stood in the spray and laughed. I stand at the edge of it.'] },
  { when: (c) => c.near === 'stacks', weight: 5, lines: ['Rocks standing out in the sea, cut off from the land a long time ago. They do not seem to mind.', 'The sea works at those stacks every day. One day it will win. It is in no hurry.', 'Birds on the tallest stack, and the sea going round it.'] },
  { when: (c) => c.near === 'spires', weight: 5, lines: ['Towers of stone, and nobody built them. The wind took away the hill and left these.', 'Bands of rock, one on another, each a different age. They go back to before anyone.', 'In this light the spires look like people waiting. They are not.'] },
  { when: (c) => c.near === 'snag', weight: 5, lines: ['A dead tree standing in the water, looking at itself. It has been doing that a long time.', 'The water came up round it and it stayed. Stubborn, or just too slow to leave.', 'Grey and bare and still standing. There are worse ways to end up.'] },
];

const pickWeighted = <T extends { weight: number }>(items: readonly T[], r: number): T => {
  let total = 0;
  for (const it of items) total += it.weight;
  let x = r * total;
  for (const it of items) {
    x -= it.weight;
    if (x < 0) return it;
  }
  return items[items.length - 1];
};

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Fills {placeholders} in a line for this context and past. */
export function fill(line: string, c: ThoughtContext, past: Past, random: () => number): string {
  const p = past.people[0];
  const p2 = past.people[1];
  const place = past.places[Math.floor(random() * past.places.length)];
  const n = Math.max(1, Math.min(10, c.cigarettes));
  const anyone = past.people[Math.floor(random() * past.people.length)];
  const vars: Record<string, string> = {
    person: p.name,
    who: p.who,
    Who: cap(p.who),
    sub: p.sub,
    Sub: cap(p.sub),
    obj: p.obj,
    pos: p.pos,
    person2: p2.name,
    person2obj: p2.obj,
    anyone: anyone.name,
    habit: HABITS[Math.floor(random() * HABITS.length)],
    sound: NIGHT_SOUNDS[Math.floor(random() * NIGHT_SOUNDS.length)],
    place,
    keepsake: past.keepsake,
    day: String(c.day),
    dayBefore: String(Math.max(1, c.day - 1)),
    Ordinal: ORDINALS[n - 1],
    since: c.since ?? 'the morning',
  };
  return line.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

/** Every line that fits the context, with its weight; used by `localThought` and by tests. */
export function candidates(c: ThoughtContext): { line: string; weight: number }[] {
  const out: { line: string; weight: number }[] = [];
  for (const g of GROUPS) {
    if (!g.when(c)) continue;
    // A line needing a cigarette count or a place passed is skipped when there is none to give.
    for (const line of g.lines) {
      if (line.includes('{Ordinal}') && (c.cigarettes < 2 || c.since === null)) continue;
      out.push({ line, weight: g.weight / g.lines.length });
    }
  }
  return out;
}

/**
 * A thought for this moment. `recent` holds lines said lately (filled), which are not repeated; the specific
 * (a landmark, the weather, what he is doing) weighs more than the general.
 */
export function localThought(c: ThoughtContext, random: () => number, recent: readonly string[] = []): string {
  const past = pastOf(c.seed);
  const all = candidates(c);
  for (let attempt = 0; attempt < 12; attempt++) {
    const line = fill(pickWeighted(all, random()).line, c, past, random);
    if (!recent.includes(line)) return line;
  }
  return fill(pickWeighted(all, random()).line, c, past, random);
}

/** Every distinct line the generator can say for some context, for tests and counting. */
export function allTemplates(): string[] {
  return GROUPS.flatMap((g) => g.lines);
}
