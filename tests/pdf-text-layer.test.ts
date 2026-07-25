/**
 * Real PDF text-layer extraction (issue #225).
 *
 * tests/extract.test.ts mocks `unpdf`, so nothing there exercises the parser
 * that actually replaced pdf-parse. This drives `classifyFile` over real PDF
 * bytes: it is the guarantee the "text PDF skips vision" path rests on, and the
 * thing that would silently regress if the parser were swapped again or if a
 * dependency override moved pdf.js underneath it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { classifyFile } from '../src/lib/server/extract';

/**
 * A minimal but *valid* PDF — one page, one text run per line, and a real xref
 * table with correct byte offsets. Built as bytes so the suite needs no binary
 * fixture checked in.
 *
 * The xref matters: without it pdf.js falls back to object recovery and cuts
 * the content stream short. Lines matter too — a single long run runs off the
 * MediaBox and the glyphs past the edge are dropped.
 */
function pdfWithLines(lines: string[]): Buffer {
	const runs = lines.map((line, i) => `BT /F1 12 Tf 20 ${260 - i * 20} Td (${line}) Tj ET`).join('\n');
	const objs = [
		'<</Type/Catalog/Pages 2 0 R>>',
		'<</Type/Pages/Kids[3 0 R]/Count 1>>',
		'<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 300]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
		`<</Length ${Buffer.byteLength(runs, 'latin1')}>>stream\n${runs}\nendstream`,
		'<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
	];

	let pdf = '%PDF-1.4\n';
	const offsets: number[] = [];
	objs.forEach((body, i) => {
		offsets.push(pdf.length);
		pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
	});
	const xref = pdf.length;
	pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
		+ offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')
		+ `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
	return Buffer.from(pdf, 'latin1');
}

const INVOICE_LINES = [
	'FACTURA F-2026-001',
	'Proveedor Test SL',
	'Base imponible 1033,06',
	'IVA 21% 216,94',
	'Total 1250,00 EUR',
];

let dir: string;

function write(name: string, buf: Buffer): string {
	const fp = path.join(dir, name);
	writeFileSync(fp, buf);
	return fp;
}

beforeAll(() => { dir = mkdtempSync(path.join(tmpdir(), 'mep-pdf-')); });
afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

describe('classifyFile — real PDF text layer', () => {
	it('reads the text out of a text PDF and routes it away from vision', async () => {
		const result = await classifyFile(write('factura.pdf', pdfWithLines(INVOICE_LINES)));

		expect(result.type).toBe('text_pdf');
		const text = result.type === 'text_pdf' ? result.text : '';
		expect(text).toContain('FACTURA F-2026-001');
		expect(text).toContain('Proveedor Test SL');
		expect(text).toContain('1250,00');
	});

	it('routes a PDF with no text layer to vision', async () => {
		// An image-only scan: valid PDF, nothing to read, so Gemini gets pixels.
		expect((await classifyFile(write('escaneo.pdf', pdfWithLines([])))).type).toBe('scanned_pdf');
	});

	it('routes a PDF with too little text to vision', async () => {
		// Below the 50-character threshold — likelier to be a scan artefact than
		// a real text layer.
		expect((await classifyFile(write('casi-vacio.pdf', pdfWithLines(['Total 12'])))).type)
			.toBe('scanned_pdf');
	});

	it('falls back to vision for bytes that are not a PDF, instead of throwing', async () => {
		// A corrupt upload must degrade to the vision path, never fail the
		// extraction outright or leave it pending.
		const fp = write('roto.pdf', Buffer.from('this is not a pdf at all'));
		expect((await classifyFile(fp)).type).toBe('scanned_pdf');
	});
});
