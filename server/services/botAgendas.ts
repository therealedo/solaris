import { getPersona } from "./botPersonas";
import { BotAgenda } from "./types/Ai";

// Secret goals handed to AI opponents at the start. They shape a bot's plans and are
// revealed in its end of game debrief.
export interface AgendaDefinition {
    key: string;
    // For the LLM. {rival} is replaced by the rival's name.
    goal: string;
    // For the debrief, completing "My secret goal was to ...".
    reveal: string;
}

export const AGENDAS: AgendaDefinition[] = [
    {
        key: "dominate",
        goal: "Finish as the strongest empire in the galaxy.",
        reveal: "finish as the strongest empire in the galaxy",
    },
    {
        key: "survive",
        goal: "Survive to the very end, whatever it takes, and never be defeated.",
        reveal: "survive to the very end",
    },
    {
        key: "rival",
        goal: "Ruin the empire of {rival}: make sure they end weaker than you, or defeated.",
        reveal: "ruin {rival}",
    },
    {
        key: "centre",
        goal: "Hold the star closest to the centre of the galaxy.",
        reveal: "hold the centre of the galaxy",
    },
    {
        key: "kingmaker",
        goal: "Be on the winning side: be allied with whoever wins when the game ends.",
        reveal: "be allied with the winner",
    },
];

export function getAgenda(key: string | null | undefined) {
    return AGENDAS.find((a) => a.key === key) ?? null;
}

export function pickAgenda(random: () => number): BotAgenda {
    return {
        key: AGENDAS[Math.floor(random() * AGENDAS.length)].key,
        targetPlayerId: null,
    };
}

export function describeAgenda(
    agenda: BotAgenda | null | undefined,
    rivalName: string | null,
): string {
    const definition = getAgenda(agenda?.key);

    if (!definition) {
        return "";
    }

    return definition.goal.replace("{rival}", rivalName ?? "your rival");
}

export interface AgendaOutcome {
    rank: number;
    defeated: boolean;
    rivalDefeated: boolean;
    rivalWeaker: boolean;
    holdsCentre: boolean;
    alliedWithWinner: boolean;
    isWinner: boolean;
}

export function isAgendaAchieved(
    agenda: BotAgenda | null | undefined,
    outcome: AgendaOutcome,
): boolean {
    switch (agenda?.key) {
        case "dominate":
            return outcome.isWinner || outcome.rank === 1;
        case "survive":
            return !outcome.defeated;
        case "rival":
            return outcome.rivalDefeated || outcome.rivalWeaker;
        case "centre":
            return outcome.holdsCentre;
        case "kingmaker":
            return outcome.isWinner || outcome.alliedWithWinner;
        default:
            return false;
    }
}

// The debrief a bot posts when no LLM is available to write one in character.
export function debriefTemplate(
    personaKey: string,
    agenda: BotAgenda | null | undefined,
    rivalName: string | null,
    achieved: boolean,
): string {
    const persona = getPersona(personaKey);
    const definition = getAgenda(agenda?.key);
    const goal = definition
        ? ` My secret goal was to ${definition.reveal.replace("{rival}", rivalName ?? "my rival")}, ${achieved ? "and I did it." : "and I fell short."}`
        : "";

    return `Good game, everyone. I played as ${persona.title}.${goal}`;
}
