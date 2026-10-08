import { GameTypeService } from "@solaris/common";
import AIService from "../services/ai";
import {
    BotVisibility,
    estimateHiddenGarrison,
    isPersonaBot,
} from "../services/botVisibility";
import { chooseBotResearch } from "../services/botResearch";
import {
    getSpecialistBudget,
    getSpecialistPreferences,
    pickSpecialistHire,
    SpecialistOption,
} from "../services/botSpecialists";

// Repeats the given values as a stand in for Math.random.
const sequence = (...values: number[]) => {
    let i = 0;
    return () => values[i++ % values.length];
};

const ALL_TECHS: any[] = [
    "scanning",
    "hyperspace",
    "terraforming",
    "experimentation",
    "weapons",
    "banking",
    "manufacturing",
    "specialists",
];

// How often each tech is picked over a sweep of evenly spread random numbers.
const researchCounts = (persona: string, techs: any[], atWar = false) => {
    const counts: Record<string, number> = {};

    for (let i = 0; i < 1000; i++) {
        const tech = chooseBotResearch(persona, techs, atWar, () => i / 1000)!;
        counts[tech] = (counts[tech] ?? 0) + 1;
    }

    return counts;
};

describe("persona bots", () => {
    it("should only treat players with a persona and no user as persona bots", () => {
        expect(isPersonaBot({ aiPersona: { key: "warlord" } } as any)).toBe(
            true,
        );
        expect(
            isPersonaBot({
                aiPersona: { key: "warlord" },
                userId: "user",
            } as any),
        ).toBe(false);
        expect(isPersonaBot({ aiPersona: null } as any)).toBe(false);
        expect(isPersonaBot({ defeated: true, userId: "user" } as any)).toBe(
            false,
        );
    });
});

describe("bot visibility", () => {
    const visibility = (unscannedStarsUnknown: boolean) =>
        new BotVisibility(
            new Set(["own", "enemy", "nebula"]),
            new Set(["wormholeEnd"]),
            new Set(["ownCarrier", "enemyCarrier", "scrambler"]),
            new Set(["nebula", "scrambler"]),
            unscannedStarsUnknown,
        );

    it("should know every star in a normal galaxy but only scanned ones in a dark galaxy", () => {
        expect(visibility(false).isStarKnown("faraway")).toBe(true);
        expect(visibility(true).isStarKnown("faraway")).toBe(false);
        expect(visibility(true).isStarKnown("enemy")).toBe(true);
        expect(visibility(true).isStarKnown("wormholeEnd")).toBe(true);
    });

    it("should only see ships on scanned stars and carriers that don't hide them", () => {
        const v = visibility(false);

        expect(v.canSeeStarShips("enemy")).toBe(true);
        expect(v.canSeeStarShips("faraway")).toBe(false);
        expect(v.canSeeStarShips("nebula")).toBe(false);
        expect(v.canSeeStarShips("wormholeEnd")).toBe(false);
        expect(v.canSeeCarrierShips("enemyCarrier")).toBe(true);
        expect(v.canSeeCarrierShips("scrambler")).toBe(false);
        expect(v.canSeeCarrierShips("unseenCarrier")).toBe(false);
        expect(v.isCarrierVisible("unseenCarrier")).toBe(false);
    });

    it("should only see the details of scanned stars that aren't nebulas", () => {
        const v = visibility(false);

        expect(v.canSeeStarDetails({ _id: "enemy" })).toBe(true);
        expect(v.canSeeStarDetails({ _id: "faraway" })).toBe(false);
        expect(v.canSeeStarDetails({ _id: "nebula", isNebula: true })).toBe(
            false,
        );
    });

    it("should guess hidden garrisons cautiously", () => {
        expect(estimateHiddenGarrison(40, 5)).toBe(60);
        expect(estimateHiddenGarrison(undefined, 30)).toBe(45);
        expect(estimateHiddenGarrison(0, 0)).toBe(15);
    });
});

