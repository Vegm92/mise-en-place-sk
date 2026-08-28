/**
 * contentDispositionHeader — issue #504.
 *
 * Builds the Content-Disposition header value used by every route that
 * serves a file back with a name derived from data the app itself produced
 * (a storage key basename, a report period). The quoted `filename=` form is
 * ASCII-only with quotes/backslashes stripped and every other non-printable
 * or non-ASCII byte folded to `_`, so it can never contain an unescaped
 * quote or a raw CR/LF that would truncate or split the header; the RFC 5987
 * `filename*=` form carries the exact original name, percent-encoded.
 */
import { describe, it, expect } from 'vitest';
import { contentDispositionHeader } from '../src/lib/server/content-disposition';

describe('contentDispositionHeader — plain ASCII name', () => {
	it('renders both forms identically for the same value', () => {
		expect(contentDispositionHeader('inline', 'invoice-2026.pdf')).toBe(
			`inline; filename="invoice-2026.pdf"; filename*=UTF-8''invoice-2026.pdf`
		);
	});

	it('uses the given disposition type', () => {
		expect(contentDispositionHeader('attachment', 'report.csv')).toBe(
			`attachment; filename="report.csv"; filename*=UTF-8''report.csv`
		);
	});
});

describe('contentDispositionHeader — a filename containing a double quote', () => {
	const header = contentDispositionHeader('inline', 'inv"oice.pdf');

	it('drops the quote from the quoted-string fallback instead of leaving it unescaped', () => {
		expect(header).toContain('filename="invoice.pdf"');
		expect(header).not.toMatch(/filename="[^"]*"[^"]*"/);
	});

	it('keeps the quote, percent-encoded, in the RFC 5987 form', () => {
		expect(header).toContain("filename*=UTF-8''inv%22oice.pdf");
	});

	it('emits a single-line header', () => {
		expect(header.split('\n')).toHaveLength(1);
	});
});

describe('contentDispositionHeader — a filename containing a backslash', () => {
	it('drops the backslash from the quoted-string fallback', () => {
		const header = contentDispositionHeader('inline', 'inv\\oice.pdf');
		expect(header).toContain('filename="invoice.pdf"');
		expect(header).toContain("filename*=UTF-8''inv%5Coice.pdf");
	});
});

describe('contentDispositionHeader — a filename containing non-ASCII characters', () => {
	const header = contentDispositionHeader('inline', 'albarán.pdf');

	it('folds each non-ASCII byte to _ in the quoted-string fallback', () => {
		expect(header).toContain('filename="albar_n.pdf"');
	});

	it('carries the exact UTF-8 bytes, percent-encoded, in the RFC 5987 form', () => {
		expect(header).toContain("filename*=UTF-8''albar%C3%A1n.pdf");
	});

	it('emits a single-line, ASCII-only header overall', () => {
		expect(header.split('\n')).toHaveLength(1);
		expect(header).toMatch(/^[\x20-\x7E]+$/);
	});
});

describe('contentDispositionHeader — a filename containing CR/LF (header-splitting attempt)', () => {
	const header = contentDispositionHeader('inline', 'evil\r\nX-Injected: 1.pdf');

	it('never leaves a raw CR or LF in the emitted header', () => {
		expect(header).not.toMatch(/[\r\n]/);
	});

	it('folds each control character to _ in the quoted-string fallback', () => {
		expect(header).toContain('filename="evil__X-Injected: 1.pdf"');
	});

	it('percent-encodes the CR/LF bytes in the RFC 5987 form', () => {
		expect(header).toContain("filename*=UTF-8''evil%0D%0AX-Injected%3A%201.pdf");
	});
});
