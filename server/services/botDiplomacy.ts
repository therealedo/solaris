import {
    Conversation,
    ConversationMessage,
    DistanceService,
    GameTypeService,
} from "@solaris/common";
import ConversationService from "./conversation";
import DiplomacyService from "./diplomacy";
import PlayerStatisticsService from "./playerStatistics";
import RandomService from "./random";
import ReputationService from "./reputation";
import { BotDiplomacyMemory } from "./types/Ai";
import { DBObjectId } from "./types/DBObjectId";
import { Game } from "./types/Game";
import { IEventService } from "./types/IEventService";
import { INotificationService } from "./types/INotificationService";
import { Player } from "./types/Player";
import {
    BotMessageKey,
    PROPOSAL_COOLDOWN_CYCLES,
    PlayerStrength,
    calculateStrength,
    chooseAllianceProposal,
    classifyMessage,
    decideAllianceOffer,
    decideBetrayal,
    formatBotMessage,
    isThreat,
} from "./botDiplomacyPolicy";
import { logger } from "../utils/logging";

const log = logger("Bot Diplomacy Service");

// Reputation scores mirror the thresholds the reputation service uses to
// automatically ally or declare war on players.
const ALLY_REPUTATION = 5;
const BETRAYED_REPUTATION = -1;

// Neighbours are players whose closest stars are within this many hyperspace jumps.
const NEIGHBOUR_HYPERSPACE_JUMPS = 2;

// Messages older than this many production cycles are ignored so bots don't
// answer stale conversations.
const REPLY_WINDOW_CYCLES = 1;

interface TurnContext {
    game: Game;
    eventService: IEventService;
    notificationService: INotificationService;
    strengths: Map<string, PlayerStrength>;
    leader: PlayerStrength;
    starsForVictory: number;
    isFirstTickOfCycle: boolean;
    conversations: Conversation<DBObjectId>[];
}

// Gives AI players the diplomatic actions a human has: answering alliance offers,
// proposing alliances when threatened, betraying allies and chatting.
// Decisions are rule based (see botDiplomacyPolicy.ts) and currently only run in
// single player games.
export default class BotDiplomacyService {
    diplomacyService: DiplomacyService;
    conversationService: ConversationService;
    reputationService: ReputationService;
    playerStatisticsService: PlayerStatisticsService;
    distanceService: DistanceService;
    gameTypeService: GameTypeService;
    randomService: RandomService;

    constructor(
        diplomacyService: DiplomacyService,
        conversationService: ConversationService,
        reputationService: ReputationService,
        playerStatisticsService: PlayerStatisticsService,
        distanceService: DistanceService,
        gameTypeService: GameTypeService,
        randomService: RandomService,
    ) {
        this.diplomacyService = diplomacyService;
        this.conversationService = conversationService;
        this.reputationService = reputationService;
        this.playerStatisticsService = playerStatisticsService;
        this.distanceService = distanceService;
        this.gameTypeService = gameTypeService;
        this.randomService = randomService;
    }

    isEnabled(game: Game) {
        return this.gameTypeService.isSinglePlayerGame(game);
    }

    listBots(game: Game) {
        return game.galaxy.players.filter((p) => !p.userId && !p.defeated);
    }

    // Diplomacy changes are made in memory only and persisted when the game is saved
    // at the end of the tick. Chat messages are written straight away, the same way
    // a human's message would be.
    async play(
        game: Game,
        eventService: IEventService,
        notificationService: INotificationService,
    ) {
        if (!this.isEnabled(game)) {
            return;
        }

        const bots = this.listBots(game);

        if (!bots.length) {
            return;
        }

        const strengths = this._calculateStrengths(game);
        const leader = [...strengths.values()].sort(
            (a, b) => b.stars - a.stars || b.strength - a.strength,
        )[0];

        if (!leader) {
            return;
        }

        const ctx: TurnContext = {
            game,
            eventService,
            notificationService,
            strengths,
            leader,
            starsForVictory: game.state.starsForVictory,
            isFirstTickOfCycle:
                game.state.tick % game.settings.galaxy.productionTicks === 1,
            conversations: game.conversations.slice(),
        };

        for (const bot of bots) {
            try {
                await this._playBot(ctx, bot);
            } catch (e) {
                // Never let bot diplomacy break the game tick.
                log.error(
                    e,
                    `Bot diplomacy failed for ${bot.alias} in game ${game._id.toString()}`,
                );
            }
        }
    }

