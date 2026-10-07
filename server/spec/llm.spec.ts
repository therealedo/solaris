import GeminiProvider, { toGeminiSchema } from "../services/llm/gemini";
import RateLimitedLlmProvider from "../services/llm/rateLimited";
import { LlmUnavailableError } from "../services/llm/types";
import { pickPersonaKeys, BOT_PERSONAS } from "../services/botPersonas";

describe("llm", () => {
    describe("RateLimitedLlmProvider", () => {
        let now: number;
        let calls: number;
        let provider: RateLimitedLlmProvider;

        beforeEach(() => {
            now = Date.UTC(2026, 9, 7, 12, 0, 0);
            calls = 0;
            provider = new RateLimitedLlmProvider(
                {
                    name: "fake",
                    generateJson: async () => {
                        calls++;
                        return {} as any;
                    },
                },
                2,
                3,
                () => now,
            );
        });

        const request = {
            system: "",
            prompt: "",
            schema: { type: "string" },
        } as any;

        it("should refuse requests over the per minute budget", async () => {
            await provider.generateJson(request);
            await provider.generateJson(request);

            await expectAsync(
                provider.generateJson(request),
            ).toBeRejectedWithError(LlmUnavailableError);

            now += 61000;
            await provider.generateJson(request);

            expect(calls).toBe(3);
        });

        it("should refuse requests over the daily budget until the next day", async () => {
            for (let i = 0; i < 3; i++) {
                await provider.generateJson(request);
                now += 61000;
            }

            await expectAsync(
                provider.generateJson(request),
            ).toBeRejectedWithError(LlmUnavailableError);

            now += 24 * 60 * 60 * 1000;
            await provider.generateJson(request);

            expect(calls).toBe(4);
        });
    });

    describe("GeminiProvider", () => {
        it("should send a structured output request and parse the JSON reply", async () => {
            let captured: any;

            const fakeFetch: any = async (url, init) => {
                captured = { url, init };

                return {
                    ok: true,
                    json: async () => ({
                        candidates: [
                            {
                                content: {
                                    parts: [{ text: '{"reply":"Hello"}' }],
                                },
                            },
                        ],
                    }),
                };
            };

            const provider = new GeminiProvider(
                "key123",
                "gemini-test",
                fakeFetch,
            );

            const result = await provider.generateJson<{ reply: string }>({
                system: "Be a bot",
                prompt: "Say hi",
                schema: {
                    type: "object",
                    properties: { reply: { type: "string" } },
                    required: ["reply"],
                },
            });

            const body = JSON.parse(captured.init.body);

            expect(result.reply).toBe("Hello");
            expect(captured.url).toContain(
                "models/gemini-test:generateContent",
            );
            expect(captured.init.headers["x-goog-api-key"]).toBe("key123");
            expect(body.systemInstruction.parts[0].text).toBe("Be a bot");
            expect(body.generationConfig.responseMimeType).toBe(
                "application/json",
            );
            expect(body.generationConfig.responseSchema.type).toBe("OBJECT");
        });

        it("should throw on an error response", async () => {
            const fakeFetch: any = async () => ({
                ok: false,
                status: 429,
                text: async () => "Resource exhausted",
            });

            const provider = new GeminiProvider("key", "model", fakeFetch);

            await expectAsync(
                provider.generateJson({
                    system: "",
                    prompt: "",
                    schema: { type: "string" },
                }),
            ).toBeRejectedWithError(/429/);
        });

        it("should convert schemas to Gemini's format", () => {
            const schema = toGeminiSchema({
                type: "array",
                items: { type: "string", enum: ["a", "b"] },
            });

            expect(schema).toEqual({
                type: "ARRAY",
                items: {
                    type: "STRING",
                    enum: ["a", "b"],
                    description: undefined,
                },
                description: undefined,
            });
        });
    });

    describe("pickPersonaKeys", () => {
        it("should not repeat personas until all are used", () => {
            const keys = pickPersonaKeys(BOT_PERSONAS.length, () => 0);

            expect(new Set(keys).size).toBe(BOT_PERSONAS.length);
            expect(
                pickPersonaKeys(BOT_PERSONAS.length + 1, () => 0).length,
            ).toBe(BOT_PERSONAS.length + 1);
        });
    });
});
