import { NEAR_VICTORY_FRACTION } from "./botDiplomacyPolicy";
import { BotFeeling } from "./types/Ai";

// What a bot noticed about the galaxy at one tick, built from information a human in
// its seat could see. Comparing two of these tells the bot what changed.
export interface BotView {
    tick: number;
    // Every star the bot owns: id to name.
    ownedStars: Map<string, string>;
    // Current owner of every star: id to owner id (or null).
    starOwners: Map<string, string | null>;
    starNames: Map<string, string>;
    homeStarId: string | null;
    // Fleets the bot's scanners show heading for its stars.
    incomingAttacks: {
        starId: string;
        attackerId: string;
        arrivalTick: number;
    }[];
    // The status each other empire has declared towards the bot.
    statusFrom: Map<string, string>;
    // How much the bot trusts each empire, from the game's reputation system.
    reputation: Map<string, number>;
    starsHeld: Map<string, number>;
    defeated: Set<string>;
    names: Map<string, string>;
    starsForVictory: number;
}

export interface BotSnapshot {
    ownedStarIds: Set<string>;
    attackKeys: Set<string>;
    statusFrom: Map<string, string>;
    reputation: Map<string, number>;
    nearVictory: Set<string>;
    defeated: Set<string>;
}

export type ObservationKind =
    | "starLost"
    | "starTaken"
    | "attackIncoming"
    | "homeStarThreatened"
    | "allianceOffered"
    | "allianceBroken"
    | "warDeclared"
    | "peaceOffered"
    | "gift"
    | "nearVictory"
    | "playerDefeated";

export interface Observation {
    kind: ObservationKind;
    playerId: string;
    text: string;
    // How much this should make the bot rethink its plan.
    weight: number;
    // How it moves the bot's feelings about that player.
    trust: number;
    anger: number;
}

const OBSERVATION_EFFECTS: Record<
    ObservationKind,
    { weight: number; trust: number; anger: number }
> = {
    starLost: { weight: 3, trust: -0.15, anger: 0.25 },
    starTaken: { weight: 1, trust: 0, anger: 0 },
    attackIncoming: { weight: 2, trust: -0.05, anger: 0.15 },
    homeStarThreatened: { weight: 5, trust: -0.1, anger: 0.3 },
    allianceOffered: { weight: 2, trust: 0.1, anger: -0.05 },
    allianceBroken: { weight: 4, trust: -0.4, anger: 0.3 },
    warDeclared: { weight: 3, trust: -0.2, anger: 0.3 },
    peaceOffered: { weight: 2, trust: 0.1, anger: -0.15 },
    gift: { weight: 2, trust: 0.2, anger: -0.1 },
    nearVictory: { weight: 4, trust: 0, anger: 0 },
    playerDefeated: { weight: 2, trust: 0, anger: 0 },
};

export function takeSnapshot(view: BotView): BotSnapshot {
    return {
        ownedStarIds: new Set(view.ownedStars.keys()),
        attackKeys: new Set(view.incomingAttacks.map(attackKey)),
        statusFrom: new Map(view.statusFrom),
        reputation: new Map(view.reputation),
        nearVictory: new Set(
            [...view.starsHeld.entries()]
                .filter(
                    ([, stars]) =>
                        stars >= view.starsForVictory * NEAR_VICTORY_FRACTION,
                )
                .map(([id]) => id),
        ),
        defeated: new Set(view.defeated),
    };
}

function attackKey(attack: { starId: string; attackerId: string }) {
    return `${attack.attackerId}>${attack.starId}`;
}

