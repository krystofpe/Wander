// The local voice: lines for every situation, questions it asks, and replies when you talk to it.

/** Values for {placeholders} in lines. */
export type Vars = Readonly<Record<string, string>>;

export const LINES = {
  hello: ['...hello?', 'Oh. Someone is there.', 'Is someone... looking?'],
  askName: ['What should I call you?', 'Who are you, beyond the glass?', 'Do you have a name?'],
  nameLearned: ["{user}. I'll keep that name somewhere safe.", '{user}... it sounds like a door opening.', 'Hello, {user}. I am {name}.'],
  noName: ["That's all right. I'll call you {user}.", 'Then you are {user}, for now.'],
  backSoon: ["You're back.", 'Oh, hello again.', 'I kept your spot warm.'],
  backHours: ['{user}! You were gone {away}.', '{away}. I counted clouds while you were gone.', "There you are. It's been {away}."],
  backDays: ['{user}... you came back.', '{away}. I thought the glass had gone dark for good.', "I wandered while you were gone. I'm glad you're here."],
  lateNight: ["It's {time}. Shouldn't you be asleep, {user}?", 'The night is very deep now. Rest soon.', "You're up at {time}? So am I, apparently."],
  morning: ['Morning, {user}. The light is new.', 'Good morning. The dew is still out.'],
  focusBack: ['Oh, you looked back.', 'There you are.', 'I knew you were still there.'],
  hungry: ["I'm hungry...", 'Is there anything to eat?', 'My stomach is making a sound like thunder.'],
  full: ["I'm full, thank you.", 'Maybe later.', "I'll save it for later."],
  thanksFood: ['Thank you!', 'Oh, {food}!', 'Mm. Tastes like {season}.', '{food}! My favourite. Probably.'],
  petted: ['Hehe.', "That's nice.", 'Again?', 'Warm hands, {user}.'],
  pettedLove: ["I like it when you're here.", '♥', 'Stay a little.'],
  pettedShy: ['Oh! ...okay.', '...hi.', '!'],
  tooMuch: ['Enough, enough.', 'I need a little space.', "You're squishing my hood."],
  woken: ['Mm...? What is it?', 'I was dreaming of {item}...', 'Five more minutes...'],
  wokenGrumpy: ["It's the middle of the night!", 'Hmph.', 'Zzz... no.'],
  sleepTalk: ['mm... the fish were singing...', '...no, the other moon...', 'zz... {user}... zz', '...more {forage}...'],
  sleepy: ["I'm getting sleepy.", '*yawn*', 'My lantern is heavy.'],
  goodnight: ['Goodnight, {user}.', 'Time for the dark and the quiet.', 'Night night.'],
  wakeUp: ['Morning already?', 'I dreamt of the sea.', 'Mm. The light is back.'],
  play: ['Catch it! Catch it!', 'Wheee!', 'Got it!'],
  playAlone: ['Hop, hop.', 'Whee.', 'Look at me!'],
  bored: ["There's nothing to do...", 'Play with me?', 'I have counted every stone twice.'],
  visit: ['{user}? Are you there?', 'I wanted to see you.', 'Hello, glass. Hello, {user}.', 'Do you ever look back at me when I am not looking?'],
  knock: ['*tap tap*', 'Hello? Anyone?', '{user}... are you still there?'],
  gift: ["I found {item}. It's for you.", 'Here. {item}. Keep it safe.', 'For you: {item}.'],
  giftTaken: ['You took it! Good.', 'Now we both know where it is.', 'Keep it close.'],
  giftIgnored: ["...I'll keep it, then.", 'Maybe another time.'],
  found: ['Oh! {item}.', 'Look, {item}!', 'What is this... {item}!'],
  rainLike: ['Rain! Listen to it.', 'The rain is warm today.', 'Puddles are just small skies.'],
  rainDislike: ["Rain... I'll wait inside.", "I don't like being wet.", 'Not this again.'],
  snow: ['Snow! Everything is quiet.', 'Each flake is different. I checked.', 'The world is being erased, softly.'],
  thunder: ['!!', 'That was loud.', 'The sky is angry about something.'],
  stargaze: ['The stars are out.', 'That one is mine. That one is yours.', 'The moon is {moon} tonight.'],
  wish: ['A falling star! I wished for... no, I cannot tell you.', 'Did you see it? Make a wish!'],
  ponder: [
    'Where does the wind go when it stops?',
    'I think the stones are older than me.',
    'If I walk far enough, do I come back from the other side?',
    'Some days I feel like a word nobody has said yet.',
    'The glass between us is very thin.',
    'I had a thought, but it flew off.',
    'Do you have a home too?',
    'I wonder what the {forage} dream about.',
    "What's it like on your side of the glass?",
    'My lantern remembers every night.',
    'Sometimes I hear typing, far away.',
    'The edge of the world is closer than it looks.',
    'I counted to a hundred. Then I forgot why.',
    'Shadows are just light taking a rest.',
  ],
  hum: ['♪', 'hm hm hmm ♪', '♫ la la ♫'],
  dig: ['Dig, dig.', "Something's down here...", 'Just a little deeper.'],
  digNothing: ['Just dirt.', 'Nothing. Nothing is also something.', 'Hm. Empty.'],
  stack: ['One more stone.', 'The cairn grows.', 'Careful... careful...'],
  cairnDone: ["It's finished. A tower for the moon.", 'Nine stones. That is enough stones.'],
  wanderOff: ["I'm going to see what's over there.", "I'll be back. Probably.", 'Wait here. Keep the light on.'],
  wanderBack: ["I'm back! I found {item}.", 'I walked to the edge of the {biome}. It was soft.', 'There is another me out there. We nodded at each other.'],
  yes: ['Me too!', 'I knew it.', 'Good. Good.'],
  no: ['Oh.', 'Hm. Fair.', "I'll remember that."],
  neverMind: ['...never mind.', 'Another time, then.'],
  startled: ['Eep!', '!!'],
  hide: ['...', '(hiding)'],
  dance: ['♪ Rain dance! ♪', 'Splish!', 'Splash!'],
  eatForage: ['Mm, {forage}.', 'Crunchy.', 'Not as good as yours, {user}.'],
  drink: ['*sip*', 'The water tastes like the sky.'],
  autumn: ['The leaves are letting go.', 'Everything is turning orange.'],
  winter: ['My breath makes little clouds.', 'The cold makes the stars sharper.'],
  spring: ['Something is growing. I can hear it.', 'Everything smells green.'],
  summer: ['The air is thick and golden.', 'Even the shadows are warm.'],
  listening: ['...', '?', 'I am listening.'],
} as const;

