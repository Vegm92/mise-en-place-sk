import { vi, expect } from 'vitest';
import type { createGeminiProvider } from '../../src/lib/server/llm-provider';

type LLMProvider = ReturnType<typeof createGeminiProvider>;

export function makeSchemaCapturingGenerate(responseText: string) {
	return vi.fn<LLMProvider['generate']>(async () => ({
		text: responseText,
		usage: { inputTokens: 1, outputTokens: 1, model: 'test-model' },
	}));
}

export async function expectProviderSchemaForwarded<TData>(
	runJob: (data: TData, deps: {
		provider: { model: string; generate: ReturnType<typeof makeSchemaCapturingGenerate> };
		recordUsage: () => Promise<void>;
	}) => Promise<void>,
	jobData: TData,
	responseText: string,
): Promise<void> {
	const generate = makeSchemaCapturingGenerate(responseText);
	await runJob(jobData, { provider: { model: 'test-model', generate }, recordUsage: vi.fn(async () => {}) });
	expect(generate).toHaveBeenCalledOnce();
	const [, , , schema] = generate.mock.calls[0];
	expect(schema).toMatchObject({ type: 'OBJECT' });
}
