import {
    addSinglePlayerResult,
    MAX_RECENT_RESULTS,
    normaliseSinglePlayerRecord,
    suggestDifficulty,
} from "../services/singlePlayerRecord";

describe("singlePlayerRecord", () => {
    const date = new Date("2026-01-01T00:00:00Z");

    const play = (results: [string, boolean][]) =>
        results.reduce(
            (record, [difficulty, won]) =>
                addSinglePlayerResult(record, difficulty, won, date),
            normaliseSinglePlayerRecord(undefined),
        );

    it("should start empty for users without a record", () => {
        const record = normaliseSinglePlayerRecord(undefined);

        expect(record.played).toBe(0);
        expect(record.won).toBe(0);
        expect(record.lost).toBe(0);
        expect(record.byDifficulty.normal).toEqual({
            played: 0,
            won: 0,
            lost: 0,
        });
        expect(record.recent).toEqual([]);
    });

    it("should fill in levels missing from older records", () => {
        const record = normaliseSinglePlayerRecord({
            played: 2,
            won: 1,
            lost: 1,
            byDifficulty: { easy: { played: 2, won: 1, lost: 1 } },
        });

        expect(record.played).toBe(2);
        expect(record.byDifficulty.easy.played).toBe(2);
        expect(record.byDifficulty.brutal.played).toBe(0);
    });

    it("should count wins and losses overall and per difficulty", () => {
        const record = play([
            ["easy", true],
            ["normal", false],
            ["normal", true],
        ]);

        expect(record.played).toBe(3);
        expect(record.won).toBe(2);
        expect(record.lost).toBe(1);
        expect(record.byDifficulty.easy).toEqual({
            played: 1,
            won: 1,
            lost: 0,
        });
        expect(record.byDifficulty.normal).toEqual({
            played: 2,
            won: 1,
            lost: 1,
        });
        expect(record.recent.map((r) => r.won)).toEqual([true, false, true]);
    });

    it("should count unknown difficulties as classic", () => {
        const record = addSinglePlayerResult(undefined, undefined, false, date);

        expect(record.byDifficulty.classic.lost).toBe(1);
        expect(record.recent[0].difficulty).toBe("classic");
    });

    it("should keep only the latest results", () => {
        const record = play(
            Array.from(
                { length: MAX_RECENT_RESULTS + 5 },
                () => ["hard", true] as [string, boolean],
            ),
        );

        expect(record.played).toBe(MAX_RECENT_RESULTS + 5);
        expect(record.recent.length).toBe(MAX_RECENT_RESULTS);
    });

    it("should not change the record it was given", () => {
        const record = play([["normal", true]]);

        addSinglePlayerResult(record, "normal", false, date);

        expect(record.played).toBe(1);
        expect(record.recent.length).toBe(1);
    });

    describe("suggestDifficulty", () => {
        it("should suggest normal without any games", () => {
            expect(suggestDifficulty(undefined)).toBe("normal");
            expect(suggestDifficulty(play([["classic", true]]))).toBe("normal");
        });

        it("should stay at the current level until there are enough games", () => {
            expect(
                suggestDifficulty(
                    play([
                        ["hard", true],
                        ["hard", true],
                    ]),
                ),
            ).toBe("hard");
        });

        it("should move up a level after winning most games", () => {
            expect(
                suggestDifficulty(
                    play([
                        ["normal", true],
                        ["normal", true],
                        ["normal", false],
                        ["normal", true],
                    ]),
                ),
            ).toBe("hard");
        });

        it("should move down a level after losing most games", () => {
            expect(
                suggestDifficulty(
                    play([
                        ["hard", false],
                        ["hard", false],
                        ["hard", true],
                        ["hard", false],
                    ]),
                ),
            ).toBe("normal");
        });

        it("should stay when results are mixed", () => {
            expect(
                suggestDifficulty(
                    play([
                        ["normal", true],
                        ["normal", false],
                        ["normal", true],
                        ["normal", false],
                    ]),
                ),
            ).toBe("normal");
        });

        it("should not go beyond the easiest or hardest level", () => {
            expect(
                suggestDifficulty(
                    play([
                        ["brutal", true],
                        ["brutal", true],
                        ["brutal", true],
                    ]),
                ),
            ).toBe("brutal");
            expect(
                suggestDifficulty(
                    play([
                        ["easy", false],
                        ["easy", false],
                        ["easy", false],
                    ]),
                ),
            ).toBe("easy");
        });

        it("should only look at games at the latest level", () => {
            expect(
                suggestDifficulty(
                    play([
                        ["easy", false],
                        ["easy", false],
                        ["easy", false],
                        ["normal", true],
                        ["normal", true],
                        ["normal", true],
                    ]),
                ),
            ).toBe("hard");
        });

        it("should only look at the latest games at a level", () => {
            expect(
                suggestDifficulty(
                    play([
                        ["normal", false],
                        ["normal", false],
                        ["normal", false],
                        ["normal", true],
                        ["normal", true],
                        ["normal", true],
                        ["normal", true],
                        ["normal", true],
                    ]),
                ),
            ).toBe("hard");
        });

        it("should ignore classic games when picking the level", () => {
            expect(
                suggestDifficulty(
                    play([
                        ["hard", false],
                        ["hard", false],
                        ["hard", false],
                        ["classic", true],
                    ]),
                ),
            ).toBe("normal");
        });
    });
});
