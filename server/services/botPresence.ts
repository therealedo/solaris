import { BotSchedule } from "./types/Ai";

// When an AI opponent is at its keyboard. Each bot lives in its own time zone, sleeps
// at night and is busy for part of the day, like the people you meet online: quick to
// answer when online, slow when busy, silent while asleep.

export type BotPresence = "online" | "busy" | "asleep";

const HOUR_MS = 60 * 60 * 1000;

export function createSchedule(random: () => number): BotSchedule {
    const between = (min: number, max: number) =>
        min + Math.floor(random() * (max - min + 1));

    return {
        utcOffset: between(-10, 12),
        sleepStart: (22 + between(0, 3)) % 24,
        sleepHours: between(6, 8),
        busyStart: between(9, 14),
        // A quarter of bots are never busy during the day.
        busyHours: random() < 0.25 ? 0 : between(2, 6),
    };
}

function localHour(schedule: BotSchedule, now: Date) {
    const utc = now.getUTCHours() + now.getUTCMinutes() / 60;

    return (((utc + schedule.utcOffset) % 24) + 24) % 24;
}

// Hours since the window started, or null when the hour is outside it.
function hoursIntoWindow(hour: number, start: number, length: number) {
    const into = (((hour - start) % 24) + 24) % 24;

    return into < length ? into : null;
}

export function getPresence(
    schedule: BotSchedule | null | undefined,
    now: Date,
): BotPresence {
    if (!schedule) {
        return "online";
    }

    const hour = localHour(schedule, now);

    if (
        hoursIntoWindow(hour, schedule.sleepStart, schedule.sleepHours) != null
    ) {
        return "asleep";
    }

    if (hoursIntoWindow(hour, schedule.busyStart, schedule.busyHours) != null) {
        return "busy";
    }

    return "online";
}

// How long until a sleeping bot wakes up, in milliseconds. 0 when it is awake.
export function msUntilAwake(
    schedule: BotSchedule | null | undefined,
    now: Date,
): number {
    if (!schedule) {
        return 0;
    }

    const into = hoursIntoWindow(
        localHour(schedule, now),
        schedule.sleepStart,
        schedule.sleepHours,
    );

    return into == null ? 0 : Math.ceil((schedule.sleepHours - into) * HOUR_MS);
}

// When other players last saw the bot: now while it is online, or when it went to
// bed or got busy.
export function lastSeen(
    schedule: BotSchedule | null | undefined,
    now: Date,
): Date {
    if (!schedule) {
        return now;
    }

    const hour = localHour(schedule, now);
    const into =
        hoursIntoWindow(hour, schedule.sleepStart, schedule.sleepHours) ??
        hoursIntoWindow(hour, schedule.busyStart, schedule.busyHours);

    return into == null ? now : new Date(now.getTime() - into * HOUR_MS);
}
