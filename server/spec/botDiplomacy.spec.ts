import { DistanceService, GameTypeService } from "@solaris/common";
import BotDiplomacyService from "../services/botDiplomacy";
import DiplomacyService from "../services/diplomacy";
import ReputationService from "../services/reputation";

describe("botDiplomacy", () => {
    let game: any;
    let human: any;
    let bot: any;
    let otherBot: any;
    let sent: { from: string; convo: any; message: string }[];
    let created: any[];
    let diplomacyService: DiplomacyService;
    let service: BotDiplomacyService;

    const fakeEventService: any = {
        createPlayerDiplomacyStatusChanged: async () => {},
        createGameDiplomacyPeaceDeclared: async () => {},
        createGameDiplomacyWarDeclared: async () => {},
    };
    const fakeNotificationService: any = {};

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
    });

    beforeEach(() => {
        human = createPlayer("human", "Hero", "user1");
        bot = createPlayer("bot", "Robo", null);
        otherBot = createPlayer("bot2", "Droid", null);

        game = {
            _id: "game",
            settings: {
                general: {
                    type: "single_player",
                    mode: "conquest",
                    playerLimit: 3,
                },
                galaxy: { productionTicks: 10 },
                diplomacy: {
                    enabled: "enabled",
                    lockedAlliances: "disabled",
                    maxAlliances: 2,
                    globalEvents: "disabled",
                },
                specialGalaxy: {},
            },
            constants: { distances: { lightYear: 50 } },
            state: { tick: 5, starsForVictory: 100 },
            galaxy: {
                players: [human, bot, otherBot],
                stars: [],
            },
            conversations: [],
        };

        sent = [];
        created = [];

        diplomacyService = new DiplomacyService(
            {} as any,
            {} as any,
            { isAllianceUpkeepEnabled: () => false } as any,
        );

        const reputationService = new ReputationService(
            {} as any,
            {} as any,
            diplomacyService,
            {} as any,
        );

        const fakeConversationService: any = {
            create: async (g, playerId, name, participantIds) => {
                const convo = {
                    _id: `convo${created.length}`,
                    name,
                    participants: [playerId, ...participantIds],
                    messages: [],
                };
                created.push(convo);
                return convo;
            },
            sendToConversation: async (g, player, convo, message) => {
                sent.push({ from: player._id, convo, message });
                convo.messages.push({
                    fromPlayerId: player._id,
                    message,
                    sentTick: g.state.tick,
                });
            },
        };

        const fakePlayerStatisticsService: any = {
            getStats: () => ({ totalStars: 10, totalShips: 100 }),
        };

        service = new BotDiplomacyService(
            diplomacyService,
            fakeConversationService,
            reputationService,
            fakePlayerStatisticsService,
            new DistanceService(),
            new GameTypeService(),
            { getRandomNumber: () => 0 } as any,
        );
    });

    const play = () =>
        service.play(game, fakeEventService, fakeNotificationService);

    const status = (a: any, b: any) =>
        diplomacyService.getDiplomaticStatusToPlayer(game, a._id, b._id);

    it("should do nothing outside of single player games", async () => {
        game.settings.general.type = "custom";
        human.diplomacy.push({ playerId: "bot", status: "allies" });

        await play();

        expect(status(bot, human).actualStatus).not.toBe("allies");
        expect(sent.length).toBe(0);
    });

    it("should accept an alliance offer from a trusted player", async () => {
        human.diplomacy.push({ playerId: "bot", status: "allies" });

        await play();

        expect(status(bot, human).actualStatus).toBe("allies");
        expect(sent.some((s) => s.from === "bot")).toBeTrue();
        expect(
            bot.reputations.find((r) => r.playerId === "human").score,
        ).toBeGreaterThanOrEqual(5);
    });

    it("should decline an offer from a distrusted player only once", async () => {
        human.diplomacy.push({ playerId: "bot", status: "allies" });
        bot.reputations.push({ playerId: "human", score: -3 });

        await play();
        const messagesAfterFirstTick = sent.filter((s) => s.from === "bot");

        await play();
        const messagesAfterSecondTick = sent.filter((s) => s.from === "bot");

        expect(status(bot, human).actualStatus).not.toBe("allies");
        expect(messagesAfterFirstTick.length).toBe(1);
        expect(messagesAfterSecondTick.length).toBe(1);
    });

    it("should reply to a direct message once", async () => {
        game.conversations.push({
            _id: "dm",
            participants: ["human", "bot"],
            messages: [
                { fromPlayerId: "human", message: "Hello Robo!", sentTick: 5 },
            ],
        });

        await play();
        await play();

        const replies = sent.filter((s) => s.convo._id === "dm");

        expect(replies.length).toBe(1);
        expect(replies[0].from).toBe("bot");
    });

    it("should only reply in group chats when mentioned", async () => {
        game.conversations.push({
            _id: "global",
            participants: ["human", "bot", "bot2"],
            messages: [
                { fromPlayerId: "human", message: "Hi everyone", sentTick: 5 },
                {
                    fromPlayerId: "human",
                    message: "Droid, want an alliance?",
                    sentTick: 5,
                },
            ],
        });

        await play();

        const replies = sent.filter((s) => s.convo._id === "global");

        expect(replies.length).toBe(1);
        expect(replies[0].from).toBe("bot2");
        // Asking for an alliance makes the bot offer one back.
        expect(status(otherBot, human).statusTo).toBe("allies");
    });

    it("should betray an ally that is about to win", async () => {
        game.state.tick = 11; // First tick of a production cycle.
        human.diplomacy.push({ playerId: "bot", status: "allies" });
        bot.diplomacy.push({ playerId: "human", status: "allies" });

        service.playerStatisticsService = {
            getStats: (g, p) =>
                p._id === "human"
                    ? { totalStars: 80, totalShips: 500 }
                    : { totalStars: 10, totalShips: 100 },
        } as any;

        await play();

        expect(status(bot, human).actualStatus).not.toBe("allies");
        expect(
            bot.reputations.find((r) => r.playerId === "human").score,
        ).toBeLessThan(0);
    });
});
