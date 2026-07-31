import { GoogleGenAI } from '@google/genai';
import { GEMINI_API_KEY, GEMINI_MODEL, LLM_PROVIDER } from './env';

export interface LLMUsage {
	inputTokens: number;
	outputTokens: number;
	model: string;
}

export interface LLMResponse {
	text: string;
	usage: LLMUsage;
}

export interface LLMProvider {
	readonly model: string;
	generate(content: string | object[]): Promise<LLMResponse>;
}

const COST_PER_MILLION: Record<string, { input: number; output: number }> = {
	'gemini-2.5-flash':      { input: 0.30, output: 2.50 },
	'gemini-2.5-flash-lite': { input: 0.10, output: 0.40 },
	'gemini-2.5-pro':        { input: 1.25, output: 10.00 },
	'gemini-1.5-flash':      { input: 0.075, output: 0.30 },
	'gemini-1.5-flash-8b':   { input: 0.0375, output: 0.15 },
	'gemini-1.5-pro':        { input: 1.25, output: 5.00 },
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
	const pricing = COST_PER_MILLION[model] ?? { input: 0.075, output: 0.30 };
	return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

function createGeminiProvider(): LLMProvider {
	if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');
	const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
	const model = GEMINI_MODEL;
	return {
		model,
		async generate(content) {
			const contents = typeof content === 'string'
				? content
				: [{ role: 'user', parts: content }];
			const response = await ai.models.generateContent({ model, contents });
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

export function createLLMProvider(name: string = LLM_PROVIDER): LLMProvider {
	switch (name) {
		case 'gemini': return createGeminiProvider();
		default: throw new Error(`Unknown LLM_PROVIDER: "${name}". Supported: gemini`);
	}
}
