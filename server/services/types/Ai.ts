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
