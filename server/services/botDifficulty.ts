import { AiDifficulty } from "@solaris/common";

// How strong each difficulty wants an AI opponent to be, as a fraction of the average
// human player's strength. Difficulty is relative: bots get extra or fewer credits each
// production cycle to stay near that target, so they keep pace with a strong player and
// ease off against a struggling one instead of using fixed bonuses.
export const DIFFICULTY_TARGETS: Record<AiDifficulty, number | null> = {
    classic: null,
    easy: 0.7,
    normal: 1,
    hard: 1.3,
    brutal: 1.7,
};

// Within this fraction of the target, a bot's income is left alone.
const DEAD_ZONE = 0.1;
// The largest cut and boost to a bot's income for one cycle.
const MAX_PENALTY = 0.5;
const MAX_BONUS = 1;

// The credits to add to (or, when negative, remove from) a bot's production income.
export function calculateDifficultyCredits(params: {
    difficulty: AiDifficulty | null | undefined;
    botStrength: number;
    averageHumanStrength: number;
    income: number;
}): number {
    const target = DIFFICULTY_TARGETS[params.difficulty ?? "classic"];

    if (
        target == null ||
        params.averageHumanStrength <= 0 ||
        params.income <= 0
    ) {
        return 0;
    }

    const wanted = params.averageHumanStrength * target;
    const ratio = params.botStrength / wanted;

    if (Math.abs(ratio - 1) <= DEAD_ZONE) {
        return 0;
    }

    // Behind the target: up to double income. Ahead: up to half of it taken away.
    const adjustment =
        ratio < 1
            ? Math.min(MAX_BONUS, 1 / Math.max(ratio, 0.01) - 1)
            : -Math.min(MAX_PENALTY, 1 - 1 / ratio);

    return Math.round(params.income * adjustment);
}

// A line for the LLM about how hard to play.
export function describeDifficulty(
    difficulty: AiDifficulty | null | undefined,
): string {
    switch (difficulty) {
        case "easy":
            return "You are a relaxed commander: open to peace, slow to hold grudges, and you sometimes make a generous or careless call.";
        case "hard":
            return "You play to win: punish weakness, keep alliances only while they pay, and rally others against whoever leads.";
        case "brutal":
            return "You are ruthless and calculating: every promise is a tool, and you coordinate relentlessly against the strongest rival.";
        default:
            return "";
    }
}
