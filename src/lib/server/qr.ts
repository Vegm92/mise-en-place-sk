/**
 * VERI*FACTU / TicketBAI QR code parsing and field verification.
 *
 * AEAT VERI*FACTU QR URL format (Orden HAC/1177/2024):
 *   https://www2.agenciatributaria.es/wlpl/TIKE-CONT/ValidarQR?nif=X&numserie=Y&fecha=DD-MM-AAAA&importe=N.NN
 *   https://www2.agenciatributaria.es/wlpl/TIKE-CONT/ValidarQRNoVerifactu (same params, non-verified path)
 *
 * TicketBAI (Basque Country) QR formats by territory:
 *   Bizkaia:  https://batuz.eus/QRTBAI/?id=...
 *   Gipuzkoa: https://tbai.gipuzkoa.eus/qr/?id=...
 *   Araba:    https://www.araba.eus/tbai/qr?id=...
 */

export interface AeatVerifactuQrData {
	nif: string;      // Supplier NIF
	numserie: string; // Invoice number / series+number
	fecha: string;    // Issue date in DD-MM-AAAA format
	importe: string;  // Total amount (decimal, e.g. "1250.00")
}

export interface TicketBaiQrData {
	territory: 'bizkaia' | 'gipuzkoa' | 'araba';
	id: string;
}

export type QrParseResult =
	| { type: 'verifactu'; data: AeatVerifactuQrData; url: string }
	| { type: 'ticketbai'; data: TicketBaiQrData; url: string }
	| null;

export interface QrFieldMismatch {
	field: 'numserie' | 'fecha' | 'importe' | 'nif';
	qrValue: string;
	aiValue: string | null;
}

const AEAT_QR_HOSTS = new Set(['www2.agenciatributaria.es']);
const AEAT_QR_PATHS = new Set([
	'/wlpl/TIKE-CONT/ValidarQR',
	'/wlpl/TIKE-CONT/ValidarQRNoVerifactu',
]);

const TICKETBAI_HOSTS: Array<{ host: string; territory: TicketBaiQrData['territory'] }> = [
	{ host: 'batuz.eus', territory: 'bizkaia' },
	{ host: 'tbai.gipuzkoa.eus', territory: 'gipuzkoa' },
	{ host: 'www.araba.eus', territory: 'araba' },
];

/**
 * Parses a decoded QR string from an invoice into structured data.
 * Returns null if the URL is not a recognised Spanish e-invoice verification URL.
 */
export function parseQrUrl(rawUrl: string): QrParseResult {
	let url: URL;
	try {
		url = new URL(rawUrl.trim());
	} catch {
		return null;
	}

	if (AEAT_QR_HOSTS.has(url.hostname) && AEAT_QR_PATHS.has(url.pathname)) {
		const nif = url.searchParams.get('nif');
		const numserie = url.searchParams.get('numserie');
		const fecha = url.searchParams.get('fecha');
		const importe = url.searchParams.get('importe');
		if (!nif || !numserie || !fecha || !importe) return null;
		return { type: 'verifactu', data: { nif, numserie, fecha, importe }, url: rawUrl.trim() };
	}

	for (const { host, territory } of TICKETBAI_HOSTS) {
		if (url.hostname === host) {
			const id = url.searchParams.get('id') ?? '';
			return { type: 'ticketbai', data: { territory, id }, url: rawUrl.trim() };
		}
	}

	return null;
}

/**
 * Converts AEAT QR fecha (DD-MM-AAAA) to ISO date (YYYY-MM-DD).
 * Returns null if the format is not recognised.
 */
export function qrFechaToIso(fecha: string): string | null {
	const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(fecha);
	if (!match) return null;
	const [, dd, mm, yyyy] = match;
	return `${yyyy}-${mm}-${dd}`;
}

/**
 * Converts ISO date (YYYY-MM-DD) to AEAT QR fecha (DD-MM-AAAA).
 */
export function isoToQrFecha(iso: string): string | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
	if (!match) return null;
	const [, yyyy, mm, dd] = match;
	return `${dd}-${mm}-${yyyy}`;
}

/**
 * Detects mismatches between VERI*FACTU QR-verified fields and AI-extracted fields.
 * Only checks VERI*FACTU QR results — TicketBAI encodes an opaque ID, not raw fields.
 */
export function detectVerifactuMismatch(
	qrResult: QrParseResult,
	ai: {
		invoice_number?: string | null;
		invoice_date?: string | null;   // YYYY-MM-DD
		total_amount?: number | null;
	},
): QrFieldMismatch[] {
	if (!qrResult || qrResult.type !== 'verifactu') return [];

	const { numserie, fecha, importe } = qrResult.data;
	const mismatches: QrFieldMismatch[] = [];

	if (ai.invoice_number !== null && ai.invoice_number !== undefined) {
		const normQr = numserie.replace(/\s+/g, '').toLowerCase();
		const normAi = ai.invoice_number.replace(/\s+/g, '').toLowerCase();
		if (normQr !== normAi) {
			mismatches.push({ field: 'numserie', qrValue: numserie, aiValue: ai.invoice_number });
		}
	}

	const isoFecha = qrFechaToIso(fecha);
	if (isoFecha && ai.invoice_date !== null && ai.invoice_date !== undefined) {
		if (isoFecha !== ai.invoice_date) {
			mismatches.push({ field: 'fecha', qrValue: fecha, aiValue: ai.invoice_date });
		}
	}

	if (ai.total_amount !== null && ai.total_amount !== undefined) {
		const qrAmount = parseFloat(importe.replace(',', '.'));
		if (!isNaN(qrAmount) && Math.abs(qrAmount - ai.total_amount) > 0.005) {
			mismatches.push({ field: 'importe', qrValue: importe, aiValue: String(ai.total_amount) });
		}
	}

	return mismatches;
}

/**
 * Returns the AEAT verification URL from a parsed QR result.
 * This is the "Verificar en AEAT" deep link shown on the invoice detail page.
 */
export function buildAeatVerificationUrl(qrResult: QrParseResult): string | null {
	if (!qrResult || qrResult.type !== 'verifactu') return null;
	return qrResult.url;
}
