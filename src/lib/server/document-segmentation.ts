import path from 'node:path';
import { rangeSuffix, splitPdfRanges, type PageRange } from './pdf-pages';
import {
	describeStructure, detectDocumentStructure,
	type DocumentStructure, type StructureDeps,
} from './document-structure';

export const STRUCTURE_UNCLEAR_ERROR = 'extract.err.structureUnclear';

export interface SegmentFile {
	key: string;
	name: string;
}

export interface SegmentationDeps {
	existingKeys: Set<string>;
	saveSegment(key: string, buf: Buffer): Promise<void>;
	addItems(files: SegmentFile[]): Promise<string[]>;
	enqueue(itemId: string): Promise<unknown>;
	discardSource(): Promise<unknown>;
}

export type SegmentationOutcome =
	| { action: 'extract'; structure: DocumentStructure }
	| { action: 'split'; structure: DocumentStructure; itemIds: string[]; files: SegmentFile[] }
	| { action: 'review'; structure: DocumentStructure; reason: string };

export function segmentKey(fileKey: string, range: PageRange): string {
	const ext = path.extname(fileKey);
	const dir = path.dirname(fileKey);
	const stem = path.basename(fileKey, ext);
	const name = `${stem}_${rangeSuffix(range)}${ext}`;
	return dir === '.' ? name : `${dir}/${name}`;
}

export function segmentDisplayName(displayName: string, range: PageRange): string {
	const ext = path.extname(displayName);
	const stem = path.basename(displayName, ext);
	return `${stem} (${rangeSuffix(range)})${ext}`;
}

export function segmentFiles(fileKey: string, displayName: string, segments: PageRange[]): SegmentFile[] {
	return segments.map((range) => ({
		key: segmentKey(fileKey, range),
		name: segmentDisplayName(displayName, range),
	}));
}

export function isSegmentableDocument(fileKey: string): boolean {
	return path.extname(fileKey).toLowerCase() === '.pdf';
}

export async function segmentDocument(
	source: { fileKey: string; displayName: string; buffer: Buffer },
	deps: SegmentationDeps,
	structureDeps: StructureDeps = {},
): Promise<SegmentationOutcome> {
	const structure = await detectDocumentStructure(source.buffer, structureDeps);

	if (structure.kind === 'single') return { action: 'extract', structure };
	if (structure.kind === 'unclear') {
		return { action: 'review', structure, reason: STRUCTURE_UNCLEAR_ERROR };
	}

	const files = segmentFiles(source.fileKey, source.displayName, structure.segments);
	const fresh = files
		.map((file, index) => ({ file, range: structure.segments[index] }))
		.filter(({ file }) => !deps.existingKeys.has(file.key));

	const buffers = fresh.length ? await splitPdfRanges(source.buffer, fresh.map((f) => f.range)) : [];
	for (const [index, { file }] of fresh.entries()) {
		await deps.saveSegment(file.key, buffers[index]);
	}

	const itemIds = fresh.length ? await deps.addItems(fresh.map((f) => f.file)) : [];
	for (const itemId of itemIds) await deps.enqueue(itemId);
	await deps.discardSource();

	console.info(`[segmentation] ${source.displayName}: ${describeStructure(structure)} — ${itemIds.length} document(s) queued`);

	return { action: 'split', structure, itemIds, files };
}
