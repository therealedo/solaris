import { BotPersona } from "./botPersonas";
import { BotDebt, BotEndgame, BotFeeling } from "./types/Ai";

// What AI opponents do around the fighting, the way people do in real games: give
// up when beaten, rally everyone against the leader, vote to end a decided game,
// chase debts, and keep their team informed. Decisions here are pure so they can be
// tested; BotBrainService carries them out.

// Chance per production cycle that a badly beaten bot gives up in some way.
const GIVE_UP_CHANCE = 0.35;
// Credits owed before a bot bothers asking for them.
export const MIN_DEBT = 50;
// Production cycles between reminders about a debt.
const DEBT_REMINDER_CYCLES = 2;
// Reminders before the bot gives up asking and holds a grudge.
const DEBT_REMINDERS = 2;
// A surrendered bot pays this much of its credits each cycle.
export const TRIBUTE_FRACTION = 0.1;
// Fraction of the stars needed to win that makes a game look decided.
const DECIDED_FRACTION = 0.85;

const pick = <T>(items: T[], random: () => number): T =>
    items[Math.floor(random() * items.length)];

// How a badly beaten bot copes, if it gives up at all this cycle. A bot whose secret
// goal is to survive never quits.
export function decideEndgame(
    persona: BotPersona,
    agendaKey: string | undefined,
    random: () => number,
): BotEndgame["mode"] | null {
    if (random() >= GIVE_UP_CHANCE) {
        return null;
    }

    const weights: [BotEndgame["mode"], number][] = [
        ["quiet", 0.4 + persona.loyalty * 0.4],
        [
            "surrendered",
            (1 - persona.aggression) * 0.6 + (1 - persona.honesty) * 0.3,
        ],
        [
            "quit",
            agendaKey === "survive"
                ? 0
                : persona.aggression * 0.6 * (1 - persona.loyalty),
        ],
    ];
    const total = weights.reduce((sum, [, w]) => sum + w, 0);
    let roll = random() * total;

    for (const [mode, weight] of weights) {
        roll -= weight;

        if (roll < 0) {
            return mode;
        }
    }

    return "quiet";
}

export function quitMessage(random: () => number): string {
    return pick(
        [
            "I'm done. There's nothing left to play for here. gg",
            "Not worth my time any more. I'm out, good luck with the rest.",
            "Well played, I suppose. I'm leaving my empire on autopilot.",
            "That's it for me. Enjoy the scraps.",
        ],
        random,
    );
}

export function surrenderMessage(
    overlord: string,
    tribute: number,
    random: () => number,
): string {
    return pick(
        [
            `You've won this one, ${overlord}. I'll stop fighting you and send you ${tribute} credits every cycle if you leave my last stars alone. Deal?`,
            `I can't beat you, ${overlord}. I surrender: ${tribute} credits each cycle as tribute, and you let me live. Accept my alliance if we have a deal.`,
        ],
        random,
    );
}

export function surrenderBrokenMessage(random: () => number): string {
    return pick(
        [
            "I paid you tribute and you still attacked me. No more credits from me.",
            "So that's what your word is worth. The tribute stops now.",
        ],
        random,
    );
}

// Whether the game looks decided: someone is close to the stars needed to win and
// far ahead of everyone else.
export function decidedLeader(
    strengths: { playerId: string; stars: number; strength: number }[],
    starsForVictory: number,
): string | null {
    const ranked = strengths
        .slice()
        .sort((a, b) => b.stars - a.stars || b.strength - a.strength);
    const [leader, second] = ranked;

    if (!leader || starsForVictory <= 0) {
        return null;
    }

    const closeToWinning = leader.stars >= starsForVictory * DECIDED_FRACTION;
    const farAhead = !second || leader.strength >= second.strength * 2;

    return closeToWinning && farAhead ? leader.playerId : null;
}

export function readyToQuitMessage(
    leader: string | null,
    random: () => number,
): string {
    if (!leader) {
        return pick(
            [
                "This one's decided. I've voted to end the game. gg all",
                "No point dragging it out, I've voted to end it. Well played.",
            ],
            random,
        );
    }

    return pick(
        [
            `gg, ${leader} has this one. I've voted to end the game.`,
            `${leader} is too far ahead to stop. I've voted to end it, well played.`,
            `Let's call it. ${leader} wins this, I've voted to end the game.`,
        ],
        random,
    );
}

