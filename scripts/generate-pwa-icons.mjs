/**
 * Generates PWA icon PNGs (and the favicon PNGs + ICO) using only Node.js
 * built-ins (zlib + Buffer). Design: the same three-bar mark used in-app
 * (`src/lib/components/mep/Logo.svelte`) and in transactional email
 * (`src/lib/server/email.ts`'s LOGO_SVG), on the ink/parchment brand pair
 * (ADR-028) — ink background (#17171A, matches manifest.webmanifest's
 * theme_color), parchment bars (#F1F0EE, matches its background_color).
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
const BG_HEX = '#17171A'; // ink — manifest.webmanifest theme_color
const FG_HEX = '#F1F0EE'; // parchment — manifest.webmanifest background_color
const BG_R = 0x17, BG_G = 0x17, BG_B = 0x1a;
const FG_R = 0xf1, FG_G = 0xf0, FG_B = 0xee;

/**
 * The three-bar mark shared with `src/lib/components/mep/Logo.svelte` and
 * `src/lib/server/email.ts`'s LOGO_SVG, expressed in the same 24-unit space
 * those use (viewBox="0 0 24 24"): three vertical bars, all starting at
 * y=3.5, of decreasing height (17/13/9), left to right.
 */
const BAR_UNIT = 24;
const BARS = [
	{ x: 2.5, h: 17 },
	{ x: 10.5, h: 13 },
	{ x: 18.5, h: 9 },
];
const BAR_W = 3;
const BAR_Y = 3.5;

/** Draws the mark on a flat ink square, bars filling their 24-unit-space position scaled to `size`. */
function drawIcon(size) {
	const cv = createCanvas(size, size, BG_R, BG_G, BG_B);
	const s = size / BAR_UNIT;
	for (const bar of BARS) {
		cv.fillRect(bar.x * s, BAR_Y * s, BAR_W * s, bar.h * s, FG_R, FG_G, FG_B);
	}
	return encodePng(size, size, cv.px);
}

/** Maskable variant: bars pulled into an 80% safe zone, same relative layout. */
function drawMaskable(size) {
	const cv = createCanvas(size, size, BG_R, BG_G, BG_B);
	const scale = 0.7;
	const offset = (1 - scale) / 2;
	const map = (v) => size * (offset + (v / BAR_UNIT) * scale);
	for (const bar of BARS) {
		const x0 = map(bar.x);
		const y0 = map(BAR_Y);
		const w0 = (BAR_W / BAR_UNIT) * scale * size;
		const h0 = (bar.h / BAR_UNIT) * scale * size;
		cv.fillRect(x0, y0, w0, h0, FG_R, FG_G, FG_B);
	}
	return encodePng(size, size, cv.px);
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