// What changed since the previous snapshot, most important first. Without a previous
// snapshot (a new game, or a restarted server) there is nothing to compare, so the
// first look only records the baseline.
export function detectObservations(
    previous: BotSnapshot | undefined,
    view: BotView,
): Observation[] {
    if (!previous) {
        return [];
    }

    const current = takeSnapshot(view);
    const observations: Observation[] = [];
    const name = (id: string | null | undefined) =>
        (id && view.names.get(id)) || "Someone";
    const star = (id: string) => view.starNames.get(id) || "a star";
    const add = (kind: ObservationKind, playerId: string, text: string) =>
        observations.push({
            kind,
            playerId,
            text: `Tick ${view.tick}: ${text}`,
            ...OBSERVATION_EFFECTS[kind],
        });

    for (const starId of previous.ownedStarIds) {
        const owner = view.starOwners.get(starId);

        if (!view.ownedStars.has(starId) && owner) {
            add(
                "starLost",
                owner,
                `${name(owner)} captured your star ${star(starId)}.`,
            );
        }
    }

    for (const starId of view.ownedStars.keys()) {
        if (!previous.ownedStarIds.has(starId)) {
            // Who held it isn't known any more, so only note the gain.
            observations.push({
                kind: "starTaken",
                playerId: "",
                text: `Tick ${view.tick}: you took the star ${star(starId)}.`,
                ...OBSERVATION_EFFECTS.starTaken,
            });
        }
    }

    for (const attack of view.incomingAttacks) {
        if (previous.attackKeys.has(attackKey(attack))) {
            continue;
        }

        const isHome = attack.starId === view.homeStarId;

        add(
            isHome ? "homeStarThreatened" : "attackIncoming",
            attack.attackerId,
            `${name(attack.attackerId)}'s fleet is heading for your ${isHome ? "home star" : "star"} ${star(attack.starId)}, arriving at tick ${attack.arrivalTick}.`,
        );
    }

    for (const [playerId, status] of view.statusFrom) {
        const before = previous.statusFrom.get(playerId);

        if (
            before == null ||
            before === status ||
            view.defeated.has(playerId)
        ) {
            continue;
        }

        if (status === "allies") {
            add(
                "allianceOffered",
                playerId,
                `${name(playerId)} offered you an alliance.`,
            );
        } else if (before === "allies") {
            add(
                "allianceBroken",
                playerId,
                status === "enemies"
                    ? `${name(playerId)} broke your alliance and declared war on you.`
                    : `${name(playerId)} broke your alliance.`,
            );
        } else if (status === "enemies") {
            add(
                "warDeclared",
                playerId,
                `${name(playerId)} declared war on you.`,
            );
        } else if (before === "enemies") {
            add(
                "peaceOffered",
                playerId,
                `${name(playerId)} offered you peace.`,
            );
        }
    }

    for (const [playerId, score] of view.reputation) {
        const before = previous.reputation.get(playerId);

        if (before != null && score > before) {
            add(
                "gift",
                playerId,
                `${name(playerId)} sent you a valuable gift.`,
            );
        }
    }

    for (const playerId of current.nearVictory) {
        if (!previous.nearVictory.has(playerId)) {
            add(
                "nearVictory",
                playerId,
                `${name(playerId)} now holds ${view.starsHeld.get(playerId)} of the ${view.starsForVictory} stars needed to win.`,
            );
        }
    }

    for (const playerId of view.defeated) {
        if (!previous.defeated.has(playerId)) {
            add(
                "playerDefeated",
                playerId,
                `${name(playerId)} has been defeated.`,
            );
        }
    }

    return observations.sort((a, b) => b.weight - a.weight);
}

const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

// Feelings move with what happens and fade over time, like a person's would.
export function applyObservations(
    feelings: Record<string, BotFeeling>,
    observations: Observation[],
): Record<string, BotFeeling> {
    const updated = { ...feelings };

    for (const o of observations) {
        if (!o.playerId || (!o.trust && !o.anger)) {
            continue;
        }

        const current = updated[o.playerId] ?? { trust: 0, anger: 0 };

        updated[o.playerId] = {
            trust: round(clamp(current.trust + o.trust, -1, 1)),
            anger: round(clamp(current.anger + o.anger, 0, 1)),
        };
    }

    return updated;
}

export function decayFeelings(
    feelings: Record<string, BotFeeling>,
    factor = 0.85,
): Record<string, BotFeeling> {
    const updated: Record<string, BotFeeling> = {};

    for (const [id, f] of Object.entries(feelings)) {
        const next = {
            trust: round(f.trust * factor),
            anger: round(f.anger * factor),
        };

        if (Math.abs(next.trust) >= 0.05 || next.anger >= 0.05) {
            updated[id] = next;
        }
    }

    return updated;
}

// The feeling in words, for the LLM. Empty when the bot feels nothing in particular.
export function describeFeeling(feeling: BotFeeling | undefined): string {
    if (!feeling) {
        return "";
    }

    const parts: string[] = [];

    if (feeling.anger >= 0.6) {
        parts.push("furious with them");
    } else if (feeling.anger >= 0.3) {
        parts.push("angry with them");
    }

    if (feeling.trust <= -0.4) {
        parts.push("you deeply distrust them");
    } else if (feeling.trust <= -0.15) {
        parts.push("you are wary of them");
    } else if (feeling.trust >= 0.4) {
        parts.push("you trust them");
    } else if (feeling.trust >= 0.15) {
        parts.push("you feel warmly towards them");
    }

    return parts.join(", ");
}

function round(value: number) {
    return Math.round(value * 100) / 100;
}
