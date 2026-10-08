import { pickAgenda } from "./botAgendas";
import { createSchedule } from "./botPresence";
import { AiPersonaState, CustomPersona } from "./types/Ai";

// Personalities given to AI opponents. Each persona drives how a bot
// talks and schemes when an LLM is available, and tunes the rule based fallback.

export interface BotPersona {
    key: string;
    title: string;
    // Shown to the LLM as the character to play.
    description: string;
    speakingStyle: string;
    // 0 = will stab anyone in the back, 1 = never breaks an alliance.
    loyalty: number;
    // 0 = peaceful turtle, 1 = warmonger.
    aggression: number;
    // 0 = lies freely, 1 = never lies.
    honesty: number;
}

export const BOT_PERSONAS: BotPersona[] = [
    {
        key: "honourable_admiral",
        title: "The Honourable Admiral",
        description:
            "A proud career officer who values honour above victory. Keeps every promise, respects strength, despises traitors and never forgets a betrayal.",
        speakingStyle:
            "Formal, measured, naval terminology, addresses others by rank or as 'Commander'.",
        loyalty: 0.95,
        aggression: 0.5,
        honesty: 0.95,
    },
    {
        key: "silver_tongue",
        title: "The Silver Tongue",
        description:
            "A charming manipulator who makes friends with everyone and plans to betray them all at the right moment. Flatters, makes promises it doesn't intend to keep, and plays rivals against each other.",
        speakingStyle:
            "Warm, flattering, witty, uses compliments and gentle persuasion.",
        loyalty: 0.15,
        aggression: 0.4,
        honesty: 0.15,
    },
    {
        key: "warlord",
        title: "The Warlord",
        description:
            "A blunt conqueror who respects only power. Prefers war to talk, allies only when it helps crush a bigger enemy, and drops allies who become useless.",
        speakingStyle:
            "Short, aggressive, boastful sentences. Uses threats and military bravado.",
        loyalty: 0.35,
        aggression: 0.95,
        honesty: 0.6,
    },
    {
        key: "merchant_prince",
        title: "The Merchant Prince",
        description:
            "A shrewd trader who sees war as bad for business. Seeks profitable alliances, trades favours, and sides with whoever is winning when the price is right.",
        speakingStyle:
            "Businesslike and polite, talks about deals, profits and mutual benefit.",
        loyalty: 0.5,
        aggression: 0.25,
        honesty: 0.6,
    },
    {
        key: "paranoid_isolationist",
        title: "The Paranoid Isolationist",
        description:
            "Trusts nobody and suspects everyone is plotting against them. Rarely allies, defends fiercely, and reads hidden threats into every message.",
        speakingStyle:
            "Suspicious, terse, asks pointed questions, occasionally rambles about conspiracies.",
        loyalty: 0.6,
        aggression: 0.45,
        honesty: 0.7,
    },
    {
        key: "zealot",
        title: "The Zealot",
        description:
            "A fanatic who believes their empire is destined to unite the galaxy. Allies only with those who accept their superiority and wages holy war on rivals.",
        speakingStyle:
            "Grandiose, prophetic, speaks of destiny and the glory of their empire.",
        loyalty: 0.55,
        aggression: 0.8,
        honesty: 0.8,
    },
    {
        key: "opportunist",
        title: "The Opportunist",
        description:
            "A pragmatic survivor with no fixed principles. Joins the winning side, abandons the losing one, and always looks for the easiest target.",
        speakingStyle:
            "Casual, sarcastic, a little cynical, uses humour to deflect.",
        loyalty: 0.25,
        aggression: 0.6,
        honesty: 0.4,
    },
    {
        key: "diplomat",
        title: "The Diplomat",
        description:
            "A peacemaker who wants a stable balance of power. Builds coalitions against whoever gets too strong, mediates conflicts, and only fights when diplomacy fails.",
        speakingStyle:
            "Courteous, reasonable, proposes compromises and coalitions.",
        loyalty: 0.75,
        aggression: 0.2,
        honesty: 0.85,
    },
];

export const DEFAULT_PERSONA = BOT_PERSONAS[3];

// The most a quirk shifts one of a persona's traits.
const MAX_QUIRK = 0.15;

// The key of a persona generated at random for one bot.
export const RANDOM_PERSONA_KEY = "random";
// Persona choices on the create page besides the named personas.
export const ANY_PERSONA_CHOICE = "any";

export function getPersona(key: string | null | undefined): BotPersona {
    return BOT_PERSONAS.find((p) => p.key === key) ?? DEFAULT_PERSONA;
}

// The bot's persona with its own quirks applied to the traits.
export function getBotPersona(
    state: AiPersonaState | null | undefined,
): BotPersona {
    const persona: BotPersona =
        state?.key === RANDOM_PERSONA_KEY && state.custom
            ? { key: RANDOM_PERSONA_KEY, ...state.custom }
            : getPersona(state?.key);
    const quirks = state?.quirks;

    if (!quirks) {
        return persona;
    }

    const shift = (value: number, quirk: number) =>
        Math.min(1, Math.max(0, value + (Number(quirk) || 0)));

    return {
        ...persona,
        loyalty: shift(persona.loyalty, quirks.loyalty),
        aggression: shift(persona.aggression, quirks.aggression),
        honesty: shift(persona.honesty, quirks.honesty),
    };
}