    async _playBot(ctx: TurnContext, bot: Player) {
        const memory = this._getMemory(bot);

        await this._replyToMessages(ctx, bot);

        if (
            this.diplomacyService.isFormalAlliancesEnabled(ctx.game) &&
            !this.diplomacyService.isTeamGame(ctx.game)
        ) {
            await this._answerAllianceOffers(ctx, bot, memory);

            if (ctx.isFirstTickOfCycle) {
                const betrayed = await this._considerBetrayal(ctx, bot);

                if (!betrayed) {
                    await this._considerProposal(ctx, bot, memory);
                }
            }
        }

        // aiState is a mixed type so mongoose needs to be told it changed.
        // @ts-ignore
        bot.markModified?.("aiState");
    }

    async _answerAllianceOffers(
        ctx: TurnContext,
        bot: Player,
        memory: BotDiplomacyMemory,
    ) {
        const others = this._listOtherPlayers(ctx.game, bot);

        for (const other of others) {
            const otherId = other._id.toString();
            const status = this.diplomacyService.getDiplomaticStatusToPlayer(
                ctx.game,
                bot._id,
                other._id,
            );
            const hasOffered =
                status.statusFrom === "allies" && status.statusTo !== "allies";

            if (!hasOffered) {
                // Forget declined offers once they are withdrawn so a new offer gets a fresh answer.
                memory.declinedOffersFrom = memory.declinedOffersFrom.filter(
                    (id) => id !== otherId,
                );
                continue;
            }

            if (memory.declinedOffersFrom.includes(otherId)) {
                continue;
            }

            const decision = this._decideOffer(ctx, bot, other);

            if (decision.accept) {
                await this._declareAlly(ctx, bot, other);
                await this._message(ctx, bot, other, "acceptAlliance");
            } else {
                memory.declinedOffersFrom.push(otherId);

                const key: BotMessageKey =
                    decision.reason === "allianceCap"
                        ? "declineAllianceCap"
                        : decision.reason === "distrust"
                          ? "declineAllianceDistrust"
                          : "declineAllianceTooStrong";

                await this._message(ctx, bot, other, key);
            }
        }
    }

    async _considerBetrayal(ctx: TurnContext, bot: Player) {
        if (this.diplomacyService.isAllianceLocked(ctx.game)) {
            return false;
        }

        const botStrength = ctx.strengths.get(bot._id.toString())!;
        const neighbourIds = this._getNeighbourIds(ctx.game, bot);
        const isThreatened =
            this._getThreats(ctx, bot, neighbourIds).length > 0;

        for (const ally of this.diplomacyService.getAlliesOfPlayer(
            ctx.game,
            bot,
        )) {
            const allyStrength = ctx.strengths.get(ally._id.toString());

            if (!allyStrength) {
                continue;
            }

            const reason = decideBetrayal({
                bot: botStrength,
                ally: allyStrength,
                leader: ctx.leader,
                starsForVictory: ctx.starsForVictory,
                allyIsNeighbour: neighbourIds.has(ally._id.toString()),
                isThreatened,
            });

            if (!reason) {
                continue;
            }

            await this.diplomacyService.declareNeutral(
                ctx.eventService,
                ctx.game,
                bot._id,
                ally._id,
                false,
            );

            // Without an alliance the AI treats the former ally as a target,
            // and the low reputation stops it from re-allying straight away.
            this._setReputation(bot, ally, BETRAYED_REPUTATION);

            await this._message(
                ctx,
                bot,
                ally,
                reason === "allyNearVictory"
                    ? "betrayNearVictory"
                    : "betrayWeakAlly",
            );

            // One betrayal per cycle is plenty of drama.
            return true;
        }

        return false;
    }

