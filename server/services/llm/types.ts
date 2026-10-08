// A minimal JSON schema subset understood by every provider we support.
export type LlmSchema =
    | { type: "string"; enum?: string[]; description?: string }
    | { type: "number" | "integer" | "boolean"; description?: string }
    | { type: "array"; items: LlmSchema; description?: string }
    | {
          type: "object";
          properties: Record<string, LlmSchema>;
          required?: string[];
          description?: string;
      };

export interface LlmJsonRequest {
    // Stable instructions (persona, rules of the game).
    system: string;
    // The situation to respond to.
    prompt: string;
    // Shape of the JSON object the model must return.
    schema: LlmSchema;
    maxOutputTokens?: number;
    temperature?: number;
}

// Anything that can turn a prompt into structured JSON. Implementations must throw on failure
// so callers can fall back to rule based behaviour.
export interface LlmProvider {
    readonly name: string;
    generateJson<T>(request: LlmJsonRequest): Promise<T>;
}

export class LlmUnavailableError extends Error {}
