/**
 * QR code rendering (issue #319).
 *
 * Distinct from `qr.ts`, which *parses* the VERI*FACTU / TicketBAI QR codes
 * found on supplier invoices. This module goes the other way: it renders a
 * string we want a phone to scan.
 *
 * Output is an inline `<svg>` element rather than a data-URI image, so it stays
 * crisp when printed — the practical delivery mechanism for the WhatsApp bot
 * number is a sheet of paper stuck to the kitchen wall — and needs no `img-src`
 * allowance in the CSP.
 */
import qrcode from 'qrcode-generator';

/**
 * 'M' (~15% recovery) is the usual choice for a printed code: enough tolerance
 * for a scuffed or greasy print without inflating the module count, which is
 * what actually decides how large the paper version has to be.
 */
const ERROR_CORRECTION = 'M';

/**
 * Render `text` as a scalable inline SVG QR code.
 *
 * The SVG carries a viewBox and no fixed width/height, so the caller sizes it
 * with CSS. Returns null if the string cannot be encoded (too long for the
 * largest symbol) — callers treat the QR as an enhancement and drop it rather
 * than failing the page around it.
 */
export function renderQrSvg(text: string): string | null {
	if (!text) return null;
	try {
		// Type 0 = pick the smallest symbol version that fits the data.
		const qr = qrcode(0, ERROR_CORRECTION);
		qr.addData(text);
		qr.make();
		return qr.createSvgTag({ scalable: true, margin: 1 });
	} catch (err) {
		console.error('[qr-svg] failed to render QR code:', err);
		return null;
	}
}