    async _considerProposal(
        ctx: TurnContext,
        bot: Player,
        memory: BotDiplomacyMemory,
    ) {
        if (this._isAtAllianceCap(ctx.game, bot)) {
            return;
        }

        const botStrength = ctx.strengths.get(bot._id.toString())!;
        const neighbourIds = this._getNeighbourIds(ctx.game, bot);
        const threats = this._getThreats(ctx, bot, neighbourIds);
        const cooldownTicks =
            PROPOSAL_COOLDOWN_CYCLES * ctx.game.settings.galaxy.productionTicks;

        const candidates = this._listOtherPlayers(ctx.game, bot)
            .filter((p) => {
                const status =
                    this.diplomacyService.getDiplomaticStatusToPlayer(
                        ctx.game,
                        bot._id,
                        p._id,
                    );

                return status.statusTo !== "allies";
            })
            .filter(
                (p) =>
                    this.reputationService.getReputation(bot, p).reputation
                        .score >= 0,
            )
            .filter((p) => {
                const lastTick = memory.lastProposalTick[p._id.toString()];

                return (
                    lastTick == null ||
                    ctx.game.state.tick - lastTick >= cooldownTicks
                );
            })
            .map((p) => ctx.strengths.get(p._id.toString()))
            .filter((s): s is PlayerStrength => s != null);

        const target = chooseAllianceProposal({
            bot: botStrength,
            threats,
            candidates,
            leader: ctx.leader,
            starsForVictory: ctx.starsForVictory,
        });

        if (!target) {
            return;
        }

        const targetPlayer = this._getPlayer(ctx.game, target.playerId)!;
        const threatPlayer = this._getPlayer(
            ctx.game,
            threats.sort((a, b) => b.strength - a.strength)[0].playerId,
        )!;

        memory.lastProposalTick[target.playerId] = ctx.game.state.tick;

        await this._declareAlly(ctx, bot, targetPlayer);
        await this._message(ctx, bot, targetPlayer, "proposeAlliance", {
            threat: threatPlayer.alias,
        });
    }

    async _replyToMessages(ctx: TurnContext, bot: Player) {
        const botId = bot._id.toString();
        const oldestTick =
            ctx.game.state.tick -
            REPLY_WINDOW_CYCLES * ctx.game.settings.galaxy.productionTicks;

        for (const convo of ctx.conversations) {
            if (!convo.participants.some((p) => p.toString() === botId)) {
                continue;
            }

            const isGroupChat = convo.participants.length > 2;
            const messages = convo.messages.filter(
                (m): m is ConversationMessage<DBObjectId> =>
                    "message" in m && "fromPlayerId" in m,
            );

            let lastBotIndex = -1;
            messages.forEach((m, i) => {
                if (m.fromPlayerId?.toString() === botId) {
                    lastBotIndex = i;
                }
            });

            const pending = messages
                .slice(lastBotIndex + 1)
                .filter((m) => (m.sentTick ?? 0) >= oldestTick)
                .filter((m) => {
                    const sender = m.fromPlayerId
                        ? this._getPlayer(ctx.game, m.fromPlayerId.toString())
                        : null;

                    // Only humans get answers, otherwise bots would talk to each other forever.
                    return sender != null && sender.userId != null;
                })
                .filter(
                    (m) =>
                        !isGroupChat ||
                        m.message
                            .toLowerCase()
                            .includes((bot.alias || "").toLowerCase()),
                );

            const latest = pending[pending.length - 1];

            if (!latest) {
                continue;
            }

            const sender = this._getPlayer(
                ctx.game,
                latest.fromPlayerId!.toString(),
            )!;

            const key = await this._respondToIntent(
                ctx,
                bot,
                sender,
                classifyMessage(latest.message),
            );

            await this._send(
                ctx,
                bot,
                convo,
                this._format(key, { player: sender.alias }),
            );
        }
    }

