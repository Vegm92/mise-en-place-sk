/**
 * Generates PWA icon PNGs (and the favicon PNGs + ICO) using only Node.js
 * built-ins (zlib + Buffer). Design: the same descending-shoulder m monogram
 * used in-app (`src/lib/components/mep/Logo.svelte`) and in transactional
 * email (`src/lib/server/email.ts`'s LOGO_SVG), on the ink/parchment brand
 * pair (ADR-033, amending ADR-028/ADR-032's artwork) — ink background
 * (#1B2A44, matches manifest.webmanifest's theme_color), paper mark (#ECEDF1,
 * matches its background_color).
 * These constants are asserted against the manifest by
 * tests/logo-usage-consistency.test.ts — change both together.
 * Run: node scripts/generate-pwa-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ── PNG encoder ─────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[i] = c;
	}
	return t;
})();

function crc32(buf) {
	let crc = 0xffffffff;
	for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
	const t = Buffer.from(type, 'ascii');
	const d = Buffer.isBuffer(data) ? data : Buffer.from(data);
	const crcBuf = Buffer.alloc(4);
	crcBuf.writeUInt32BE(crc32(Buffer.concat([t, d])), 0);
	const lenBuf = Buffer.alloc(4);
	lenBuf.writeUInt32BE(d.length, 0);
	return Buffer.concat([lenBuf, t, d, crcBuf]);
}

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function encodePng(width, height, pixels) {
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // color type: RGBA
	ihdr[10] = ihdr[11] = ihdr[12] = 0;

	const rawRows = [];
	for (let y = 0; y < height; y++) {
		const row = Buffer.alloc(1 + width * 4);
		row[0] = 0; // filter: None
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4;
			row[1 + x * 4] = pixels[i];
			row[2 + x * 4] = pixels[i + 1];
			row[3 + x * 4] = pixels[i + 2];
			row[4 + x * 4] = pixels[i + 3];
		}
		rawRows.push(row);
	}

	return Buffer.concat([
		PNG_SIG,
		pngChunk('IHDR', ihdr),
		pngChunk('IDAT', deflateSync(Buffer.concat(rawRows))),
		pngChunk('IEND', Buffer.alloc(0)),
	]);
}

// ── Drawing helpers ──────────────────────────────────────────────────────────

function createCanvas(w, h, bgR, bgG, bgB) {
	const px = new Uint8ClampedArray(w * h * 4);
	for (let i = 0; i < w * h; i++) {
		px[i * 4] = bgR;
		px[i * 4 + 1] = bgG;
		px[i * 4 + 2] = bgB;
		px[i * 4 + 3] = 255;
	}

	function setPixel(x, y, r, g, b, a = 255) {
		x = Math.round(x); y = Math.round(y);
		if (x < 0 || x >= w || y < 0 || y >= h) return;
		const i = (y * w + x) * 4;
		const fa = a / 255;
		px[i]     = Math.round(r * fa + px[i]     * (1 - fa));
		px[i + 1] = Math.round(g * fa + px[i + 1] * (1 - fa));
		px[i + 2] = Math.round(b * fa + px[i + 2] * (1 - fa));
		px[i + 3] = 255;
	}

	function fillRect(x, y, rw, rh, r, g, b) {
		x = Math.round(x); y = Math.round(y);
		rw = Math.round(rw); rh = Math.round(rh);
		for (let py = y; py < y + rh; py++) {
			for (let px2 = x; px2 < x + rw; px2++) {
				setPixel(px2, py, r, g, b);
			}
		}
	}

	return { px, w, h, setPixel, fillRect };
}

// ── Icon design ──────────────────────────────────────────────────────────────
// Brand colours — must match manifest.webmanifest's theme_color / background_color
// (asserted by tests/logo-usage-consistency.test.ts).
const BG_HEX = '#1B2A44'; // ink — manifest.webmanifest theme_color
const FG_HEX = '#ECEDF1'; // paper — manifest.webmanifest background_color

/** The channels the canvas actually paints, derived from the hex above. These
 *  used to be hand-written literals alongside it, so ADR-032's recolour landed
 *  in BG_HEX/FG_HEX — which is all logo-usage-consistency.test.ts reads — while
 *  the icons kept drawing the old ink. Deriving them removes the second copy. */
