export interface KnownAttack {
    arrivalTick: number;
    starId: string;
    carriersOnTheWay: string[];
}

export interface InvasionInProgress {
    arrivalTick: number;
    star: string;
}

export interface BotDiplomacyMemory {
    // Players whose current alliance offer has already been declined.
    declinedOffersFrom: string[];
    // Tick of the last alliance proposal made to each player.
    lastProposalTick: Record<string, number>;
}

export interface AiState {
    knownAttacks: KnownAttack[];
    invasionsInProgress: InvasionInProgress[];
    startedClaims: string[];
    diplomacy?: BotDiplomacyMemory;
}

// Persistent personality and memory of an AI player, kept separate from aiState
// because the tactical AI resets that when it loses all its stars.
export interface AiPersonaState {
    key: string;
    // Short private notes the bot keeps about promises, grudges and plans.
    notes: string[];
    // Production cycle of the last LLM strategy turn.
    lastStrategyCycle: number;
    // Per bot shifts to the persona's traits, so two bots with the same persona
    // don't behave identically.
    quirks?: PersonaQuirks;
    // A secret goal, revealed when the game ends.
    agenda?: BotAgenda;
    // Feelings towards other empires by player id, moved by events and fading over time.
    feelings?: Record<string, BotFeeling>;
    // Production cycle the feelings last faded in.
    feelingsCycle?: number;
    // What the bot noticed recently, newest last.
    recentEvents?: string[];
    // The empire the bot's fleets should prioritise attacking.
    focusPlayerId?: string | null;
    // Tick of the last plan, and how many unscheduled replans this cycle.
    lastPlanTick?: number;
    replans?: { cycle: number; count: number };
    // Set once the bot has posted its end of game debrief.
    debriefed?: boolean;
    // A persona generated at random for this bot, used when key is "random".
    custom?: CustomPersona;
    // When the bot is at its keyboard, like a player in some time zone.
    schedule?: BotSchedule;
    // How a badly beaten bot copes: going quiet, surrendering to a stronger empire
    // (and paying it tribute), or quitting and leaving its empire to the plain AI.
    endgame?: BotEndgame;
    // Leaders the bot has publicly called a coalition against.
    calledOut?: string[];
    // Credits the bot has asked each player to repay, by player id.
    debts?: Record<string, BotDebt>;
    // Credits the bot gave away on purpose (gifts, bribes, tribute), by player id,
    // which it doesn't expect back.
    gifted?: Record<string, number>;
    // Tick of the bot's last message in its team's chat.
    lastTeamPostTick?: number;
    // Set once the bot has voted to end the game.
    votedToQuit?: boolean;
}

export interface CustomPersona {
    title: string;
    description: string;
    speakingStyle: string;
    loyalty: number;
    aggression: number;
    honesty: number;
}

export interface BotSchedule {
    // The bot's time zone, in hours from UTC.
    utcOffset: number;
    // Local hour the bot goes to sleep, and for how many hours.
    sleepStart: number;
    sleepHours: number;
    // Local hour the bot is busy (work, errands) and slow to answer, and for how long.
    busyStart: number;
    busyHours: number;
}

export interface BotEndgame {
    mode: "quiet" | "surrendered" | "quit";
    // The empire a surrendered bot pays tribute to.
    playerId?: string | null;
    cycle: number;
}

export interface BotDebt {
    // How much was owed when the bot last asked.
    amount: number;
    asked: number;
    lastAskedCycle: number;
}

export interface BotFeeling {
    // -1 (betrayed) to 1 (complete trust).
    trust: number;
    // 0 (calm) to 1 (furious).
    anger: number;
}

export interface BotAgenda {
    key: string;
    // The player a "rival" agenda is about, picked once the game has started.
    targetPlayerId?: string | null;
}

export interface PersonaQuirks {
    loyalty: number;
    aggression: number;
    honesty: number;
}
