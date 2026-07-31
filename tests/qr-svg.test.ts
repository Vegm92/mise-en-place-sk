/**
 * QR rendering for the WhatsApp click-to-chat link (issue #319).
 *
 * The QR is how the feature actually reaches staff — it gets printed and stuck
 * in the kitchen, so nobody types a phone number into a shared handset. These
 * tests pin the two properties that decide whether that works: the output is a
 * scalable inline SVG (crisp at any print size, no `img-src` CSP allowance),
 * and it encodes exactly the link a scanner should open.
 */
import { describe, it, expect } from 'vitest';
import jsQR from 'jsqr';
import { renderQrSvg } from '../src/lib/server/qr-svg';
import { waMeLink, normalizePhoneNumber } from '../src/lib/phone';

/**
 * Rasterise the generated SVG the way a camera would see it: white page, black
 * modules. Parsing the emitted path (rather than re-asking the encoder) is the
 * point — it proves the markup we actually ship is scannable, not just that the
 * library can encode.
 */
function rasterise(svg: string, scale = 4): { data: Uint8ClampedArray; size: number } {
	const side = Number(/viewBox="0 0 (\d+)/.exec(svg)![1]);
	const size = side * scale;
	const data = new Uint8ClampedArray(size * size * 4).fill(255); // white, opaque

	// Each dark module is a subpath "Mx,yl<w>,0 …" of the single <path>.
	for (const m of svg.matchAll(/M(\d+),(\d+)l(\d+),0/g)) {
		const [x0, y0, cell] = [Number(m[1]), Number(m[2]), Number(m[3])];
		for (let y = y0 * scale; y < (y0 + cell) * scale; y++) {
			for (let x = x0 * scale; x < (x0 + cell) * scale; x++) {
				const i = (y * size + x) * 4;
				data[i] = data[i + 1] = data[i + 2] = 0;
			}
		}
	}
	return { data, size };
}

describe('waMeLink', () => {
	it('builds a digits-only wa.me URL — wa.me rejects a leading "+"', () => {
		expect(waMeLink('34612345678')).toBe('https://wa.me/34612345678');
	});

	it('strips any formatting a caller passes through', () => {
		expect(waMeLink('+34 612 345 678')).toBe('https://wa.me/34612345678');
	});

	it('links to the same canonical form the bot matches senders against', () => {
		const normalized = normalizePhoneNumber('0034 612-345-678');
		expect(normalized.ok).toBe(true);
		// A link that opened a different chat would mean the allow-list is wrong too.
		expect(waMeLink(normalized.ok ? normalized.phone : '')).toBe('https://wa.me/34612345678');
	});
});

describe('renderQrSvg', () => {
	it('returns a scalable inline SVG with no fixed pixel size', () => {
		const svg = renderQrSvg('https://wa.me/34612345678')!;
		expect(svg).toMatch(/^<svg/);
		// scalable: true → viewBox and no width/height attributes, so CSS (and the
		// print stylesheet's 45 mm) decides how big it comes out.
		expect(svg).toContain('viewBox');
		expect(svg).not.toMatch(/<svg[^>]*\swidth="\d/);
	});

	it('renders something a scanner could read — a non-trivial module grid', () => {
		const svg = renderQrSvg('https://wa.me/34612345678')!;
		// Dark modules are subpaths of a single <path>; each starts with "M".
		const modules = (svg.match(/M\d+,\d+l/g) ?? []).length;
		expect(modules).toBeGreaterThan(50);
	});

	it('scans back to the exact link it was given', () => {
		// The end-to-end property that matters: a chef points a camera at the
		// printed card and lands in the right chat. Decoded from the shipped
		// markup, so a change to how the SVG is emitted cannot silently break it.
		const link = 'https://wa.me/34612345678';
		const { data, size } = rasterise(renderQrSvg(link)!);
		expect(jsQR(data, size, size)?.data).toBe(link);
	});

	it('paints an opaque light background so a dark-theme card cannot invert it', () => {
		// An inverted QR is rejected by most scanners, and the settings card is
		// dark in dark mode — the symbol has to carry its own backing.
		expect(renderQrSvg('https://wa.me/34612345678')).toContain('fill="white"');
	});

	it('grows the symbol for longer input rather than truncating it', () => {
		const short = renderQrSvg('https://wa.me/34612345678')!;
		const long = renderQrSvg(`https://wa.me/34612345678?text=${'a'.repeat(300)}`)!;
		const viewBoxOf = (svg: string) => Number(/viewBox="0 0 (\d+)/.exec(svg)![1]);
		expect(viewBoxOf(long)).toBeGreaterThan(viewBoxOf(short));
	});

	it('returns null for empty input instead of an empty symbol', () => {
		expect(renderQrSvg('')).toBeNull();
	});

	it('returns null rather than throwing when the data cannot be encoded', () => {
		// Past the capacity of the largest symbol version — the caller treats the
		// QR as an enhancement and drops it rather than failing the page.
		expect(renderQrSvg('x'.repeat(10_000))).toBeNull();
	});
});
