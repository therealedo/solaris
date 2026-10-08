import { LlmJsonRequest, LlmProvider, LlmUnavailableError } from "./types";

// Keeps usage inside a provider's free tier by refusing requests over a per minute
// and per day budget, instead of queueing them. Callers fall back to rule based behaviour.
export default class RateLimitedLlmProvider implements LlmProvider {
    readonly name: string;
    private inner: LlmProvider;
    private requestsPerMinute: number;
    private requestsPerDay: number;
    private now: () => number;
    private recent: number[] = [];
    private day = "";
    private dayCount = 0;

    constructor(
        inner: LlmProvider,
        requestsPerMinute: number,
        requestsPerDay: number,
        now: () => number = Date.now,
    ) {
        this.inner = inner;
        this.name = inner.name;
        this.requestsPerMinute = requestsPerMinute;
        this.requestsPerDay = requestsPerDay;
        this.now = now;
    }

    tryAcquire(): boolean {
        const now = this.now();
        // Free tier daily quotas reset at midnight Pacific time; UTC days are a close enough budget.
        const day = new Date(now).toISOString().substring(0, 10);

        if (day !== this.day) {
            this.day = day;
            this.dayCount = 0;
        }

        this.recent = this.recent.filter((t) => now - t < 60000);

        if (
            this.recent.length >= this.requestsPerMinute ||
            this.dayCount >= this.requestsPerDay
        ) {
            return false;
        }

        this.recent.push(now);
        this.dayCount++;

        return true;
    }

    async generateJson<T>(request: LlmJsonRequest): Promise<T> {
        if (!this.tryAcquire()) {
            throw new LlmUnavailableError("LLM request budget exhausted");
        }

        return await this.inner.generateJson<T>(request);
    }
}
