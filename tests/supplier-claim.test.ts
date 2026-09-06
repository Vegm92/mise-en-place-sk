import { describe, it, expect } from 'vitest';
import {
	claimEligibility, defaultClaimDraft, buildClaimLines, formatClaimLinesText, formatClaimDate,
	parseMismatchPayload,
} from '../src/lib/server/supplier-claim';

describe('claimEligibility', () => {
	const eligibleInvoice = { reviewState: 'incidencia', incidenceKind: 'documento' };
	const supplierWithEmail = { contactEmail: 'proveedor@example.com' };

	it('is eligible for a document-level incidence with a supplier email, never sent', () => {
		expect(claimEligibility(eligibleInvoice, supplierWithEmail, null)).toBe(true);
	});

	it('is not eligible for a reading incidence (lectura)', () => {
		expect(claimEligibility({ reviewState: 'incidencia', incidenceKind: 'lectura' }, supplierWithEmail, null)).toBe(false);
	});

	it('is not eligible when the invoice is not flagged as incidencia', () => {
		expect(claimEligibility({ reviewState: 'revisado', incidenceKind: 'documento' }, supplierWithEmail, null)).toBe(false);
	});

	it('is not eligible without a supplier contact email', () => {
		expect(claimEligibility(eligibleInvoice, { contactEmail: null }, null)).toBe(false);
	});

	it('is not eligible when the supplier is missing entirely', () => {
		expect(claimEligibility(eligibleInvoice, null, null)).toBe(false);
	});

	it('is not eligible once a claim was already sent', () => {
		expect(claimEligibility(eligibleInvoice, supplierWithEmail, new Date('2026-01-01'))).toBe(false);
		expect(claimEligibility(eligibleInvoice, supplierWithEmail, '2026-01-01T00:00:00.000Z')).toBe(false);
	});
});

describe('buildClaimLines', () => {
	it('formats a missing line with a quantity', () => {
		const lines = buildClaimLines('es', [{ description: 'Tomate pera', quantity: 5, unit: 'kg' }], []);
		expect(lines).toEqual([{ description: 'Tomate pera', detail: 'Falta en el albarán (5 kg)' }]);
	});

	it('formats a missing line without a quantity', () => {
		const lines = buildClaimLines('es', [{ description: 'Cebolla' }], []);
		expect(lines).toEqual([{ description: 'Cebolla', detail: 'Falta en el albarán' }]);
	});

	it('formats a quantity mismatch line', () => {
		const lines = buildClaimLines('es', [], [{ description: 'Leche', deliveryQty: 10, invoiceQty: 8, unit: 'L' }]);
		expect(lines).toEqual([{ description: 'Leche', detail: 'Cantidad distinta — albarán 10 L, factura 8 L' }]);
	});

	it('localizes to English', () => {
		const lines = buildClaimLines('en', [{ description: 'Tomatoes', quantity: 5, unit: 'kg' }], []);
		expect(lines[0]!.detail).toBe('Missing from the delivery note (5 kg)');
	});

	it('combines missing and mismatched lines in order', () => {
		const lines = buildClaimLines(
			'es',
			[{ description: 'A' }],
			[{ description: 'B', deliveryQty: 1, invoiceQty: 2 }],
		);
		expect(lines.map((l) => l.description)).toEqual(['A', 'B']);
	});
});

describe('formatClaimLinesText', () => {
	it('joins lines as a bulleted list', () => {
		const text = formatClaimLinesText('es', [
			{ description: 'Tomate', detail: 'Falta en el albarán (5 kg)' },
			{ description: 'Leche', detail: 'Cantidad distinta — albarán 10 L, factura 8 L' },
		]);
		expect(text).toBe('- Tomate: Falta en el albarán (5 kg)\n- Leche: Cantidad distinta — albarán 10 L, factura 8 L');
	});

	it('falls back to a generic notice with no lines', () => {
		expect(formatClaimLinesText('es', [])).toBe('No se han detectado líneas concretas; revisad el documento completo.');
		expect(formatClaimLinesText('en', [])).toBe('No specific lines were detected; please review the whole document.');
	});
});

describe('formatClaimDate', () => {
	it('formats an ISO date for Spanish', () => {
		expect(formatClaimDate('2026-07-20', 'es')).toBe('20/07/2026');
	});

	it('formats an ISO date for English', () => {
		expect(formatClaimDate('2026-07-20', 'en')).toBe('20/07/2026');
	});

	it('returns an empty string for a missing date', () => {
		expect(formatClaimDate(null, 'es')).toBe('');
		expect(formatClaimDate(undefined, 'es')).toBe('');
	});
});

describe('defaultClaimDraft', () => {
	it('renders the Spanish template with the missing-line detail', () => {
		const draft = defaultClaimDraft({
			locale: 'es',
			supplierName: 'Frutas García',
			restaurantName: 'Casa Pepe',
			documentLabel: 'ALB-102',
			documentDate: '20/07/2026',
			lines: [{ description: 'Tomate pera', detail: 'Falta en el albarán (5 kg)' }],
		});
		expect(draft.subject).toBe('Incidencia en el albarán ALB-102');
		expect(draft.body).toContain('Hola Frutas García,');
		expect(draft.body).toContain('En el albarán ALB-102 del 20/07/2026 hemos detectado una incidencia:');
		expect(draft.body).toContain('- Tomate pera: Falta en el albarán (5 kg)');
		expect(draft.body).toContain('Gracias,\nCasa Pepe');
	});

	it('renders the English template', () => {
		const draft = defaultClaimDraft({
			locale: 'en',
			supplierName: 'Fresh Produce Ltd',
			restaurantName: 'Casa Pepe',
			documentLabel: 'DN-9',
			documentDate: '20/07/2026',
			lines: [],
		});
		expect(draft.subject).toBe('Issue with delivery note DN-9');
		expect(draft.body).toContain('No specific lines were detected; please review the whole document.');
	});
});

describe('parseMismatchPayload', () => {
	it('extracts well-formed missing and mismatch arrays', () => {
		const parsed = parseMismatchPayload({
			missingInInvoice: [{ description: 'Tomate', quantity: 5, unit: 'kg' }],
			quantityMismatches: [{ description: 'Leche', deliveryQty: 10, invoiceQty: 8, unit: 'L' }],
		});
		expect(parsed.missingInInvoice).toHaveLength(1);
		expect(parsed.quantityMismatches).toHaveLength(1);
	});

	it('tolerates malformed or missing payloads', () => {
		expect(parseMismatchPayload(null)).toEqual({ missingInInvoice: [], quantityMismatches: [] });
		expect(parseMismatchPayload(undefined)).toEqual({ missingInInvoice: [], quantityMismatches: [] });
		expect(parseMismatchPayload('not an object')).toEqual({ missingInInvoice: [], quantityMismatches: [] });
		expect(parseMismatchPayload({ missingInInvoice: [{ noDescription: true }] }))
			.toEqual({ missingInInvoice: [], quantityMismatches: [] });
	});
});
