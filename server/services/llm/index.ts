import { Config } from "../../config/types/Config";
import GeminiProvider from "./gemini";
import RateLimitedLlmProvider from "./rateLimited";
import { LlmProvider } from "./types";

// Returns null when no provider is configured, in which case bots stay rule based.
export function createLlmProvider(config: Config): LlmProvider | null {
    const llm = config.llm;

    if (!llm?.geminiApiKey) {
        return null;
    }

    return new RateLimitedLlmProvider(
        new GeminiProvider(llm.geminiApiKey, llm.geminiModel),
        llm.requestsPerMinute,
        llm.requestsPerDay,
    );
}
