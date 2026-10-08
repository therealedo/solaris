import { ResearchTypeNotRandom } from "@solaris/common";

// Research choices of AI opponents with a persona. Every researchable technology
// keeps a base weight so the choice is never fully predictable; personas add to
// the technologies they favour.

type ResearchWeights = Partial<Record<ResearchTypeNotRandom, number>>;

const BASE_WEIGHT = 1;

const WAR_WEIGHTS: ResearchWeights = {
    weapons: 8,
    manufacturing: 3,
    hyperspace: 2,
};

const PEACE_WEIGHTS: ResearchWeights = {
    banking: 6,
    manufacturing: 5,
    terraforming: 3,
    experimentation: 2,
};

export const PERSONA_RESEARCH_WEIGHTS: Record<string, ResearchWeights> = {
    warlord: { weapons: 10, manufacturing: 4, hyperspace: 2 },
    zealot: { weapons: 9, manufacturing: 3, scanning: 2, hyperspace: 2 },
    merchant_prince: {
        banking: 9,
        manufacturing: 6,
        terraforming: 4,
        experimentation: 2,
    },
    paranoid_isolationist: { weapons: 7, scanning: 7, manufacturing: 2 },
    diplomat: {
        hyperspace: 5,
        scanning: 5,
        banking: 3,
        manufacturing: 3,
        weapons: 3,
        terraforming: 2,
    },
    honourable_admiral: {
        hyperspace: 5,
        scanning: 4,
        weapons: 4,
        manufacturing: 3,
        banking: 2,
        terraforming: 2,
    },
};

// Personas that research for war while fighting and for their economy otherwise.
const ADAPTIVE_PERSONAS = ["silver_tongue", "opportunist"];

export function getResearchWeights(
    personaKey: string | null | undefined,
    atWar: boolean,
): ResearchWeights {
    if (personaKey && ADAPTIVE_PERSONAS.includes(personaKey)) {
        return atWar ? WAR_WEIGHTS : PEACE_WEIGHTS;
    }

    return (
        PERSONA_RESEARCH_WEIGHTS[personaKey ?? ""] ??
        PERSONA_RESEARCH_WEIGHTS.diplomat
    );
}

// Picks a technology from the researchable ones, weighted by persona.
// random() returns a number in [0, 1).
export function chooseBotResearch(
    personaKey: string | null | undefined,
    researchable: ResearchTypeNotRandom[],
    atWar: boolean,
    random: () => number,
): ResearchTypeNotRandom | null {
    if (!researchable.length) {
        return null;
    }

    const weights = getResearchWeights(personaKey, atWar);
    const weighted = researchable.map((tech) => ({
        tech,
        weight: BASE_WEIGHT + (weights[tech] ?? 0),
    }));
    const total = weighted.reduce((sum, w) => sum + w.weight, 0);

    let roll = random() * total;

    for (const { tech, weight } of weighted) {
        roll -= weight;

        if (roll < 0) {
            return tech;
        }
    }

    return weighted[weighted.length - 1].tech;
}
