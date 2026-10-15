import { describe, it, expect } from 'vitest';
import { resolveMimeType } from '$lib/server/file-validation';

describe('resolveMimeType', () => {
	it.each([
		['invoice.pdf', 'application/pdf'],
		['.pdf', 'application/pdf'],
		['pdf', 'application/pdf'],
		['INVOICE.PDF', 'application/pdf'],
		['scan.jpg', 'image/jpeg'],
		['scan.jpeg', 'image/jpeg'],
		['photo.png', 'image/png'],
		['photo.webp', 'image/webp'],
		['factura.xml', 'application/xml'],
		['photo.heic', 'image/heic'],
		['photo.heif', 'image/heif'],
	])('maps %s to %s', (input, expected) => {
		expect(resolveMimeType(input)).toBe(expected);
	});

	it('falls back to application/octet-stream for unknown extensions or filenames without extension', () => {
		expect(resolveMimeType('data.bin')).toBe('application/octet-stream');
		expect(resolveMimeType('noext')).toBe('application/octet-stream');
		expect(resolveMimeType('')).toBe('application/octet-stream');
	});
});
