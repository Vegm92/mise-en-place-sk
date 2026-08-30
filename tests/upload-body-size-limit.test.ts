/**
 * Mobile uploads died at the request body limit, not in the app.
 *
 * `@sveltejs/adapter-node` caps request bodies at `BODY_SIZE_LIMIT`, which
 * defaults to 512K. Nothing in the repo or the deployment set it, so every
 * upload larger than half a megabyte — i.e. every photo taken on a phone —
 * was killed with a 413 before `+page.server.ts`'s `upload` action ran, while
 * the product advertised (and the client validated) a 20 MB per-file ceiling.
 *
 * Two things made the failure invisible rather than merely annoying:
 *
 *  1. `UploadPanel.uploadWithProgress` read `JSON.parse(...).data.error` off
 *     the form-action response. SvelteKit devalue-encodes `data` as a *string*,
 *     so `.error` was always `undefined` and every server-side rejection —
 *     quota, rate limit, bad file, this 413 — showed the user nothing at all.
 *  2. When the abort raced the upload the request was severed mid-flight and
 *     the browser reported a bare network error instead.
 *
 * These tests pin the two halves of the fix: the deployed limit stays above
 * what the client is willing to send, and the client can actually read an
 * action failure back out of the wire format.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { get } from 'svelte/store';
import { locale, t, ti } from '../src/lib/i18n';
import {
	MAX_UPLOAD_BYTES,
	MAX_UPLOAD_TOTAL_BYTES,
	totalUploadBytes,
	exceedsUploadTotal,
} from '../src/lib/upload-formats';

const DOCKERFILE = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
const UPLOAD_PANEL = readFileSync(
	new URL('../src/lib/components/UploadPanel.svelte', import.meta.url),
	'utf8',
);
const UPLOAD_ACTION = readFileSync(
	new URL('../src/routes/(app)/+page.server.ts', import.meta.url),
	'utf8',
);

/** `BODY_SIZE_LIMIT` accepts a plain byte count or a K/M/G suffix. */
function parseAsBytes(value: string): number {
	const multiplier = { K: 1024, M: 1024 ** 2, G: 1024 ** 3 }[value.at(-1) ?? ''] ?? 1;
	return Number(multiplier === 1 ? value : value.slice(0, -1)) * multiplier;
}

describe('BODY_SIZE_LIMIT is set high enough for the uploads the app accepts', () => {
	const declared = DOCKERFILE.match(/^ENV BODY_SIZE_LIMIT=(\S+)$/m);

	it('is set explicitly in the image — the adapter default of 512K rejects any phone photo', () => {
		expect(declared, 'Dockerfile no longer sets BODY_SIZE_LIMIT').not.toBeNull();
		expect(parseAsBytes(declared![1])).toBeGreaterThan(512 * 1024);
	});

	it('leaves room for a full client-side queue plus multipart overhead', () => {
		expect(parseAsBytes(declared![1])).toBeGreaterThan(MAX_UPLOAD_TOTAL_BYTES);
	});

	it('admits at least one file of the advertised maximum size', () => {
		expect(MAX_UPLOAD_TOTAL_BYTES).toBeGreaterThanOrEqual(MAX_UPLOAD_BYTES);
	});
});

describe('client-side total-size ceiling', () => {
	const file = (size: number) => ({ size });

	it('sums the queue rather than checking files one at a time', () => {
		expect(totalUploadBytes([file(10), file(32), file(8)])).toBe(50);
	});

	it('passes a queue that fits', () => {
		expect(exceedsUploadTotal([file(MAX_UPLOAD_TOTAL_BYTES)])).toBe(false);
	});

	it('rejects a queue of individually-legal files that together overrun the body limit', () => {
		const eightMbPhoto = file(8 * 1024 * 1024);
		const queue = new Array(16).fill(eightMbPhoto); // 128 MB, every file under the 20 MB cap
		expect(queue.every((f) => f.size <= MAX_UPLOAD_BYTES)).toBe(true);
		expect(exceedsUploadTotal(queue)).toBe(true);
	});

	it('is enforced in doUpload before the request is sent', () => {
		const doUpload = UPLOAD_PANEL.slice(UPLOAD_PANEL.indexOf('async function doUpload()'));
		const guardIdx = doUpload.indexOf('exceedsUploadTotal(files)');
		const sendIdx = doUpload.indexOf('uploadWithProgress(fd)');
		expect(guardIdx, 'doUpload no longer checks the queue total').toBeGreaterThan(-1);
		expect(guardIdx).toBeLessThan(sendIdx);
	});
});

describe('form-action failures reach the user', () => {
	it('decodes the response with deserialize, not a raw JSON.parse of data.error', () => {
		expect(UPLOAD_PANEL).toContain("import { deserialize } from '$app/forms'");
		expect(
			UPLOAD_PANEL,
			'reading .error off the raw JSON silently swallows every server-side rejection',
		).not.toContain('JSON.parse(xhr.responseText)');
	});

	// `deserialize` itself needs the initialised client app for its transport
	// decoders, so it cannot be driven under plain vitest — these assertions pin
	// the wire contract it exists to handle, and that the component calls it.
	it('reads a devalue-encoded `data` string, which is what SvelteKit actually sends', () => {
		// The exact shape SvelteKit writes for fail(413, { error, errorVars }).
		const wire = JSON.stringify({
			type: 'failure',
			status: 413,
			data: '[{"error":1,"errorVars":2},"upload.err.totalTooLarge",{"mb":3},60]',
		});
		const parsed = JSON.parse(wire) as { data: unknown };
		expect(
			typeof parsed.data,
			'`data` is devalue-encoded — treating it as an object is what hid every failure',
		).toBe('string');
	});

	it('interpolates the limit into the message the failure carries', () => {
		locale.set('es');
		expect(get(ti)('upload.err.totalTooLarge', { mb: 60 })).toContain('60 MB');
		locale.set('en');
		expect(get(ti)('upload.err.totalTooLarge', { mb: 60 })).toContain('60 MB');
	});

	it('a plain JSON.parse of that same response yields no error — the original bug', () => {
		const wire = JSON.stringify({
			type: 'failure',
			status: 413,
			data: '[{"error":1},"upload.err.totalTooLarge"]',
		});
		const parsed = JSON.parse(wire) as { data?: { error?: string } };
		expect(parsed.data?.error).toBeUndefined();
	});
});

describe('the 413 is reported as an oversized upload, not a parse failure', () => {
	it('maps the adapter 413 to its own message key', () => {
		expect(UPLOAD_ACTION).toContain("(err as { status?: number }).status === 413");
		expect(UPLOAD_ACTION).toContain("error: 'upload.err.totalTooLarge'");
	});

	it('has both message keys translated in both locales', () => {
		for (const l of ['es', 'en'] as const) {
			locale.set(l);
			for (const key of ['upload.err.totalTooLarge', 'upload.err.serverError']) {
				expect(get(t)(key), `${key} missing for ${l}`).not.toBe(key);
			}
		}
	});
});
