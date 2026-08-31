import { vi } from 'vitest';
import type { createGeminiProvider } from '../../src/lib/server/llm-provider';

type LLMProvider = ReturnType<typeof createGeminiProvider>;

export function makeSchemaCapturingGenerate(responseText: string) {
	return vi.fn<LLMProvider['generate']>(async () => ({
		text: responseText,
		usage: { inputTokens: 1, outputTokens: 1, model: 'test-model' },
	}));
}
