import {
    debriefTemplate,
    describeAgenda,
    isAgendaAchieved,
} from "../services/botAgendas";
import {
    BotView,
    applyObservations,
    decayFeelings,
    describeFeeling,
    detectObservations,
    takeSnapshot,
} from "../services/botObservations";

describe("botObservations", () => {
    const view = (overrides: Partial<BotView> = {}): BotView => ({
        tick: 10,
        ownedStars: new Map([
            ["home", "Sol"],
            ["s1", "Vega"],
        ]),
        starOwners: new Map<string, string | null>([
            ["home", "bot"],
            ["s1", "bot"],
            ["s2", "hero"],
        ]),
        starNames: new Map([
            ["home", "Sol"],
            ["s1", "Vega"],
            ["s2", "Rigel"],
        ]),
        homeStarId: "home",
        incomingAttacks: [],
        statusFrom: new Map([["hero", "neutral"]]),
        reputation: new Map([["hero", 0]]),
        starsHeld: new Map([["hero", 5]]),
        defeated: new Set(),
        names: new Map([
            ["bot", "Robo"],
            ["hero", "Hero"],
        ]),
        starsForVictory: 20,
        ...overrides,
    });

    it("should need a previous look to notice anything", () => {
        expect(detectObservations(undefined, view())).toEqual([]);
    });

    it("should notice nothing when nothing changed", () => {
        expect(detectObservations(takeSnapshot(view()), view())).toEqual([]);
    });

    it("should notice a lost star and who took it", () => {
        const after = view({
            ownedStars: new Map([["home", "Sol"]]),
            starOwners: new Map<string, string | null>([
                ["home", "bot"],
                ["s1", "hero"],
            ]),
        });

        const [o] = detectObservations(takeSnapshot(view()), after);

        expect(o.kind).toBe("starLost");
        expect(o.playerId).toBe("hero");
        expect(o.text).toBe("Tick 10: Hero captured your star Vega.");
    });

    it("should rank a threat to the home star highest", () => {
        const after = view({
            incomingAttacks: [
                { starId: "s1", attackerId: "hero", arrivalTick: 14 },
                { starId: "home", attackerId: "hero", arrivalTick: 15 },
            ],
        });

        const observations = detectObservations(takeSnapshot(view()), after);

        expect(observations.map((o) => o.kind)).toEqual([
            "homeStarThreatened",
            "attackIncoming",
        ]);
        expect(observations[0].text).toContain(
            "home star Sol, arriving at tick 15",
        );
        // Already known attacks aren't news.
        expect(detectObservations(takeSnapshot(after), after)).toEqual([]);
    });

    it("should notice diplomacy, gifts, a runaway leader and defeats", () => {
        const before = view({ statusFrom: new Map([["hero", "allies"]]) });
        const after = view({
            statusFrom: new Map([["hero", "enemies"]]),
            reputation: new Map([["hero", 2]]),
            starsHeld: new Map([["hero", 13]]),
        });

        expect(
            detectObservations(takeSnapshot(before), after).map((o) => o.kind),
        ).toEqual(["allianceBroken", "nearVictory", "gift"]);

        const defeated = view({ defeated: new Set(["hero"]) });
        expect(
            detectObservations(takeSnapshot(view()), defeated).map(
                (o) => o.kind,
            ),
        ).toEqual(["playerDefeated"]);
    });

    it("should move feelings with events and let them fade", () => {
        const observations = detectObservations(
            takeSnapshot(view({ statusFrom: new Map([["hero", "allies"]]) })),
            view({ statusFrom: new Map([["hero", "enemies"]]) }),
        );
        const feelings = applyObservations({}, observations);

        expect(feelings.hero).toEqual({ trust: -0.4, anger: 0.3 });
        expect(describeFeeling(feelings.hero)).toBe(
            "angry with them, you deeply distrust them",
        );

        let faded = feelings;
        for (let i = 0; i < 20; i++) {
            faded = decayFeelings(faded);
        }
        expect(faded.hero).toBeUndefined();
    });
});

describe("botAgendas", () => {
    const outcome = {
        rank: 2,
        defeated: false,
        rivalDefeated: false,
        rivalWeaker: false,
        holdsCentre: false,
        alliedWithWinner: true,
        isWinner: false,
    };

    it("should judge whether a secret goal was met", () => {
        expect(isAgendaAchieved({ key: "dominate" }, outcome)).toBeFalse();
        expect(isAgendaAchieved({ key: "survive" }, outcome)).toBeTrue();
        expect(isAgendaAchieved({ key: "kingmaker" }, outcome)).toBeTrue();
        expect(
            isAgendaAchieved(
                { key: "rival" },
                { ...outcome, rivalWeaker: true },
            ),
        ).toBeTrue();
        expect(isAgendaAchieved(undefined, outcome)).toBeFalse();
    });

    it("should name the rival in the goal and the debrief", () => {
        const agenda = { key: "rival", targetPlayerId: "hero" };

        expect(describeAgenda(agenda, "Hero")).toContain(
            "Ruin the empire of Hero",
        );
        expect(debriefTemplate("warlord", agenda, "Hero", false)).toBe(
            "Good game, everyone. I played as The Warlord. My secret goal was to ruin Hero, and I fell short.",
        );
    });
});
