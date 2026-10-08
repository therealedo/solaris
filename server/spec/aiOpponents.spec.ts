import { GameTypeService } from "@solaris/common";
import GameJoinService from "../services/gameJoin";
import GameCreateService from "../services/gameCreate";
import GameStateService from "../services/gameState";

describe("AI opponents in games with several humans", () => {
    let game: any;
    let joinService: any;
    let createService: any;

    const slot = (i: number) => ({
        _id: `p${i}`,
        userId: null,
        alias: `Empty Slot ${i}`,
        isOpenSlot: true,
        defeated: false,
        afk: false,
        aiPersona: null,
    });

    beforeEach(() => {
        game = {
            settings: {
                general: {
                    type: "custom",
                    playerLimit: 4,
                    aiOpponents: 2,
                },
                gameTime: { gameType: "turnBased", startDelay: 0 },
            },
            state: { players: 0, startDate: null },
            galaxy: { players: [0, 1, 2, 3].map(slot) },
            afkers: [],
        };

        joinService = Object.create(GameJoinService.prototype);
        joinService.gameTypeService = new GameTypeService();
        joinService.gameStateService = Object.assign(
            Object.create(GameStateService.prototype),
            {},
        );
        joinService.spectatorService = { clearSpectating: () => {} };
        joinService.playerService = { updateLastSeen: () => {} };
        joinService.avatarService = {
            listAllAliases: () => ["Alpha", "Beta", "Gamma", "Delta"],
            listAllSolarisAvatars: () => [1, 2, 3, 4].map((id) => ({ id })),
        };
        joinService.randomService = { getRandomNumberBetween: (min) => min };

        createService = Object.create(GameCreateService.prototype);
        createService.gameJoinService = joinService;
    });

    const humans = () => game.galaxy.players.filter((p) => p.isOpenSlot);
    const join = (player: any, name: string) =>
        joinService.assignPlayerToUser(game, player, `user-${name}`, name, 1);

    it("should hand slots to persona bots that stay closed", () => {
        createService._setupAiOpponentSlots(game);

        const bots = game.galaxy.players.filter((p) => p.aiPersona);

        expect(bots.length).toBe(2);
        expect(bots.every((b) => !b.isOpenSlot && !b.userId)).toBeTrue();
        expect(
            bots.every((b) => b.alias && !b.alias.startsWith("Empty")),
        ).toBeTrue();
        expect(humans().length).toBe(2);
    });

    it("should start once the humans fill the remaining slots", () => {
        createService._setupAiOpponentSlots(game);
        const [first, second] = humans();

        expect(join(first, "Ann")).toBeFalse();
        expect(join(second, "Bob")).toBeTrue();
        expect(game.state.startDate).not.toBeNull();
    });

    it("should keep the bots' names when the game starts", () => {
        createService._setupAiOpponentSlots(game);
        const aliases = game.galaxy.players
            .filter((p) => p.aiPersona)
            .map((p) => p.alias);
        humans().forEach((p, i) => join(p, `Human${i}`));

        joinService.assignNonUserPlayersToAI(game);

        expect(
            game.galaxy.players.filter((p) => p.aiPersona).map((p) => p.alias),
        ).toEqual(aliases);
    });

    it("should not add bots when none were asked for", () => {
        game.settings.general.aiOpponents = 0;

        createService._setupAiOpponentSlots(game);

        expect(humans().length).toBe(4);
    });

    it("should use the creator's picks for the bots, then forget them", () => {
        game.settings.general.aiOpponentChoices =
            createService._validateAiOpponentChoices([
                { persona: "warlord", alias: "  Darth  Vex ", avatar: 3 },
                { persona: "random", alias: "", avatar: 99 },
            ]);

        createService._setupAiOpponentSlots(game);

        const bots = game.galaxy.players.filter((p) => p.aiPersona);
        const warlord = bots.find((b) => b.aiPersona.key === "warlord");

        expect(warlord.alias).toBe("Darth Vex");
        expect(warlord.avatar).toBe("3");
        expect(bots.some((b) => b.aiPersona.key === "random")).toBeTrue();
        expect(game.settings.general.aiOpponentChoices).toBeUndefined();
    });

    it("should refuse names that are too short", () => {
        expect(() =>
            createService._validateAiOpponentChoices([{ alias: "X" }]),
        ).toThrow();
    });
});
