import type {
    Conversation,
    ConversationMessage,
    DiplomaticState,
    GameStory,
    GameStoryEntry,
    GameStoryEntryKind,
    GameStoryMessage,
    GameStoryOpponent,
} from "@solaris/common";
import { ValidationError } from "@solaris/common";
import { getAgenda } from "./botAgendas";
import { getPersona } from "./botPersonas";
import { DBObjectId } from "./types/DBObjectId";
import { Game } from "./types/Game";
import { Player } from "./types/Player";

// The story of a finished game with AI opponents: its turning points, and what
// each AI opponent was secretly up to compared with what it told the viewer.

// Battles are only turning points when they are among the largest of the game.
export const MAX_BATTLES = 5;
export const MIN_BATTLE_SHIPS_LOST = 10;

export type StoryEvent = {
    tick: number;
    type: string;
    data?: any;
};

export type StoryPlayer = {
    id: string;
    alias: string;
};

export type TimelineParams = {
    players: StoryPlayer[];
    homeStarIds: Set<string>;
    events: StoryEvent[];
    endTick: number | null;
    // Alias of the winning player or the name of the winning team.
    winnerName: string | null;
    winnerPlayerIds: string[];
};

type Battle = {
    key: string;
    tick: number;
    order: number;
    shipsLost: number;
    starName: string | null;
    sides: string[][];
};

type OrderedEntry = GameStoryEntry<string> & { order: number };

const id = (value: unknown) => (value == null ? "" : String(value));

const numberOrZero = (value: unknown) =>
    typeof value === "number" && isFinite(value) ? value : 0;

