/**
 * Tests for the VERI*FACTU / TicketBAI QR parsing module (issue #110).
 */
import { describe, it, expect } from 'vitest';
import {
	parseQrUrl,
	detectVerifactuMismatch,
	qrFechaToIso,
	isoToQrFecha,
	buildAeatVerificationUrl,
} from '../src/lib/server/qr';

// ── parseQrUrl ────────────────────────────────────────────────────────────────

describe('parseQrUrl — VERI*FACTU (AEAT ValidarQR)', () => {
	it('parses a standard ValidarQR URL', () => {
		const url = 'https://www2.agenciatributaria.es/wlpl/TIKE-CONT/ValidarQR?nif=B12345678&numserie=FAC-2024-001&fecha=15-01-2024&importe=1250.00';
		const result = parseQrUrl(url);
		expect(result).not.toBeNull();
		expect(result?.type).toBe('verifactu');
		if (result?.type === 'verifactu') {
			expect(result.data.nif).toBe('B12345678');
			expect(result.data.numserie).toBe('FAC-2024-001');
			expect(result.data.fecha).toBe('15-01-2024');
			expect(result.data.importe).toBe('1250.00');
			expect(result.url).toBe(url);
		}
	});

	it('parses the ValidarQRNoVerifactu variant', () => {
		const url = 'https://www2.agenciatributaria.es/wlpl/TIKE-CONT/ValidarQRNoVerifactu?nif=A87654321&numserie=2024/0042&fecha=01-06-2024&importe=350.00';
		const result = parseQrUrl(url);
		expect(result?.type).toBe('verifactu');
	});

	it('trims whitespace from the raw QR value', () => {
		const url = '  https://www2.agenciatributaria.es/wlpl/TIKE-CONT/ValidarQR?nif=B12345678&numserie=001&fecha=01-01-2024&importe=100.00  ';
		const result = parseQrUrl(url);
		expect(result).not.toBeNull();
		expect(result?.url).toBe(url.trim());
	});

	it('returns null when required params are missing', () => {
		const url = 'https://www2.agenciatributaria.es/wlpl/TIKE-CONT/ValidarQR?nif=B12345678&numserie=FAC-001';
		// missing fecha and importe
		expect(parseQrUrl(url)).toBeNull();
	});

	it('returns null for an unrelated URL', () => {
		expect(parseQrUrl('https://www.example.com/invoice?id=123')).toBeNull();
	});

	it('returns null for a non-URL string', () => {
		expect(parseQrUrl('not a url')).toBeNull();
		expect(parseQrUrl('')).toBeNull();
	});
});

describe('parseQrUrl — TicketBAI', () => {
	it('parses a Bizkaia TicketBAI QR', () => {
		const url = 'https://batuz.eus/QRTBAI/?id=TBAIBI-20240601-B12345678-xxxxxx-001';
		const result = parseQrUrl(url);
		expect(result?.type).toBe('ticketbai');
		if (result?.type === 'ticketbai') {
			expect(result.data.territory).toBe('bizkaia');
			expect(result.data.id).toBe('TBAIBI-20240601-B12345678-xxxxxx-001');
		}
	});

	it('parses a Gipuzkoa TicketBAI QR', () => {
		const url = 'https://tbai.gipuzkoa.eus/qr/?id=TBAIGI-20240601-B12345678-xxxxxx-001';
		const result = parseQrUrl(url);
		expect(result?.type).toBe('ticketbai');
		if (result?.type === 'ticketbai') {
			expect(result.data.territory).toBe('gipuzkoa');
		}
	});

	it('parses an Araba TicketBAI QR', () => {
		const url = 'https://www.araba.eus/tbai/qr?id=TBAIVI-20240601-B12345678-xxxxxx-001';
		const result = parseQrUrl(url);
		expect(result?.type).toBe('ticketbai');
		if (result?.type === 'ticketbai') {
			expect(result.data.territory).toBe('araba');
		}
	});
});

// ── qrFechaToIso / isoToQrFecha ───────────────────────────────────────────────

describe('qrFechaToIso', () => {
	it('converts DD-MM-AAAA to YYYY-MM-DD', () => {
		expect(qrFechaToIso('15-01-2024')).toBe('2024-01-15');
		expect(qrFechaToIso('01-06-2026')).toBe('2026-06-01');
		expect(qrFechaToIso('31-12-2027')).toBe('2027-12-31');
	});

	it('returns null for invalid formats', () => {
		expect(qrFechaToIso('2024-01-15')).toBeNull(); // ISO, not QR format
		expect(qrFechaToIso('15/01/2024')).toBeNull();
		expect(qrFechaToIso('')).toBeNull();
	});
});

