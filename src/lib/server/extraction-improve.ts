import { desc, sql } from 'drizzle-orm';
import { db } from './db';
import { extractionCorrections, promptChangeProposals } from './schema';
import { correctionsByField } from './extraction-quality';
import { createGeminiProvider } from './llm-provider';

const TOP_FIELDS = 3;
const EXAMPLES_PER_FIELD = 5;
const CORRECTION_WINDOW_DAYS = 30;

export interface CorrectionExample {
	fieldName: string;
	originalValue: string | null;
	correctedValue: string | null;
}

async function sampleCorrections(fieldName: string, limit = EXAMPLES_PER_FIELD): Promise<CorrectionExample[]> {
	// tenant-scope-ok: candidate-proposal generator reasons over cross-tenant
	// correction patterns, the same rollup class as correctionsByField — it
	// never writes to a tenant's own data, only reads examples to summarize.
	return db
		.select({
			fieldName: extractionCorrections.fieldName,
			originalValue: extractionCorrections.originalValue,
			correctedValue: extractionCorrections.correctedValue,
		})
		.from(extractionCorrections)
		.where(sql`${extractionCorrections.fieldName} = ${fieldName} and ${extractionCorrections.correctedAt} > now() - (${CORRECTION_WINDOW_DAYS} * interval '1 day')`)
		.orderBy(desc(extractionCorrections.correctedAt))
		.limit(limit);
}

function buildMetaPrompt(fieldName: string, examples: CorrectionExample[]): string {
	const examplesText = examples
		.map((e, i) => `${i + 1}. original: ${JSON.stringify(e.originalValue)} -> corrected: ${JSON.stringify(e.correctedValue)}`)
		.join('\n');
	return `You maintain the system prompt and mapping rules for a Spanish restaurant invoice-extraction pipeline built on Gemini. The field "${fieldName}" has been corrected by users more often than other fields over the last ${CORRECTION_WINDOW_DAYS} days. Here are real (original extraction -> human correction) pairs for this field:

${examplesText}

Propose ONE minimal, specific change to reduce these errors — e.g. a clarifying instruction to add to the extraction prompt, a new unit/abbreviation synonym to add to a lookup table, or a threshold to adjust. Do not propose a full rewrite or touch unrelated fields.

Respond in exactly two parts, separated by a blank line:
1. A 2-3 sentence rationale referencing the pattern in the examples above.
2. The exact text to add or change, clearly marked with the file it belongs in if you know it.`;
}

export async function generateProposals(): Promise<number> {
	const byField = await correctionsByField(CORRECTION_WINDOW_DAYS);
	const targets = byField.filter((f) => f.corrections > 0).slice(0, TOP_FIELDS);
	if (!targets.length) return 0;

	const provider = createGeminiProvider();
	let created = 0;
	for (const target of targets) {
		const examples = await sampleCorrections(target.fieldName);
		if (!examples.length) continue;

		const { text } = await provider.generate(buildMetaPrompt(target.fieldName, examples));
		const [rationale, ...rest] = text.trim().split(/\n\s*\n/);

		await db.insert(promptChangeProposals).values({
			targetArea: target.fieldName,
			correctionExamples: examples as unknown as Record<string, unknown>[],
			proposedDiff: rest.join('\n\n').trim() || text.trim(),
			rationale: (rationale ?? text).trim(),
			status: 'pending',
		});
		created++;
	}
	return created;
}

export interface PromptChangeProposalRow {
	id: string;
	createdAt: string;
	targetArea: string;
	rationale: string;
	proposedDiff: string;
	status: string;
}

export async function listRecentProposals(limit = 20): Promise<PromptChangeProposalRow[]> {
	// tenant-scope-ok: platform-wide proposals derived from cross-tenant
	// correction rollups — there is no tenant to scope this table to.
	const rows = await db
		.select({
			id: promptChangeProposals.id,
			createdAt: promptChangeProposals.createdAt,
			targetArea: promptChangeProposals.targetArea,
			rationale: promptChangeProposals.rationale,
			proposedDiff: promptChangeProposals.proposedDiff,
			status: promptChangeProposals.status,
		})
		.from(promptChangeProposals)
		.orderBy(desc(promptChangeProposals.createdAt))
		.limit(limit);
	return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

export const EXTRACTION_IMPROVE_QUEUE = 'scheduled-extraction-improve';
export const EXTRACTION_IMPROVE_CRON = '30 6 * * 1';

export async function runExtractionImproveJob(): Promise<{ created: number }> {
	const created = await generateProposals();
	if (created) console.info(`[scheduler] extraction-improve: ${created} proposal(s) generated`);
	return { created };
}