function channels(hex) {
	const n = parseInt(hex.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const [BG_R, BG_G, BG_B] = channels(BG_HEX);
const [FG_R, FG_G, FG_B] = channels(FG_HEX);

/**
 * The m-monogram mark shared with `src/lib/components/mep/Logo.svelte` and
 * `src/lib/server/email.ts`'s LOGO_SVG, expressed in the same 24-unit space
 * those use (viewBox="0 0 24 24"): a round-capped 2.6-unit stroke drawing a
 * lowercase m whose second shoulder sits lower than the first (SVG path
 * "M4.4 18.5 V9.5 Q4.4 5.5 8.2 5.5 Q12 5.5 12 9.5 V18.5
 *  M12 13 Q12 9.5 15.8 9.5 Q19.6 9.5 19.6 13 V18.5").
 */
const MARK_UNIT = 24;
const STROKE_W = 2.6;
/** The two subpaths as segment lists: M = move, L = line, Q = quadratic bezier. */
const MARK_SUBPATHS = [
	[
		['M', 4.4, 18.5],
		['L', 4.4, 9.5],
		['Q', 4.4, 5.5, 8.2, 5.5],
		['Q', 12, 5.5, 12, 9.5],
		['L', 12, 18.5],
	],
	[
		['M', 12, 13],
		['Q', 12, 9.5, 15.8, 9.5],
		['Q', 19.6, 9.5, 19.6, 13],
		['L', 19.6, 18.5],
	],
];

/** Flattens one subpath into densely sampled points (24-unit space). */
function samplePath(subpath, samplesPerSeg = 96) {
	const pts = [];
	let cur = null;
	for (const seg of subpath) {
		if (seg[0] === 'M') {
			cur = [seg[1], seg[2]];
			pts.push(cur);
		} else if (seg[0] === 'L') {
			const [x1, y1] = cur;
			const [, x2, y2] = seg;
			for (let i = 1; i <= samplesPerSeg; i++) {
				const t = i / samplesPerSeg;
				pts.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]);
			}
			cur = [x2, y2];
		} else {
			const [x0, y0] = cur;
			const [, cx, cy, x2, y2] = seg;
			for (let i = 1; i <= samplesPerSeg; i++) {
				const t = i / samplesPerSeg;
				const u = 1 - t;
				pts.push([u * u * x0 + 2 * u * t * cx + t * t * x2, u * u * y0 + 2 * u * t * cy + t * t * y2]);
			}
			cur = [x2, y2];
		}
	}
	return pts;
}

/** Fills a solid disc — stamping discs along the sampled path renders the
 *  round-capped, round-joined stroke exactly. */
function stampDisc(cv, cx, cy, r, R, G, B) {
	const y0 = Math.max(0, Math.ceil(cy - r));
	const y1 = Math.min(cv.h - 1, Math.floor(cy + r));
	for (let y = y0; y <= y1; y++) {
		const dy = y - cy;
		const half = Math.sqrt(Math.max(0, r * r - dy * dy));
		const x0 = Math.max(0, Math.ceil(cx - half));
		const x1 = Math.min(cv.w - 1, Math.floor(cx + half));
		for (let x = x0; x <= x1; x++) cv.setPixel(x, y, R, G, B);
	}
}

/** Box-downsamples an ss×-supersampled canvas — the stroke's anti-aliasing. */
function downsample(cv, ss) {
	const w = cv.w / ss;
	const h = cv.h / ss;
	const out = new Uint8ClampedArray(w * h * 4);
	const n = ss * ss;
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			let r = 0, g = 0, b = 0;
			for (let sy = 0; sy < ss; sy++) {
				for (let sx = 0; sx < ss; sx++) {
					const i = ((y * ss + sy) * cv.w + (x * ss + sx)) * 4;
					r += cv.px[i];
					g += cv.px[i + 1];
					b += cv.px[i + 2];
				}
			}
			const o = (y * w + x) * 4;
			out[o] = r / n;
			out[o + 1] = g / n;
			out[o + 2] = b / n;
			out[o + 3] = 255;
		}
	}
	return out;
}