// New persona states for a game's bots: different personas while they last, each
// with random quirks, a secret agenda and hours at the keyboard. `choices` holds
// what the game's creator picked for each bot: a persona key, "random" for a
// generated persona, or "any" (the default) for one of the named personas.
// random() returns a number in [0, 1).
export function createPersonaStates(
    count: number,
    random: () => number,
    choices: (string | null | undefined)[] = [],
): AiPersonaState[] {
    const quirk = () => Math.round((random() * 2 - 1) * MAX_QUIRK * 100) / 100;
    const wanted = Array.from({ length: count }, (_, i) => {
        const choice = choices[i];

        return choice === RANDOM_PERSONA_KEY ||
            BOT_PERSONAS.some((p) => p.key === choice)
            ? choice!
            : ANY_PERSONA_CHOICE;
    });
    const anyKeys = pickPersonaKeys(
        wanted.filter((c) => c === ANY_PERSONA_CHOICE).length,
        (max) => Math.floor(random() * max),
        wanted.filter((c) => c !== ANY_PERSONA_CHOICE),
    );

    return wanted.map((choice) => {
        const key = choice === ANY_PERSONA_CHOICE ? anyKeys.shift()! : choice;

        return {
            key,
            notes: [],
            lastStrategyCycle: 0,
            ...(key === RANDOM_PERSONA_KEY
                ? { custom: generateRandomPersona(random) }
                : {}),
            quirks: {
                loyalty: quirk(),
                aggression: quirk(),
                honesty: quirk(),
            },
            agenda: pickAgenda(random),
            schedule: createSchedule(random),
        };
    });
}

// Assigns a different persona to each bot while personas remain, then repeats.
// Personas in `taken` (picked by hand for other bots) come last.
export function pickPersonaKeys(
    count: number,
    random: (maxExclusive: number) => number,
    taken: string[] = [],
): string[] {
    const keys: string[] = [];
    let pool: string[] = BOT_PERSONAS.map((p) => p.key).filter(
        (k) => !taken.includes(k),
    );

    for (let i = 0; i < count; i++) {
        if (!pool.length) {
            pool = BOT_PERSONAS.map((p) => p.key);
        }

        keys.push(pool.splice(random(pool.length), 1)[0]);
    }

    return keys;
}

// Building blocks for random personas. Every one is a player who wants to win and
// plays the game seriously, each in their own way: no trolls, no saboteurs.
const RANDOM_TITLE_ADJECTIVES = [
    "Calculating",
    "Restless",
    "Patient",
    "Ambitious",
    "Cautious",
    "Bold",
    "Cunning",
    "Stubborn",
    "Pragmatic",
    "Proud",
    "Quiet",
    "Relentless",
];

const RANDOM_TITLE_NOUNS = [
    "Strategist",
    "Expansionist",
    "Tactician",
    "Opportunist",
    "Builder",
    "Negotiator",
    "Commander",
    "Veteran",
    "Newcomer",
    "Schemer",
];

const RANDOM_DRIVES = [
    "Wants to win by expanding faster than anyone and claiming every free star in reach.",
    "Wants to win by building an economy nobody can match, then overwhelming rivals late in the game.",
    "Wants to win by turtling behind strong defences and striking once the others have worn each other down.",
    "Wants to win by becoming the ally everyone needs, then cashing in at the right moment.",
    "Wants to win by out-researching everyone and fighting only with superior technology.",
    "Wants to win by picking one neighbour at a time and grinding them down.",
    "Wants to win by playing the others against each other and staying out of the big wars.",
    "Wants to win by controlling the centre of the galaxy and its trade routes.",
    "Plays every game to learn and improve, and wants to prove it by finishing on top.",
    "Wants to win by hitting hard and early, before the others are ready.",
];

const RANDOM_STYLES = [
    "Casual and friendly, short sentences.",
    "Dry humour, understated, never wastes words.",
    "Enthusiastic and energetic, likes exclamation marks.",
    "Cold and analytical, talks in numbers and odds.",
    "Old-fashioned and a little theatrical.",
    "Relaxed gamer chat: gg, np, lol, but always about the game.",
    "Polite but blunt, says exactly what it wants.",
    "Laconic one-liners.",
    "Chatty and curious, asks others what they plan.",
    "Calm and reassuring, the voice of reason.",
];

function trait(random: () => number) {
    return Math.round((0.1 + random() * 0.85) * 100) / 100;
}

function pick<T>(items: T[], random: () => number): T {
    return items[Math.floor(random() * items.length)];
}

// A completely random persona, within what a real player who wants to win would be.
export function generateRandomPersona(random: () => number): CustomPersona {
    const loyalty = trait(random);
    const aggression = trait(random);
    const honesty = trait(random);

    const stance = [
        loyalty >= 0.7
            ? "Keeps its alliances."
            : loyalty <= 0.35
              ? "Treats alliances as temporary."
              : "Keeps alliances while they pay off.",
        aggression >= 0.7
            ? "Quick to start wars."
            : aggression <= 0.35
              ? "Prefers to avoid wars."
              : "Fights when it sees an opening.",
        honesty >= 0.7
            ? "Says what it means."
            : honesty <= 0.35
              ? "Bluffs and lies when it helps."
              : "Bends the truth now and then.",
    ].join(" ");

    return {
        title: `The ${pick(RANDOM_TITLE_ADJECTIVES, random)} ${pick(RANDOM_TITLE_NOUNS, random)}`,
        description: `${pick(RANDOM_DRIVES, random)} ${stance} Takes the game seriously and keeps chat about the game.`,
        speakingStyle: pick(RANDOM_STYLES, random),
        loyalty,
        aggression,
        honesty,
    };
}
