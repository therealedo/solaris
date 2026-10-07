// Pure, rule based decision making for AI players' diplomacy and chat.
// Kept free of game/database dependencies so it can be unit tested and later
// swapped for (or advised by) an LLM driven persona.

export interface PlayerStrength {
    playerId: string;
    stars: number;
    ships: number;
    strength: number;
}

export type AllianceOfferDecision =
    | { accept: true }
    | { accept: false; reason: "allianceCap" | "distrust" | "tooStrong" };

export type BetrayalReason = "allyNearVictory" | "weakAlly";

export type ChatIntent = "alliance" | "threat" | "peace" | "greeting" | "other";

// Rough measure of military and territorial power used to compare players.
export function calculateStrength(stars: number, ships: number): number {
    return stars + ships / 25;
}

// An ally (or would be ally) holding this fraction of the stars needed for victory
// is considered a winner in the making and no longer worth helping.
export const NEAR_VICTORY_FRACTION = 0.6;

// A neighbour this much stronger than the bot is considered a threat.
export const THREAT_STRENGTH_RATIO = 1.2;

// A bot this much stronger than a neighbouring ally will consider stabbing them in the back.
export const BACKSTAB_STRENGTH_RATIO = 2;

// Production cycles a bot waits before proposing an alliance to the same player again.
export const PROPOSAL_COOLDOWN_CYCLES = 3;

export function isNearVictory(
    player: PlayerStrength,
    starsForVictory: number,
): boolean {
    return player.stars >= starsForVictory * NEAR_VICTORY_FRACTION;
}

export function decideAllianceOffer(params: {
    offerer: PlayerStrength;
    leader: PlayerStrength;
    starsForVictory: number;
    reputation: number;
    atAllianceCap: boolean;
}): AllianceOfferDecision {
    const { offerer, leader, starsForVictory, reputation, atAllianceCap } =
        params;

    if (atAllianceCap) {
        return { accept: false, reason: "allianceCap" };
    }

    if (reputation < 0) {
        return { accept: false, reason: "distrust" };
    }

    if (
        offerer.playerId === leader.playerId &&
        isNearVictory(offerer, starsForVictory)
    ) {
        return { accept: false, reason: "tooStrong" };
    }

    return { accept: true };
}

export function decideBetrayal(params: {
    bot: PlayerStrength;
    ally: PlayerStrength;
    leader: PlayerStrength;
    starsForVictory: number;
    allyIsNeighbour: boolean;
    isThreatened: boolean;
}): BetrayalReason | null {
    const {
        bot,
        ally,
        leader,
        starsForVictory,
        allyIsNeighbour,
        isThreatened,
    } = params;

    // Never help an ally across the finish line.
    if (
        ally.playerId === leader.playerId &&
        isNearVictory(ally, starsForVictory)
    ) {
        return "allyNearVictory";
    }

    // Opportunistic backstab: a weak neighbouring ally is an easy target,
    // but only when nobody else is threatening the bot.
    if (
        allyIsNeighbour &&
        !isThreatened &&
        bot.strength >= ally.strength * BACKSTAB_STRENGTH_RATIO
    ) {
        return "weakAlly";
    }

    return null;
}

// Pick who to propose an alliance to when the bot is threatened by a stronger neighbour.
// Prefers the strongest candidate that is not the threat itself and not about to win.
export function chooseAllianceProposal(params: {
    bot: PlayerStrength;
    threats: PlayerStrength[];
    candidates: PlayerStrength[];
    leader: PlayerStrength;
    starsForVictory: number;
}): PlayerStrength | null {
    const { threats, candidates, leader, starsForVictory } = params;

    if (!threats.length) {
        return null;
    }

    const threatIds = new Set(threats.map((t) => t.playerId));

    const eligible = candidates
        .filter((c) => !threatIds.has(c.playerId))
        .filter(
            (c) =>
                !(
                    c.playerId === leader.playerId &&
                    isNearVictory(c, starsForVictory)
                ),
        )
        .sort((a, b) => b.strength - a.strength);

    return eligible[0] ?? null;
}

export function isThreat(bot: PlayerStrength, other: PlayerStrength): boolean {
    return other.strength > bot.strength * THREAT_STRENGTH_RATIO;
}

const INTENT_PATTERNS: [ChatIntent, RegExp][] = [
    [
        "alliance",
        /\b(ally|allies|alliance|allied|team up|teaming|join forces|together|partner|pact|coalition)\b/i,
    ],
    [
        "threat",
        /\b(attack|destroy|crush|kill|invade|war|conquer|wipe|die|surrender|or else)\b/i,
    ],
    [
        "peace",
        /\b(peace|truce|ceasefire|cease fire|stop fighting|non.?aggression|neutral|leave me alone)\b/i,
    ],
    ["greeting", /\b(hi|hello|hey|greetings|good luck|glhf|gl hf|yo)\b/i],
];

export function classifyMessage(message: string): ChatIntent {
    for (const [intent, pattern] of INTENT_PATTERNS) {
        if (pattern.test(message)) {
            return intent;
        }
    }

    return "other";
}

export const BOT_MESSAGES = {
    acceptAlliance: [
        "Agreed. Our fleets will stand together, {player}.",
        "Alliance accepted. Let's make the rest of the galaxy regret it.",
        "Very well, {player}. Watch my back and I'll watch yours.",
    ],
    declineAllianceCap: [
        "I've already got all the friends I can afford right now, {player}.",
        "My alliances are full. Ask me again when things change.",
    ],
    declineAllianceDistrust: [
        "After what you've done? I don't think so, {player}.",
        "Trust is earned. You haven't earned mine.",
    ],
    declineAllianceTooStrong: [
        "And help you win? Nice try, {player}.",
        "You're already too far ahead. I'll pass.",
    ],
    proposeAlliance: [
        "{threat} is getting too strong. Alliance, {player}? I've offered one.",
        "We have a common problem: {threat}. I've declared you an ally, your move.",
        "{player}, I propose an alliance before {threat} swallows us both.",
    ],
    betrayNearVictory: [
        "Sorry {player}, I can't let you win. Our alliance is over.",
        "You've grown too powerful, {player}. Nothing personal.",
    ],
    betrayWeakAlly: [
        "It's been fun, {player}, but your stars look better under my flag.",
        "Alliances are temporary. Ambition is forever. Goodbye, {player}.",
    ],
    replyAllianceAlreadyAllied: [
        "We're already allies, {player}. Let's keep it that way.",
        "You have my word, {player}. We're in this together.",
    ],
    replyAllianceInvite: [
        "I've declared you an ally, {player}. Declare me back and it's done.",
        "Deal. My alliance offer is waiting for you in diplomacy, {player}.",
    ],
    replyThreat: [
        "Bold words, {player}. My fleets are waiting.",
        "Come and try it.",
        "Threats? I'll remember that, {player}.",
    ],
    replyPeace: [
        "Peace is possible, {player}. Stay out of my space and I'll stay out of yours.",
        "A truce suits me for now. Don't make me regret it.",
    ],
    replyGreeting: [
        "Greetings, {player}.",
        "Hello {player}. May the best commander win.",
        "Good luck out there, {player}. You'll need it.",
    ],
    replyOther: [
        "Noted, {player}.",
        "Interesting. I'll think about it.",
        "We'll see, {player}.",
    ],
};

export type BotMessageKey = keyof typeof BOT_MESSAGES;

export function formatBotMessage(
    key: BotMessageKey,
    values: Record<string, string>,
    random: (max: number) => number,
): string {
    const options = BOT_MESSAGES[key];
    const template = options[random(options.length)];

    return template.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? "");
}