const SUPERSAMPLE = 4;

/** Draws the mark on a flat ink square; `inset` shrinks it toward the centre
 *  (0 = full 24-unit layout, 0.7 = maskable safe zone). */
function drawMark(size, scale) {
	const ss = SUPERSAMPLE;
	const cv = createCanvas(size * ss, size * ss, BG_R, BG_G, BG_B);
	const offset = (1 - scale) / 2;
	const map = (v) => size * ss * (offset + (v / MARK_UNIT) * scale);
	const r = ((STROKE_W / 2 / MARK_UNIT) * scale * size) * ss;
	for (const subpath of MARK_SUBPATHS) {
		for (const [px2, py] of samplePath(subpath)) {
			stampDisc(cv, map(px2), map(py), r, FG_R, FG_G, FG_B);
		}
	}
	return encodePng(size, size, downsample(cv, ss));
}

function drawIcon(size) {
	return drawMark(size, 1);
}

/** Maskable variant: mark pulled into an 80% safe zone, same relative layout. */
function drawMaskable(size) {
	return drawMark(size, 0.7);
}

// ── ICO encoder (PNG-in-ICO, Vista+; every modern consumer supports it) ──────

function encodeIco(pngsBySize) {
	const count = pngsBySize.length;
	const dir = Buffer.alloc(6 + 16 * count);
	dir.writeUInt16LE(0, 0); // reserved
	dir.writeUInt16LE(1, 2); // type: icon
	dir.writeUInt16LE(count, 4);

	let offset = dir.length;
	const chunks = [dir];
	pngsBySize.forEach(({ size, png }, i) => {
		const entry = 6 + 16 * i;
		dir.writeUInt8(size >= 256 ? 0 : size, entry + 0); // width (0 = 256)
		dir.writeUInt8(size >= 256 ? 0 : size, entry + 1); // height (0 = 256)
		dir.writeUInt8(0, entry + 2); // color count
		dir.writeUInt8(0, entry + 3); // reserved
		dir.writeUInt16LE(1, entry + 4); // planes
		dir.writeUInt16LE(32, entry + 6); // bit count
		dir.writeUInt32LE(png.length, entry + 8); // bytes in resource
		dir.writeUInt32LE(offset, entry + 12); // offset
		chunks.push(png);
		offset += png.length;
	});
	return Buffer.concat(chunks);
}

// ── Generate all sizes ───────────────────────────────────────────────────────

const ICON_DIR = resolve(ROOT, 'static/icons');
mkdirSync(ICON_DIR, { recursive: true });

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
for (const sz of sizes) {
	writeFileSync(resolve(ICON_DIR, `icon-${sz}x${sz}.png`), drawIcon(sz));
	console.log(`  ✓ icon-${sz}x${sz}.png`);
}

writeFileSync(resolve(ROOT, 'static/apple-touch-icon.png'), drawIcon(180));
console.log('  ✓ apple-touch-icon.png');

writeFileSync(resolve(ICON_DIR, 'icon-maskable-512x512.png'), drawMaskable(512));
console.log('  ✓ icon-maskable-512x512.png');

const favicon32 = drawIcon(32);
const favicon16 = drawIcon(16);
writeFileSync(resolve(ROOT, 'static/favicon-32x32.png'), favicon32);
console.log('  ✓ favicon-32x32.png');
writeFileSync(resolve(ROOT, 'static/favicon-16x16.png'), favicon16);
console.log('  ✓ favicon-16x16.png');

writeFileSync(
	resolve(ROOT, 'static/favicon.ico'),
	encodeIco([
		{ size: 16, png: favicon16 },
		{ size: 32, png: favicon32 },
		{ size: 48, png: drawIcon(48) },
	]),
);
console.log('  ✓ favicon.ico');

console.log(`\nAll PWA icons + favicons generated successfully (${BG_HEX} on ${FG_HEX}).`);
