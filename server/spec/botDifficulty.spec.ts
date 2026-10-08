import { calculateDifficultyCredits } from "../services/botDifficulty";
import {
    createPersonaStates,
    getBotPersona,
    getPersona,
} from "../services/botPersonas";

describe("botDifficulty", () => {
    const credits = (
        difficulty: any,
        botStrength: number,
        averageHumanStrength = 100,
    ) =>
        calculateDifficultyCredits({
            difficulty,
            botStrength,
            averageHumanStrength,
            income: 100,
        });

    it("should leave classic and older games alone", () => {
        expect(credits("classic", 10)).toBe(0);
        expect(credits(undefined, 10)).toBe(0);
    });

    it("should leave a bot near its target alone", () => {
        expect(credits("normal", 95)).toBe(0);
        expect(credits("hard", 125)).toBe(0);
    });

    it("should boost a bot that falls behind, at most doubling its income", () => {
        expect(credits("normal", 80)).toBe(25);
        expect(credits("normal", 10)).toBe(100);
        expect(credits("brutal", 100)).toBe(70);
    });

    it("should cut a bot that runs ahead, by at most half", () => {
        expect(credits("normal", 125)).toBe(-20);
        expect(credits("easy", 300)).toBe(-50);
    });

    it("should do nothing without humans to compare with", () => {
        expect(credits("normal", 10, 0)).toBe(0);
    });
});

describe("botPersonas quirks", () => {
    it("should give bots different personas with small random quirks", () => {
        let seed = 0;
        const random = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
        const states = createPersonaStates(8, random);

        expect(new Set(states.map((s) => s.key)).size).toBe(8);

        for (const state of states) {
            for (const value of Object.values(state.quirks!)) {
                expect(Math.abs(value)).toBeLessThanOrEqual(0.15);
            }
        }
    });

    it("should apply quirks within the 0 to 1 range", () => {
        const persona = getBotPersona({
            key: "honourable_admiral",
            notes: [],
            lastStrategyCycle: 0,
            quirks: { loyalty: 0.15, aggression: -0.1, honesty: 0 },
        });

        expect(persona.loyalty).toBe(1);
        expect(persona.aggression).toBeCloseTo(0.4);
        expect(persona.honesty).toBe(getPersona("honourable_admiral").honesty);
    });
});
