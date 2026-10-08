import { LlmJsonRequest, LlmProvider, LlmSchema } from "./types";

const API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const REQUEST_TIMEOUT_MS = 20000;

type FetchFn = typeof fetch;

// Google Gemini via the REST API, so no extra dependency is needed.
// Works with free tier keys from https://aistudio.google.com/apikey.
export default class GeminiProvider implements LlmProvider {
    readonly name: string;
    private apiKey: string;
    private model: string;
    private fetchFn: FetchFn;

    constructor(apiKey: string, model: string, fetchFn: FetchFn = fetch) {
        this.apiKey = apiKey;
        this.model = model;
        this.fetchFn = fetchFn;
        this.name = `gemini:${model}`;
    }

    async generateJson<T>(request: LlmJsonRequest): Promise<T> {
        const body = {
            systemInstruction: { parts: [{ text: request.system }] },
            contents: [{ role: "user", parts: [{ text: request.prompt }] }],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: toGeminiSchema(request.schema),
                maxOutputTokens: request.maxOutputTokens ?? 800,
                temperature: request.temperature ?? 0.9,
            },
        };

        const response = await this.fetchFn(
            `${API_BASE_URL}/models/${encodeURIComponent(this.model)}:generateContent`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": this.apiKey,
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            },
        );

        if (!response.ok) {
            const text = await response.text();
            throw new Error(
                `Gemini request failed (${response.status}): ${text.substring(0, 300)}`,
            );
        }

        const data: any = await response.json();
        const text: string | undefined = data?.candidates?.[0]?.content?.parts
            ?.map((p: any) => p.text ?? "")
            .join("");

        if (!text) {
            throw new Error(
                `Gemini returned no content (finish reason: ${data?.candidates?.[0]?.finishReason ?? "unknown"})`,
            );
        }

        return JSON.parse(text) as T;
    }
}

// Gemini's responseSchema uses OpenAPI style upper case type names.
export function toGeminiSchema(schema: LlmSchema): any {
    switch (schema.type) {
        case "object":
            return {
                type: "OBJECT",
                properties: Object.fromEntries(
                    Object.entries(schema.properties).map(([k, v]) => [
                        k,
                        toGeminiSchema(v),
                    ]),
                ),
                required: schema.required,
                propertyOrdering: Object.keys(schema.properties),
                description: schema.description,
            };
        case "array":
            return {
                type: "ARRAY",
                items: toGeminiSchema(schema.items),
                description: schema.description,
            };
        case "string":
            return {
                type: "STRING",
                enum: schema.enum,
                description: schema.description,
            };
        default:
            return {
                type: schema.type.toUpperCase(),
                description: schema.description,
            };
    }
}