    async _respondToIntent(
        ctx: TurnContext,
        bot: Player,
        sender: Player,
        intent: ReturnType<typeof classifyMessage>,
    ): Promise<BotMessageKey> {
        const canDoDiplomacy =
            this.diplomacyService.isFormalAlliancesEnabled(ctx.game) &&
            !this.diplomacyService.isTeamGame(ctx.game);

        switch (intent) {
            case "alliance": {
                if (!canDoDiplomacy) {
                    return "replyOther";
                }

                const status =
                    this.diplomacyService.getDiplomaticStatusToPlayer(
                        ctx.game,
                        bot._id,
                        sender._id,
                    );

                if (status.actualStatus === "allies") {
                    return "replyAllianceAlreadyAllied";
                }

                const decision = this._decideOffer(ctx, bot, sender);

                if (!decision.accept) {
                    return decision.reason === "allianceCap"
                        ? "declineAllianceCap"
                        : decision.reason === "distrust"
                          ? "declineAllianceDistrust"
                          : "declineAllianceTooStrong";
                }

                if (status.statusTo !== "allies") {
                    await this._declareAlly(ctx, bot, sender);
                }

                return status.statusFrom === "allies"
                    ? "acceptAlliance"
                    : "replyAllianceInvite";
            }
            case "peace": {
                if (!canDoDiplomacy) {
                    return "replyPeace";
                }

                const status =
                    this.diplomacyService.getDiplomaticStatusToPlayer(
                        ctx.game,
                        bot._id,
                        sender._id,
                    );

                if (status.statusTo === "enemies") {
                    await this.diplomacyService.declareNeutral(
                        ctx.eventService,
                        ctx.game,
                        bot._id,
                        sender._id,
                        false,
                    );
                }

                return "replyPeace";
            }
            case "threat":
                return "replyThreat";
            case "greeting":
                return "replyGreeting";
            default:
                return "replyOther";
        }
    }

    _decideOffer(ctx: TurnContext, bot: Player, other: Player) {
        const offerer = ctx.strengths.get(other._id.toString())!;

        return decideAllianceOffer({
            offerer,
            leader: ctx.leader,
            starsForVictory: ctx.starsForVictory,
            reputation: this.reputationService.getReputation(bot, other)
                .reputation.score,
            atAllianceCap: this._isAtAllianceCap(ctx.game, bot),
        });
    }

    async _declareAlly(ctx: TurnContext, bot: Player, other: Player) {
        await this.diplomacyService.declareAlly(
            ctx.eventService,
            ctx.game,
            bot._id,
            other._id,
            false,
        );

        // Keep reputation consistent with the alliance so the reputation service
        // doesn't flip the bot back to neutral on its next recalculation.
        const rep = this.reputationService.getReputation(bot, other).reputation;
        rep.score = Math.max(rep.score, ALLY_REPUTATION);
    }

    _setReputation(bot: Player, other: Player, score: number) {
        this.reputationService.getReputation(bot, other).reputation.score =
            score;
    }

    _isAtAllianceCap(game: Game, bot: Player) {
        return (
            this.diplomacyService.isMaxAlliancesEnabled(game) &&
            this.diplomacyService.getAlliesOrOffersOfPlayer(game, bot).length >=
                game.settings.diplomacy.maxAlliances
        );
    }

    _getThreats(
        ctx: TurnContext,
        bot: Player,
        neighbourIds: Set<string>,
    ): PlayerStrength[] {
        const botStrength = ctx.strengths.get(bot._id.toString())!;

        return [...neighbourIds]
            .filter(
                (id) =>
                    this.diplomacyService.getDiplomaticStatusToPlayer(
                        ctx.game,
                        bot._id,
                        this._getPlayer(ctx.game, id)!._id,
                    ).actualStatus !== "allies",
            )
            .map((id) => ctx.strengths.get(id))
            .filter((s): s is PlayerStrength => s != null)
            .filter((s) => isThreat(botStrength, s));
    }