describe("persona bot AI", () => {
    let ai: any;

    const star = (id: string, owner: string | null, ships: number) => ({
        _id: id,
        ownedByPlayerId: owner,
        ships,
        shipsActual: ships,
        infrastructure: { economy: 0, industry: 0, science: 0 },
    });

    beforeEach(() => {
        ai = Object.create(AIService.prototype);
        ai.gameTypeService = new GameTypeService();
    });

    it("should only see stars and carriers in its scanning range", () => {
        const own = star("own", "bot", 10);
        const near = star("near", "enemy", 20);
        const nebula = { ...star("nebula", "enemy", 30), isNebula: true };
        const wormhole = star("wormhole", null, 0);
        const ownCarrier = {
            _id: "c1",
            ownedByPlayerId: "bot",
            waypoints: [{ destination: "target" }],
        };
        const enemyCarrier = {
            _id: "c2",
            ownedByPlayerId: "enemy",
            waypoints: [],
        };

        ai.scanningService = {
            calculateViewpointScanning: () => ({
                stars: new Set([own, near, nebula, wormhole]),
                carriers: new Set([ownCarrier, enemyCarrier]),
                unscannedWormHoles: new Set([wormhole]),
            }),
        };
        ai.starService = {
            canPlayersSeeStarShips: (s) => !s.isNebula,
        };
        ai.carrierService = { canPlayersSeeCarrierShips: () => true };

        const game = {
            settings: { specialGalaxy: { darkGalaxy: "standard" } },
        };
        const v: BotVisibility = ai._createBotVisibility(game, {
            _id: "bot",
        });

        expect(v.isStarScanned("near")).toBe(true);
        expect(v.isStarScanned("wormhole")).toBe(false);
        expect(v.isStarKnown("wormhole")).toBe(true);
        expect(v.isStarKnown("target")).toBe(true);
        expect(v.isStarKnown("faraway")).toBe(false);
        expect(v.canSeeStarShips("nebula")).toBe(false);
        expect(v.isCarrierVisible("c2")).toBe(true);
    });

    it("should plan with real garrisons it can see and estimates of hidden ones", () => {
        const visible = star("visible", "enemy", 25);
        const hidden = star("hidden", "enemy", 500);
        const visibility = new BotVisibility(
            new Set(["own", "visible"]),
            new Set(),
            new Set(),
            new Set(),
            false,
        );
        const context = {
            visibility,
            playerStars: [star("own", "bot", 12)],
            knownEnemyGarrisons: ai._findKnownEnemyGarrisons(
                [visible, hidden],
                { _id: "bot" },
                visibility,
            ),
        };

        expect(ai._getKnownStarShips(context, visible)).toBe(25);
        // Never the real 500, but more than the largest garrison seen.
        expect(ai._getKnownStarShips(context, hidden)).toBe(38);
        // AI without a persona keeps playing with full knowledge.
        expect(ai._getKnownStarShips({ visibility: null }, hidden)).toBe(500);
    });

    it("should pick research that can be researched and keep its current one", () => {
        ai.technologyService = {
            getResearchableTechnologies: () => ["weapons", "banking"],
        };

        const player: any = {
            aiPersona: { key: "warlord" },
            researchingNow: "banking",
            researchingNext: "random",
        };
        const game: any = {
            state: { tick: 50 },
            settings: { galaxy: { productionTicks: 24 } },
        };

        ai._choosePersonaResearch(game, player);

        expect(["weapons", "banking"]).toContain(player.researchingNext);
        expect(player.researchingNow).toBe("banking");

        player.researchingNow = "scanning";
        ai._choosePersonaResearch(game, player);

        expect(["weapons", "banking"]).toContain(player.researchingNow);
    });

    it("should hire through the hire service without writing to the database", async () => {
        const specs = [
            { id: 3, baseCostCredits: 300 },
            { id: 4, baseCostCredits: 500 },
        ];
        const hired: any[] = [];
        const homeStar = star("home", "bot", 5);
        const carrier = {
            _id: "carrier",
            ownedByPlayerId: "bot",
            orbiting: "home",
            ships: 40,
        };

        ai.specialistService = {
            listStar: () => [],
            listCarrier: () => specs,
            getSpecialistActualCost: (_game, s) => ({
                credits: s.baseCostCredits,
                creditsSpecialists: 0,
            }),
        };
        ai.specialistBanService = {
            isStarSpecialistBanned: () => false,
            isCarrierSpecialistBanned: (_game, id) => id === 4,
        };
        ai.starService = {
            listStarsOwnedByPlayer: () => [homeStar],
            getById: () => homeStar,
        };
        ai.carrierService = { listCarriersOwnedByPlayer: () => [carrier] };
        ai.starDataService = { isDeadStar: () => false };
        ai.specialistHireService = {
            hireCarrierSpecialist: async (...args) => hired.push(args),
        };

        const game: any = {
            galaxy: { stars: [homeStar], carriers: [carrier] },
            settings: {
                specialGalaxy: {
                    specialistCost: "standard",
                    specialistsCurrency: "credits",
                },
            },
        };
        const player: any = {
            _id: "bot",
            homeStarId: "home",
            credits: 2000,
            aiPersona: { key: "warlord" },
        };

        spyOn(Math, "random").and.returnValue(0.4);
        await ai._hirePersonaSpecialist(game, player);

        expect(hired.length).toBe(1);
        // The General is banned, so the Colonel goes on the largest carrier.
        expect(hired[0][2]).toBe("carrier");
        expect(hired[0][3]).toBe(3);
        expect(hired[0][5]).toBe(false);
    });
});

