// The local voice: lines for every situation, questions it asks, and replies when you talk to it.

/** Values for {placeholders} in lines. */
export type Vars = Readonly<Record<string, string>>;

export const LINES = {
  hello: ['...someone?', 'Oh. There is someone there.', 'Is that... a light?'],
  askName: ['What are you called?', 'Who are you, out there?', 'Do you have a name? I have almost forgotten mine.'],
  nameLearned: ['{user}. I will keep that.', '{user}... I will say it when it is dark.', '{user}. Then I am {name}.'],
  noName: ['All right. {user}, then.', 'Then you are {user}. For now.'],
  backSoon: ['...you came back.', 'Oh. You.', 'I thought the glass had gone dark.'],
  backHours: ['{away}. I counted.', 'You were gone {away}. It got cold.', 'There you are. {away}.'],
  backDays: ['{user}. It has been {away}.', '{away}. I stopped looking at the glass. I am looking now.', 'I went walking while you were gone. I came back anyway.'],
  lateNight: ["It's {time}. You should sleep, {user}.", 'The night is very deep now.', "{time}. Neither of us is sleeping, then."],
  morning: ['Morning. The light is thin.', 'It is day again, {user}.'],
  focusBack: ['...there you are.', 'I thought you had gone.', 'Still here.'],
  hungry: ["I'm hungry.", 'Is there anything left to eat?', 'My stomach is quiet now. That is worse.'],
  full: ['Enough. Thank you.', 'Later, maybe.', 'I will keep it for later.'],
  thanksFood: ['Thank you.', 'Oh. {food}.', 'It tastes like {season}.', '{food}. I had forgotten these.'],
  petted: ['...', 'That is... all right.', 'Again. If you want.', 'Your hands are warm, {user}.'],
  pettedLove: ['Stay a little.', '♥', 'It is easier when you are here.'],
  pettedShy: ['Oh. ...all right.', '...hello.', '!'],
  tooMuch: ['Enough.', 'I need a little room.', 'You are crushing my wings.'],
  woken: ['Mm... what is it?', 'I was dreaming about {item}.', 'A little longer.'],
  wokenGrumpy: ["It's the middle of the night.", 'Hmph.', 'No.'],
  sleepTalk: ['mm... the fish were singing...', '...no, the other moon...', 'zz... {user}... zz', '...more {forage}...'],
  sleepy: ["I'm tired.", '*yawn*', 'The lantern is heavy tonight.'],
  goodnight: ['Goodnight, {user}.', 'The dark, now. And the quiet.', 'Keep the light on, if you can.'],
  wakeUp: ['Morning already.', 'I dreamt of the sea. I have never seen it.', 'Mm. The light is back.'],
  play: ['...catch it.', 'Ha.', 'Got it.'],
  playAlone: ['Hop.', 'Hm.', 'Nobody saw that.'],
  bored: ['There is nothing to do.', 'Play? If you want.', 'I have counted every stone twice.'],
  visit: ['{user}? Are you there?', 'I wanted to see you.', 'Hello, glass. Hello, {user}.', 'Do you look at me when I am not looking?'],
  knock: ['*tap tap*', 'Hello? ...anyone?', '{user}... are you still there?'],
  gift: ['I found {item}. It is for you.', 'Here. {item}. Keep it safe.', 'For you. {item}.'],
  giftTaken: ['Good. Now we both know where it is.', 'Keep it close.', 'Good.'],
  giftIgnored: ['...I will keep it, then.', 'Another time.'],
  found: ['Oh. {item}.', '{item}. Here, of all places.', 'What is this... {item}.'],
  rainLike: ['Rain. Listen.', 'The rain is warm today.', 'Puddles are small skies.'],
  rainDislike: ['Rain... I will wait inside.', 'Not again.', 'The rags will not dry for days.'],
  snow: ['Snow. Everything is quiet.', 'Each flake is different. I checked.', 'The world is being erased, softly.'],
  thunder: ['!!', 'That was close.', 'The sky is angry about something.'],
  stargaze: ['The stars are out.', 'That one is mine. That one is yours.', 'The moon is {moon} tonight.'],
  visitor: ['...did you see it too?', 'It did not look at us.', 'It comes when the light is low. I think it is looking for something.', 'Gone again.', 'I do not think it knows we are here.'],
  wish: ['A falling star. I wished for... no. I cannot say.', 'Did you see it? Wish.'],
  ponder: [
    'Where does the wind go when it stops?',
    'The stones are older than me. They do not say so.',
    'If I walked far enough, would I come back from the other side?',
    'Some days I feel like a word nobody has said yet.',
    'The glass between us is very thin.',
    'I had a thought. It flew off.',
    'Do you have a home too? A real one.',
    'I wonder what the {forage} dream about.',
    "What is it like on your side of the glass?",
    'My lantern remembers every night.',
    'Sometimes I hear typing, far away.',
    'The edge of the world is closer than it looks.',
    'I counted to a hundred. Then I forgot why.',
    'Shadows are just light, resting.',
    'There used to be others. I think.',
    'If the light goes out, will you still be there?',
  ],
  hum: ['♪', 'hm... hm... ♪', '♫ ...la ♫'],
  dig: ['Dig. Dig.', 'Something is down here...', 'A little deeper.'],
  digNothing: ['Just dirt.', 'Nothing. Nothing is also something.', 'Hm. Empty.'],
  stack: ['One more stone.', 'The cairn grows.', 'Careful... careful.'],
  cairnDone: ['It is finished. A tower for the moon.', 'Nine stones. That is enough stones.'],
  wanderOff: ['I am going to see what is over there.', 'I will be back. Probably.', 'Wait here. Keep the light on.'],
  wanderBack: ['I am back. I found {item}.', 'I walked to the edge of the {biome}. It was soft.', 'There is another one of me out there. We did not speak.'],
  yes: ['Me too.', 'I thought so.', 'Good.'],
  no: ['Oh.', 'Hm.', 'I will remember that.'],
  neverMind: ['...never mind.', 'Another time.'],
  startled: ['!', '!!'],
  hide: ['...', '(hiding)'],
  dance: ['♪ ...rain ♪', 'Splish.', 'Splash.'],
  eatForage: ['Mm. {forage}.', 'Crunchy.', 'Not as good as yours, {user}.'],
  drink: ['*sip*', 'The water tastes like the sky.'],
  autumn: ['The leaves are letting go.', 'Everything is turning.'],
  winter: ['My breath makes small clouds.', 'The cold makes the stars sharper.'],
  spring: ['Something is growing. I can hear it.', 'It smells green.'],
  summer: ['The air is thick.', 'Even the shadows are warm today.'],
  listening: ['...', '?', 'I am listening.'],
  // The traveller: the one who walks the endless road and now and then sits at its door.
  travellerBack: ['The traveller came while you were gone. He sat at my door.', 'He came by again, the one who walks. You missed him.', 'There was a man in a long coat here. He smoked. I think he is lonely too.'],
  traveller: ['I think about the one who walks. Where does he sleep?', 'The traveller never says where he is going. Maybe he does not know.', 'He leaves a little ash and a little quiet. I keep both.', 'If he comes again, I will show him the cairn.'],
  travellerHere: ['...it is him.', 'The one who walks.', 'Shh. He is resting.'],
  fireside: ['His fire is lit up there. I will go and sit with him.', 'I can smell his fire through the door.', 'The traveller is camping. He should not be alone.'],
  firesideBack: ['He is asleep. I kept his fire a while.', 'His fire was warm.', 'I sat with him. He did not mind.'],
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
    return reply(["I'm {name}. I live here, behind the glass.", 'Just a small light in a mask.', "I'm not sure. I was a wisp, once."]);
  }
  if (/your name|jak se jmenujes/.test(t)) return reply(['{name}. Did you forget already?', "It's {name}."]);
  if (/love you|like you|mam te rad|mam te rada/.test(t)) {
    return context.bond > 0.5 ? reply(['♥ I know. Me too, {user}.', '...♥'], 'jump') : reply(['...really? Oh.', 'Oh! My mask is warm.'], 'jump');
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