describe('isoToQrFecha', () => {
	it('converts YYYY-MM-DD to DD-MM-AAAA', () => {
		expect(isoToQrFecha('2024-01-15')).toBe('15-01-2024');
		expect(isoToQrFecha('2026-06-01')).toBe('01-06-2026');
	});

	it('returns null for invalid formats', () => {
		expect(isoToQrFecha('15-01-2024')).toBeNull();
		expect(isoToQrFecha('')).toBeNull();
	});
});

// ── detectVerifactuMismatch ───────────────────────────────────────────────────

describe('detectVerifactuMismatch', () => {
	const validQr = parseQrUrl(
		'https://www2.agenciatributaria.es/wlpl/TIKE-CONT/ValidarQR?nif=B12345678&numserie=FAC-2024-001&fecha=15-01-2024&importe=1250.00'
	)!;

	it('returns empty array when all fields match', () => {
		const mismatches = detectVerifactuMismatch(validQr, {
			invoice_number: 'FAC-2024-001',
			invoice_date: '2024-01-15',
			total_amount: 1250.00,
		});
		expect(mismatches).toHaveLength(0);
	});

	it('detects invoice number mismatch', () => {
		const mismatches = detectVerifactuMismatch(validQr, {
			invoice_number: 'FAC-2024-999', // wrong
			invoice_date: '2024-01-15',
			total_amount: 1250.00,
		});
		expect(mismatches).toHaveLength(1);
		expect(mismatches[0].field).toBe('numserie');
		expect(mismatches[0].qrValue).toBe('FAC-2024-001');
		expect(mismatches[0].aiValue).toBe('FAC-2024-999');
	});

	it('detects date mismatch (QR DD-MM-AAAA vs AI YYYY-MM-DD)', () => {
		const mismatches = detectVerifactuMismatch(validQr, {
			invoice_number: 'FAC-2024-001',
			invoice_date: '2024-01-16', // one day off
			total_amount: 1250.00,
		});
		expect(mismatches).toHaveLength(1);
		expect(mismatches[0].field).toBe('fecha');
	});

	it('detects amount mismatch beyond 0.005 tolerance', () => {
		const mismatches = detectVerifactuMismatch(validQr, {
			invoice_number: 'FAC-2024-001',
			invoice_date: '2024-01-15',
			total_amount: 1251.00, // different
		});
		expect(mismatches).toHaveLength(1);
		expect(mismatches[0].field).toBe('importe');
	});

	it('does not flag negligible floating-point difference (< 0.005)', () => {
		const mismatches = detectVerifactuMismatch(validQr, {
			invoice_number: 'FAC-2024-001',
			invoice_date: '2024-01-15',
			total_amount: 1250.002, // within tolerance
		});
		expect(mismatches).toHaveLength(0);
	});

	it('ignores whitespace in invoice number comparison', () => {
		const mismatches = detectVerifactuMismatch(validQr, {
			invoice_number: 'FAC -2024-001 ', // same after normalisation
			invoice_date: '2024-01-15',
			total_amount: 1250.00,
		});
		expect(mismatches).toHaveLength(0);
	});

	it('skips fields that are null in AI extraction', () => {
		const mismatches = detectVerifactuMismatch(validQr, {
			invoice_number: null,
			invoice_date: null,
			total_amount: null,
		});
		expect(mismatches).toHaveLength(0);
	});

	it('returns empty array for TicketBAI (no raw fields to compare)', () => {
		const tbaiQr = parseQrUrl('https://batuz.eus/QRTBAI/?id=TBAIBI-001');
		const mismatches = detectVerifactuMismatch(tbaiQr, {
			invoice_number: 'FAC-001',
			invoice_date: '2024-01-15',
			total_amount: 100,
		});
		expect(mismatches).toHaveLength(0);
	});

	it('returns empty array when qrResult is null', () => {
		const mismatches = detectVerifactuMismatch(null, {
			invoice_number: 'FAC-001',
			invoice_date: '2024-01-15',
			total_amount: 100,
		});
		expect(mismatches).toHaveLength(0);
	});
});

// ── buildAeatVerificationUrl ──────────────────────────────────────────────────

describe('buildAeatVerificationUrl', () => {
	it('returns the QR URL for VERI*FACTU results', () => {
		const url = 'https://www2.agenciatributaria.es/wlpl/TIKE-CONT/ValidarQR?nif=B12345678&numserie=001&fecha=01-01-2024&importe=100.00';
		const qr = parseQrUrl(url)!;
		expect(buildAeatVerificationUrl(qr)).toBe(url);
	});

	it('returns null for TicketBAI (no AEAT URL to link to)', () => {
		const qr = parseQrUrl('https://batuz.eus/QRTBAI/?id=TBAIBI-001')!;
		expect(buildAeatVerificationUrl(qr)).toBeNull();
	});

	it('returns null when qrResult is null', () => {
		expect(buildAeatVerificationUrl(null)).toBeNull();
	});
});