describe("persona research", () => {
    it("should favour weapons for warlords and zealots", () => {
        for (const persona of ["warlord", "zealot"]) {
            const counts = researchCounts(persona, ALL_TECHS);
            const top = Object.keys(counts).sort(
                (a, b) => counts[b] - counts[a],
            )[0];

            expect(top).toBe("weapons");
        }
    });

    it("should favour banking and manufacturing for merchant princes", () => {
        const counts = researchCounts("merchant_prince", ALL_TECHS);

        expect(counts.banking).toBeGreaterThan(counts.weapons ?? 0);
        expect(counts.manufacturing).toBeGreaterThan(counts.weapons ?? 0);
    });

    it("should favour weapons and scanning for paranoid isolationists", () => {
        const counts = researchCounts("paranoid_isolationist", ALL_TECHS);

        expect(counts.weapons).toBeGreaterThan(counts.banking);
        expect(counts.scanning).toBeGreaterThan(counts.banking);
    });

    it("should adapt opportunists to war and peace", () => {
        const war = researchCounts("opportunist", ALL_TECHS, true);
        const peace = researchCounts("opportunist", ALL_TECHS, false);

        expect(war.weapons).toBeGreaterThan(war.banking);
        expect(peace.banking).toBeGreaterThan(peace.weapons);
    });

    it("should only pick enabled technologies, with some variety", () => {
        const counts = researchCounts("warlord", ["banking", "scanning"]);

        expect(Object.keys(counts).sort()).toEqual(["banking", "scanning"]);
        expect(chooseBotResearch("warlord", [], false, Math.random)).toBe(null);
    });
});

describe("persona specialists", () => {
    const options: SpecialistOption[] = [
        { kind: "carrier", id: 4, cost: 500 },
        { kind: "carrier", id: 3, cost: 300 },
        { kind: "carrier", id: 2, cost: 200 },
        { kind: "star", id: 2, cost: 200 },
        { kind: "star", id: 4, cost: 200 },
        { kind: "star", id: 11, cost: 500 },
    ];
    const everywhere = { star: true, carrier: true };

    it("should only spend a fraction of its funds", () => {
        expect(getSpecialistBudget("credits", 1000)).toBe(250);
        expect(getSpecialistBudget("creditsSpecialists", 9)).toBe(4);
        expect(getSpecialistBudget("credits", -50)).toBe(0);
    });

    it("should hire its persona's preferred specialist it can afford", () => {
        const pick = pickSpecialistHire(
            getSpecialistPreferences("warlord", false),
            options,
            350,
            everywhere,
            () => 0.9,
        );

        expect(pick).toEqual({ kind: "carrier", id: 3, cost: 300 });
    });

    it("should sometimes pass over its first choice", () => {
        const pick = pickSpecialistHire(
            getSpecialistPreferences("warlord", false),
            options,
            350,
            everywhere,
            sequence(0.1, 0.9),
        );

        expect(pick).toEqual({ kind: "star", id: 2, cost: 200 });
    });

    it("should skip specialists that are banned, too expensive or have nowhere to go", () => {
        const preferences = getSpecialistPreferences("warlord", false);

        expect(
            pickSpecialistHire(
                preferences,
                options.filter((o) => o.kind === "star"),
                350,
                everywhere,
                () => 0.9,
            ),
        ).toEqual({ kind: "star", id: 2, cost: 200 });
        expect(
            pickSpecialistHire(preferences, options, 100, everywhere, () => 0),
        ).toBe(null);
        expect(
            pickSpecialistHire(
                preferences,
                options,
                1000,
                { star: false, carrier: false },
                () => 0,
            ),
        ).toBe(null);
    });

    it("should hire defensively when paranoid and economically when trading", () => {
        expect(
            getSpecialistPreferences("paranoid_isolationist", true)[0],
        ).toEqual({ kind: "star", id: 4 });
        expect(getSpecialistPreferences("merchant_prince", true)[0]).toEqual({
            kind: "star",
            id: 11,
        });
        expect(getSpecialistPreferences("silver_tongue", true)).toEqual(
            getSpecialistPreferences("warlord", false),
        );
    });
});
