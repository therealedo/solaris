import { DistanceService, GameTypeService } from "@solaris/common";
import BotBrainService, {
    parseChatDecision,
    parseStrategyDecision,
} from "../services/botBrain";
import GameCreateService from "../services/gameCreate";
import BotDiplomacyService from "../services/botDiplomacy";
import DiplomacyService from "../services/diplomacy";
import ReputationService from "../services/reputation";
import { LlmUnavailableError } from "../services/llm/types";

const GAME_ID: any = "game";
const DM_ID: any = "dm";

describe("botBrain", () => {
    let game: any;
    let human: any;
    let bot: any;
    let sent: { from: string; convo: any; message: string }[];
    let repoUpdates: any[];
    let llmResponses: any[];
    let llmRequests: any[];
    let diplomacyService: DiplomacyService;
    let brain: BotBrainService;
    let gameLocked: boolean;
    let delays: number;

    const fakeEventService: any = {
        createPlayerDiplomacyStatusChanged: async () => {},
        createGameDiplomacyPeaceDeclared: async () => {},
        createGameDiplomacyWarDeclared: async () => {},
        createPlayerConversationCreated: async () => {},
        createPlayerConversationInvited: async () => {},
    };

    const createPlayer = (
        id: string,
        alias: string,
        userId: string | null,
    ) => ({
        _id: id,
        alias,
        userId,
        defeated: false,
        diplomacy: [],
        reputations: [],
        research: { hyperspace: { level: 1 } },
        aiState: null,
        aiPersona: userId
            ? null
            : { key: "silver_tongue", notes: [], lastStrategyCycle: 0 },
    });

    const fakeRepo: any = {
        updateOne: async (query, update, options) => {
            repoUpdates.push({ query, update, options });
        },
    };

    const createBrain = (withLlm: boolean, onDelay: () => void = () => {}) => {
        const llm: any = {
            name: "fake",
            generateJson: async (request) => {
                llmRequests.push(request);
                const next = llmResponses.shift();

                if (next instanceof Error) {
                    throw next;
                }

                return next;
            },
        };

        diplomacyService = new DiplomacyService(
            fakeRepo,
            {} as any,
            {
                isAllianceUpkeepEnabled: () => false,
            } as any,
        );

        const reputationService = new ReputationService(
            fakeRepo,
            {} as any,
            diplomacyService,
            {} as any,
        );

        const fakeConversationService: any = {
            create: async (g, playerId, name, participantIds) => ({
                _id: "newConvo",
                name,
                participants: [playerId, ...participantIds],
                messages: [],
            }),
            sendToConversation: async (g, player, convo, message) => {
                sent.push({ from: player._id, convo, message });
            },
        };

        const botDiplomacyService = new BotDiplomacyService(
            diplomacyService,
            fakeConversationService,
            reputationService,
            {
                getStats: () => ({ totalStars: 10, totalShips: 100 }),
            } as any,
            new DistanceService(),
            new GameTypeService(),
            { getRandomNumber: () => 0 } as any,
            withLlm ? llm : null,
        );

        return new BotBrainService(
            botDiplomacyService,
            fakeRepo,
            new GameTypeService(),
            withLlm ? llm : null,
            async () => game,
            async () => {
                delays++;
                onDelay();
            },
            async (_gameId, work) => {
                if (gameLocked) {
                    return false;
                }

                await work();
                return true;
            },
        );
    };

    beforeEach(() => {
        human = createPlayer("human", "Hero", "user1");
        bot = createPlayer("bot", "Robo", null);

        game = {
            _id: GAME_ID,
            settings: {
                general: {
                    type: "single_player",
                    mode: "conquest",
                    playerLimit: 2,
                },
                galaxy: { productionTicks: 10 },
                diplomacy: {
                    enabled: "enabled",
                    lockedAlliances: "disabled",
                    maxAlliances: 1,
                    globalEvents: "disabled",
                },
                specialGalaxy: {},
            },
            constants: { distances: { lightYear: 50 } },
            state: {
                tick: 12,
                productionTick: 1,
                starsForVictory: 100,
                startDate: new Date(),
                endDate: null,
            },
            galaxy: { players: [human, bot], stars: [] },
            conversations: [
                {
                    _id: DM_ID,
                    createdBy: "human",
                    participants: ["human", "bot"],
                    messages: [
                        {
                            fromPlayerId: "human",
                            fromPlayerAlias: "Hero",
                            message: "Robo, shall we join forces?",
                            sentTick: 12,
                        },
                    ],
                },
                {
                    _id: "global",
                    createdBy: null,
                    participants: ["human", "bot"],
                    messages: [],
                },
            ],
        };

        sent = [];
        repoUpdates = [];
        llmResponses = [];
        llmRequests = [];
        gameLocked = false;
        delays = 0;
    });

    const status = () =>
        diplomacyService.getDiplomaticStatusToPlayer(game, bot._id, human._id);

    it("should reply in character and apply the chosen action", async () => {
        brain = createBrain(true);
        llmResponses.push({
            reply: "Of course, dear friend. Together we are unstoppable.",
            action: "ally",
            memoryNote: "Promised Hero an alliance, plan to betray later.",
        });

        await brain.replyToConversation(
            GAME_ID,
            DM_ID,
            fakeEventService,
            {} as any,
        );

        expect(sent.length).toBe(1);
        expect(sent[0].message).toContain("Together we are unstoppable");
        expect(status().statusTo).toBe("allies");
        expect(bot.aiPersona.notes[0]).toContain("betray later");
        expect(llmRequests[0].system).toContain("Silver Tongue");
        expect(llmRequests[0].prompt).toContain("shall we join forces");
    });

    it("should fall back to rules when the LLM fails", async () => {
        brain = createBrain(true);
        llmResponses.push(new Error("boom"));

        await brain.replyToConversation(
            GAME_ID,
            DM_ID,
            fakeEventService,
            {} as any,
        );

        expect(sent.length).toBe(1);
        expect(sent[0].from).toBe("bot");
    });

    it("should reply with rules when no LLM is configured", async () => {
        brain = createBrain(false);

        await brain.replyToConversation(
            GAME_ID,
            DM_ID,
            fakeEventService,
            {} as any,
        );

        expect(sent.length).toBe(1);
        expect(llmRequests.length).toBe(0);
    });

    it("should play one strategy turn per production cycle", async () => {
        brain = createBrain(true);
        llmResponses.push({
            plan: "Befriend Hero, then strike when they are weak.",
            actions: [{ target: "hero", action: "ally" }],
            messages: [
                { to: "Hero", text: "A gift of friendship, commander." },
                { to: "everyone", text: "The galaxy will remember this day." },
            ],
        });

        await brain.playStrategyTurns(GAME_ID, fakeEventService, {} as any);
        await brain.playStrategyTurns(GAME_ID, fakeEventService, {} as any);

        expect(llmRequests.length).toBe(1);
        expect(status().statusTo).toBe("allies");
        expect(sent.map((s) => s.convo._id)).toEqual(["dm", "global"]);
        expect(bot.aiPersona.lastStrategyCycle).toBe(1);
        expect(bot.aiPersona.notes[0]).toContain("Cycle 1 plan");
    });

    it("should retry the strategy turn later when out of quota", async () => {
        brain = createBrain(true);
        llmResponses.push(new LlmUnavailableError("quota"));

        await brain.playStrategyTurns(GAME_ID, fakeEventService, {} as any);

        expect(bot.aiPersona.lastStrategyCycle).toBe(0);
        expect(sent.length).toBe(0);
    });

    it("should ignore games that are not single player", async () => {
        brain = createBrain(true);
        game.settings.general.type = "custom";

        await brain.replyToConversation(
            GAME_ID,
            DM_ID,
            fakeEventService,
            {} as any,
        );

        expect(sent.length).toBe(0);
    });

    describe("malformed LLM answers", () => {
        const reply = () =>
            brain.replyToConversation(
                GAME_ID,
                DM_ID,
                fakeEventService,
                {} as any,
            );
        const strategy = () =>
            brain.playStrategyTurns(GAME_ID, fakeEventService, {} as any);

        for (const [name, answer] of [
            ["a string", "Sure, let's be allies!"],
            ["null", null],
            ["an array", [{ reply: "hi" }]],
            ["an empty reply", { reply: "  ", action: "ally", memoryNote: "" }],
            ["a non-string reply", { reply: 42, action: "ally" }],
        ] as [string, unknown][]) {
            it(`should fall back to rules when the chat answer is ${name}`, async () => {
                brain = createBrain(true);
                llmResponses.push(answer);

                await reply();

                expect(sent.length).toBe(1);
                expect(sent[0].message).not.toBe("hi");
                expect(bot.aiPersona.notes.length).toBe(0);
            });
        }

        it("should ignore an unknown chat action but still reply", async () => {
            brain = createBrain(true);
            llmResponses.push({
                reply: "Perhaps.",
                action: "nukeEverything",
                memoryNote: { secret: true },
            });

            await reply();

            expect(sent.map((m) => m.message)).toEqual(["Perhaps."]);
            expect(status().statusTo).toBe("neutral");
            expect(bot.aiPersona.notes.length).toBe(0);
        });

        it("should use up the cycle without acting when the strategy answer is not an object", async () => {
            brain = createBrain(true);
            llmResponses.push("I will ally with Hero.");

            await strategy();

            expect(sent.length).toBe(0);
            expect(status().statusTo).toBe("neutral");
            expect(bot.aiPersona.lastStrategyCycle).toBe(1);
        });

        it("should skip strategy fields with the wrong shape", async () => {
            brain = createBrain(true);
            llmResponses.push({
                plan: 7,
                actions: { target: "Hero", action: "ally" },
                messages: "Hello everyone",
            });

            await strategy();

            expect(sent.length).toBe(0);
            expect(status().statusTo).toBe("neutral");
            expect(bot.aiPersona.lastStrategyCycle).toBe(1);
            expect(bot.aiPersona.notes.length).toBe(0);
        });

        it("should keep only valid strategy actions and messages", async () => {
            brain = createBrain(true);
            llmResponses.push({
                plan: "Keep everyone guessing.",
                actions: [
                    null,
                    { target: 5, action: "ally" },
                    { target: "Hero", action: "launchNukes" },
                    { target: "Nobody", action: "declareWar" },
                    { target: "Hero", action: "declareWar" },
                ],
                messages: [
                    "stray text",
                    { to: "Hero", text: null },
                    { to: null, text: "Hello" },
                    { to: "Hero", text: "Watch your borders." },
                ],
            });

            await strategy();

            expect(status().statusTo).toBe("enemies");
            expect(sent.map((m) => m.message)).toEqual(["Watch your borders."]);
        });

        it("should parse decisions defensively", () => {
            expect(parseChatDecision(undefined)).toBeNull();
            expect(parseChatDecision({})).toEqual({
                reply: "",
                action: "none",
                memoryNote: "",
            });
            expect(parseStrategyDecision({ plan: "x" })).toEqual({
                plan: "x",
                actions: [],
                messages: [],
            });
        });
    });

    describe("strategy turns and game ticks", () => {
        it("should not apply anything while a tick holds the game lock", async () => {
            brain = createBrain(true);
            gameLocked = true;
            llmResponses.push({
                plan: "Ally Hero.",
                actions: [{ target: "Hero", action: "ally" }],
                messages: [],
            });

            await brain.playStrategyTurns(GAME_ID, fakeEventService, {} as any);

            expect(status().statusTo).toBe("neutral");
            expect(bot.aiPersona.lastStrategyCycle).toBe(0);
        });

        it("should drop plans made for a cycle that has already ended", async () => {
            brain = createBrain(true);
            const llm: any = brain.llmProvider;
            const generate = llm.generateJson;
            llm.generateJson = async (request) => {
                const answer = await generate(request);
                game.state.productionTick = 2; // a tick ran during the LLM call
                return answer;
            };
            llmResponses.push({
                plan: "Ally Hero.",
                actions: [{ target: "Hero", action: "ally" }],
                messages: [],
            });

            await brain.playStrategyTurns(GAME_ID, fakeEventService, {} as any);

            expect(status().statusTo).toBe("neutral");
            expect(bot.aiPersona.lastStrategyCycle).toBe(0);
        });

        it("should treat every tick as a new cycle when cycles are one tick long", () => {
            brain = createBrain(false);
            game.settings.galaxy.productionTicks = 1;

            const ctx = brain.botDiplomacyService.createContext(
                game,
                fakeEventService,
                {} as any,
                false,
            );

            expect(ctx!.isFirstTickOfCycle).toBeTrue();
        });
    });

    describe("chat timing", () => {
        it("should answer a message sent while the bot was still replying", async () => {
            let firstDelay = true;
            brain = createBrain(false, () => {
                if (firstDelay) {
                    firstDelay = false;
                    // The second message arrives while the bot is "typing".
                    brain.onHumanMessage(
                        GAME_ID,
                        DM_ID,
                        fakeEventService,
                        {} as any,
                    );
                }
            });

            const fakeConversationService: any =
                brain.botDiplomacyService.conversationService;
            fakeConversationService.sendToConversation = async (
                g,
                player,
                convo,
                message,
            ) => {
                sent.push({ from: player._id, convo, message });
                convo.messages.push({
                    fromPlayerId: player._id,
                    fromPlayerAlias: player.alias,
                    message,
                    sentTick: 12,
                });

                if (sent.length === 1) {
                    convo.messages.push({
                        fromPlayerId: "human",
                        fromPlayerAlias: "Hero",
                        message: "Well? Do we have a deal?",
                        sentTick: 12,
                    });
                }
            };

            await brain.onHumanMessage(
                GAME_ID,
                DM_ID,
                fakeEventService,
                {} as any,
            );

            expect(sent.length).toBe(2);
        });

        it("should wait for a running tick before replying", async () => {
            game.state.locked = true;
            brain = createBrain(false, () => {
                game.state.locked = false;
            });

            await brain.replyToConversation(
                GAME_ID,
                DM_ID,
                fakeEventService,
                {} as any,
            );

            expect(delays).toBe(1);
            expect(sent.length).toBe(1);
        });
    });

    describe("single player game limit", () => {
        it("should refuse a fourth single player game in progress", async () => {
            const service: any = Object.create(GameCreateService.prototype);
            let count = 2;
            service.gameListService = {
                countInProgressSinglePlayerGamesCreatedByUser: async () =>
                    count,
            };

            await service._validateUserCanCreateSinglePlayerGame("user1");

            count = 3;
            await expectAsync(
                service._validateUserCanCreateSinglePlayerGame("user1"),
            ).toBeRejectedWithError(/at most 3 single player games/);
        });
    });
});
