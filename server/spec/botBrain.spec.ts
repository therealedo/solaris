import { DistanceService, GameTypeService } from "@solaris/common";
import BotBrainService from "../services/botBrain";
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

    const createBrain = (withLlm: boolean) => {
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
            async () => {},
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
});