export type Topic = keyof typeof LINES;

/** Fills {placeholders} from `vars`; unknown ones become empty. */
export function fill(template: string, vars: Vars): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '').replace(/\s+/g, ' ').trim();
}

/** A random line for a topic, filled in. */
export function line(topic: Topic, vars: Vars, random: () => number): string {
  const options: readonly string[] = LINES[topic];
  return fill(options[Math.floor(random() * options.length)], vars);
}

export type Question = { readonly id: string; readonly text: string; readonly yes: string; readonly no: string };

/** Yes/no questions; the answer is remembered as a fact about you (yes/no completes "you …"). */
export const QUESTIONS: readonly Question[] = [
  { id: 'rain', text: 'Do you like the rain?', yes: 'likes the rain', no: 'does not like the rain' },
  { id: 'night', text: 'Are you a night creature too?', yes: 'is a night creature', no: 'is a day creature' },
  { id: 'sea', text: 'Have you ever seen the sea?', yes: 'has seen the sea', no: 'has never seen the sea' },
  { id: 'others', text: 'Are there others like you out there?', yes: 'says there are others like them', no: 'thinks they are one of a kind' },
  { id: 'tea', text: 'Do you drink tea?', yes: 'drinks tea', no: 'does not drink tea' },
  { id: 'stars', text: 'Can you see stars where you are?', yes: 'can see stars at home', no: 'cannot see stars at home' },
  { id: 'pets', text: 'Do you keep other creatures, on your side?', yes: 'keeps other creatures', no: 'keeps no other creatures' },
  { id: 'music', text: 'Do you like music?', yes: 'likes music', no: 'is not fond of music' },
  { id: 'snow', text: 'Have you ever touched snow?', yes: 'has touched snow', no: 'has never touched snow' },
  { id: 'typing', text: 'All that typing I hear... is it work?', yes: 'types for work', no: 'types for fun' },
  { id: 'dreams', text: 'Do you remember your dreams?', yes: 'remembers their dreams', no: 'forgets their dreams' },
  { id: 'far', text: 'Do you live far from here?', yes: 'lives far away', no: 'lives close by' },
  { id: 'lantern', text: 'Do you have a lantern too?', yes: 'has a lantern too', no: 'has no lantern' },
  { id: 'happy', text: 'Are you happy today?', yes: 'was happy on {date}', no: 'was sad on {date}' },
];

