import './lib/server/env-file.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getStorage } from './lib/server/storage.js';
import { extractWithProvider, EXTRACTION_PROMPT_VERSION } from './lib/server/extract.js';
import {
	listCorpusEntries, recordExtractionResult, promptVersionStats, diffExtractions,
	summarizeComparisons, anonymizeExtraction, type CorpusEntry, type FieldDiff,
} from './lib/server/extraction-corpus.js';
import { flag, hasFlag } from './lib/server/cli-flags.js';

const limit = Number(flag('limit') ?? 10) || 10;
const restaurantId = flag('restaurant') || undefined;
const promptVersion = flag('prompt-version') || undefined;
const exportPath = flag('export');
const dryRun = hasFlag('dry-run');

async function printStats(): Promise<void> {
	const stats = await promptVersionStats();
	if (!stats.length) {
		console.info('[replay] the corpus is empty — no extraction has been recorded yet');
		return;
	}
	console.info('[replay] corpus by prompt version:');
	for (const s of stats) {
		const confidence = s.avgConfidence == null ? 'n/a' : s.avgConfidence.toFixed(3);
		console.info(
			`  ${s.promptVersion} (${s.runKind}): ${s.documents} doc(s), avg confidence ${confidence}, ` +
			`${s.totalMismatches} total-mismatch, last ${s.lastSeen?.toISOString() ?? 'n/a'}`,
		);
	}
	console.info(`[replay] current prompt version: ${EXTRACTION_PROMPT_VERSION}`);
}

async function exportCorpus(target: string, entries: CorpusEntry[]): Promise<void> {
	const lines = entries.map((entry) => JSON.stringify({
		id: entry.id,
		file_key: entry.fileKey,
		source: entry.source,
		run_kind: entry.runKind,
		prompt_version: entry.promptVersion,
		model: entry.model,
		created_at: entry.createdAt,
		extracted_data: anonymizeExtraction(entry.extractedData),
	}));
	fs.writeFileSync(target, lines.join('\n') + (lines.length ? '\n' : ''));
	console.info(`[replay] wrote ${lines.length} anonymized corpus entr(ies) to ${target}`);
}

async function replayEntry(entry: CorpusEntry): Promise<FieldDiff[] | null> {
	const buf = await getStorage().read(entry.fileKey);
	const tmpPath = path.join(os.tmpdir(), `mep_replay_${entry.id}_${path.basename(entry.fileKey)}`);
	fs.writeFileSync(tmpPath, buf);
	try {
		const { invoice, usage } = await extractWithProvider(tmpPath);
		const candidate = invoice as unknown as Record<string, unknown>;
		await recordExtractionResult({
			restaurantId: entry.restaurantId,
			batchItemId: entry.batchItemId,
			fileKey: entry.fileKey,
			displayName: entry.displayName,
			source: entry.source,
			runKind: 'replay',
			promptVersion: EXTRACTION_PROMPT_VERSION,
			model: usage.model,
			extractedData: candidate,
		});
		return diffExtractions(entry.extractedData, candidate);
	} finally {
		try { fs.unlinkSync(tmpPath); } catch { }
	}
}

async function main(): Promise<void> {
	if (hasFlag('stats')) {
		await printStats();
		return;
	}

	const entries = await listCorpusEntries({ restaurantId, promptVersion, limit });
	if (!entries.length) {
		console.info('[replay] no corpus entries match the filter — nothing to replay');
		return;
	}

	if (exportPath) {
		await exportCorpus(exportPath || 'extraction-corpus.jsonl', entries);
		return;
	}

	console.info(`[replay] ${entries.length} document(s); baseline prompt versions: ${[...new Set(entries.map(e => e.promptVersion))].join(', ')}`);
	console.info(`[replay] candidate prompt version: ${EXTRACTION_PROMPT_VERSION}`);

	if (dryRun) {
		for (const entry of entries) {
			console.info(`  ${entry.createdAt?.toISOString() ?? '?'} ${entry.promptVersion} ${entry.displayName ?? entry.fileKey}`);
		}
		console.info('[replay] dry run — no model calls were made');
		return;
	}

	const perDocument: FieldDiff[][] = [];
	for (const entry of entries) {
		try {
			const diffs = await replayEntry(entry);
			if (!diffs) continue;
			perDocument.push(diffs);
			const changed = diffs.filter((d) => !d.equal);
			const label = entry.displayName ?? entry.fileKey;
			if (!changed.length) {
				console.info(`  = ${label}: identical on all ${diffs.length} compared fields`);
			} else {
				console.info(`  ≠ ${label}: ${changed.length} field(s) changed`);
				for (const d of changed) console.info(`      ${d.field}: ${JSON.stringify(d.baseline)} → ${JSON.stringify(d.candidate)}`);
			}
		} catch (err) {
			console.error(`  ! ${entry.displayName ?? entry.fileKey}: replay failed (skipped):`, err);
		}
	}

	if (!perDocument.length) {
		console.info('[replay] no document could be replayed');
		return;
	}

	const summary = summarizeComparisons(perDocument);
	console.info(`[replay] ${summary.documents} document(s), ${summary.changedDocuments} with at least one change`);
	for (const field of summary.fields) {
		console.info(`  ${field.field.padEnd(20)} ${field.matched}/${field.compared} agree${field.rate == null ? '' : ` (${field.rate}%)`}`);
	}
}

await main();
process.exit(0);
