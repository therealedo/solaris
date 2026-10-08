import type { AiDifficulty } from "./game";

export type GameStoryEntryKind =
    | "gameStarted"
    | "allianceFormed"
    | "allianceBroken"
    | "warDeclared"
    | "peaceMade"
    | "homeStarCaptured"
    | "battle"
    | "playerDefeated"
    | "playerAfk"
    | "gameEnded";

// A turning point of the game, in the order it happened.
export type GameStoryEntry<ID> = {
    tick: number;
    kind: GameStoryEntryKind;
    text: string;
    playerIds: ID[];
};

export type GameStoryMessage = {
    tick: number | null;
    sentDate: Date;
    message: string;
};

// What an AI opponent was really up to, revealed when the game ends.
export type GameStoryOpponent<ID> = {
    playerId: ID;
    alias: string;
    personaTitle: string;
    personaDescription: string;
    // "My secret goal was to ..." completion, or null when it had none.
    agenda: string | null;
    agendaTargetPlayerId: ID | null;
    notes: string[];
    // Messages it sent in conversations the viewer was part of.
    messagesToYou: GameStoryMessage[];
    defeated: boolean;
};

export type GameStory<ID> = {
    gameId: ID;
    gameName: string;
    endTick: number;
    winnerPlayerId: ID | null;
    winnerAlias: string | null;
    aiDifficulty: AiDifficulty | null;
    timeline: GameStoryEntry<ID>[];
    opponents: GameStoryOpponent<ID>[];
};
