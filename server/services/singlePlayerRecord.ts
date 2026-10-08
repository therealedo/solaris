import type {
    AiDifficulty,
    SinglePlayerRecentResult,
    SinglePlayerRecord,
    SinglePlayerResultCounts,
} from "@solaris/common";
import { AI_DIFFICULTIES } from "@solaris/common";

// How many results are kept for the difficulty suggestion.
export const MAX_RECENT_RESULTS = 20;
// How many of the latest games at a level the suggestion looks at.
export const SUGGESTION_WINDOW = 5;
// Fewest games at a level before suggesting a move away from it.
export const SUGGESTION_MIN_GAMES = 3;

// Difficulties from weakest to strongest bots. "classic" is the unadjusted AI and
// sits outside this ladder.
export const DIFFICULTY_LADDER: AiDifficulty[] = [
    "easy",
    "normal",
    "hard",
    "brutal",
];

export const DEFAULT_SUGGESTED_DIFFICULTY: AiDifficulty = "normal";

type PartialCounts = Partial<SinglePlayerResultCounts> | null | undefined;

export type PartialSinglePlayerRecord =
    | (Partial<SinglePlayerResultCounts> & {
          byDifficulty?: Partial<Record<string, PartialCounts>> | null;
          recent?: Partial<SinglePlayerRecentResult>[] | null;
      })
    | null
    | undefined;

const counts = (value: PartialCounts): SinglePlayerResultCounts => ({
    played: value?.played ?? 0,
    won: value?.won ?? 0,
    lost: value?.lost ?? 0,
});

const addResult = (
    value: SinglePlayerResultCounts,
    won: boolean,
): SinglePlayerResultCounts => ({
    played: value.played + 1,
    won: value.won + (won ? 1 : 0),
    lost: value.lost + (won ? 0 : 1),
});

export const toDifficulty = (
    difficulty: string | null | undefined,
): AiDifficulty =>
    AI_DIFFICULTIES.includes(difficulty as AiDifficulty)
        ? (difficulty as AiDifficulty)
        : "classic";

// Copies a stored (possibly old or partial) record into a complete plain object.
export function normaliseSinglePlayerRecord(
    record: PartialSinglePlayerRecord,
): SinglePlayerRecord {
    const byDifficulty = {} as Record<AiDifficulty, SinglePlayerResultCounts>;

    for (const difficulty of AI_DIFFICULTIES) {
        byDifficulty[difficulty] = counts(record?.byDifficulty?.[difficulty]);
    }

    const recent: SinglePlayerRecentResult[] = (record?.recent ?? []).map(
        (r) => ({
            difficulty: toDifficulty(r.difficulty),
            won: Boolean(r.won),
            date: r.date ?? new Date(0),
        }),
    );

    return {
        ...counts(record),
        byDifficulty,
        recent: recent.slice(-MAX_RECENT_RESULTS),
    };
}

export function addSinglePlayerResult(
    record: PartialSinglePlayerRecord,
    difficulty: string | null | undefined,
    won: boolean,
    date: Date,
): SinglePlayerRecord {
    const current = normaliseSinglePlayerRecord(record);
    const level = toDifficulty(difficulty);

    return {
        ...addResult(current, won),
        byDifficulty: {
            ...current.byDifficulty,
            [level]: addResult(current.byDifficulty[level], won),
        },
        recent: [...current.recent, { difficulty: level, won, date }].slice(
            -MAX_RECENT_RESULTS,
        ),
    };
}

// Suggests the difficulty for the next game from the latest games at the level
// the user last played: winning most of them moves up a level, losing most moves
// down one, otherwise stay.
export function suggestDifficulty(
    record: PartialSinglePlayerRecord,
): AiDifficulty {
    const recent = normaliseSinglePlayerRecord(record).recent.filter((r) =>
        DIFFICULTY_LADDER.includes(r.difficulty),
    );

    if (!recent.length) {
        return DEFAULT_SUGGESTED_DIFFICULTY;
    }

    const level = recent[recent.length - 1].difficulty;
    const index = DIFFICULTY_LADDER.indexOf(level);
    const games = recent
        .filter((r) => r.difficulty === level)
        .slice(-SUGGESTION_WINDOW);

    if (games.length < SUGGESTION_MIN_GAMES) {
        return level;
    }

    const winRate = games.filter((r) => r.won).length / games.length;

    if (winRate >= 0.7) {
        return DIFFICULTY_LADDER[
            Math.min(index + 1, DIFFICULTY_LADDER.length - 1)
        ];
    }

    if (winRate <= 0.3) {
        return DIFFICULTY_LADDER[Math.max(index - 1, 0)];
    }

    return level;
}
