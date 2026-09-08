import { GoogleGenAI, type Schema } from '@google/genai';
import { GEMINI_API_KEY, GEMINI_MODEL } from './env';

export type { Schema } from '@google/genai';
export { Type } from '@google/genai';

export interface LLMUsage {
	inputTokens: number;
	outputTokens: number;
	model: string;
}

export interface LLMResponse {
	text: string;
	usage: LLMUsage;
}

const COST_PER_MILLION: Record<string, { input: number; output: number }> = {
	'gemini-2.5-flash':      { input: 0.30,  output: 2.50 },
	'gemini-2.5-flash-lite': { input: 0.10,  output: 0.40 },
	'gemini-2.5-pro':        { input: 1.25,  output: 10.00 },
	'gemini-3.1-flash-lite': { input: 0.25,  output: 1.50 },
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
	const pricing = COST_PER_MILLION[model] ?? { input: 0.075, output: 0.30 };
	return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

export function createGeminiProvider() {
	if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');
	const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
	const model = GEMINI_MODEL;
	return {
		model,
		async generate(
			content: string | object[],
			signal?: AbortSignal,
			systemInstruction?: string,
			responseSchema?: Schema,
		) {
			const contents = (typeof content === 'string' ? content : [{ role: 'user', parts: content }]) as Parameters<typeof ai.models.generateContent>[0]['contents'];
			const config: {
				abortSignal?: AbortSignal;
				systemInstruction?: string;
				responseMimeType?: string;
				responseSchema?: Schema;
			} = {};
			if (signal) config.abortSignal = signal;
			if (systemInstruction) config.systemInstruction = systemInstruction;
			if (responseSchema) {
				config.responseMimeType = 'application/json';
				config.responseSchema = responseSchema;
			}
			const response = await ai.models.generateContent({
				model,
				contents,
				...(Object.keys(config).length ? { config } : {}),
			});
			return {
				text: response.text ?? '',
				usage: {
					inputTokens:  response.usageMetadata?.promptTokenCount     ?? 0,
					outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
					model,
				},
			};
		},
	};
}
