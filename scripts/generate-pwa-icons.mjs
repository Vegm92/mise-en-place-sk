/**
 * Generates PWA icon PNGs using only Node.js built-ins (zlib + Buffer).
 * Design: deep-green background, cream "M" letterform for Mise en Place.
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

	function fillCircle(cx, cy, r, fr, fg, fb) {
		for (let y = Math.ceil(cy - r); y <= Math.floor(cy + r); y++) {
			for (let x = Math.ceil(cx - r); x <= Math.floor(cx + r); x++) {
				const dx = x - cx, dy = y - cy;
				// Anti-alias edge via distance
				const dist = Math.sqrt(dx * dx + dy * dy);
				if (dist <= r - 1) {
					setPixel(x, y, fr, fg, fb);
				} else if (dist <= r) {
					const alpha = Math.round((r - dist) * 255);
					setPixel(x, y, fr, fg, fb, alpha);
				}
			}
		}
	}

	// Fill horizontal span [x1, x2) on row y
	function fillSpan(y, x1, x2, r, g, b) {
		for (let x = Math.ceil(x1); x < Math.floor(x2); x++) setPixel(x, y, r, g, b);
	}

	return { px, w, h, setPixel, fillRect, fillCircle, fillSpan };
}

// ── Icon design ──────────────────────────────────────────────────────────────
// Brand colours
const BG_R = 0x1c, BG_G = 0x3b, BG_B = 0x2a; // #1C3B2A deep forest green
const FG_R = 0xf0, FG_G = 0xe6, FG_B = 0xd3; // #F0E6D3 warm parchment cream

/**
 * Draws a "Mise en Place" M letterform on a green circular badge.
 * The M occupies ~60% of the icon area, centred.
 *
 * Letterform proportions (unit = icon size):
 *   left vertical:  x in [0.20, 0.32], y in [0.25, 0.75]
 *   right vertical: x in [0.68, 0.80], y in [0.25, 0.75]
 *   left arm:       diagonal from (0.32, 0.25) → (0.50, 0.55), strokeW 0.12
 *   right arm:      diagonal from (0.50, 0.55) → (0.68, 0.25), strokeW 0.12
 */
function drawIcon(size) {
	const cv = createCanvas(size, size, BG_R, BG_G, BG_B);
	const s = size;

	// Inner circle (slightly lighter green)
	cv.fillCircle(s * 0.5, s * 0.5, s * 0.44, 0x27, 0x52, 0x3b);

	// Proportional coordinates
	const top    = s * 0.25;
	const bottom = s * 0.75;
	const lx0    = s * 0.20; // left outer edge
	const lx1    = s * 0.32; // left inner edge
	const rx0    = s * 0.68; // right inner edge
	const vx     = s * 0.50; // valley x centre
	const vy     = s * 0.57; // valley y

	const strokeW = lx1 - lx0; // ≈ 0.12 s

	// Left vertical stroke
	cv.fillRect(lx0, top, strokeW, bottom - top, FG_R, FG_G, FG_B);

	// Right vertical stroke
	cv.fillRect(rx0, top, strokeW, bottom - top, FG_R, FG_G, FG_B);

	// Left arm: diagonal from (lx1, top) → (vx, vy), constant-width stroke
	{
		const x1s = lx1, y1s = top, x2s = vx, y2s = vy;
		const armH = y2s - y1s;
		for (let dy = 0; dy <= armH; dy++) {
			const t = dy / armH;
			const cx = x1s + t * (x2s - x1s);
			const py = y1s + dy;
			cv.fillSpan(py, cx, cx + strokeW, FG_R, FG_G, FG_B);
		}
	}

	// Right arm: diagonal from (vx - strokeW, vy) → (rx0 - strokeW, top)
	{
		const x1s = vx - strokeW, y1s = vy, x2s = rx0 - strokeW, y2s = top;
		const armH = y1s - y2s;
		for (let dy = 0; dy <= armH; dy++) {
			const t = dy / armH;
			const cx = x1s + t * (x2s - x1s);
			const py = y1s - dy;
			cv.fillSpan(py, cx, cx + strokeW, FG_R, FG_G, FG_B);
		}
	}

	return encodePng(size, size, cv.px);
}

// ── Generate all sizes ───────────────────────────────────────────────────────

const ICON_DIR = resolve(ROOT, 'static/icons');
mkdirSync(ICON_DIR, { recursive: true });

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
for (const sz of sizes) {
	writeFileSync(resolve(ICON_DIR, `icon-${sz}x${sz}.png`), drawIcon(sz));
	console.log(`  ✓ icon-${sz}x${sz}.png`);
}

// apple-touch-icon
writeFileSync(resolve(ROOT, 'static/apple-touch-icon.png'), drawIcon(180));
console.log('  ✓ apple-touch-icon.png');

// maskable icon (slightly different safe-zone crop — same design, larger circle)
function drawMaskable(size) {
	const cv = createCanvas(size, size, BG_R, BG_G, BG_B);
	const s = size;
	// For maskable, fill the entire square with the inner-green (no outer ring clipped off)
	cv.fillRect(0, 0, s, s, 0x27, 0x52, 0x3b);

	// Pull the M inward 20% (safe zone is 80% of icon)
	const scale = 0.7; // letter takes up 70% of the icon
	const offset = (1 - scale) / 2;
	const top    = s * (0.25 * scale + offset);
	const bottom = s * (0.75 * scale + offset);
	const lx0    = s * (0.20 * scale + offset);
	const lx1    = s * (0.32 * scale + offset);
	const rx0    = s * (0.68 * scale + offset);
	const vx     = s * (0.50 * scale + offset);
	const vy     = s * (0.57 * scale + offset);
	const strokeW = lx1 - lx0;

	cv.fillRect(lx0, top, strokeW, bottom - top, FG_R, FG_G, FG_B);
	cv.fillRect(rx0, top, strokeW, bottom - top, FG_R, FG_G, FG_B);

	{
		const x1s = lx1, y1s = top, x2s = vx, y2s = vy;
		const armH = y2s - y1s;
		for (let dy = 0; dy <= armH; dy++) {
			const t = dy / armH;
			const cx = x1s + t * (x2s - x1s);
			cv.fillSpan(y1s + dy, cx, cx + strokeW, FG_R, FG_G, FG_B);
		}
	}
	{
		const x1s = vx - strokeW, y1s = vy, x2s = rx0 - strokeW, y2s = top;
		const armH = y1s - y2s;
		for (let dy = 0; dy <= armH; dy++) {
			const t = dy / armH;
			const cx = x1s + t * (x2s - x1s);
			cv.fillSpan(y1s - dy, cx, cx + strokeW, FG_R, FG_G, FG_B);
		}
	}

	return encodePng(size, size, cv.px);
}

writeFileSync(resolve(ICON_DIR, 'icon-maskable-512x512.png'), drawMaskable(512));
console.log('  ✓ icon-maskable-512x512.png');

console.log('\nAll PWA icons generated successfully.');
