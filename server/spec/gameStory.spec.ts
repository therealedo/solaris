import {
    assertCanViewGameStory,
    buildGameStory,
    buildGameStoryTimeline,
    buildStoryOpponents,
    MAX_BATTLES,
    StoryEvent,
} from "../services/gameStory";

describe("gameStory", () => {
    const players = [
        { id: "human", alias: "Human" },
        { id: "bot1", alias: "Bot One" },
        { id: "bot2", alias: "Bot Two" },
    ];

    const timeline = (events: StoryEvent[], extra: any = {}) =>
        buildGameStoryTimeline({
            players,
            homeStarIds: new Set(["home1"]),
            events,
            endTick: null,
            winnerName: null,
            winnerPlayerIds: [],
            ...extra,
        });

    const diplomacy = (
        tick: number,
        from: string,
        to: string,
        actualStatus: string,
    ): StoryEvent => ({
        tick,
        type: "playerDiplomacyStatusChanged",
        data: {
            playerIdFrom: from,
            playerIdTo: to,
            playerFromAlias: from,
            playerToAlias: to,
            actualStatus,
        },
    });

    const starCombat = (
        tick: number,
        starId: string,
        shipsLost: (number | "???")[],
        captureResult: any = null,
    ): StoryEvent => ({
        tick,
        type: "playerCombatStar",
        data: {
            groups: [
                {
                    playerIds: ["bot1"],
                    carriers: [],
                    star: {
                        starId,
                        starName: `Star ${starId}`,
                        ownedByPlayerId: "bot1",
                        captureResult,
                    },
                    shipsLost: shipsLost[0],
                },
                {
                    playerIds: ["human"],
                    carriers: [{ carrierId: "c1" }],
                    star: undefined,
                    shipsLost: shipsLost[1],
                },
            ],
        },
    });

    describe("timeline", () => {
        it("should describe alliances forming and breaking", () => {
            const entries = timeline([
                diplomacy(5, "bot1", "human", "allies"),
                // Each side gets a copy of the same change.
                diplomacy(5, "bot1", "human", "allies"),
                diplomacy(9, "bot1", "human", "enemies"),
                diplomacy(12, "human", "bot1", "neutral"),
            ]);

            expect(entries.map((e) => e.kind)).toEqual([
                "allianceFormed",
                "allianceBroken",
                "peaceMade",
            ]);
            expect(entries[0].text).toBe(
                "Bot One and Human formed an alliance.",
            );
            expect(entries[1].text).toBe(
                "Bot One broke their alliance with Human and declared war.",
            );
            expect(entries[1].playerIds).toEqual(["bot1", "human"]);
            expect(entries[2].tick).toBe(12);
        });

        it("should describe wars and one sided changes", () => {
            const entries = timeline([
                // A one sided alliance offer leaves them neutral.
                diplomacy(2, "bot2", "bot1", "neutral"),
                diplomacy(3, "bot2", "bot1", "enemies"),
            ]);

            expect(entries.length).toBe(1);
            expect(entries[0].kind).toBe("warDeclared");
            expect(entries[0].text).toBe("Bot Two declared war on Bot One.");
        });

        it("should describe home stars captured and players defeated", () => {
            const entries = timeline([
                starCombat(20, "home1", [5, 2], {
                    capturedById: "human",
                    capturedByAlias: "Human",
                }),
                starCombat(21, "other", [5, 2], {
                    capturedById: "human",
                    capturedByAlias: "Human",
                }),
                {
                    tick: 30,
                    type: "gamePlayerDefeated",
                    data: { playerId: "bot1", alias: "Bot One" },
                },
            ]);

            expect(entries.map((e) => e.kind)).toEqual([
                "homeStarCaptured",
                "playerDefeated",
            ]);
            expect(entries[0].text).toBe(
                "Human captured Bot One's home star Star home1.",
            );
            expect(entries[1].text).toBe("Bot One was defeated.");
        });

        it("should keep only the largest battles", () => {
            const events = Array.from({ length: MAX_BATTLES + 3 }, (_, i) =>
                starCombat(i + 1, `s${i}`, [10 * (i + 1), 5]),
            );
            // A small skirmish never makes it.
            events.push(starCombat(50, "tiny", [1, 1]));

            const entries = timeline(events);

            expect(entries.length).toBe(MAX_BATTLES);
            expect(entries.every((e) => e.kind === "battle")).toBeTrue();
            // Still in chronological order.
            expect(entries.map((e) => e.tick)).toEqual([4, 5, 6, 7, 8]);
            expect(entries[4].text).toBe(
                "A great battle at Star s7: Bot One vs Human. 85 ships were destroyed.",
            );
        });

        it("should use the copy of a battle that shows the most ships", () => {
            const entries = timeline([
                starCombat(4, "s1", ["???", 30]),
                starCombat(4, "s1", [20, 30]),
            ]);

            expect(entries.length).toBe(1);
            expect(entries[0].text).toContain("50 ships were destroyed");
        });

        it("should end with the winner", () => {
            const entries = timeline(
                [
                    {
                        tick: 40,
                        type: "gamePlayerAFK",
                        data: { playerId: "bot2", alias: "Bot Two" },
                    },
                ],
                {
                    endTick: 40,
                    winnerName: "Human",
                    winnerPlayerIds: ["human"],
                },
            );

            expect(entries.map((e) => e.kind)).toEqual([
                "playerAfk",
                "gameEnded",
            ]);
            expect(entries[1].text).toBe("Human won the game.");
        });
    });

    const makeGame = (endDate: Date | null): any => ({
        _id: "game",
        settings: { general: { name: "Solo", aiDifficulty: "hard" } },
        state: {
            tick: 50,
            endDate,
            winner: "bot1",
            winningTeam: null,
        },
        galaxy: {
            stars: [{ _id: "home1", homeStar: true }],
            players: [
                { _id: "human", alias: "Human", userId: "user" },
                {
                    _id: "bot1",
                    alias: "Bot One",
                    userId: null,
                    defeated: false,
                    aiPersona: {
                        key: "silver_tongue",
                        notes: ["Tick 12 plan: betray Human"],
                        agenda: { key: "rival", targetPlayerId: "human" },
                    },
                },
                { _id: "bot2", alias: "Bot Two", userId: null },
            ],
        },
        conversations: [
            {
                participants: ["human", "bot1"],
                messages: [
                    {
                        fromPlayerId: "bot1",
                        message: "We are friends forever",
                        sentDate: new Date(2),
                        sentTick: 11,
                    },
                    {
                        fromPlayerId: "human",
                        message: "Great",
                        sentDate: new Date(3),
                        sentTick: 11,
                    },
                    {
                        fromPlayerId: "bot1",
                        message: "Hello",
                        sentDate: new Date(1),
                        sentTick: 10,
                    },
                    {
                        playerId: "bot1",
                        type: "allies",
                        sentDate: new Date(4),
                    },
                ],
            },
            {
                participants: ["bot1", "bot2"],
                messages: [
                    {
                        fromPlayerId: "bot1",
                        message: "Secret plotting",
                        sentDate: new Date(5),
                        sentTick: 12,
                    },
                ],
            },
        ],
    });

    describe("opponents", () => {
        it("should reveal personas, goals, notes and messages to the viewer", () => {
            const game = makeGame(new Date());
            const opponents = buildStoryOpponents({
                players: game.galaxy.players,
                conversations: game.conversations,
                viewerPlayerId: "human",
            });

            // Only bots with personas.
            expect(opponents.length).toBe(1);

            const bot = opponents[0];

            expect(bot.personaTitle).toBe("The Silver Tongue");
            expect(bot.agenda).toBe("ruin Human");
            expect(bot.agendaTargetPlayerId).toBe("human");
            expect(bot.notes).toEqual(["Tick 12 plan: betray Human"]);
            expect(bot.messagesToYou.map((m) => m.message)).toEqual([
                "Hello",
                "We are friends forever",
            ]);
        });
    });

    describe("access", () => {
        it("should not reveal anything before the game ends", () => {
            expect(() => assertCanViewGameStory(makeGame(null))).toThrow();
            expect(() =>
                buildGameStory(makeGame(null), [], { _id: "human" } as any),
            ).toThrow();
        });

        it("should need AI opponents with personas", () => {
            const game = makeGame(new Date());
            game.galaxy.players[1].aiPersona = null;

            expect(() => assertCanViewGameStory(game)).toThrow();
        });

        it("should build the whole story for a finished game", () => {
            const story = buildGameStory(makeGame(new Date()), [], {
                _id: "human",
            } as any);

            expect(story.winnerAlias).toBe("Bot One");
            expect(story.aiDifficulty).toBe("hard");
            expect(story.timeline.map((e) => e.kind)).toEqual(["gameEnded"]);
            expect(story.opponents.length).toBe(1);
        });
    });
});
