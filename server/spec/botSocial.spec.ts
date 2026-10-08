import { GAME_CREATION_OPTIONS } from "@solaris/common";
import {
    BOT_PERSONAS,
    createPersonaStates,
    generateRandomPersona,
    getBotPersona,
} from "../services/botPersonas";
import {
    createSchedule,
    getPresence,
    lastSeen,
    msUntilAwake,
} from "../services/botPresence";
import {
    decideDebt,
    decideEndgame,
    decidedLeader,
} from "../services/botSocial";

const sequence = (values: number[]) => {
    let i = 0;
    return () => values[i++ % values.length];
};

describe("botPresence", () => {
    // Asleep 23:00 to 06:00, busy 09:00 to 13:00, in UTC+2.
    const schedule = {
        utcOffset: 2,
        sleepStart: 23,
        sleepHours: 7,
        busyStart: 9,
        busyHours: 4,
    };
    const at = (utc: string) => new Date(`2026-10-08T${utc}:00Z`);

    it("should follow the bot's day in its time zone", () => {
        expect(getPresence(schedule, at("22:00"))).toBe("asleep"); // 00:00 local
        expect(getPresence(schedule, at("08:00"))).toBe("busy"); // 10:00 local
        expect(getPresence(schedule, at("14:00"))).toBe("online"); // 16:00 local
        expect(getPresence(null, at("22:00"))).toBe("online");
    });

    it("should know when a sleeping bot wakes and when it was last seen", () => {
        // 01:00 local: five hours to go, asleep for two.
        expect(msUntilAwake(schedule, at("23:00"))).toBe(5 * 60 * 60 * 1000);
        expect(lastSeen(schedule, at("23:00")).toISOString()).toBe(
            "2026-10-08T21:00:00.000Z",
        );
        expect(msUntilAwake(schedule, at("14:00"))).toBe(0);
    });

    it("should create believable schedules", () => {
        for (let i = 0; i < 50; i++) {
            const s = createSchedule(Math.random);

            expect(s.sleepHours).toBeGreaterThanOrEqual(6);
            expect(s.sleepHours).toBeLessThanOrEqual(8);
            expect([22, 23, 0, 1]).toContain(s.sleepStart);
        }
    });
});

describe("random personas", () => {
    it("should generate a player who wants to win", () => {
        for (let i = 0; i < 50; i++) {
            const persona = generateRandomPersona(Math.random);

            expect(persona.title).toMatch(/^The \w+ \w+$/);
            expect(persona.description).toContain("keeps chat about the game");
            expect(persona.loyalty).toBeGreaterThanOrEqual(0.1);
            expect(persona.aggression).toBeLessThanOrEqual(0.95);
        }
    });

    it("should honour the creator's picks", () => {
        const states = createPersonaStates(3, Math.random, [
            "warlord",
            "random",
            "any",
        ]);

        expect(states[0].key).toBe("warlord");
        expect(states[1].key).toBe("random");
        expect(getBotPersona(states[1]).title).toBe(states[1].custom!.title);
        expect(states[2].key).not.toBe("warlord");
        expect(states.every((s) => s.schedule)).toBeTrue();
    });

    it("should offer every persona on the create page", () => {
        const keys = GAME_CREATION_OPTIONS.general.aiPersona.map(
            (o) => o.value,
        );

        for (const persona of BOT_PERSONAS) {
            expect(keys).toContain(persona.key);
        }
    });
});

describe("botSocial", () => {
    const persona = (aggression: number, loyalty: number, honesty = 0.5) =>
        ({ aggression, loyalty, honesty }) as any;

    it("should usually keep fighting", () => {
        expect(decideEndgame(persona(0.9, 0.1), "dominate", () => 0.9)).toBe(
            null,
        );
    });

    it("should let hotheads quit, but never a survivor", () => {
        expect(
            decideEndgame(persona(1, 0), "dominate", sequence([0.1, 0.99])),
        ).toBe("quit");
        expect(
            decideEndgame(persona(1, 0), "survive", sequence([0.1, 0.99])),
        ).not.toBe("quit");
    });

    it("should spot a decided game", () => {
        const s = (playerId: string, stars: number, strength: number) => ({
            playerId,
            stars,
            strength,
        });

        expect(decidedLeader([s("a", 9, 100), s("b", 3, 40)], 10)).toBe("a");
        expect(decidedLeader([s("a", 9, 100), s("b", 7, 80)], 10)).toBeNull();
        expect(decidedLeader([s("a", 5, 100), s("b", 1, 10)], 10)).toBeNull();
    });

    it("should chase a debt step by step", () => {
        const base = {
            owed: 100,
            allied: false,
            feeling: undefined,
            loyalty: 0.5,
        };

        expect(decideDebt({ ...base, record: undefined, cycle: 1 })).toEqual({
            kind: "ask",
            reminder: 1,
        });

        const record = { amount: 100, asked: 1, lastAskedCycle: 1 };

        expect(decideDebt({ ...base, record, cycle: 2 }).kind).toBe("none");
        expect(decideDebt({ ...base, record, cycle: 3 })).toEqual({
            kind: "ask",
            reminder: 2,
        });
        expect(
            decideDebt({
                ...base,
                record: { ...record, asked: 2 },
                cycle: 5,
            }).kind,
        ).toBe("grudge");
        expect(decideDebt({ ...base, owed: 10, record, cycle: 3 }).kind).toBe(
            "paid",
        );
        expect(
            decideDebt({ ...base, owed: 20, record: undefined, cycle: 1 }).kind,
        ).toBe("none");
    });
});