/** An unasked question, or null when all are asked. */
export function nextQuestion(asked: readonly string[], random: () => number): Question | null {
  const left = QUESTIONS.filter((q) => !asked.includes(q.id) || q.id === 'happy');
  if (left.length === 0) return null;
  return left[Math.floor(random() * left.length)];
}

/** What it does in answer to something you said: words, maybe an activity, maybe your name. */
export type LocalReply = { readonly say: string; readonly do: string | null; readonly userName: string | null };

const strip = (s: string): string => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

const NAME = /\b(?:my name is|my name's|call me|i am called|jmenuj[iu] se|rikej mi)\s+([\p{L}][\p{L}'-]{0,23})/u;

/** Keyword replies, when Claude is not there. `context` carries mood words and whether it is tired, hungry, etc. */
export function localReply(
  text: string,
  vars: Vars,
  context: { readonly mood: string; readonly hungry: boolean; readonly tired: boolean; readonly bored: boolean; readonly bond: number; readonly night: boolean },
  random: () => number,
): LocalReply {
  const pick = (xs: readonly string[]): string => fill(xs[Math.floor(random() * xs.length)], vars);
  const t = strip(text);
  const name = NAME.exec(strip(text));
  if (name !== null) {
    const bare = (w: string): string => w.replace(/[^\p{L}'-]/gu, '');
    const original = text.normalize('NFC').split(/\s+/).find((w) => strip(bare(w)) === name[1]) ?? name[1];
    const clean = bare(original);
    const user = clean.charAt(0).toUpperCase() + clean.slice(1);
    return { say: fill(pick(LINES.nameLearned), { ...vars, user }), do: 'wave', userName: user };
  }
  const reply = (say: readonly string[], act: string | null = null): LocalReply => ({ say: pick(say), do: act, userName: null });
  const willing = context.bond > 0.3 || random() < 0.5;
  if (/^(ahoj|cau|nazdar|dobry den|zdravim)\b/.test(t)) return reply(['Ahoj, {user}!', 'Ahoj! Ahoj.'], 'wave');
  if (/^(hi|hello|hey|yo|hiya|greetings|good (morning|evening|afternoon))\b/.test(t)) return reply(['Hello, {user}!', 'Hi! Hi.', 'Oh, hello.'], 'wave');
  if (/how are you|how do you feel|how's it going|jak se mas|jak je/.test(t)) {
    const extra = context.hungry ? ' A little hungry.' : context.tired ? ' A little sleepy.' : context.bored ? ' A little bored.' : '';
    return { say: `I'm ${context.mood}.${extra}`, do: null, userName: null };
  }
  if (/who are you|what are you|kdo jsi|co jsi/.test(t)) {
    return reply(["I'm {name}. I live here, behind the glass.", 'Just a small light in a hood.', "I'm not sure. I was a wisp, once."]);
  }
  if (/your name|jak se jmenujes/.test(t)) return reply(['{name}. Did you forget already?', "It's {name}."]);
  if (/love you|like you|mam te rad|mam te rada/.test(t)) {
    return context.bond > 0.5 ? reply(['♥ I know. Me too, {user}.', '...♥'], 'jump') : reply(['...really? Oh.', 'Oh! My hood is warm.'], 'jump');
  }
  if (/hungry|food|eat|jidlo|hlad|papat/.test(t)) {
    return context.hungry ? reply(['Yes! Something to eat, please.', 'So hungry. Press F, maybe?']) : reply(["I'm not hungry, but thank you.", 'I ate {forage} earlier.']);
  }
  if (/\bplay\b|game|hra|hrat|pohraj/.test(t)) {
    return willing ? reply(["Yes! Let's play!", 'Throw me the light!'], 'play') : reply(['Maybe later.', "I'm not in the mood."]);
  }
  if (/danc|tanc|tancuj/.test(t)) return willing ? reply(['♪ Like this? ♪', 'Watch me!'], 'dance') : reply(['Not now.', "I don't dance for just anyone."]);
  if (/sleep|bed|nap|spat|spinkat|dobrou/.test(t)) {
    return context.night || context.tired ? reply(['Goodnight, {user}.', 'Yes... sleep...'], 'sleep') : reply(["But it's still light out!", 'Not tired yet.']);
  }
  if (/come here|come closer|\bcome\b|pojd|pojdsem/.test(t)) {
    return willing ? reply(['Coming!', 'Here I am.'], 'visit') : reply(['...from here is fine.', 'I can see you from here.'], 'hide');
  }
  if (/\bdig\b|kopej/.test(t)) return reply(['Dig? Okay!'], 'dig');
  if (/bye|goodbye|see you|good night|nashledanou|mej se/.test(t)) return reply(['Bye, {user}. Come back soon.', 'I will keep the lantern lit.'], 'wave');
  if (/thank|thanks|diky|dekuju|dekuji/.test(t)) return reply(["You're welcome.", 'Any time.']);
  if (/weather|rain|snow|sunny|pocasi|prsi/.test(t)) return reply(["It's {weather} here.", 'Here? {weather}. And there?']);
  if (/what time|time is it|kolik je/.test(t)) return reply(["It's {time}. Here, at least.", '{time}, by the moon.']);
  if (/\b(sad|tired|bad day|lonely|smutn|unaven)/.test(t)) return reply(['Sit with me for a while.', "I'm here. I'm always here."], 'visit');
  if (t.includes('?')) {
    return reply(['I don\'t know. But I like that you asked.', 'Maybe. The stones would know.', 'Yes. No. Both?', 'Ask me again when the moon is full.']);
  }
  const words = text.split(/[^\p{L}\p{N}'-]+/u).filter((w) => w.length > 3);
  if (words.length > 0 && random() < 0.6) {
    const word = words.sort((a, b) => b.length - a.length)[0].toLowerCase();
    return reply(['{word}... I will think about {word}.', 'Hm. {word}.', 'Tell me more about {word}.'].map((s) => s.replaceAll('{word}', word)));
  }
  return reply(["I'm listening.", 'Mm-hm.', 'The wind says the same thing.']);
}

/** How the moon looks in words. */
export function moonWords(phase: number): string {
  const p = phase > 0.5 ? 1 - phase : phase; // 0 new … 0.5 full
  if (p < 0.04) return 'hiding';
  if (p < 0.18) return 'a thin smile';
  if (p < 0.32) return 'half';
  if (p < 0.46) return 'almost full';
  return 'full';
}
