// Specialist hiring choices of AI opponents with a persona.

export type SpecialistKind = "star" | "carrier";

export interface SpecialistPreference {
    kind: SpecialistKind;
    id: number;
}

export interface SpecialistOption extends SpecialistPreference {
    // Cost in the game's specialist currency.
    cost: number;
}

// Ids from config/game/specialists.json.
const CARRIER = {
    lieutenant: 2,
    colonel: 3,
    general: 4,
    pathfinder: 14,
    plunderer: 21,
};

const STAR = {
    orbitalArray: 1,
    spaceDock: 2,
    orbitalCannon: 4,
    researchStation: 11,
    mineralExtractor: 14,
};

const carrier = (id: number): SpecialistPreference => ({ kind: "carrier", id });
const star = (id: number): SpecialistPreference => ({ kind: "star", id });

const MILITARY = [
    carrier(CARRIER.general),
    carrier(CARRIER.colonel),
    star(STAR.spaceDock),
    carrier(CARRIER.lieutenant),
    carrier(CARRIER.plunderer),
];

const ECONOMY = [
    star(STAR.researchStation),
    star(STAR.spaceDock),
    star(STAR.mineralExtractor),
    carrier(CARRIER.pathfinder),
];

const PERSONA_SPECIALISTS: Record<string, SpecialistPreference[]> = {
    warlord: MILITARY,
    zealot: [
        carrier(CARRIER.colonel),
        carrier(CARRIER.general),
        star(STAR.orbitalCannon),
        carrier(CARRIER.lieutenant),
    ],
    merchant_prince: ECONOMY,
    paranoid_isolationist: [
        star(STAR.orbitalCannon),
        star(STAR.orbitalArray),
        star(STAR.spaceDock),
        carrier(CARRIER.lieutenant),
    ],
    diplomat: [
        star(STAR.orbitalCannon),
        star(STAR.spaceDock),
        carrier(CARRIER.pathfinder),
        star(STAR.orbitalArray),
    ],
    honourable_admiral: [
        carrier(CARRIER.colonel),
        star(STAR.orbitalCannon),
        carrier(CARRIER.lieutenant),
        carrier(CARRIER.pathfinder),
    ],
};

const ADAPTIVE_PERSONAS = ["silver_tongue", "opportunist"];

// The most of its specialist funds a bot spends on one hire.
export const MAX_CREDITS_FRACTION = 0.25;
export const MAX_TOKENS_FRACTION = 0.5;

// The chance of looking for a hire in a production cycle, and of passing over a preferred
// specialist for the next one, so bots don't all hire the same thing at the same time.
export const HIRE_CHANCE = 0.5;
const SKIP_CHANCE = 0.3;

export function getSpecialistPreferences(
    personaKey: string | null | undefined,
    atWar: boolean,
): SpecialistPreference[] {
    if (personaKey && ADAPTIVE_PERSONAS.includes(personaKey)) {
        return atWar ? MILITARY : ECONOMY;
    }

    return PERSONA_SPECIALISTS[personaKey ?? ""] ?? ECONOMY;
}

// The most a bot will spend on a specialist given its funds in the specialist currency.
export function getSpecialistBudget(
    currency: "credits" | "creditsSpecialists",
    funds: number,
): number {
    const fraction =
        currency === "credits" ? MAX_CREDITS_FRACTION : MAX_TOKENS_FRACTION;

    return Math.floor(Math.max(0, funds) * fraction);
}

// Picks an available specialist within budget, in order of preference, for which the
// bot has somewhere to put it. random() returns a number in [0, 1).
export function pickSpecialistHire(
    preferences: SpecialistPreference[],
    available: SpecialistOption[],
    budget: number,
    hasTarget: Record<SpecialistKind, boolean>,
    random: () => number,
): SpecialistOption | null {
    const candidates = preferences
        .map((pref) =>
            available.find((a) => a.kind === pref.kind && a.id === pref.id),
        )
        .filter(
            (option): option is SpecialistOption =>
                option != null &&
                option.cost > 0 &&
                option.cost <= budget &&
                hasTarget[option.kind],
        );

    for (const candidate of candidates) {
        if (random() >= SKIP_CHANCE) {
            return candidate;
        }
    }

    return candidates[0] ?? null;
}
