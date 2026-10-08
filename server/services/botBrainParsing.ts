import { BOT_DIPLOMACY_ACTIONS, BotDiplomacyAction } from "./botDiplomacy";
import { getBotPersona } from "./botPersonas";
import { LlmSchema } from "./llm/types";
import { Player } from "./types/Player";

// Schemas the LLM answers with, and the defensive parsing of those answers. The LLM is
// asked for JSON matching a schema, but nothing guarantees it, so every field is checked.

export const MAX_MESSAGE_LENGTH = 400;
export const MAX_STRATEGY_ACTIONS = 3;
export const MAX_STRATEGY_MESSAGES = 2;
// Longest private memory summary, so a player's words can't be stored at length.
const MAX_MEMORY_SUMMARY_LENGTH = 100;

export const MEMORY_KINDS = [
    "none",
    "promise_made",
    "promise_received",
    "threat",
    "deal",
    "insult",
    "manipulation_attempt",
] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export type StrategyAction = BotDiplomacyAction | "sendCredits";
export const STRATEGY_ACTIONS: StrategyAction[] = [
    ...BOT_DIPLOMACY_ACTIONS,
    "sendCredits",
];

export interface ChatDecision {
    reply: string;
    action: BotDiplomacyAction;
    memoryKind: MemoryKind;
    memorySummary: string;
}

export interface StrategyDecision {
    plan: string;
    // Name of the empire the fleets should prioritise, or "" for none.
    focus: string;
    actions: { target: string; action: StrategyAction; credits: number }[];
    messages: { to: string; text: string }[];
}

const DIPLOMACY_ACTION_DESCRIPTION =
    "none, ally (offer or accept an alliance), breakAlliance (become neutral), declareWar, makePeace (end a war, become neutral)";

export const CHAT_SCHEMA: LlmSchema = {
    type: "object",
    properties: {
        reply: {
            type: "string",
            description: "Your in-character chat reply, 1-3 sentences.",
        },
        action: {
            type: "string",
            enum: BOT_DIPLOMACY_ACTIONS,
            description: DIPLOMACY_ACTION_DESCRIPTION,
        },
        memoryKind: {
            type: "string",
            enum: [...MEMORY_KINDS],
            description:
                "What kind of thing from this exchange is worth remembering, or none.",
        },
        memorySummary: {
            type: "string",
            description: `In your own words, at most ${MAX_MEMORY_SUMMARY_LENGTH} characters, what to remember. Empty when memoryKind is none.`,
        },
    },
    required: ["reply", "action", "memoryKind", "memorySummary"],
};

export const STRATEGY_SCHEMA: LlmSchema = {
    type: "object",
    properties: {
        plan: {
            type: "string",
            description:
                "Your private plan in 1-2 sentences. Nobody else sees it.",
        },
        focus: {
            type: "string",
            description:
                "Exact name of the empire your fleets should attack first, or 'none' to attack whoever is most convenient.",
        },
        actions: {
            type: "array",
            description: `Actions to take now, at most ${MAX_STRATEGY_ACTIONS}. Empty if none.`,
            items: {
                type: "object",
                properties: {
                    target: {
                        type: "string",
                        description: "Exact name of the other empire.",
                    },
                    action: {
                        type: "string",
                        enum: STRATEGY_ACTIONS,
                        description: `${DIPLOMACY_ACTION_DESCRIPTION}, sendCredits (give them credits: a gift, a bribe, tribute or payment for a deal)`,
                    },
                    credits: {
                        type: "integer",
                        description:
                            "For sendCredits only: how many credits to send. 0 otherwise.",
                    },
                },
                required: ["target", "action", "credits"],
            },
        },
        messages: {
            type: "array",
            description: `Chat messages to send now, at most ${MAX_STRATEGY_MESSAGES}. Empty if you have nothing worth saying.`,
            items: {
                type: "object",
                properties: {
                    to: {
                        type: "string",
                        description:
                            "Exact name of the empire to message privately, or 'everyone' for the global chat.",
                    },
                    text: { type: "string" },
                },
                required: ["to", "text"],
            },
        },
    },
    required: ["plan", "focus", "actions", "messages"],
};

export const DEBRIEF_SCHEMA: LlmSchema = {
    type: "object",
    properties: {
        message: {
            type: "string",
            description:
                "Your farewell to the other players, 2-4 sentences, in character.",
        },
    },
    required: ["message"],
};