export function buildGameStoryTimeline(
    params: TimelineParams,
): GameStoryEntry<string>[] {
    const aliases = new Map(params.players.map((p) => [p.id, p.alias]));
    const alias = (playerId: unknown, fallback?: string) =>
        aliases.get(id(playerId)) ?? fallback ?? "An unknown empire";

    const entries: OrderedEntry[] = [];
    const add = (
        order: number,
        tick: number,
        kind: GameStoryEntryKind,
        text: string,
        playerIds: unknown[],
    ) =>
        entries.push({
            order,
            tick,
            kind,
            text,
            playerIds: playerIds.map(id),
        });

    // Diplomatic state between each pair of empires, neutral until declared otherwise.
    const relations = new Map<string, DiplomaticState>();
    const battles = new Map<string, Battle>();
    const capturedHomeStars = new Set<string>();

    params.events.forEach((event, order) => {
        const data = event.data ?? {};

        switch (event.type) {
            case "gameStarted":
                add(order, event.tick, "gameStarted", "The game began.", []);
                break;
            case "gamePlayerDefeated":
                add(
                    order,
                    event.tick,
                    "playerDefeated",
                    `${alias(data.playerId, data.alias)} was defeated.`,
                    [data.playerId],
                );
                break;
            case "gamePlayerAFK":
                add(
                    order,
                    event.tick,
                    "playerAfk",
                    `${alias(data.playerId, data.alias)} abandoned their empire.`,
                    [data.playerId],
                );
                break;
            case "playerDiplomacyStatusChanged": {
                const fromId = id(data.playerIdFrom);
                const toId = id(data.playerIdTo);
                const key = [fromId, toId].sort().join(":");
                const before = relations.get(key) ?? "neutral";
                const after: DiplomaticState = data.actualStatus;

                if (!after || before === after) {
                    break;
                }

                relations.set(key, after);

                const from = alias(fromId, data.playerFromAlias);
                const to = alias(toId, data.playerToAlias);
                const players = [fromId, toId];

                if (after === "allies") {
                    add(
                        order,
                        event.tick,
                        "allianceFormed",
                        before === "enemies"
                            ? `${from} and ${to} made peace and formed an alliance.`
                            : `${from} and ${to} formed an alliance.`,
                        players,
                    );
                } else if (before === "allies") {
                    add(
                        order,
                        event.tick,
                        "allianceBroken",
                        after === "enemies"
                            ? `${from} broke their alliance with ${to} and declared war.`
                            : `${from} broke their alliance with ${to}.`,
                        players,
                    );
                } else if (after === "enemies") {
                    add(
                        order,
                        event.tick,
                        "warDeclared",
                        `${from} declared war on ${to}.`,
                        players,
                    );
                } else {
                    add(
                        order,
                        event.tick,
                        "peaceMade",
                        `${from} and ${to} made peace.`,
                        players,
                    );
                }
                break;
            }
            case "playerCombatStar":
            case "playerCombatCarrier": {
                const groups: any[] = Array.isArray(data.groups)
                    ? data.groups
                    : [];
                const star = groups.find((g) => g.star)?.star ?? null;
                const carrierIds = groups
                    .flatMap((g) => g.carriers ?? [])
                    .map((c) => id(c.carrierId))
                    .sort();
                const key = star
                    ? `${event.tick}:star:${id(star.starId)}`
                    : `${event.tick}:carriers:${carrierIds.join(",")}`;

                // Each empire in a battle gets its own copy of it, where ships hidden by
                // scramblers are unknown, so keep the copy that shows the most.
                const shipsLost = groups.reduce(
                    (sum, g) => sum + numberOrZero(g.shipsLost),
                    0,
                );
                const existing = battles.get(key);

                if (!existing || existing.shipsLost < shipsLost) {
                    battles.set(key, {
                        key,
                        tick: event.tick,
                        order: existing?.order ?? order,
                        shipsLost,
                        starName: star?.starName ?? null,
                        sides: groups.map((g) => (g.playerIds ?? []).map(id)),
                    });
                }

                const capture = star?.captureResult;

                if (
                    capture &&
                    params.homeStarIds.has(id(star.starId)) &&
                    !capturedHomeStars.has(key)
                ) {
                    capturedHomeStars.add(key);

                    const owner = star.ownedByPlayerId
                        ? `${alias(star.ownedByPlayerId)}'s home star`
                        : "the home star";

                    add(
                        order,
                        event.tick,
                        "homeStarCaptured",
                        `${alias(capture.capturedById, capture.capturedByAlias)} captured ${owner} ${star.starName}.`,
                        [capture.capturedById, star.ownedByPlayerId].filter(
                            (p) => p != null,
                        ),
                    );
                }
                break;
            }
        }
    });

    [...battles.values()]
        .filter(
            (b) =>
                b.shipsLost >= MIN_BATTLE_SHIPS_LOST &&
                !capturedHomeStars.has(b.key),
        )
        .sort((a, b) => b.shipsLost - a.shipsLost)
        .slice(0, MAX_BATTLES)
        .forEach((b) => {
            const sides = b.sides
                .filter((side) => side.length)
                .map((side) => side.map((p) => alias(p)).join(" & "))
                .join(" vs ");
            const place = b.starName ? ` at ${b.starName}` : " in deep space";

            add(
                b.order,
                b.tick,
                "battle",
                `A great battle${place}: ${sides}. ${b.shipsLost} ships were destroyed.`,
                b.sides.flat(),
            );
        });

    if (params.endTick != null) {
        add(
            Number.MAX_SAFE_INTEGER,
            params.endTick,
            "gameEnded",
            params.winnerName
                ? `${params.winnerName} won the game.`
                : "The game ended.",
            params.winnerPlayerIds,
        );
    }

    return entries
        .sort((a, b) => a.tick - b.tick || a.order - b.order)
        .map((e) => ({
            tick: e.tick,
            kind: e.kind,
            text: e.text,
            playerIds: e.playerIds,
        }));
}

