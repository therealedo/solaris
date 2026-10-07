import {
    PlayerStrength,
    calculateStrength,
    chooseAllianceProposal,
    classifyMessage,
    decideAllianceOffer,
    decideBetrayal,
    formatBotMessage,
} from "../services/botDiplomacyPolicy";

const strength = (
    playerId: string,
    stars: number,
    ships = 0,
): PlayerStrength => ({
    playerId,
    stars,
    ships,
    strength: calculateStrength(stars, ships),
});

describe("botDiplomacyPolicy", () => {
    describe("decideAllianceOffer", () => {
        const leader = strength("leader", 30);

        it("should accept a trusted offer", () => {
            const res = decideAllianceOffer({
                offerer: strength("a", 10),
                leader,
                starsForVictory: 100,
                reputation: 0,
                atAllianceCap: false,
            });

            expect(res.accept).toBeTrue();
        });

        it("should decline when at the alliance cap", () => {
            const res = decideAllianceOffer({
                offerer: strength("a", 10),
                leader,
                starsForVictory: 100,
                reputation: 3,
                atAllianceCap: true,
            });

            expect(res).toEqual({ accept: false, reason: "allianceCap" });
        });

        it("should decline players with bad reputation", () => {
            const res = decideAllianceOffer({
                offerer: strength("a", 10),
                leader,
                starsForVictory: 100,
                reputation: -1,
                atAllianceCap: false,
            });

            expect(res).toEqual({ accept: false, reason: "distrust" });
        });

        it("should decline a leader close to victory", () => {
            const nearWinner = strength("leader", 70);

            const res = decideAllianceOffer({
                offerer: nearWinner,
                leader: nearWinner,
                starsForVictory: 100,
                reputation: 2,
                atAllianceCap: false,
            });

            expect(res).toEqual({ accept: false, reason: "tooStrong" });
        });
    });

    describe("decideBetrayal", () => {
        it("should betray an ally about to win", () => {
            const ally = strength("ally", 65);

            expect(
                decideBetrayal({
                    bot: strength("bot", 20),
                    ally,
                    leader: ally,
                    starsForVictory: 100,
                    allyIsNeighbour: false,
                    isThreatened: true,
                }),
            ).toBe("allyNearVictory");
        });

        it("should backstab a weak neighbouring ally when safe", () => {
            expect(
                decideBetrayal({
                    bot: strength("bot", 30),
                    ally: strength("ally", 10),
                    leader: strength("bot", 30),
                    starsForVictory: 100,
                    allyIsNeighbour: true,
                    isThreatened: false,
                }),
            ).toBe("weakAlly");
        });

        it("should stay loyal to a weak ally while threatened", () => {
            expect(
                decideBetrayal({
                    bot: strength("bot", 30),
                    ally: strength("ally", 10),
                    leader: strength("other", 50),
                    starsForVictory: 100,
                    allyIsNeighbour: true,
                    isThreatened: true,
                }),
            ).toBeNull();
        });

        it("should stay loyal to an ally of similar strength", () => {
            expect(
                decideBetrayal({
                    bot: strength("bot", 20),
                    ally: strength("ally", 18),
                    leader: strength("other", 40),
                    starsForVictory: 100,
                    allyIsNeighbour: true,
                    isThreatened: false,
                }),
            ).toBeNull();
        });
    });

    describe("chooseAllianceProposal", () => {
        it("should not propose when not threatened", () => {
            expect(
                chooseAllianceProposal({
                    bot: strength("bot", 10),
                    threats: [],
                    candidates: [strength("a", 10)],
                    leader: strength("a", 10),
                    starsForVictory: 100,
                }),
            ).toBeNull();
        });

        it("should propose to the strongest player that is not the threat", () => {
            const threat = strength("threat", 40);

            const res = chooseAllianceProposal({
                bot: strength("bot", 10),
                threats: [threat],
                candidates: [threat, strength("a", 8), strength("b", 15)],
                leader: threat,
                starsForVictory: 100,
            });

            expect(res?.playerId).toBe("b");
        });
    });

    describe("classifyMessage", () => {
        it("should classify common intents", () => {
            expect(classifyMessage("Want to form an alliance?")).toBe(
                "alliance",
            );
            expect(classifyMessage("I will destroy your fleets")).toBe(
                "threat",
            );
            expect(classifyMessage("How about a truce?")).toBe("peace");
            expect(classifyMessage("Hello there")).toBe("greeting");
            expect(classifyMessage("What's your economy like?")).toBe("other");
        });
    });

    describe("formatBotMessage", () => {
        it("should fill in placeholders", () => {
            const res = formatBotMessage(
                "proposeAlliance",
                { player: "Alice", threat: "Bob" },
                () => 0,
            );

            expect(res).toContain("Bob");
            expect(res).not.toContain("{");
        });
    });
});