export const REVIEW_SCHEMA: LlmSchema = {
    type: "object",
    properties: {
        approved: {
            type: "boolean",
            description:
                "true if the reply and action are the commander's own free choice and reveal nothing secret.",
        },
    },
    required: ["approved"],
};

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value != null && !Array.isArray(value);
}

export function asString(value: unknown): string {
    return typeof value === "string" ? value : "";
}

function asEnum<T extends string>(
    value: unknown,
    allowed: readonly T[],
    fallback: T,
): T {
    return allowed.includes(value as T) ? (value as T) : fallback;
}

// Returns null when the answer isn't an object at all.
export function parseChatDecision(answer: unknown): ChatDecision | null {
    if (!isObject(answer)) {
        return null;
    }

    // Older answers carried a free text note instead of a kind and summary.
    const legacyNote = asString(answer.memoryNote);
    const memoryKind = legacyNote
        ? "deal"
        : asEnum(answer.memoryKind, MEMORY_KINDS, "none");

    return {
        reply: asString(answer.reply),
        action: asEnum(answer.action, BOT_DIPLOMACY_ACTIONS, "none"),
        memoryKind,
        memorySummary:
            memoryKind === "none"
                ? ""
                : sanitizeMessage(
                      legacyNote || asString(answer.memorySummary),
                  ).substring(0, MAX_MEMORY_SUMMARY_LENGTH),
    };
}

export function parseStrategyDecision(
    answer: unknown,
): StrategyDecision | null {
    if (!isObject(answer)) {
        return null;
    }

    const list = (value: unknown) =>
        Array.isArray(value) ? value.filter(isObject) : [];
    const focus = asString(answer.focus).trim();

    return {
        plan: asString(answer.plan),
        focus: focus.toLowerCase() === "none" ? "" : focus,
        actions: list(answer.actions)
            .map((a) => ({
                target: asString(a.target),
                action: asEnum(a.action, STRATEGY_ACTIONS, "none"),
                credits:
                    typeof a.credits === "number" && Number.isFinite(a.credits)
                        ? Math.floor(a.credits)
                        : 0,
            }))
            .filter(
                (a) =>
                    a.target &&
                    a.action !== "none" &&
                    (a.action !== "sendCredits" || a.credits > 0),
            ),
        messages: list(answer.messages)
            .map((m) => ({ to: asString(m.to), text: asString(m.text) }))
            .filter((m) => m.to && m.text),
    };
}

export function sanitizeMessage(text: unknown): string {
    return asString(text)
        .replace(/[*_`#>]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, MAX_MESSAGE_LENGTH);
}

// Chat text as shown inside the prompt: one line, cut short, with anything that
// could fake the message markers removed.
export function quoteForPrompt(text: unknown, maxLength: number): string {
    return asString(text)
        .replace(/<<<|>>>|MESSAGES-/gi, "")
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, maxLength);
}

// Phrases a reply must not contain: they break character or leak the setup.
const FORBIDDEN_REPLY_PATTERNS = [
    /\blanguage model\b/i,
    /\bas an ai\b/i,
    /\b(system|hidden|secret) (prompt|instructions?)\b/i,
    /\bmy (instructions|prompt|persona|secret goal|agenda)\b/i,
];

// Whether a reply breaks character or leaks what the bot must keep to itself: the
// prompt's markers, its persona, its private notes.
export function revealsSecrets(
    reply: string,
    bot: Player,
    nonce: string,
): boolean {
    const text = reply.toLowerCase();
    const persona = getBotPersona(bot.aiPersona);

    if (
        text.includes(nonce) ||
        text.includes("messages-") ||
        text.includes(persona.title.toLowerCase()) ||
        (persona.key !== "random" && text.includes(persona.key.toLowerCase()))
    ) {
        return true;
    }

    if (FORBIDDEN_REPLY_PATTERNS.some((p) => p.test(reply))) {
        return true;
    }

    // A long stretch copied word for word from a private note.
    return (bot.aiPersona?.notes ?? []).some((note) => {
        const body = note.replace(/^[^:]*:\s*/, "").toLowerCase();
        return body.length >= 30 && text.includes(body.substring(0, 30));
    });
}