export function buildStoryOpponents(params: {
    players: Player[];
    conversations: Conversation<DBObjectId>[];
    viewerPlayerId: string;
}): GameStoryOpponent<string>[] {
    const aliases = new Map(
        params.players.map((p) => [id(p._id), p.alias] as const),
    );

    return params.players
        .filter((p) => !p.userId && p.aiPersona)
        .map((bot) => {
            const botId = id(bot._id);
            const persona = getPersona(bot.aiPersona!.key);
            const agenda = bot.aiPersona!.agenda ?? null;
            const definition = getAgenda(agenda?.key);
            const targetId = agenda?.targetPlayerId
                ? id(agenda.targetPlayerId)
                : null;
            const rival = (targetId && aliases.get(targetId)) || "a rival";

            return {
                playerId: botId,
                alias: bot.alias,
                personaTitle: persona.title,
                personaDescription: persona.description,
                agenda: definition
                    ? definition.reveal.replace("{rival}", rival)
                    : null,
                agendaTargetPlayerId: targetId,
                notes: [...(bot.aiPersona!.notes ?? [])],
                messagesToYou: listMessagesFrom(
                    params.conversations,
                    botId,
                    params.viewerPlayerId,
                ),
                defeated: Boolean(bot.defeated),
            };
        });
}

// Chat messages the bot sent in conversations the viewer was part of, oldest first.
export function listMessagesFrom(
    conversations: Conversation<DBObjectId>[],
    fromPlayerId: string,
    viewerPlayerId: string,
): GameStoryMessage[] {
    return conversations
        .filter((c) => c.participants.some((p) => id(p) === viewerPlayerId))
        .flatMap((c) => c.messages)
        .filter(
            (m): m is ConversationMessage<DBObjectId> =>
                "message" in m &&
                m.type !== "event" &&
                id((m as ConversationMessage<DBObjectId>).fromPlayerId) ===
                    fromPlayerId,
        )
        .map((m) => ({
            tick: m.sentTick ?? null,
            sentDate: m.sentDate,
            message: m.message,
        }))
        .sort(
            (a, b) =>
                new Date(a.sentDate).getTime() - new Date(b.sentDate).getTime(),
        );
}

export function hasAiPersonas(game: Game) {
    return game.galaxy.players.some((p) => !p.userId && p.aiPersona);
}

// Personas, goals and notes stay secret until the game is over.
export function assertCanViewGameStory(game: Game) {
    if (!game.state.endDate) {
        throw new ValidationError(
            "The story of the game is revealed when the game ends.",
        );
    }

    if (!hasAiPersonas(game)) {
        throw new ValidationError(
            "This game has no AI opponents with a story.",
        );
    }
}

export function buildGameStory(
    game: Game,
    events: StoryEvent[],
    viewer: Player,
): GameStory<string> {
    assertCanViewGameStory(game);

    const players = game.galaxy.players;
    const homeStarIds = new Set<string>([
        ...(game.galaxy.stars ?? [])
            .filter((s) => s.homeStar)
            .map((s) => id(s._id)),
        ...players.filter((p) => p.homeStarId).map((p) => id(p.homeStarId)),
    ]);

    const winner = game.state.winner
        ? players.find((p) => id(p._id) === id(game.state.winner))
        : null;
    const winningTeam = game.state.winningTeam
        ? game.galaxy.teams?.find(
              (t) => id(t._id) === id(game.state.winningTeam),
          )
        : null;

    return {
        gameId: id(game._id),
        gameName: game.settings.general.name,
        endTick: game.state.tick,
        winnerPlayerId: winner ? id(winner._id) : null,
        winnerAlias: winner?.alias ?? winningTeam?.name ?? null,
        aiDifficulty: game.settings.general.aiDifficulty ?? null,
        timeline: buildGameStoryTimeline({
            players: players.map((p) => ({ id: id(p._id), alias: p.alias })),
            homeStarIds,
            events,
            endTick: game.state.tick,
            winnerName: winner?.alias ?? winningTeam?.name ?? null,
            winnerPlayerIds: winner
                ? [id(winner._id)]
                : (winningTeam?.players ?? []).map(id),
        }),
        opponents: buildStoryOpponents({
            players,
            conversations: game.conversations ?? [],
            viewerPlayerId: id(viewer._id),
        }),
    };
}
