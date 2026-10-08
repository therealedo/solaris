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
}

export interface PersonaQuirks {
    loyalty: number;
    aggression: number;
    honesty: number;
}