export function coalitionMessage(
    leader: string,
    stars: number,
    needed: number,
    random: () => number,
): string {
    return pick(
        [
            `${leader} holds ${stars} of the ${needed} stars needed to win. If we don't stop them together now, we all lose. Who's with me?`,
            `Everyone look at the leaderboard: ${leader} is about to win. I'm attacking them. Join in or watch them take it all.`,
            `Truce among the rest of us until ${leader} is cut down to size. They're ${needed - stars} stars from victory.`,
        ],
        random,
    );
}

export function allianceAnnouncement(
    bot: string,
    ally: string,
    random: () => number,
): string {
    return pick(
        [
            `${bot} and ${ally} are now allies. Think twice before touching either of us.`,
            `Announcement: ${bot} has allied with ${ally}.`,
        ],
        random,
    );
}

export function warAnnouncement(
    bot: string,
    enemy: string,
    random: () => number,
): string {
    return pick(
        [
            `${bot} is at war with ${enemy}. Stay out of it, or pick a side.`,
            `Let everyone know: ${bot} declares war on ${enemy}.`,
        ],
        random,
    );
}

export type DebtStep =
    | { kind: "none" }
    | { kind: "forgive" }
    | { kind: "ask"; reminder: number }
    | { kind: "grudge" }
    | { kind: "paid" };

// What a bot does about credits a player owes it this cycle. `owed` is what the
// ledger says they owe, less what the bot gave away on purpose.
export function decideDebt(input: {
    owed: number;
    record: BotDebt | undefined;
    cycle: number;
    allied: boolean;
    feeling: BotFeeling | undefined;
    loyalty: number;
}): DebtStep {
    const { owed, record, cycle } = input;

    if (record && owed < Math.max(MIN_DEBT, record.amount / 2)) {
        // Grudges are settled by paying too.
        return { kind: "paid" };
    }

    if (owed < MIN_DEBT) {
        return { kind: "none" };
    }

    const trust = input.feeling?.trust ?? 0;

    if (input.allied && trust >= 0.3 && input.loyalty >= 0.6) {
        return { kind: "forgive" };
    }

    if (!record) {
        return { kind: "ask", reminder: 1 };
    }

    if (
        record.asked > DEBT_REMINDERS ||
        cycle - record.lastAskedCycle < DEBT_REMINDER_CYCLES
    ) {
        return { kind: "none" };
    }

    if (record.asked < DEBT_REMINDERS) {
        return { kind: "ask", reminder: record.asked + 1 };
    }

    return { kind: "grudge" };
}

export function debtMessage(
    step: DebtStep,
    player: string,
    owed: number,
    random: () => number,
): string {
    switch (step.kind) {
        case "forgive":
            return `Forget the ${owed} credits you owe me, ${player}. That's what allies are for.`;
        case "ask":
            return step.reminder === 1
                ? pick(
                      [
                          `By my count you owe me ${owed} credits, ${player}. I'd like them back when you can.`,
                          `${player}, the ledger says you owe me ${owed} credits. Settle up when you get the chance.`,
                      ],
                      random,
                  )
                : `${player}, you still owe me ${owed} credits. I won't ask nicely again.`;
        case "grudge":
            return `Fine, keep the ${owed} credits, ${player}. I won't forget it.`;
        case "paid":
            return `Debt settled. Pleasure doing business, ${player}.`;
        default:
            return "";
    }
}

export function helpMessage(
    attacker: string,
    star: string,
    home: boolean,
    random: () => number,
): string {
    return home
        ? `${attacker} is going for my home star ${star}! I need support there now.`
        : pick(
              [
                  `${attacker} is hitting ${star}. Can anyone send ships?`,
                  `Under attack at ${star} by ${attacker}. Help would be welcome.`,
              ],
              random,
          );
}

export function teamPlanMessage(
    focus: string | null,
    random: () => number,
): string {
    return focus
        ? pick(
              [
                  `I'm going after ${focus} this cycle. Join in if you can.`,
                  `My fleets are heading for ${focus}. Let's squeeze them together.`,
              ],
              random,
          )
        : pick(
              [
                  "Building up this cycle. Shout if you need ships.",
                  "Holding my borders for now. Tell me where you want help.",
              ],
              random,
          );
}
