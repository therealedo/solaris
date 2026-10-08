import GameTickService from "../services/gameTick";

describe("unlimited turn wait", () => {
    const createService = (allReady: boolean) => {
        const service = Object.create(GameTickService.prototype);
        service.gameService = {
            isReadyToQuitImmediateEnd: () => false,
            isAllUndefeatedPlayersReady: () => allReady,
        };
        service.gameTypeService = {
            isRealTimeGame: () => false,
            isTurnBasedGame: () => true,
        };
        return service as GameTickService;
    };

    const game = (maxTurnWait: number) =>
        ({
            settings: { gameTime: { maxTurnWait } },
            state: {
                locked: false,
                paused: false,
                endDate: null,
                forceTick: false,
                startDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30),
                lastTickDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
            },
        }) as any;

    it("should wait for the player however long it takes", () => {
        expect(createService(false).canTick(game(0))).toBeFalse();
    });

    it("should tick as soon as everyone is ready", () => {
        expect(createService(true).canTick(game(0))).toBeTrue();
    });

    it("should still tick after a limited wait runs out", () => {
        expect(createService(false).canTick(game(60))).toBeTrue();
    });
});
