import { Player } from "./types/Player";

// What an AI opponent with a persona is allowed to know about the galaxy: only
// what a human in its seat could see on the map. Built from the same scanning
// results the server uses for a player's view of the galaxy.

// How much bigger than the largest garrison it has seen a bot assumes a hidden one to be.
export const HIDDEN_GARRISON_FACTOR = 1.5;
// Assumed garrison of a hidden star when the bot has no better information.
export const MIN_HIDDEN_GARRISON = 10;

// AI opponents created with a persona, as opposed to humans whose empire
// the AI plays while they are AFK or defeated.
export function isPersonaBot(player: Player): boolean {
    return Boolean(player.aiPersona) && !player.userId;
}

export class BotVisibility {
    constructor(
        // Stars inside the bot's scanning range, including its own.
        readonly scannedStarIds: Set<string>,
        // Stars the bot knows exist outside scanning range (worm hole ends, waypoint destinations).
        readonly extraKnownStarIds: Set<string>,
        // Carriers the bot can see, including its own.
        readonly visibleCarrierIds: Set<string>,
        // Scanned stars and visible carriers whose ships are hidden (nebulas, scramblers).
        readonly hiddenShipIds: Set<string>,
        // In dark galaxy games stars outside scanning range can't be seen
        // (or, in fogged games, their owners can't), so they are unknown to the bot.
        readonly unscannedStarsUnknown: boolean,
    ) {}

    isStarScanned(starId: string): boolean {
        return this.scannedStarIds.has(starId);
    }

    isStarKnown(starId: string): boolean {
        return (
            !this.unscannedStarsUnknown ||
            this.scannedStarIds.has(starId) ||
            this.extraKnownStarIds.has(starId)
        );
    }

    isCarrierVisible(carrierId: string): boolean {
        return this.visibleCarrierIds.has(carrierId);
    }

    canSeeStarShips(starId: string): boolean {
        return this.isStarScanned(starId) && !this.hiddenShipIds.has(starId);
    }

    canSeeCarrierShips(carrierId: string): boolean {
        return (
            this.isCarrierVisible(carrierId) &&
            !this.hiddenShipIds.has(carrierId)
        );
    }

    // Infrastructure and resources of a star are only shown in scanning range, and never for nebulas.
    canSeeStarDetails(star: { _id: any; isNebula?: boolean }): boolean {
        return this.isStarScanned(star._id.toString()) && !star.isNebula;
    }
}

// A cautious guess at the ships on a star the bot can't see into: more than the
// largest garrison it has seen in that empire, or its own largest if it has seen none.
export function estimateHiddenGarrison(
    largestKnownEnemyGarrison: number | undefined,
    ownLargestGarrison: number,
): number {
    const base = Math.max(
        largestKnownEnemyGarrison ?? ownLargestGarrison,
        MIN_HIDDEN_GARRISON,
    );

    return Math.ceil(base * HIDDEN_GARRISON_FACTOR);
}