    _getNeighbourIds(game: Game, bot: Player): Set<string> {
        const botStars = game.galaxy.stars.filter(
            (s) => s.ownedByPlayerId?.toString() === bot._id.toString(),
        );
        const neighbours = new Set<string>();

        if (!botStars.length) {
            return neighbours;
        }

        for (const other of this._listOtherPlayers(game, bot)) {
            const hyperspace = Math.max(
                bot.research.hyperspace.level,
                other.research.hyperspace.level,
            );
            const range =
                this.distanceService.getHyperspaceDistance(game, hyperspace) *
                NEIGHBOUR_HYPERSPACE_JUMPS;
            const otherStars = game.galaxy.stars.filter(
                (s) => s.ownedByPlayerId?.toString() === other._id.toString(),
            );

            const isNeighbour = otherStars.some((os) =>
                botStars.some(
                    (bs) =>
                        this.distanceService.getDistanceBetweenLocations(
                            bs.location,
                            os.location,
                        ) <= range,
                ),
            );

            if (isNeighbour) {
                neighbours.add(other._id.toString());
            }
        }

        return neighbours;
    }

    _calculateStrengths(game: Game): Map<string, PlayerStrength> {
        const strengths = new Map<string, PlayerStrength>();

        for (const player of game.galaxy.players.filter((p) => !p.defeated)) {
            const stats = this.playerStatisticsService.getStats(game, player);

            strengths.set(player._id.toString(), {
                playerId: player._id.toString(),
                stars: stats.totalStars,
                ships: stats.totalShips,
                strength: calculateStrength(stats.totalStars, stats.totalShips),
            });
        }

        return strengths;
    }

    _listOtherPlayers(game: Game, bot: Player) {
        return game.galaxy.players.filter(
            (p) => !p.defeated && p._id.toString() !== bot._id.toString(),
        );
    }

    _getPlayer(game: Game, playerId: string) {
        return game.galaxy.players.find((p) => p._id.toString() === playerId);
    }

    _getMemory(bot: Player): BotDiplomacyMemory {
        if (!bot.aiState) {
            bot.aiState = {
                knownAttacks: [],
                invasionsInProgress: [],
                startedClaims: [],
            };
        }

        if (!bot.aiState.diplomacy) {
            bot.aiState.diplomacy = {
                declinedOffersFrom: [],
                lastProposalTick: {},
            };
        }

        return bot.aiState.diplomacy;
    }

    _format(key: BotMessageKey, values: Record<string, string>) {
        return formatBotMessage(key, values, (max) =>
            this.randomService.getRandomNumber(max - 1),
        );
    }

    async _message(
        ctx: TurnContext,
        bot: Player,
        to: Player,
        key: BotMessageKey,
        values: Record<string, string> = {},
    ) {
        const convo = await this._getOrCreateDirectConversation(ctx, bot, to);

        await this._send(
            ctx,
            bot,
            convo,
            this._format(key, { player: to.alias, ...values }),
        );
    }

    async _send(
        ctx: TurnContext,
        bot: Player,
        convo: Conversation<DBObjectId>,
        message: string,
    ) {
        await this.conversationService.sendToConversation(
            ctx.game,
            bot,
            convo,
            message,
            ctx.notificationService,
        );
    }

    async _getOrCreateDirectConversation(
        ctx: TurnContext,
        bot: Player,
        to: Player,
    ): Promise<Conversation<DBObjectId>> {
        const ids = [bot._id.toString(), to._id.toString()];

        const existing = ctx.conversations.find(
            (c) =>
                c.participants.length === 2 &&
                c.participants.every((p) => ids.includes(p.toString())),
        );

        if (existing) {
            return existing;
        }

        const convo = await this.conversationService.create(
            ctx.game,
            bot._id,
            `${bot.alias} - ${to.alias}`.substring(0, 100),
            [to._id],
            ctx.eventService,
        );

        // Not part of the loaded game document, but later messages this tick can reuse it.
        ctx.conversations.push(convo);

        return convo;
    }
}
