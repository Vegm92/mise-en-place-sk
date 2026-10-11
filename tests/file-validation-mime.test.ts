import { describe, it, expect } from 'vitest';
import { resolveMimeType } from '../src/lib/server/file-validation';

describe('resolveMimeType', () => {
	it.each([
		['pdf', 'application/pdf'],
		['.pdf', 'application/pdf'],
		['invoice.pdf', 'application/pdf'],
		['jpg', 'image/jpeg'],
		['.jpg', 'image/jpeg'],
		['jpeg', 'image/jpeg'],
		['.jpeg', 'image/jpeg'],
		['photo.jpeg', 'image/jpeg'],
		['png', 'image/png'],
		['.png', 'image/png'],
		['image.png', 'image/png'],
		['webp', 'image/webp'],
		['.webp', 'image/webp'],
		['picture.webp', 'image/webp'],
		['xml', 'application/xml'],
		['.xml', 'application/xml'],
		['factura.xml', 'application/xml'],
		['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
		['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
		['inventario.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
		['zip', 'application/zip'],
		['.zip', 'application/zip'],
		['facturas.zip', 'application/zip'],
		['csv', 'text/csv'],
		['.csv', 'text/csv'],
		['export.csv', 'text/csv'],
	])('resolves %s to %s', (input, expected) => {
		expect(resolveMimeType(input)).toBe(expected);
	});

	it('returns application/octet-stream for unknown extensions', () => {
		expect(resolveMimeType('unknown')).toBe('application/octet-stream');
		expect(resolveMimeType('.xyz')).toBe('application/octet-stream');
		expect(resolveMimeType('file.bin')).toBe('application/octet-stream');
	});

	it('handles upper case extensions gracefully', () => {
		expect(resolveMimeType('DOCUMENT.PDF')).toBe('application/pdf');
		expect(resolveMimeType('.WEBP')).toBe('image/webp');
	});
});
